import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasyBattleMcp } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const server = createEasyBattleMcp(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});
const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);

describe("MCP server", () => {
  it("lists the tools", async () => {
    expect((await client.listTools()).tools.map((t) => t.name).sort()).toEqual([...MCP_TOOL_NAMES].sort());
  });

  it("info → write (refused, then saved) → check → simulate → roll → render → export", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.enemies.length).toBe(17);
    expect(info.format).toMatch(/Content rules/);

    const bad = body(await client.callTool({ name: "write_battles", arguments: { id: "game", doc: { format: "easybattle/1", enemies: [{ id: "slug", name: { th: "ทาก", en: "Slug" }, level: 1, stats: { hp: 10, mp: 0, atk: 3, def: 1, mag: 1, res: 1, spd: 2 }, skills: [{ skill: "nope", weight: 1 }], xp: 2, coins: 1, art: "mud" }] } } }));
    expect(bad.saved).toBe(false);
    const good = body(await client.callTool({ name: "write_battles", arguments: { id: "game", doc: { format: "easybattle/1", enemies: [{ id: "slug", name: { th: "ทากยักษ์", en: "Giant slug", ms: "Siput gergasi" }, level: 1, stats: { hp: 30, mp: 0, atk: 5, def: 2, mag: 1, res: 1, spd: 2 }, skills: [{ skill: "attack", weight: 1 }], xp: 4, coins: 2, art: "mud", weak: ["fire"] }] } } }));
    expect(good.errors).toEqual([]);
    expect(good.saved).toBe(true);

    expect(body(await client.callTool({ name: "get_entry", arguments: { id: "slug" } })).source).toBe("game.easybattle.json");
    expect(body(await client.callTool({ name: "check_battles", arguments: {} })).ok).toBe(true);

    const sim = body(await client.callTool({ name: "simulate_battle", arguments: { party: [{ id: "ton", level: 3 }, { id: "nurul", level: 3 }], enemies: [{ id: "slug" }, { id: "slug" }], seed: 2 } }));
    expect(sim.result).toBe("win");
    expect(sim.rewards.xp).toBe(8);
    const rate = body(await client.callTool({ name: "simulate_battle", arguments: { party: [{ id: "ton", level: 1 }], table: "plains_fields", runs: 20 } }));
    expect(rate.runs).toBe(20);

    const roll = body(await client.callTool({ name: "roll_encounter", arguments: { culture: "malay", terrain: "forest", times: 3 } }));
    expect(roll.rolls[0].table).toBe("kampung_forest");

    for (const what of ["battle", "bestiary"]) {
      const r = await client.callTool({ name: "render_battle", arguments: { what, scale: 1 } });
      expect((r.content as Array<{ type: string }>)[0]!.type).toBe("image");
    }
    const bv = await client.callTool({ name: "render_battle", arguments: { what: "battle", scale: 1, layout: "backview", status: "cards", backdrop: "forest" } });
    expect((bv.content as Array<{ type: string }>)[0]!.type).toBe("image");
    expect(body(await client.callTool({ name: "write_battles", arguments: { id: "screen", doc: { format: "easybattle/1", ui: { layout: "sideways" } } } })).saved).toBe(false);
    const exp = body(await client.callTool({ name: "export_battle", arguments: { preset: "pixi", bundle: false } }));
    expect(exp.files).toBeGreaterThan(5);
  }, 60_000);
});

describe("web API", () => {
  it("serves the workspace, simulates and guards writes", async () => {
    const app = createApp({ workspaceRoot: root, webRoot: "/nonexistent", dev: true, host: "127.0.0.1" });
    const ws = (await (await app.request("http://127.0.0.1/api/workspace", { headers: { host: "127.0.0.1:8938" } })).json()) as { heroes: unknown[] };
    expect(ws.heroes.length).toBe(4);
    const sim = await app.request("http://127.0.0.1/api/sim", { method: "POST", headers: { host: "127.0.0.1:8938", "content-type": "application/json", origin: "http://127.0.0.1:8938" }, body: JSON.stringify({ setup: { party: [{ id: "ton", level: 5 }], enemies: [{ id: "paddy_crab" }], seed: 1 } }) });
    expect(((await sim.json()) as { result: string }).result).toBe("win");
    const png = await app.request("http://127.0.0.1/api/enemy/cobra.png", { headers: { host: "127.0.0.1:8938" } });
    expect(png.headers.get("content-type")).toBe("image/png");
    const prev = await app.request("http://127.0.0.1/api/render?layout=backview&status=cards&table=paddy_pests", { headers: { host: "127.0.0.1:8938" } });
    expect(prev.headers.get("content-type")).toBe("image/png");
    const h = { host: "127.0.0.1:8938", "content-type": "application/json", origin: "http://127.0.0.1:8938" };
    const saved = (await (await app.request("http://127.0.0.1/api/ui", { method: "POST", headers: h, body: JSON.stringify({ doc: "screen", ui: { layout: "backview", status: "cards" } }) })).json()) as { ok: boolean };
    expect(saved.ok).toBe(true);
    const ws2 = (await (await app.request("http://127.0.0.1/api/workspace", { headers: { host: "127.0.0.1:8938" } })).json()) as { ui: { layout: string; status: string } };
    expect(ws2.ui).toMatchObject({ layout: "backview", status: "cards" });
    const evil = await app.request("http://127.0.0.1/api/docs/x", { method: "POST", headers: { host: "127.0.0.1:8938", origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(evil.status).toBe(403);
  });
});
