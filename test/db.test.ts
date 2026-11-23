import { describe, expect, it } from "vitest";
import { buildDb } from "../src/shared/db.js";
import { loadDb } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

const base = async () => {
  const { root, cleanup } = await tempWorkspace();
  const r = await loadDb(root);
  await cleanup();
  return r;
};

describe("database", () => {
  it("the starter workspace is clean and multicultural", async () => {
    const r = await base();
    expect(r.errors).toEqual([]);
    expect(r.db.heroes.map((h) => h.id)).toEqual(["ton", "nurul", "mei", "adam"]);
    expect(r.db.enemies.length).toBe(14);
    expect(r.db.enemies.filter((e) => e.boss).map((e) => e.id).sort()).toEqual(["highland_tiger", "river_crocodile"]);
    expect(r.db.encounters.length).toBe(9);
    const cultures = new Set(r.db.encounters.flatMap((t) => t.cultures ?? []));
    for (const c of ["thai", "malay", "chinese"]) expect(cultures.has(c), c).toBe(true);
    for (const e of r.db.enemies) expect(e.name.th).toMatch(/[\u0E00-\u0E7F]/);
  });

  it("reports bad references, duplicate ids and bad numbers with a path", () => {
    const r = buildDb([
      { file: "a.easybattle.json", doc: { format: "easybattle/1", skills: [{ id: "zap", name: { th: "ช็อต", en: "Zap" }, kind: "magic", target: "enemy", power: 10, element: "plasma" }] } },
      { file: "b.easybattle.json", doc: { format: "easybattle/1", skills: [{ id: "zap", name: { th: "ช็อต", en: "Zap" }, kind: "magic", target: "enemy", power: 10 }] } },
      { file: "c.easybattle.json", doc: { format: "easybattle/1", enemies: [{ id: "slug", name: { th: "ทาก", en: "Slug" }, level: 1, stats: { hp: 10, mp: 0, atk: 1, def: 1, mag: 1, res: 1, spd: 1 }, skills: [{ skill: "nope", weight: 1 }], xp: 1, coins: 1, art: "mud" }] } },
      { file: "d.easybattle.json", doc: { format: "easybattle/1", enemies: [{ id: "slug2", name: { th: "ทาก", en: "Slug" }, level: 1, stats: { hp: -1, mp: 0, atk: 1, def: 1, mag: 1, res: 1, spd: 1 }, skills: [], xp: 1, coins: 1, art: "mud" }] } },
    ]);
    const msgs = r.errors.map((e) => `${e.path}: ${e.message}`).join("\n");
    expect(msgs).toMatch(/plasma/);
    expect(msgs).toMatch(/duplicate skill "zap"/);
    expect(msgs).toMatch(/nope/);
    expect(msgs).toMatch(/hp/);
  });

  it("enforces the content rules on names", () => {
    const r = buildDb([{ file: "x.easybattle.json", doc: { format: "easybattle/1", enemies: [{ id: "bad", name: { th: "ปีศาจ", en: "Prophet ghost" }, level: 1, stats: { hp: 5, mp: 0, atk: 1, def: 1, mag: 1, res: 1, spd: 1 }, skills: [], xp: 1, coins: 1, art: "mud" }] } }]);
    expect(r.errors.some((e) => /content rule/i.test(e.message))).toBe(true);
  });
});
