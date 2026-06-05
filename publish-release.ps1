#requires -Version 7
<#
  Publish the built zips to GitHub Releases on rocky6777/poe2-polish-patch.

  Creates/updates TWO releases per game build (idempotent - safe to re-run; a
  re-run just replaces the asset and refreshes the title/notes):

    v{N}-{build}-patcher  ->  dist\PoE2-Polish-Patch.zip    (the patcher)
    v{N}-{build}-dropin   ->  dist\PoE2-Polish-DropIn.zip   (copy-in files)

  where N     = translations version (translations-repo\manifest.json)
        build = PoE2 Steam buildid   (steamapps\appmanifest_2694490.acf)

  Auth (no gh CLI required) - first that works wins:
    1) $env:GH_TOKEN / $env:GITHUB_TOKEN
    2) the token Git Credential Manager stores for the repo OWNER on github.com
       (looked up with a username hint, so a multi-account machine returns the
       account that can actually write here - zero extra setup).
  The token needs contents:write (classic `repo`/`public_repo`) on the repo;
  the script preflights this and skips with a clear message if it's missing.

  Usage:
    ./publish-release.ps1            # publish (asks once before uploading)
    ./publish-release.ps1 -Draft     # create as DRAFTS to preview first
    ./publish-release.ps1 -DryRun    # print the plan + notes, touch nothing
    ./publish-release.ps1 -CheckAuth # verify token + write access, upload nothing
    ./publish-release.ps1 -Yes       # skip the confirmation (release.bat uses this)
#>
param(
  [string]$Repo    = 'rocky6777/poe2-polish-patch',
  [string]$Poe2Dir = 'D:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2',
  [string]$DistDir = (Join-Path $PSScriptRoot 'dist'),
  [string]$Version,            # override translations version (default: from manifest)
  [string]$Build,              # override PoE2 build id      (default: from Steam appmanifest)
  [switch]$Draft,
  [switch]$DryRun,
  [switch]$CheckAuth,
  [switch]$Yes
)
$ErrorActionPreference = 'Stop'

function MB([string]$p) { [math]::Round((Get-Item $p).Length / 1MB, 0) }

function Get-Poe2Build([string]$dir) {
  # appmanifest sits two levels up from ...\steamapps\common\Path of Exile 2
  $steamapps = Split-Path (Split-Path $dir -Parent) -Parent
  $acf = Join-Path $steamapps 'appmanifest_2694490.acf'
  if (-not (Test-Path $acf)) { return $null }
  if ((Get-Content $acf -Raw) -match '"buildid"\s+"(\d+)"') { return $Matches[1] }
  return $null
}

# ---- metadata ----------------------------------------------------------------
$count = $null
if (-not $Version) {
  $mf = Join-Path $PSScriptRoot 'translations-repo\manifest.json'
  if (-not (Test-Path $mf)) { throw "No $mf - run the publish step first, or pass -Version." }
  $manifest = Get-Content $mf -Raw | ConvertFrom-Json
  $Version  = [string]$manifest.version
  $count    = [int]$manifest.count
}
if (-not $Build) {
  $Build = Get-Poe2Build $Poe2Dir
  if (-not $Build) { throw "Couldn't read PoE2 buildid from Steam appmanifest. Pass -Build <id> (and -Poe2Dir if your install is elsewhere)." }
}
$date = (Get-Date).ToString('yyyy-MM-dd')

$patchZip = Join-Path $DistDir 'PoE2-Polish-Patch.zip'
$dropZip  = Join-Path $DistDir 'PoE2-Polish-DropIn.zip'
foreach ($z in @($patchZip, $dropZip)) {
  if (-not (Test-Path $z)) { throw "Missing $z - run ./release.bat (or package*.ps1) to build the zips first." }
}

# ---- release notes (single-quoted templates; literal .Replace, no regex) ------
$countStr = if ($count) { '{0:N0} strings · ' -f $count } else { '' }

$patchTemplate = @'
**PoE2 Polish v{{VERSION}}** — machine-translated English→Polish for Path of Exile 2.
{{COUNT}}built against game build **{{BUILD}}** · {{DATE}}.

