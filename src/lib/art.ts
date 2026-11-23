/**
 * Enemy battlers drawn from code (no source images, no AI): 14 creatures on 48×48 (bosses 80×64), facing left
 * toward the party. Two idle frames (bob) and a white hurt frame per enemy. CC0.
 */
import type { EnemyArt } from "../shared/types.js";
import { Raster, shade } from "./raster.js";

export const OUTLINE = "#1a0f0a";
export const ART_SIZE: Record<EnemyArt, [number, number]> = {
  monkey: [48, 48], crab: [48, 48], mosquito: [48, 48], monitor: [48, 48], cobra: [48, 48], bat: [48, 48], boar: [48, 48],
  rooster: [48, 48], scorpion: [48, 48], bandit: [48, 48], mud: [48, 48], kite: [48, 48], crocodile: [80, 64], tiger: [80, 64],
};
export const DEFAULT_PALETTE: Record<EnemyArt, string[]> = {
  monkey: ["#8a5a32", "#e0b48a", "#f2d04a"],
  crab: ["#d0553a", "#f2a65a", "#f7ebd3"],
  mosquito: ["#5d6470", "#a8c8e8", "#c0392b"],
  monitor: ["#5f7046", "#c8b27a", "#2b3324"],
  cobra: ["#c8a24a", "#f2e0a0", "#c0392b"],
  bat: ["#5a3d6e", "#8e6aa8", "#e74c3c"],
  boar: ["#5a4232", "#8a6a52", "#f7ebd3"],
  rooster: ["#b5452a", "#e8c070", "#2e6b4a"],
  scorpion: ["#3b2a2a", "#7a4a3a", "#e8603c"],
  bandit: ["#2f3e4e", "#c9956c", "#8a2a2a"],
  mud: ["#7a5a3a", "#a8845a", "#f7ebd3"],
  kite: ["#2a8a5c", "#f4ae3d", "#c8402e"],
  crocodile: ["#4e6a3a", "#c8c08a", "#f7ebd3"],
  tiger: ["#e0802a", "#f7ebd3", "#2a1a10"],
};

function eye(r: Raster, x: number, y: number, size = 3, pupil = OUTLINE, white = "#fffaf0") {
  r.rect(x, y, size, size, white);
  r.rect(x, y + (size > 2 ? 1 : 0), Math.max(1, size - 1), Math.max(1, size - 1), pupil);
}

/** Ellipse with a darker lower half and a highlight. */
function blob(r: Raster, x: number, y: number, w: number, h: number, c: string) {
  r.ellipse(x, y, w, h, shade(c, -0.25));
  r.ellipse(x + 1, y, w - 2, Math.ceil(h * 0.7), c);
  r.ellipse(x + Math.floor(w * 0.25), y + Math.floor(h * 0.15), Math.max(2, Math.floor(w * 0.25)), Math.max(2, Math.floor(h * 0.2)), shade(c, 0.25));
}

