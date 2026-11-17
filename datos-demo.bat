@echo off
title FET Gym - Datos ficticios de demostracion
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\datos-demo.ps1"
echo.
pause
