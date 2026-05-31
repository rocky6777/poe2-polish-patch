#requires -Version 5.1
<#
  Translate a Path of Exile 2 loot filter (.filter) into Polish so it works with
  the Polish patch. No Node.js / .NET needed — pure PowerShell.

  The patch overwrites the English locale with Polish, so the game matches a
  filter's  BaseType "..."  /  Class "..."  values against the (now Polish) item
  names. This rewrites exactly those values using the shipped dictionary
  (filter-dict.pl.json); everything else (colours, sounds, ItemLevel, Rarity,
  Show/Hide, comments) is left untouched.

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
  [string]$Dict = (Join-Path $PSScriptRoot 'filter-dict.pl.json')
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path $In))   { throw "Filter not found: $In" }
if (-not (Test-Path $Dict)) { throw "Dictionary not found: $Dict (it ships next to this script)." }
if (-not $Out) { $Out = [IO.Path]::ChangeExtension($In, $null).TrimEnd('.') + '.pl.filter' }

# Dictionary is a JSON array of [english, polish] pairs (array form avoids the
# case-only-duplicate-key problem ConvertFrom-Json has with object form).
$pairs = Get-Content -Raw -LiteralPath $Dict | ConvertFrom-Json
$map = [System.Collections.Generic.Dictionary[string,string]]::new([System.StringComparer]::Ordinal)
foreach ($p in $pairs) { $map[[string]$p[0]] = [string]$p[1] }

$lines = Get-Content -LiteralPath $In
$rxLine  = [regex]'^(\s*)(BaseType|Class)\b'
$rxQuote = [regex]'"([^"]*)"'
$translated = 0; $touched = 0
$misses = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)

$evaluator = {
  param($m)
  $val = $m.Groups[1].Value
  if ($map.ContainsKey($val)) { $script:translated++; '"' + $map[$val] + '"' }
  else { [void]$misses.Add($val); $m.Value }
}

$result = foreach ($line in $lines) {
  if ($rxLine.IsMatch($line)) {
    $before = $script:translated
    $new = $rxQuote.Replace($line, $evaluator)
    if ($script:translated -ne $before) { $script:touched++ }
    $new
  } else { $line }
}

# Preserve a UTF-8 file (PoE reads UTF-8 filters); avoid a BOM.
[IO.File]::WriteAllLines($Out, $result, (New-Object Text.UTF8Encoding($false)))

Write-Host "Dictionary entries : $($map.Count)"
Write-Host "Rewrote            : $translated value(s) on $touched line(s)"
Write-Host "Output             : $Out" -ForegroundColor Green
if ($misses.Count) {
  Write-Host "`n$($misses.Count) value(s) had no Polish match (left in English — usually partial/substring rules you may want to adjust):" -ForegroundColor Yellow
  $misses | Select-Object -First 40 | ForEach-Object { Write-Host "   `"$_`"" }
  if ($misses.Count -gt 40) { Write-Host "   ... +$($misses.Count - 40) more" }
}
