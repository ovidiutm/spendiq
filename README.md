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

## GitHub Pages (Project Site)

This repo is configured to publish the frontend to:
- `https://ovidiutm.github.io/spendiq`

What is already configured:
- Vite build base is set to `/spendiq/` in `frontend/vite.config.ts`.
- GitHub Actions workflow publishes `frontend/dist` to Pages:
  - `.github/workflows/deploy-pages.yml`

Required GitHub settings:
1. Repo `Settings` -> `Pages` -> `Source`: `GitHub Actions`.
2. Repo `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`:
   - Add `VITE_API_BASE` (your deployed backend URL, e.g. `https://api.your-domain.com`).

Backend CORS requirement for Pages:
- Set backend env `CORS_ALLOW_ORIGINS` to include your Pages origin:
  - `https://ovidiutm.github.io`
- Multiple origins are supported via comma-separated list.

## Backend Deploy (Render)

Recommended quick path:
- Use Render with PostgreSQL + Docker web service.
- This repo includes `render.yaml` for Blueprint deploy.

Steps:
1. In Render: `New` -> `Blueprint`.
2. Select repo `ovidiutm/spendiq`.
3. Confirm services from `render.yaml`:
   - `spendiq-db` (PostgreSQL)
   - `spendiq-backend` (Docker from `backend/Dockerfile`)
4. Deploy.
5. After deploy, copy backend public URL (example: `https://spendiq-backend.onrender.com`).
6. In GitHub repo variables, set:
   - `VITE_API_BASE=https://<your-render-backend-url>`
7. Trigger frontend Pages deploy (push to `main` or run workflow manually).

Important for auth/session from GitHub Pages:
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none`
- `CORS_ALLOW_ORIGINS=https://ovidiutm.github.io`

## Run without Docker

### Backend

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
pip install -r requirements.txt
set DATABASE_URL=postgresql+psycopg://expenses:expenses@localhost:5432/spendiq
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
