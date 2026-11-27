import { describe, expect, it } from "vitest";
import { Battle, heroStats, skillPoints, treeCheck, treeSkills, treeStats, treeUnlock } from "../src/shared/engine.js";
import { buildDb } from "../src/shared/db.js";
import { loadDbStrict } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

const db = await (async () => {
  const { root, cleanup } = await tempWorkspace();
  const d = await loadDbStrict(root);
  await cleanup();
  return d;
})();
const ton = db.heroes.find((h) => h.id === "ton")!;

describe("skill trees", () => {
  it("points per level, requirements, level gates and costs", () => {
    expect(skillPoints(db, 1)).toBe(0);
    expect(skillPoints(db, 5)).toBe(4);
    expect(treeCheck(db, ton, 1, [], "ton_fist")).toBe("points");
    expect(treeCheck(db, ton, 3, [], "ton_knee")).toBe("level:4");
    expect(treeCheck(db, ton, 4, [], "ton_knee")).toBe("requires:ton_fist");
    let t = treeUnlock(db, ton, 4, [], "ton_fist").tree;
    expect(t).toEqual(["ton_fist"]);
    expect(treeUnlock(db, ton, 4, t, "ton_fist").result).toBe("unlocked");
    t = treeUnlock(db, ton, 4, t, "ton_knee").tree;
    expect(t).toEqual(["ton_fist", "ton_knee"]);
    expect(treeCheck(db, ton, 4, t, "ton_guard")).toBe("points");
    expect(treeCheck(db, ton, 4, t, "nope")).toBe("unknown_node");
  });

  it("unlocked nodes add stats and skills, in battle too", () => {
    const tree = ["ton_fist", "ton_knee", "ton_guard"];
    const base = heroStats(ton, 6);
    const st = treeStats(ton, 6, tree);
    expect(st.atk).toBe(base.atk + 3);
    expect(st.def).toBe(base.def + 3);
    expect(st.hp).toBe(base.hp + 10);
    expect(treeSkills(ton, 6, tree)).toEqual(["teep", "wai_khru", "elbow", "flying_knee"]);
    const b = new Battle(db, { party: [{ id: "ton", level: 6, tree }], enemies: [{ id: "paddy_crab" }], seed: 3, items: {} });
    expect(b.actors[0]!.max.atk).toBe(st.atk);
    expect(b.actors[0]!.skills).toContain("flying_knee");
    b.autoRun();
    expect(b.rewards().party[0]!.tree).toEqual(tree);
  });

  it("validates node references and order", () => {
    const doc = {
      format: "easybattle/1",
      skills: [{ id: "hit", name: { th: "ตี", en: "Hit" }, kind: "physical", target: "enemy", power: 10 }],
      heroes: [{ id: "h", name: { th: "ฮ", en: "H" }, base: { hp: 10, mp: 1, atk: 1, def: 1, mag: 1, res: 1, spd: 1 }, growth: {}, skills: [{ level: 1, skill: "hit" }], tree: [{ id: "b", name: { th: "บ", en: "B" }, requires: ["a"], skill: "hit" }, { id: "a", name: { th: "อ", en: "A" }, skill: "ghost" }] }],
    };
    const r = buildDb([{ file: "x", doc }]);
    const msgs = r.errors.map((e) => `${e.path} ${e.message}`).join("\n");
    expect(msgs).toMatch(/requires/);
  });
});
