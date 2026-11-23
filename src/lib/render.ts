/** Battle frame PNG (no text: bars and sprites only) for MCP / CLI previews. Real UIs are the Godot and Pixi runtimes. */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Battle } from "../shared/engine.js";
import type { BattleDb } from "../shared/types.js";
import { drawEnemy } from "./art.js";
import { pkgRoot } from "./fsx.js";
import { decodePng, encodePng } from "./png.js";
import { Raster } from "./raster.js";

async function heroFrame(root: string, id: string, frame: number): Promise<Raster | null> {
  for (const p of [path.join(root, "sprites", `${id}.png`), path.join(pkgRoot, "assets", "heroes", `${id}.png`)]) {
    if (!existsSync(p)) continue;
    const img = decodePng(await readFile(p));
    const r = new Raster(48, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const i = ((48 + y) * img.width + frame * 48 + x) * 4;
      if (img.data[i + 3]) r.set(x, y, [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, img.data[i + 3]!]);
    }
    return r;
  }
  return null;
}

export async function renderBattleRaster(root: string, db: BattleDb, b: Battle): Promise<Raster> {
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
  r.rect(176, 196, 296, 68, "#2a1d13");
  r.frame(176, 196, 296, 68, "#f4ae3d");
  r.rect(8, 196, 162, 68, "#2a1d13");
  r.frame(8, 196, 162, 68, "#f4ae3d");
  r.rect(8, 6, 464, 22, "#2a1d13");
  r.frame(8, 6, 464, 22, "#f4ae3d");
  heroes.forEach(({ a }, k) => {
    const y = 204 + k * 20;
    const col = db.heroes.find((x) => x.id === a.id)?.color ?? "#f7ebd3";
    r.rect(184, y, 60, 6, col);
    r.rect(256, y, 86, 8, "#0d0906");
    r.rect(257, y + 1, Math.round((84 * a.hp) / a.max.hp), 6, "#d0473a");
    r.rect(390, y, 46, 8, "#0d0906");
    r.rect(391, y + 1, Math.round((44 * a.mp) / Math.max(1, a.max.mp)), 6, "#3c8ce8");
  });
  for (let k = 0; k < 5; k++) r.rect(16, 204 + k * 11, 80 - k * 6, 6, k === 0 ? "#f4ae3d" : "#3a2819");
  return r;
}

export async function renderBattlePng(root: string, db: BattleDb, b: Battle, scale = 2): Promise<Buffer> {
  const r = (await renderBattleRaster(root, db, b)).scaled(scale);
  return encodePng(r.width, r.height, r.data);
}
