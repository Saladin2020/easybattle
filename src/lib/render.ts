/**
 * Battle frame PNG (no text: bars and sprites only) for MCP / CLI previews. Real UIs are the Godot and Pixi runtimes.
 * Both layouts: classic (side view) and backview (blue window, backdrop, party from behind, HP arcs, status cards).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ATB, type Battle } from "../shared/engine.js";
import { backdropFor, backviewEnemyRects, PORTRAIT_CROP, resolveUi, screenLayout, SHEET_ROW, type Rect } from "../shared/layout.js";
import type { BattleDb, UiSettings } from "../shared/types.js";
import { drawEnemy } from "./art.js";
import { drawBackdrop } from "./backdrop.js";
import { pkgRoot } from "./fsx.js";
import { decodePng, encodePng } from "./png.js";
import { Raster } from "./raster.js";

/** Cut a region out of a PNG from the workspace (sprites/, portraits/) or the bundled assets. */
async function cut(root: string, dirs: [string, string], id: string, box: Rect): Promise<Raster | null> {
  for (const p of [path.join(root, dirs[0], `${id}.png`), path.join(pkgRoot, "assets", dirs[1], `${id}.png`)]) {
    if (!existsSync(p)) continue;
    const img = decodePng(await readFile(p));
    const r = new Raster(box.w, box.h);
    for (let y = 0; y < box.h; y++) for (let x = 0; x < box.w; x++) {
      if (box.x + x >= img.width || box.y + y >= img.height) continue;
      const i = ((box.y + y) * img.width + box.x + x) * 4;
      if (img.data[i + 3]) r.set(x, y, [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!]);
    }
    return r;
  }
  return null;
}

function heroFrame(root: string, id: string, frame: number, row: number = SHEET_ROW.side): Promise<Raster | null> {
  return cut(root, ["sprites", "heroes"], id, { x: frame * 48, y: row * 48, w: 48, h: 48 });
}

const BLUE = { ink: "#0d0906", border: "#f2f4ff", inner: "#8a98e8", fill: "#2a3a9c", fill2: "#3446b4" };
const CARD = { fill: "#1c2436", border: "#6a7aa8", life: "#5ad06a", low: "#e8c040", crit: "#e0503a", pow: "#4aa0f0", ink: "#0d0906" };

function bluePanel(r: Raster, b: Rect) {
  r.rect(b.x, b.y, b.w, b.h, BLUE.ink);
  r.rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, BLUE.border);
  r.rect(b.x + 3, b.y + 3, b.w - 6, b.h - 6, BLUE.inner);
  r.rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, BLUE.fill);
  r.rect(b.x + 4, b.y + 4, b.w - 8, Math.floor((b.h - 8) / 2), BLUE.fill2);
}

const lifeColor = (ratio: number) => (ratio > 0.5 ? CARD.life : ratio > 0.25 ? CARD.low : CARD.crit);

async function drawCards(r: Raster, root: string, db: BattleDb, b: Battle, cards: ReturnType<typeof screenLayout>["cards"], current: number) {
  const heroes = b.actors.map((a, i) => ({ a, i })).filter((x) => x.a.side === 0);
  for (const [k, { a, i }] of heroes.entries()) {
    const c = cards[k];
    if (!c) continue;
    const active = i === current && a.hp > 0;
    r.rect(c.rect.x, c.rect.y, c.rect.w, c.rect.h, CARD.ink);
    r.rect(c.rect.x + 1, c.rect.y + 1, c.rect.w - 2, c.rect.h - 2, active ? "#ffd23a" : CARD.border);
    r.rect(c.rect.x + 2, c.rect.y + 2, c.rect.w - 4, c.rect.h - 4, active ? "#2c3a5c" : CARD.fill);
    r.rect(c.portrait.x - 1, c.portrait.y - 1, c.portrait.w + 2, c.portrait.h + 2, CARD.ink);
    const h = db.heroes.find((x) => x.id === a.id);
    const ratio = a.hp / a.max.hp;
    const face = await cut(root, ["portraits", "portraits"], h?.portrait ?? a.id, { x: (a.hp <= 0 ? 3 : ratio <= 0.3 ? 2 : 0) * 64 + PORTRAIT_CROP.x, y: PORTRAIT_CROP.y, w: PORTRAIT_CROP.w, h: PORTRAIT_CROP.h });
    if (face) r.blit(face, c.portrait.x, c.portrait.y);
    else r.rect(c.portrait.x, c.portrait.y, c.portrait.w, c.portrait.h, h?.color ?? "#f4ae3d");
    r.rect(c.lv.x, c.lv.y, c.lv.w, c.lv.h, CARD.border);
    r.rect(c.lv.x + 1, c.lv.y + 1, c.lv.w - 2, c.lv.h - 2, CARD.ink);
    for (const [bar, v, col] of [[c.lifeBar, Math.max(0, ratio), lifeColor(ratio)], [c.powBar, a.max.mp ? a.mp / a.max.mp : 0, CARD.pow]] as const) {
      r.rect(bar.x - 1, bar.y - 1, bar.w + 2, bar.h + 2, CARD.ink);
      r.rect(bar.x, bar.y, bar.w, bar.h, "#2a2a3a");
      r.rect(bar.x, bar.y, Math.round(bar.w * v), bar.h, col);
    }
    if (b.timing === "atb") {
      // ATB time bar (same colours as the runtimes); the preview has no text, so the stripe stands alone
      const t = c.time;
      const v = a.hp > 0 ? Math.min(1, b.gauge[i]! / ATB.full) : 0;
      r.rect(t.x - 1, t.y - 1, t.w + 2, t.h + 2, CARD.ink);
      r.rect(t.x, t.y, t.w, t.h, "#0e1420");
      if (v > 0) r.rect(t.x, t.y, Math.max(1, Math.round(t.w * v)), t.h, v >= 1 ? "#b03c1e" : "#23804a");
    }
  }
}

