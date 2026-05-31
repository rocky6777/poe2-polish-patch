#requires -Version 5.1
<#
  Translate a Path of Exile 2 loot filter (.filter) into Polish so it works with
  the Polish patch. No Node.js / .NET needed - pure PowerShell.

  The patch overwrites the English locale with Polish, so the game matches a
  filter's values against the (now Polish) names:
    BaseType / Class                 -> item base-type / class names
    HasExplicitMod / HasImplicitMod  -> affix (mod) names, e.g. "Hellion's"
  This rewrites those values to Polish using the shipped dictionary
  (filter-dict.pl.json). Everything else (colours, sounds, ItemLevel, Rarity,
  Show/Hide, comments) is left untouched.

  It ALSO drops any value that matches nothing in-game. The game fails the WHOLE
  filter on an exact-match BaseType (==) or a HasExplicitMod that matches no
  name ("No base types found exactly matching ..." / "No mods found ..."), so
  removing dead values is what keeps the filter loading. A rule left with no
  valid values is commented out (the rest of the block still loads).

  USAGE
    .\Translate-Filter.ps1 -In "MyFilter.filter"          -> "MyFilter.pl.filter"
    .\Translate-Filter.ps1 -In "MyFilter.filter" -Out "C:\...\Polish.filter"

  Then put the .pl.filter in  Documents\My Games\Path of Exile 2\  and select it
  in-game (Options -> UI -> Item Filter).
#>
param(
  [Parameter(Mandatory)] [string]$In,
  [string]$Out,
  [string]$Dict
)
$ErrorActionPreference = 'Stop'

# Resolve the dictionary next to this script. Done in the body (not the param
# default) because $PSScriptRoot is empty in the param block under Windows
# PowerShell 5.1; $PSCommandPath is the running script's full path on 5.1 and 7.
if (-not $Dict) { $Dict = Join-Path (Split-Path -Parent $PSCommandPath) 'filter-dict.pl.json' }

if (-not (Test-Path $In))   { throw "Filter not found: $In" }
if (-not (Test-Path $Dict)) { throw "Dictionary not found: $Dict (it ships next to this script)." }
if (-not $Out) { $Out = [IO.Path]::ChangeExtension($In, $null).TrimEnd('.') + '.pl.filter' }

# Dictionary JSON: { item:[[en,pl]...], mod:[[en,pl]...], itemNames:[...], modNames:[...] }.
# -Encoding UTF8 is REQUIRED: Windows PowerShell 5.1 otherwise reads the file as
# ANSI and corrupts the Polish letters, so the output would not match in-game.
$json = Get-Content -Raw -Encoding UTF8 -LiteralPath $Dict | ConvertFrom-Json
# Font workaround: the game font has no glyph for capital "Ł" (U+0141), so the
# patch folds every in-game name to lowercase "ł" (U+0142). The filter must match
# those names byte-for-byte, so we fold the SAME way on every Polish value we
# compare against or emit (and on the input below). English keys have no "Ł", so
# this is a no-op for them. Idempotent: re-running on a folded dict changes nothing.
function Fold([string]$s) { if ($null -eq $s) { return $s }; return $s.Replace([char]0x0141, [char]0x0142) }
function New-Map($pairs) {
  $m = [System.Collections.Generic.Dictionary[string,string]]::new([System.StringComparer]::Ordinal)
  foreach ($p in $pairs) { $m[[string]$p[0]] = Fold([string]$p[1]) }
  return ,$m
}
$itemMap  = New-Map $json.item
$modMap   = New-Map $json.mod
$itemFrag = New-Map $json.itemFrag       # partial-rule fragment translations
$baseNames = [string[]]@($json.itemNames | ForEach-Object { Fold $_ })   # for substring (non-==) checks
$baseSet = [System.Collections.Generic.HashSet[string]]::new($baseNames, [System.StringComparer]::Ordinal)
$modNames = [string[]]@($json.modNames | ForEach-Object { Fold $_ })     # for substring checks

