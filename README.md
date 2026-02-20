# SpendIQ

<p align="center">
  Turn one bank statement into an interactive dashboard for fast transaction review, filtering, categorization, and savings tracking.
</p>

<p align="center">
  <a href="https://ovidiutm.github.io/spendiq"><img alt="Live Demo" src="https://img.shields.io/badge/Live-GitHub%20Pages-2563eb?style=for-the-badge"></a>
  <a href="https://github.com/ovidiutm/spendiq/actions/workflows/deploy-pages.yml"><img alt="Pages Deploy" src="https://img.shields.io/github/actions/workflow/status/ovidiutm/spendiq/deploy-pages.yml?branch=main&style=for-the-badge"></a>
  <a href="https://github.com/ovidiutm/spendiq/commits/main"><img alt="Last Commit" src="https://img.shields.io/github/last-commit/ovidiutm/spendiq?style=for-the-badge"></a>
</p>

## Table of Contents
- [Overview](#overview)
- [Why SpendIQ](#why-spendiq)
- [Main Features](#main-features)
- [Tech Stack](#tech-stack)
- [Quick Start (Docker)](#quick-start-docker)
- [Run Without Docker](#run-without-docker)
- [GitHub Pages Frontend Deploy](#github-pages-frontend-deploy)
- [Render Backend Deploy](#render-backend-deploy)
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

## GitHub Pages Frontend Deploy
Project site:
- `https://ovidiutm.github.io/spendiq`

Already configured:
- Vite base path: `/spendiq/` (`frontend/vite.config.ts`)
- GitHub Actions workflow: `.github/workflows/deploy-pages.yml`

Required GitHub settings:
1. Repo `Settings` -> `Pages` -> `Source`: `GitHub Actions`
2. Repo `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`
   - `VITE_API_BASE=https://<your-backend-public-url>`

## Render Backend Deploy
This repo includes a Render Blueprint:
- `render.yaml`

Recommended flow:
1. Render -> `New` -> `Blueprint`
2. Select repo `ovidiutm/spendiq`
3. Confirm services:
   - `spendiq-db` (PostgreSQL)
   - `spendiq-backend` (Docker)
4. Deploy
5. Put backend URL into GitHub variable:
   - `VITE_API_BASE=https://<your-render-backend-url>`

For GitHub Pages + cookie auth:
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none`
- `CORS_ALLOW_ORIGINS=https://ovidiutm.github.io`

## Environment Variables
| Variable | Required | Example | Scope |
|---|---|---|---|
| `VITE_API_BASE` | Yes (for hosted frontend) | `https://spendiq-backend.onrender.com` | Frontend build/runtime API base |
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
- Frontend shows README instead of app on Pages:
  - Verify Pages source is `GitHub Actions` and workflow succeeded.
- Login works locally but fails on Pages:
  - Check backend CORS + cookie settings (`COOKIE_SAMESITE=none`, `COOKIE_SECURE=true`).
- API calls fail on hosted frontend:
  - Verify `VITE_API_BASE` GitHub Actions variable.
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

---
If you want, I can also add a visual section with screenshots/GIFs (`docs/images`) and wire it directly into this README.