#!/usr/bin/env sh
set -eu

echo "[SMOKE] Backend parser tests..."
docker compose exec -T backend python -m pytest -q backend/tests/test_smoke_parser.py

echo "[SMOKE] OK"
