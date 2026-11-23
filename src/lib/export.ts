import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { canon } from "../shared/canon.js";
import { Battle, groupSeed, PARITY_SETUP, rollGroup, type Action, type BattleSetup } from "../shared/engine.js";
import { mulberry32 } from "../shared/rng.js";
import { EXPORT_PRESETS, type BattleDb, type ExportPreset } from "../shared/types.js";
import { exportLayouts, HERO_FRAMES, PORTRAIT_CROP, resolveUi, SHEET_ROW, UI_TEXT } from "../shared/layout.js";
import { drawEnemy, enemyStrip } from "./art.js";
import { BACKDROPS, drawBackdrop } from "./backdrop.js";
import { FONT_DIR, pkgRoot, resolveInside, RUNTIME_DIR, Writer } from "./fsx.js";
import { encodePng } from "./png.js";
import { Raster } from "./raster.js";
import { runSibling, siblingCli } from "./siblings.js";
import { dirs, easyItemNames, loadDbStrict } from "./workspace.js";

export { EXPORT_PRESETS, type ExportPreset };
export const VERSION = "0.1.0";

export interface ExportOptions {
  preset?: ExportPreset;
  out?: string;
  /** Render the Easy FX effects and Easy SFX sounds skills use into fx/ and sfx/ (default: when the tools are installed). */
  bundle?: boolean;
  /** Bundle the มะขาม 16 / มะขาม 8 pixel fonts from Easy Font (default: when the tool is installed; else Kanit). */
  font?: boolean;
  trustedPaths?: boolean;
}

