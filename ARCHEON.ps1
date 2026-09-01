# Product launcher. Desktop icon uses Open-Archeon.ps1 (hidden compiler).
#   .\ARCHEON.ps1            icon compiler (UI + release binary)
#   .\ARCHEON.ps1 -Force     rebuild everything
#   .\ARCHEON.ps1 -Dev       hot-reload API + Vite (no stamp)
param(
    [switch]$Force,
    [switch]$Dev
)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if ($Dev) {
    $env:ARCHEON_ROOT = $Root
    $env:PYTHONPATH = Join-Path $Root 'workers\cad-occt'
    $env:ARCHEON_NO_OPEN = '1'
    Write-Host "ARCHEON DEV  API http://127.0.0.1:8799  UI http://127.0.0.1:5174"
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$Root'; `$env:ARCHEON_ROOT='$Root'; `$env:ARCHEON_NO_OPEN='1'; cargo run -p archeon-api -- --no-open`""
    Start-Sleep -Seconds 2
    Push-Location (Join-Path $Root 'apps\workstation')
    if (-not (Test-Path 'node_modules')) { npm install }
    npm run dev
    Pop-Location
    exit
}

& (Join-Path $Root 'Open-Archeon.ps1') -Force:$Force
