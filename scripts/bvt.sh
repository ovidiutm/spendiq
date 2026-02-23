#!/usr/bin/env sh
set -eu

echo "[BVT] Backend tests..."
docker compose exec -T backend python -m pytest -q backend/tests/test_bvt_api.py

echo "[BVT] Frontend tests..."
docker compose exec -T frontend sh -lc "npm run test:bvt"

echo "[BVT] OK"
