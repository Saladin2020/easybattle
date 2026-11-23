# `easybattle/1` format

A workspace has any number of `battles/<id>.easybattle.json` documents. They merge into one database; ids must be
unique across documents (`check` names both files on a clash). Every display name is `{ "th", "en", "ms"? }`.

```json
{
  "format": "easybattle/1",
  "id": "core",
  "name": { "th": "แกนหลัก", "en": "Core" },
  "rules": { "maxLevel": 30, "partySize": 3, "xp": { "base": 20, "step": 12, "quad": 3 }, "crit": 6, "flee": 50, "enemyScale": 8,
             "terrainCodes": { "F": "forest", "M": "mountain", "C": "field" } },
  "elements": [{ "id": "fire", "name": { "th": "ไฟ", "en": "Fire" }, "color": "#e8643c" }],
  "statuses": [{ "id": "poison", "name": { "th": "พิษ", "en": "Poison" }, "kind": "poison", "amount": 8, "turns": 3 }],
  "skills": [{ "id": "firecracker", "name": { "th": "ประทัด", "en": "Firecracker", "ms": "Mercun" }, "kind": "magic",
               "target": "all_enemies", "power": 9, "mp": 6, "element": "fire", "fx": "explosion_small", "sfx": "explosion" }],
  "heroes": [{ "id": "mei", "name": { "th": "เหม่ย", "en": "Mei" }, "base": { "hp": 34, "mp": 24, "atk": 9, "def": 7, "mag": 13, "res": 9, "spd": 12 },
               "growth": { "hp": 4.5, "mp": 3, "atk": 1.1, "def": 0.9, "mag": 2, "res": 1.3, "spd": 1.3 },
               "skills": [{ "level": 1, "skill": "firecracker" }], "sprite": "mei", "color": "#c8402e" }],
  "enemies": [{ "id": "monkey_thief", "name": { "th": "ลิงขโมยขนม", "en": "Snack-thief monkey" }, "level": 2,
                "stats": { "hp": 57, "mp": 4, "atk": 12, "def": 6, "mag": 4, "res": 5, "spd": 13 },
                "skills": [{ "skill": "steal_snack", "weight": 2 }, { "skill": "attack", "weight": 1 }],
                "weak": ["fire"], "xp": 9, "coins": 9, "drops": [{ "item": "banana", "chance": 45 }], "art": "monkey" }],
  "encounters": [{ "id": "kampung_forest", "cultures": ["malay"], "terrains": ["forest", "mountain"], "rate": 22,
                   "groups": [{ "enemies": ["cobra", "monkey_thief"], "weight": 3 }, { "enemies": ["water_monitor", "cobra"], "weight": 2, "levelBonus": 1 }] }],
  "items": [{ "item": "balm", "hp": 40, "target": "ally" }]
}
```

## Entries

| Entry | Fields |
|---|---|
| element | `id`, `name`, `color` (`#rrggbb`) |
| status | `id`, `name`, `kind` (`poison` · `regen` · `sleep` · `stun` · `atk` · `def` · `mag` · `spd`), `amount` (poison / regen: % of max HP per turn; stat kinds: multiplier %, e.g. 130 or 70), `turns`, `color?` |
| skill | `id`, `name`, `desc?`, `kind` (`physical` · `magic` · `heal` · `buff` · `debuff` · `cure`), `target` (`enemy` · `all_enemies` · `self` · `ally` · `all_allies`), `power?` (10 = plain attack), `mp?`, `element?`, `accuracy?` (0–100, default 95), `status? { id, chance? }`, `cures? [status ids]`, `fx?` (Easy FX preset), `sfx?` (Easy SFX sound) |
| hero | `id`, `name`, `role?`, `base` (hp, mp, atk, def, mag, res, spd), `growth` (per level, fractions allowed; stats are floored), `skills [{ level, skill }]`, `weak?`, `resist?`, `sprite?` (Easy Sprite side-view sheet id), `portrait?`, `color?` |
| enemy | `id`, `name`, `level`, `stats`, `skills [{ skill, weight }]`, `weak?`, `resist?`, `immune?`, `xp`, `coins`, `drops? [{ item, chance %, n? }]`, `loot?` (Easy Items loot table), `art` (built-in art: monkey, crab, mosquito, monitor, cobra, bat, boar, rooster, scorpion, bandit, mud, crocodile, tiger, kite), `palette?` (3 colours), `boss?` |
| encounter | `id`, `name?`, `regions?` (Easy Tilemap overworld region ids), `cultures?` (thai · malay · chinese · rural · city · any), `terrains` (any · grass · forest · mountain · field · road · beach · water · town · cave), `rate` (average steps between fights), `groups [{ enemies (1–5 ids), weight, levelBonus? }]`, `music?`, `background?`, `scripted?` |
| item | `item` (Easy Items id), `hp?`, `mp?`, `cures?`, `target?` (`ally` · `all_allies`) |

Enemies placed above their base level gain `enemyScale` % stats per level and 10 % more XP and coins.
`terrainCodes` maps Easy Tilemap overworld ground codes to terrains for `Battle.step()`.

## Engine

1. Round: living actors sorted by SPD (after statuses), ties heroes first, then position.
2. Turn: a sleeping or stunned actor skips. At the end of each actor's own turn poison / regen tick (`amount` % of
   max HP, at least 1) and every status on it counts down one turn.
3. Enemy AI: a weighted skill roll over the skills it can pay for, then a uniformly random target. The party's
   auto policy (Auto button, `autoRun`, simulations) uses no rolls: heal the weakest ally under 40 % HP, otherwise
   the strongest affordable damage skill on the weakest foe.
4. Hit: `accuracy` roll (default 95), crit roll (`rules.crit` %), damage formula in the README, variance 0.9–1.1.
5. Victory when every enemy is down; defeat when every hero is down. Flee chance = `rules.flee` + 2 × (party
   average SPD − enemy average SPD), clamped to 10–95 %; 0 against bosses and scripted tables.

RNG: mulberry32(seed); the Godot port draws in the same order. Encounter group rolls use `groupSeed(seed)`
(seed × 0x9E3779B1) so consecutive seeds pick varied groups.

## Validation

`check` reports errors with JSON paths (`game.easybattle.json.enemies[0].stats.hp`): unknown references (skills,
elements, statuses, enemies in groups), duplicates, bad numbers, empty groups, more than 5 enemies, missing names,
content rules. Warnings: unused skills, heroes without a sprite sheet, items or regions missing from the
cross-checked Easy Items workspace / overworld map.
