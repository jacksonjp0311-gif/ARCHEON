# Visible compiler. Desktop icon should use Open-Archeon.ps1 (hidden).
param([switch]$Force)
$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
& (Join-Path $Root 'Open-Archeon.ps1') -Force:$Force
