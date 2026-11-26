@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Сайт "Ваза" - локальный сервер
echo ============================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
pause