async function renderBackview(root: string, db: BattleDb, b: Battle, ui: Required<UiSettings>, terrain: string): Promise<Raster> {
  const heroes = b.actors.map((a, i) => ({ a, i })).filter((x) => x.a.side === 0);
  const enemies = b.actors.map((a, i) => ({ a, i })).filter((x) => x.a.side === 1);
  const L = screenLayout("backview", ui.status === "none" ? "none" : "cards", Math.min(4, Math.max(1, heroes.length)));
  const r = drawBackdrop(backdropFor(ui.backdrop, terrain));
  const defs = enemies.map(({ a }) => db.enemies.find((x) => x.id === a.id)!);
  const rects = backviewEnemyRects(defs.map((e) => ({ w: e.boss ? 80 : 48, h: e.boss ? 64 : 48, boss: !!e.boss })));
  enemies.forEach(({ a }, k) => {
    if (a.hp <= 0) return;
    const e = defs[k]!;
    const f = drawEnemy(e.art, e.palette, "front");
    const p = rects[k]!;
    r.ellipse(p.x + 6, p.y + p.h - 5, p.w - 12, 6, [0, 0, 0, 70]);
    r.blit(f.frames[0]!, p.x, p.y);
  });
  const current = b.over ? -1 : b.current();
  for (const [k, { a, i }] of heroes.entries()) {
    const slot = L.slots[k];
    if (!slot) continue;
    const h = db.heroes.find((x) => x.id === a.id)!;
    const frame = a.hp > 0 ? 0 : 23;
    const fr = (await heroFrame(root, h.back ?? `${h.id}_back`, frame, SHEET_ROW.back)) ?? (await heroFrame(root, h.sprite ?? h.id, frame));
    const dy = i === current ? -6 : 0;
    if (fr) r.blit(fr, slot.sprite.x, slot.sprite.y + dy, L.heroScale);
    // curved HP gauge
    const n = 16;
    const filled = a.hp <= 0 ? 0 : Math.max(1, Math.ceil((n * a.hp) / a.max.hp));
    const { x, y, w, h: hh } = slot.arc;
    const pts = Array.from({ length: n }, (_, j) => {
      const ang = Math.PI + (j + 0.5) * (Math.PI / 2 / n);
      return [Math.round(x + w + Math.cos(ang) * (w - 3)) - 2, Math.round(y + hh + Math.sin(ang) * (hh - 3)) - 2] as const;
    });
    for (const [px, py] of pts) r.rect(px - 1, py - 1, 6, 6, BLUE.ink);
    pts.forEach(([px, py], j) => r.rect(px, py, 4, 4, j < filled ? lifeColor(a.hp / a.max.hp) : "#3a3020"));
  }
  bluePanel(r, L.window);
  if (L.cards.length) await drawCards(r, root, db, b, L.cards, current);
  return r;
}

export interface RenderOptions extends UiSettings {
  terrain?: string;
}

