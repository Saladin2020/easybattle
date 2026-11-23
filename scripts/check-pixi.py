"""Headless Chrome check of a PixiJS export: a battle is won with real mouse clicks.

  python3 scripts/check-pixi.py <pixi-export-dir> [screenshot.png]

Serves the folder on 127.0.0.1:8997, opens the first random table, then plays it by clicking the command menu
(skill or item once, then Attack) and a target until the battle ends. Then runs the boss table with Auto in Malay.
Prints a JSON report; exit 1 when the player did not win, the menu is missing, or the console has errors.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

DIR = sys.argv[1]
SHOT = sys.argv[2] if len(sys.argv) > 2 else None
PORT = 8997
srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=DIR, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

FIND = """(prefix) => { const ui = window.__battle.ui; if (!ui.menuBox.visible) return null;
  const c = ui.menuBox.children.find((x) => (x.label || '').startsWith(prefix) && x.eventMode !== 'none'); if (!c) return null;
  const g = c.getGlobalPosition(); return { x: g.x + 10, y: g.y + 5, label: c.label }; }"""


async def main():
    db = json.load(open(os.path.join(DIR, "easybattle.json")))["db"]
    first = next(t for t in db["encounters"] if not t.get("scripted"))["id"]
    boss = next((t for t in db["encounters"] if t.get("scripted")), None)
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get("CHROME_PATH", "/usr/bin/google-chrome"), args=["--use-gl=swiftshader", "--enable-unsafe-swiftshader"])
        pg = await b.new_page(viewport={"width": 1100, "height": 680})
        errs = []
        pg.on("console", lambda m: errs.append(f"{m.type}: {m.text}") if m.type in ("error",) else None)
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.on("response", lambda r: errs.append(f"http {r.status}: {r.url}") if r.status >= 400 and not r.url.endswith("/pixi.min.js") else None)
        await pg.goto(f"http://127.0.0.1:{PORT}/index.html?table={first}&level=5&speed=4&seed=3")
        await pg.wait_for_function("window.__ready === true", timeout=40000)
        box = await pg.locator("canvas").bounding_box()
        k = box["width"] / 480

        async def click(prefix):
            pos = await pg.evaluate(FIND, prefix)
            if not pos:
                return None
            await pg.mouse.click(box["x"] + pos["x"] * k, box["y"] + pos["y"] * k)
            await pg.wait_for_timeout(60)
            return pos["label"]

        clicks, problems, used = [], [], set()
        for _ in range(400):
            if await pg.evaluate("window.__battle.result"):
                break
            if not await pg.evaluate("window.__battle.ui.menuBox.visible"):
                await pg.wait_for_timeout(100)
                continue
            menu = await pg.evaluate("window.__battle.ui.menuBox.children.map((c) => c.label)")
            if "cmd:attack" in menu:
                if "skills" not in used and await click("cmd:skills"):
                    used.add("skills"); clicks.append("cmd:skills"); continue
                if "items" not in used and await click("cmd:items"):
                    used.add("items"); clicks.append("cmd:items"); continue
                clicks.append(await click("cmd:attack")); continue
            if any(m.startswith("skill:") for m in menu):
                clicks.append(await click("skill:") or await click("back")); continue
            if any(m.startswith("item:") for m in menu):
                clicks.append(await click("item:") or await click("back")); continue
            if any(m.startswith("target:") for m in menu):
                clicks.append(await click("target:")); continue
            await pg.wait_for_timeout(100)
        result = await pg.evaluate("window.__battle.result")
        rewards = await pg.evaluate("window.__battle.rewards")
        if result != "win":
            problems.append(f"manual battle ended with {result}")
        if not any(c and c.startswith("target:") for c in clicks):
            problems.append("never clicked a target")
        if SHOT:
            await pg.wait_for_timeout(500)
            await pg.locator("canvas").screenshot(path=SHOT.replace(".png", "-result.png"))
        boss_result = None
        if boss:
            await pg.goto(f"http://127.0.0.1:{PORT}/index.html?table={boss['id']}&level=14&speed=3&auto=1&lang=ms&seed=2")
            await pg.wait_for_function("window.__ready === true", timeout=40000)
            if SHOT:
                await pg.wait_for_timeout(900)
                await pg.locator("canvas").screenshot(path=SHOT)
            await pg.wait_for_function("window.__battle.result !== null", timeout=180000)
            boss_result = await pg.evaluate("window.__battle.result")
        real = [e for e in errs if "GL Driver Message" not in e and "Failed to load resource" not in e]
        report = {"table": first, "result": result, "clicks": len(clicks), "used": sorted(used), "rewards": rewards and {"xp": rewards["xp"], "coins": rewards["coins"]}, "boss": boss and boss["id"], "boss_result": boss_result, "problems": problems, "errors": real}
        print(json.dumps(report, ensure_ascii=False))
        await b.close()
        if problems or real:
            sys.exit(1)


try:
    asyncio.run(main())
finally:
    srv.terminate()
