@echo off
title ARCHEON
cd /d "%~dp0"
REM Visible fallback. The desktop icon should call Open-Archeon.ps1 hidden.
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-Archeon.ps1"
if errorlevel 1 (
  echo.
  echo ARCHEON failed to start. See logs\last-launch.txt
  pause
)