export async function renderBattleRaster(root: string, db: BattleDb, b: Battle, opts: RenderOptions = {}): Promise<Raster> {
  const ui = resolveUi(db.ui, opts);
  if (ui.layout === "backview") return renderBackview(root, db, b, ui, opts.terrain ?? "grass");
  const r = new Raster(480, 270, "#7ab8e0");
  r.rect(0, 40, 480, 50, "#8ec4e6");
  r.poly([[0, 90], [0, 66], [60, 54], [130, 70], [210, 50], [300, 68], [380, 52], [480, 64], [480, 90]], "#3b6e45");
  r.rect(0, 86, 480, 184, "#79c48a");
  r.rect(0, 86, 480, 3, "#5aa86a");
  for (let i = 0; i < 18; i++) r.rect((i * 97 + 13) % 480, 96 + ((i * 37) % 96), 6, 2, "#5aa86a");
  const enemies = b.actors.map((a, i) => ({ a, i })).filter((x) => x.a.side === 1);
  const heroes = b.actors.map((a, i) => ({ a, i })).filter((x) => x.a.side === 0);
  enemies.forEach(({ a }, k) => {
    if (a.hp <= 0) return;
    const e = db.enemies.find((x) => x.id === a.id)!;
    const f = drawEnemy(e.art, e.palette);
    const cols = enemies.length > 3 ? 3 : enemies.length;
    const col = k % 3;
    const row = Math.floor(k / 3);
    let x = 36 + col * 60 + row * 28 + (cols === 3 ? 0 : 30);
    let y = 146 - f.h + row * 40 + (col % 2) * 16;
    if (e.boss) [x, y] = [70, 170 - f.h];
    r.ellipse(x + 6, y + f.h - 4, f.w - 12, 6, [0, 0, 0, 60]);
    r.blit(f.frames[0]!, x, y);
    r.rect(x + 8, y - 6, f.w - 16, 3, "#0d0906");
    r.rect(x + 9, y - 5, Math.round(((f.w - 18) * a.hp) / a.max.hp), 1, "#d0473a");
  });
  for (const [k, { a }] of heroes.entries()) {
    const h = db.heroes.find((x) => x.id === a.id)!;
    const fr = await heroFrame(root, h.sprite ?? h.id, a.hp > 0 ? 0 : 23);
    const x = 356 + k * 22;
    const y = 86 + k * 28;
    r.ellipse(x + 12, y + 42, 24, 6, [0, 0, 0, 60]);
    if (fr) r.blit(fr, x, y);
  }
  const L = screenLayout("classic", ui.status, Math.min(4, Math.max(1, heroes.length)));
  if (ui.status === "rows") {
    r.rect(176, 196, 296, 68, "#2a1d13");
    r.frame(176, 196, 296, 68, "#f4ae3d");
  }
  r.rect(L.menu.x, L.menu.y, L.menu.w, L.menu.h, "#2a1d13");
  r.frame(L.menu.x, L.menu.y, L.menu.w, L.menu.h, "#f4ae3d");
  r.rect(8, 6, 464, 22, "#2a1d13");
  r.frame(8, 6, 464, 22, "#f4ae3d");
  if (ui.status === "cards") await drawCards(r, root, db, b, L.cards, b.over ? -1 : b.current());
  if (ui.status === "rows") heroes.forEach(({ a }, k) => {
    const y = 204 + k * 20;
    const col = db.heroes.find((x) => x.id === a.id)?.color ?? "#f7ebd3";
    r.rect(184, y, 60, 6, col);
    r.rect(256, y, 86, 8, "#0d0906");
    r.rect(257, y + 1, Math.round((84 * a.hp) / a.max.hp), 6, "#d0473a");
    r.rect(390, y, 46, 8, "#0d0906");
    r.rect(391, y + 1, Math.round((44 * a.mp) / Math.max(1, a.max.mp)), 6, "#3c8ce8");
  });
  for (let k = 0; k < 5; k++) r.rect(L.menu.x + 8, L.menu.y + 8 + k * 11, 80 - k * 6, 6, k === 0 ? "#f4ae3d" : "#3a2819");
  return r;
}

export async function renderBattlePng(root: string, db: BattleDb, b: Battle, scale = 2, opts: RenderOptions = {}): Promise<Buffer> {
  const r = (await renderBattleRaster(root, db, b, opts)).scaled(scale);
  return encodePng(r.width, r.height, r.data);
}
