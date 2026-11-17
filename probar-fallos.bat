@echo off
title FET Gym - Probar tolerancia a fallos
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\probar-fallos.ps1"
echo.
pause
