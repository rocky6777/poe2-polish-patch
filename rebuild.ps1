#requires -Version 7
<#
  Re-runnable PoE2 German->Polish patch.
  Run once to build the translation; re-run after every Steam update to
  translate only the newly-added/changed strings (the cache handles the rest).

  Usage:
    ./rebuild.ps1 -Oo2core 'C:\path\to\oo2core_9_win64.dll'
    ./rebuild.ps1            # if oo2core is already beside ApplyPolish.exe
#>
param(
  [string]$Poe2Dir = 'D:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2',
  [string]$Oo2core,
  [string[]]$BuildArgs = @()   # e.g. -BuildArgs '--tables','ClientStrings'  for a small first test
)
$ErrorActionPreference = 'Stop'
$root    = $PSScriptRoot
$index   = Join-Path $Poe2Dir 'Bundles2\_.index.bin'
$staging = Join-Path $root 'out\staging'
$exeDir  = Join-Path $root 'ApplyPolish\bin\Release\net8.0'
$exe     = Join-Path $exeDir 'ApplyPolish.exe'

if (-not (Test-Path $index)) { throw "Index not found: $index  (set -Poe2Dir)" }

# 1) Build the C# apply tool if needed.
if (-not (Test-Path $exe)) {
  Write-Host '== Building ApplyPolish ==' -ForegroundColor Cyan
  dotnet build (Join-Path $root 'ApplyPolish\ApplyPolish.csproj') -c Release -nologo
  if ($LASTEXITCODE) { throw 'dotnet build failed' }
}

# 1b) Scan the cache and purge link-breaking / contaminated entries up front, so
#     this run re-translates them correctly (glossary-link keys stay English).
#     translate.mjs self-heals on load too; this just makes the fix visible.
Write-Host '== Scanning cache for bad translations (clean-cache.mjs) ==' -ForegroundColor Cyan
node (Join-Path $root 'src\clean-cache.mjs')
if ($LASTEXITCODE) { throw 'clean-cache.mjs failed' }

# 2) Translate + write staging .datc64 (resumable; cache in .cache\translations.pl.json).
Write-Host '== Translating + staging (node build.mjs --run) ==' -ForegroundColor Cyan
$env:POE2_DIR = $Poe2Dir
node (Join-Path $root 'src\build.mjs') --run @BuildArgs
if ($LASTEXITCODE) { throw 'build.mjs failed' }

# 3) Make sure oo2core is beside the exe.
#    DllImport("oo2core") resolves to oo2core.dll, so it MUST be named exactly that.
$dll = Join-Path $exeDir 'oo2core.dll'
if ($Oo2core) { Copy-Item $Oo2core $dll -Force }
if (-not (Test-Path $dll)) {
  throw "oo2core.dll missing at $dll. Pass -Oo2core <path to oo2core_9_win64.dll>, or copy it there as oo2core.dll."
}

# 4) Apply into Bundles2 (recompresses via Oodle, writes _.index.bin in place).
$pendingMap = Join-Path $root 'out\applied-hashes.pending.json'
$appliedMap = Join-Path $root 'out\applied-hashes.json'

# build.mjs stages a table ONLY when its live bytes differ from the desired Polish,
# so an empty staging dir means the live game already matches the current Polish —
# there is nothing to apply. That's SUCCESS, not failure (and ApplyPolish errors on
# empty input). The usual cause is a re-run before a Steam patch actually changed
# anything: e.g. the update is still queued/downloading, so the live bundles are
# untouched — let Steam FINISH, then re-run. No "Verify integrity" is involved; the
# English backup in out\source-en is intact (build.mjs only re-snapshots tables the
# patch reset to English, and here it found none).
$staged = @(Get-ChildItem -Path $staging -Recurse -File -Include '*.datc64','*.csd' -ErrorAction SilentlyContinue)
if ($staged.Count -eq 0) {
  Write-Host "`nNothing to apply — the live game already matches the current Polish (0 changed tables)." -ForegroundColor Green
  Write-Host "If a Steam update is still queued/downloading, let it finish, then re-run." -ForegroundColor Yellow
  # Live is unchanged, so applied-hashes.json already describes it; drop the
  # (identical) pending map instead of promoting it.
  Remove-Item -LiteralPath $pendingMap -Force -ErrorAction SilentlyContinue
  exit 100   # sentinel: "nothing to do" — release.bat stops the pipeline cleanly
}

Write-Host "== Applying into Bundles2 ($($staged.Count) staged file(s)) ==" -ForegroundColor Cyan
& $exe $index $staging
if ($LASTEXITCODE) { throw 'ApplyPolish failed' }

# 4b) Commit the applied-hash map now that the apply actually succeeded. build.mjs
#     wrote it as applied-hashes.pending.json (sha256 of every table's Polish bytes);
#     promoting it ONLY here keeps the record in lock-step with what is truly live.
#     The throw above guarantees we never reach this on a failed/partial apply, so a
#     botched run leaves the previous (correct) map intact and the next rebuild still
#     self-heals. Lets build.mjs recognise diacritic-free Polish ("Rzadki"/"Mityczne")
#     it otherwise can't — see src/build.mjs isOurPolish().
if (Test-Path $pendingMap) { Move-Item -LiteralPath $pendingMap -Destination $appliedMap -Force }

Write-Host "`nDone. Launch PoE2 and pick English in Options. You should see Polish." -ForegroundColor Green
Write-Host "After a Steam patch: just re-run this script." -ForegroundColor Yellow
Write-Host "Revert: Steam > PoE2 > Properties > Installed Files > Verify integrity of game files." -ForegroundColor Yellow
