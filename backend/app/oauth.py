import base64
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional
from urllib.parse import urlencode, urlparse

import httpx
import jwt
from fastapi import APIRouter, Cookie, Depends, Form, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User, UserCategory, UserOAuthIdentity, UserSession

router = APIRouter(prefix='/auth/oauth', tags=['oauth'])

pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')
SESSION_COOKIE_NAME = 'expenses_helper_session'
SESSION_TTL_DAYS = int(os.getenv('SESSION_TTL_DAYS', '30'))
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
COOKIE_SAMESITE = os.getenv('COOKIE_SAMESITE', 'lax').lower()
if COOKIE_SAMESITE not in {'lax', 'strict', 'none'}:
    COOKIE_SAMESITE = 'lax'

OAUTH_STATE_COOKIE = 'spendiq_oauth_state'
OAUTH_ALLOWED_RETURN_ORIGINS = [s.strip() for s in os.getenv('OAUTH_ALLOWED_RETURN_ORIGINS', '').split(',') if s.strip()]
FRONTEND_BASE_URL = (os.getenv('FRONTEND_BASE_URL', 'http://localhost:5173')).rstrip('/')
if FRONTEND_BASE_URL and FRONTEND_BASE_URL not in OAUTH_ALLOWED_RETURN_ORIGINS:
    OAUTH_ALLOWED_RETURN_ORIGINS.append(FRONTEND_BASE_URL)

DEFAULT_CATEGORIES = [
    'Groceries','Restaurants','Transport','Transport/Fuel','Utilities','Internet/Phone','Shopping',
    'Home/DIY','Subscriptions','Entertainment','Bills','Fees','Taxes/Fees','Loans','Savings','Transfers','Other'
]


def _hash_random_password() -> str:
    return pwd_context.hash(secrets.token_urlsafe(32))


def _sanitize_categories(raw_categories: list[str]) -> list[str]:
    out: list[str] = []
    seen = set()
    for c in raw_categories:
        name = str(c).strip()
        if not name:
            continue
        if name == 'Dining':
            name = 'Restaurants'
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    if 'Other' not in seen:
        out.append('Other')
    return out


def _make_session(db: Session, user_id: int) -> UserSession:
    token = secrets.token_urlsafe(48)
    row = UserSession(user_id=user_id, token=token, expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def _set_session_cookie(response: RedirectResponse, token: str) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=SESSION_TTL_DAYS * 24 * 60 * 60,
        path='/',
    )


def _set_oauth_state_cookie(response: RedirectResponse, payload: dict[str, Any]) -> None:
    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=base64.urlsafe_b64encode(json.dumps(payload).encode('utf-8')).decode('ascii'),
        httponly=True,
        secure=COOKIE_SECURE,
        samesite='lax',
        max_age=10 * 60,
        path='/',
    )


def _clear_oauth_state_cookie(response: RedirectResponse) -> None:
    response.delete_cookie(key=OAUTH_STATE_COOKIE, path='/')


def _read_oauth_state_cookie(raw: Optional[str]) -> Optional[dict[str, Any]]:
    if not raw:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(raw.encode('ascii')).decode('utf-8'))
    except Exception:
        return None


def _safe_frontend_return_url(candidate: Optional[str]) -> str:
    fallback = f'{FRONTEND_BASE_URL}/account/login'
    if not candidate:
        return fallback
    try:
        parsed = urlparse(candidate)
        origin = f'{parsed.scheme}://{parsed.netloc}'
        if origin not in OAUTH_ALLOWED_RETURN_ORIGINS:
            return fallback
        return candidate
    except Exception:
        return fallback


def _frontend_redirect(url: str, status: str, code: str, provider: str) -> RedirectResponse:
    sep = '&' if '?' in url else '?'
    target = f'{url}{sep}oauth_status={status}&oauth_code={code}&oauth_provider={provider}'
    return RedirectResponse(target, status_code=302)


def _oauth_callback_url(provider: str) -> str:
    public_base = os.getenv('PUBLIC_BACKEND_URL', '').rstrip('/') or os.getenv('RENDER_EXTERNAL_URL', '').rstrip('/') or 'http://localhost:8000'
    return f'{public_base}/auth/oauth/{provider}/callback'


