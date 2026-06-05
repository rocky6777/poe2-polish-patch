@echo off
setlocal EnableExtensions EnableDelayedExpansion
REM ==========================================================================
REM  PoE2 Polish - one-click release pipeline.  Run AFTER a PoE2 game patch.
REM
REM    [1/5] rebuild.ps1         re-translate changed strings + repack Polish
REM                              into the live Bundles2 (self-heals a normal
REM                              patch; no "Verify integrity" needed)
REM    [2/5] package-dropin.ps1  -> dist\PoE2-Polish-DropIn.zip  (copy-in)
REM    [3/5] package.ps1         -> dist\PoE2-Polish-Patch.zip   (patcher)
REM    [4/5] publish             regenerate translations-repo; commit + push
REM                              only when the strings actually changed
REM    [5/5] publish-release     upload both zips to GitHub Releases as two
REM                              releases (v{N}-{build}-patcher / -dropin)
REM
REM  Just double-click this file after Steam finishes patching PoE2. It stops
REM  immediately if any step fails, so a bad build never gets packaged/published.
REM ==========================================================================
cd /d "%~dp0"

REM Prefer PowerShell 7 (the .ps1 scripts require it); fall back to Windows PowerShell.
set "PS=pwsh"
where pwsh >nul 2>nul || set "PS=powershell"
set "PSRUN=%PS% -NoProfile -ExecutionPolicy Bypass -File"

echo.
echo === [1/5] Rebuild + repack into Bundles2 (rebuild.ps1) ===
%PSRUN% "%~dp0rebuild.ps1"
if errorlevel 100 goto :nochange
if errorlevel 1 goto :fail

echo.
echo === [2/5] Build drop-in package (package-dropin.ps1) ===
%PSRUN% "%~dp0package-dropin.ps1"
if errorlevel 1 goto :fail

echo.
echo === [3/5] Build patcher package (package.ps1) ===
%PSRUN% "%~dp0package.ps1"
if errorlevel 1 goto :fail

echo.
echo === [4/5] Regenerate + commit translations-repo (src\publish.mjs) ===
node "%~dp0src\publish.mjs"
if errorlevel 1 goto :fail

if not exist "%~dp0translations-repo\.git" (
  echo translations-repo is not a git repo - skipping translations commit/push.
  goto :release
)

git -C "%~dp0translations-repo" add -A
git -C "%~dp0translations-repo" diff --cached --quiet
if errorlevel 1 (
  REM staged changes exist -> the strings changed, so commit + offer push
  set "VER="
  for /f "usebackq delims=" %%v in (`node -e "process.stdout.write(String(require('./translations-repo/manifest.json').version))"`) do set "VER=%%v"
  git -C "%~dp0translations-repo" commit -m "Update translations v!VER!"
  echo.
  set /p "PUSH=Push translations v!VER! to GitHub now? [y/N] "
  if /i "!PUSH!"=="y" (
    git -C "%~dp0translations-repo" push
    if errorlevel 1 goto :fail
    echo Pushed translations v!VER!.
  ) else (
    echo Skipped push - translations v!VER! is committed locally only.
  )
) else (
  echo No translation changes since last publish - nothing to commit/push.
)

:release
echo.
echo === [5/5] Publish GitHub releases for the built zips (publish-release.ps1) ===
set /p "REL=Upload + publish both zips to GitHub Releases now? [y/N] "
if /i "!REL!"=="y" (
  %PSRUN% "%~dp0publish-release.ps1" -Yes
  if errorlevel 1 goto :fail
) else (
  echo Skipped - no GitHub releases were created. Run publish-release.ps1 later when ready.
)

:done
echo.
echo ==========================================================================
echo  DONE.
echo    dist\PoE2-Polish-DropIn.zip    (copy-in distribution)
echo    dist\PoE2-Polish-Patch.zip     (patcher / auto-update distribution)
echo    translations-repo              (pushed only if strings changed)
echo    GitHub Releases                (uploaded if you chose y in step 5)
echo.
echo  Launch PoE2 and pick English in Options to see the Polish patch live.
echo ==========================================================================
pause
exit /b 0

:nochange
echo.
echo ==========================================================================
echo  NOTHING TO DO. The live game already matches the current Polish, so there
echo  is no new package or release to build.
echo.
echo  Most likely you ran this before a Steam update finished. Let the update
echo  fully download/install (Steam shows Play, not "Update queued"), then run
echo  release.bat again. Your English backup in out\source-en is intact - no
echo  "Verify integrity" is needed.
echo ==========================================================================
pause
exit /b 0

:fail
echo.
echo *** A STEP FAILED (exit code %errorlevel%). Pipeline aborted - nothing
echo *** further was run. Scroll up to see which step and why.
echo.
echo  If it was a contamination error naming out\source-en, the backup is
echo  corrupted: Steam -^> PoE2 -^> Verify integrity, delete out\source-en, re-run.
pause
exit /b 1
