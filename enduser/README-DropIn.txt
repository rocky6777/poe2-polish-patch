==========================================================================
  PoE2 Polish Translation — DROP-IN package
==========================================================================

This is the pre-built translation. There is NOTHING to install — no
Node.js, no .NET, no extra DLLs, no patcher to run. You just copy two
game files into your Path of Exile 2 folder.

--------------------------------------------------------------------------
WHAT'S IN HERE
--------------------------------------------------------------------------
  Bundles2\_.index.bin             <- the patched file index
  Bundles2\LibGGPK3\0.bundle.bin   <- the Polish text data

That's the whole patch. Your original game bundles are NOT modified; the
index simply points at the extra Polish data file.

--------------------------------------------------------------------------
HOW TO INSTALL
--------------------------------------------------------------------------
  1. CLOSE Path of Exile 2 completely.

  2. Find your game folder — the one containing PathOfExile_x64Steam.exe.
     Default (Steam):
       C:\Program Files (x86)\Steam\steamapps\common\Path of Exile 2
     (Right-click the game in Steam -> Manage -> Browse local files.)

  3. BACK UP your current index first (so you can undo without Steam):
       copy "...\Path of Exile 2\Bundles2\_.index.bin"  to a safe place.

  4. Copy the "Bundles2" folder from THIS package into the game folder and
     let it MERGE / REPLACE. This overwrites Bundles2\_.index.bin and adds
     Bundles2\LibGGPK3\0.bundle.bin.

  5. Launch the game. In Options, set the game Language to ENGLISH.
     (The patch replaces the English base text with Polish, so "English"
     is what now shows Polish.)

--------------------------------------------------------------------------
LOOT FILTERS  (important!)
--------------------------------------------------------------------------
  Because the game now shows Polish item names, an ENGLISH loot filter no
  longer matches anything (the game compares your filter's BaseType / Class
  text against the Polish names). Convert your filter to Polish first.

  EASIEST: drag your .filter file onto  LootFilter\Translate-Filter.bat
  (the .bat handles PowerShell's "scripts are blocked" setting for you). It
  writes "<YourFilter>.pl.filter" next to the original, translating the
  BaseType / Class values AND the HasExplicitMod affix names (e.g.
  "Hellion's") to the exact Polish the patch uses; everything else (colours,
  sounds, tiers) is unchanged.

  Then copy that .pl.filter into
     Documents\My Games\Path of Exile 2\
  and select it in-game (Options -> UI -> Item Filter).

  (Command-line alternative, if you prefer:
     powershell -ExecutionPolicy Bypass -File Translate-Filter.ps1 -In "YourFilter.filter"
   Keep Translate-Filter.ps1 and filter-dict.pl.json together in the same
   folder.)

  Any values it couldn't translate are listed at the end. Most are harmless:
  base types whose Polish IS the English word stay English in-game too, so
  they still match. Only partial-name rules (e.g. a bare "Rune" meant to catch
  every rune) may need a manual tweak. If it prints a red MOD-rule WARNING,
  read it: an untranslated full affix name on a HasExplicitMod line can make
  the game reject the whole filter, so fix those before using the filter.

--------------------------------------------------------------------------
HOW TO UNDO IT  (or if anything looks broken)
--------------------------------------------------------------------------
  Easiest: Steam -> right-click Path of Exile 2 -> Properties ->
  Installed Files -> "Verify integrity of game files". Steam restores the
  original index and removes the patch.

  Or: restore the _.index.bin you backed up in step 3, and delete
  Bundles2\LibGGPK3\0.bundle.bin.

--------------------------------------------------------------------------
IMPORTANT — GAME VERSION
--------------------------------------------------------------------------
  This patch is built for ONE specific game version. The index must match
  the exact bundles your install has. After a Path of Exile 2 update the
  index will no longer match and the game may fail to start or show errors
  -> just Verify integrity of game files to restore the original, and grab
  a rebuilt drop-in.

  Online (real-money / ladder) play with modified files is at your own
  risk; this only changes display text, but use it on your own judgement.
==========================================================================
