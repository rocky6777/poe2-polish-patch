#requires -Version 5.1
<#
  Translate a Path of Exile 2 loot filter (.filter) into Polish so it works with
  the Polish patch. No Node.js / .NET needed - pure PowerShell.

  The patch overwrites the English locale with Polish, so the game matches a
  filter's values against the (now Polish) names:
    BaseType / Class                 -> item base-type / class names
    HasExplicitMod / HasImplicitMod  -> affix (mod) names, e.g. "Hellion's"
  This rewrites exactly those values using the shipped dictionary
  (filter-dict.pl.json). Everything else (colours, sounds, ItemLevel, Rarity,
  Show/Hide, comments) is left untouched.

  NOTE: a mod value the game can't find makes it reject the WHOLE filter
  ("No mods found matching ..."), so untranslated mod values are flagged loudly.

  USAGE
    .\Translate-Filter.ps1 -In "MyFilter.filter"
        -> writes "MyFilter.pl.filter" next to it
    .\Translate-Filter.ps1 -In "MyFilter.filter" -Out "C:\...\Polish.filter"

  Then put the .pl.filter in:
    Documents\My Games\Path of Exile 2\   and select it in-game
    (Options -> UI -> Item Filter).
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

# Dictionary JSON: { "item": [[en,pl],...], "mod": [[en,pl],...] }. Array-of-pairs
# form avoids the case-only-duplicate-key problem ConvertFrom-Json has with objects.
# -Encoding UTF8 is REQUIRED: Windows PowerShell 5.1 otherwise reads the file as
# ANSI and corrupts the Polish letters, so the output would not match in-game.
$json = Get-Content -Raw -Encoding UTF8 -LiteralPath $Dict | ConvertFrom-Json
function New-Map($pairs) {
  $m = [System.Collections.Generic.Dictionary[string,string]]::new([System.StringComparer]::Ordinal)
  foreach ($p in $pairs) { $m[[string]$p[0]] = [string]$p[1] }
  return ,$m
}
$itemMap = New-Map $json.item
$modMap  = New-Map $json.mod

$lines = Get-Content -Encoding UTF8 -LiteralPath $In
$rxLine  = [regex]'^\s*(BaseType|Class|HasExplicitMod|HasImplicitMod|HasMod)\b'
$rxQuote = [regex]'"([^"]*)"'
$translated = 0; $touched = 0
$misses    = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$modMisses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
$script:curMap = $null
$script:curIsMod = $false

$evaluator = {
  param($m)
  $val = $m.Groups[1].Value
  if ($script:curMap -and $script:curMap.ContainsKey($val)) {
    $script:translated++
    '"' + $script:curMap[$val] + '"'
  } else {
    [void]$misses.Add($val)
    if ($script:curIsMod) { [void]$modMisses.Add($val) }
    $m.Value
  }
}

$result = foreach ($line in $lines) {
  $mm = $rxLine.Match($line)
  if ($mm.Success) {
    switch -Regex ($mm.Groups[1].Value.ToLowerInvariant()) {
      '^has' { $script:curMap = $modMap;  $script:curIsMod = $true }
      default { $script:curMap = $itemMap; $script:curIsMod = $false }
    }
    $before = $script:translated
    $new = $rxQuote.Replace($line, $evaluator)
    if ($script:translated -ne $before) { $script:touched++ }
    $new
  } else { $line }
}

# Preserve a UTF-8 file (PoE reads UTF-8 filters); avoid a BOM.
[IO.File]::WriteAllLines($Out, $result, (New-Object Text.UTF8Encoding($false)))

Write-Host "Dictionary entries : $($itemMap.Count) item + $($modMap.Count) mod"
Write-Host "Rewrote            : $translated value(s) on $touched line(s)"
Write-Host "Output             : $Out" -ForegroundColor Green
if ($misses.Count) {
  Write-Host "`n$($misses.Count) value(s) had no Polish match (left in English - usually base types that stay English in-game, or partial/substring rules):" -ForegroundColor Yellow
  $misses | Select-Object -First 40 | ForEach-Object { Write-Host "   `"$_`"" }
  if ($misses.Count -gt 40) { Write-Host "   ... +$($misses.Count - 40) more" }
}
if ($modMisses.Count) {
  Write-Host "`nWARNING: $($modMisses.Count) MOD-rule value(s) left in English. If any is not part of a Polish affix name, the game will reject the WHOLE filter ('No mods found matching ...'). Single letters/short fragments are usually fine; full English affix names are not. Review:" -ForegroundColor Red
  $modMisses | ForEach-Object { Write-Host "   `"$_`"" }
}
