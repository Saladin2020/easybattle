#!/usr/bin/env node
/**
 * Easy Battle MCP server (stdio by default; optional Streamable HTTP).
 *
 *   npx tsx src/mcp/server.ts
 *   npx tsx src/mcp/server.ts --http --port 8939
 *
 * Env: EASYBATTLE_WORKSPACE  absolute path to the workspace (default: cwd)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import path from "node:path";
import { z } from "zod";
import { entrySummary } from "../shared/db.js";
import { Battle, heroStats, rollEncounter, xpToNext } from "../shared/engine.js";
import { CULTURES, ENEMY_ART, FORMAT, SKILL_KINDS, STATUS_KINDS, TARGETS, TERRAINS, UI_ATB_MODES, UI_BACKDROPS, UI_LAYOUTS, UI_STATUS, UI_TIMING } from "../shared/types.js";
import { bestiaryRaster, EXPORT_PRESETS, exportBattle } from "../lib/export.js";
import { encodePng } from "../lib/png.js";
import { renderBattlePng } from "../lib/render.js";
import { checkWorkspace, loadDb, loadDbStrict, readDoc, resolveWorkspace, saveDoc, workspaceSummary } from "../lib/workspace.js";
import { isEntry, mcpErr as err, mcpMsg as msg, mcpText as text, parseMcpArgs, startHttp } from "./http.js";

export const MCP_TOOL_NAMES = ["workspace_info", "list_entries", "get_entry", "write_battles", "check_battles", "simulate_battle", "roll_encounter", "render_battle", "export_battle"] as const;

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a-z, 0-9, _ or -");

export const FORMAT_CHEATSHEET = `Document battles/<id>.easybattle.json: { format "${FORMAT}", id?, name? {th,en,ms}, rules?, elements?, statuses?, skills?, heroes?, enemies?, encounters?, items? } — all documents merge (ids unique across files).
  element: { id, name, color #rrggbb }
  status:  { id, name, kind ${STATUS_KINDS.join("|")}, amount? (poison/regen % max HP per turn; atk/def/mag/spd multiplier %), turns }
  skill:   { id, name, desc?, kind ${SKILL_KINDS.join("|")}, target ${TARGETS.join("|")}, power? (10 = plain attack), mp?, element?, accuracy? 0..100, status? {id, chance?}, cures? [status ids], fx? (Easy FX preset), sfx? (Easy SFX sound) }
  hero:    { id, name, role?, base {hp,mp,atk,def,mag,res,spd}, growth {per level, fractions ok}, skills [{level, skill}], weak?, resist?, sprite? (Easy Sprite side-view sheet id), portrait?, color? }
  enemy:   { id, name, level, stats {hp,mp,atk,def,mag,res,spd}, skills [{skill, weight}], weak?, resist?, immune?, xp, coins, drops? [{item (Easy Items id), chance %, n?}], loot? (Easy Items loot table), art ${ENEMY_ART.join("|")}, palette? [3 colours], boss? }
  encounter: { id, name?, regions? (Easy Tilemap overworld region ids), cultures? ${CULTURES.join("|")}, terrains [${TERRAINS.join("|")}], rate (avg steps), groups [{enemies [≤5 ids], weight, levelBonus?}], music?, background?, scripted? (bosses) }
  item:    { item (Easy Items id), hp?, mp?, cures?, target? ally|all_allies }
  rules:   { maxLevel, partySize, xp {base, step, quad}: next(L) = base + step·(L−1) + quad·(L−1)², crit %, flee %, enemyScale %/level, terrainCodes {overworld ground code: terrain} }
  ui:      { layout? ${UI_LAYOUTS.join("|")} (backview = 16-bit back view: blue message window, enemies on a backdrop, party from behind with HP arcs), status? ${UI_STATUS.join("|")} (cards = Easy Portrait face, Lv, LIFE/POW bars, READY!/WAIT...; backview defaults to cards), backdrop? ${UI_BACKDROPS.join("|")}, timing? ${UI_TIMING.join("|")} (atb = active time battle: gauges fill by SPD, READY! opens the menu, WAIT... cards show a filling time bar, enemies act when full), atbMode? ${UI_ATB_MODES.join("|")} (wait = time stops in menus) } — battle screen; classic + rows + turn is the default
Damage: physical = atk·power/10 − def/2, magic = mag·power/10 − res/2; ×0.9–1.1; crit ×1.5; weak ×1.5; resist ×0.5; defend ×0.5; immune 0.
Table pick: region id > culture > fallback. Content rules: no sacred figures, scripture or Arabic calligraphy as battle content; martial arts, herbs, firecrackers, kites and animals are fine; keep the cast multicultural.`;

export function createEasyBattleMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easybattle", version: "0.1.0" });

  server.registerTool("workspace_info", { title: "Workspace info", description: "Summarize the Easy Battle workspace: documents, rules, elements, statuses, heroes, enemies, skills, encounter tables and the document format. Call this first.", inputSchema: {} }, async () => text({ name: "easybattle", ...(await workspaceSummary(root)), format: FORMAT_CHEATSHEET }));

  server.registerTool(
    "list_entries",
    { title: "List entries", description: "List heroes, enemies, skills, statuses or encounters with their key numbers.", inputSchema: { kind: z.enum(["heroes", "enemies", "skills", "statuses", "encounters"]) } },
    async ({ kind }) => {
      const s = await workspaceSummary(root);
      return text({ [kind]: (s as unknown as Record<string, unknown>)[kind] });
    },
  );

  server.registerTool(
    "get_entry",
    { title: "Get entry", description: "One hero (with stats at levels 1/5/10/20 and XP to next), enemy, skill, status or encounter table in full, and the document it comes from.", inputSchema: { id: IdSchema } },
    async ({ id }) => {
      const { db } = await loadDb(root);
      const h = db.heroes.find((x) => x.id === id);
      if (h) return text({ ...h, source: db.sources[`heroes:${id}`], levels: [1, 5, 10, 20].map((lv) => ({ level: lv, stats: heroStats(h, lv), next: xpToNext(db, lv) })) });
      for (const k of ["enemies", "skills", "statuses", "encounters"] as const) {
        const e = (db[k] as Array<{ id: string }>).find((x) => x.id === id);
        if (e) return text({ kind: k, ...e, source: db.sources[`${k}:${id}`] });
      }
      return err(`Nothing called "${id}"`);
    },
  );

  server.registerTool(
    "write_battles",
    { title: "Write battle document", description: `Create or replace battles/<id>.easybattle.json (whole document). Validates against the merged workspace first and refuses on errors. dryRun only validates. mode "read" returns the current file.\n${FORMAT_CHEATSHEET}`, inputSchema: { id: IdSchema, doc: z.record(z.string(), z.unknown()).optional(), mode: z.enum(["write", "read"]).optional(), dryRun: z.boolean().optional() } },
    async ({ id, doc, mode, dryRun }) => {
      try {
        if (mode === "read") return text({ id, doc: (await readDoc(root, id)) ?? null });
        if (!doc) return err("doc is required for mode write");
        const res = await saveDoc(root, id, doc, { dryRun });
        return text({ saved: res.saved, file: res.file, errors: res.errors, warnings: res.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "check_battles",
    { title: "Check battles", description: "Validate the merged database (references, stats, encounter groups, content rules); optionally cross-check drop / battle-item ids with an Easy Items workspace and region ids with an Easy Tilemap overworld map.", inputSchema: { items: z.string().optional().describe("Easy Items workspace"), overworld: z.string().optional().describe("Easy Tilemap overworld map JSON") } },
    async ({ items, overworld }) => {
      try {
        const r = await checkWorkspace(root, { items, overworld });
        return text({ ok: !r.errors.length, errors: r.errors, warnings: r.warnings, cross: r.cross });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "simulate_battle",
    { title: "Simulate battle", description: "Run a deterministic auto-battle: party [{id, level}], enemies [{id, level?}] or an encounter table id, seed. runs > 1 returns the win rate over seeds (balance check). Otherwise returns result, rewards (xp, coins, drops, level-ups) and a compact log.", inputSchema: { party: z.array(z.object({ id: z.string(), level: z.number().int().min(1) })), enemies: z.array(z.object({ id: z.string(), level: z.number().int().optional() })).optional(), table: z.string().optional(), seed: z.number().int().optional(), runs: z.number().int().min(1).max(500).optional(), items: z.record(z.string(), z.number().int()).optional() } },
    async ({ party, enemies, table, seed = 1, runs = 1, items }) => {
      try {
        const db = await loadDbStrict(root);
        const pick = (s: number) => {
          if (enemies?.length) return enemies;
          const t = db.encounters.find((x) => x.id === table);
          if (!t) throw new Error("enemies or a valid table is required");
          return rollEncounter({ ...db, encounters: [{ ...t, scripted: false, regions: [], cultures: [], terrains: ["any"] }] }, {}, s)!.enemies;
        };
        if (runs > 1) {
          const res = Array.from({ length: runs }, (_, k) => {
            const b = new Battle(db, { party, enemies: pick(seed + k), seed: seed + k, items });
            b.autoRun();
            return { result: b.over, rounds: b.round };
          });
          const wins = res.filter((r) => r.result === "win").length;
          return text({ runs, wins, winRate: wins / runs, avgRounds: res.reduce((s, r) => s + r.rounds, 0) / runs });
        }
        const b = new Battle(db, { party, enemies: pick(seed), seed, items });
        b.autoRun();
        const log = b.log.filter((e) => e.t !== "turn").slice(0, 200);
        return text({ result: b.over, rounds: b.round, rewards: b.rewards(), snapshot: b.snapshot(), log });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "roll_encounter",
    { title: "Roll encounter", description: "Which table and enemy group a place gives: region (overworld region id), culture, terrain; seed and times.", inputSchema: { region: z.string().optional(), culture: z.string().optional(), terrain: z.enum(TERRAINS).optional(), seed: z.number().int().optional(), times: z.number().int().min(1).max(50).optional() } },
    async ({ region, culture, terrain, seed = 1, times = 5 }) => {
      try {
        const db = await loadDbStrict(root);
        return text({ rolls: Array.from({ length: times }, (_, k) => ({ seed: seed + k, ...rollEncounter(db, { region, culture, terrain }, seed + k) })) });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "render_battle",
    { title: "Render battle", description: "PNG image: what bestiary (every enemy) or battle (a battle frame after n auto turns: party, enemies, seed). layout classic|backview and status rows|cards|none preview the battle screen (default: the workspace ui setting). Returns the image inline.", inputSchema: { what: z.enum(["bestiary", "battle"]).optional(), party: z.array(z.object({ id: z.string(), level: z.number().int() })).optional(), enemies: z.array(z.string()).optional(), seed: z.number().int().optional(), turns: z.number().int().min(0).max(50).optional(), scale: z.number().int().min(1).max(4).optional(), layout: z.enum(UI_LAYOUTS).optional(), status: z.enum(UI_STATUS).optional(), backdrop: z.enum(UI_BACKDROPS).optional() } },
    async ({ what = "battle", party, enemies, seed = 1, turns = 3, scale = 2, layout, status, backdrop }) => {
      try {
        const db = await loadDbStrict(root);
        let png: Buffer;
        if (what === "bestiary") {
          const r = bestiaryRaster(db).scaled(scale);
          png = encodePng(r.width, r.height, r.data);
        } else {
          const b = new Battle(db, { party: party ?? db.heroes.slice(0, db.rules.partySize).map((h) => ({ id: h.id, level: 4 })), enemies: (enemies ?? db.enemies.filter((e) => !e.boss).slice(0, 3).map((e) => e.id)).map((id) => ({ id })), seed });
          for (let k = 0; k < turns && !b.over; k++) b.act(b.auto());
          png = await renderBattlePng(root, db, b, scale, { layout, status, backdrop });
        }
        return { content: [{ type: "image" as const, data: png.toString("base64"), mimeType: "image/png" }, { type: "text" as const, text: `${what} ${png.length} bytes` }] };
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "export_battle",
    { title: "Export battle", description: "Export: godot (Godot 4.3+ project: Battle autoload, EasyBattleEngine, battle_scene.tscn, enemy strips, Easy Sprite hero sheets, Easy FX / SFX assets, test_battle.gd), pixi (easybattle.json + core + Pixi UI + demo), png (bestiary + enemy strips), json, or all. Both runtimes include the classic and backview layouts, status cards, back-view sheets, Easy Portrait busts and backdrops; font (default true) bundles the มะขาม pixel fonts from Easy Font.", inputSchema: { preset: z.enum(EXPORT_PRESETS).optional(), out: z.string().optional().describe("Workspace-relative output folder (single preset)"), bundle: z.boolean().optional(), font: z.boolean().optional() } },
    async ({ preset, out, bundle, font }) => {
      try {
        const res = await exportBattle(root, { preset, out, bundle, font });
        return text({ dirs: res.dirs.map((d) => path.relative(root, d) || d), files: res.files.length, fx: res.fx, sfx: res.sfx, fonts: res.fonts, warnings: res.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  return server;
}

async function startMcp(opts: ReturnType<typeof parseMcpArgs>) {
  const workspace = resolveWorkspace(opts.workspace);
  if (opts.http) return startHttp(() => createEasyBattleMcp(workspace), workspace, opts.host, opts.port);
  await createEasyBattleMcp(workspace).connect(new StdioServerTransport());
}

if (isEntry() >= 0) await startMcp(parseMcpArgs(process.argv.slice(isEntry() + 1), 8939));
