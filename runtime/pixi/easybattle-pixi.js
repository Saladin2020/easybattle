/**
 * Easy Battle — PixiJS v8 battle UI. Same engine as the Godot runtime (easybattle-core.js is generated from the
 * TypeScript engine), so the same seed and the same choices give the same battle.
 *
 *   import { loadBattle } from "./easybattle-pixi.js";
 *   const eb = await loadBattle(PIXI, "easybattle.json");
 *   const ui = eb.start(app, eb.scripted("plains_fields", 7), { lang: "th", onEnd: (result, rewards) => … });
 *
 * Keys: arrows / WASD, Enter / Z / Space, Esc / X. Mouse: click any button. Containers carry labels
 * (cmd:attack, cmd:skills, skill:<id>, item:<id>, target:<actor>, back) for tests.
 *
 * Layouts (opts.layout or the export's ui.layout): "classic" side view (default) or "backview" — a 16-bit style
 * screen with a message window on top, enemies on a paddy / forest field and the party seen from behind with curved
 * HP gauges. opts.status: "rows" (classic HP / MP rows), "cards" (portrait status cards: LIFE, POW, READY! / WAIT...)
 * or "none". Thai text in the backview and on cards uses the bundled มะขาม 16 / มะขาม 8 pixel fonts (Easy Font).
 */
import { Battle, xpToNext, heroStats, rollGroup, mulberry32, groupSeed } from "./easybattle-core.js";

const W = 480;
const H = 270;
const COLORS = { ink: 0x0d0906, wood: 0x2a1d13, wood2: 0x3a2819, accent: 0xf4ae3d, text: 0xf7ebd3, muted: 0x97805f, hp: 0xd0473a, mp: 0x3c8ce8, heal: 0x79c48a };
const TEXT = {
  attack: { th: "โจมตี", en: "Attack", ms: "Serang" },
  skills: { th: "ทักษะ", en: "Skills", ms: "Kemahiran" },
  items: { th: "ไอเทม", en: "Items", ms: "Barang" },
  defend: { th: "ป้องกัน", en: "Defend", ms: "Bertahan" },
  flee: { th: "หนี", en: "Flee", ms: "Lari" },
  back: { th: "กลับ", en: "Back", ms: "Kembali" },
  uses: { th: "{0} ใช้ {1}", en: "{0} uses {1}", ms: "{0} guna {1}" },
  appear: { th: "{0} ปรากฏตัว!", en: "{0} appeared!", ms: "{0} muncul!" },
  miss: { th: "พลาด", en: "Miss", ms: "Terlepas" },
  crit: { th: "คริติคอล!", en: "Critical!", ms: "Kritikal!" },
  weak: { th: "จุดอ่อน!", en: "Weak!", ms: "Lemah!" },
  win: { th: "ชนะแล้ว!", en: "Victory!", ms: "Menang!" },
  lose: { th: "พ่ายแพ้…", en: "Defeated…", ms: "Kalah…" },
  fled: { th: "หนีรอดแล้ว", en: "Got away safely", ms: "Berjaya lari" },
  noflee: { th: "หนีไม่พ้น!", en: "Can't escape!", ms: "Tak dapat lari!" },
  nomp: { th: "MP ไม่พอ", en: "Not enough MP", ms: "MP tak cukup" },
  skip: { th: "{0} ขยับไม่ได้ ({1})", en: "{0} can't move ({1})", ms: "{0} tak boleh bergerak ({1})" },
  xp: { th: "ได้ EXP {0} · เหรียญ {1}", en: "EXP {0} · coins {1}", ms: "EXP {0} · syiling {1}" },
  level: { th: "{0} เลเวล {1}!", en: "{0} reached level {1}!", ms: "{0} naik ke tahap {1}!" },
  got: { th: "ได้รับ {0} ×{1}", en: "Got {0} ×{1}", ms: "Dapat {0} ×{1}" },
  defending: { th: "{0} ตั้งการ์ด", en: "{0} braces", ms: "{0} bertahan" },
  who: { th: "ใช้กับใคร?", en: "Target?", ms: "Sasaran?" },
};
const BLUE = { fill: 0x2a3a9c, fill2: 0x3446b4, border: 0xf2f4ff, inner: 0x8a98e8, ink: 0x0d0906, sel: 0x5a6ef0, selText: 0xffe27a, text: 0xf7f8ff, muted: 0x8a90b8 };
const CARD = { fill: 0x1c2436, border: 0x6a7aa8, active: 0xffd23a, activeFill: 0x2c3a5c, life: 0x5ad06a, lifeLow: 0xe8c040, lifeCrit: 0xe0503a, pow: 0x4aa0f0, ready: 0xffe27a, wait: 0xa8b0c8, down: 0xe06a5a, lv: 0x0d0906 };
const fmt = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => String(a[Number(i)]));
const TERRAIN = { forest: [0x2e4a3a, 0x4c7a3a, 0x2f5a2a], mountain: [0x3a3a52, 0x6a6a7a, 0x4a4a5a], cave: [0x3a3a52, 0x6a6a7a, 0x4a4a5a], beach: [0x5aa8d8, 0xe8d8a0, 0xd8c890], water: [0x5aa8d8, 0xe8d8a0, 0xd8c890], road: [0x7ab8d8, 0xb8946a, 0xa07a52], town: [0x7ab8d8, 0xb8946a, 0xa07a52], grass: [0x7ab8e0, 0x79c48a, 0x5aa86a] };

/**
 * Backview enemy placement (same as src/shared/layout.ts backviewEnemyRects): one centred row, feet on the enemy
 * line, bosses lower; every other enemy stands 4 px further back.
 */
export function backviewEnemyRects(sizes, base) {
  const total = sizes.reduce((s, e) => s + e.w, 0);
  const gap = Math.max(4, Math.min(36, Math.floor((456 - total) / Math.max(1, sizes.length + 1))));
  const span = total + gap * (sizes.length - 1);
  let x = Math.round(240 - span / 2);
  return sizes.map((e, k) => {
    const feet = e.boss ? base.boss : base.normal - (k % 2) * 4;
    const r = { x, y: feet - e.h, w: e.w, h: e.h };
    x += e.w + gap;
    return r;
  });
}

