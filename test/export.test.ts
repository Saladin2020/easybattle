import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportBattle, parityCases } from "../src/lib/export.js";
import { loadDbStrict } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => ({ root, cleanup } = await tempWorkspace()));
afterAll(() => cleanup());

describe("export", () => {
  it("writes Godot, Pixi, PNG and JSON presets", async () => {
    const res = await exportBattle(root, { preset: "all", bundle: false });
    const ex = (f: string) => existsSync(path.join(root, "exports", f));
    for (const f of ["easybattle-godot/project.godot", "easybattle-godot/easybattle/battle_engine.gd", "easybattle-godot/easybattle/battle_scene.tscn", "easybattle-godot/easybattle/parity.json", "easybattle-godot/test_battle.gd", "easybattle-godot/easybattle/heroes/nurul.png", "easybattle-pixi/easybattle-core.js", "easybattle-pixi/easybattle-pixi.js", "easybattle-pixi/index.html", "easybattle-png/bestiary.png"]) expect(ex(f), f).toBe(true);
    expect(res.enemies).toBe(14);
    const proj = readFileSync(path.join(root, "exports/easybattle-godot/project.godot"), "utf8");
    expect(proj).toMatch(/Battle="\*res:\/\/easybattle\/easybattle.gd"/);
    expect(proj).toMatch(/gl_compatibility/);
  });

  it("refuses paths outside the workspace", async () => {
    await expect(exportBattle(root, { preset: "json", out: "../escape" })).rejects.toThrow();
  });

  it("parity cases are stable", async () => {
    const db = await loadDbStrict(root);
    const a = parityCases(db);
    expect(a.map((c) => c.name)).toEqual(["auto_village", "scripted_mix", "boss", "generic"]);
    expect(parityCases(db)).toEqual(a);
  });

  it("the Pixi core is in sync with src/shared/engine.ts", () => {
    expect(() => execFileSync("node", ["scripts/build-core.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
