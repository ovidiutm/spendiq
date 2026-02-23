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
- Multilingual UI: Romanian / English / French / Italian / German.

## Main Features
- Statement parsing endpoint: `POST /api/parse/statement`
- Categorization endpoint: `POST /api/categorize`
- Cookie consent controls (necessary / preferences / performance) with explicit accept/reject/customize flow
- Authentication and account modes:
  - Anonymous mode (local browser persistence)
  - User account mode (cookie session + PostgreSQL persistence)
  - Email registration with 6-digit verification PIN
  - Social login (Google / Facebook / Apple) implemented and controlled by frontend feature flags
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
- CSV export for filtered transaction data (Save As dialog when browser supports File System Access API, fallback download otherwise)

## Tech Stack
- Frontend: React + TypeScript + Vite + ECharts
- Backend: FastAPI + SQLAlchemy
- Database: PostgreSQL
- Auth: cookie-based session auth (username or email)
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

### Core
| Variable | Required | Example | Scope |
|---|---|---|---|
| `VITE_API_BASE` | Yes (for hosted frontend) | `https://your-backend-url` | Frontend API base |
| `DATABASE_URL` | Yes | `postgresql+psycopg://expenses:expenses@db:5432/spendiq` | Backend DB connection |
| `CORS_ALLOW_ORIGINS` | Yes (production) | `https://ovidiutm.github.io` | Backend CORS |
| `COOKIE_SECURE` | Yes (production) | `true` | Backend session cookie |
| `COOKIE_SAMESITE` | Yes (cross-site) | `none` | Backend session cookie |
| `SESSION_TTL_DAYS` | No | `30` | Backend session lifetime |

### OAuth / Social Login (optional)
| Variable | Required | Example | Scope |
|---|---|---|---|
| `PUBLIC_BACKEND_URL` | Yes (OAuth in production) | `https://your-backend.onrender.com` | Backend callback URL generation |
| `FRONTEND_BASE_URL` | Yes (OAuth) | `https://ovidiutm.github.io/spendiq` | OAuth return URL fallback |
| `OAUTH_ALLOWED_RETURN_ORIGINS` | Yes (OAuth production) | `https://ovidiutm.github.io` | Allowed frontend origins for OAuth return |
| `OAUTH_GOOGLE_CLIENT_ID` | Optional | `...` | Google OAuth |
| `OAUTH_GOOGLE_CLIENT_SECRET` | Optional | `...` | Google OAuth |
| `OAUTH_FACEBOOK_CLIENT_ID` | Optional | `...` | Facebook OAuth |
| `OAUTH_FACEBOOK_CLIENT_SECRET` | Optional | `...` | Facebook OAuth |
| `OAUTH_APPLE_CLIENT_ID` | Optional | `...` | Apple OAuth |
| `OAUTH_APPLE_TEAM_ID` | Optional | `...` | Apple OAuth |
| `OAUTH_APPLE_KEY_ID` | Optional | `...` | Apple OAuth |
| `OAUTH_APPLE_PRIVATE_KEY` | Optional | `-----BEGIN PRIVATE KEY-----...` | Apple OAuth |

### Email Verification (SMTP, optional but recommended)
| Variable | Required | Example | Scope |
|---|---|---|---|
| `SMTP_HOST` | Optional | `smtp.gmail.com` | Backend email delivery |
| `SMTP_PORT` | Optional | `587` | Backend email delivery |
| `SMTP_USER` | Optional | `noreply@example.com` | Backend email delivery |
| `SMTP_PASSWORD` | Optional | `...` | Backend email delivery |
| `SMTP_FROM` | Optional | `SpendIQ <noreply@example.com>` | Backend email delivery |
| `SMTP_USE_TLS` | Optional | `true` | Backend email delivery |

### Feature Flags (frontend)
| Variable | Default | Example | Scope |
|---|---|---|---|
| `VITE_FEATURE_SOCIAL_AUTH` | `false` | `true` | Show/hide social auth section |
| `VITE_FEATURE_SOCIAL_AUTH_GOOGLE` | `false` | `true` | Google button |
| `VITE_FEATURE_SOCIAL_AUTH_FACEBOOK` | `false` | `true` | Facebook button |
| `VITE_FEATURE_SOCIAL_AUTH_APPLE` | `false` | `true` | Apple button |

### Logging (minimal)
| Variable | Default | Example | Scope |
|---|---|---|---|
| `LOG_LEVEL` | `INFO` | `DEBUG` | Backend app log level |
| `LOG_JSON` | `true` | `false` | Backend app log format (`JSON` for prod, text optional for local debugging) |

## API Overview
Auth:
- `POST /auth/register`
- `POST /auth/register/verify-email`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `GET /auth/identifier-availability`

OAuth (optional):
- `GET /auth/oauth/providers`
- `GET /auth/oauth/{provider}/start`
- `GET /auth/oauth/{provider}/callback`
- `POST /auth/oauth/{provider}/callback`

User data:
- `GET/PUT /api/me/categories`
- `GET/PUT /api/me/overrides`
- `GET/PUT /api/me/settings`
- `POST /api/me/reset-data`

Parsing and categorization:
- `POST /api/parse/statement`
- `POST /api/categorize`
- `POST /api/ai/categorize` (optional/experimental)


## Persistence Behavior
Cookie consent affects optional browser storage usage:
- `Necessary`: required app/session behavior only
- `Preferences`: local categories/overrides/settings persistence
- `Performance`: browser dashboard cache persistence

Anonymous mode:
- Categories, overrides, settings in browser storage (only if consent allows preferences)
- Dashboard cache scoped to anonymous context (only if consent allows performance)

User account mode:
- Categories, overrides, settings stored per user in PostgreSQL
- Dashboard cache scoped to logged-in account context (sessionStorage, only if consent allows performance)

## Troubleshooting
- API calls fail on hosted frontend:
  - Verify `VITE_API_BASE` and backend CORS/cookie settings.
- Login works locally but fails on hosted frontend:
  - Check `COOKIE_SAMESITE=none` and `COOKIE_SECURE=true` on backend.
- Email registration shows verification message but no email arrives:
  - SMTP is not configured yet; in local/dev the verification PIN is logged by the backend as a fallback.
- Social login buttons do not appear:
  - Enable frontend feature flags (`VITE_FEATURE_SOCIAL_AUTH*`).
- Social login starts but fails immediately:
  - Verify OAuth env vars + provider redirect URLs + allowed origins.
- Routes broken under `/spendiq/...`:
  - Keep Vite base path set to `/spendiq/`.

## Roadmap
- [ ] Broader parser validation on additional bank statement layouts
- [ ] Optional parser profile detection per bank format
- [ ] Extended analytics cards and reporting views
- [ ] Expand test coverage beyond BVT + parser smoke suites
- [ ] Better import diagnostics for unsupported statements

## Contributing
Small focused PRs are preferred.
- Create branch from `development`
- Keep changes scoped and tested
- Open PR to `development`