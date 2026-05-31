#requires -Version 7
<#
  Builds the downloadable end-user package into  dist\PoE2-Polish-Patch.zip
  Run this AFTER a full './rebuild.ps1' so .cache\translations.pl.json is complete.

  The package contains everything a user needs EXCEPT oo2core (proprietary) and
  Node.js (they install it). It applies offline using the shipped translation cache.
#>
param([string]$OutDir = (Join-Path $PSScriptRoot 'dist'))
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$pkg  = Join-Path $OutDir 'PoE2-Polish-Patch'

Remove-Item $pkg -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $pkg, (Join-Path $pkg 'bin'), (Join-Path $pkg '.cache') | Out-Null

# 1) Self-contained single-file exe (user needs no .NET install).
Write-Host '== Publishing self-contained ApplyPolish.exe ==' -ForegroundColor Cyan
dotnet publish (Join-Path $root 'ApplyPolish\ApplyPolish.csproj') -c Release -r win-x64 --self-contained `
  -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:DebugType=none `
  -o (Join-Path $pkg 'bin') --nologo | Out-Null
Get-ChildItem (Join-Path $pkg 'bin') -Filter *.pdb | Remove-Item -Force -ErrorAction SilentlyContinue

# 2) Tool + offline assets (NOT the game files).
Copy-Item (Join-Path $root 'src')          $pkg -Recurse
Copy-Item (Join-Path $root 'node_modules') $pkg -Recurse
Copy-Item (Join-Path $root '.cache\schema.min.json')      (Join-Path $pkg '.cache')
Copy-Item (Join-Path $root '.cache\translations.pl.json') (Join-Path $pkg '.cache')
Copy-Item (Join-Path $root 'enduser\install.ps1')  $pkg
Copy-Item (Join-Path $root 'enduser\README.txt')   $pkg
Copy-Item (Join-Path $root 'patcher.config.json')  $pkg   # repo URL for auto-update

# 3) Zip it.
$zip = Join-Path $OutDir 'PoE2-Polish-Patch.zip'
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Compress-Archive -Path "$pkg\*" -DestinationPath $zip
$n = (Get-Content (Join-Path $root '.cache\translations.pl.json') -Raw | ConvertFrom-Json -AsHashtable).Count
Write-Host "`nPackage: $zip" -ForegroundColor Green
Write-Host ("Size: {0} MB | translations bundled: {1}" -f [math]::Round((Get-Item $zip).Length/1MB,1), $n) -ForegroundColor Green
