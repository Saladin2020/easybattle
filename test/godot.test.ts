/**
 * Optional Godot check: GODOT=/path/to/godot npx vitest run test/godot.test.ts
 * Exports the Godot project, imports it headless, then test_battle.gd replays the parity cases against the TS engine,
 * checks the encounter tables and runs a full auto battle through battle_scene.tscn.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportBattle } from "../src/lib/export.js";
import { tempWorkspace } from "./helpers.js";

const GODOT = process.env.GODOT;
let root: string;
let cleanup: () => Promise<void>;
beforeAll(async () => {
  if (GODOT) ({ root, cleanup } = await tempWorkspace());
});
afterAll(() => cleanup?.());

describe.skipIf(!GODOT)("Godot export", () => {
  it("parity with the TS engine and a full battle scene", async () => {
    const out = path.join(root, "exports", "godot");
    await exportBattle(root, { preset: "godot", out, bundle: false });
    for (let i = 0; i < 2; i++) spawnSync(GODOT!, ["--headless", "--editor", "--quit", "--path", out], { encoding: "utf8", timeout: 240_000 });
    const run = spawnSync(GODOT!, ["--headless", "--path", out, "--script", "res://test_battle.gd"], { encoding: "utf8", timeout: 180_000 });
    expect(run.stdout).not.toMatch(/^FAIL/m);
    expect(run.stdout).toMatch(/^P\| parity ok cases=4$/m);
    expect(run.stdout).toMatch(/^E\| tables=9 rolls=54$/m);
    expect(run.stdout).toMatch(/^S\| scene result=win/m);
    expect(run.stdout).toMatch(/^OK$/m);
  }, 900_000);
});
