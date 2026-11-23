import { Hono } from "hono";
import { Battle, rollEncounter, xpToNext, type Action, type BattleSetup } from "../shared/engine.js";
import { CULTURES, ENEMY_ART, FORMAT, SKILL_KINDS, STATUS_KINDS, TARGETS, TERRAINS, UI_BACKDROPS, UI_LAYOUTS, UI_STATUS, type BattleDoc, type Terrain, type UiBackdrop, type UiLayout, type UiStatus } from "../shared/types.js";
import { renderBattlePng } from "../lib/render.js";
import { enemyStrip } from "../lib/art.js";
import { exportBattle, type ExportPreset } from "../lib/export.js";
import { pkgRoot } from "../lib/fsx.js";
import { encodePng } from "../lib/png.js";
import { assertSafeId, checkWorkspace, listDocs, loadDb, loadDbStrict, readDoc, saveDoc, workspaceSummary } from "../lib/workspace.js";
import { errMsg, useGuard, useWeb, type BaseOptions } from "./base.js";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

export type CreateAppOptions = BaseOptions;
const bytes = (buf: Buffer) => new Uint8Array(buf);

export function createApp(o: CreateAppOptions): Hono {
  const app = new Hono();
  const root = o.workspaceRoot;
  useGuard(app, o);
  app.get("/api/workspace", async (c) => c.json({ ...(await workspaceSummary(root)), enums: { art: ENEMY_ART, kinds: SKILL_KINDS, targets: TARGETS, statusKinds: STATUS_KINDS, terrains: TERRAINS, cultures: CULTURES, layouts: UI_LAYOUTS, status: UI_STATUS, backdrops: UI_BACKDROPS } }));
  /** Battle screen preview PNG (no text): ?layout=&status=&backdrop=&terrain=&table=&seed=&turns= */
  app.get("/api/render", async (c) => {
    try {
      const db = await loadDbStrict(root);
      const q = (k: string) => c.req.query(k) || undefined;
      const pick = <T extends string>(v: string | undefined, ok: readonly T[]) => (v && (ok as readonly string[]).includes(v) ? (v as T) : undefined);
      const table = db.encounters.find((t) => t.id === q("table"));
      const ids = table ? table.groups[0]!.enemies : db.enemies.filter((e) => !e.boss).slice(0, 3).map((e) => e.id);
      const b = new Battle(db, { party: db.heroes.slice(0, db.rules.partySize).map((h) => ({ id: h.id, level: 5 })), enemies: ids.map((id) => ({ id })), seed: Number(q("seed") ?? 1) });
      for (let k = 0; k < Number(q("turns") ?? 0) && !b.over; k++) b.act(b.auto());
      const png = await renderBattlePng(root, db, b, 2, { layout: pick<UiLayout>(q("layout"), UI_LAYOUTS), status: pick<UiStatus>(q("status"), UI_STATUS), backdrop: pick<UiBackdrop>(q("backdrop"), UI_BACKDROPS), terrain: q("terrain") ?? table?.terrains[0] ?? "grass" });
      return c.body(bytes(png), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  /** Save the battle screen settings into a document: { doc?: id (default first), ui: {layout?, status?, backdrop?} } */
  app.post("/api/ui", async (c) => {
    try {
      const body = (await c.req.json()) as { doc?: string; ui: BattleDoc["ui"]; dryRun?: boolean };
      const { docs } = await loadDb(root);
      const id = assertSafeId(body.doc ?? docs[0] ?? "core", "document id");
      const doc = ((await readDoc(root, id)) ?? { format: FORMAT }) as BattleDoc;
      const res = await saveDoc(root, id, { ...doc, ui: body.ui }, { dryRun: body.dryRun });
      return c.json({ ok: res.saved, doc: id, errors: res.errors, warnings: res.warnings });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  app.get("/api/db", async (c) => c.json(await loadDb(root)));
  app.get("/api/check", async (c) => {
    const r = await checkWorkspace(root);
    return c.json({ errors: r.errors, warnings: r.warnings, cross: r.cross });
  });
  app.get("/api/docs", async (c) => c.json({ docs: (await listDocs(root)).map((d) => ({ id: d.id, parseError: d.parseError ?? null })) }));
  app.get("/api/docs/:id", async (c) => {
    try {
      const id = assertSafeId(c.req.param("id"), "document id");
      const doc = await readDoc(root, id);
      if (!doc) return c.json({ error: `No document ${id}` }, 404);
      return c.json({ id, doc });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 404);
    }
  });
  app.post("/api/docs/:id", async (c) => {
    try {
      const body = (await c.req.json()) as { doc: unknown; dryRun?: boolean };
      const res = await saveDoc(root, c.req.param("id"), body.doc, { dryRun: body.dryRun });
      return c.json({ ok: res.saved, file: res.file, errors: res.errors, warnings: res.warnings });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  /** Enemy strip PNG (idle, bob, hurt) by enemy id. */
  app.get("/api/enemy/:id", async (c) => {
    const { db } = await loadDb(root);
    const e = db.enemies.find((x) => x.id === c.req.param("id").replace(/\.png$/, ""));
    if (!e) return c.json({ error: "unknown enemy" }, 404);
    const r = enemyStrip(e.art, e.palette);
    return c.body(bytes(encodePng(r.width, r.height, r.data)), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
  });
  app.get("/api/hero/:sprite", async (c) => {
    const id = c.req.param("sprite").replace(/\.png$/, "");
    try {
      assertSafeId(id);
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
    for (const p of [path.join(root, "sprites", `${id}.png`), path.join(pkgRoot, "assets", "heroes", `${id}.png`)]) if (existsSync(p)) return c.body(bytes(await readFile(p)), 200, { "Content-Type": "image/png" });
    return c.json({ error: "no sheet" }, 404);
  });
  app.post("/api/sim", async (c) => {
    try {
      const body = (await c.req.json()) as { setup: BattleSetup; actions?: Array<Action | null>; runs?: number };
      const db = await loadDbStrict(root);
      const runs = Math.max(1, Math.min(500, body.runs ?? 1));
      if (runs > 1) {
        let wins = 0;
        let rounds = 0;
        for (let k = 0; k < runs; k++) {
          const b = new Battle(db, { ...body.setup, seed: body.setup.seed + k });
          b.autoRun();
          if (b.over === "win") wins++;
          rounds += b.round;
        }
        return c.json({ runs, wins, avgRounds: rounds / runs });
      }
      const b = new Battle(db, body.setup);
      for (const a of body.actions ?? []) if (!b.over) b.act(a ?? b.auto());
      b.autoRun();
      return c.json({ result: b.over, log: b.log, rewards: b.rewards(), snapshot: b.snapshot(), actors: b.actors });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  app.post("/api/encounter", async (c) => {
    try {
      const body = (await c.req.json()) as { region?: string; culture?: string; terrain?: Terrain; seed?: number; times?: number };
      const db = await loadDbStrict(root);
      const seed = Math.floor(body.seed ?? 1);
      return c.json({ rolls: Array.from({ length: Math.max(1, Math.min(50, body.times ?? 8)) }, (_, k) => ({ seed: seed + k, ...rollEncounter(db, body, seed + k) })) });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  app.get("/api/xp", async (c) => {
    const { db } = await loadDb(root);
    return c.json({ table: Array.from({ length: db.rules.maxLevel - 1 }, (_, k) => ({ level: k + 1, next: xpToNext(db, k + 1) })) });
  });
  app.post("/api/export", async (c) => {
    try {
      const body = (await c.req.json()) as { preset?: ExportPreset; out?: string };
      const res = await exportBattle(root, { preset: body.preset, out: body.out });
      return c.json({ ok: true, ...res, files: res.files.length });
    } catch (e) {
      return c.json({ error: errMsg(e) }, 400);
    }
  });
  useWeb(app, o);
  return app;
}
