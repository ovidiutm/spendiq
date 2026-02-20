import io
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import pdfplumber
from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from passlib.context import CryptContext
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db import get_db, init_db
from .models import User, UserCategory, UserOverride, UserSession, UserSetting
from .parser import (
    categorize_transactions,
    extract_statement_details_pdf,
    extract_statement_details_text,
    looks_like_ing_statement_pdf,
    looks_like_ing_statement_text,
    parse_ing_statement_pdf,
    parse_ing_statement_text,
)


app = FastAPI(title="Expenses Helper API", version="0.2.0")

# Dev-friendly CORS. Keep allow_credentials=True for cookie auth.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
SESSION_COOKIE_NAME = "expenses_helper_session"
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "30"))
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"

DEFAULT_CATEGORIES = [
    "Groceries",
    "Restaurants",
    "Transport",
    "Transport/Fuel",
    "Utilities",
    "Internet/Phone",
    "Shopping",
    "Home/DIY",
    "Subscriptions",
    "Entertainment",
    "Bills",
    "Fees",
    "Taxes/Fees",
    "Loans",
    "Savings",
    "Transfers",
    "Other",
]


@app.on_event("startup")
def on_startup() -> None:
    init_db()


class CategorizeRequest(BaseModel):
    transactions: List[dict]
    merchant_overrides: Optional[Dict[str, str]] = None
    savings_accounts: Optional[List[str]] = None


class AuthRequest(BaseModel):
    identifier: Optional[str] = Field(default=None, min_length=2, max_length=320)
    email: Optional[str] = Field(default=None, min_length=2, max_length=320)
    password: str = Field(min_length=8, max_length=128)


class CategoriesRequest(BaseModel):
    categories: List[str]


class OverridesRequest(BaseModel):
    overrides: Dict[str, str]


class SettingsRequest(BaseModel):
    settings: Dict[str, str]

class IdentifierAvailability(BaseModel):
    available: bool


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def normalize_identifier(identifier: str) -> str:
    return identifier.strip().lower()


def extract_identifier(payload: AuthRequest) -> str:
    raw = payload.identifier or payload.email or ""
    value = normalize_identifier(raw)
    if not value:
        raise HTTPException(status_code=422, detail="Identifier is required.")
    return value


