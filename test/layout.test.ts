import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportBattle } from "../src/lib/export.js";
import { backviewEnemyRects, cardState, classicEnemyRects, exportLayouts, inside, overlaps, resolveUi, screenLayout, UI_TEXT, type Rect } from "../src/shared/layout.js";
import { tempWorkspace } from "./helpers.js";

const LANGS = ["th", "en", "ms"] as const;
const COMBOS = [["classic", "rows"], ["classic", "cards"], ["classic", "none"], ["backview", "cards"], ["backview", "none"]] as const;
/** Enemy groups the sample tables can roll: up to 4 normal foes, or a boss with two helpers. */
const GROUPS = [[{ w: 48, h: 48 }], [{ w: 48, h: 48 }, { w: 48, h: 48 }, { w: 48, h: 48 }], [{ w: 48, h: 48 }, { w: 48, h: 48 }, { w: 48, h: 48 }, { w: 48, h: 48 }], [{ w: 48, h: 48 }, { w: 80, h: 64, boss: true }, { w: 48, h: 48 }]];
const within = (a: Rect, b: Rect) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
const noOverlap = (named: Array<[string, Rect]>) => {
  const bad: string[] = [];
  for (let i = 0; i < named.length; i++) for (let j = i + 1; j < named.length; j++) if (overlaps(named[i]![1], named[j]![1])) bad.push(`${named[i]![0]} × ${named[j]![0]}`);
  return bad;
};

describe("battle screen layout", () => {
  it("resolves settings (classic default, backview turns rows into cards)", () => {
    expect(resolveUi()).toEqual({ layout: "classic", status: "rows", backdrop: "auto" });
    expect(resolveUi({ layout: "backview" })).toEqual({ layout: "backview", status: "cards", backdrop: "auto" });
    expect(resolveUi({ layout: "backview", status: "rows" }).status).toBe("cards");
    expect(resolveUi({ layout: "backview", status: "none" }, { layout: "classic" })).toEqual({ layout: "classic", status: "none", backdrop: "auto" });
    expect(Object.keys(exportLayouts()).sort()).toEqual(["backview:cards", "backview:none", "classic:cards", "classic:none", "classic:rows"]);
  });

  for (const [layout, status] of COMBOS) {
    it(`${layout} + ${status} fits 480×270 with nothing overlapping (1-4 heroes, every enemy group)`, () => {
      for (let n = 1; n <= 4; n++) {
        const L = screenLayout(layout, status, n);
        expect(L.slots).toHaveLength(n);
        expect(L.cards).toHaveLength(status === "cards" ? n : 0);
        const named: Array<[string, Rect]> = [["window", L.window]];
        if (layout === "backview") L.slots.forEach((s, k) => named.push([`arc${k}`, s.arc], [`hp${k}`, s.hpLabel]));
        else named.push(["menu", L.menu]);
        if (L.partyPanel) named.push(["party", L.partyPanel]);
        L.cards.forEach((c, k) => named.push([`card${k}`, c.rect]));
        for (const [name, r] of named) expect(inside(r), `${name} n=${n}`).toBe(true);
        for (const s of L.slots) expect(inside(s.sprite), `sprite n=${n}`).toBe(true);
        for (const t of L.textRows) expect(within(t, L.window) || layout === "classic", "text row in window").toBe(true);
        if (layout === "backview") {
          expect(within(L.menu, L.window)).toBe(true);
          expect(L.grid!.cols * L.grid!.cell.w).toBeLessThanOrEqual(L.menu.w);
          expect(L.grid!.rows * L.grid!.cell.h).toBeLessThanOrEqual(L.menu.h);
        }
        for (const c of L.cards) for (const k of ["portrait", "lv", "lifeLabel", "lifeBar", "powLabel", "powBar", "state"] as const) {
          // text cells may poke 3 px above the card (tone-mark rows are empty in card labels), bars and pictures must be inside
          const r = c[k];
          const box = k.endsWith("Label") || k === "state" ? { ...c.rect, y: c.rect.y - 3, h: c.rect.h + 3 } : c.rect;
          expect(within(r, box), `${k} in card n=${n}`).toBe(true);
        }
        for (const g of GROUPS) {
          const enemies = layout === "backview" ? backviewEnemyRects(g) : classicEnemyRects(g);
          const all = [...named, ...enemies.map((e, k) => [`enemy${k}`, e] as [string, Rect])];
          for (const e of enemies) expect(inside(e), "enemy on screen").toBe(true);
          if (layout === "backview") {
            expect(noOverlap(all)).toEqual([]);
            for (const e of enemies) {
              expect(e.y).toBeGreaterThanOrEqual(L.enemyBase.top);
              expect(e.y + e.h).toBeLessThanOrEqual(L.strip!.y);
            }
          } else {
            // classic keeps the 0.1 formation (a boss may stand over its helpers); enemies must stay clear of the panels
            expect(noOverlap(all).filter((p) => !/^enemy\d+ × enemy/.test(p))).toEqual([]);
          }
        }
      }
    });
  }

  it("card states follow turn order: the commanding hero is READY!, fallen heroes DOWN, everyone else WAIT...", () => {
    expect(cardState(30, 2, 2, true)).toBe("ready");
    expect(cardState(30, 1, 2, true)).toBe("wait");
    expect(cardState(30, 2, 2, false)).toBe("wait");
    expect(cardState(0, 2, 2, true)).toBe("down");
    for (const k of ["life", "pow", "ready", "wait", "down", "lv", "hp"] as const) for (const l of LANGS) expect(UI_TEXT[k][l].length).toBeGreaterThan(0);
  });

  it("card words have no lower vowels (the 22 px cells are stacked tightly)", () => {
    for (const k of ["life", "pow", "ready", "wait", "down"] as const) expect(UI_TEXT[k].th).not.toMatch(/[\u0e38-\u0e3a]/);
  });
});

