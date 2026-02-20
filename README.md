# SpendIQ

SpendIQ is a statement-to-dashboard app focused on fast transaction review and categorization.

Current scope:
- Import one bank statement PDF (parser currently tuned primarily on ING samples, with ongoing adaptation for other formats).
- Parse transactions and statement details.
- Auto-categorize transactions with override support.
- Explore data in an interactive dashboard (categories, top merchants, balance overview, transactions table).
- Work in two modes:
  - Anonymous mode: local browser persistence.
  - User account mode: per-user persistence in PostgreSQL (cookie session auth).

## Main Features

- PDF import + parsing (`/api/parse/statement`).
- Category management (add/rename/delete).
- Category override strategies:
  - Merchant + Type.
  - Single transaction.
- Savings accounts configurable by IBAN (used in savings calculations and views).
- Balance Overview chart (Income / Expenses / Savings) with transaction-table drilldown.
- Transactions table:
  - Sorting on all columns.
  - Real-time filtering (including full transaction details text).
  - CSV export of current filtered rows.
- Bilingual UI (Romanian / English).

## Tech Stack

- Frontend: React + TypeScript + Vite + ECharts
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL
- Auth: cookie-based session auth
- Infra: Docker Compose

## Run with Docker (recommended)

From project root:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173`
- Backend health: `http://localhost:8000/health`
- PostgreSQL: `localhost:5432`
- pgAdmin: `http://localhost:5050`
  - email: `admin@local.dev`
  - password: `admin`

## Run without Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg://expenses:expenses@localhost:5432/expenses_helper
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## API Overview

Auth:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/identifier-availability`

User data:
- `GET/PUT /api/me/categories`
- `GET/PUT /api/me/overrides`
- `GET/PUT /api/me/settings`
- `POST /api/me/reset-data`

Parsing/categorization:
- `POST /api/parse/statement`
- `POST /api/categorize`

## Persistence Behavior

- Anonymous mode:
  - Categories, overrides, settings in browser storage.
  - Dashboard cache scoped to anonymous context.
- User mode:
  - Categories, overrides, settings stored per account in PostgreSQL.
  - Dashboard cache scoped to logged-in account context.

## Notes

- Parser behavior is bank-statement oriented and continuously adapted as new statement formats are validated.
- AI categorization endpoint exists as stub (`/api/ai/categorize`).
