$ErrorActionPreference = 'Stop'
Write-Host '[SMOKE] Backend parser tests...'
docker compose exec -T backend python -m pytest -q backend/tests/test_smoke_parser.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[SMOKE] OK'
