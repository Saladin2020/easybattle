/**
 * Battle screen geometry (480×270) for every layout / status combination. The export writes these rectangles into
 * easybattle.json (`ui.layouts`), so the Godot and Pixi runtimes draw from the same numbers the tests check.
 * Text cells are font cells: a มะขาม 16 cell is 22 px tall (tone marks rows 0-3, upper vowels 4-8, body 9-17,
 * lower vowels 19-21); a มะขาม 8 cell is 15 px tall (Latin ink rows 6-11).
 */
import type { UiBackdrop, UiLayout, UiSettings, UiStatus } from "./types.js";

export const SCREEN = { w: 480, h: 270 } as const;
export const FONT16 = { id: "makham-16", size: 16, line: 22, marksTop: 0, upperTop: 4, bodyTop: 9, bodyBottom: 17, lowerBottom: 21 } as const;
export const FONT8 = { id: "makham-8", size: 8, line: 15, inkTop: 6, inkBottom: 11 } as const;
/** Easy Portrait bust (64×64) area shown on a status card. */
export const PORTRAIT_CROP = { x: 12, y: 4, w: 40, h: 40 } as const;
/** Hero sheet rows: side-view sheets use row 1 (facing left), Easy Sprite top-down sheets row 2 (back). */
export const SHEET_ROW = { side: 1, back: 2 } as const;
export const HERO_FRAMES = { idle: 0, cheer: 16, atk0: 18, atk1: 19, hurt: 20, ko: 23 } as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface CardRects {
  rect: Rect;
  portrait: Rect;
  lv: Rect;
  /** Text cells (font cell boxes) and bars. */
  lifeLabel: Rect;
  lifeBar: Rect;
  powLabel: Rect;
  powBar: Rect;
  state: Rect;
  /** Compact cards (4 heroes) leave the LIFE / POW words out and show numbers only. */
  compact: boolean;
}
export interface SlotRects {
  /** Centre x of the hero and the 2× sprite cell (96×96). */
  cx: number;
  sprite: Rect;
  /** Curved HP gauge box and its "HP" label cell (มะขาม 8). */
  arc: Rect;
  hpLabel: Rect;
}
export interface ScreenLayout {
  layout: UiLayout;
  status: UiStatus;
  /** Message window; backview: 3 text rows (row 0 = message / title, rows 1-2 = command grid). */
  window: Rect;
  textRows: Rect[];
  /** Command menu: classic = a list panel; backview = a 3 × 2 grid inside the window. */
  menu: Rect;
  grid: { cols: number; rows: number; cell: { w: number; h: number } } | null;
  partyPanel: Rect | null;
  field: Rect;
  strip: Rect | null;
  /** Enemy feet line (normal / boss) in the backview layout. */
  enemyBase: { normal: number; boss: number; top: number };
  slots: SlotRects[];
  cards: CardRects[];
  /** Scale of hero sprites. */
  heroScale: number;
}

export function resolveUi(ui: UiSettings = {}, opts: UiSettings = {}): Required<UiSettings> {
  const layout: UiLayout = opts.layout ?? ui.layout ?? "classic";
  let status: UiStatus = opts.status ?? ui.status ?? (layout === "backview" ? "cards" : "rows");
  if (layout === "backview" && status === "rows") status = "cards";
  const backdrop: UiBackdrop = opts.backdrop ?? ui.backdrop ?? "auto";
  return { layout, status, backdrop };
}

/** Backdrop picked for a terrain when backdrop is "auto". */
export function backdropFor(backdrop: UiBackdrop, terrain = "grass"): Exclude<UiBackdrop, "auto"> {
  if (backdrop !== "auto") return backdrop;
  return ["forest", "mountain", "cave"].includes(terrain) ? "forest" : "paddy";
}

const CARD_Y = 212;
const CARD_H = 56;

export function cardRects(n: number): CardRects[] {
  const gap = 4;
  const w = Math.floor((464 - gap * (n - 1)) / n);
  const compact = w < 140;
  return Array.from({ length: n }, (_, k) => {
    const x = 8 + k * (w + gap);
    const y = CARD_Y;
    const rx = compact ? x + 46 : x + 48;
    const rw = x + w - 4 - rx;
    return {
      rect: { x, y, w, h: CARD_H },
      portrait: { x: x + 4, y: y + 4, w: 40, h: 40 },
      lv: { x: x + 3, y: y + 43, w: 26, h: 10 },
      lifeLabel: { x: rx, y: y - 3, w: rw, h: FONT16.line },
      lifeBar: { x: rx, y: y + 16, w: rw, h: 3 },
      powLabel: { x: rx, y: y + 15, w: rw, h: FONT16.line },
      powBar: { x: rx, y: y + 34, w: rw, h: 3 },
      state: { x: rx, y: y + 33, w: rw, h: FONT16.line },
      compact,
    };
  });
}

/** Hero centres in the backview strip. */
export function slotCenters(n: number): number[] {
  if (n <= 1) return [240];
  if (n === 2) return [160, 320];
  if (n === 3) return [80, 240, 400];
  return Array.from({ length: n }, (_, k) => 72 + k * Math.floor(336 / (n - 1)));
}