def _provider_cfg(provider: str) -> dict[str, Any]:
    provider = provider.lower()
    common = {
        'google': {
            'client_id': os.getenv('OAUTH_GOOGLE_CLIENT_ID', ''),
            'client_secret': os.getenv('OAUTH_GOOGLE_CLIENT_SECRET', ''),
            'authorize_url': 'https://accounts.google.com/o/oauth2/v2/auth',
            'token_url': 'https://oauth2.googleapis.com/token',
            'userinfo_url': 'https://openidconnect.googleapis.com/v1/userinfo',
            'scope': 'openid email profile',
        },
        'facebook': {
            'client_id': os.getenv('OAUTH_FACEBOOK_CLIENT_ID', ''),
            'client_secret': os.getenv('OAUTH_FACEBOOK_CLIENT_SECRET', ''),
            'authorize_url': 'https://www.facebook.com/v20.0/dialog/oauth',
            'token_url': 'https://graph.facebook.com/v20.0/oauth/access_token',
            'userinfo_url': 'https://graph.facebook.com/me?fields=id,name,email',
            'scope': 'email,public_profile',
        },
        'apple': {
            'client_id': os.getenv('OAUTH_APPLE_CLIENT_ID', ''),
            'team_id': os.getenv('OAUTH_APPLE_TEAM_ID', ''),
            'key_id': os.getenv('OAUTH_APPLE_KEY_ID', ''),
            'private_key': os.getenv('OAUTH_APPLE_PRIVATE_KEY', ''),
            'authorize_url': 'https://appleid.apple.com/auth/authorize',
            'token_url': 'https://appleid.apple.com/auth/token',
            'scope': 'name email',
        },
    }
    cfg = common.get(provider)
    if not cfg:
        raise HTTPException(status_code=404, detail='OAuth provider not supported.')
    cfg = dict(cfg)
    cfg['provider'] = provider
    cfg['callback_url'] = _oauth_callback_url(provider)
    return cfg


def _provider_enabled(cfg: dict[str, Any]) -> bool:
    p = cfg['provider']
    if p in {'google', 'facebook'}:
        return bool(cfg.get('client_id') and cfg.get('client_secret'))
    if p == 'apple':
        return bool(cfg.get('client_id') and cfg.get('team_id') and cfg.get('key_id') and cfg.get('private_key'))
    return False


def _apple_client_secret(cfg: dict[str, Any]) -> str:
    now = int(datetime.now(timezone.utc).timestamp())
    pk = str(cfg['private_key']).replace('\\n', '\n')
    return jwt.encode(
        {
            'iss': cfg['team_id'],
            'iat': now,
            'exp': now + 60 * 60 * 24 * 180,
            'aud': 'https://appleid.apple.com',
            'sub': cfg['client_id'],
        },
        pk,
        algorithm='ES256',
        headers={'kid': cfg['key_id']},
    )


def _upsert_user_from_oauth(db: Session, provider: str, provider_user_id: str, email: str) -> User:
    identity = db.scalar(select(UserOAuthIdentity).where(
        UserOAuthIdentity.provider == provider,
        UserOAuthIdentity.provider_user_id == provider_user_id,
    ))
    if identity:
        user = db.get(User, identity.user_id)
        if user and email and user.email != email:
            identity.provider_email = email
            db.commit()
        if user:
            return user

    normalized_email = (email or '').strip().lower()
    user = db.scalar(select(User).where(User.email == normalized_email)) if normalized_email else None
    if not user:
        if not normalized_email:
            normalized_email = f'{provider}_{provider_user_id}@oauth.local'
        user = User(email=normalized_email, password_hash=_hash_random_password())
        db.add(user)
        db.commit()
        db.refresh(user)
        cats = _sanitize_categories(DEFAULT_CATEGORIES)
        db.add_all([UserCategory(user_id=user.id, name=name) for name in cats])
        db.commit()

    existing_identity = db.scalar(select(UserOAuthIdentity).where(
        UserOAuthIdentity.user_id == user.id,
        UserOAuthIdentity.provider == provider,
    ))
    if existing_identity:
        existing_identity.provider_user_id = provider_user_id
        existing_identity.provider_email = normalized_email
    else:
        db.add(UserOAuthIdentity(
            user_id=user.id,
            provider=provider,
            provider_user_id=provider_user_id,
            provider_email=normalized_email,
        ))
    db.commit()
    return user


async def _google_fetch_identity(code: str, cfg: dict[str, Any]) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(cfg['token_url'], data={
            'code': code,
            'client_id': cfg['client_id'],
            'client_secret': cfg['client_secret'],
            'redirect_uri': cfg['callback_url'],
            'grant_type': 'authorization_code',
        })
        token_res.raise_for_status()
        token = token_res.json()
        access_token = token.get('access_token')
        userinfo_res = await client.get(cfg['userinfo_url'], headers={'Authorization': f'Bearer {access_token}'})
        userinfo_res.raise_for_status()
        data = userinfo_res.json()
        sub = str(data.get('sub') or '')
        email = str(data.get('email') or '')
        if not sub:
            raise HTTPException(status_code=400, detail='Google account id missing.')
        return sub, email


async def _facebook_fetch_identity(code: str, cfg: dict[str, Any]) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.get(cfg['token_url'], params={
            'client_id': cfg['client_id'],
            'client_secret': cfg['client_secret'],
            'redirect_uri': cfg['callback_url'],
            'code': code,
        })
        token_res.raise_for_status()
        token = token_res.json()
        access_token = token.get('access_token')
        me_res = await client.get(cfg['userinfo_url'], params={'access_token': access_token})
        me_res.raise_for_status()
        data = me_res.json()
        user_id = str(data.get('id') or '')
        email = str(data.get('email') or '')
        if not user_id:
            raise HTTPException(status_code=400, detail='Facebook account id missing.')
        return user_id, email


