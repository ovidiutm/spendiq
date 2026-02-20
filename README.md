# Expenses Helper (V1.1)

V1.1 scope:
- Upload ING statement PDF (text-based)
- Extract normalized transactions
- Auto-categorize (rules)
- Interactive dashboard (charts + table + filters)
- Anonymous mode with local category overrides + categories (localStorage)
- Signed-in mode with per-user category overrides + categories (PostgreSQL)
- Export current filtered view to CSV
- Cookie-session authentication (register/login/logout)

## Run (Docker)
```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000/health
- PostgreSQL: localhost:5432

## Run (no Docker)
### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# example:
# export DATABASE_URL=postgresql+psycopg://expenses:expenses@localhost:5432/expenses_helper
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Notes
- Anonymous mode remains available and keeps all changes local in browser storage.
- Signed-in mode persists categories and merchant/type overrides per user account.
- Merchant overrides are matched by exact `Merchant + Type` key.
- Hybrid mode AI endpoint is still a stub.
