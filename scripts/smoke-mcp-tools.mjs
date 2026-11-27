/** MCP smoke test: start the server over stdio and over HTTP like a client would and call tools. */
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ws = mkdtempSync(path.join(os.tmpdir(), "easybattle-smoke-"));
execFileSync("npx", ["tsx", "src/cli.ts", "init", "--workspace", ws], { stdio: "ignore" });
const fail = (m) => {
  console.error("FAIL", m);
  process.exitCode = 1;
};
const body = (r) => JSON.parse(r.content?.[0]?.text ?? "{}");

async function exercise(client, label) {
  const tools = (await client.listTools()).tools.map((t) => t.name);
  console.log(`[${label}] tools (${tools.length}):`, tools.join(", "));
  if (tools.length !== 10) fail(`${label}: expected 10 tools`);
  const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
  console.log(`[${label}] heroes=${info.heroes?.length} enemies=${info.enemies?.length} skills=${info.skills?.length} tables=${info.encounters?.length}`);
  if (info.enemies?.length !== 17) fail(`${label}: workspace_info`);
  const chk = body(await client.callTool({ name: "check_battles", arguments: {} }));
  console.log(`[${label}] check ok=${chk.ok}`);
  if (!chk.ok) fail(`${label}: check_battles`);
  const sim = body(await client.callTool({ name: "simulate_battle", arguments: { party: [{ id: "ton", level: 5 }, { id: "nurul", level: 5 }, { id: "mei", level: 5 }], table: "plains_fields", seed: 4 } }));
  console.log(`[${label}] simulate:`, sim.result, "xp", sim.rewards?.xp, "rounds", sim.rounds);
  if (sim.result !== "win") fail(`${label}: simulate_battle`);
  const roll = body(await client.callTool({ name: "roll_encounter", arguments: { culture: "chinese", terrain: "road", times: 2 } }));
  console.log(`[${label}] roll:`, roll.rolls?.map((r) => r.table + ":" + r.enemies.map((e) => e.id).join("+")).join(" "));
  const r = await client.callTool({ name: "render_battle", arguments: { scale: 1 } });
  const img = r.content?.find((c) => c.type === "image");
  console.log(`[${label}] render image bytes:`, img ? Buffer.from(img.data, "base64").length : 0);
  if (!img) fail(`${label}: render_battle`);
  const bv = await client.callTool({ name: "render_battle", arguments: { scale: 1, layout: "backview", status: "cards" } });
  const bimg = bv.content?.find((c) => c.type === "image");
  console.log(`[${label}] backview render bytes:`, bimg ? Buffer.from(bimg.data, "base64").length : 0);
  if (!bimg) fail(`${label}: render_battle backview`);
}

{
  const client = new Client({ name: "smoke", version: "0.0.1" });
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "src/mcp/server.ts", "--workspace", ws], cwd: process.cwd(), env: { ...process.env }, stderr: "ignore" }));
  await exercise(client, "stdio");
  const exp = body(await client.callTool({ name: "export_battle", arguments: { preset: "pixi", bundle: false } }));
  console.log("[stdio] export pixi:", exp.dirs?.join(", "), "files", exp.files);
  if (!exp.files) fail("stdio: export_battle");
  await client.close();
}

{
  const port = 18879 + Math.floor(Math.random() * 500);
  const proc = spawn("npx", ["tsx", "src/mcp/server.ts", "--http", "--port", String(port), "--workspace", ws], { stdio: ["ignore", "ignore", "pipe"] });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("MCP HTTP did not start")), 60000);
    proc.stderr.on("data", (d) => {
      if (/listening|http:\/\//i.test(String(d))) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  const client = new Client({ name: "smoke-http", version: "0.0.1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));
  await exercise(client, "http");
  await client.close();
  proc.kill();
}

rmSync(ws, { recursive: true, force: true });
console.log(process.exitCode ? "MCP smoke FAILED" : "MCP smoke OK");
process.exit(process.exitCode ?? 0);