describe("status card text in มะขาม 16 / 8", () => {
  let root: string;
  let cleanup: () => Promise<void>;
  let adv16: Map<number, number> | null = null;
  let adv8: Map<number, number> | null = null;
  let shape: (s: string) => string = (s) => s;
  beforeAll(async () => {
    ({ root, cleanup } = await tempWorkspace());
    const res = await exportBattle(root, { preset: "pixi", bundle: false });
    const dir = path.join(root, "exports/easybattle-pixi/font");
    if (!res.fonts.length || !existsSync(path.join(dir, "fonts/makham-16.fnt"))) return;
    const parse = (f: string) => new Map([...readFileSync(path.join(dir, "fonts", f), "utf8").matchAll(/char id=(\d+).*?xadvance=(-?\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
    adv16 = parse("makham-16.fnt");
    adv8 = parse("makham-8.fnt");
    shape = (await import(pathToFileURL(path.join(dir, "easyfont-core.js")).href)).shapeThai;
  }, 120_000);
  afterAll(() => cleanup());
  const width = (s: string, adv: Map<number, number>) => [...shape(s)].reduce((w, c) => w + (adv.get(c.codePointAt(0)!) ?? 0), 0);

  it("labels and the largest numbers fit their cells in th / en / ms, for 1-4 heroes", (ctx) => {
    if (!adv16 || !adv8) return ctx.skip();
    for (const [layout, status] of [["backview", "cards"], ["classic", "cards"]] as const) {
      for (let n = 1; n <= 4; n++) {
        for (const c of screenLayout(layout, status, n).cards) {
          for (const l of LANGS) {
            const num = width("999/999", adv16);
            for (const [label, cell] of [[UI_TEXT.life[l], c.lifeLabel], [UI_TEXT.pow[l], c.powLabel]] as const) {
              const need = c.compact ? num : width(label, adv16) + 4 + num;
              expect(need, `${l} ${label} n=${n}`).toBeLessThanOrEqual(cell.w);
            }
            for (const s of ["ready", "wait", "down"] as const) expect(width(UI_TEXT[s][l], adv16), `${l} ${s} n=${n}`).toBeLessThanOrEqual(c.state.w);
            expect(width(`${UI_TEXT.lv[l]}99`, adv8) + 2, `lv n=${n}`).toBeLessThanOrEqual(c.lv.w);
          }
        }
      }
    }
  });
});
