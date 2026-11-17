@echo off
title FET Gym - Borrar datos
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\borrar-datos.ps1"
echo.
pause
