@echo off
title PoE2 Polish Translation - Installer
REM Double-click this file to install. It runs install.ps1 with the execution
REM policy bypassed, so you don't have to fight PowerShell settings or the
REM "scripts are blocked" warning on downloaded files.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
echo.
echo ============================================================
echo  If you saw "Done!" above, launch PoE2 and pick English.
echo  If there was an error, read the message above it.
echo ============================================================
pause
