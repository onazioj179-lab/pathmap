@echo off
title PathMap Launcher
REM One-click launcher for PathMap. Double-click this file.
REM It runs the PowerShell engine (Start-PathMap.ps1) next to it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-PathMap.ps1"
if errorlevel 1 (
  echo.
  echo PathMap could not start. See the message above.
  pause
)
