/* Easy Battle core — generated from src/shared/engine.ts by scripts/build-core.mjs. Do not edit. MIT. */
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/shared/rng.ts
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// src/shared/engine.ts
var ATTACK = { id: "attack", name: { th: "\u0E42\u0E08\u0E21\u0E15\u0E35", en: "Attack", ms: "Serang" }, kind: "physical", target: "enemy", power: 10, mp: 0, fx: "hit_sparks", sfx: "hit" };
function xpToNext(db, level) {
  const c = db.rules.xp;
  const l = level - 1;
  return c.base + c.step * l + c.quad * l * l;
}
function heroStats(h, level) {
  const out = {};
  for (const k of Object.keys(h.base)) out[k] = Math.floor(h.base[k] + (h.growth[k] ?? 0) * (level - 1));
  return out;
}
function enemyStats(db, e, level) {
  const out = {};
  const pct = 100 + db.rules.enemyScale * (level - e.level);
  for (const k of Object.keys(e.stats)) out[k] = Math.max(k === "hp" ? 1 : 0, Math.floor(e.stats[k] * pct / 100));
  return out;
}
function heroSkills(h, level) {
  return h.skills.filter((l) => l.level <= level).map((l) => l.skill);
}
var Battle = class {
  constructor(db, setup) {
    __publicField(this, "db", db);
    __publicField(this, "setup", setup);
    __publicField(this, "actors", []);
    __publicField(this, "round", 0);
    __publicField(this, "queue", []);
    __publicField(this, "log", []);
    __publicField(this, "over", null);
    __publicField(this, "items");
    __publicField(this, "rnd");
    __publicField(this, "noFlee");
    this.rnd = mulberry32(setup.seed);
    this.items = { ...setup.items ?? {} };
    this.noFlee = !!setup.noFlee;
    setup.party.forEach((p, i) => {
      const h = db.heroes.find((x) => x.id === p.id);
      if (!h) throw new Error(`Unknown hero "${p.id}"`);
      const max = heroStats(h, p.level);
      this.actors.push({ side: 0, index: i, id: h.id, name: h.name, level: p.level, hp: Math.min(max.hp, p.hp ?? max.hp), mp: Math.min(max.mp, p.mp ?? max.mp), max, statuses: [], defending: false, skills: heroSkills(h, p.level), weak: h.weak ?? [], resist: h.resist ?? [], immune: [], xp: p.xp ?? 0 });
    });
    setup.enemies.forEach((x, i) => {
      const e = db.enemies.find((y) => y.id === x.id);
      if (!e) throw new Error(`Unknown enemy "${x.id}"`);
      const lv = x.level ?? e.level;
      const max = enemyStats(db, e, lv);
      this.actors.push({ side: 1, index: i, id: e.id, name: e.name, level: lv, hp: max.hp, mp: max.mp, max, statuses: [], defending: false, skills: e.skills.map((s) => s.skill), weak: e.weak ?? [], resist: e.resist ?? [], immune: e.immune ?? [], xp: 0 });
      if (e.boss) this.noFlee = true;
    });
    this.newRound();
  }
  skill(id) {
    if (id === "attack") return this.db.skills.find((s2) => s2.id === "attack") ?? ATTACK;
    const s = this.db.skills.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown skill "${id}"`);
    return s;
  }
  status(id) {
    const s = this.db.statuses.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown status "${id}"`);
    return s;
  }
  alive(side) {
    const out = [];
    for (let i = 0; i < this.actors.length; i++) if (this.actors[i].side === side && this.actors[i].hp > 0) out.push(i);
    return out;
  }
  /** Stat with active buffs / debuffs (multipliers in %, applied in status order). */
  stat(a, k) {
    let v = a.max[k];
    const kind = k === "res" ? "mag" : k;
    for (const s of a.statuses) {
      const d = this.status(s.id);
      if (d.kind === kind && k !== "res") v = Math.floor(v * (d.amount ?? 100) / 100);
    }
    return v;
  }
  newRound() {
    this.round += 1;
    this.log.push({ t: "round", round: this.round });
    const order = [];
    for (let i = 0; i < this.actors.length; i++) if (this.actors[i].hp > 0) order.push(i);
    order.sort((x, y) => {
      const a = this.actors[x];
      const b = this.actors[y];
      const sa = this.stat(a, "spd");
      const sb = this.stat(b, "spd");
      if (sa !== sb) return sb - sa;
      if (a.side !== b.side) return a.side - b.side;
      return a.index - b.index;
    });
    this.queue = order;
  }
  /** Actor index whose turn it is (skipping the fallen), or -1 when the battle is over. */
  current() {
    while (!this.over) {
      while (this.queue.length && this.actors[this.queue[0]].hp <= 0) this.queue.shift();
      if (!this.queue.length) {
        this.newRound();
        continue;
      }
      const i = this.queue[0];
      const a = this.actors[i];
      a.defending = false;
      const blocker = a.statuses.find((s) => {
        const k = this.status(s.id).kind;
        return k === "sleep" || k === "stun";
      });
      if (blocker) {
        this.log.push({ t: "skip", actor: i, status: blocker.id });
        this.endTurn(i);
        continue;
      }
      return i;
    }
    return -1;
  }
  /** The player chooses for side 0; call auto() for enemies (or for an auto-battle). */
  act(action) {
    const start = this.log.length;
    const i = this.current();
    if (i < 0) return [];
    const a = this.actors[i];
    this.log.push({ t: "turn", actor: i });
    if (action.kind === "defend") {
      a.defending = true;
      this.log.push({ t: "defend", actor: i });
    } else if (action.kind === "flee") {
      this.flee(i);
    } else if (action.kind === "item") {
      this.useItem(i, action.item ?? "", action.target);
    } else {
      const sk = this.skill(action.kind === "attack" ? "attack" : action.skill ?? "attack");
      const cost = sk.mp ?? 0;
      if (cost > a.mp) this.log.push({ t: "nomp", actor: i, skill: sk.id });
      else {
        a.mp -= cost;
        this.useSkill(i, sk, action.target);
      }
    }
    if (!this.over) this.endTurn(i);
    this.checkEnd();
    return this.log.slice(start);
  }
  targetsFor(i, sk, target) {
    const a = this.actors[i];
    const foes = this.alive(a.side === 0 ? 1 : 0);
    const friends = this.alive(a.side);
    switch (sk.target) {
      case "self":
        return [i];
      case "all_enemies":
        return foes;
      case "all_allies":
        return friends;
      case "ally":
        return target !== void 0 && friends.includes(target) ? [target] : friends.slice(0, 1);
      default:
        return target !== void 0 && foes.includes(target) ? [target] : foes.slice(0, 1);
    }
  }
  useSkill(i, sk, target) {
    const a = this.actors[i];
    const targets = this.targetsFor(i, sk, target);
    this.log.push({ t: "act", actor: i, skill: sk.id, targets, ...sk.fx ? { fx: sk.fx } : {}, ...sk.sfx ? { sfx: sk.sfx } : {} });
    for (const ti of targets) {
      const t = this.actors[ti];
      if (sk.kind === "physical" || sk.kind === "magic") {
        if (t.hp <= 0) continue;
        const acc = sk.accuracy ?? 95;
        if (this.rnd() * 100 >= acc) {
          this.log.push({ t: "miss", actor: i, target: ti });
          continue;
        }
        let crit = false;
        if (sk.kind === "physical") crit = this.rnd() * 100 < this.db.rules.crit;
        const variance = 90 + Math.floor(this.rnd() * 21);
        const power = sk.power ?? 10;
        let raw = sk.kind === "physical" ? Math.floor(this.stat(a, "atk") * power / 10) - Math.floor(this.stat(t, "def") / 2) : Math.floor(this.stat(a, "mag") * power / 10) - Math.floor(t.max.res / 2);
        if (raw < 1) raw = 1;
        raw = Math.floor(raw * variance / 100);
        if (crit) raw = Math.floor(raw * 3 / 2);
        const el = sk.element ?? "none";
        const immune = el !== "none" && t.immune.includes(el);
        const weak = el !== "none" && t.weak.includes(el);
        const resist = el !== "none" && t.resist.includes(el);
        if (weak) raw = Math.floor(raw * 3 / 2);
        if (resist) raw = Math.floor(raw / 2);
        if (t.defending) raw = Math.floor(raw / 2);
        if (raw < 1) raw = 1;
        if (immune) raw = 0;
        t.hp = Math.max(0, t.hp - raw);
        this.log.push({ t: "damage", target: ti, amount: raw, crit, weak, resist, immune });
        if (raw > 0) this.wake(ti);
        if (t.hp <= 0) {
          t.statuses = [];
          this.log.push({ t: "down", target: ti });
          continue;
        }
        if (sk.status) this.tryStatus(ti, sk.status.id, sk.status.chance ?? 100);
      } else if (sk.kind === "heal") {
        if (t.hp <= 0) continue;
        const amount = Math.min(t.max.hp - t.hp, Math.floor(this.stat(a, "mag") * (sk.power ?? 10) / 10));
        t.hp += amount;
        this.log.push({ t: "heal", target: ti, amount, mp: false });
        if (sk.status) this.tryStatus(ti, sk.status.id, sk.status.chance ?? 100);
      } else if (sk.kind === "cure") {
        this.cure(ti, sk.cures ?? []);
      } else if (sk.status) {
        if (t.hp > 0) this.tryStatus(ti, sk.status.id, sk.status.chance ?? 100);
      }
    }
  }
  tryStatus(ti, id, chance) {
    if (chance < 100 && this.rnd() * 100 >= chance) return;
    const t = this.actors[ti];
    const d = this.status(id);
    const cur = t.statuses.find((s) => s.id === id);
    if (cur) cur.turns = d.turns;
    else t.statuses.push({ id, turns: d.turns });
    this.log.push({ t: "status", target: ti, status: id, on: true });
  }
  negative(id) {
    const d = this.status(id);
    if (d.kind === "poison" || d.kind === "sleep" || d.kind === "stun") return true;
    if (d.kind === "regen") return false;
    return (d.amount ?? 100) < 100;
  }
  cure(ti, ids) {
    const t = this.actors[ti];
    const keep = [];
    for (const s of t.statuses) {
      const hit = ids.length ? ids.includes(s.id) : this.negative(s.id);
      if (hit) this.log.push({ t: "status", target: ti, status: s.id, on: false });
      else keep.push(s);
    }
    t.statuses = keep;
  }
  wake(ti) {
    const t = this.actors[ti];
    const keep = [];
    for (const s of t.statuses) {
      if (this.status(s.id).kind === "sleep") this.log.push({ t: "status", target: ti, status: s.id, on: false });
      else keep.push(s);
    }
    t.statuses = keep;
  }
  useItem(i, item, target) {
    const def = this.db.items.find((x) => x.item === item);
    if (!def || (this.items[item] ?? 0) < 1) {
      this.log.push({ t: "nomp", actor: i, skill: `item:${item}` });
      return;
    }
    this.items[item] = (this.items[item] ?? 0) - 1;
    const targets = this.targetsFor(i, { target: def.target ?? "ally" }, target);
    this.log.push({ t: "item", actor: i, item, targets });
    for (const ti of targets) {
      const t = this.actors[ti];
      if (def.hp) {
        const amount = Math.min(t.max.hp - t.hp, def.hp);
        t.hp += amount;
        this.log.push({ t: "heal", target: ti, amount, mp: false });
      }
      if (def.mp) {
        const amount = Math.min(t.max.mp - t.mp, def.mp);
        t.mp += amount;
        this.log.push({ t: "heal", target: ti, amount, mp: true });
      }
      if (def.cures) this.cure(ti, def.cures);
    }
  }
  flee(i) {
    const avg = (side) => {
      const xs = this.alive(side);
      let s = 0;
      for (const x of xs) s += this.stat(this.actors[x], "spd");
      return xs.length ? Math.floor(s / xs.length) : 0;
    };
    let chance = this.db.rules.flee + 2 * (avg(0) - avg(1));
    chance = Math.max(10, Math.min(95, chance));
    if (this.noFlee || this.actors[i].side !== 0) chance = 0;
    const ok = chance > 0 && this.rnd() * 100 < chance;
    this.log.push({ t: "flee", ok, chance });
    if (ok) {
      this.over = "fled";
      this.log.push({ t: "end", result: "fled" });
    }
  }
  endTurn(i) {
    if (this.queue[0] === i) this.queue.shift();
    const a = this.actors[i];
    if (a.hp <= 0) return;
    const keep = [];
    for (const s of a.statuses) {
      const d = this.status(s.id);
      if (d.kind === "poison" || d.kind === "regen") {
        const amt = Math.max(1, Math.floor(a.max.hp * (d.amount ?? 5) / 100));
        if (d.kind === "poison") {
          const dmg = Math.min(a.hp, amt);
          a.hp -= dmg;
          this.log.push({ t: "tick", target: i, status: s.id, amount: -dmg });
        } else {
          const heal = Math.min(a.max.hp - a.hp, amt);
          a.hp += heal;
          this.log.push({ t: "tick", target: i, status: s.id, amount: heal });
        }
      }
      s.turns -= 1;
      if (s.turns > 0) keep.push(s);
      else this.log.push({ t: "status", target: i, status: s.id, on: false });
    }
    a.statuses = a.hp > 0 ? keep : [];
    if (a.hp <= 0) this.log.push({ t: "down", target: i });
    this.checkEnd();
  }
  checkEnd() {
    if (this.over) return;
    if (!this.alive(1).length) {
      this.over = "win";
      this.log.push({ t: "end", result: "win" });
    } else if (!this.alive(0).length) {
      this.over = "lose";
      this.log.push({ t: "end", result: "lose" });
    }
  }
  /** Enemy AI (two rolls: skill, target) or a greedy auto-battle policy for the party (no rolls). */
  auto() {
    const i = this.current();
    if (i < 0) return { kind: "defend" };
    const a = this.actors[i];
    if (a.side === 1) {
      const e = this.db.enemies.find((x) => x.id === a.id);
      const usable = e.skills.filter((s) => (this.skill(s.skill).mp ?? 0) <= a.mp);
      let total = 0;
      for (const s of usable) total += s.weight;
      let r = this.rnd() * total;
      let pick = usable.length ? usable[usable.length - 1].skill : "attack";
      for (const s of usable) {
        r -= s.weight;
        if (r < 0) {
          pick = s.skill;
          break;
        }
      }
      const sk = this.skill(pick);
      const pool = sk.target === "ally" ? this.alive(1) : this.alive(0);
      const target = pool[Math.floor(this.rnd() * pool.length)];
      return { kind: "skill", skill: pick, target };
    }
    const friends = this.alive(0);
    let low = -1;
    for (const f of friends) {
      const x = this.actors[f];
      if (x.hp * 100 < x.max.hp * 40 && (low < 0 || x.hp * this.actors[low].max.hp < this.actors[low].hp * x.max.hp)) low = f;
    }
    if (low >= 0) {
      const heal = a.skills.map((s) => this.skill(s)).find((s) => s.kind === "heal" && (s.mp ?? 0) <= a.mp);
      if (heal) return { kind: "skill", skill: heal.id, target: low };
      for (const it of this.db.items) if (it.hp && (this.items[it.item] ?? 0) > 0) return { kind: "item", item: it.item, target: low };
    }
    const foes = this.alive(1);
    let tgt = foes[0];
    for (const f of foes) if (this.actors[f].hp < this.actors[tgt].hp) tgt = f;
    let best = "attack";
    let bestScore = 10;
    for (const s of a.skills) {
      const sk = this.skill(s);
      if (sk.kind !== "physical" && sk.kind !== "magic" || (sk.mp ?? 0) > a.mp) continue;
      const t = this.actors[tgt];
      let score = (sk.power ?? 10) * (sk.kind === "magic" ? this.stat(a, "mag") : this.stat(a, "atk"));
      score = Math.floor(score / Math.max(1, sk.kind === "magic" ? a.max.mag : a.max.atk));
      if (sk.element && t.weak.includes(sk.element)) score = Math.floor(score * 3 / 2);
      if (sk.target === "all_enemies" && foes.length > 1) score = score * 2;
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best === "attack" ? { kind: "attack", target: tgt } : { kind: "skill", skill: best, target: tgt };
  }
  /** Run auto() until the battle ends or maxTurns. */
  autoRun(maxTurns = 400) {
    const start = this.log.length;
    for (let n = 0; n < maxTurns && !this.over; n++) this.act(this.auto());
    return this.log.slice(start);
  }
  rewards() {
    const r = { xp: 0, coins: 0, drops: [], loot: [], levels: [], party: [] };
    if (this.over === "win") {
      for (const a of this.actors) {
        if (a.side !== 1) continue;
        const e = this.db.enemies.find((x) => x.id === a.id);
        const pct = 100 + 10 * (a.level - e.level);
        r.xp += Math.floor(e.xp * pct / 100);
        r.coins += Math.floor(e.coins * pct / 100);
        for (const d of e.drops ?? []) {
          if (this.rnd() * 100 < d.chance) {
            const cur = r.drops.find((x) => x.item === d.item);
            if (cur) cur.n += d.n ?? 1;
            else r.drops.push({ item: d.item, n: d.n ?? 1 });
          }
        }
        if (e.loot) r.loot.push(e.loot);
      }
    }
    for (const a of this.actors) {
      if (a.side !== 0) continue;
      const h = this.db.heroes.find((x) => x.id === a.id);
      let level = a.level;
      let xp = a.xp + (a.hp > 0 ? r.xp : 0);
      const learned = [];
      while (level < this.db.rules.maxLevel && xp >= xpToNext(this.db, level)) {
        xp -= xpToNext(this.db, level);
        level += 1;
        for (const l of h.skills) if (l.level === level) learned.push(l.skill);
      }
      if (level !== a.level) r.levels.push({ id: a.id, from: a.level, to: level, learned });
      const max = heroStats(h, level);
      const hp = level !== a.level && a.hp > 0 ? Math.min(max.hp, a.hp + (max.hp - a.max.hp)) : a.hp;
      r.party.push({ id: a.id, level, hp: Math.max(this.over === "lose" ? 1 : 0, hp), mp: a.mp, xp });
    }
    return r;
  }
  /** Compact state for parity tests and saves. */
  snapshot() {
    return {
      round: this.round,
      over: this.over ?? "",
      actors: this.actors.map((a) => ({ id: a.id, hp: a.hp, mp: a.mp, st: a.statuses.map((s) => `${s.id}:${s.turns}`).join(",") })),
      items: this.items,
      log: this.log.length
    };
  }
};
function pickTable(db, where) {
  const terr = (t) => !where.terrain || t.terrains.includes("any") || t.terrains.includes(where.terrain);
  const pool = db.encounters.filter((t) => !t.scripted && terr(t));
  return (where.region ? pool.find((t) => t.regions?.includes(where.region)) : void 0) ?? (where.culture ? pool.find((t) => t.cultures?.includes(where.culture)) : void 0) ?? pool.find((t) => !t.regions?.length && !t.cultures?.length) ?? (where.culture ? pool.find((t) => t.cultures?.includes("any")) : void 0);
}
function rollGroup(table, rnd) {
  let total = 0;
  for (const g of table.groups) total += g.weight;
  let r = rnd() * total;
  for (const g of table.groups) {
    r -= g.weight;
    if (r < 0) return g;
  }
  return table.groups[table.groups.length - 1];
}
var groupSeed = (seed) => Math.imul(seed >>> 0, 2654435761) >>> 0;
function rollEncounter(db, where, seed) {
  const table = pickTable(db, where);
  if (!table) return null;
  const g = rollGroup(table, mulberry32(groupSeed(seed)));
  return { table: table.id, rate: table.rate, enemies: g.enemies.map((id) => ({ id, level: db.enemies.find((e) => e.id === id).level + (g.levelBonus ?? 0) })) };
}
var PARITY_SETUP = { party: [{ id: "ton", level: 4 }, { id: "nurul", level: 4 }, { id: "mei", level: 4 }], enemies: [{ id: "paddy_crab" }, { id: "giant_mosquito" }, { id: "monkey_thief", level: 3 }], seed: 20261123, items: { balm: 2, teh_tarik: 1 } };
export {
  ATTACK,
  Battle,
  PARITY_SETUP,
  enemyStats,
  groupSeed,
  heroSkills,
  heroStats,
  mulberry32,
  pickTable,
  rollEncounter,
  rollGroup,
  xpToNext
};