$lines = Get-Content -Encoding UTF8 -LiteralPath $In
$rxLine  = [regex]'^(\s*)(BaseType|Class|HasExplicitMod|HasImplicitMod|HasMod)(\s*(==|!=|<=|>=|=|<|>)?\s*)(.*)$'
$rxQuote = [regex]'"([^"]*)"'
$translated = 0; $touched = 0
$dropped   = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$commented = 0
$script:curGroup = ''; $script:curExact = $false; $script:kept = 0

function Test-ItemSubstr([string]$val) { foreach ($n in $baseNames) { if ($n.Contains($val)) { return $true } } ; return $false }

# Resolve a value to the in-game form, or mark it unmatchable. The game fails the
# WHOLE filter on ANY value matching nothing, partial (non-==) rules included.
#   item ==   : exact base/class name      mod : substring of some mod name
#   item (no=): substring of some name; try as-is, then full-name, then fragment.
$evaluator = {
  param($q)
  $v = Fold($q.Groups[1].Value)   # fold to match the patch's lowercase-"ł" game names
  $out = $v; $ok = $false
  if ($script:curGroup -eq 'mod') {
    $cand = if ($modMap.ContainsKey($v)) { $modMap[$v] } else { $v }
    foreach ($n in $modNames) { if ($n.Contains($cand)) { $ok = $true; break } }
    $out = $cand
  } elseif ($script:curExact) {
    $cand = if ($itemMap.ContainsKey($v)) { $itemMap[$v] } else { $v }
    $ok = $baseSet.Contains($cand); $out = $cand
  } elseif (Test-ItemSubstr $v) {
    $ok = $true; $out = $v
  } else {
    $cand = if ($itemMap.ContainsKey($v)) { $itemMap[$v] } elseif ($itemFrag.ContainsKey($v)) { $itemFrag[$v] } else { $null }
    if ($cand -and (Test-ItemSubstr $cand)) { $ok = $true; $out = $cand }
  }
  if ($ok) { if ($out -ne $v) { $script:translated++ }; $script:kept++; '"' + $out + '"' }
  else { [void]$dropped.Add($v); '' }
}

$result = foreach ($line in $lines) {
  $m = $rxLine.Match($line)
  if (-not $m.Success) { $line; continue }
  $indent = $m.Groups[1].Value; $kw = $m.Groups[2].Value
  $op = $m.Groups[3].Value;     $rest = $m.Groups[5].Value
  $script:curExact = ($m.Groups[4].Value -eq '==')
  $script:curGroup = if ($kw.ToLowerInvariant().StartsWith('has')) { 'mod' } else { 'item' }
  $script:kept = 0
  $before = $script:translated
  $newRest = $rxQuote.Replace($rest, $evaluator)
  $newRest = ($newRest -replace '  +', ' ') -replace '\s+$', ''
  if ($script:kept -eq 0) {
    $commented++
    "$indent# [pl] removed (no in-game match): $($line.Trim())"
  } else {
    if ($script:translated -ne $before) { $script:touched++ }
    "$indent$kw$op$newRest"
  }
}

# Preserve a UTF-8 file (PoE reads UTF-8 filters); avoid a BOM.
[IO.File]::WriteAllLines($Out, $result, (New-Object Text.UTF8Encoding($false)))

Write-Host "Dictionary entries : $($itemMap.Count) item + $($modMap.Count) mod + $($itemFrag.Count) fragment  |  names: $($baseSet.Count) base/class + $($modNames.Count) mod"
Write-Host "Rewrote            : $translated value(s) on $touched line(s)"
Write-Host "Output             : $Out" -ForegroundColor Green
if ($dropped.Count) {
  Write-Host "`nDropped $($dropped.Count) value(s) that match nothing in-game (they would otherwise fail the whole filter):" -ForegroundColor Yellow
  $dropped | Select-Object -First 40 | ForEach-Object { Write-Host "   `"$_`"" }
  if ($dropped.Count -gt 40) { Write-Host "   ... +$($dropped.Count - 40) more" }
}
if ($commented) {
  Write-Host "`nCommented out $commented rule line(s) that had no valid values left (the rest of each block still loads)." -ForegroundColor Yellow
}
