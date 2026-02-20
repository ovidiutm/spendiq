# Deployment How-To (GitHub Pages + Render)

This guide explains how to deploy SpendIQ in the same way the current public demo runs.

Current demo setup:
- Frontend: GitHub Pages (`https://ovidiutm.github.io/spendiq`)
- Backend: Render (FastAPI + PostgreSQL)

## 1. Frontend on GitHub Pages

Already present in the repository:
- Vite base path configured for project pages (`/spendiq/`) in `frontend/vite.config.ts`
- GitHub Actions workflow for Pages deploy: `.github/workflows/deploy-pages.yml`

Repository settings required:
1. `Settings` -> `Pages` -> `Source` = `GitHub Actions`
2. `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`
   - Add `VITE_API_BASE=https://<your-backend-public-url>`

Deploy trigger:
- Push to `main` (or run the workflow manually from Actions tab).

## 2. Backend on Render

Repository includes a Render Blueprint:
- `render.yaml`

Recommended flow:
1. Render -> `New` -> `Blueprint`
2. Select your fork/repo
3. Confirm services from `render.yaml`:
   - PostgreSQL service
   - Backend web service (Docker)
4. Deploy
5. Copy backend public URL (example: `https://your-backend.onrender.com`)
6. Put that URL in GitHub variable `VITE_API_BASE`

## 3. Backend production env values (important)

Set these on the backend service:
- `COOKIE_SECURE=true`
- `COOKIE_SAMESITE=none`
- `CORS_ALLOW_ORIGINS=https://ovidiutm.github.io`

If using a different GitHub username, replace origin accordingly.

## 4. Validation checklist

After deploy:
- Frontend opens at `https://<username>.github.io/spendiq`
- Frontend calls backend successfully
- Login/Register works from hosted frontend
- Statement parse endpoint responds correctly

## 5. Notes

- If frontend shows only repository README, Pages source is likely not set to `GitHub Actions`.
- If auth fails only in hosted mode, check cookie and CORS settings first.