export async function loadBattle(PIXI, url = "easybattle.json") {
  const base = new URL(url, location.href);
  const data = await (await fetch(base)).json();
  const db = data.db;
  const tex = {};
  const load = async (rel) => {
    try {
      const t = await PIXI.Assets.load(new URL(rel, base).href);
      t.source.scaleMode = "nearest";
      return t;
    } catch {
      return null;
    }
  };
  for (const a of new Set(db.enemies.map((e) => e.art))) tex[`enemy:${a}`] = await load(`enemies/${a}.png`);
  for (const h of db.heroes) tex[`hero:${h.id}`] = await load(`heroes/${h.sprite ?? h.id}.png`);
  const ui = data.ui ?? null;
  if (ui) {
    for (const h of db.heroes) {
      tex[`back:${h.id}`] = await load(`heroes/${h.back ?? `${h.id}_back`}.png`);
      tex[`face:${h.id}`] = await load(`portraits/${h.portrait ?? h.id}.png`);
    }
    for (const b of ["paddy", "forest"]) tex[`bd:${b}`] = await load(`backdrops/backview_${b}.png`);
  }
  let ef = null;
  if (ui?.fonts?.length) {
    try {
      const mod = await import(new URL("font/easyfont-pixi.js", base).href);
      ef = await mod.loadEasyFonts(PIXI, new URL("font/fonts/fonts.json", base).href);
    } catch (e) {
      console.warn("Easy Battle: pixel fonts not loaded, using Kanit", e);
    }
  }
  const fx = {};
  for (const id of data.fx ?? []) {
    const t = await load(`fx/${id}.png`);
    if (t) fx[id] = { tex: t, meta: await (await fetch(new URL(`fx/${id}.json`, base))).json() };
  }
  const sfx = {};
  for (const id of data.sfx ?? []) sfx[id] = new URL(`sfx/${id}.wav`, base).href;
  const scripted = (tableId, seed = 1) => {
    const t = db.encounters.find((x) => x.id === tableId);
    if (!t) throw new Error(`no encounter table ${tableId}`);
    const pick = rollGroup(t, mulberry32(groupSeed(seed)));
    return { table: t.id, seed, terrain: t.terrains[0] === "any" ? "grass" : t.terrains[0], enemies: pick.enemies.map((id) => ({ id, level: db.enemies.find((e) => e.id === id).level + (pick.levelBonus ?? 0) })) };
  };
  const party = (level = 4, ids) => (ids ?? db.heroes.slice(0, db.rules.partySize).map((h) => h.id)).map((id) => ({ id, level, xp: 0 }));
  return { db, tex, fx, sfx, ui, ef, scripted, party, xpToNext: (l) => xpToNext(db, l), heroStats, itemNames: data.itemNames ?? {}, start: (app, setup, opts = {}) => new BattleUI(PIXI, app, { db, tex, fx, sfx, ui, ef, itemNames: data.itemNames ?? {} }, setup, opts) };
}

class BattleUI {
  constructor(PIXI, app, res, setup, opts) {
    this.PIXI = PIXI;
    this.app = app;
    this.res = res;
    this.db = res.db;
    this.opts = opts;
    this.lang = opts.lang ?? "th";
    this.speed = opts.speed ?? 1;
    this.auto = !!opts.auto;
    this.used = {};
    this.state = "busy";
    const full = { ...setup, party: setup.party?.length ? setup.party : res.db.heroes.slice(0, 3).map((h) => ({ id: h.id, level: 4 })), items: setup.items ?? opts.items ?? {} };
    this.engine = new Battle(this.db, full);
    this.setup = full;
    this.ef = res.ef ?? null;
    const ui = res.ui;
    const layout = opts.layout ?? ui?.layout ?? "classic";
    let status = opts.status ?? ui?.status ?? (layout === "backview" ? "cards" : "rows");
    if (layout === "backview" && status === "rows") status = "cards";
    const nHeroes = Math.max(1, Math.min(4, this.engine.actors.filter((a) => a.side === 0).length));
    this.L = ui?.layouts?.[`${layout}:${status}`]?.[nHeroes] ?? null;
    this.layout = this.L ? layout : "classic";
    this.status = this.L ? status : "rows";
    this.backdrop = opts.backdrop ?? ui?.backdrop ?? "auto";
    this.turn = -1;
    this.view = new PIXI.Container();
    this.view.label = "battle";
    this.sprites = [];
    this.build();
    app.stage.addChild(this.view);
    this.keys = (e) => this.onKey(e);
    window.addEventListener("keydown", this.keys);
    const names = this.engine.actors.filter((a) => a.side === 1).map((a) => this.nm(a));
    this.say(fmt(this.t("appear"), names.join(", ")));
    this.wait(0.6).then(() => this.next());
  }

  t(k) {
    const e = TEXT[k] ?? this.res.ui?.text?.[k];
    return e[this.lang] ?? e.en;
  }
  /** Pixel-font text (มะขาม 16 / มะขาม 8) when bundled, else Kanit. y is the font cell top. */
  ptext(str, font = "makham-16", color = COLORS.text) {
    if (this.ef?.fonts[font]) {
      const t = this.ef.text(str, { font, fill: color });
      t.__pixel = font;
      return t;
    }
    const t = this.text(str, font === "makham-8" ? 8 : 10, color);
    t.__kanit = true;
    t.y = 0;
    return t;
  }
  setText(t, str) {
    if (t.__pixel) t.text = this.ef.shape(str);
    else t.text = str;
  }
  /** Width in pixels of a pixel-font text object. */
  textWidth(t) {
    return t.__pixel ? this.ef.measure(t.text, t.__pixel) : t.width;
  }
  place(t, x, y) {
    // Kanit labels sit 3 px lower so they look centred in the 22 px cells
    t.position.set(Math.round(x), Math.round(y + (t.__kanit ? 5 : 0)));
  }
  nm(e) {
    return e.name[this.lang] || e.name.th;
  }
  wait(s) {
    return new Promise((r) => setTimeout(r, this.speed <= 0 ? 0 : (s * 1000) / this.speed));
  }
  text(str, size = 10, color = COLORS.text) {
    const t = new this.PIXI.Text({ text: str, style: { fontFamily: "Kanit, sans-serif", fontSize: size * 2, fill: color, stroke: { color: COLORS.ink, width: 3 } } });
    t.scale.set(0.5);
    t.resolution = 2;
    return t;
  }
  panel(x, y, w, h) {
    const g = new this.PIXI.Graphics().rect(0, 0, w, h).fill({ color: COLORS.wood, alpha: 0.94 }).stroke({ color: COLORS.accent, width: 1, alignment: 1 });
    g.position.set(x, y);
    return g;
  }

