#!/usr/bin/env node
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Command } from "commander";
import open from "open";
import { createApp } from "./server/app.js";
import { defaultWebRoot } from "./server/base.js";
import { resolveToken } from "./shared/requestGuard.js";
import { Battle, heroStats, rollEncounter, xpToNext, type BattleEvent } from "./shared/engine.js";
import { ENEMY_ART, FORMAT, TERRAINS, type BattleDoc, type Terrain } from "./shared/types.js";
import { bestiaryRaster, EXPORT_PRESETS, exportBattle, type ExportPreset } from "./lib/export.js";
import { encodePng } from "./lib/png.js";
import { renderBattlePng } from "./lib/render.js";
import { assertSafeId, checkWorkspace, initWorkspace, loadDb, loadDbStrict, overworldRegions, readDoc, resolveWorkspace, saveDoc, workspaceSummary } from "./lib/workspace.js";

const program = new Command();

function workspaceOf(cli?: string): string {
  const v = cli?.trim() || process.env.EASYBATTLE_WORKSPACE?.trim() || process.env.EASYBATTLE_HOME?.trim() || process.cwd();
  return resolveWorkspace(v);
}
const fail = (e: unknown) => {
  console.error(`error: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
};
const nm = (n: { th: string; en: string; ms?: string }, lang = "th") => (n as Record<string, string>)[lang] || n.th;

program.name("easybattle").description("Turn-based JRPG battles (heroes, enemies, skills, elements, statuses, encounter tables per overworld region) → Godot battle scene + autoload, PixiJS runtime").version("0.1.0");

program
  .command("init")
  .description("Create battles/ exports/ with the sample battle system (4 heroes, 17 enemies, 27 skills, 10 encounter tables)")
  .option("--force", "Overwrite samples and config")
  .option("--workspace <path>")
  .action(async (o: { force?: boolean; workspace?: string }) => {
    const root = await initWorkspace(workspaceOf(o.workspace), { force: o.force });
    const { db } = await loadDb(root);
    console.log(`Initialized Easy Battle workspace at ${root}`);
    console.log(`  battles/  *.easybattle.json — ${db.heroes.length} heroes, ${db.enemies.length} enemies, ${db.skills.length} skills, ${db.statuses.length} statuses, ${db.encounters.length} encounter tables`);
    console.log("  exports/  Godot / PixiJS / PNG / JSON");
  });

program
  .command("info")
  .description("Workspace summary")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { workspace?: string; json?: boolean }) => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    if (o.json) return console.log(JSON.stringify(s, null, 2));
    console.log(`Easy Battle workspace ${s.root}`);
    console.log(`  docs: ${s.docs.join(", ") || "(none)"} · ${s.heroes.length} heroes · ${s.enemies.length} enemies · ${s.skills.length} skills · ${s.statuses.length} statuses · ${s.encounters.length} tables`);
    console.log(`  elements: ${s.elements.map((e) => e.id).join(", ")} · max level ${s.rules.maxLevel} · party ${s.rules.partySize} · crit ${s.rules.crit}% · flee ${s.rules.flee}%`);
    console.log(`  export: ${EXPORT_PRESETS.join(", ")}${s.errors.length ? ` · ${s.errors.length} ERRORS (run check)` : ""}`);
  });

program
  .command("list")
  .description("List heroes | enemies | skills | statuses | encounters")
  .argument("[kind]", "heroes | enemies | skills | statuses | encounters", "enemies")
  .option("--workspace <path>")
  .option("--json")
  .action(async (kind: string, o: { workspace?: string; json?: boolean }) => {
    const s = await workspaceSummary(workspaceOf(o.workspace));
    const rows = (s as unknown as Record<string, Array<Record<string, unknown>>>)[kind];
    if (!rows) return fail(`unknown kind ${kind}`);
    if (o.json) return console.log(JSON.stringify({ [kind]: rows }, null, 2));
    for (const r of rows) console.log(Object.entries(r).map(([k, v]) => (k === "id" ? String(v).padEnd(20) : `${k}=${Array.isArray(v) ? v.join("/") : v}`)).join("  "));
  });

program
  .command("show <id>")
  .description("One hero, enemy, skill or encounter table in full (heroes: stats per level)")
  .option("--workspace <path>")
  .action(async (id: string, o: { workspace?: string }) => {
    const { db } = await loadDb(workspaceOf(o.workspace));
    const h = db.heroes.find((x) => x.id === id);
    if (h) return console.log(JSON.stringify({ ...h, source: db.sources[`heroes:${id}`], levels: [1, 5, 10, 20, db.rules.maxLevel].map((level) => ({ level, stats: heroStats(h, level), next: xpToNext(db, level) })) }, null, 2));
    for (const k of ["enemies", "skills", "encounters", "statuses"] as const) {
      const e = (db[k] as Array<{ id: string }>).find((x) => x.id === id);
      if (e) return console.log(JSON.stringify({ ...e, kind: k, source: db.sources[`${k}:${id}`] }, null, 2));
    }
    fail(`nothing called "${id}"`);
  });

program
  .command("check")
  .description("Validate the merged database; cross-check item ids against Easy Items and regions against an Easy Tilemap overworld. Exit 1 on errors")
  .option("--items <workspace>", "Easy Items workspace (default: config.items)")
  .option("--overworld <map.json>", "Easy Tilemap overworld map (default: config.overworld)")
  .option("--strict", "Fail on warnings too")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { items?: string; overworld?: string; strict?: boolean; workspace?: string; json?: boolean }) => {
    try {
      const r = await checkWorkspace(workspaceOf(o.workspace), { items: o.items, overworld: o.overworld });
      if (o.json) console.log(JSON.stringify({ ok: !r.errors.length, errors: r.errors, warnings: r.warnings, cross: r.cross }, null, 2));
      else {
        for (const e of r.errors) console.log(`ERROR   ${e.path}: ${e.message}`);
        for (const w of r.warnings) console.log(`warning ${w.path}: ${w.message}`);
        if (r.cross.items.workspace) console.log(`Easy Items: ${r.cross.items.matched.length} of ${r.cross.items.matched.length + r.cross.items.missing.length} item ids found`);
        if (r.cross.regions.map) console.log(`Overworld: ${r.cross.regions.uncovered.length} uncovered regions, ${r.cross.regions.missing.length} unknown region ids`);
        console.log(r.errors.length ? `${r.errors.length} error(s)` : `ok · ${r.db.heroes.length} heroes, ${r.db.enemies.length} enemies, ${r.db.skills.length} skills, ${r.db.encounters.length} tables`);
      }
      if (r.errors.length || (o.strict && r.warnings.length)) process.exit(1);
    } catch (e) {
      fail(e);
    }
  });

function describe(b: Battle, ev: BattleEvent, lang: string): string | null {
  const A = (i: number) => nm(b.actors[i]!.name, lang);
  switch (ev.t) {
    case "round":
      return `── round ${ev.round}`;
    case "act":
      return `${A(ev.actor)} → ${nm(b.skill(ev.skill).name, lang)}${ev.targets.length ? ` @ ${ev.targets.map(A).join(", ")}` : ""}`;
    case "item":
      return `${A(ev.actor)} uses ${ev.item}`;
    case "defend":
      return `${A(ev.actor)} defends`;
    case "skip":
      return `${A(ev.actor)} skips (${ev.status})`;
    case "miss":
      return `   miss ${A(ev.target)}`;
    case "damage":
      return `   ${A(ev.target)} −${ev.amount}${ev.crit ? " CRIT" : ""}${ev.weak ? " weak" : ""}${ev.resist ? " resist" : ""}${ev.immune ? " immune" : ""} → ${b.actors[ev.target]!.hp}`;
    case "heal":
      return `   ${A(ev.target)} +${ev.amount}${ev.mp ? " MP" : ""}`;
    case "status":
      return `   ${A(ev.target)} ${ev.on ? "+" : "−"}${ev.status}`;
    case "tick":
      return `   ${A(ev.target)} ${ev.status} ${ev.amount}`;
    case "down":
      return `   ${A(ev.target)} is down`;
    case "flee":
      return `flee ${ev.ok ? "ok" : "failed"} (${ev.chance}%)`;
    case "nomp":
      return `${A(ev.actor)}: not enough MP for ${ev.skill}`;
    case "end":
      return `== ${ev.result}`;
    default:
      return null;
  }
}

function parseParty(s: string) {
  return s.split(",").map((x) => {
    const [id, lv] = x.split(":");
    return { id: id!.trim(), level: Number(lv ?? 1) };
  });
}

program
  .command("sim")
  .description("Auto-battle: --party ton:5,nurul:5,mei:5 --vs paddy_crab,monkey_thief | --table plains_fields (deterministic per seed)")
  .requiredOption("--party <list>", "hero:level,…")
  .option("--vs <list>", "enemy[:level],…")
  .option("--table <id>", "roll a group from an encounter table")
  .option("--seed <n>", "Seed", "1")
  .option("--runs <n>", "Simulate n seeds and print the win rate", "1")
  .option("--items <list>", "item:n,… usable in battle")
  .option("--lang <l>", "th | en | ms", "en")
  .option("--log", "Print the battle log (single run)")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { party: string; vs?: string; table?: string; seed: string; runs: string; items?: string; lang: string; log?: boolean; workspace?: string; json?: boolean }) => {
    try {
      const db = await loadDbStrict(workspaceOf(o.workspace));
      const party = parseParty(o.party);
      const items = Object.fromEntries((o.items ?? "").split(",").filter(Boolean).map((x) => [x.split(":")[0]!, Number(x.split(":")[1] ?? 1)]));
      const runs = Math.max(1, Number(o.runs));
      const out: Array<{ seed: number; result: string; rounds: number; xp: number; enemies: string[] }> = [];
      let last: Battle | null = null;
      for (let k = 0; k < runs; k++) {
        const seed = Number(o.seed) + k;
        let enemies: Array<{ id: string; level?: number }>;
        if (o.table) {
          const t = db.encounters.find((x) => x.id === o.table);
          if (!t) throw new Error(`no encounter table ${o.table}`);
          const r = rollEncounter({ ...db, encounters: [{ ...t, scripted: false, regions: [], cultures: [], terrains: ["any"] }] }, {}, seed);
          enemies = r!.enemies;
        } else enemies = (o.vs ?? "").split(",").filter(Boolean).map((x) => ({ id: x.split(":")[0]!, level: x.includes(":") ? Number(x.split(":")[1]) : undefined }));
        if (!enemies.length) throw new Error("--vs or --table is required");
        const b = new Battle(db, { party, enemies, seed, items });
        b.autoRun();
        out.push({ seed, result: b.over ?? "timeout", rounds: b.round, xp: b.rewards().xp, enemies: enemies.map((e) => e.id) });
        last = b;
      }
      if (o.json) return console.log(JSON.stringify(runs === 1 ? { ...out[0], log: last!.log, rewards: last!.rewards(), snapshot: last!.snapshot() } : { runs: out, winRate: out.filter((r) => r.result === "win").length / runs }, null, 2));
      if (runs === 1) {
        const b = last!;
        if (o.log) for (const ev of b.log) {
          const s = describe(b, ev, o.lang);
          if (s) console.log(s);
        }
        const r = b.rewards();
        console.log(`${b.over} in ${b.round} rounds · xp ${r.xp} · coins ${r.coins} · drops ${r.drops.map((d) => `${d.item}×${d.n}`).join(", ") || "-"}`);
        for (const l of r.levels) console.log(`  ${l.id} Lv${l.from} → Lv${l.to}${l.learned.length ? ` learned ${l.learned.join(", ")}` : ""}`);
      } else {
        const wins = out.filter((r) => r.result === "win").length;
        const avg = out.reduce((s, r) => s + r.rounds, 0) / runs;
        console.log(`win rate ${wins}/${runs} (${Math.round((100 * wins) / runs)}%) · avg ${avg.toFixed(1)} rounds`);
      }
    } catch (e) {
      fail(e);
    }
  });

program
  .command("encounter")
  .description("Roll a random encounter for a place: --region <overworld region id> --culture thai|malay|chinese|rural|city --terrain grass|forest|…")
  .option("--region <id>")
  .option("--culture <c>")
  .option("--terrain <t>", TERRAINS.join(" | "))
  .option("--seed <n>", "Seed", "1")
  .option("--times <n>", "Rolls", "1")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { region?: string; culture?: string; terrain?: string; seed: string; times: string; workspace?: string; json?: boolean }) => {
    try {
      const db = await loadDbStrict(workspaceOf(o.workspace));
      const rolls = Array.from({ length: Math.max(1, Number(o.times)) }, (_, k) => ({ seed: Number(o.seed) + k, ...rollEncounter(db, { region: o.region, culture: o.culture, terrain: o.terrain as Terrain | undefined }, Number(o.seed) + k) }));
      if (o.json) return console.log(JSON.stringify({ rolls }, null, 2));
      for (const r of rolls) console.log(r.table ? `seed ${r.seed}: ${r.table} (1 in ${r.rate} steps) → ${r.enemies!.map((e) => `${e.id} Lv${e.level}`).join(", ")}` : `seed ${r.seed}: no table matches`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("xp")
  .description("XP table: XP to next level for every level")
  .option("--workspace <path>")
  .action(async (o: { workspace?: string }) => {
    const { db } = await loadDb(workspaceOf(o.workspace));
    let total = 0;
    for (let l = 1; l < db.rules.maxLevel; l++) {
      total += xpToNext(db, l);
      console.log(`Lv${String(l).padStart(2)} → ${String(l + 1).padStart(2)}  ${String(xpToNext(db, l)).padStart(6)}  total ${total}`);
    }
  });

program
  .command("bind-overworld <map>")
  .description("Read an Easy Tilemap overworld map and write battles/regions.easybattle.json: one table per region, cloned from the culture's tables, harder further from the first region")
  .option("--step <n>", "Levels added per region index", "1")
  .option("--workspace <path>")
  .action(async (map: string, o: { step: string; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const { db } = await loadDb(root);
      const regions = await overworldRegions(path.resolve(map));
      const encounters: NonNullable<BattleDoc["encounters"]> = [];
      regions.forEach((reg, k) => {
        for (const t of db.encounters.filter((x) => !x.scripted && x.cultures?.includes(reg.culture))) {
          encounters.push({ ...t, id: `${reg.id}_${t.id}`.slice(0, 60), name: reg.name ? { th: `${reg.name.th} · ${t.name?.th ?? t.id}`, en: `${reg.name.en} · ${t.name?.en ?? t.id}`, ms: reg.name.ms } : t.name, regions: [reg.id], cultures: undefined, groups: t.groups.map((g) => ({ ...g, levelBonus: (g.levelBonus ?? 0) + k * Number(o.step) })) });
        }
      });
      const doc: BattleDoc = { format: FORMAT, id: "regions", name: { th: "ตารางพบศัตรูตามภูมิภาค", en: "Encounters per overworld region", ms: "Pertemuan ikut wilayah" }, encounters: JSON.parse(JSON.stringify(encounters)) };
      const res = await saveDoc(root, "regions", doc);
      if (!res.saved) throw new Error(res.errors.map((e) => `${e.path}: ${e.message}`).join("\n"));
      console.log(`wrote ${res.file}: ${encounters.length} tables for ${regions.length} regions (${regions.map((r) => `${r.id}/${r.culture}`).join(", ")})`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("render")
  .description("PNG: --what bestiary (enemy sheet) | battle (a battle frame: --party, --vs, --seed, --turns)")
  .option("--what <w>", "bestiary | battle", "battle")
  .requiredOption("--out <png>")
  .option("--party <list>", "hero:level,…", "")
  .option("--vs <list>", "enemy,…", "")
  .option("--seed <n>", "Seed", "1")
  .option("--turns <n>", "Auto turns before the frame", "3")
  .option("--scale <n>", "Upscale", "2")
  .option("--workspace <path>")
  .action(async (o: { what: string; out: string; party: string; vs: string; seed: string; turns: string; scale: string; workspace?: string }) => {
    try {
      const root = workspaceOf(o.workspace);
      const db = await loadDbStrict(root);
      const out = path.resolve(o.out);
      await mkdir(path.dirname(out), { recursive: true });
      if (o.what === "bestiary") {
        const r = bestiaryRaster(db).scaled(Math.max(1, Number(o.scale)));
        await writeFile(out, encodePng(r.width, r.height, r.data));
      } else {
        const party = o.party ? parseParty(o.party) : db.heroes.slice(0, db.rules.partySize).map((h) => ({ id: h.id, level: 4 }));
        const enemies = (o.vs ? o.vs.split(",") : db.enemies.filter((e) => !e.boss).slice(0, 3).map((e) => e.id)).map((id) => ({ id }));
        const b = new Battle(db, { party, enemies, seed: Number(o.seed) });
        for (let k = 0; k < Number(o.turns) && !b.over; k++) b.act(b.auto());
        await writeFile(out, await renderBattlePng(root, db, b, Math.max(1, Number(o.scale))));
      }
      console.log(`wrote ${out}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("export")
  .description("Export: godot | pixi | png | json | all")
  .option("--preset <p>", EXPORT_PRESETS.join(" | "), "all")
  .option("--out <dir>", "Output folder (single preset)")
  .option("--no-bundle", "Do not render Easy FX / Easy SFX assets into the export")
  .option("--no-font", "Do not bundle the มะขาม pixel fonts from Easy Font (battle text falls back to Kanit)")
  .option("--workspace <path>")
  .option("--json")
  .action(async (o: { preset: ExportPreset; out?: string; bundle: boolean; font: boolean; workspace?: string; json?: boolean }) => {
    try {
      const res = await exportBattle(workspaceOf(o.workspace), { preset: o.preset, out: o.out, bundle: o.bundle, font: o.font, trustedPaths: true });
      if (o.json) return console.log(JSON.stringify({ ...res, files: res.files.length }, null, 2));
      for (const d of res.dirs) console.log(`exported ${d}`);
      console.log(`  ${res.files.length} files · ${res.heroes} heroes · ${res.enemies} enemies · fx ${res.fx.length} · sfx ${res.sfx.length}`);
      for (const w of res.warnings) console.log(`  warning: ${w}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("new-enemy <id>")
  .description("Add an enemy to battles/<doc>.easybattle.json: --art crab --th … --en … --level 3 --hp 40 --atk 10 …")
  .requiredOption("--th <name>")
  .requiredOption("--en <name>")
  .option("--ms <name>")
  .option("--art <art>", ENEMY_ART.join(" | "), "mud")
  .option("--level <n>", "Level", "1")
  .option("--hp <n>", "HP", "30")
  .option("--atk <n>", "ATK", "10")
  .option("--def <n>", "DEF", "6")
  .option("--mag <n>", "MAG", "4")
  .option("--res <n>", "RES", "5")
  .option("--spd <n>", "SPD", "8")
  .option("--skills <list>", "skill:weight,…", "attack:1")
  .option("--xp <n>", "XP", "8")
  .option("--coins <n>", "Coins", "5")
  .option("--doc <id>", "Document", "game")
  .option("--workspace <path>")
  .action(async (id: string, o: Record<string, string>) => {
    try {
      const root = workspaceOf(o.workspace);
      assertSafeId(id);
      const doc = (await readDoc(root, o.doc!)) ?? { format: FORMAT, id: o.doc };
      doc.enemies = [...(doc.enemies ?? []).filter((e) => e.id !== id), { id, name: { th: o.th!, en: o.en!, ...(o.ms ? { ms: o.ms } : {}) }, level: Number(o.level), stats: { hp: Number(o.hp), mp: 10, atk: Number(o.atk), def: Number(o.def), mag: Number(o.mag), res: Number(o.res), spd: Number(o.spd) }, skills: o.skills!.split(",").map((x) => ({ skill: x.split(":")[0]!, weight: Number(x.split(":")[1] ?? 1) })), xp: Number(o.xp), coins: Number(o.coins), art: o.art as never }];
      const res = await saveDoc(root, o.doc!, doc);
      for (const e of res.errors) console.log(`ERROR ${e.path}: ${e.message}`);
      if (!res.saved) process.exit(1);
      console.log(`saved ${res.file}`);
    } catch (e) {
      fail(e);
    }
  });

program
  .command("serve")
  .description("Web editor + API (default http://127.0.0.1:8938)")
  .option("--port <n>", "Port", "8938")
  .option("--host <h>", "Host", "127.0.0.1")
  .option("--dev", "API only (use the Vite UI on :5193)")
  .option("--no-open")
  .option("--workspace <path>")
  .action(async (o: { port: string; host: string; dev?: boolean; open: boolean; workspace?: string }) => {
    const root = workspaceOf(o.workspace);
    const token = resolveToken(o.host);
    const app = createApp({ workspaceRoot: root, webRoot: defaultWebRoot(), dev: o.dev, host: o.host, token });
    serve({ fetch: app.fetch, port: Number(o.port), hostname: o.host });
    const url = `http://${o.host === "0.0.0.0" ? "127.0.0.1" : o.host}:${o.port}/${token ? `?token=${token}` : ""}`;
    console.log(`Easy Battle ${o.dev ? "API" : "editor"} on http://${o.host}:${o.port} · workspace ${root}`);
    if (token) console.log(`Token (needed off loopback): ${token}`);
    if (o.open && !o.dev && process.stdout.isTTY) await open(url).catch(() => {});
  });

program.parseAsync().catch(fail);
