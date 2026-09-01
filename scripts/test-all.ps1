$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
Write-Host "== cargo test --workspace =="
cargo test --workspace
Write-Host "== python cad tests =="
$env:PYTHONPATH = Join-Path $Root 'workers\cad-occt'
python -m pytest workers\cad-occt\tests -q
Write-Host "== workstation vitest =="
Push-Location apps\workstation
if (-not (Test-Path node_modules)) { npm install }
npm test
Pop-Location
Write-Host "OK"