  build() {
    if (this.layout === "backview") return this.buildBackview();
    const P = this.PIXI;
    const c = TERRAIN[this.setup.terrain ?? "grass"] ?? TERRAIN.grass;
    const bg = new P.Graphics().rect(0, 0, W, 90).fill(c[0]).rect(0, 40, W, 50).fill({ color: 0xffffff, alpha: 0.12 });
    bg.poly([0, 90, 0, 66, 60, 54, 130, 70, 210, 50, 300, 68, 380, 52, 480, 64, 480, 90]).fill({ color: c[2] }).poly([0, 90, 0, 66, 60, 54, 130, 70, 210, 50, 300, 68, 380, 52, 480, 64, 480, 90]).fill({ color: 0x000000, alpha: 0.35 });
    bg.rect(0, 86, W, 184).fill(c[1]).rect(0, 86, W, 3).fill(c[2]);
    for (let i = 0; i < 18; i++) bg.rect((i * 97 + 13) % W, 96 + ((i * 37) % 96), 6, 2).fill(c[2]);
    this.view.addChild(bg);
    this.actorsLayer = new P.Container();
    this.fxLayer = new P.Container();
    this.view.addChild(this.actorsLayer, this.fxLayer);
    const enemies = [];
    const heroes = [];
    this.engine.actors.forEach((a, i) => (a.side === 1 ? enemies : heroes).push(i));
    enemies.forEach((i, k) => {
      const a = this.engine.actors[i];
      const e = this.db.enemies.find((x) => x.id === a.id);
      const fw = e.boss ? 80 : 48;
      const fh = e.boss ? 64 : 48;
      const base = this.res.tex[`enemy:${e.art}`];
      const frames = [0, 1, 2].map((f) => new P.Texture({ source: base.source, frame: new P.Rectangle(f * fw, 0, fw, fh) }));
      const s = new P.Sprite(frames[0]);
      const cols = enemies.length > 3 ? 3 : enemies.length;
      const col = k % 3;
      const row = Math.floor(k / 3);
      let x = 36 + col * 60 + row * 28 + (cols === 3 ? 0 : 30);
      let y = 146 - fh + row * 40 + (col % 2) * 16;
      if (e.boss) [x, y] = [70, 170 - fh];
      s.position.set(x, y);
      s.label = `actor:${i}`;
      s.eventMode = "static";
      s.cursor = "pointer";
      s.on("pointertap", () => this.pickTarget(i));
      this.actorsLayer.addChild(s);
      this.sprites[i] = { s, frames, home: { x, y }, w: fw, h: fh, enemy: true };
    });
    heroes.forEach((i, k) => {
      const a = this.engine.actors[i];
      const base = this.res.tex[`hero:${a.id}`];
      const fr = (f) => (base ? new P.Texture({ source: base.source, frame: new P.Rectangle(f * 48, 48, 48, 48) }) : P.Texture.WHITE);
      const frames = { idle: fr(0), atk0: fr(18), atk1: fr(19), hurt: fr(20), ko: fr(23), cheer: fr(16) };
      const s = new P.Sprite(frames.idle);
      const x = 356 + k * 22;
      const y = 86 + k * 28;
      s.position.set(x, y);
      s.label = `actor:${i}`;
      s.eventMode = "static";
      s.on("pointertap", () => this.pickTarget(i));
      this.actorsLayer.addChild(s);
      this.sprites[i] = { s, frames, home: { x, y }, w: 48, h: 48, enemy: false };
    });
    this.msgBox = this.panel(8, 6, 464, 22);
    this.msg = this.text("", 10);
    this.msg.anchor.set(0.5, 0);
    this.msg.position.set(232, 4);
    this.msgBox.addChild(this.msg);
    this.view.addChild(this.msgBox);
    this.partyBox = this.panel(176, 196, 296, 68);
    this.partyBox.visible = this.status === "rows";
    this.rows = heroes.map((i, k) => {
      const y = 6 + k * 20;
      const name = this.text(this.nm(this.engine.actors[i]), 10);
      name.position.set(6, y - 2);
      const hpBg = new P.Graphics();
      const mpBg = new P.Graphics();
      const hpT = this.text("", 9);
      const mpT = this.text("", 9);
      hpT.position.set(170, y - 1);
      mpT.position.set(262, y - 1);
      this.partyBox.addChild(name, hpBg, mpBg, hpT, mpT);
      return { i, y, name, hpBg, mpBg, hpT, mpT };
    });
    this.view.addChild(this.partyBox);
    const m = this.L?.menu ?? { x: 8, y: 196, w: 162, h: 68 };
    this.menuBox = this.panel(m.x, m.y, m.w, m.h);
    this.menuBox.visible = false;
    this.view.addChild(this.menuBox);
    this.cursor = this.text("▼", 10, 0xffd27a);
    this.cursor.visible = false;
    this.view.addChild(this.cursor);
    if (this.status === "cards") this.buildCards();
    this.refresh();
  }

