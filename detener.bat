@echo off
title FET Gym - Detener
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\detener.ps1"
echo.
pause
