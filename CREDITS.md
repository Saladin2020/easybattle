# Credits

## Art and sample data (CC0 1.0)

* The 14 enemies are **drawn from code** (`src/lib/art.ts`): no source images, no AI generation, no network calls.
* Hero sheets in `assets/heroes/` are Easy Sprite side-view characters composed from Easy Sprite parts (CC0 1.0).
* The starter battles (`samples/battles/`), the overworld regions excerpt (`samples/overworld/`) and everything you
  render or export from them are dedicated to the public domain (CC0 1.0).
* Content rules: no depiction of the Prophet or of sacred figures; no Quran, scripture or Arabic calligraphy as
  battle content; places of worship are not battlegrounds or enemies. Thai, Malay-Muslim and Chinese-Thai heroes
  fight side by side.

## Fonts

* **Kanit** (Cadson Demak, SIL Open Font License 1.1) is bundled in `assets/fonts/` with `OFL.txt` and copied into
  the Godot and PixiJS exports so Thai text renders out of the box.
* **Press Start 2P** (SIL OFL 1.1) appears only in the README art (`docs/brand/`).

## Runtimes and siblings

* PixiJS v8 is **not** bundled: the exported `index.html` loads `./pixi.min.js` if present, otherwise the jsDelivr CDN (MIT).
* Godot exports target Godot 4.3+ (MIT); nothing from the engine is included.
* Easy FX strips and Easy SFX sounds in an export are rendered by those tools (MIT code, CC0 output).
