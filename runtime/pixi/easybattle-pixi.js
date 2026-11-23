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
const fmt = (s, ...a) => s.replace(/\{(\d)\}/g, (_, i) => String(a[Number(i)]));
const TERRAIN = { forest: [0x2e4a3a, 0x4c7a3a, 0x2f5a2a], mountain: [0x3a3a52, 0x6a6a7a, 0x4a4a5a], cave: [0x3a3a52, 0x6a6a7a, 0x4a4a5a], beach: [0x5aa8d8, 0xe8d8a0, 0xd8c890], water: [0x5aa8d8, 0xe8d8a0, 0xd8c890], road: [0x7ab8d8, 0xb8946a, 0xa07a52], town: [0x7ab8d8, 0xb8946a, 0xa07a52], grass: [0x7ab8e0, 0x79c48a, 0x5aa86a] };

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
  return { db, tex, fx, sfx, scripted, party, xpToNext: (l) => xpToNext(db, l), heroStats, itemNames: data.itemNames ?? {}, start: (app, setup, opts = {}) => new BattleUI(PIXI, app, { db, tex, fx, sfx, itemNames: data.itemNames ?? {} }, setup, opts) };
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
    return TEXT[k][this.lang] ?? TEXT[k].en;
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
    this.menuBox = this.panel(8, 196, 162, 68);
    this.menuBox.visible = false;
    this.view.addChild(this.menuBox);
    this.cursor = this.text("▼", 10, 0xffd27a);
    this.cursor.visible = false;
    this.view.addChild(this.cursor);
    this.refresh();
  }

  refresh() {
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
    this.msg.text = s;
  }

  center(i) {
    const sp = this.sprites[i];
    return { x: sp.s.x + sp.w / 2, y: sp.s.y + sp.h / 2 };
  }

  popup(i, str, color) {
    const t = this.text(str, 10, color);
    const c = this.center(i);
    t.anchor.set(0.5);
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
    if (this.engine.actors[i].side === 1 || this.auto) {
      await this.wait(0.25);
      return this.run(this.engine.auto());
    }
    this.actor = i;
    const sp = this.sprites[i];
    sp.s.x = sp.home.x - 10;
    this.commands();
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
        if (sp.enemy) sp.s.x = sp.home.x + 12;
        else this.heroFrame(ev.actor, "atk0");
        await this.wait(0.2);
        this.heroFrame(ev.actor, "atk1");
        for (const t of ev.targets) this.playFx(ev.fx, t);
        await this.wait(0.3);
        sp.s.x = sp.home.x;
        this.heroFrame(ev.actor, "idle");
        break;
      }
      case "item":
        this.used[ev.item] = (this.used[ev.item] ?? 0) + 1;
        this.say(fmt(this.t("uses"), this.nm(A[ev.actor]), this.itemName(ev.item)));
        for (const t of ev.targets) this.playFx("heal_plus", t);
        this.playSfx("powerup");
        await this.wait(0.4);
        this.sprites[ev.actor].s.x = this.sprites[ev.actor].home.x;
        break;
      case "defend":
        this.say(fmt(this.t("defending"), this.nm(A[ev.actor])));
        this.sprites[ev.actor].s.x = this.sprites[ev.actor].home.x;
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

  focus(k) {
    this.sel = k;
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
        return { label: `skill:${s}`, text: `${this.nm(sk)}  ${sk.mp ?? 0}`, disabled: (sk.mp ?? 0) > a.mp, run: () => this.targets({ kind: "skill", skill: s }, sk.target) };
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
      ...pool.map((t) => ({ label: `target:${t}`, target: t, text: `${this.nm(this.engine.actors[t])}  ${this.engine.actors[t].hp}/${this.engine.actors[t].max.hp}`, run: () => this.run({ ...action, target: t }) })),
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
    if (["ArrowDown", "s", "S", "ArrowRight", "d", "D"].includes(e.key)) step(1);
    else if (["ArrowUp", "w", "W", "ArrowLeft", "a", "A"].includes(e.key)) step(-1);
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
    const box = this.panel(120, 60, 240, 30 + (this.result === "win" ? 14 * (1 + this.rewards.drops.length + this.rewards.levels.length) : 0));
    box.label = "result";
    const title = this.text(this.t(this.result), 14, 0xffd27a);
    title.anchor.set(0.5, 0);
    title.position.set(120, 4);
    box.addChild(title);
    if (this.result === "win") {
      const lines = [fmt(this.t("xp"), this.rewards.xp, this.rewards.coins), ...this.rewards.drops.map((d) => fmt(this.t("got"), this.itemName(d.item), d.n)), ...this.rewards.levels.map((l) => fmt(this.t("level"), this.nm(this.db.heroes.find((h) => h.id === l.id)), l.to))];
      lines.forEach((s, k) => {
        const t = this.text(s, 10, k > this.rewards.drops.length ? COLORS.heal : COLORS.text);
        t.position.set(10, 26 + k * 14);
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
