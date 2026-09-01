# ARCHEON Phase-1 launcher (Windows).
# Starts the Rust API and the Vite workstation.
param(
    [switch]$ApiOnly,
    [switch]$UiOnly
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$env:ARCHEON_ROOT = $Root
$env:PYTHONPATH = Join-Path $Root 'workers\cad-occt'

function Start-Api {
    Write-Host "ARCHEON API  http://127.0.0.1:8799"
    cargo run -p archeon-api
}

function Start-Ui {
    $ui = Join-Path $Root 'apps\workstation'
    if (-not (Test-Path (Join-Path $ui 'node_modules'))) {
        Push-Location $ui
        npm install
        Pop-Location
    }
    Write-Host "ARCHEON UI   http://127.0.0.1:5174"
    Push-Location $ui
    npm run dev
    Pop-Location
}

if ($ApiOnly) { Start-Api; exit }
if ($UiOnly) { Start-Ui; exit }

Write-Host @"
ARCHEON 0.1.0
  API  http://127.0.0.1:8799
  UI   http://127.0.0.1:5174  (proxies /api)
  CAD  workers\cad-occt  (primitive STEP/STL; build123d optional)
"@

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$Root'; `$env:ARCHEON_ROOT='$Root'; cargo run -p archeon-api`""
Start-Sleep -Seconds 2
Start-Ui
