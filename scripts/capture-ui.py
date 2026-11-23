"""Screenshot the web editor (needs `easybattle serve` running).

  python3 scripts/capture-ui.py [url] [out.png] [tab] [action]

tab: party | enemies | skills | encounters | simulate | documents | check. action "sim" clicks Auto battle.
"""
import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8938/"
out = sys.argv[2] if len(sys.argv) > 2 else "docs/assets/editor.png"
tab = sys.argv[3] if len(sys.argv) > 3 else "enemies"
action = sys.argv[4] if len(sys.argv) > 4 else ""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))
    pg.goto(url)
    pg.wait_for_timeout(1200)
    pg.locator(f"[data-tab={tab}]").click()
    pg.wait_for_timeout(600)
    if action == "sim":
        pg.get_by_role("button", name="Auto battle").click()
        pg.wait_for_timeout(800)
    elif tab in ("enemies", "party"):
        pg.locator(".card").nth(3 if tab == "enemies" else 1).click()
        pg.wait_for_timeout(600)
    pg.wait_for_timeout(800)
    pg.screenshot(path=out)
    b.close()
    print("errors:", errors)
    print(out)
