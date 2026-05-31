@echo off
title PoE2 Polish - Loot Filter Translator
REM Translate a loot filter to Polish so it works with the patch.
REM Two ways to use this:
REM   1) DRAG your .filter file onto this .bat, OR
REM   2) double-click it and type/paste the path when asked.
REM It runs Translate-Filter.ps1 with the execution policy bypassed, so you
REM don't have to fight PowerShell's "scripts are blocked" setting.

set "FILTER=%~1"
if "%FILTER%"=="" (
  echo Drag a .filter file onto this .bat, or paste its full path below.
  echo.
  set /p "FILTER=Filter file: "
)
if "%FILTER%"=="" (
  echo No file given. Nothing to do.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Translate-Filter.ps1" -In "%FILTER%"
echo.
echo ============================================================
echo  If it said "Output: ...pl.filter", copy that .pl.filter into
echo    Documents\My Games\Path of Exile 2\
echo  and pick it in-game: Options -^> UI -^> Item Filter.
echo ============================================================
pause
