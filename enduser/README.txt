PoE2 Polish Translation
=======================

Unofficial machine-translated Polish for Path of Exile 2. It overwrites the
game's English text, so you select "English" in-game and play in Polish.

------------------------------------------------------------
QUICK START
------------------------------------------------------------
1) Install Node.js (one time):  https://nodejs.org  (click the LTS button,
   install with default options).

2) Get oo2core_9_win64.dll:
   Copy this file from any Unreal Engine 4/5 game you own — look in that game's
   folder under  ...\Binaries\Win64\oo2core_9_win64.dll  — and put it in THIS
   folder (next to INSTALL.bat). We cannot include it (it is proprietary).

3) Double-click  INSTALL.bat
   Wait for "Done!". That's it.

4) Launch Path of Exile 2 > Options > Language > English. You're in Polish.

------------------------------------------------------------
IMPORTANT
------------------------------------------------------------
- This is a fan project, NOT affiliated with Grinding Gear Games. PoE2 is
  always-online; modifying game files is against GGG's Terms of Service and is
  done AT YOUR OWN RISK.
- Re-run INSTALL.bat after each game update (it re-applies + grabs the newest
  translations automatically).
- UNINSTALL / revert to English:
  Steam > Path of Exile 2 > Properties > Installed Files >
  "Verify integrity of game files".

------------------------------------------------------------
LOOT FILTERS
------------------------------------------------------------
Item names are now Polish, so an English loot filter stops matching. Convert
yours to Polish (no extra installs needed):

   powershell -ExecutionPolicy Bypass -File .\Translate-Filter.ps1 -In "C:\path\to\YourFilter.filter"

It writes "YourFilter.pl.filter" with the BaseType / Class lines translated to
the exact Polish names the patch uses; colours, sounds and tiers are unchanged.
Put the .pl.filter in  Documents\My Games\Path of Exile 2\  and pick it in
Options > UI > Item Filter. Values it can't translate (e.g. partial-name rules)
are listed at the end so you can adjust them.

------------------------------------------------------------
TROUBLESHOOTING
------------------------------------------------------------
- "Node.js not found"  -> install it (step 1), then run INSTALL.bat again.
- "oo2core ... not found" -> you missed step 2; the dll must sit next to
  INSTALL.bat (it gets copied to bin\oo2core.dll automatically).
- "Could not find Path of Exile 2" -> your game is on an unusual drive. Open
  PowerShell in this folder and run:
     powershell -ExecutionPolicy Bypass -File .\install.ps1 -Poe2Dir "X:\path\to\Path of Exile 2"
- Windows SmartScreen warns about the .bat -> "More info" > "Run anyway"
  (it only launches install.ps1, which is plain text you can read).
- Some menus/skills still show English: those are proper nouns or strings not
  yet translated in the current pack; they update over time.