def make_session(db: Session, user_id: int) -> UserSession:
    token = secrets.token_urlsafe(48)
    session = UserSession(
        user_id=user_id,
        token=token,
        expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def sanitize_categories(raw_categories: List[str]) -> List[str]:
    cleaned = []
    seen = set()
    for c in raw_categories:
        name = str(c).strip()
        if not name:
            continue
        if name == "Dining":
            name = "Restaurants"
        if name in seen:
            continue
        seen.add(name)
        cleaned.append(name)
    if "Other" not in seen:
        cleaned.append("Other")
    return cleaned


def read_session_user(db: Session, session_token: Optional[str]) -> Optional[User]:
    if not session_token:
        return None
    session = db.scalar(select(UserSession).where(UserSession.token == session_token))
    if not session:
        return None
    now = datetime.now(timezone.utc)
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now:
        db.delete(session)
        db.commit()
        return None
    return db.get(User, session.user_id)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/auth/register")
def register(payload: AuthRequest, response: Response, db: Session = Depends(get_db)):
    identifier = extract_identifier(payload)
    if db.scalar(select(User).where(User.email == identifier)):
        raise HTTPException(status_code=409, detail="Identifier already registered.")

    user = User(email=identifier, password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    categories = sanitize_categories(DEFAULT_CATEGORIES)
    db.add_all([UserCategory(user_id=user.id, name=name) for name in categories])
    db.commit()

    session = make_session(db, user.id)
    set_session_cookie(response, session.token)
    return {"authenticated": True, "email": user.email}


@app.get("/auth/identifier-availability", response_model=IdentifierAvailability)
def identifier_availability(identifier: str, db: Session = Depends(get_db)):
    value = normalize_identifier(identifier or "")
    if not value:
        raise HTTPException(status_code=422, detail="Identifier is required.")
    exists = db.scalar(select(User).where(User.email == value)) is not None
    return {"available": not exists}


@app.post("/auth/login")
def login(payload: AuthRequest, response: Response, db: Session = Depends(get_db)):
    identifier = extract_identifier(payload)
    user = db.scalar(select(User).where(User.email == identifier))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email/username or password.")

    session = make_session(db, user.id)
    set_session_cookie(response, session.token)
    return {"authenticated": True, "email": user.email}


@app.post("/auth/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    if expenses_helper_session:
        db.execute(delete(UserSession).where(UserSession.token == expenses_helper_session))
        db.commit()
    clear_session_cookie(response)
    return {"authenticated": False}


@app.get("/auth/me")
def me(
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        return {"authenticated": False}
    return {"authenticated": True, "email": user.email}


@app.get("/api/me/categories")
def get_my_categories(
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    rows = db.scalars(select(UserCategory).where(UserCategory.user_id == user.id)).all()
    names = [r.name for r in rows]
    if not names:
        names = sanitize_categories(DEFAULT_CATEGORIES)
        db.add_all([UserCategory(user_id=user.id, name=name) for name in names])
        db.commit()
    return {"categories": names}


@app.put("/api/me/categories")
def put_my_categories(
    payload: CategoriesRequest,
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    categories = sanitize_categories(payload.categories)
    db.execute(delete(UserCategory).where(UserCategory.user_id == user.id))
    db.add_all([UserCategory(user_id=user.id, name=name) for name in categories])
    db.commit()
    return {"categories": categories}


@app.get("/api/me/overrides")
def get_my_overrides(
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    rows = db.scalars(select(UserOverride).where(UserOverride.user_id == user.id)).all()
    overrides = {f"{r.merchant}||{r.tx_type}": r.category for r in rows}
    return {"overrides": overrides}


@app.put("/api/me/overrides")
def put_my_overrides(
    payload: OverridesRequest,
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    db.execute(delete(UserOverride).where(UserOverride.user_id == user.id))
    rows = []
    for key, category in payload.overrides.items():
        merchant, sep, tx_type = str(key).partition("||")
        if sep != "||":
            continue
        merchant = merchant.strip()
        tx_type = tx_type.strip()
        if not merchant or not tx_type:
            continue
        rows.append(
            UserOverride(
                user_id=user.id,
                merchant=merchant,
                tx_type=tx_type,
                category=str(category).strip() or "Other",
            )
        )
    if rows:
        db.add_all(rows)
    db.commit()
    return {"overrides": payload.overrides}


@app.post("/api/me/reset-data")
def reset_my_data(
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    db.execute(delete(UserOverride).where(UserOverride.user_id == user.id))
    db.execute(delete(UserCategory).where(UserCategory.user_id == user.id))
    db.execute(delete(UserSetting).where(UserSetting.user_id == user.id))
    categories = sanitize_categories(DEFAULT_CATEGORIES)
    db.add_all([UserCategory(user_id=user.id, name=name) for name in categories])
    db.commit()
    return {"ok": True, "categories": categories}


@app.get("/api/me/settings")
def get_my_settings(
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    rows = db.scalars(select(UserSetting).where(UserSetting.user_id == user.id)).all()
    settings = {r.key: r.value for r in rows}
    return {"settings": settings}


@app.put("/api/me/settings")
def put_my_settings(
    payload: SettingsRequest,
    db: Session = Depends(get_db),
    expenses_helper_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
):
    user = read_session_user(db, expenses_helper_session)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")

    db.execute(delete(UserSetting).where(UserSetting.user_id == user.id))
    rows = []
    for key, value in payload.settings.items():
        key_clean = str(key).strip()
        if not key_clean:
            continue
        rows.append(
            UserSetting(
                user_id=user.id,
                key=key_clean,
                value=str(value),
            )
        )
    if rows:
        db.add_all(rows)
    db.commit()
    return {"settings": payload.settings}


async def _parse_statement_impl(file: UploadFile) -> dict:
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Please upload a PDF file.")

    data = await file.read()
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        extracted_text: Optional[str] = None
        if not looks_like_ing_statement_pdf(pdf):
            extracted_text = "\n".join((page.extract_text() or "") for page in pdf.pages)
            if not looks_like_ing_statement_text(extracted_text):
                raise HTTPException(status_code=400, detail="Uploaded PDF is not a bank account statement.")

        statement_details = extract_statement_details_pdf(pdf)
        txs = parse_ing_statement_pdf(pdf)
        if not txs:
            extracted_text = extracted_text if extracted_text is not None else "\n".join((page.extract_text() or "") for page in pdf.pages)
            txs = parse_ing_statement_text(extracted_text)
            statement_details = extract_statement_details_text(extracted_text)

        if not txs:
            raise HTTPException(status_code=400, detail="Uploaded PDF is not a bank account statement.")
    return {
        "bank": "Auto-Detected",
        "transactions": txs,
        "count": len(txs),
        "statement_details": statement_details,
    }


@app.post("/api/parse/statement")
async def parse_statement(file: UploadFile = File(...)):
    """
    Parse a bank statement PDF (text-based where possible) and return normalized transactions.
    The current parser was built and validated primarily on ING statement layouts and is being
    iteratively adapted for broader bank format compatibility.
    """
    return await _parse_statement_impl(file)


@app.post("/api/categorize")
def categorize(req: CategorizeRequest):
    txs = categorize_transactions(
        req.transactions,
        req.merchant_overrides or {},
        req.savings_accounts or [],
    )
    return {"transactions": txs}


@app.post("/api/ai/categorize")
def ai_categorize_stub():
    """
    Placeholder: in hybrid mode, we will call a cloud model ONLY for unknown merchants
    (and only if you enable it). For now, keep it stubbed.
    """
    return {"enabled": False, "note": "AI categorizer not wired yet (stub)."}
