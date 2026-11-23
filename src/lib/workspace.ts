import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDb, checkDoc, Diags, entrySummary } from "../shared/db.js";
import { resolveUi } from "../shared/layout.js";
import { EXPORT_PRESETS, type BattleDb, type BattleDoc, type Diagnostic } from "../shared/types.js";
import { assertSafeId, pkgRoot, resolveWorkspace, SAMPLES_DIR } from "./fsx.js";
import { siblingCli } from "./siblings.js";

export { assertSafeId, resolveWorkspace };
export const CONFIG_NAME = "easybattle.config.json";
export const DOC_EXT = ".easybattle.json";

export interface EasyBattleConfig {
  name: string;
  /** Easy Items workspace (relative or absolute) whose item ids drops and battle items are checked against. */
  items?: string;
  /** Easy Tilemap overworld map JSON whose region ids encounter tables are checked against. */
  overworld?: string;
}

export const DEFAULT_CONFIG: EasyBattleConfig = { name: "Easy Battle Workspace" };

export const dirs = (root: string) => ({ battles: path.join(root, "battles"), exports: path.join(root, "exports") });

export async function initWorkspace(dir = process.cwd(), opts: { force?: boolean } = {}): Promise<string> {
  const root = resolveWorkspace(dir);
  const d = dirs(root);
  for (const p of Object.values(d)) await mkdir(p, { recursive: true });
  const cfg = path.join(root, CONFIG_NAME);
  if (!existsSync(cfg) || opts.force) await writeFile(cfg, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  const src = path.join(SAMPLES_DIR, "battles");
  for (const f of await readdir(src)) {
    const to = path.join(d.battles, f);
    if (!existsSync(to) || opts.force) await copyFile(path.join(src, f), to);
  }
  return root;
}

export async function loadConfig(root: string): Promise<EasyBattleConfig> {
  const f = path.join(root, CONFIG_NAME);
  if (!existsSync(f)) return DEFAULT_CONFIG;
  return { ...DEFAULT_CONFIG, ...(JSON.parse(await readFile(f, "utf8")) as Partial<EasyBattleConfig>) };
}

export const docPath = (root: string, id: string) => path.join(dirs(root).battles, `${assertSafeId(id, "document id")}${DOC_EXT}`);

export async function listDocs(root: string): Promise<Array<{ id: string; file: string; doc: unknown; parseError?: string }>> {
  const d = dirs(root).battles;
  if (!existsSync(d)) return [];
  const out = [];
  for (const f of (await readdir(d)).sort()) {
    if (!f.endsWith(DOC_EXT)) continue;
    const id = f.slice(0, -DOC_EXT.length);
    const file = path.join(d, f);
    try {
      out.push({ id, file, doc: JSON.parse(await readFile(file, "utf8")) as unknown });
    } catch (e) {
      out.push({ id, file, doc: undefined, parseError: (e as Error).message });
    }
  }
  return out;
}

export interface LoadedDb {
  db: BattleDb;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  docs: string[];
}

export async function loadDb(root: string): Promise<LoadedDb> {
  const docs = await listDocs(root);
  const parseErrors: Diagnostic[] = docs.filter((d) => d.parseError).map((d) => ({ path: `${d.id}${DOC_EXT}`, message: `invalid JSON: ${d.parseError}`, severity: "error" }));
  const r = buildDb(docs.filter((d) => !d.parseError).map((d) => ({ file: `${d.id}${DOC_EXT}`, doc: d.doc })));
  return { db: r.db, errors: [...parseErrors, ...r.errors], warnings: r.warnings, docs: docs.map((d) => d.id) };
}

export async function loadDbStrict(root: string): Promise<BattleDb> {
  const r = await loadDb(root);
  if (r.errors.length) throw new Error(`Battle database has ${r.errors.length} error(s):\n${r.errors.slice(0, 8).map((e) => `  ${e.path}: ${e.message}`).join("\n")}`);
  return r.db;
}

/** Item ids from an Easy Items workspace (items/*.easyitems.json). */
export async function easyItemIds(dir: string): Promise<string[] | null> {
  const d = path.join(dir, "items");
  if (!existsSync(d)) return null;
  const ids: string[] = [];
  for (const f of await readdir(d)) {
    if (!f.endsWith(".easyitems.json")) continue;
    try {
      const doc = JSON.parse(await readFile(path.join(d, f), "utf8")) as { items?: Array<{ id: string }>; loot?: Array<{ id: string }> };
      for (const i of doc.items ?? []) ids.push(i.id);
      for (const l of doc.loot ?? []) ids.push(`loot:${l.id}`);
    } catch {
      /* reported by Easy Items itself */
    }
  }
  return ids;
}

/** Thai / English / Malay names of Easy Items ids (config.items, else a sibling Easy Items install). */
export async function easyItemNames(root: string): Promise<Record<string, { th: string; en: string; ms?: string }>> {
  const cfg = await loadConfig(root);
  const cli = siblingCli("easyitems");
  const sib = cli ? (cli.endsWith("-cli.mjs") ? path.join(path.dirname(cli), "easyitems") : path.resolve(path.dirname(cli), "..")) : "";
  const cands = [cfg.items ? path.resolve(root, cfg.items, "items") : "", path.resolve(pkgRoot, "..", "easyitems", "samples", "items"), sib ? path.join(sib, "samples", "items") : ""].filter(Boolean);
  const out: Record<string, { th: string; en: string; ms?: string }> = {};
  for (const d of cands) {
    if (!existsSync(d)) continue;
    for (const f of await readdir(d)) {
      if (!f.endsWith(".easyitems.json")) continue;
      try {
        const doc = JSON.parse(await readFile(path.join(d, f), "utf8")) as { items?: Array<{ id: string; name: { th: string; en: string; ms?: string } }> };
        for (const i of doc.items ?? []) out[i.id] ??= i.name;
      } catch {
        /* ignore */
      }
    }
    if (Object.keys(out).length) break;
  }
  return out;
}

/** Region ids + cultures from an Easy Tilemap overworld map. */
export async function overworldRegions(file: string): Promise<Array<{ id: string; culture: string; name?: { th: string; en: string; ms?: string } }>> {
  type R = Array<{ id: string; culture: string; name?: { th: string; en: string } }>;
  // Easy Tilemap map source (overworld.regions) or its Godot / Pixi export (overworld/overworld.json: regions)
  const m = JSON.parse(await readFile(file, "utf8")) as { overworld?: { regions?: R }; regions?: R };
  const regions = m.overworld?.regions ?? (Array.isArray(m.regions) ? m.regions : undefined);
  if (!regions) throw new Error(`${file} is not an Easy Tilemap overworld map (no overworld.regions)`);
  return regions;
}

export interface CrossRef {
  items: { workspace: string | null; matched: string[]; missing: string[] };
  regions: { map: string | null; matched: string[]; missing: string[]; uncovered: string[] };
}

export async function checkWorkspace(root: string, opts: { items?: string; overworld?: string } = {}): Promise<LoadedDb & { cross: CrossRef }> {
  const r = await loadDb(root);
  const cfg = await loadConfig(root);
  const warnings = [...r.warnings];
  const cross: CrossRef = { items: { workspace: null, matched: [], missing: [] }, regions: { map: null, matched: [], missing: [], uncovered: [] } };
  const itemsWs = opts.items ?? cfg.items;
  if (itemsWs) {
    const abs = path.resolve(root, itemsWs);
    const ids = await easyItemIds(abs);
    cross.items.workspace = abs;
    if (!ids) warnings.push({ path: "config.items", message: `no Easy Items workspace at ${abs}`, severity: "warning" });
    else {
      const used = new Set<string>();
      for (const e of r.db.enemies) {
        for (const d of e.drops ?? []) used.add(d.item);
        if (e.loot) used.add(`loot:${e.loot}`);
      }
      for (const i of r.db.items) used.add(i.item);
      for (const u of [...used].sort()) (ids.includes(u) ? cross.items.matched : cross.items.missing).push(u);
      for (const m of cross.items.missing) warnings.push({ path: "items", message: `"${m}" is not in the Easy Items workspace`, severity: "warning" });
    }
  }
  const ow = opts.overworld ?? cfg.overworld;
  if (ow) {
    const abs = path.resolve(root, ow);
    cross.regions.map = abs;
    const regions = await overworldRegions(abs);
    const ids = regions.map((x) => x.id);
    for (const t of r.db.encounters) for (const reg of t.regions ?? []) (ids.includes(reg) ? cross.regions.matched : cross.regions.missing).push(reg);
    for (const reg of regions) {
      const covered = r.db.encounters.some((t) => !t.scripted && (t.regions?.includes(reg.id) || t.cultures?.includes(reg.culture) || t.terrains.includes("any")));
      if (!covered) cross.regions.uncovered.push(reg.id);
    }
    for (const m of cross.regions.missing) warnings.push({ path: "encounters", message: `region "${m}" is not on the overworld map`, severity: "warning" });
    for (const u of cross.regions.uncovered) warnings.push({ path: "encounters", message: `overworld region "${u}" has no encounter table`, severity: "warning" });
  }
  return { ...r, warnings, cross };
}

export async function saveDoc(root: string, id: string, raw: unknown, opts: { dryRun?: boolean } = {}) {
  const file = docPath(root, id);
  const d = new Diags();
  checkDoc(raw, d, `${id}${DOC_EXT}`);
  if (!d.errors.length) {
    const all = (await listDocs(root)).filter((x) => !x.parseError);
    const others = all.filter((x) => x.id !== id);
    const key = (e: Diagnostic) => `${e.path}|${e.message}`;
    const before = new Set(buildDb(all.map((x) => ({ file: `${x.id}${DOC_EXT}`, doc: x.doc }))).errors.map(key));
    const r = buildDb([...others.map((x) => ({ file: `${x.id}${DOC_EXT}`, doc: x.doc })), { file: `${id}${DOC_EXT}`, doc: raw }]);
    d.list.push(...r.errors.filter((e) => !before.has(key(e))), ...r.warnings.filter((e) => e.path.startsWith(`${id}${DOC_EXT}`)));
  }
  if (opts.dryRun || d.errors.length) return { file, saved: false, errors: d.errors, warnings: d.warnings };
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(raw, null, 2)}\n`);
  return { file, saved: true, errors: d.errors, warnings: d.warnings };
}

export async function readDoc(root: string, id: string): Promise<BattleDoc | undefined> {
  const f = docPath(root, id);
  return existsSync(f) ? (JSON.parse(await readFile(f, "utf8")) as BattleDoc) : undefined;
}

export async function workspaceSummary(root: string) {
  const r = await loadDb(root);
  return {
    root,
    config: await loadConfig(root),
    ...dirs(root),
    docs: r.docs,
    rules: r.db.rules,
    elements: r.db.elements.map((e) => ({ id: e.id, th: e.name.th, en: e.name.en, color: e.color })),
    statuses: r.db.statuses.map((s) => ({ id: s.id, th: s.name.th, en: s.name.en, kind: s.kind, turns: s.turns })),
    heroes: r.db.heroes.map(entrySummary.hero),
    enemies: r.db.enemies.map(entrySummary.enemy),
    skills: r.db.skills.map(entrySummary.skill),
    encounters: r.db.encounters.map((t) => ({ id: t.id, regions: t.regions ?? [], cultures: t.cultures ?? [], terrains: t.terrains, rate: t.rate, groups: t.groups.length, scripted: !!t.scripted })),
    items: r.db.items,
    ui: resolveUi(r.db.ui),
    errors: r.errors,
    warnings: r.warnings,
    exportPresets: EXPORT_PRESETS,
  };
}
