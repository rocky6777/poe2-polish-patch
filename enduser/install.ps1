#requires -Version 7
<#
  PoE2 Polish translation — installer (end users).
  Applies the bundled Polish translation to YOUR Path of Exile 2 install.
  No internet needed: it uses the translation pack shipped in this folder.

  Prerequisites:
    1) Node.js 20+         -> https://nodejs.org
    2) oo2core_9_win64.dll -> copy from any Unreal Engine 4/5 game's binaries
       folder into this folder (next to install.ps1). We can't ship it (it's
       proprietary). It will be renamed to oo2core.dll automatically.

  Usage (right-click > Run with PowerShell, or in a terminal):
    ./install.ps1
    ./install.ps1 -Poe2Dir 'D:\Steam\steamapps\common\Path of Exile 2'
#>
param([string]$Poe2Dir)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Find-Poe2 {
  if ($Poe2Dir) { return $Poe2Dir }
  # Steam install path from registry, then scan every library folder.
  $steam = (Get-ItemProperty 'HKCU:\SOFTWARE\Valve\Steam' -Name SteamPath -ErrorAction SilentlyContinue).SteamPath
  $roots = @()
  if ($steam) {
    $roots += (Join-Path $steam 'steamapps\common\Path of Exile 2')
    $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
    if (Test-Path $vdf) {
      Select-String -Path $vdf -Pattern '"path"\s+"([^"]+)"' | ForEach-Object {
        $p = $_.Matches[0].Groups[1].Value -replace '\\\\','\'
        $roots += (Join-Path $p 'steamapps\common\Path of Exile 2')
      }
    }
  }
  $roots += @('C:','D:','E:','F:' | ForEach-Object { "$_\Program Files (x86)\Steam\steamapps\common\Path of Exile 2" })
  foreach ($r in $roots) { if (Test-Path (Join-Path $r 'Bundles2\_.index.bin')) { return $r } }
  throw "Could not find Path of Exile 2. Re-run with:  ./install.ps1 -Poe2Dir '<path to game>'"
}

$game = Find-Poe2
$index = Join-Path $game 'Bundles2\_.index.bin'
Write-Host "Game:  $game" -ForegroundColor Cyan

# oo2core: accept the RAD name and normalize to the name DllImport needs.
$rad = Join-Path $root 'oo2core_9_win64.dll'
$dll = Join-Path $root 'bin\oo2core.dll'
if (Test-Path $rad) { Copy-Item $rad $dll -Force }
if (-not (Test-Path $dll)) {
  throw "oo2core_9_win64.dll not found. Copy it into:`n  $root`n(from any Unreal Engine game's binaries folder), then re-run."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js not found. Install it from https://nodejs.org and re-run."
}

# 1) Check GitHub for newer translations, then build from the cache (offline MT).
#    --update : pull latest translations.pl.json from the repo if newer
#    --offline: never call Google; only use the (now up-to-date) cache
Write-Host '== Checking for translation updates + building (offline) ==' -ForegroundColor Cyan
$env:POE2_DIR = $game
node (Join-Path $root 'src\build.mjs') --run --offline --update
if ($LASTEXITCODE) { throw 'build failed' }

# 2) Repack into the game.
Write-Host '== Applying into the game ==' -ForegroundColor Cyan
& (Join-Path $root 'bin\ApplyPolish.exe') $index (Join-Path $root 'out\staging')
if ($LASTEXITCODE) { throw 'apply failed' }

Write-Host "`nDone! Launch PoE2 and choose English in Options to play in Polish." -ForegroundColor Green
Write-Host "To uninstall: Steam > PoE2 > Properties > Installed Files > Verify integrity of game files." -ForegroundColor Yellow