  // ------------------------------------------------------------ backview
  buildBackview() {
    const P = this.PIXI;
    const L = this.L;
    const terrain = this.setup.terrain ?? "grass";
    const bd = this.backdrop !== "auto" ? this.backdrop : ["forest", "mountain", "cave"].includes(terrain) ? "forest" : "paddy";
    const bt = this.res.tex[`bd:${bd}`];
    if (bt) {
      const bg = new P.Sprite(bt);
      bg.label = `backdrop:${bd}`;
      this.view.addChild(bg);
    } else this.view.addChild(new P.Graphics().rect(0, 0, W, L.field.h).fill(0x79c48a).rect(0, L.strip.y, W, L.strip.h).fill(0x1a120c));
    this.shadows = new P.Graphics();
    this.actorsLayer = new P.Container();
    this.heroLayer = new P.Container();
    this.fxLayer = new P.Container();
    this.view.addChild(this.shadows, this.actorsLayer, this.heroLayer);
    const enemies = [];
    const heroes = [];
    this.engine.actors.forEach((a, i) => (a.side === 1 ? enemies : heroes).push(i));
    const defs = enemies.map((i) => this.db.enemies.find((x) => x.id === this.engine.actors[i].id));
    const rects = backviewEnemyRects(defs.map((e) => ({ w: e.boss ? 80 : 48, h: e.boss ? 64 : 48, boss: !!e.boss })), L.enemyBase);
    enemies.forEach((i, k) => {
      const e = defs[k];
      const r = rects[k];
      const base = this.res.tex[`enemy:${e.art}`];
      const frames = [0, 1, 2].map((f) => new P.Texture({ source: base.source, frame: new P.Rectangle(f * r.w, 0, r.w, r.h) }));
      const s = new P.Sprite(frames[0]);
      s.position.set(r.x, r.y);
      s.label = `actor:${i}`;
      s.eventMode = "static";
      s.cursor = "pointer";
      s.on("pointertap", () => this.pickTarget(i));
      this.actorsLayer.addChild(s);
      this.shadows.ellipse(r.x + r.w / 2, r.y + r.h - 2, r.w / 2 - 6, 3).fill({ color: 0x000000, alpha: 0.28 });
      this.sprites[i] = { s, frames, home: { x: r.x, y: r.y }, w: r.w, h: r.h, enemy: true };
    });
    const row = this.res.ui.sheetRow;
    const F = this.res.ui.heroFrames;
    this.arcs = [];
    heroes.forEach((i, k) => {
      const a = this.engine.actors[i];
      const slot = L.slots[k];
      const back = this.res.tex[`back:${a.id}`];
      const side = this.res.tex[`hero:${a.id}`];
      const src = back ?? side;
      const y0 = (back ? row.back : row.side) * 48;
      const fr = (f) => (src ? new P.Texture({ source: src.source, frame: new P.Rectangle(f * 48, y0, 48, 48) }) : P.Texture.WHITE);
      const frames = { idle: fr(F.idle), atk0: fr(F.atk0), atk1: fr(F.atk1), hurt: fr(F.hurt), ko: fr(F.ko), cheer: fr(F.cheer) };
      const s = new P.Sprite(frames.idle);
      s.scale.set(L.heroScale);
      s.position.set(slot.sprite.x, slot.sprite.y);
      s.label = `actor:${i}`;
      s.eventMode = "static";
      s.on("pointertap", () => this.pickTarget(i));
      this.heroLayer.addChild(s);
      this.sprites[i] = { s, frames, home: { x: slot.sprite.x, y: slot.sprite.y }, w: slot.sprite.w, h: slot.sprite.h, enemy: false, back: !!back };
      const g = new P.Graphics();
      g.label = `arc:${i}`;
      const hp = this.ptext(this.t("hp"), "makham-8", 0xffffff);
      this.place(hp, slot.hpLabel.x, slot.hpLabel.y);
      hp.label = `arc-label:${i}`;
      this.view.addChild(g, hp);
      this.arcs.push({ i, g, hp, box: slot.arc });
    });
    // message window with the command grid in rows 1-2
    const w = L.window;
    this.msgBox = this.bluePanel(w.x, w.y, w.w, w.h);
    this.msgBox.label = "window";
    this.view.addChild(this.msgBox);
    this.msg = this.ptext("", "makham-16", BLUE.text);
    this.msg.label = "message";
    this.place(this.msg, L.textRows[0].x, L.textRows[0].y);
    this.view.addChild(this.msg);
    this.menuBox = new P.Container();
    this.menuBox.label = "menu";
    this.menuBox.position.set(L.menu.x, L.menu.y);
    this.menuBox.visible = false;
    this.view.addChild(this.menuBox);
    if (this.status === "cards") this.buildCards();
    this.view.addChild(this.fxLayer);
    this.cursor = new P.Graphics().poly([0, 0, 9, 0, 4.5, 5]).fill(0xffe27a).stroke({ color: COLORS.ink, width: 1 });
    this.cursor.visible = false;
    this.view.addChild(this.cursor);
    this.rows = [];
    this.refresh();
  }

  bluePanel(x, y, w, h) {
    const g = new this.PIXI.Graphics()
      .rect(0, 0, w, h).fill(BLUE.ink)
      .rect(1, 1, w - 2, h - 2).fill(BLUE.border)
      .rect(3, 3, w - 6, h - 6).fill(BLUE.inner)
      .rect(4, 4, w - 8, h - 8).fill(BLUE.fill)
      .rect(4, 4, w - 8, Math.floor((h - 8) / 2)).fill(BLUE.fill2);
    g.position.set(x, y);
    return g;
  }

