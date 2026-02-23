$ErrorActionPreference = 'Stop'
Write-Host '[BVT] Backend tests...'
docker compose exec -T backend python -m pytest -q backend/tests/test_bvt_api.py
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[BVT] Frontend tests...'
docker compose exec -T frontend sh -lc "npm run test:bvt"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host '[BVT] OK'
