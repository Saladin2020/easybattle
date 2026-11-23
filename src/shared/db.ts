import { CULTURES, DEFAULT_RULES, ENEMY_ART, FORMAT, SKILL_KINDS, STATS, STATUS_KINDS, TARGETS, TERRAINS, type BattleDb, type BattleDoc, type Diagnostic, type Rules } from "./types.js";

export const SAFE_ID = /^[a-z0-9][a-z0-9_-]*$/;
/** Words that must not appear in names: no sacred figures, scripture or calligraphy as game content. */
const FORBIDDEN = [/prophet/i, /\bquran\b/i, /qur'?an/i, /อัลกุรอาน/, /นบี/, /calligraph/i, /\ballah\b/i, /อัลลอฮ์/, /\bbuddha\b/i, /พระพุทธ/];

export class Diags {
  list: Diagnostic[] = [];
  error(path: string, message: string) {
    this.list.push({ path, message, severity: "error" });
  }
  warn(path: string, message: string) {
    this.list.push({ path, message, severity: "warning" });
  }
  get errors() {
    return this.list.filter((d) => d.severity === "error");
  }
  get warnings() {
    return this.list.filter((d) => d.severity === "warning");
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);

function checkName(v: unknown, d: Diags, p: string) {
  if (!isObj(v) || typeof v.th !== "string" || typeof v.en !== "string" || !v.th || !v.en) return d.error(p, "name needs { th, en } strings (ms optional)");
  for (const s of [v.th, v.en, v.ms]) if (typeof s === "string" && FORBIDDEN.some((r) => r.test(s))) d.error(p, `content rule: "${s}" — no sacred figures, scripture or calligraphy as battle content`);
}

function checkId(v: unknown, d: Diags, p: string) {
  if (typeof v !== "string" || !SAFE_ID.test(v)) d.error(p, `id ${JSON.stringify(v)} must match ${SAFE_ID}`);
}

const LISTS = ["elements", "statuses", "skills", "heroes", "enemies", "encounters", "items"] as const;

/** Shape checks for one document (references are checked after merging). */
export function checkDoc(raw: unknown, d: Diags, file: string) {
  if (!isObj(raw)) return d.error(file, "document must be a JSON object");
  if (raw.format !== FORMAT) d.error(`${file}.format`, `format must be "${FORMAT}"`);
  if (raw.name !== undefined) checkName(raw.name, d, `${file}.name`);
  for (const k of LISTS) if (raw[k] !== undefined && !Array.isArray(raw[k])) d.error(`${file}.${k}`, "must be an array");
  if (raw.rules !== undefined && !isObj(raw.rules)) d.error(`${file}.rules`, "must be an object");
  const arr = (k: (typeof LISTS)[number]) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : []);
  arr("elements").forEach((e, i) => {
    const p = `${file}.elements[${i}]`;
    if (!isObj(e)) return d.error(p, "must be an object");
    checkId(e.id, d, `${p}.id`);
    checkName(e.name, d, `${p}.name`);
    if (typeof e.color !== "string" || !/^#[0-9a-f]{6}$/i.test(e.color)) d.error(`${p}.color`, "color must be #rrggbb");
  });
  arr("statuses").forEach((s, i) => {
    const p = `${file}.statuses[${i}]`;
    if (!isObj(s)) return d.error(p, "must be an object");
    checkId(s.id, d, `${p}.id`);
    checkName(s.name, d, `${p}.name`);
    if (!STATUS_KINDS.includes(s.kind as never)) d.error(`${p}.kind`, `kind must be ${STATUS_KINDS.join("|")}`);
    if (!num(s.turns) || (s.turns as number) < 1 || (s.turns as number) > 99) d.error(`${p}.turns`, "turns 1..99");
    if (["atk", "def", "mag", "spd", "poison", "regen"].includes(s.kind as string) && (!num(s.amount) || (s.amount as number) <= 0)) d.error(`${p}.amount`, "amount (> 0) is required for this kind");
  });
  arr("skills").forEach((s, i) => {
    const p = `${file}.skills[${i}]`;
    if (!isObj(s)) return d.error(p, "must be an object");
    checkId(s.id, d, `${p}.id`);
    checkName(s.name, d, `${p}.name`);
    if (!SKILL_KINDS.includes(s.kind as never)) d.error(`${p}.kind`, `kind must be ${SKILL_KINDS.join("|")}`);
    if (!TARGETS.includes(s.target as never)) d.error(`${p}.target`, `target must be ${TARGETS.join("|")}`);
    if (["physical", "magic", "heal"].includes(s.kind as string) && (!num(s.power) || (s.power as number) <= 0)) d.error(`${p}.power`, "power (> 0) is required for damage and heal skills");
    if (s.mp !== undefined && (!num(s.mp) || (s.mp as number) < 0)) d.error(`${p}.mp`, "mp must be ≥ 0");
    if (s.accuracy !== undefined && (!num(s.accuracy) || (s.accuracy as number) < 0 || (s.accuracy as number) > 100)) d.error(`${p}.accuracy`, "accuracy 0..100");
    if ((s.kind === "buff" || s.kind === "debuff") && !isObj(s.status)) d.error(`${p}.status`, "buff / debuff skills need a status");
  });
  const checkStats = (v: unknown, p: string, partial = false) => {
    if (!isObj(v)) return d.error(p, "stats object required");
    for (const k of STATS) {
      if (v[k] === undefined && partial) continue;
      if (!num(v[k]) || (v[k] as number) < 0) d.error(`${p}.${k}`, `${k} must be a number ≥ 0`);
    }
    if (!partial && num(v.hp) && (v.hp as number) < 1) d.error(`${p}.hp`, "hp ≥ 1");
  };
  arr("heroes").forEach((h, i) => {
    const p = `${file}.heroes[${i}]`;
    if (!isObj(h)) return d.error(p, "must be an object");
    checkId(h.id, d, `${p}.id`);
    checkName(h.name, d, `${p}.name`);
    checkStats(h.base, `${p}.base`);
    checkStats(h.growth ?? {}, `${p}.growth`, true);
    if (!Array.isArray(h.skills)) d.error(`${p}.skills`, "skills [{ level, skill }] required");
  });
  arr("enemies").forEach((e, i) => {
    const p = `${file}.enemies[${i}]`;
    if (!isObj(e)) return d.error(p, "must be an object");
    checkId(e.id, d, `${p}.id`);
    checkName(e.name, d, `${p}.name`);
    checkStats(e.stats, `${p}.stats`);
    if (!num(e.level) || (e.level as number) < 1) d.error(`${p}.level`, "level ≥ 1");
    if (!num(e.xp) || !num(e.coins)) d.error(p, "xp and coins are required numbers");
    if (!ENEMY_ART.includes(e.art as never)) d.error(`${p}.art`, `art must be one of ${ENEMY_ART.join(", ")}`);
    if (!Array.isArray(e.skills) || !e.skills.length) d.error(`${p}.skills`, "at least one { skill, weight }");
    if (Array.isArray(e.drops)) (e.drops as unknown[]).forEach((dr, j) => {
      if (!isObj(dr) || typeof dr.item !== "string" || !num(dr.chance) || (dr.chance as number) < 0 || (dr.chance as number) > 100) d.error(`${p}.drops[${j}]`, "drop needs { item, chance 0..100 }");
    });
  });
  arr("encounters").forEach((t, i) => {
    const p = `${file}.encounters[${i}]`;
    if (!isObj(t)) return d.error(p, "must be an object");
    checkId(t.id, d, `${p}.id`);
    if (!Array.isArray(t.terrains) || !(t.terrains as unknown[]).every((x) => TERRAINS.includes(x as never))) d.error(`${p}.terrains`, `terrains from ${TERRAINS.join("|")}`);
    if (t.cultures !== undefined && (!Array.isArray(t.cultures) || !(t.cultures as unknown[]).every((x) => CULTURES.includes(x as never)))) d.error(`${p}.cultures`, `cultures from ${CULTURES.join("|")}`);
    if (!num(t.rate) || (t.rate as number) < 1) d.error(`${p}.rate`, "rate (steps) ≥ 1");
    if (!Array.isArray(t.groups) || !t.groups.length) d.error(`${p}.groups`, "at least one group");
    else (t.groups as unknown[]).forEach((g, j) => {
      if (!isObj(g) || !Array.isArray(g.enemies) || !g.enemies.length || !num(g.weight) || (g.weight as number) <= 0) d.error(`${p}.groups[${j}]`, "group needs { enemies [ids], weight > 0 }");
      else if ((g.enemies as unknown[]).length > 5) d.error(`${p}.groups[${j}]`, "at most 5 enemies per group");
    });
  });
  arr("items").forEach((t, i) => {
    const p = `${file}.items[${i}]`;
    if (!isObj(t) || typeof t.item !== "string") return d.error(p, "needs { item }");
    if (t.hp === undefined && t.mp === undefined && t.cures === undefined) d.warn(p, "battle item has no hp, mp or cures effect");
  });
}

/** Merge documents (ids unique across files) and check references. */
export function buildDb(docs: Array<{ file: string; doc: unknown }>): { db: BattleDb; errors: Diagnostic[]; warnings: Diagnostic[] } {
  const d = new Diags();
  const db: BattleDb = { rules: structuredClone(DEFAULT_RULES), elements: [], statuses: [], skills: [], heroes: [], enemies: [], encounters: [], items: [], sources: {} };
  for (const { file, doc } of docs) {
    const before = d.errors.length;
    checkDoc(doc, d, file);
    if (d.errors.length > before || !isObj(doc)) continue;
    const bd = doc as unknown as BattleDoc;
    if (bd.rules) db.rules = { ...db.rules, ...bd.rules, xp: { ...db.rules.xp, ...(bd.rules.xp ?? {}) }, terrainCodes: { ...db.rules.terrainCodes, ...(bd.rules.terrainCodes ?? {}) } } as Rules;
    for (const k of LISTS) {
      const key = k === "items" ? "item" : "id";
      for (const e of (bd[k] ?? []) as unknown as Array<Record<string, unknown>>) {
        const id = String(e[key]);
        const src = `${k}:${id}`;
        if (db.sources[src]) {
          d.error(`${file}.${k}`, `duplicate ${k.slice(0, -1)} "${id}" (also in ${db.sources[src]})`);
          continue;
        }
        db.sources[src] = file;
        (db[k] as unknown[]).push(e);
      }
    }
  }
  const has = (k: (typeof LISTS)[number], id: string) => !!db.sources[`${k}:${id}`];
  const el = (id: string | undefined, p: string) => id && id !== "none" && !has("elements", id) && d.error(p, `unknown element "${id}"`);
  for (const s of db.skills) {
    const p = `${db.sources[`skills:${s.id}`]}.skills.${s.id}`;
    el(s.element, `${p}.element`);
    if (s.status && !has("statuses", s.status.id)) d.error(`${p}.status`, `unknown status "${s.status.id}"`);
    for (const c of s.cures ?? []) if (!has("statuses", c)) d.error(`${p}.cures`, `unknown status "${c}"`);
    if (s.kind === "heal" && (s.target === "enemy" || s.target === "all_enemies")) d.warn(p, "heal skill targets enemies");
  }
  for (const h of db.heroes) {
    const p = `${db.sources[`heroes:${h.id}`]}.heroes.${h.id}`;
    for (const l of h.skills) if (!has("skills", l.skill)) d.error(`${p}.skills`, `unknown skill "${l.skill}"`);
    for (const e of [...(h.weak ?? []), ...(h.resist ?? [])]) el(e, `${p}.weak/resist`);
    if (!h.skills.some((l) => l.level <= 1)) d.warn(p, "hero has no level-1 skill (only Attack)");
  }
  for (const e of db.enemies) {
    const p = `${db.sources[`enemies:${e.id}`]}.enemies.${e.id}`;
    for (const s of e.skills) if (!has("skills", s.skill)) d.error(`${p}.skills`, `unknown skill "${s.skill}"`);
    for (const x of [...(e.weak ?? []), ...(e.resist ?? []), ...(e.immune ?? [])]) el(x, `${p}.weak/resist/immune`);
  }
  for (const t of db.encounters) {
    const p = `${db.sources[`encounters:${t.id}`]}.encounters.${t.id}`;
    t.groups.forEach((g, j) => g.enemies.forEach((e) => !has("enemies", e) && d.error(`${p}.groups[${j}]`, `unknown enemy "${e}"`)));
    if (!t.scripted && !t.regions?.length && !t.cultures?.length && !t.terrains.includes("any")) d.warn(p, "table has no regions or cultures; it only matches as a fallback");
  }
  if (!db.skills.some((s) => s.id === "attack")) d.warn("rules", 'no "attack" skill defined; the engine uses a built-in plain attack');
  return { db, errors: d.errors, warnings: d.warnings };
}

export const entrySummary = {
  hero: (h: BattleDb["heroes"][number]) => ({ id: h.id, th: h.name.th, en: h.name.en, role: h.role?.en ?? null, hp: h.base.hp, skills: h.skills.map((l) => `${l.skill}@${l.level}`) }),
  enemy: (e: BattleDb["enemies"][number]) => ({ id: e.id, th: e.name.th, en: e.name.en, level: e.level, hp: e.stats.hp, xp: e.xp, coins: e.coins, weak: e.weak ?? [], boss: !!e.boss }),
  skill: (s: BattleDb["skills"][number]) => ({ id: s.id, th: s.name.th, en: s.name.en, kind: s.kind, target: s.target, power: s.power ?? 0, mp: s.mp ?? 0, element: s.element ?? "none" }),
};
