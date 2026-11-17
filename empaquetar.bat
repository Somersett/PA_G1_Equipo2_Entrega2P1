@echo off
title FET Gym - Empaquetar
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\empaquetar.ps1"
echo.
pause
