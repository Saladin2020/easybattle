# Easy Battle MCP server

```bash
npm run mcp                      # stdio
npm run mcp:http                 # http://127.0.0.1:8939/mcp (streamable HTTP)
node dist/mcp/server.js --workspace /path/to/game [--http --port 8939]
```

Client config (stdio):

```json
{ "mcpServers": { "easybattle": { "command": "node", "args": ["/path/to/easybattle/dist/mcp/server.js", "--workspace", "/path/to/game"] } } }
```

| Tool | Args | Returns |
|---|---|---|
| `workspace_info` | | documents, rules, elements, statuses, heroes, enemies, skills, encounter tables, battle items and the format cheat sheet with the content rules. Call first |
| `list_entries` | `kind` (heroes · enemies · skills · statuses · encounters) | summaries |
| `get_entry` | `id` | the full entry and its source document; heroes also get stats and XP-to-next at levels 1 / 5 / 10 / 20 |
| `write_battles` | `id`, `doc?`, `mode?` (write · read), `dryRun?` | validates the document against the whole workspace; saves only without errors. `{ saved, file, errors, warnings }` |
| `check_battles` | `items?`, `overworld?` | `{ ok, errors, warnings, cross }`: drops / battle items vs an Easy Items workspace, encounter regions vs an Easy Tilemap overworld map |
| `simulate_battle` | `party [{id, level}]`, `enemies? [{id, level?}]` or `table?`, `seed?`, `runs?`, `items?` | one auto battle: `result`, `rounds`, `rewards` (xp, coins, drops, level-ups), `snapshot`, `log`; with `runs > 1`: `winRate`, `avgRounds` |
| `roll_encounter` | `region?`, `culture?`, `terrain?`, `seed?`, `times?` | `{ rolls: [{ seed, table, rate, enemies }] }` |
| `render_battle` | `what?` (battle · bestiary), `party?`, `enemies?`, `seed?`, `turns?`, `scale?`, `layout?` (classic · backview), `status?` (rows · cards · none), `backdrop?` (auto · paddy · forest) | PNG image (no text); the layout defaults to the workspace `ui` |
| `export_battle` | `preset?`, `out?`, `bundle?`, `font?` | written folders, file count, bundled fx / sfx, bundled fonts, warnings. `out` must stay inside the workspace |

Errors carry JSON paths (`game.easybattle.json.enemies[0].skills`) so an agent can fix them in place. Document
ids match `^[a-z0-9][a-z0-9_-]*$`; paths outside the workspace and `EASYBATTLE_ALLOWED_DIRS` are refused.
