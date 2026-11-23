/**
 * Backview battlefields drawn from code (no source images, no AI): a paddy field with sugar palms and a stilt hut,
 * or a forest edge with layered canopies. 480×270 including the dark party strip (y ≥ 146). CC0.
 */
import { mulberry32 } from "../shared/rng.js";
import { Raster, shade } from "./raster.js";

export const BACKDROPS = ["paddy", "forest"] as const;
export type BackdropId = (typeof BACKDROPS)[number];
const W = 480;
const STRIP = 146;

function sky(r: Raster, top: string, bottom: string, h: number) {
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const band = Math.floor(t * 6) / 6;
    r.rect(0, y, W, 1, mix(top, bottom, band));
  }
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i]! - v) * t).toString(16).padStart(2, "0")).join("")}`;
}

function cloud(r: Raster, x: number, y: number, w: number) {
  r.ellipse(x, y + 3, w, 7, "#f4f8f8");
  r.ellipse(x + Math.floor(w * 0.2), y, Math.floor(w * 0.45), 8, "#ffffff");
  r.ellipse(x + Math.floor(w * 0.5), y + 1, Math.floor(w * 0.35), 7, "#ffffff");
  r.rect(x + 2, y + 9, w - 4, 1, "#d8e6ec");
}

function sugarPalm(r: Raster, x: number, base: number, h: number, c: string) {
  r.rect(x, base - h, 2, h, shade(c, -0.25));
  const cy = base - h;
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    r.line(x + 1, cy, x + 1 + Math.round(Math.cos(ang) * 7), cy + Math.round(Math.sin(ang) * 5), c);
  }
  r.ellipse(x - 3, cy - 3, 8, 6, c);
}

function hut(r: Raster, x: number, base: number) {
  const roof = "#8a5a3a";
  r.rect(x + 2, base - 10, 2, 10, "#5a3a22");
  r.rect(x + 20, base - 10, 2, 10, "#5a3a22");
  r.rect(x, base - 18, 24, 8, "#b08a5a");
  r.rect(x + 8, base - 16, 5, 5, "#3a2818");
  r.poly([[x - 4, base - 18], [x + 12, base - 28], [x + 28, base - 18]], roof);
  r.rect(x - 4, base - 18, 32, 1, shade(roof, -0.3));
}

function strip(r: Raster, rnd: () => number) {
  for (let y = STRIP; y < 270; y++) r.rect(0, y, W, 1, mix("#2a1e14", "#0f0a07", Math.min(1, (y - STRIP) / 60)));
  r.rect(0, STRIP, W, 1, "#4a3a24");
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rnd() * W);
    const h = 2 + Math.floor(rnd() * 5);
    r.rect(x, STRIP - h + 2, 1, h, "#1e2a14");
  }
  for (let i = 0; i < 60; i++) r.rect(Math.floor(rnd() * W), STRIP + 4 + Math.floor(rnd() * 110), 2, 1, "#2e2216");
}

function tufts(r: Raster, rnd: () => number, y0: number, y1: number, n: number, dark: string, light: string) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * W);
    const y = y0 + Math.floor(rnd() * (y1 - y0));
    const k = 1 + (y - y0) / Math.max(1, y1 - y0);
    const h = Math.round(2 + 2 * k);
    r.line(x, y, x - 1, y - h, dark);
    r.line(x + 1, y, x + 1, y - h - 1, light);
    r.line(x + 2, y, x + 3, y - h, dark);
  }
}

export function drawBackdrop(id: BackdropId): Raster {
  const r = new Raster(W, 270, "#000000");
  const rnd = mulberry32(id === "paddy" ? 1701 : 2903);
  if (id === "paddy") {
    sky(r, "#7fb8e0", "#d8ecf0", 94);
    cloud(r, 40, 18, 46);
    cloud(r, 300, 10, 60);
    cloud(r, 420, 30, 40);
    r.poly([[0, 94], [0, 82], [70, 74], [150, 84], [240, 72], [330, 82], [420, 74], [480, 80], [480, 94]], "#8ab0a8");
    // tree line, sugar palms and a stilt hut on the far dike
    for (let x = -10; x < W; x += 14) r.ellipse(x, 88 + Math.floor(rnd() * 5), 20, 12, rnd() < 0.5 ? "#3f6e4a" : "#4a7a50");
    for (const [x, h] of [[30, 22], [52, 26], [118, 20], [206, 24], [228, 20], [352, 26], [374, 22], [440, 20]] as const) sugarPalm(r, x, 100, h, "#35603e");
    hut(r, 286, 101);
    r.rect(0, 99, W, 3, "#5a8a44");
    // paddy rows in perspective with dikes and water glints
    const top = 102;
    for (let y = top; y < STRIP; y++) r.rect(0, y, W, 1, mix("#7cb850", "#5c9e3a", (y - top) / (STRIP - top)));
    let y = top + 2;
    let gap = 2.5;
    while (y < STRIP - 2) {
      const step = Math.max(3, Math.round(gap));
      for (let x = (y * 7) % step; x < W; x += step + 1) {
        r.rect(x, y, 1, Math.max(1, Math.round(gap / 3)), "#4f8a30");
        if ((x + y) % 5 === 0) r.set(x + 1, y, "#a8d870");
      }
      if (y < 118) for (let k = 0; k < 6; k++) r.rect(Math.floor(rnd() * W), y + 1, 2, 1, "#b8e0e8");
      y += Math.max(2, Math.round(gap));
      gap *= 1.2;
    }
    for (const [y0, h] of [[108, 2], [122, 3]] as const) r.rect(0, y0, W, h, "#b89a62");
    r.poly([[228, 102], [236, 102], [300, STRIP], [262, STRIP]], "#b89a62");
    r.poly([[230, 102], [234, 102], [286, STRIP], [272, STRIP]], "#c8ac72");
    tufts(r, rnd, 134, STRIP, 70, "#3f7a2a", "#9ad05a");
  } else {
    sky(r, "#9cc8c0", "#d0e4d8", 70);
    for (let x = -12; x < W; x += 22) r.ellipse(x, 44 + Math.floor(rnd() * 10), 34, 30, "#2a4a34");
    for (let x = -16; x < W; x += 26) r.ellipse(x, 66 + Math.floor(rnd() * 8), 36, 28, rnd() < 0.5 ? "#35603e" : "#3a6a40");
    for (let x = -8; x < W; x += 18) {
      const c = rnd() < 0.5 ? "#4f8a44" : "#5a9a4a";
      const yy = 88 + Math.floor(rnd() * 8);
      r.ellipse(x, yy, 26, 18, c);
      r.ellipse(x + 6, yy + 2, 8, 5, shade(c, 0.25));
    }
    const top = 104;
    for (let y = top; y < STRIP; y++) r.rect(0, y, W, 1, mix("#86c050", "#6aaa3c", (y - top) / (STRIP - top)));
    for (const [x, y, w] of [[60, 116, 60], [190, 128, 90], [330, 112, 54], [400, 132, 70], [10, 134, 50]] as const) {
      r.ellipse(x, y, w, 8, "#8a6a44");
      r.ellipse(x + 4, y + 1, w - 8, 5, "#a07e52");
    }
    tufts(r, rnd, top + 2, STRIP, 130, "#3f7a2a", "#a8e060");
  }
  strip(r, rnd);
  return r;
}
