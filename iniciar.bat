@echo off
title FET Gym - Iniciar
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\iniciar.ps1"
echo.
pause