async def _apple_fetch_identity(code: str, cfg: dict[str, Any]) -> tuple[str, str]:
    client_secret = _apple_client_secret(cfg)
    async with httpx.AsyncClient(timeout=20) as client:
        token_res = await client.post(cfg['token_url'], data={
            'client_id': cfg['client_id'],
            'client_secret': client_secret,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': cfg['callback_url'],
        })
        token_res.raise_for_status()
        token = token_res.json()
        id_token = token.get('id_token')
        if not id_token:
            raise HTTPException(status_code=400, detail='Apple id_token missing.')
        jwk_client = jwt.PyJWKClient('https://appleid.apple.com/auth/keys')
        signing_key = jwk_client.get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=['RS256'],
            audience=cfg['client_id'],
            issuer='https://appleid.apple.com',
        )
        user_id = str(claims.get('sub') or '')
        email = str(claims.get('email') or '')
        if not user_id:
            raise HTTPException(status_code=400, detail='Apple account id missing.')
        return user_id, email


@router.get('/providers')
def oauth_providers_status():
    out = {}
    for provider in ('google', 'facebook', 'apple'):
        cfg = _provider_cfg(provider)
        out[provider] = {'enabled': _provider_enabled(cfg)}
    return {'providers': out}


@router.get('/{provider}/start')
def oauth_start(provider: str, return_to: Optional[str] = Query(default=None)):
    cfg = _provider_cfg(provider)
    if not _provider_enabled(cfg):
        raise HTTPException(status_code=503, detail=f'{provider.title()} login is not configured.')
    state = secrets.token_urlsafe(24)
    safe_return_to = _safe_frontend_return_url(return_to)
    if provider == 'apple':
        params = {
            'response_type': 'code',
            'response_mode': 'query',
            'client_id': cfg['client_id'],
            'redirect_uri': cfg['callback_url'],
            'scope': cfg['scope'],
            'state': state,
        }
    else:
        params = {
            'response_type': 'code',
            'client_id': cfg['client_id'],
            'redirect_uri': cfg['callback_url'],
            'scope': cfg['scope'],
            'state': state,
        }
    auth_url = f"{cfg['authorize_url']}?{urlencode(params)}"
    resp = RedirectResponse(auth_url, status_code=302)
    _set_oauth_state_cookie(resp, {'state': state, 'provider': provider, 'return_to': safe_return_to, 'created_at': datetime.now(timezone.utc).isoformat()})
    return resp


async def _oauth_callback_impl(provider: str, code: Optional[str], state: Optional[str], error: Optional[str], oauth_state_cookie: Optional[str], db: Session):
    cfg = _provider_cfg(provider)
    state_payload = _read_oauth_state_cookie(oauth_state_cookie)
    safe_return_to = _safe_frontend_return_url((state_payload or {}).get('return_to'))
    if error:
        resp = _frontend_redirect(safe_return_to, 'error', 'provider_denied', provider)
        _clear_oauth_state_cookie(resp)
        return resp
    if not state_payload or state_payload.get('provider') != provider or not state or state_payload.get('state') != state:
        resp = _frontend_redirect(safe_return_to, 'error', 'invalid_state', provider)
        _clear_oauth_state_cookie(resp)
        return resp
    if not code:
        resp = _frontend_redirect(safe_return_to, 'error', 'missing_code', provider)
        _clear_oauth_state_cookie(resp)
        return resp

    try:
        if provider == 'google':
            provider_user_id, email = await _google_fetch_identity(code, cfg)
        elif provider == 'facebook':
            provider_user_id, email = await _facebook_fetch_identity(code, cfg)
        elif provider == 'apple':
            provider_user_id, email = await _apple_fetch_identity(code, cfg)
        else:
            raise HTTPException(status_code=404, detail='OAuth provider not supported.')

        user = _upsert_user_from_oauth(db, provider, provider_user_id, email)
        session = _make_session(db, user.id)
        resp = _frontend_redirect(safe_return_to, 'success', 'login_success', provider)
        _set_session_cookie(resp, session.token)
        _clear_oauth_state_cookie(resp)
        return resp
    except HTTPException as e:
        resp = _frontend_redirect(safe_return_to, 'error', 'oauth_failed', provider)
        _clear_oauth_state_cookie(resp)
        return resp
    except Exception:
        resp = _frontend_redirect(safe_return_to, 'error', 'oauth_failed', provider)
        _clear_oauth_state_cookie(resp)
        return resp


@router.get('/{provider}/callback')
async def oauth_callback_get(
    provider: str,
    request: Request,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    oauth_state_cookie: Optional[str] = Cookie(default=None, alias=OAUTH_STATE_COOKIE),
    db: Session = Depends(get_db),
):
    return await _oauth_callback_impl(provider, code, state, error, oauth_state_cookie, db)


@router.post('/{provider}/callback')
async def oauth_callback_post(
    provider: str,
    request: Request,
    code: Optional[str] = Form(default=None),
    state: Optional[str] = Form(default=None),
    error: Optional[str] = Form(default=None),
    oauth_state_cookie: Optional[str] = Cookie(default=None, alias=OAUTH_STATE_COOKIE),
    db: Session = Depends(get_db),
):
    return await _oauth_callback_impl(provider, code, state, error, oauth_state_cookie, db)