export function screenLayout(layout: UiLayout, status: UiStatus, n: number): ScreenLayout {
  if (layout === "backview") {
    const st: UiStatus = status === "rows" ? "cards" : status;
    const window = { x: 8, y: 4, w: 464, h: 74 };
    const textRows = [0, 1, 2].map((r) => ({ x: 16, y: 6 + r * FONT16.line, w: 448, h: FONT16.line }));
    return {
      layout,
      status: st,
      window,
      textRows,
      menu: { x: 16, y: 6 + FONT16.line, w: 448, h: 2 * FONT16.line },
      grid: { cols: 3, rows: 2, cell: { w: 149, h: FONT16.line } },
      partyPanel: null,
      field: { x: 0, y: 0, w: 480, h: 146 },
      strip: { x: 0, y: 146, w: 480, h: 124 },
      enemyBase: { normal: 136, boss: 144, top: 80 },
      slots: slotCenters(n).map((cx) => ({
        cx,
        sprite: { x: cx - 48, y: 144, w: 96, h: 96 },
        arc: { x: cx - 66, y: 150, w: 26, h: 20 },
        hpLabel: { x: cx - 40, y: 146, w: 12, h: FONT8.line },
      })),
      cards: st === "cards" ? cardRects(n) : [],
      heroScale: 2,
    };
  }
  const cards = status === "cards";
  return {
    layout,
    status,
    window: { x: 8, y: 6, w: 464, h: 22 },
    textRows: [{ x: 8, y: 6, w: 464, h: 22 }],
    menu: cards ? { x: 8, y: 30, w: 162, h: 66 } : { x: 8, y: 196, w: 162, h: 68 },
    grid: null,
    partyPanel: status === "rows" ? { x: 176, y: 196, w: 296, h: 68 } : null,
    field: { x: 0, y: 0, w: 480, h: 270 },
    strip: null,
    enemyBase: { normal: 146, boss: 170, top: 98 },
    slots: Array.from({ length: n }, (_, k) => ({ cx: 356 + k * 22 + 24, sprite: { x: 356 + k * 22, y: 86 + k * 28, w: 48, h: 48 }, arc: { x: 0, y: 0, w: 0, h: 0 }, hpLabel: { x: 0, y: 0, w: 0, h: 0 } })),
    cards: cards ? cardRects(n) : [],
    heroScale: 1,
  };
}

/**
 * Backview enemy placement: one row, centred, feet on the enemy line (bosses lower and in front); alternate
 * enemies stand 4 px further back. Returns sprite rectangles (frame size) in enemy order.
 */
export function backviewEnemyRects(sizes: Array<{ w: number; h: number; boss?: boolean }>): Rect[] {
  const L = screenLayout("backview", "cards", 3).enemyBase;
  const total = sizes.reduce((s, e) => s + e.w, 0);
  const gap = Math.max(4, Math.min(36, Math.floor((456 - total) / Math.max(1, sizes.length + 1))));
  const span = total + gap * (sizes.length - 1);
  let x = Math.round(240 - span / 2);
  return sizes.map((e, k) => {
    const feet = e.boss ? L.boss : L.normal - (k % 2) * 4;
    const r = { x, y: feet - e.h, w: e.w, h: e.h };
    x += e.w + gap;
    return r;
  });
}

/** Classic enemy placement (unchanged from 0.1.0). */
export function classicEnemyRects(sizes: Array<{ w: number; h: number; boss?: boolean }>): Rect[] {
  return sizes.map((e, k) => {
    const cols = sizes.length > 3 ? 3 : sizes.length;
    const col = k % 3;
    const row = Math.floor(k / 3);
    let x = 36 + col * 60 + row * 28 + (cols === 3 ? 0 : 30);
    let y = 146 - e.h + row * 40 + (col % 2) * 16;
    if (e.boss) [x, y] = [70, 170 - e.h];
    return { x, y, w: e.w, h: e.h };
  });
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
export function inside(a: Rect, b: Rect = { x: 0, y: 0, ...SCREEN }): boolean {
  return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
}

/** All layouts for the export: `${layout}:${status}` → party size (1..4) → layout. */
export function exportLayouts(): Record<string, Record<number, ScreenLayout>> {
  const out: Record<string, Record<number, ScreenLayout>> = {};
  for (const [layout, statuses] of [["classic", ["rows", "cards", "none"]], ["backview", ["cards", "none"]]] as const) {
    for (const st of statuses) {
      const k = `${layout}:${st}`;
      out[k] = {};
      for (let n = 1; n <= 4; n++) out[k]![n] = screenLayout(layout, st, n);
    }
  }
  return out;
}

/** Status-card and gauge labels (th / en / ms). Thai uses มะขาม 16; numbers and Latin labels fit the same cells. */
export const UI_TEXT = {
  life: { th: "ชีวิต", en: "LIFE", ms: "NYAWA" },
  pow: { th: "พลัง", en: "POW", ms: "KUASA" },
  ready: { th: "พร้อม!", en: "READY!", ms: "SEDIA!" },
  wait: { th: "รอ...", en: "WAIT...", ms: "TUNGGU..." },
  down: { th: "หมดแรง", en: "DOWN", ms: "PENGSAN" },
  lv: { th: "Lv", en: "Lv", ms: "Lv" },
  hp: { th: "HP", en: "HP", ms: "HP" },
} as const;
export type UiTextKey = keyof typeof UI_TEXT;

/** Card state from the engine: the hero whose turn it is → ready; fallen → down; everyone else waits. */
export function cardState(hp: number, actor: number, current: number, commanding: boolean): "ready" | "wait" | "down" {
  if (hp <= 0) return "down";
  return actor === current && commanding ? "ready" : "wait";
}
