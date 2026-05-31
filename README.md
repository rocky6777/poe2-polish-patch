# PoE2 Polish translation patch

Unofficial machine-translated **Polish** for **Path of Exile 2**. It overwrites the
game's **English** text, so you select **English** in-game and play in Polish.
(English is the base locale and gives the best machine-translation quality.)

> ⚠️ **Unofficial fan project — not affiliated with or endorsed by Grinding Gear Games.**
> PoE2 is always-online; modifying client files is against GGG's Terms of Service and is
> done **at your own risk**. Revert any time via Steam → PoE2 → Properties → Installed
> Files → *Verify integrity of game files*.

---

## For players (install)
Grab the latest **[Release](../../releases)** (the `PoE2-Polish-Patch.zip`) and follow the
included `README.txt`. In short you need **Node.js** and your own copy of
`oo2core_9_win64.dll` (from any Unreal Engine game — it's proprietary, so we can't ship it),
then run `install.ps1`. The patcher auto-downloads the newest translations on each run.

## How it works
```
read English .datc64  ->  translate (free Google, cached, placeholder-safe)
   (pathofexile-dat)        (src/translate.mjs)
   ->  write patched .datc64  ->  apply into Bundles2 (Oodle repack)
       (src/datWriter.mjs)        (ApplyPolish, C#, needs oo2core)
```
- Translations live in a **separate data repo** and are pulled via `src/remote.mjs`
  (`manifest.json` version check → download `translations.pl.json.gz`). Offline-safe.
- Only genuine **display text** is translated. `src/translatable.mjs` excludes Id columns,
  asset paths/URLs, internal identifiers, and **executable scripts** (translating those
  crashes the client — learned the hard way; see that file's comments).
- The writer is **append-only** and round-trip tested; `build.mjs` keeps a pristine English
  backup and re-stages any table whose live copy drifted, so re-runs self-heal.

## Build from source
Requirements: **Node.js 20+**, **.NET SDK 8+**, **git**, and `oo2core_9_win64.dll`.
```powershell
git clone https://github.com/rocky6777/poe2-polish-translations.git   # (optional: the data)
git clone https://github.com/aianlinb/LibGGPK3.git                    # required dependency
npm install
# build the C# apply tool
dotnet build ApplyPolish/ApplyPolish.csproj -c Release
```

### Maintainer workflow
```powershell
# (re)translate from your game files — multi-hour first time, resumable, cached:
pwsh -File .\rebuild.ps1 -Oo2core 'C:\path\oo2core_9_win64.dll'
# publish updated translations to the data repo (bumps version, pushes):
pwsh -File .\publish-translations.ps1
# build the downloadable installer zip:
pwsh -File .\package.ps1            # -> dist\PoE2-Polish-Patch.zip
```
Edit `patcher.config.json` to point at your own translations repo.

## Layout
| Path | Purpose |
|---|---|
| `src/build.mjs` | orchestrator (extract → translate → write staging) |
| `src/datWriter.mjs` | append-only `.datc64` string patcher (round-trip tested) |
| `src/translate.mjs` | en→pl, batched free-Google + on-disk cache + markup safety net |
| `src/translatable.mjs` | what's safe to translate (the crash guards live here) |
| `src/remote.mjs` | auto-update translations from the data repo |
| `ApplyPolish/` | C# tool: repacks staging into `Bundles2` (needs oo2core) |
| `enduser/` | the installer scripts shipped to players |
| `test/` | round-trip + live verification scripts |

## Credits
- **[LibGGPK3](https://github.com/aianlinb/LibGGPK3)** by aianlinb — bundle read/write + Oodle (MIT)
- **[pathofexile-dat](https://github.com/SnosMe/poe-dat-viewer)** by SnosMe — `.datc64` reader (MIT)
- **[dat-schema](https://github.com/poe-tool-dev/dat-schema)** by poe-tool-dev — table schemas
- Path of Exile 2 © Grinding Gear Games

## License
Source code: [MIT](LICENSE). Does **not** cover GGG game data/derived translations or the
proprietary Oodle library (`oo2core`), which is **not** included. See `LICENSE` for details.
