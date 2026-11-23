import { decodePng } from "../src/lib/png.js";
import { drawEnemy, FRONT_ARTS } from "../src/lib/art.js";
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
    expect(res.enemies).toBe(17);
    const proj = readFileSync(path.join(root, "exports/easybattle-godot/project.godot"), "utf8");
    expect(proj).toMatch(/Battle="\*res:\/\/easybattle\/easybattle.gd"/);
    expect(proj).toMatch(/gl_compatibility/);
  });

  it("ships the back-view assets and the shared screen layout in both runtimes", () => {
    const ex = (f: string) => existsSync(path.join(root, "exports", f));
    for (const dir of ["easybattle-godot/easybattle", "easybattle-pixi"]) {
      for (const f of ["backdrops/backview_paddy.png", "backdrops/backview_forest.png", "heroes/nurul_back.png", "portraits/nurul.png"]) expect(ex(`${dir}/${f}`), `${dir}/${f}`).toBe(true);
      const data = JSON.parse(readFileSync(path.join(root, "exports", dir, "easybattle.json"), "utf8"));
      expect(data.ui.layout).toBe("classic");
      expect(Object.keys(data.ui.layouts)).toContain("backview:cards");
      expect(data.ui.layouts["backview:cards"]["3"].cards).toHaveLength(3);
      expect(data.ui.text.ready).toEqual({ th: "พร้อม!", en: "READY!", ms: "SEDIA!" });
      expect(data.ui.sheetRow).toEqual({ side: 1, back: 2 });
    }
    const pixi = readFileSync(path.join(root, "exports/easybattle-pixi/index.html"), "utf8");
    expect(pixi).toMatch(/layout=backview|"backview"/);
    expect(pixi).toMatch(/timing/);
  });

  it("ships front-facing enemy strips (same size as the side strips) and the ATB settings", () => {
    for (const dir of ["easybattle-godot/easybattle", "easybattle-pixi"]) {
      const data = JSON.parse(readFileSync(path.join(root, "exports", dir, "easybattle.json"), "utf8"));
      expect(data.ui.timing).toBe("turn");
      expect(data.ui.atbMode).toBe("wait");
      expect(data.ui.layouts["backview:cards"]["3"].cards[0].time).toBeDefined();
      for (const art of new Set<string>(data.db.enemies.map((e: { art: string }) => e.art))) {
        const side = decodePng(readFileSync(path.join(root, "exports", dir, `enemies/${art}.png`)));
        const front = decodePng(readFileSync(path.join(root, "exports", dir, `enemies/${art}_front.png`)));
        expect([front.width, front.height], art).toEqual([side.width, side.height]);
      }
    }
    for (const art of FRONT_ARTS) {
      const s = drawEnemy(art, undefined, "side").frames[0]!;
      const f = drawEnemy(art, undefined, "front").frames[0]!;
      expect(Buffer.from(f.data).equals(Buffer.from(s.data)), `${art} front differs from side`).toBe(false);
    }
    expect(FRONT_ARTS.length).toBeGreaterThanOrEqual(10);
  });

  it("refuses paths outside the workspace", async () => {
    await expect(exportBattle(root, { preset: "json", out: "../escape" })).rejects.toThrow();
  });

  it("parity cases are stable", async () => {
    const db = await loadDbStrict(root);
    const a = parityCases(db);
    expect(a.map((c) => c.name)).toEqual(["auto_village", "scripted_mix", "atb_wait", "atb_active", "boss", "generic"]);
    expect(parityCases(db)).toEqual(a);
  });

  it("the Pixi core is in sync with src/shared/engine.ts", () => {
    expect(() => execFileSync("node", ["scripts/build-core.mjs", "--check"], { stdio: "pipe" })).not.toThrow();
  });
});
