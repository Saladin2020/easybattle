/** CLI smoke test: init a temp workspace and drive every command through the real CLI. */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const ws = mkdtempSync(path.join(os.tmpdir(), "easybattle-cli-"));
const cli = (...args) => execFileSync("npx", ["tsx", "src/cli.ts", ...args, "--workspace", ws], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
let failed = false;
const ok = (cond, label) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}`);
  if (!cond) failed = true;
};
const png = (f) => existsSync(f) && readFileSync(f).toString("ascii", 1, 4) === "PNG";
const OW = path.resolve("samples/overworld/regions.json");

cli("init");
ok(["core", "bestiary", "bosses"].every((d) => existsSync(path.join(ws, "battles", `${d}.easybattle.json`))), "init copies the starter battles");
ok(/4 heroes · 14 enemies · 27 skills/.test(cli("info")), "info");
const listed = JSON.parse(cli("list", "enemies", "--json")).enemies;
ok(listed.length === 14 && listed.some((e) => e.id === "river_crocodile" && e.boss), "list enemies");
ok(JSON.parse(cli("list", "skills", "--json")).skills.length === 27, "list skills --json");
ok(JSON.parse(cli("show", "nurul")).levels?.length > 0, "show nurul: stats per level");
ok(/^ok/m.test(cli("check")), "check: clean");
ok(/13 of 13 item ids found/.test(cli("check", "--items", "/workspace/easyitems/samples")) || !existsSync("/workspace/easyitems/samples"), "check --items cross-checks Easy Items drops");
ok(/0 uncovered regions, 0 unknown/.test(cli("check", "--overworld", OW)), "check --overworld: every region has a table");
const sim = cli("sim", "--party", "ton:5,nurul:5,mei:5", "--vs", "wild_boar,monkey_thief", "--seed", "3");
ok(/^win in \d+ rounds/.test(sim), `sim: ${sim.trim()}`);
ok(sim === cli("sim", "--party", "ton:5,nurul:5,mei:5", "--vs", "wild_boar,monkey_thief", "--seed", "3"), "sim is deterministic");
ok(/round 1/.test(cli("sim", "--party", "ton:3,nurul:3", "--table", "plains_fields", "--log")), "sim --table --log");
const rate = cli("sim", "--party", "ton:12,nurul:12,mei:12", "--vs", "river_crocodile", "--runs", "20", "--items", "balm:3");
ok(/win rate (1[5-9]|20)\/20/.test(rate), `boss win rate at Lv12: ${rate.trim()}`);
ok(/kampung_forest/.test(cli("encounter", "--culture", "malay", "--terrain", "forest")), "encounter: Malay forest → kampung_forest");
ok(/Lv 1 →\s+2\s+20/.test(cli("xp")), "xp table");
ok(/7 tables for 4 regions/.test(cli("bind-overworld", OW)), "bind-overworld writes one table per region");
ok(/east_coast_/.test(cli("encounter", "--region", "east_coast", "--terrain", "beach")), "encounter --region uses the bound table");
cli("render", "--what", "bestiary", "--out", path.join(ws, "best.png"));
cli("render", "--what", "battle", "--party", "ton:4,adam:4", "--vs", "cobra,cave_bat", "--out", path.join(ws, "battle.png"));
ok(png(path.join(ws, "best.png")) && png(path.join(ws, "battle.png")), "render bestiary + battle frame");
cli("new-enemy", "kite_spirit", "--th", "ว่าวหลง", "--en", "Lost kite", "--art", "kite", "--level", "2", "--skills", "attack:2,kite_dive:1");
ok(JSON.parse(cli("show", "kite_spirit")).source === "game.easybattle.json", "new-enemy writes battles/game.easybattle.json");
writeFileSync(path.join(ws, "battles", "broken.easybattle.json"), JSON.stringify({ format: "easybattle/1", enemies: [{ id: "x", name: { th: "เอ็กซ์", en: "X" }, level: 1, stats: { hp: 5, mp: 0, atk: 1, def: 1, mag: 1, res: 1, spd: 1 }, skills: [{ skill: "laser", weight: 1 }], xp: 1, coins: 1, art: "mud" }] }));
let out = "";
try {
  cli("check");
} catch (e) {
  out = String(e.stdout) + String(e.stderr);
}
ok(/laser/.test(out) && /FAIL|error/i.test(out), "check reports an unknown skill and exits 1");
rmSync(path.join(ws, "battles", "broken.easybattle.json"));
cli("export", "--preset", "all", "--no-bundle");
for (const f of ["exports/easybattle-godot/project.godot", "exports/easybattle-godot/easybattle/battle_scene.tscn", "exports/easybattle-godot/easybattle/parity.json", "exports/easybattle-godot/test_battle.gd", "exports/easybattle-pixi/easybattle.json", "exports/easybattle-pixi/easybattle-pixi.js", "exports/easybattle-pixi/index.html", "exports/easybattle-png/bestiary.png", "exports/easybattle-json/easybattle.db.json"]) ok(existsSync(path.join(ws, f)), `export → ${f}`);

rmSync(ws, { recursive: true, force: true });
console.log(failed ? "CLI smoke FAILED" : "CLI smoke OK");
process.exit(failed ? 1 : 0);