  drawArc(a) {
    const actor = this.engine.actors[a.i];
    const { x, y, w, h } = a.box;
    const n = 16;
    const filled = actor.hp <= 0 ? 0 : Math.max(1, Math.ceil((n * actor.hp) / actor.max.hp));
    const ratio = actor.hp / actor.max.hp;
    const col = ratio > 0.5 ? CARD.life : ratio > 0.25 ? CARD.lifeLow : CARD.lifeCrit;
    a.g.clear();
    // quarter ring from the lower left up to the top right: the curved gauge of 16-bit back-view battles
    const cx = x + w;
    const cy = y + h;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const ang = Math.PI + (k + 0.5) * (Math.PI / 2 / n);
      pts.push([Math.round(cx + Math.cos(ang) * (w - 3)) - 2, Math.round(cy + Math.sin(ang) * (h - 3)) - 2]);
    }
    for (const [px, py] of pts) a.g.rect(px - 1, py - 1, 6, 6).fill(COLORS.ink);
    pts.forEach(([px, py], k) => a.g.rect(px, py, 4, 4).fill(k < filled ? col : 0x3a3020));
    pts.forEach(([px, py], k) => k < filled && a.g.rect(px, py, 4, 1).fill(0xd8ffd0));
    a.hp.alpha = actor.hp > 0 ? 1 : 0.5;
  }

  // ------------------------------------------------------------ status cards
  buildCards() {
    const P = this.PIXI;
    const L = this.L;
    const heroes = this.engine.actors.map((a, i) => i).filter((i) => this.engine.actors[i].side === 0);
    const crop = this.res.ui.portraitCrop;
    this.cards = heroes.map((i, k) => {
      const R = L.cards[k];
      const a = this.engine.actors[i];
      const c = new P.Container();
      c.label = `card:${i}`;
      const bg = new P.Graphics();
      const face = this.res.tex[`face:${a.id}`];
      const faces = face ? [0, 1, 2, 3].map((f) => new P.Texture({ source: face.source, frame: new P.Rectangle(f * 64 + crop.x, crop.y, crop.w, crop.h) })) : null;
      const portrait = faces ? new P.Sprite(faces[0]) : new P.Graphics().rect(0, 0, R.portrait.w, R.portrait.h).fill(parseInt((this.db.heroes.find((h) => h.id === a.id)?.color ?? "#f4ae3d").slice(1), 16));
      portrait.position.set(R.portrait.x, R.portrait.y);
      portrait.label = "portrait";
      const lvBg = new P.Graphics().rect(R.lv.x, R.lv.y, R.lv.w, R.lv.h).fill(CARD.lv).stroke({ color: CARD.border, width: 1, alignment: 1 });
      const lv = this.ptext("", "makham-8", 0xffffff);
      const life = this.ptext(R.compact ? "" : this.t("life"), "makham-16", 0xd8f0d8);
      const lifeV = this.ptext("", "makham-16", 0xffffff);
      const pow = this.ptext(R.compact ? "" : this.t("pow"), "makham-16", 0xd0e4ff);
      const powV = this.ptext("", "makham-16", 0xffffff);
      const state = this.ptext("", "makham-16", CARD.wait);
      life.label = "life";
      lifeV.label = "life-value";
      pow.label = "pow";
      powV.label = "pow-value";
      state.label = "state";
      lv.label = "lv";
      const bars = new P.Graphics();
      c.addChild(bg, portrait, bars, lvBg, lv, life, lifeV, pow, powV, state);
      this.view.addChild(c);
      return { i, R, c, bg, portrait, faces, lv, life, lifeV, pow, powV, state, bars };
    });
  }

  cardState(i) {
    const a = this.engine.actors[i];
    if (a.hp <= 0) return "down";
    return i === this.turn ? "ready" : "wait";
  }

  refreshCards() {
    for (const k of this.cards ?? []) {
      const { R } = k;
      const a = this.engine.actors[k.i];
      const st = this.cardState(k.i);
      const active = st === "ready";
      k.bg.clear().rect(R.rect.x, R.rect.y, R.rect.w, R.rect.h).fill(CARD.lv)
        .rect(R.rect.x + 1, R.rect.y + 1, R.rect.w - 2, R.rect.h - 2).fill(active ? CARD.active : CARD.border)
        .rect(R.rect.x + 2, R.rect.y + 2, R.rect.w - 4, R.rect.h - 4).fill(active ? CARD.activeFill : CARD.fill)
        .rect(R.portrait.x - 1, R.portrait.y - 1, R.portrait.w + 2, R.portrait.h + 2).fill(CARD.lv);
      if (k.faces) {
        const ratio = a.hp / a.max.hp;
        k.portrait.texture = k.faces[a.hp <= 0 ? 3 : this.result === "win" ? 1 : ratio <= 0.3 ? 2 : 0];
      }
      k.portrait.alpha = a.hp > 0 ? 1 : 0.55;
      this.setText(k.lv, `${this.t("lv")}${a.level}`);
      this.place(k.lv, R.lv.x + 2, R.lv.y - 4);
      this.place(k.life, R.lifeLabel.x, R.lifeLabel.y);
      this.place(k.pow, R.powLabel.x, R.powLabel.y);
      this.setText(k.lifeV, `${a.hp}/${a.max.hp}`);
      this.setText(k.powV, `${a.mp}/${a.max.mp}`);
      this.place(k.lifeV, R.lifeLabel.x + R.lifeLabel.w - this.textWidth(k.lifeV), R.lifeLabel.y);
      this.place(k.powV, R.powLabel.x + R.powLabel.w - this.textWidth(k.powV), R.powLabel.y);
      const ratio = a.hp / a.max.hp;
      const lc = ratio > 0.5 ? CARD.life : ratio > 0.25 ? CARD.lifeLow : CARD.lifeCrit;
      const bar = (r, v, col) => k.bars.rect(r.x - 1, r.y - 1, r.w + 2, r.h + 2).fill(CARD.lv).rect(r.x, r.y, r.w, r.h).fill(0x2a2a3a).rect(r.x, r.y, Math.round(r.w * v), r.h).fill(col);
      k.bars.clear();
      bar(R.lifeBar, Math.max(0, ratio), lc);
      bar(R.powBar, a.max.mp ? a.mp / a.max.mp : 0, CARD.pow);
      this.setText(k.state, this.t(st));
      k.state.tint = st === "ready" ? CARD.ready : st === "down" ? CARD.down : CARD.wait;
      if (!k.state.__pixel) k.state.style.fill = k.state.tint;
      this.place(k.state, R.state.x + Math.round((R.state.w - this.textWidth(k.state)) / 2), R.state.y);
      k.c.alpha = 1;
    }
  }

  refresh() {
    for (const a of this.arcs ?? []) this.drawArc(a);
    this.refreshCards();
    for (const r of this.rows) {
      const a = this.engine.actors[r.i];
      r.hpBg.clear().rect(80, r.y + 2, 86, 8).fill(COLORS.ink).rect(81, r.y + 3, Math.round((84 * a.hp) / a.max.hp), 6).fill(COLORS.hp);
      r.mpBg.clear().rect(214, r.y + 2, 46, 8).fill(COLORS.ink).rect(215, r.y + 3, Math.round((44 * a.mp) / Math.max(1, a.max.mp)), 6).fill(COLORS.mp);
      r.hpT.text = `${a.hp}/${a.max.hp}`;
      r.mpT.text = `${a.mp}`;
      r.name.alpha = a.hp > 0 ? 1 : 0.5;
    }
  }

  say(s) {
    if (this.layout === "backview") {
      const width = this.L.textRows[0].w;
      const text = this.ef ? this.ef.wrap(s, "makham-16", width).split("\n").slice(0, this.menuBox?.visible ? 1 : 3).join("\n") : s;
      if (this.msg.__pixel) this.msg.text = text;
      else this.msg.text = text;
      return;
    }
    this.msg.text = s;
  }

  center(i) {
    const sp = this.sprites[i];
    return { x: sp.s.x + sp.w / 2, y: sp.s.y + sp.h / 2 };
  }

  popup(i, str, color) {
    const c = this.center(i);
    let t;
    if (this.layout === "backview" && this.ef) {
      t = new this.PIXI.Container();
      const sh = this.ptext(str, "makham-16", COLORS.ink);
      const fg = this.ptext(str, "makham-16", color);
      const w = this.textWidth(fg);
      sh.position.set(-w / 2 + 1, -10);
      fg.position.set(-w / 2, -11);
      t.addChild(sh, fg);
    } else {
      t = this.text(str, 10, color);
      t.anchor.set(0.5);
    }
    t.position.set(c.x, c.y - 24);
    this.fxLayer.addChild(t);
    const start = performance.now();
    const tick = () => {
      const k = (performance.now() - start) / (600 / Math.max(this.speed, 0.01));
      t.y = c.y - 24 - 14 * Math.min(1, k);
      if (k >= 1) {
        this.app.ticker.remove(tick);
        t.destroy();
      }
    };
    this.app.ticker.add(tick);
  }

  playFx(id, i) {
    const f = this.res.fx[id];
    if (!f) return;
    const P = this.PIXI;
    const frames = Array.from({ length: f.meta.frames }, (_, k) => new P.Texture({ source: f.tex.source, frame: new P.Rectangle(k * f.meta.w, 0, f.meta.w, f.meta.h) }));
    const s = new P.AnimatedSprite(frames);
    s.anchor.set(0.5);
    const c = this.center(i);
    s.position.set(c.x, c.y);
    s.loop = false;
    s.animationSpeed = (f.meta.fps / 60) * this.speed;
    s.onComplete = () => s.destroy();
    this.fxLayer.addChild(s);
    s.play();
  }

  playSfx(id) {
    const url = this.res.sfx[id];
    if (!url || this.speed <= 0 || this.opts.mute) return;
    try {
      new Audio(url).play().catch(() => {});
    } catch {}
  }

  heroFrame(i, k) {
    const sp = this.sprites[i];
    if (sp && !sp.enemy) sp.s.texture = sp.frames[k];
  }
  enemyFrame(i, k) {
    const sp = this.sprites[i];
    if (sp && sp.enemy) sp.s.texture = sp.frames[k];
  }

  async next() {
    this.refresh();
    if (this.engine.over) return this.finish();
    const i = this.engine.current();
    if (i < 0) return this.finish();
    this.turn = this.engine.actors[i].side === 0 ? i : -1;
    this.refresh();
    if (this.engine.actors[i].side === 1 || this.auto) {
      await this.wait(0.25);
      return this.run(this.engine.auto());
    }
    this.actor = i;
    this.stepForward(i);
    this.commands();
  }

  stepForward(i) {
    const sp = this.sprites[i];
    if (this.layout === "backview") sp.s.y = sp.home.y - 6;
    else sp.s.x = sp.home.x - 10;
  }
  goHome(i) {
    const sp = this.sprites[i];
    sp.s.position.set(sp.home.x, sp.home.y);
  }

  async run(action) {
    this.state = "busy";
    this.menuBox.visible = false;
    this.cursor.visible = false;
    for (const ev of this.engine.act(action)) await this.show(ev);
    this.refresh();
    return this.next();
  }

  async show(ev) {
    const A = this.engine.actors;
    switch (ev.t) {
      case "act": {
        const sk = this.engine.skill(ev.skill);
        this.say(fmt(this.t("uses"), this.nm(A[ev.actor]), this.nm(sk)));
        this.playSfx(ev.sfx);
        const sp = this.sprites[ev.actor];
        if (sp.enemy) {
          if (this.layout === "backview") sp.s.y = sp.home.y + 8;
          else sp.s.x = sp.home.x + 12;
        } else this.heroFrame(ev.actor, "atk0");
        await this.wait(0.2);
        this.heroFrame(ev.actor, "atk1");
        for (const t of ev.targets) this.playFx(ev.fx, t);
        await this.wait(0.3);
        this.goHome(ev.actor);
        this.heroFrame(ev.actor, "idle");
        break;
      }
      case "item":
        this.used[ev.item] = (this.used[ev.item] ?? 0) + 1;
        this.say(fmt(this.t("uses"), this.nm(A[ev.actor]), this.itemName(ev.item)));
        for (const t of ev.targets) this.playFx("heal_plus", t);
        this.playSfx("powerup");
        await this.wait(0.4);
        this.goHome(ev.actor);
        break;
      case "defend":
        this.say(fmt(this.t("defending"), this.nm(A[ev.actor])));
        this.goHome(ev.actor);
        await this.wait(0.3);
        break;
      case "skip":
        this.say(fmt(this.t("skip"), this.nm(A[ev.actor]), this.nm(this.engine.status(ev.status))));
        await this.wait(0.4);
        break;
      case "miss":
        this.popup(ev.target, this.t("miss"), 0xcdb492);
        await this.wait(0.2);
        break;
      case "damage": {
        this.enemyFrame(ev.target, 2);
        this.heroFrame(ev.target, "hurt");
        if (!this.sprites[ev.target].enemy) this.playSfx("hurt");
        const label = ev.crit ? `${this.t("crit")} ${ev.amount}` : ev.weak ? `${this.t("weak")} ${ev.amount}` : String(ev.amount);
        this.popup(ev.target, label, this.sprites[ev.target].enemy ? 0xfffaf0 : 0xff8a7a);
        this.refresh();
        await this.wait(0.25);
        this.enemyFrame(ev.target, 0);
        this.heroFrame(ev.target, A[ev.target].hp > 0 ? "idle" : "ko");
        break;
      }
      case "heal":
        this.popup(ev.target, ev.mp ? `+${ev.amount} MP` : `+${ev.amount}`, ev.mp ? 0x7ab8ff : COLORS.heal);
        this.refresh();
        await this.wait(0.25);
        break;
      case "status": {
        const st = this.engine.status(ev.status);
        this.popup(ev.target, `${ev.on ? "+" : "−"}${this.nm(st)}`, parseInt((st.color ?? "#ffd27a").slice(1), 16));
        await this.wait(0.2);
        break;
      }
      case "tick":
        this.popup(ev.target, String(ev.amount), ev.amount < 0 ? 0xc39bd3 : COLORS.heal);
        this.refresh();
        await this.wait(0.2);
        break;
      case "down":
        if (this.sprites[ev.target].enemy) this.sprites[ev.target].s.alpha = 0.15;
        else this.heroFrame(ev.target, "ko");
        await this.wait(0.3);
        break;
      case "flee":
        this.say(ev.ok ? this.t("fled") : this.t("noflee"));
        await this.wait(0.5);
        break;
      case "nomp":
        this.say(this.t("nomp"));
        await this.wait(0.4);
        break;
    }
  }

  itemName(id) {
    const n = this.res.itemNames?.[id];
    return this.opts.itemName?.(id, this.lang) ?? (n ? n[this.lang] || n.th : id.replace(/_/g, " "));
  }

  menu(entries) {
    if (this.layout === "backview") return this.gridMenu(entries);
    this.menuBox.removeChildren().forEach((c) => c.destroy());
    this.buttons = [];
    const start = Math.max(0, Math.min(this.sel ?? 0, entries.length - 1));
    entries.forEach((e, k) => {
      const b = new this.PIXI.Container();
      b.label = e.label;
      b.eventMode = e.disabled ? "none" : "static";
      b.cursor = "pointer";
      const bg = new this.PIXI.Graphics();
      const t = this.text(e.text, 10, e.disabled ? COLORS.muted : COLORS.text);
      t.position.set(6, 0);
      b.addChild(bg, t);
      b.position.set(4, 3 + k * 12.5);
      b.on("pointertap", () => e.run());
      b.on("pointerover", () => this.focus(k));
      this.menuBox.addChild(b);
      this.buttons.push({ ...e, b, bg, t });
    });
    this.menuBox.visible = true;
    this.focus(entries.findIndex((e) => !e.disabled));
  }

  /** Backview: a 3 × 2 command grid inside the message window, paged when there are more than 6 entries. */
  gridMenu(entries) {
    const G = this.L.grid;
    this.menuBox.removeChildren().forEach((c) => c.destroy());
    this.buttons = [];
    entries.forEach((e, k) => {
      const b = new this.PIXI.Container();
      b.label = e.label;
      b.eventMode = e.disabled ? "none" : "static";
      b.cursor = "pointer";
      const bg = new this.PIXI.Graphics();
      let str = e.text;
      const t = this.ptext(str, "makham-16", e.disabled ? BLUE.muted : BLUE.text);
      const max = G.cell.w - 14;
      if (e.short && this.textWidth(t) > max) this.setText(t, (str = e.short));
      while (this.textWidth(t) > max && str.length > 1) this.setText(t, (str = str.slice(0, -1)));
      this.place(t, 10, 0);
      b.addChild(bg, t);
      b.on("pointertap", () => e.run());
      b.on("pointerover", () => this.focus(k));
      this.menuBox.addChild(b);
      this.buttons.push({ ...e, b, bg, t, open: e.disabled ? "none" : "static" });
    });
    this.menuBox.visible = true;
    this.focus(Math.max(0, entries.findIndex((e) => !e.disabled)));
  }

  layoutGrid() {
    const G = this.L.grid;
    const per = G.cols * G.rows;
    const page = Math.floor(Math.max(0, this.sel) / per);
    this.buttons.forEach((x, j) => {
      const on = Math.floor(j / per) === page;
      const p = j % per;
      x.b.visible = on;
      x.b.eventMode = on ? x.open : "none";
      x.b.position.set((p % G.cols) * G.cell.w, Math.floor(p / G.cols) * G.cell.h);
    });
    this.menuBox.page = page;
    this.menuBox.pages = Math.ceil(this.buttons.length / per);
  }

  focus(k) {
    this.sel = k;
    if (this.layout === "backview") {
      this.layoutGrid();
      const G = this.L.grid;
      this.buttons.forEach((x, j) => {
        x.bg.clear();
        if (j === k) x.bg.rect(2, 1, G.cell.w - 4, G.cell.h - 2).fill(BLUE.sel).poly([3, 7, 7, 11, 3, 15]).fill(BLUE.selText);
        x.t.tint = x.disabled ? BLUE.muted : j === k ? BLUE.selText : BLUE.text;
        if (!x.t.__pixel) x.t.style.fill = x.t.tint;
      });
      const f = this.buttons[k];
      if (f?.target !== undefined) this.point(f.target);
      return;
    }
    this.buttons.forEach((x, j) => {
      x.bg.clear();
      if (j === k) x.bg.rect(0, 0, 154, 12).fill(COLORS.accent);
      x.t.style.fill = x.disabled ? COLORS.muted : j === k ? 0x2a1606 : COLORS.text;
    });
    const f = this.buttons[k];
    if (f?.target !== undefined) this.point(f.target);
  }

  point(i) {
    const sp = this.sprites[i];
    this.cursor.visible = true;
    if (this.layout === "backview") {
      const y = sp.enemy ? sp.s.y - 6 : sp.home.y - 2;
      this.cursor.position.set(Math.round(sp.s.x + sp.w / 2 - 4.5), y);
      return;
    }
    this.cursor.position.set(sp.s.x + sp.w / 2 - 5, sp.s.y - 14);
  }

  commands() {
    this.state = "command";
    this.cursor.visible = false;
    const a = this.engine.actors[this.actor];
    this.say(this.nm(a));
    const hasItems = this.db.items.some((it) => (this.engine.items[it.item] ?? 0) > 0);
    this.sel = 0;
    this.menu([
      { label: "cmd:attack", text: this.t("attack"), run: () => this.targets({ kind: "attack" }, "enemy") },
      { label: "cmd:skills", text: this.t("skills"), disabled: !a.skills.length, run: () => this.skills() },
      { label: "cmd:items", text: this.t("items"), disabled: !hasItems, run: () => this.itemsMenu() },
      { label: "cmd:defend", text: this.t("defend"), run: () => this.run({ kind: "defend" }) },
      { label: "cmd:flee", text: this.t("flee"), run: () => this.run({ kind: "flee" }) },
    ]);
  }

  skills() {
    this.state = "skills";
    const a = this.engine.actors[this.actor];
    this.sel = 0;
    this.menu([
      ...a.skills.map((s) => {
        const sk = this.engine.skill(s);
        return { label: `skill:${s}`, text: `${this.nm(sk)}  ${sk.mp ?? 0}`, short: this.nm(sk), disabled: (sk.mp ?? 0) > a.mp, run: () => this.targets({ kind: "skill", skill: s }, sk.target) };
      }),
      { label: "back", text: this.t("back"), run: () => this.commands() },
    ]);
  }

  itemsMenu() {
    this.state = "items";
    this.sel = 0;
    this.menu([
      ...this.db.items.filter((it) => (this.engine.items[it.item] ?? 0) > 0).map((it) => ({ label: `item:${it.item}`, text: `${this.itemName(it.item)} ×${this.engine.items[it.item]}`, run: () => this.targets({ kind: "item", item: it.item }, it.target ?? "ally") })),
      { label: "back", text: this.t("back"), run: () => this.commands() },
    ]);
  }

  targets(action, kind) {
    if (kind === "self" || kind === "all_enemies" || kind === "all_allies") return this.run(action);
    this.state = "target";
    this.pending = action;
    this.say(this.t("who"));
    const pool = this.engine.alive(kind === "enemy" ? 1 : 0);
    this.sel = 0;
    this.menu([
      ...pool.map((t) => ({ label: `target:${t}`, target: t, text: `${this.nm(this.engine.actors[t])}  ${this.engine.actors[t].hp}/${this.engine.actors[t].max.hp}`, short: this.nm(this.engine.actors[t]), run: () => this.run({ ...action, target: t }) })),
      { label: "back", text: this.t("back"), run: () => this.commands() },
    ]);
  }

  pickTarget(i) {
    if (this.state !== "target") return;
    const b = this.buttons.find((x) => x.target === i);
    if (b) b.run();
  }

  onKey(e) {
    if (this.state === "done") {
      if (["Enter", "z", "Z", " "].includes(e.key)) this.close();
      return;
    }
    if (this.state === "busy" || !this.buttons) return;
    const n = this.buttons.length;
    const step = (d) => {
      let k = this.sel;
      for (let j = 0; j < n; j++) {
        k = (k + d + n) % n;
        if (!this.buttons[k].disabled) break;
      }
      this.focus(k);
    };
    const grid = this.layout === "backview" ? this.L.grid.cols : 1;
    if (["ArrowRight", "d", "D"].includes(e.key) || (grid === 1 && ["ArrowDown", "s", "S"].includes(e.key))) step(1);
    else if (["ArrowLeft", "a", "A"].includes(e.key) || (grid === 1 && ["ArrowUp", "w", "W"].includes(e.key))) step(-1);
    else if (["ArrowDown", "s", "S"].includes(e.key)) step(grid);
    else if (["ArrowUp", "w", "W"].includes(e.key)) step(-grid);
    else if (["Enter", "z", "Z", " "].includes(e.key)) this.buttons[this.sel]?.run();
    else if (["Escape", "x", "X"].includes(e.key) && this.state !== "command") this.commands();
    else return;
    e.preventDefault();
  }

  finish() {
    if (this.state === "done") return;
    this.state = "done";
    this.menuBox.visible = false;
    this.cursor.visible = false;
    this.result = this.engine.over;
    this.rewards = this.engine.rewards();
    this.turn = -1;
    this.refresh();
    const lines = this.result === "win" ? [fmt(this.t("xp"), this.rewards.xp, this.rewards.coins), ...this.rewards.drops.map((d) => fmt(this.t("got"), this.itemName(d.item), d.n)), ...this.rewards.levels.map((l) => fmt(this.t("level"), this.nm(this.db.heroes.find((h) => h.id === l.id)), l.to))] : [];
    const pixel = this.layout === "backview" && this.ef;
    const lh = pixel ? 22 : 14;
    const box = pixel ? this.bluePanel(100, 84, 280, Math.min(124, 34 + lh * lines.length)) : this.panel(120, 60, 240, 30 + (this.result === "win" ? 14 * (1 + this.rewards.drops.length + this.rewards.levels.length) : 0));
    box.label = "result";
    if (pixel) {
      const title = this.ptext(this.t(this.result), "makham-16", BLUE.selText);
      title.position.set(Math.round(140 - this.textWidth(title) / 2), 6);
      box.addChild(title);
    } else {
      const title = this.text(this.t(this.result), 14, 0xffd27a);
      title.anchor.set(0.5, 0);
      title.position.set(120, 4);
      box.addChild(title);
    }
    if (this.result === "win") {
      lines.slice(0, pixel ? 4 : lines.length).forEach((s, k) => {
        const col = k > this.rewards.drops.length ? COLORS.heal : COLORS.text;
        const t = pixel ? this.ptext(s, "makham-16", col) : this.text(s, 10, col);
        t.position.set(10, (pixel ? 28 : 26) + k * lh);
        box.addChild(t);
      });
      this.engine.actors.forEach((a, i) => a.side === 0 && a.hp > 0 && this.heroFrame(i, "cheer"));
      this.playSfx("coin");
    }
    this.view.addChild(box);
    this.say(this.t(this.result));
    this.opts.onEnd?.(this.result, this.rewards, this.used);
    if (this.opts.autoClose) this.wait(1.2).then(() => this.close());
  }

  close() {
    window.removeEventListener("keydown", this.keys);
    this.opts.onClose?.(this.result, this.rewards, this.used);
    if (!this.opts.keep) this.view.destroy({ children: true });
  }
}
