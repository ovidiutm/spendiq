# Expenses Helper API (Backend)

## Run locally
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
source .venv/bin/activate
pip install -r requirements.txt
# Example DATABASE_URL:
# postgresql+psycopg://expenses:expenses@localhost:5432/expenses_helper
uvicorn app.main:app --reload
```

Health:
- http://localhost:8000/health

Parse bank statement:
- POST `http://localhost:8000/api/parse/statement` (multipart form-data: `file`)
- Legacy alias: POST `http://localhost:8000/api/parse/ing` (deprecated)

Note:
- Current parsing logic was built primarily using ING statement samples and is continuously adapted for broader bank format compatibility.

Auth:
- POST `/auth/register`
- POST `/auth/login`
- POST `/auth/logout`
- GET `/auth/me`

Per-user data:
- GET/PUT `/api/me/categories`
- GET/PUT `/api/me/overrides`
- POST `/api/me/reset-data`