const DRAW: Record<EnemyArt, (r: Raster, p: string[]) => void> = {
  crab(r, [a, b, c]) {
    for (let i = 0; i < 3; i++) {
      r.line(14 + i * 4, 32, 9 + i * 3, 40, shade(a!, -0.3));
      r.line(30 + i * 4, 32, 36 + i * 3, 40, shade(a!, -0.3));
    }
    blob(r, 9, 20, 30, 18, a!);
    r.rect(14, 33, 20, 2, shade(a!, -0.35));
    blob(r, 3, 12, 11, 10, a!);
    r.rect(3, 16, 5, 2, shade(a!, -0.4));
    blob(r, 34, 12, 11, 10, a!);
    r.rect(40, 16, 5, 2, shade(a!, -0.4));
    r.rect(19, 13, 2, 8, b!);
    r.rect(27, 13, 2, 8, b!);
    eye(r, 18, 10, 4, OUTLINE, c);
    eye(r, 26, 10, 4, OUTLINE, c);
    r.rect(20, 27, 8, 2, shade(a!, -0.45));
  },
  mosquito(r, [a, b, c]) {
    r.ellipse(18, 6, 18, 12, b + "b0");
    r.ellipse(24, 9, 16, 10, shade(b!, 0.3) + "a0");
    for (let i = 0; i < 3; i++) r.line(20 + i * 4, 28, 14 + i * 6, 42, a!);
    r.ellipse(22, 22, 20, 9, a!);
    for (let i = 0; i < 4; i++) r.rect(27 + i * 4, 23, 2, 7, shade(a!, 0.4));
    blob(r, 12, 18, 12, 11, a!);
    r.line(12, 24, 2, 30, c!);
    eye(r, 14, 20, 4, c!, "#ffd0c0");
  },
  monkey(r, [a, b, c]) {
    r.line(36, 34, 44, 28, a!);
    r.line(44, 28, 42, 20, a!);
    blob(r, 14, 22, 22, 20, a!);
    r.ellipse(18, 28, 14, 12, b!);
    blob(r, 12, 6, 22, 19, a!);
    r.ellipse(8, 10, 7, 8, b!);
    r.ellipse(30, 10, 7, 8, b!);
    r.ellipse(15, 11, 16, 12, b!);
    eye(r, 17, 13, 3);
    eye(r, 25, 13, 3);
    r.rect(20, 20, 6, 1, shade(a!, -0.4));
    r.poly([[4, 30], [12, 25], [14, 28], [6, 34]], c!);
    r.rect(4, 33, 3, 2, shade(c!, -0.4));
    r.rect(16, 40, 6, 4, shade(a!, -0.2));
    r.rect(27, 40, 6, 4, shade(a!, -0.2));
  },
  monitor(r, [a, b, c]) {
    r.poly([[30, 30], [47, 34], [46, 37], [28, 36]], a!);
    blob(r, 10, 24, 26, 14, a!);
    blob(r, 1, 22, 14, 9, a!);
    for (const [x, y] of [[14, 27], [20, 26], [26, 28], [18, 31], [32, 32]] as const) r.rect(x, y, 2, 2, b!);
    r.rect(12, 36, 4, 6, shade(a!, -0.3));
    r.rect(28, 36, 4, 6, shade(a!, -0.3));
    eye(r, 6, 24, 2, c!, "#f2d04a");
    r.line(1, 28, -2, 29, "#c0392b");
  },
  cobra(r, [a, b, c]) {
    blob(r, 10, 34, 30, 10, a!);
    blob(r, 16, 28, 22, 9, a!);
    r.rect(20, 14, 9, 18, a!);
    r.ellipse(12, 4, 24, 20, shade(a!, -0.1));
    r.ellipse(16, 7, 16, 14, b!);
    r.rect(22, 10, 4, 2, OUTLINE);
    r.rect(21, 12, 2, 2, OUTLINE);
    r.rect(25, 12, 2, 2, OUTLINE);
    blob(r, 17, 2, 14, 9, a!);
    eye(r, 19, 4, 2, OUTLINE, c!);
    eye(r, 26, 4, 2, OUTLINE, c!);
    r.line(18, 10, 14, 12, c!);
  },
  bat(r, [a, b, c]) {
    r.poly([[22, 20], [2, 10], [6, 18], [2, 26], [10, 24], [14, 30], [22, 28]], b!);
    r.poly([[26, 20], [46, 10], [42, 18], [46, 26], [38, 24], [34, 30], [26, 28]], b!);
    r.line(22, 20, 4, 11, shade(b!, -0.4));
    r.line(26, 20, 44, 11, shade(b!, -0.4));
    blob(r, 17, 16, 14, 18, a!);
    r.poly([[18, 18], [19, 10], [22, 17]], a!);
    r.poly([[26, 17], [29, 10], [30, 18]], a!);
    eye(r, 19, 20, 3, c!, "#ffd0c0");
    eye(r, 26, 20, 3, c!, "#ffd0c0");
    r.rect(22, 27, 1, 2, "#fffaf0");
    r.rect(25, 27, 1, 2, "#fffaf0");
  },
  boar(r, [a, b, c]) {
    blob(r, 12, 16, 32, 22, a!);
    for (let x = 16; x < 40; x += 3) r.line(x, 15, x + 1, 12, shade(a!, -0.4));
    blob(r, 2, 18, 18, 16, b!);
    r.ellipse(0, 26, 8, 7, shade(b!, 0.2));
    r.rect(1, 28, 2, 2, OUTLINE);
    r.rect(4, 28, 2, 2, OUTLINE);
    r.poly([[6, 33], [3, 28], [8, 31]], c!);
    eye(r, 9, 21, 3, "#c0392b", "#f2d04a");
    r.poly([[10, 16], [14, 10], [16, 17]], shade(a!, -0.2));
    for (const x of [14, 22, 32, 38]) r.rect(x, 36, 4, 7, shade(a!, -0.35));
  },
  rooster(r, [a, b, c]) {
    r.poly([[30, 22], [46, 6], [44, 18], [47, 24], [36, 30]], c!);
    r.poly([[32, 24], [42, 12], [40, 26]], shade(c!, -0.35));
    blob(r, 14, 18, 24, 20, a!);
    r.ellipse(18, 24, 14, 10, b!);
    blob(r, 9, 6, 13, 14, a!);
    r.poly([[11, 6], [13, 1], [15, 5], [17, 0], [19, 6]], "#e74c3c");
    r.poly([[9, 11], [3, 13], [9, 15]], "#f2d04a");
    r.ellipse(10, 15, 4, 5, "#e74c3c");
    eye(r, 13, 9, 2);
    r.line(22, 38, 20, 45, "#e8a030");
    r.line(28, 38, 30, 45, "#e8a030");
    r.rect(17, 45, 5, 1, "#e8a030");
    r.rect(29, 45, 5, 1, "#e8a030");
  },
  scorpion(r, [a, b, c]) {
    r.ellipse(36, 26, 8, 8, b!);
    r.ellipse(38, 18, 8, 8, b!);
    r.ellipse(36, 10, 8, 8, b!);
    r.ellipse(30, 5, 8, 7, b!);
    r.poly([[28, 6], [24, 10], [27, 4]], c!);
    for (let i = 0; i < 4; i++) {
      r.line(14 + i * 5, 34, 10 + i * 5, 42, a!);
      r.line(16 + i * 5, 34, 20 + i * 5, 42, a!);
    }
    blob(r, 12, 24, 28, 13, a!);
    r.line(14, 28, 6, 22, a!);
    blob(r, 0, 14, 10, 10, a!);
    r.rect(0, 18, 4, 2, shade(a!, -0.5));
    eye(r, 13, 26, 2, c!, "#ffd0c0");
    eye(r, 17, 26, 2, c!, "#ffd0c0");
  },
  bandit(r, [a, b, c]) {
    r.rect(17, 38, 5, 8, shade(a!, -0.3));
    r.rect(26, 38, 5, 8, shade(a!, -0.3));
    r.rect(15, 44, 7, 3, OUTLINE);
    r.rect(26, 44, 7, 3, OUTLINE);
    r.poly([[14, 20], [34, 20], [36, 40], [12, 40]], a!);
    r.rect(14, 30, 22, 3, shade(c!, -0.1));
    r.ellipse(15, 4, 18, 18, b!);
    r.ellipse(14, 2, 20, 10, c!);
    r.poly([[32, 6], [40, 4], [36, 10]], c!);
    r.rect(15, 13, 18, 6, shade(a!, 0.1));
    eye(r, 18, 9, 3);
    eye(r, 26, 9, 3);
    r.rect(17, 7, 5, 1, OUTLINE);
    r.rect(25, 7, 5, 1, OUTLINE);
    r.line(10, 22, 4, 44, "#8a6a3a");
    r.line(11, 22, 5, 44, "#6a4a2a");
    r.ellipse(8, 22, 8, 6, b!);
  },
  mud(r, [a, b, c]) {
    r.ellipse(4, 34, 40, 10, shade(a!, -0.35));
    blob(r, 6, 12, 36, 32, a!);
    r.ellipse(30, 6, 8, 10, a!);
    r.ellipse(12, 18, 8, 5, b!);
    r.ellipse(30, 30, 6, 4, b!);
    eye(r, 14, 22, 5, OUTLINE, c);
    eye(r, 26, 22, 5, OUTLINE, c);
    r.rect(19, 32, 8, 2, shade(a!, -0.5));
  },
  kite(r, [a, b, c]) {
    // Wau-style kite (crescent tail), a playful runaway toy with eyes
    r.line(40, 30, 47, 46, "#d8c8a0");
    r.poly([[24, 2], [42, 16], [24, 26], [6, 16]], a!);
    r.poly([[24, 6], [36, 16], [24, 22], [12, 16]], b!);
    r.poly([[24, 10], [30, 16], [24, 19], [18, 16]], c!);
    r.poly([[8, 30], [24, 24], [40, 30], [36, 40], [24, 34], [12, 40]], a!);
    r.poly([[12, 31], [24, 27], [36, 31], [33, 36], [24, 31], [15, 36]], b!);
    r.rect(23, 2, 2, 36, shade(a!, -0.4));
    r.rect(6, 15, 36, 2, shade(a!, -0.4));
    eye(r, 17, 11, 3);
    eye(r, 28, 11, 3);
  },
  crocodile(r, [a, b, c]) {
    r.poly([[46, 34], [79, 40], [78, 46], [44, 44]], a!);
    blob(r, 20, 26, 40, 24, a!);
    for (let x = 26; x < 58; x += 5) r.poly([[x, 28], [x + 2, 23], [x + 4, 28]], shade(a!, -0.3));
    r.ellipse(24, 38, 30, 10, b!);
    r.poly([[0, 34], [26, 26], [30, 38], [2, 40]], a!);
    r.poly([[0, 40], [28, 38], [28, 46], [4, 46]], shade(a!, -0.15));
    for (let x = 3; x < 26; x += 3) {
      r.poly([[x, 40], [x + 1, 43], [x + 2, 40]], c!);
      r.poly([[x + 1, 40], [x + 2, 37], [x + 3, 40]], c!);
    }
    r.ellipse(20, 22, 10, 9, a!);
    eye(r, 22, 24, 4, OUTLINE, "#f2d04a");
    for (const x of [26, 40, 52]) r.rect(x, 48, 6, 8, shade(a!, -0.35));
  },
  tiger(r, [a, b, c]) {
    r.line(64, 30, 76, 18, a!);
    r.line(65, 30, 77, 18, a!);
    r.line(76, 18, 78, 12, c!);
    blob(r, 22, 22, 46, 28, a!);
    for (let x = 28; x < 64; x += 6) r.poly([[x, 23], [x + 3, 23], [x + 1, 36]], c!);
    r.ellipse(26, 38, 30, 12, b!);
    blob(r, 4, 10, 28, 26, a!);
    r.poly([[6, 12], [8, 4], [13, 11]], a!);
    r.poly([[22, 11], [27, 4], [29, 12]], a!);
    r.ellipse(4, 22, 18, 14, b!);
    r.rect(12, 13, 2, 6, c!);
    r.rect(18, 13, 2, 6, c!);
    r.rect(8, 24, 5, 3, "#c0392b");
    r.rect(6, 22, 4, 3, c!);
    eye(r, 9, 17, 3, OUTLINE, "#a6e05a");
    eye(r, 19, 17, 3, OUTLINE, "#a6e05a");
    r.rect(7, 30, 2, 3, "#fffaf0");
    r.rect(13, 30, 2, 3, "#fffaf0");
    for (const x of [24, 34, 52, 60]) r.rect(x, 48, 7, 10, shade(a!, -0.2));
  },
};

export interface EnemyFrames {
  w: number;
  h: number;
  /** idle0, idle1 (one pixel bob), hurt (white flash). */
  frames: Raster[];
}

export function drawEnemy(art: EnemyArt, palette?: string[]): EnemyFrames {
  const [w, h] = ART_SIZE[art];
  const pal = DEFAULT_PALETTE[art].map((c, i) => palette?.[i] ?? c);
  const base = new Raster(w, h);
  const pad = 2;
  const body = new Raster(w - pad * 2, h - pad * 2);
  DRAW[art](body, pal);
  base.blit(body, pad, pad);
  base.outline(OUTLINE);
  const bob = new Raster(w, h);
  bob.blit(base, 0, 1);
  const hurt = new Raster(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (base.get(x, y)[3]) hurt.set(x, y, "#fffaf0");
  return { w, h, frames: [base, bob, hurt] };
}

/** Horizontal strip of the three frames. */
export function enemyStrip(art: EnemyArt, palette?: string[]): Raster {
  const f = drawEnemy(art, palette);
  const r = new Raster(f.w * 3, f.h);
  f.frames.forEach((fr, i) => r.blit(fr, i * f.w, 0));
  return r;
}
