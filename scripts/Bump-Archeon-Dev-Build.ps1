# Jackson-style per-click compiler stamp.
# Release stays in VERSION. Each desktop-icon launch increments DEV_BUILD
# so the operator UI and /api/health show 0.1.0+dev.N without a cargo rebuild.
[CmdletBinding()]
param([switch]$Quiet)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ReleasePath = Join-Path $Root 'VERSION'
$BuildPath = Join-Path $Root 'DEV_BUILD'
$InstallDir = Join-Path $env:LOCALAPPDATA 'ARCHEON'

$release = if (Test-Path $ReleasePath) { (Get-Content $ReleasePath -Raw).Trim() } else { '0.0.0' }
$current = 0
if (Test-Path $BuildPath) {
    $raw = (Get-Content $BuildPath -Raw).Trim()
    [void][int]::TryParse($raw, [ref]$current)
}
$next = $current + 1
Set-Content -Path $BuildPath -Value "$next" -NoNewline -Encoding ascii
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Set-Content -Path (Join-Path $InstallDir 'DEV_BUILD') -Value "$next" -NoNewline -Encoding ascii
Set-Content -Path (Join-Path $InstallDir 'VERSION') -Value $release -NoNewline -Encoding ascii

$display = "$release+dev.$next"
if ($Quiet) { Write-Output $display } else { Write-Host $display }