export interface ExportResult {
  dirs: string[];
  files: string[];
  heroes: number;
  enemies: number;
  fx: string[];
  sfx: string[];
  /** Easy Font fonts bundled (empty: Kanit fallback). */
  fonts: string[];
  warnings: string[];
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (const b of Buffer.from(s, "utf8")) {
    h ^= b;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Scripted parity cases replayed by test_battle.gd. Actions: null = engine.auto(). */
type ParityStep = Action | null | { wait: number; menu?: boolean } | { ready: true };

export function parityCases(db: BattleDb) {
  const heroes = db.heroes.map((h) => h.id);
  // actions: an Action, null (= auto), or for ATB {wait: steps, menu?} (advance time) / {ready: true} (the ready actor acts on auto)
  const cases: Array<{ name: string; setup: BattleSetup; actions: Array<ParityStep> }> = [];
  if (["ton", "nurul", "mei"].every((h) => heroes.includes(h)) && ["paddy_crab", "giant_mosquito", "monkey_thief"].every((e) => db.enemies.some((x) => x.id === e))) {
    cases.push({ name: "auto_village", setup: PARITY_SETUP, actions: [] });
    cases.push({ name: "scripted_mix", setup: { ...PARITY_SETUP, seed: 77 }, actions: [{ kind: "skill", skill: "teep", target: 4 }, { kind: "item", item: "balm", target: 0 }, null, { kind: "defend" }, null, null, { kind: "skill", skill: "firecracker" }, null, null, null] });
  }
  if (heroes.length && db.enemies.length >= 2) {
    const party = heroes.slice(0, Math.min(3, db.rules.partySize)).map((id) => ({ id, level: 3 }));
    const enemies = db.enemies.filter((e) => !e.boss).slice(0, 3).map((e) => ({ id: e.id }));
    const steps: ParityStep[] = [{ wait: 25 }, { ready: true }, { wait: 40, menu: true }, { ready: true }, null, { wait: 7 }, { ready: true }, { ready: true }, null];
    cases.push({ name: "atb_wait", setup: { party, enemies, seed: 31, items: {}, timing: "atb", atbMode: "wait" }, actions: steps });
    cases.push({ name: "atb_active", setup: { party, enemies, seed: 32, items: {}, timing: "atb", atbMode: "active" }, actions: steps });
  }
  const boss = db.enemies.find((e) => e.boss);
  if (boss && heroes.length >= 3) cases.push({ name: "boss", setup: { party: heroes.slice(0, 3).map((id) => ({ id, level: boss.level + 1 })), enemies: [{ id: boss.id }], seed: 4242, items: Object.fromEntries(db.items.slice(0, 2).map((i) => [i.item, 2])) }, actions: [] });
  const e0 = db.enemies.filter((e) => !e.boss).slice(0, 3);
  if (heroes.length && e0.length) cases.push({ name: "generic", setup: { party: heroes.slice(0, db.rules.partySize).map((id) => ({ id, level: 2 })), enemies: e0.map((e) => ({ id: e.id })), seed: 9, items: {} }, actions: [] });
  return cases.map((c) => {
    const b = new Battle(db, c.setup);
    for (const a of c.actions) {
      if (b.over) break;
      if (a && "wait" in a) b.advance(a.wait, !!a.menu);
      else if (a && "ready" in a) {
        const r = b.readyActor();
        if (r >= 0) b.act(b.auto(r), r);
      } else b.act(a ?? b.auto());
    }
    b.autoRun();
    return { ...c, snapshot: canon(b.snapshot()), log: fnv1a(canon(b.log)), rewards: canon(b.rewards()) };
  });
}

/** Group rolls per table for seeds 1..6 (test_battle.gd compares Battle.encounter_setup with these). */
export function encounterParity(db: BattleDb) {
  return db.encounters.map((t) => ({ table: t.id, rolls: [1, 2, 3, 4, 5, 6].map((seed) => rollGroup(t, mulberry32(groupSeed(seed))).enemies.join("+")) }));
}

function usedFx(db: BattleDb): string[] {
  const s = new Set<string>(["hit_sparks", "heal_plus", "level_up"]);
  for (const k of db.skills) if (k.fx) s.add(k.fx);
  return [...s].sort();
}

function usedSfx(db: BattleDb): string[] {
  const s = new Set<string>(["hit", "hurt", "powerup", "coin", "select"]);
  for (const k of db.skills) if (k.sfx) s.add(k.sfx);
  return [...s].sort();
}

/** Render Easy FX strips + Easy SFX WAVs with the sibling CLIs. */
async function bundleAssets(w: Writer, db: BattleDb, res: ExportResult, sub = "") {
  const fxCli = siblingCli("easyfx");
  const sfxCli = siblingCli("easysfx");
  if (!fxCli) res.warnings.push("Easy FX not found: skills play without particle effects (set EASYBATTLE_EASYFX_CLI)");
  if (!sfxCli) res.warnings.push("Easy SFX not found: battles are silent (set EASYBATTLE_EASYSFX_CLI)");
  const tmp = await mkdtemp(path.join(os.tmpdir(), "easybattle-bundle-"));
  try {
    if (fxCli) {
      for (const id of usedFx(db)) {
        const png = path.join(tmp, `${id}.png`);
        try {
          const { stdout } = await runSibling(fxCli, ["render", id, "--out", png]);
          const m = /(\d+)×(\d+)\s*·\s*(\d+) frames\s*·\s*(\d+) fps/.exec(stdout);
          if (!m || !existsSync(png)) throw new Error(stdout.trim().split("\n").pop());
          const fw = Number(m[1]);
          const frames = Number(m[3]);
          await w.write(`${sub}fx/${id}.png`, await readFile(png));
          await w.write(`${sub}fx/${id}.json`, `${JSON.stringify({ id, w: fw / frames, h: Number(m[2]), frames, fps: Number(m[4]), source: "easyfx" })}\n`);
          res.fx.push(id);
        } catch (e) {
          res.warnings.push(`easyfx ${id}: ${(e as Error).message}`);
        }
      }
    }
    if (sfxCli) {
      for (const id of usedSfx(db)) {
        const wav = path.join(tmp, `${id}.wav`);
        try {
          await runSibling(sfxCli, ["render", id, "--out", wav]);
          await w.write(`${sub}sfx/${id}.wav`, await readFile(wav));
          res.sfx.push(id);
        } catch (e) {
          res.warnings.push(`easysfx ${id}: ${(e as Error).message.split("\n")[0]}`);
        }
      }
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function heroSheet(root: string, id: string): Promise<Buffer | null> {
  for (const p of [path.join(root, "sprites", `${id}.png`), path.join(pkgRoot, "assets", "heroes", `${id}.png`)]) if (existsSync(p)) return readFile(p);
  return null;
}

async function portraitStrip(root: string, id: string): Promise<Buffer | null> {
  for (const p of [path.join(root, "portraits", `${id}.png`), path.join(pkgRoot, "assets", "portraits", `${id}.png`)]) if (existsSync(p)) return readFile(p);
  return null;
}

/** Sheet ids per hero: side view, back view (Easy Sprite top-down sheet) and portrait strip. */
export function heroArt(h: { id: string; sprite?: string; back?: string; portrait?: string }) {
  return { side: h.sprite ?? h.id, back: h.back ?? `${h.id}_back`, portrait: h.portrait ?? h.id };
}

/** Battle screen data shared by both runtimes (layout rectangles, labels, frames). */
function uiData(db: BattleDb, fonts: string[]) {
  return { ...resolveUi(db.ui), fonts, layouts: exportLayouts(), text: UI_TEXT, portraitCrop: PORTRAIT_CROP, sheetRow: SHEET_ROW, heroFrames: HERO_FRAMES, backdrops: BACKDROPS.map((b) => `backdrops/backview_${b}.png`) };
}

/** Copy มะขาม 16 / มะขาม 8 from an Easy Font export (sibling CLI). Returns the font ids bundled. */
async function bundleFont(w: Writer, res: ExportResult, engine: "godot" | "pixi"): Promise<string[]> {
  const cli = siblingCli("easyfont");
  if (!cli) {
    res.warnings.push("Easy Font not found: battle text uses Kanit instead of the มะขาม pixel fonts (set EASYBATTLE_EASYFONT_CLI)");
    return [];
  }
  const want = ["makham-16", "makham-8"];
  const tmp = await mkdtemp(path.join(os.tmpdir(), "easybattle-font-"));
  try {
    await runSibling(cli, ["init", `--workspace=${tmp}`]);
    await runSibling(cli, ["export", "--preset", engine, `--workspace=${tmp}`]);
    const src = path.join(tmp, "exports", `easyfont-${engine}`);
    const fontDir = engine === "godot" ? path.join(src, "easyfont") : path.join(src, "fonts");
    const manifest = JSON.parse(await readFile(path.join(fontDir, "fonts.json"), "utf8")) as { default?: string; fonts: Array<{ id: string; fnt: string; png: string }> };
    const fonts = manifest.fonts.filter((f) => want.includes(f.id));
    if (fonts.length !== want.length) throw new Error(`Easy Font has ${manifest.fonts.map((f) => f.id).join(", ")}; need ${want.join(", ")}`);
    const dest = engine === "godot" ? "easyfont/" : "font/fonts/";
    await w.write(`${dest}fonts.json`, `${JSON.stringify({ ...manifest, default: "makham-16", fonts }, null, 2)}
`);
    for (const f of fonts) for (const file of [f.fnt, f.png]) await w.copy(path.join(fontDir, file), `${dest}${file}`);
    await w.copy(path.join(fontDir, "OFL.txt"), `${dest}OFL.txt`);
    if (engine === "godot") for (const f of ["easyfont.gd", "thai_shaper.gd"]) await w.copy(path.join(fontDir, f), `easyfont/${f}`);
    else for (const f of ["easyfont-pixi.js", "easyfont-core.js"]) await w.copy(path.join(src, f), `font/${f}`);
    return want;
  } catch (e) {
    res.warnings.push(`easyfont: ${(e as Error).message.split("\n")[0]}; battle text uses Kanit`);
    return [];
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

async function writeArt(w: Writer, root: string, db: BattleDb, res: ExportResult, sub: string) {
  for (const art of new Set(db.enemies.map((e) => e.art))) {
    const e = db.enemies.find((x) => x.art === art)!;
    const s = enemyStrip(art, e.palette);
    await w.write(`${sub}enemies/${art}.png`, encodePng(s.width, s.height, s.data));
    const f = enemyStrip(art, e.palette, "front");
    await w.write(`${sub}enemies/${art}_front.png`, encodePng(f.width, f.height, f.data));
  }
  for (const h of db.heroes) {
    const art = heroArt(h);
    const png = await heroSheet(root, art.side);
    if (png) await w.write(`${sub}heroes/${art.side}.png`, png);
    else res.warnings.push(`hero ${h.id}: no Easy Sprite side-view sheet (sprites/${art.side}.png); the hero is invisible`);
    const back = await heroSheet(root, art.back);
    if (back) await w.write(`${sub}heroes/${art.back}.png`, back);
    else res.warnings.push(`hero ${h.id}: no Easy Sprite top-down sheet for the backview layout (sprites/${art.back}.png); the side view is used`);
    const face = await portraitStrip(root, art.portrait);
    if (face) await w.write(`${sub}portraits/${art.portrait}.png`, face);
    else res.warnings.push(`hero ${h.id}: no Easy Portrait strip (portraits/${art.portrait}.png); status cards show the hero colour`);
  }
  for (const b of BACKDROPS) {
    const r = drawBackdrop(b);
    await w.write(`${sub}backdrops/backview_${b}.png`, encodePng(r.width, r.height, r.data));
  }
}

export async function exportBattle(root: string, opts: ExportOptions = {}): Promise<ExportResult> {
  const db = await loadDbStrict(root);
  const preset = opts.preset ?? "all";
  if (!EXPORT_PRESETS.includes(preset)) throw new Error(`Unknown preset ${preset} (${EXPORT_PRESETS.join(", ")})`);
  if (preset === "all" && opts.out) throw new Error("--out needs a single preset (godot, pixi, png or json)");
  const presets: ExportPreset[] = preset === "all" ? ["godot", "pixi", "png", "json"] : [preset];
  const res: ExportResult = { dirs: [], files: [], heroes: db.heroes.length, enemies: db.enemies.length, fx: [], sfx: [], fonts: [], warnings: [] };
  for (const p of presets) {
    const out = opts.out ? (opts.trustedPaths ? path.resolve(root, opts.out) : resolveInside(root, opts.out)) : path.join(dirs(root).exports, `easybattle-${p}`);
    const w = new Writer(out);
    res.fx = [];
    res.sfx = [];
    if (p === "json") await w.write("easybattle.db.json", `${JSON.stringify(db, null, 2)}\n`);
    if (p === "png") await exportPng(w, db);
    if (p === "pixi") await exportPixi(w, root, db, res, opts.bundle !== false, opts.font !== false);
    if (p === "godot") await exportGodot(w, root, db, res, opts.bundle !== false, opts.font !== false);
    res.dirs.push(out);
    res.files.push(...w.files);
  }
  return res;
}

export function bestiaryRaster(db: BattleDb, cols = 7): Raster {
  const cell = 84;
  const rows = Math.ceil(db.enemies.length / cols);
  const r = new Raster(cols * cell, rows * 72, "#2a1d13");
  db.enemies.forEach((e, i) => {
    const f = drawEnemy(e.art, e.palette);
    const x = (i % cols) * cell + Math.floor((cell - f.w) / 2);
    const y = Math.floor(i / cols) * 72 + (68 - f.h);
    r.rect((i % cols) * cell + 6, Math.floor(i / cols) * 72 + 62, cell - 12, 3, "#1e150e");
    r.blit(f.frames[0]!, x, y);
  });
  return r;
}

async function exportPng(w: Writer, db: BattleDb) {
  const sheet = bestiaryRaster(db);
  await w.write("bestiary.png", encodePng(sheet.width, sheet.height, sheet.data));
  const big = sheet.scaled(3);
  await w.write("bestiary@3x.png", encodePng(big.width, big.height, big.data));
  for (const e of db.enemies) {
    const s = enemyStrip(e.art, e.palette);
    await w.write(`enemies/${e.id}.png`, encodePng(s.width, s.height, s.data));
  }
  await w.write("easybattle.json", `${JSON.stringify({ format: "easybattle-export/1", version: VERSION, enemies: db.enemies.map((e) => ({ id: e.id, art: e.art, png: `enemies/${e.id}.png`, frames: 3, boss: !!e.boss, name: e.name })) }, null, 2)}\n`);
}

// ---------------------------------------------------------------- PixiJS
async function itemNamesFor(root: string, db: BattleDb) {
  const all = await easyItemNames(root);
  const used = new Set<string>([...db.items.map((i) => i.item), ...db.enemies.flatMap((e) => (e.drops ?? []).map((d) => d.item))]);
  return Object.fromEntries([...used].filter((id) => all[id]).sort().map((id) => [id, all[id]!]));
}

async function exportPixi(w: Writer, root: string, db: BattleDb, res: ExportResult, bundle: boolean, font: boolean) {
  await writeArt(w, root, db, res, "");
  if (bundle) await bundleAssets(w, db, res);
  res.fonts = font ? await bundleFont(w, res, "pixi") : [];
  await w.write("easybattle.json", `${JSON.stringify({ format: "easybattle-export/1", version: VERSION, db, fx: res.fx, sfx: res.sfx, itemNames: await itemNamesFor(root, db), ui: uiData(db, res.fonts) }, null, 2)}\n`);
  await w.copy(path.join(RUNTIME_DIR, "pixi", "easybattle-core.js"), "easybattle-core.js");
  await w.copy(path.join(RUNTIME_DIR, "pixi", "easybattle-pixi.js"), "easybattle-pixi.js");
  for (const f of ["Kanit-Regular.ttf", "OFL.txt"]) await w.copy(path.join(FONT_DIR, f), `fonts/${f}`);
  await w.write("index.html", pixiDemo(db));
  await w.write("README.txt", `Easy Battle ${VERSION} — PixiJS v8 export
Serve this folder over HTTP (fetch needs it):  python3 -m http.server   then open index.html

  easybattle.json       battle database (heroes, enemies, skills, statuses, encounters, rules)
  easybattle-core.js    the battle engine (same code as the CLI; also runs in Node)
  easybattle-pixi.js    loadBattle(PIXI, "easybattle.json") → { start(app, setup, opts), scripted(table, seed), party(level) }
  enemies/<art>.png     enemy strips: idle, idle (bob), hurt — facing left (classic)
  enemies/<art>_front.png  the same facing the camera (back view)
  heroes/<id>.png       Easy Sprite side-view sheets (left row: idle, attack, hurt, KO, cheer)
  heroes/<id>_back.png  Easy Sprite top-down sheets (back row) for the back-view layout
  portraits/<id>.png    Easy Portrait busts for the status cards (neutral, happy, worried, sad)
  backdrops/            back-view battlefields (paddy, forest)
  fx/ sfx/              Easy FX strips and Easy SFX sounds the skills use (when the tools were installed)
  fonts/                Kanit (SIL OFL 1.1) for Thai text
  font/                 มะขาม 16 / 8 pixel fonts + Easy Font's Pixi loader (SIL OFL 1.1), when Easy Font is installed

Layouts: index.html?layout=backview&status=cards (or start(app, setup, { layout, status, backdrop })).
ATB: index.html?timing=atb (&atb=active) or start(app, setup, { timing: "atb", atbMode: "wait" | "active" }).
`);
}

function pixiDemo(db: BattleDb): string {
  const tables = db.encounters.map((t) => `<button data-table="${t.id}">${t.scripted ? "★ " : ""}${t.name?.th ?? t.id}</button>`).join("\n      ");
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>Easy Battle · PixiJS demo</title>
  <style>
    @font-face { font-family: Kanit; src: url(fonts/Kanit-Regular.ttf); }
    html, body { margin: 0; min-height: 100vh; background: #140e0a; color: #f7ebd3; font-family: Kanit, system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; }
    #bar { display: flex; flex-wrap: wrap; gap: 4px; max-width: 960px; justify-content: center; }
    button { background: #3a2819; color: #f7ebd3; border: 1px solid #523822; padding: 3px 8px; font: inherit; cursor: pointer; }
    button.on { background: #f4ae3d; color: #2a1606; }
    canvas { image-rendering: pixelated; width: 960px; height: 540px; }
  </style>
</head>
<body>
  <div id="bar">
      ${tables}
      <button data-lang="th">ไทย</button><button data-lang="en">EN</button><button data-lang="ms">BM</button>
      <button data-layout="classic">Classic</button><button data-layout="backview">Backview</button>
      <button data-status="rows">HP rows</button><button data-status="cards">Cards</button><button data-status="none">No status</button>
      <button data-timing="turn">Turn</button><button data-timing="atb">ATB</button><button id="atbmode">ATB active</button>
      <button id="auto">Auto</button>
  </div>
  <div id="stage"></div>
  <script type="module">
    async function pixi() {
      try { await import("./pixi.min.js"); if (globalThis.PIXI) return globalThis.PIXI; } catch {}
      return await import("https://cdn.jsdelivr.net/npm/pixi.js@8/dist/pixi.min.mjs");
    }
    const PIXI = await pixi();
    await document.fonts.load("20px Kanit").catch(() => {});
    const { loadBattle } = await import("./easybattle-pixi.js");
    const app = new PIXI.Application();
    await app.init({ width: 480, height: 270, background: "#140e0a", antialias: false, resolution: 1 });
    document.getElementById("stage").appendChild(app.canvas);
    const eb = await loadBattle(PIXI, "easybattle.json");
    const q = new URLSearchParams(location.search);
    let lang = q.get("lang") ?? "th", table = q.get("table") ?? ${JSON.stringify(db.encounters[0]?.id ?? "")}, auto = q.has("auto"), ui = null;
    let layout = q.get("layout") ?? eb.ui?.layout ?? "classic", status = q.get("status") ?? undefined;
    let timing = q.get("timing") ?? eb.ui?.timing ?? "turn", atbMode = q.get("atb") ?? eb.ui?.atbMode ?? "wait";
    const level = Number(q.get("level") ?? 4), seed = Number(q.get("seed") ?? 7), speed = Number(q.get("speed") ?? 1);
    const start = () => {
      if (ui && !ui.view.destroyed) ui.view.destroy({ children: true });
      const setup = eb.scripted(table, seed);
      setup.party = eb.party(level);
      setup.items = { balm: 2, teh_tarik: 1, kurma: 2 };
      ui = eb.start(app, setup, { lang, auto, speed, keep: true, layout, status, timing, atbMode, onEnd: (r, rw) => { window.__battle.result = r; window.__battle.rewards = rw; } });
      window.__battle = { eb, ui, result: null, rewards: null };
      document.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.table === table || b.dataset.lang === lang || b.dataset.layout === ui.layout || b.dataset.status === ui.status || b.dataset.timing === timing || (b.id === "atbmode" && atbMode === "active") || (b.id === "auto" && auto)));
    };
    document.querySelectorAll("[data-table]").forEach((b) => b.onclick = () => { table = b.dataset.table; start(); });
    document.querySelectorAll("[data-lang]").forEach((b) => b.onclick = () => { lang = b.dataset.lang; start(); });
    document.querySelectorAll("[data-layout]").forEach((b) => b.onclick = () => { layout = b.dataset.layout; status = undefined; start(); });
    document.querySelectorAll("[data-status]").forEach((b) => b.onclick = () => { status = b.dataset.status; start(); });
    document.querySelectorAll("[data-timing]").forEach((b) => b.onclick = () => { timing = b.dataset.timing; start(); });
    document.getElementById("atbmode").onclick = () => { atbMode = atbMode === "active" ? "wait" : "active"; timing = "atb"; start(); };
    document.getElementById("auto").onclick = () => { auto = !auto; start(); };
    start();
    window.__ready = true;
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------- Godot
async function exportGodot(w: Writer, root: string, db: BattleDb, res: ExportResult, bundle: boolean, font: boolean) {
  const g = path.join(RUNTIME_DIR, "godot");
  await writeArt(w, root, db, res, "easybattle/");
  if (bundle) await bundleAssets(w, db, res, "easybattle/");
  res.fonts = font ? await bundleFont(w, res, "godot") : [];
  await w.write("easybattle/easybattle.json", `${JSON.stringify({ format: "easybattle-export/1", version: VERSION, db, fx: res.fx, sfx: res.sfx, itemNames: await itemNamesFor(root, db), ui: uiData(db, res.fonts) }, null, 2)}\n`);
  await w.write("easybattle/parity.json", `${JSON.stringify({ cases: parityCases(db), encounters: encounterParity(db) }, null, 2)}\n`);
  for (const f of ["easybattle.gd", "battle_engine.gd", "battle_scene.gd", "battle_scene.tscn"]) await w.copy(path.join(g, f), `easybattle/${f}`);
  for (const f of ["Kanit-Regular.ttf", "OFL.txt"]) await w.copy(path.join(FONT_DIR, f), `easybattle/fonts/${f}`);
  for (const f of ["main.gd", "test_battle.gd", "capture.gd"]) await w.copy(path.join(g, f), f);
  await w.write("main.tscn", `[gd_scene load_steps=2 format=3]

[ext_resource type="Script" path="res://main.gd" id="1"]

[node name="Main" type="Control"]
layout_mode = 3
anchors_preset = 0
offset_right = 480.0
offset_bottom = 270.0
script = ExtResource("1")
`);
  await w.write("project.godot", `; Engine configuration file.
config_version=5

[application]

config/name="Easy Battle demo"
run/main_scene="res://main.tscn"
config/features=PackedStringArray("4.3")

[autoload]

Battle="*res://easybattle/easybattle.gd"
${res.fonts.length ? 'EasyFont="*res://easyfont/easyfont.gd"\n' : ""}
[display]

window/size/viewport_width=480
window/size/viewport_height=270
window/size/window_width_override=1440
window/size/window_height_override=810
window/stretch/mode="viewport"
window/stretch/scale_mode="integer"

[rendering]

textures/canvas_textures/default_texture_filter=0
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
`);
  await w.write("README.txt", `Easy Battle ${VERSION} — Godot 4.3+ export
Open this folder in Godot 4.3+ and press F5 (pick an encounter), or copy easybattle/ into your game and add
  Project Settings → Autoload → res://easybattle/easybattle.gd as "Battle"

  easybattle/easybattle.gd     Battle autoload: party, step(region, culture, ground_code) encounters, start(setup),
                               battle_ended(result, rewards), to_dict()/from_dict() for Easy Save
  easybattle/battle_engine.gd  EasyBattleEngine: the deterministic engine (parity-tested with the TypeScript one)
  easybattle/battle_scene.*    the battle UI (uses res://easyui/themes/teak.tres when Easy UI is exported here)
  easybattle/enemies, heroes   enemy strips (<art>.png side view, <art>_front.png facing the camera for the back view) and Easy Sprite hero sheets (side view, and <id>_back for the back view)
  easybattle/portraits         Easy Portrait busts for the status cards
  easybattle/backdrops         back-view battlefields (paddy, forest)
  easyfont/                    มะขาม pixel fonts + EasyFont autoload (when Easy Font is installed)
Layouts: Battle.start(setup, parent, {"layout": "backview", "status": "cards"}) or easybattle.json "ui".
ATB: Battle.start(setup, parent, {"timing": "atb", "atbMode": "wait"}) (or "active"); main.gd: timing=atb.
  easybattle/fx, sfx           Easy FX strips and Easy SFX sounds the skills use (when bundled)
  test_battle.gd               godot --headless --path . --script res://test_battle.gd   → prints OK
  capture.gd                   frame capture for previews (needs a renderer)

Easy Items: drops and loot go into /root/Items when that autoload exists; battle items come from the bag.
`);
}
