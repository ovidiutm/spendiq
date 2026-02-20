# SpendIQ

<p align="center">
  Turn one bank statement into an interactive dashboard for fast transaction review, filtering, categorization, and savings tracking.
</p>

<p align="center">
  <a href="https://ovidiutm.github.io/spendiq"><img alt="Live Demo" src="https://img.shields.io/badge/Live-GitHub%20Pages-2563eb?style=for-the-badge"></a>
  <a href="https://github.com/ovidiutm/spendiq/commits/main"><img alt="Last Commit" src="https://img.shields.io/github/last-commit/ovidiutm/spendiq?style=for-the-badge"></a>
</p>

## Table of Contents
- [Overview](#overview)
- [Live Demo](#live-demo)
- [Why SpendIQ](#why-spendiq)
- [Main Features](#main-features)
- [Tech Stack](#tech-stack)
- [Quick Start (Docker)](#quick-start-docker)
- [Run Without Docker](#run-without-docker)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Persistence Behavior](#persistence-behavior)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

## Overview
SpendIQ is a statement-to-dashboard app focused on speed and control:
- Import one bank statement PDF.
- Parse transactions and account statement details.
- Categorize automatically, then refine with overrides.
- Explore everything in a responsive dashboard.

Current parser status:
- Built and validated primarily with ING samples.
- Intended to work with major bank statement formats.
- Continuously adapted as new statement formats are tested.

## Live Demo
The app is currently running online as a demo:
- Frontend: `https://ovidiutm.github.io/spendiq`
- Backend API: Render-hosted service (configured for the demo)

If you want to replicate the same hosting setup, see:
- `DEPLOYMENT.md`

## Why SpendIQ
- Fast review loop: import -> parse -> categorize -> analyze.
- Practical controls: category management + override modes.
- Savings logic by configurable IBAN accounts (not hardcoded).
- Two usage modes:
  - Anonymous mode (local browser persistence).
  - User account mode (PostgreSQL persistence per user).
- Bilingual UI: Romanian / English.

## Main Features
- Statement parsing endpoint: `POST /api/parse/statement`
- Categorization endpoint: `POST /api/categorize`
- Category management: add / rename / delete
- Category override strategies:
  - Merchant + Type
  - Single transaction
- Interactive dashboard:
  - Categories pie chart + legend interactions
  - Top Merchants bar chart
  - Balance Overview (Income / Expenses / Savings)
  - Transactions table with full sorting + filtering
- Savings accounts:
  - Add multiple IBANs
  - Savings in / out / net calculations and summaries
- CSV export for filtered transaction data

## Tech Stack
- Frontend: React + TypeScript + Vite + ECharts
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL
- Auth: cookie-based session auth
- Infra: Docker Compose

## Quick Start (Docker)
From project root:

```bash
docker compose up --build
```

Services:
- Frontend: `http://localhost:5173/spendiq/`
- Backend health: `http://localhost:8000/health`
- PostgreSQL: `localhost:5432`
- pgAdmin: `http://localhost:5050`
  - email: `admin@local.dev`
  - password: `admin`

## Run Without Docker
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

## Environment Variables
| Variable | Required | Example | Scope |
|---|---|---|---|
| `VITE_API_BASE` | Yes (for hosted frontend) | `https://your-backend-url` | Frontend API base |
| `DATABASE_URL` | Yes | `postgresql+psycopg://expenses:expenses@db:5432/spendiq` | Backend DB connection |
| `CORS_ALLOW_ORIGINS` | Yes (production) | `https://ovidiutm.github.io` | Backend CORS |
| `COOKIE_SECURE` | Yes (production) | `true` | Backend session cookie |
| `COOKIE_SAMESITE` | Yes (cross-site) | `none` | Backend session cookie |

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

Parsing and categorization:
- `POST /api/parse/statement`
- `POST /api/categorize`

## Persistence Behavior
Anonymous mode:
- Categories, overrides, settings in browser storage
- Dashboard cache scoped to anonymous context

User account mode:
- Categories, overrides, settings stored per user in PostgreSQL
- Dashboard cache scoped to logged-in account context

## Troubleshooting
- API calls fail on hosted frontend:
  - Verify `VITE_API_BASE` and backend CORS/cookie settings.
- Login works locally but fails on hosted frontend:
  - Check `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` on backend.
- Routes broken under `/spendiq/...`:
  - Keep Vite base path set to `/spendiq/`.

## Roadmap
- [ ] Broader parser validation on additional bank statement layouts
- [ ] Optional parser profile detection per bank format
- [ ] Extended analytics cards and reporting views
- [ ] Improved test coverage (frontend + backend)
- [ ] Better import diagnostics for unsupported statements

## Contributing
Small focused PRs are preferred.
- Create branch from `development`
- Keep changes scoped and tested
- Open PR to `development`