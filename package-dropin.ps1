#requires -Version 7
<#
  Builds the PURE DROP-IN package into  dist\PoE2-Polish-DropIn(.zip).

  Unlike package.ps1 (which ships the patcher + cache for the user to apply),
  this ships the already-patched game files: the user just copies them in.
  No Node.js, no .NET, no oo2core on the user's machine.

  PREREQUISITE: a CLEAN apply must already be in the live game folder, i.e.
    1. (recommended) Steam -> Verify integrity of game files   # pristine index
    2. Remove-Item "<game>\Bundles2\LibGGPK3" -Recurse -Force   # drop orphans!
    3. node src\build.mjs --run                                 # stage Polish
    4. ApplyPolish "<game>\Bundles2\_.index.bin" out\staging     # write patch
  NOTE: Verify integrity resets _.index.bin but does NOT delete the LibGGPK3
  folder (Steam doesn't track it), so old *.bundle.bin orphans survive and this
  script would copy them too (bloating the zip). Step 2 deletes them so a single
  apply leaves exactly ONE referenced bundle. The warning below catches the case
  where you forgot.
#>
param(
  [string]$GameDir = 'D:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2',
  [string]$OutDir  = (Join-Path $PSScriptRoot 'dist')
)
$ErrorActionPreference = 'Stop'

$srcBundles = Join-Path $GameDir 'Bundles2'
$index      = Join-Path $srcBundles '_.index.bin'
$libDir     = Join-Path $srcBundles 'LibGGPK3'
if (-not (Test-Path $index))  { throw "Index not found: $index" }
if (-not (Test-Path $libDir)) { throw "No LibGGPK3 patch data in $srcBundles — apply the patch first (see header)." }

$bundles = @(Get-ChildItem $libDir -Filter *.bundle.bin)
if ($bundles.Count -eq 0) { throw "No *.bundle.bin in $libDir — nothing to package." }
if ($bundles.Count -gt 1) {
  Write-Warning "LibGGPK3 has $($bundles.Count) bundles — likely orphans from repeated applies."
  Write-Warning "For a minimal package: Steam -> Verify integrity, then re-run build + ApplyPolish once, then this."
}

$pkg  = Join-Path $OutDir 'PoE2-Polish-DropIn'
$dest = Join-Path $pkg 'Bundles2'
Remove-Item $pkg -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $dest 'LibGGPK3') | Out-Null

Write-Host '== Copying patched index + Polish data ==' -ForegroundColor Cyan
Copy-Item $index (Join-Path $dest '_.index.bin')
$bundles | ForEach-Object { Copy-Item $_.FullName (Join-Path $dest 'LibGGPK3' $_.Name) }
Copy-Item (Join-Path $PSScriptRoot 'enduser\README-DropIn.txt') (Join-Path $pkg 'README.txt')

# Loot-filter localizer (pure PowerShell, no deps) + dictionary from build.mjs.
$fdict = Join-Path $PSScriptRoot 'out\filter-dict.pl.json'
if (Test-Path $fdict) {
  $fdir = Join-Path $pkg 'LootFilter'
  New-Item -ItemType Directory -Force $fdir | Out-Null
  Copy-Item (Join-Path $PSScriptRoot 'enduser\Translate-Filter.ps1')  $fdir
  Copy-Item (Join-Path $PSScriptRoot 'enduser\Translate-Filter.bat')  $fdir
  Copy-Item $fdict $fdir
} else {
  Write-Warning "No $fdict — run ./build.mjs --run to emit it; skipping loot-filter tool."
}

$zip = Join-Path $OutDir 'PoE2-Polish-DropIn.zip'
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$pkg\*" -DestinationPath $zip

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "`nDrop-in package: $zip" -ForegroundColor Green
Write-Host ("Size: {0} MB ({1} bundle file(s))" -f $mb, $bundles.Count) -ForegroundColor Green
