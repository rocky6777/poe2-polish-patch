PoE2 Polish Translation
=======================

Unofficial machine-translated Polish for Path of Exile 2. It overwrites the
game's English text, so you select "English" in-game and play in Polish.

⚠ IMPORTANT
- Path of Exile 2 is always-online. Modifying game files is against GGG's Terms
  of Service and is done AT YOUR OWN RISK (possible account action). This is a
  fan project, not endorsed by or affiliated with Grinding Gear Games.
- Re-apply after each game patch (run install.ps1 again).
- To UNINSTALL / revert: Steam > Path of Exile 2 > Properties > Installed Files
  > "Verify integrity of game files" (re-downloads the originals).

REQUIREMENTS
1) Node.js 20 or newer        https://nodejs.org   (just install, defaults are fine)
2) oo2core_9_win64.dll        Copy this file from any Unreal Engine 4/5 game you
   own (look in that game's ...\Binaries\Win64\ folder) and drop it into THIS
   folder, next to install.ps1. We cannot include it — it is proprietary.

INSTALL
1) Put oo2core_9_win64.dll in this folder.
2) Right-click install.ps1 > "Run with PowerShell".
   (Or in a terminal:  pwsh -File .\install.ps1 )
   If it can't find your game:  pwsh -File .\install.ps1 -Poe2Dir "X:\path\to\Path of Exile 2"
3) Launch the game, Options > Language > English. You're now playing in Polish.

NOTES
- Translation is machine-generated; some terms read oddly. Proper nouns
  (Path of Exile, place/skill names) are intentionally left untranslated where
  configured.
- Strings added in a newer patch that aren't in this pack will stay English
  until the pack is updated.
