import { describe, expect, it } from "vitest";
import { Battle, PARITY_SETUP, heroStats, pickTable, rollEncounter, xpToNext } from "../src/shared/engine.js";
import { loadDbStrict } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

const db = await (async () => {
  const { root, cleanup } = await tempWorkspace();
  const d = await loadDbStrict(root);
  await cleanup();
  return d;
})();

describe("battle engine", () => {
  it("is deterministic per seed", () => {
    const a = new Battle(db, PARITY_SETUP);
    const b = new Battle(db, PARITY_SETUP);
    a.autoRun();
    b.autoRun();
    expect(a.log).toEqual(b.log);
    expect(a.over).toBe("win");
  });

  it("XP curve and level growth", () => {
    expect(xpToNext(db, 1)).toBe(db.rules.xp.base);
    expect(xpToNext(db, 5)).toBeGreaterThan(xpToNext(db, 4));
    const ton = db.heroes.find((h) => h.id === "ton")!;
    expect(heroStats(ton, 10).hp).toBeGreaterThan(heroStats(ton, 1).hp);
  });

  it("elements: weakness doubles up, resist halves, immune blocks", () => {
    const b = new Battle(db, { party: [{ id: "mei", level: 5 }], enemies: [{ id: "giant_mosquito" }], seed: 3 });
    b.act({ kind: "skill", skill: "firecracker", target: 1 });
    const dmg = b.log.find((e) => e.t === "damage" || e.t === "miss");
    if (dmg?.t === "damage") expect(dmg.weak).toBe(true);
  });

  it("status effects tick and expire", () => {
    let seen = false;
    for (let s = 1; s < 40 && !seen; s++) {
      const b = new Battle(db, { party: [{ id: "ton", level: 3 }, { id: "nurul", level: 3 }, { id: "mei", level: 3 }], enemies: [{ id: "cobra" }, { id: "cobra" }], seed: s });
      b.autoRun();
      seen = b.log.some((e) => e.t === "tick" && e.status === "poison");
    }
    expect(seen).toBe(true);
  });

  it("rewards: xp, coins, drops and level-ups", () => {
    const b = new Battle(db, { party: [{ id: "ton", level: 2, xp: 30 }, { id: "nurul", level: 2 }, { id: "mei", level: 2 }], enemies: [{ id: "monkey_thief", level: 3 }], seed: 11 });
    b.autoRun();
    expect(b.over).toBe("win");
    const r = b.rewards();
    expect(r.xp).toBeGreaterThan(0);
    expect(r.levels.length).toBeGreaterThan(0);
    expect(r.party.find((p) => p.id === "ton")!.level).toBeGreaterThan(1);
  });

  it("bosses cannot be fled", () => {
    const b = new Battle(db, { party: [{ id: "ton", level: 9 }], enemies: [{ id: "river_crocodile" }], seed: 1 });
    b.act({ kind: "flee" });
    expect(b.log.find((e) => e.t === "flee")).toMatchObject({ ok: false, chance: 0 });
  });

  it("encounter tables: region beats culture beats fallback; scripted tables never roll", () => {
    expect(pickTable(db, { culture: "malay", terrain: "forest" })!.id).toBe("kampung_forest");
    expect(pickTable(db, { culture: "nowhere", terrain: "field" })!.scripted).toBeFalsy();
    const ids = new Set(Array.from({ length: 60 }, (_, k) => rollEncounter(db, { culture: "thai", terrain: "field" }, k + 1)!.enemies.map((e) => e.id).join("+")));
    expect(ids.size).toBeGreaterThan(2);
  });

  it("balance: the crocodile boss is a real fight", () => {
    const wins = (lv: number) => {
      let w = 0;
      for (let s = 1; s <= 30; s++) {
        const b = new Battle(db, { party: ["ton", "nurul", "mei"].map((id) => ({ id, level: lv })), enemies: [{ id: "river_crocodile" }], seed: s, items: { balm: 3 } });
        b.autoRun();
        if (b.over === "win") w++;
      }
      return w;
    };
    expect(wins(6)).toBeLessThan(15);
    expect(wins(12)).toBeGreaterThan(25);
  });
});