### This download: the patcher (recommended)
`PoE2-Polish-Patch.zip` ({{SIZE}} MB). Applies Polish to your existing install and
**auto-updates** the translation data on every run.

**Install**
1. Install [Node.js](https://nodejs.org) (LTS) if you don't have it.
2. Unzip anywhere and double-click `INSTALL.bat`.
3. Launch PoE2 → Options → Language → **English** to see Polish.

Don't want to install anything? Grab the **drop-in** release instead.

> Re-run after each PoE2 patch. Revert anytime: Steam → PoE2 → Verify integrity of game files.
'@

$dropTemplate = @'
**PoE2 Polish v{{VERSION}}** — machine-translated English→Polish for Path of Exile 2.
{{COUNT}}built against game build **{{BUILD}}** · {{DATE}}.

### This download: drop-in (no tools required)
`PoE2-Polish-DropIn.zip` ({{SIZE}} MB). Pre-patched game files — no Node.js, no
.NET, nothing to install.

**Install**
1. Unzip.
2. Copy the `Bundles2` folder into your PoE2 install, overwriting when asked
   (`…\steamapps\common\Path of Exile 2`).
3. Launch PoE2 → Options → Language → **English** to see Polish.

> A PoE2 patch overwrites these files — re-download after each game update, or use
> the auto-updating **patcher** release. Revert: Steam → Verify integrity.
'@

function Expand-Notes([string]$tpl, [string]$size) {
  $tpl.Replace('{{VERSION}}', $Version).
       Replace('{{COUNT}}',   $countStr).
       Replace('{{BUILD}}',   $Build).
       Replace('{{DATE}}',    $date).
       Replace('{{SIZE}}',    $size)
}

$releases = @(
  [pscustomobject]@{ Tag = "v$Version-$Build-patcher"; Title = "PoE2 Polish v$Version — game build $Build (patcher)"; Body = (Expand-Notes $patchTemplate "$(MB $patchZip)"); Asset = $patchZip }
  [pscustomobject]@{ Tag = "v$Version-$Build-dropin";  Title = "PoE2 Polish v$Version — game build $Build (drop-in)"; Body = (Expand-Notes $dropTemplate  "$(MB $dropZip)");  Asset = $dropZip  }
)

# ---- plan --------------------------------------------------------------------
Write-Host "Repo:    $Repo" -ForegroundColor Cyan
Write-Host ("Version: v{0}   Build: {1}   Date: {2}{3}" -f $Version, $Build, $date, $(if ($Draft) { '   [DRAFT]' } else { '' })) -ForegroundColor Cyan
foreach ($r in $releases) {
  Write-Host ("  {0,-26}  <-  {1} ({2} MB)" -f $r.Tag, (Split-Path $r.Asset -Leaf), (MB $r.Asset))
}

if ($DryRun) {
  foreach ($r in $releases) {
    Write-Host "`n--- $($r.Tag)  |  $($r.Title) ---" -ForegroundColor DarkCyan
    Write-Host $r.Body
  }
  Write-Host "`n-DryRun: nothing was uploaded." -ForegroundColor Yellow
  return
}

# ---- auth + write-access preflight (token is never printed) -------------------
$owner = ($Repo -split '/')[0]
function Get-GitHubToken([string]$owner) {
  if ($env:GH_TOKEN)     { return $env:GH_TOKEN }
  if ($env:GITHUB_TOKEN) { return $env:GITHUB_TOKEN }
  # Hint the repo OWNER so a multi-account Credential Manager returns the account
  # that can actually write here; a bare host lookup can return a different
  # signed-in account that isn't a collaborator on this repo.
  $cred = "protocol=https`nhost=github.com`nusername=$owner`n`n" | git credential fill 2>$null
  foreach ($line in $cred) { if ($line -match '^password=(.*)$') { return $Matches[1] } }
  return $null
}
$token = Get-GitHubToken $owner
if (-not $token) {
  Write-Warning "No GitHub token found. Set `$env:GH_TOKEN to a PAT with write access to $Repo (or run ``git push`` to that repo once so Credential Manager stores one). Skipping release upload."
  return
}

$apiBase = "https://api.github.com/repos/$Repo"
$hdr = @{
  Authorization          = "Bearer $token"
  Accept                 = 'application/vnd.github+json'
  'User-Agent'           = 'poe2-polish-release'
  'X-GitHub-Api-Version' = '2022-11-28'
}

# Confirm the token can actually write here BEFORE uploading, so we never fail
# mid-upload with an opaque 403/404.
try {
  $me   = (Invoke-RestMethod 'https://api.github.com/user' -Headers $hdr).login
  $perm = (Invoke-RestMethod $apiBase -Headers $hdr).permissions.push
} catch {
  Write-Warning "Couldn't verify GitHub access: $($_.Exception.Message). Skipping release upload."
  return
}
if (-not $perm) {
  Write-Warning ("GitHub token is for '$me', which has no write access to $Repo. Set " +
    "`$env:GH_TOKEN to a PAT for an account that can push to $Repo (e.g. the owner '$owner'), then re-run. Skipping.")
  return
}
Write-Host "Authenticated as $me (write access OK)." -ForegroundColor DarkGray
if ($CheckAuth) { Write-Host 'Auth check passed - nothing uploaded.' -ForegroundColor Green; return }

if (-not $Yes) {
  $ans = Read-Host "Publish these $($releases.Count) release(s) to $Repo now? [y/N]"
  if ($ans -notmatch '^(y|yes)$') { Write-Host 'Aborted - nothing uploaded.' -ForegroundColor Yellow; return }
}

# ---- GitHub API --------------------------------------------------------------
function Invoke-GH([string]$Uri, [string]$Method = 'Get', $BodyObj = $null) {
  try {
    if ($BodyObj) {
      return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $hdr `
        -Body ($BodyObj | ConvertTo-Json -Depth 6) -ContentType 'application/json; charset=utf-8'
    }
    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $hdr
  } catch {
    $d = $_.ErrorDetails.Message
    throw "GitHub API $Method $Uri failed: $($_.Exception.Message)$(if ($d) { " - $d" })"
  }
}

foreach ($r in $releases) {
  Write-Host "`n== $($r.Tag) ==" -ForegroundColor Cyan

  # find existing release for this tag, else create one
  $rel = $null
  try { $rel = Invoke-RestMethod -Uri "$apiBase/releases/tags/$($r.Tag)" -Headers $hdr } catch { $rel = $null }
  if ($rel) {
    $rel = Invoke-GH "$apiBase/releases/$($rel.id)" 'Patch' @{ name = $r.Title; body = $r.Body; draft = [bool]$Draft }
    Write-Host "Updated existing release (id $($rel.id))."
  } else {
    $rel = Invoke-GH "$apiBase/releases" 'Post' @{ tag_name = $r.Tag; name = $r.Title; body = $r.Body; draft = [bool]$Draft; prerelease = $false }
    Write-Host "Created release (id $($rel.id))."
  }

  # remove a same-named asset from a previous run (GitHub rejects duplicates)
  $name = Split-Path $r.Asset -Leaf
  foreach ($a in @($rel.assets | Where-Object { $_.name -eq $name })) {
    Invoke-GH "$apiBase/releases/assets/$($a.id)" 'Delete' | Out-Null
    Write-Host "  Replaced existing $name."
  }

  # upload (streams from disk via -InFile, fine for the 100+ MB drop-in)
  Write-Host "  Uploading $name ($(MB $r.Asset) MB)..."
  $uploadUri = "https://uploads.github.com/repos/$Repo/releases/$($rel.id)/assets?name=$name"
  try {
    $up = Invoke-RestMethod -Uri $uploadUri -Method Post -Headers $hdr -InFile $r.Asset -ContentType 'application/zip'
  } catch {
    $d = $_.ErrorDetails.Message
    throw "Upload of $name failed: $($_.Exception.Message)$(if ($d) { " - $d" })"
  }
  Write-Host "  Done: $($up.browser_download_url)" -ForegroundColor Green
  Write-Host "  $($rel.html_url)"
}

Write-Host "`nReleases live at https://github.com/$Repo/releases$(if ($Draft) { '  (DRAFTS - open the page and click Publish)' })." -ForegroundColor Green
