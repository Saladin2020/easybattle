---
name: easybattle-combat
description: >-
  Use when a game needs turn-based JRPG combat: hero stats and level curves, skills with elements and status
  effects, enemies with drops, random encounter tables per Easy Tilemap overworld region, balancing by simulated
  win rates, or a Godot 4.3+ battle scene + Battle autoload / PixiJS battle runtime wired to Easy UI, FX, SFX, Items
  and Save. Not for real-time action combat or for drawing new enemy art (17 built-in enemy arts).
---
# Easy Battle combat

Easy Battle **validates, simulates and exports** `easybattle/1` battle databases. Read
`/workspace/indie-studio/tools/EASYBATTLE.md` for paths and commands; format: `…/tools/easybattle/docs/FORMAT.md`.

## Steps

1. **Look.** `list heroes|enemies|skills|encounters`, `show <id>`. Reuse starter skills and enemies when they fit.
2. **Write.** Add entries in `battles/<doc>.easybattle.json` (or MCP `write_battles` with `dryRun` first). Every
   name needs `th` and `en`; add `ms` for Malay-speaking regions.
3. **Bind the map.** `bind-overworld <overworld.json>` writes one table per region; `check --overworld` must show 0
   uncovered regions. `check --items <easyitems workspace>` must find every drop.
4. **Balance.** `sim --party … --vs … --runs 100`: aim for ~95 % against random tables at the intended level and
   40–70 % against bosses one or two levels early.
5. **Look.** `render --what battle|bestiary --out <png>` and open the PNG. For a 16-bit back-view screen (blue
   window, party from behind, HP arcs, portrait status cards with READY!/WAIT...) set `"ui": {"layout": "backview"}`
   in a document and preview with `render --layout backview --status cards`. For active time battle add
   `"timing": "atb"` (gauges fill by SPD, READY!/WAIT... with time bars on the cards) and `"atbMode": "wait"` (time
   stops in menus) or `"active"`.
6. **Export.** `export --preset godot` or `pixi`; for Godot run `test_battle.gd` headless and expect `OK`.

## Rules

- No sacred figures, scripture, Quran or Arabic calligraphy as battle content; places of worship are never
  battlegrounds or enemies. Keep parties and regions multicultural.
- Do not push or change the upstream repo; ask before any push or merge.
