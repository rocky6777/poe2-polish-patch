#requires -Version 7
<#
  Publish the latest translations to your GitHub "translations" repo.
  Run after ./rebuild.ps1 has refreshed .cache\translations.pl.json.

  First-time setup (once):
    1) Create an EMPTY public repo on GitHub, e.g.  poe2-polish-translations
    2) node src/publish.mjs        # generates translations-repo/ contents
    3) cd translations-repo
       git init; git add -A; git commit -m "v1"
       git branch -M main
       git remote add origin https://github.com/<USER>/poe2-polish-translations.git
       git push -u origin main
    4) Put that repo's raw URL in patcher.config.json:
         https://raw.githubusercontent.com/<USER>/poe2-polish-translations/main

  After that, just run:  ./publish-translations.ps1   (regenerates + commits + pushes)
#>
param([switch]$NoPush)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$repo = Join-Path $root 'translations-repo'

node (Join-Path $root 'src\publish.mjs')
if ($LASTEXITCODE) { throw 'publish.mjs failed' }

if (-not (Test-Path (Join-Path $repo '.git'))) {
  Write-Host "translations-repo is not a git repo yet — do the one-time setup in this script's header." -ForegroundColor Yellow
  return
}
if ($NoPush) { Write-Host 'Generated (not pushed).' -ForegroundColor Green; return }

$ver = (Get-Content (Join-Path $repo 'manifest.json') -Raw | ConvertFrom-Json).version
git -C $repo add -A
if (-not (git -C $repo status --porcelain)) {
  Write-Host 'No translation changes since last publish — nothing to commit/push.' -ForegroundColor Yellow
  return
}
git -C $repo commit -m "Update translations v$ver"
git -C $repo push
Write-Host "Pushed translations v$ver." -ForegroundColor Green
