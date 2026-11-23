#!/usr/bin/env node
/**
 * Regenerate the backview art of the sample heroes from the Easy Suite tools (nothing is drawn by hand or by AI):
 *   assets/heroes/<id>_back.png      Easy Sprite top-down sheet (row 2 = back view) with the same parts and colours
 *                                    as the hero's side-view sheet
 *   assets/portraits/<id>.png        Easy Portrait 64×64 busts: neutral, happy, worried, sad (status cards)
 *
 *   node scripts/make-hero-art.mjs [--sprite <easysprite-cli>] [--portrait <easyportrait-cli>]
 * Defaults: EASYBATTLE_EASYSPRITE_CLI / EASYBATTLE_EASYPORTRAIT_CLI, else the studio install.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined; };
const SPRITE = arg("--sprite") ?? process.env.EASYBATTLE_EASYSPRITE_CLI ?? "/workspace/indie-studio/tools/easysprite-cli.mjs";
const PORTRAIT = arg("--portrait") ?? process.env.EASYBATTLE_EASYPORTRAIT_CLI ?? "/workspace/indie-studio/tools/easyportrait-cli.mjs";
const run = (cli, args) => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, EASYSPRITE_ALLOWED_DIRS: [process.env.EASYSPRITE_ALLOWED_DIRS, os.tmpdir()].filter(Boolean).join(path.delimiter) } });

/** Portrait specs (Easy Portrait options) matching each hero's Easy Sprite look. */
const PORTRAITS = {
  ton: { th: "ต้น", en: "Ton", body: "child", skin: "#8a5a3c", hair: "#2a221c", "hair-style": "crop", headwear: "none", shirt: "tank", "shirt-color": "#4f86c6" },
  nurul: { th: "นูรุล", en: "Nurul", body: "adult", skin: "#c9956c", hair: "#2a221c", "hair-style": "bun", headwear: "hijab", "headwear-color": "#2f7a6a", shirt: "baju_kurung", "shirt-color": "#e6d3a3", features: "lashes" },
  adam: { th: "อาดัม", en: "Adam", body: "child", skin: "#e8c4a0", hair: "#2a221c", "hair-style": "crop", headwear: "kopiah", "headwear-color": "#f0eee8", shirt: "baju_melayu", "shirt-color": "#3f8a5a" },
  mei: { th: "เหมย", en: "Mei", body: "adult", skin: "#f0d0b0", hair: "#1e1410", "hair-style": "bun", headwear: "none", shirt: "blazer", "shirt-color": "#c8402e" },
};
const EMOTIONS = ["neutral", "happy", "worried", "sad"];

const tmp = mkdtempSync(path.join(os.tmpdir(), "easybattle-art-"));
try {
  mkdirSync(path.join(root, "assets", "portraits"), { recursive: true });
  for (const id of Object.keys(PORTRAITS)) {
    // back view: the side-view project's parts without the side_ prefix are the top-down parts
    const side = JSON.parse(readFileSync(path.join(root, "assets", "heroes", `${id}.easysprite.json`), "utf8")).project;
    const sel = Object.fromEntries(Object.entries(side.selections).map(([k, v]) => [k, String(v).replace(/^side_/, "")]));
    const args = ["compose", "--id", `${id}_back`, "--view", "topdown", "--colors", JSON.stringify(side.colors), "--save-dir", tmp, "--export", "--out", tmp, "--json"];
    for (const [slot, part] of Object.entries(sel)) args.push("--select", `${slot}=${part}`);
    run(SPRITE, args);
    copyFileSync(path.join(tmp, `${id}_back.png`), path.join(root, "assets", "heroes", `${id}_back.png`));
    const meta = JSON.parse(readFileSync(path.join(tmp, `${id}_back.json`), "utf8"));
    writeFileSync(path.join(root, "assets", "heroes", `${id}_back.easysprite.json`), `${JSON.stringify({ ...meta, project: { id: `${id}_back`, view: "topdown", selections: sel, colors: side.colors } })}\n`);
    // portrait strip
    const ws = path.join(tmp, "portraits");
    run(PORTRAIT, ["init", "--workspace", ws]);
    const p = PORTRAITS[id];
    const setArgs = ["set", `hero_${id}`, "--th", p.th, "--en", p.en, "--ms", p.en, "--bg", "none", "--workspace", ws];
    for (const [k, v] of Object.entries(p)) if (!["th", "en"].includes(k)) setArgs.push(`--${k}`, v);
    run(PORTRAIT, setArgs);
    const frames = EMOTIONS.map((e) => {
      const out = path.join(tmp, `${id}_${e}.png`);
      run(PORTRAIT, ["render", `hero_${id}`, "--emotion", e, "--scale", "1", "--out", out, "--workspace", ws]);
      return out;
    });
    execFileSync("python3", ["-c", `import sys\nfrom PIL import Image\nfs=sys.argv[2:]\nout=Image.new('RGBA',(64*len(fs),64))\nfor i,f in enumerate(fs): out.paste(Image.open(f).convert('RGBA'),(i*64,0))\nout.save(sys.argv[1])`, path.join(root, "assets", "portraits", `${id}.png`), ...frames]);
    writeFileSync(path.join(root, "assets", "portraits", `${id}.json`), `${JSON.stringify({ id, source: "easyportrait", size: 64, frames: EMOTIONS, spec: p })}\n`);
    console.log(`${id}: assets/heroes/${id}_back.png, assets/portraits/${id}.png`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
