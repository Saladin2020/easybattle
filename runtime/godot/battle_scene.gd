extends Control
## Easy Battle scene: side-view turn-based battle UI (480×270, nearest filter). Built in code so it works as-is and
## picks up Easy UI's theme, Easy FX strips and Easy SFX sounds when they are in the project.
##
##   var scene = Battle.start(Battle.scripted("plains_fields"))      # or Battle.step(...) on the overworld
##   await Battle.battle_ended
##
## Keys: arrows / WASD to move, Enter / Z / Space to choose, Esc / X to go back. Mouse works on every button.
##
## Layouts (easybattle.json "ui", or opts {layout, status, backdrop}):
##   classic  — side view, enemies left, party right (default; old exports without "ui" always use it)
##   backview — 16-bit back view: blue message window on top, enemies on a paddy/forest backdrop, the party seen
##              from behind (Easy Sprite back row) with curved HP gauges
##   status   — "rows" (classic panel), "cards" (Easy Portrait face, Lv, LIFE/POW bars, READY!/WAIT...) or "none"

signal finished(result: String, rewards: Dictionary, used_items: Dictionary)

const W := 480
const H := 270
const TEXT := {
	"attack": {"th": "โจมตี", "en": "Attack", "ms": "Serang"},
	"skills": {"th": "ทักษะ", "en": "Skills", "ms": "Kemahiran"},
	"items": {"th": "ไอเทม", "en": "Items", "ms": "Barang"},
	"defend": {"th": "ป้องกัน", "en": "Defend", "ms": "Bertahan"},
	"flee": {"th": "หนี", "en": "Flee", "ms": "Lari"},
	"back": {"th": "กลับ", "en": "Back", "ms": "Kembali"},
	"uses": {"th": "%s ใช้ %s", "en": "%s uses %s", "ms": "%s guna %s"},
	"appear": {"th": "%s ปรากฏตัว!", "en": "%s appeared!", "ms": "%s muncul!"},
	"miss": {"th": "พลาด", "en": "Miss", "ms": "Terlepas"},
	"crit": {"th": "คริติคอล!", "en": "Critical!", "ms": "Kritikal!"},
	"weak": {"th": "จุดอ่อน!", "en": "Weak!", "ms": "Lemah!"},
	"win": {"th": "ชนะแล้ว!", "en": "Victory!", "ms": "Menang!"},
	"lose": {"th": "พ่ายแพ้…", "en": "Defeated…", "ms": "Kalah…"},
	"fled": {"th": "หนีรอดแล้ว", "en": "Got away safely", "ms": "Berjaya lari"},
	"noflee": {"th": "หนีไม่พ้น!", "en": "Can't escape!", "ms": "Tak dapat lari!"},
	"nomp": {"th": "MP ไม่พอ", "en": "Not enough MP", "ms": "MP tak cukup"},
	"skip": {"th": "%s ขยับไม่ได้ (%s)", "en": "%s can't move (%s)", "ms": "%s tak boleh bergerak (%s)"},
	"xp": {"th": "ได้ EXP %d · เหรียญ %d", "en": "EXP %d · coins %d", "ms": "EXP %d · syiling %d"},
	"level": {"th": "%s เลเวล %d!", "en": "%s reached level %d!", "ms": "%s naik ke tahap %d!"},
	"learn": {"th": "เรียนรู้ %s", "en": "learned %s", "ms": "belajar %s"},
	"got": {"th": "ได้รับ %s ×%d", "en": "Got %s ×%d", "ms": "Dapat %s ×%d"},
	"defending": {"th": "%s ตั้งการ์ด", "en": "%s braces", "ms": "%s bertahan"},
	"who": {"th": "ใช้กับใคร?", "en": "Target?", "ms": "Sasaran?"},
}

var setup: Dictionary = {}
var opts: Dictionary = {}
var engine: EasyBattleEngine
var lang := "th"
var speed := 1.0
var auto_party := false
var used_items: Dictionary = {}

var _db: Dictionary
var _font: Font
var _theme: Theme
var _bg: Control
var _actors_layer: Control
var _fx_layer: Control
var _msg: Label
var _msg_panel: PanelContainer
var _party_panel: PanelContainer
var _party_rows: Array = []
var _menu_panel: PanelContainer
var _menu: VBoxContainer
var _result_panel: PanelContainer
var _sprites: Array = []      # per actor: {node, home, frames}
var _cursor  # Label (classic ▼) or Painter (back-view triangle)
var _audio: AudioStreamPlayer
var _busy := false
var _state := "busy"
var _pending: Dictionary = {}
var _result := ""
var _rewards: Dictionary = {}
# backview / status cards
var layout := "classic"
var status := "rows"
var backdrop := "auto"
var _ui: Dictionary = {}
var _L: Dictionary = {}       # screen layout rectangles for this party size (from easybattle.json ui.layouts)
var _ef                       # EasyFont autoload when present
var _turn := -1               # hero whose command it is (READY!), -1 = nobody
var _arcs: Array = []         # {i, p: Painter, hp: Label, box: Rect2}
var _cards: Array = []        # {i, R, bg, bars, portrait, faces, lv, life, life_v, pow, pow_v, state}
var _grid: Control
var _gbuttons: Array = []     # backview grid entries {b, hl, t, disabled, target, cb}
var _gsel := 0

const BLUE := {"fill": Color("#2a3a9c"), "fill2": Color("#3446b4"), "border": Color("#f2f4ff"), "inner": Color("#8a98e8"), "ink": Color("#0d0906"), "sel": Color("#5a6ef0"), "sel_text": Color("#ffe27a"), "text": Color("#f7f8ff"), "muted": Color("#8a90b8")}
const CARD := {"fill": Color("#1c2436"), "border": Color("#6a7aa8"), "active": Color("#ffd23a"), "active_fill": Color("#2c3a5c"), "life": Color("#5ad06a"), "life_low": Color("#e8c040"), "life_crit": Color("#e0503a"), "pow": Color("#4aa0f0"), "ready": Color("#ffe27a"), "wait": Color("#a8b0c8"), "down": Color("#e06a5a"), "lv": Color("#0d0906")}


## Draws a list of rects / polygons: [Rect2, Color] or [PackedVector2Array, Color]. Used for panels, bars, gauges.
class Painter extends Control:
	var cmds: Array = []

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func paint(list: Array) -> void:
		cmds = list
		queue_redraw()

	func _draw() -> void:
		for c in cmds:
			if c[0] is Rect2:
				draw_rect(c[0], c[1])
			else:
				draw_colored_polygon(c[0], c[1])


func _ready() -> void:
	var autoload := get_node_or_null("/root/Battle")
	_db = _load_db()
	if autoload and autoload.db.size():
		_db = autoload.db
	lang = opts.get("lang", autoload.lang if autoload else "th")
	speed = float(opts.get("speed", 1.0))
	auto_party = bool(opts.get("auto", false))
	size = Vector2(W, H)
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_build_theme()
	theme = _theme
	_resolve_ui(autoload)
	if not setup.has("party") or setup["party"].is_empty():
		setup["party"] = [{"id": _db["heroes"][0]["id"], "level": 3}, {"id": _db["heroes"][1]["id"], "level": 3}, {"id": _db["heroes"][2]["id"], "level": 3}]
	if not setup.has("seed"):
		setup["seed"] = 1
	engine = EasyBattleEngine.new(_db, setup)
	_build_ui()
	var names: Array = []
	for a in engine.actors:
		if int(a["side"]) == 1:
			names.append(_name(a))
	_say(_t("appear") % ", ".join(names))
	await _wait(0.6)
	_next()


var _item_names: Dictionary = {}


func _load_db() -> Dictionary:
	var f := FileAccess.open("res://easybattle/easybattle.json", FileAccess.READ)
	var data = JSON.parse_string(f.get_as_text())
	_item_names = data.get("itemNames", {})
	_ui = data.get("ui", {})
	return data["db"] if data.has("db") else data


func _t(key: String) -> String:
	if not TEXT.has(key):
		var u: Dictionary = _ui.get("text", {}).get(key, {})
		return u.get(lang, u.get("en", key))
	return TEXT[key].get(lang, TEXT[key]["en"])


func _resolve_ui(autoload: Node) -> void:
	if autoload and "ui" in autoload and autoload.ui is Dictionary and autoload.ui.size():
		_ui = autoload.ui
	layout = String(opts.get("layout", _ui.get("layout", "classic")))
	status = String(opts.get("status", _ui.get("status", "")))
	backdrop = String(opts.get("backdrop", _ui.get("backdrop", "auto")))
	if not layout in ["classic", "backview"]:
		layout = "classic"
	if status == "" or not status in ["rows", "cards", "none"]:
		status = "cards" if layout == "backview" else "rows"
	if layout == "backview" and status == "rows":
		status = "cards"
	var n := 0
	for p in setup.get("party", []):
		n += 1
	if n == 0:
		n = 3
	var key := "%s:%s" % [layout, status]
	var layouts: Dictionary = _ui.get("layouts", {})
	if layouts.has(key):
		_L = layouts[key].get(str(clampi(n, 1, 4)), {})
	if _L.is_empty():
		# old export without ui data: classic look, as before
		layout = "classic"
		status = "rows" if status != "none" else "none"
	_ef = get_node_or_null("/root/EasyFont")


func _has_pixel_font() -> bool:
	return _ef != null and _ef.fonts.has("makham-16")


func _shape(text: String) -> String:
	return _ef.shape(text) if _ef else text


## A Label in an Easy Font pixel font (makham-16 / makham-8) with its cell top at the label position.
## Falls back to the theme font when Easy Font is not in the project.
func _ptext(text: String, id: String, col: Color) -> Label:
	var l := Label.new()
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_stylebox_override("normal", StyleBoxEmpty.new())
	l.add_theme_constant_override("line_spacing", 0)
	l.add_theme_color_override("font_color", col)
	if _ef and _ef.fonts.has(id):
		l.add_theme_font_override("font", _ef.font(id))
		l.add_theme_font_size_override("font_size", _ef.size_of(id))
		l.set_meta("pixel", id)
	else:
		l.add_theme_font_size_override("font_size", 10 if id == "makham-16" else 8)
	_set_text(l, text)
	return l


func _set_text(l: Label, text: String) -> void:
	l.text = _shape(text) if l.has_meta("pixel") else text
	l.size = l.get_minimum_size()


func _text_w(l: Label) -> int:
	return int(l.get_minimum_size().x)


func _place(l: Control, x: float, y: float) -> void:
	l.position = Vector2(roundf(x), roundf(y + (0.0 if l.has_meta("pixel") else 4.0)))


func _rect(d) -> Rect2:
	return Rect2(float(d["x"]), float(d["y"]), float(d["w"]), float(d["h"]))


func _blue_panel(r: Rect2) -> Painter:
	var p := Painter.new()
	p.position = r.position
	p.size = r.size
	var w := r.size.x
	var h := r.size.y
	p.paint([[Rect2(0, 0, w, h), BLUE["ink"]], [Rect2(1, 1, w - 2, h - 2), BLUE["border"]], [Rect2(3, 3, w - 6, h - 6), BLUE["inner"]], [Rect2(4, 4, w - 8, h - 8), BLUE["fill"]], [Rect2(4, 4, w - 8, floorf((h - 8) / 2.0)), BLUE["fill2"]]])
	return p


## Enemy placement for the back view: one row centred on the field, feet on the horizon line (same formula as
## backviewEnemyRects in the TS/JS runtimes).
static func backview_enemy_rects(sizes: Array, base: Dictionary) -> Array:
	var total := 0
	for e in sizes:
		total += int(e["w"])
	var gap := maxi(4, mini(36, int(floor(float(456 - total) / float(maxi(1, sizes.size() + 1))))))
	var span := total + gap * (sizes.size() - 1)
	var x := int(round(240.0 - span / 2.0))
	var out: Array = []
	for k in sizes.size():
		var e: Dictionary = sizes[k]
		var feet := int(base["boss"]) if e.get("boss", false) else int(base["normal"]) - (k % 2) * 4
		out.append(Rect2(x, feet - int(e["h"]), int(e["w"]), int(e["h"])))
		x += int(e["w"]) + gap
	return out


func _name(a: Dictionary) -> String:
	return a["name"].get(lang, a["name"]["th"])


func _label_of(entry: Dictionary) -> String:
	return entry["name"].get(lang, entry["name"]["th"])


func _wait(sec: float) -> void:
	if speed <= 0.0:
		await get_tree().process_frame
		return
	await get_tree().create_timer(sec / speed).timeout


# ---------------------------------------------------------------- look
func _build_theme() -> void:
	if ResourceLoader.exists("res://easyui/themes/teak.tres"):
		_theme = load("res://easyui/themes/teak.tres").duplicate()
	else:
		_theme = Theme.new()
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color("#2a1d13f0")
		sb.border_color = Color("#f4ae3d")
		sb.set_border_width_all(1)
		sb.set_content_margin_all(4)
		sb.shadow_color = Color("#0d0906")
		sb.shadow_size = 0
		_theme.set_stylebox("panel", "PanelContainer", sb)
		var bn := StyleBoxFlat.new()
		bn.bg_color = Color("#3a2819")
		bn.set_content_margin_all(2)
		bn.content_margin_left = 6
		var bf := bn.duplicate()
		bf.bg_color = Color("#f4ae3d")
		_theme.set_stylebox("normal", "Button", bn)
		_theme.set_stylebox("hover", "Button", bf)
		_theme.set_stylebox("focus", "Button", bf)
		_theme.set_stylebox("pressed", "Button", bf)
		_theme.set_stylebox("disabled", "Button", bn)
		_theme.set_color("font_color", "Button", Color("#f7ebd3"))
		_theme.set_color("font_hover_color", "Button", Color("#2a1606"))
		_theme.set_color("font_focus_color", "Button", Color("#2a1606"))
		_theme.set_color("font_pressed_color", "Button", Color("#2a1606"))
		_theme.set_color("font_disabled_color", "Button", Color("#97805f"))
		_theme.set_color("font_color", "Label", Color("#f7ebd3"))
	for p in ["res://easybattle/fonts/Kanit-Regular.ttf"]:
		if ResourceLoader.exists(p):
			_font = load(p)
	if _font:
		_theme.default_font = _font
	_theme.default_font_size = 10


func _terrain_colors() -> Array:
	var t: String = setup.get("terrain", "grass")
	match t:
		"forest":
			return [Color("#2e4a3a"), Color("#4c7a3a"), Color("#2f5a2a")]
		"mountain", "cave":
			return [Color("#3a3a52"), Color("#6a6a7a"), Color("#4a4a5a")]
		"beach", "water":
			return [Color("#5aa8d8"), Color("#e8d8a0"), Color("#d8c890")]
		"road", "town":
			return [Color("#7ab8d8"), Color("#b8946a"), Color("#a07a52")]
		_:
			return [Color("#7ab8e0"), Color("#79c48a"), Color("#5aa86a")]


func _build_ui() -> void:
	if layout == "backview":
		_build_backview()
		return
	_bg = Control.new()
	_bg.size = Vector2(W, H)
	add_child(_bg)
	var bgp: String = setup.get("background", "")
	if bgp != "" and ResourceLoader.exists("res://easybattle/backgrounds/%s.png" % bgp):
		var tr := TextureRect.new()
		tr.texture = load("res://easybattle/backgrounds/%s.png" % bgp)
		tr.size = Vector2(W, H)
		tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
		tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		_bg.add_child(tr)
	else:
		var c := _terrain_colors()
		var sky := ColorRect.new()
		sky.color = c[0]
		sky.size = Vector2(W, 90)
		_bg.add_child(sky)
		var sky2 := ColorRect.new()
		sky2.color = c[0].lightened(0.15)
		sky2.position = Vector2(0, 40)
		sky2.size = Vector2(W, 50)
		_bg.add_child(sky2)
		var hills := Polygon2D.new()
		hills.color = c[2].darkened(0.35)
		hills.polygon = PackedVector2Array([Vector2(0, 90), Vector2(0, 66), Vector2(60, 54), Vector2(130, 70), Vector2(210, 50), Vector2(300, 68), Vector2(380, 52), Vector2(480, 64), Vector2(480, 90)])
		_bg.add_child(hills)
		var ground := ColorRect.new()
		ground.color = c[1]
		ground.position = Vector2(0, 86)
		ground.size = Vector2(W, 184)
		_bg.add_child(ground)
		var band := ColorRect.new()
		band.color = c[2]
		band.position = Vector2(0, 86)
		band.size = Vector2(W, 3)
		_bg.add_child(band)
		for i in 18:
			var tuft := ColorRect.new()
			tuft.color = c[2]
			tuft.position = Vector2(fmod(i * 97.0 + 13.0, float(W)), 96.0 + fmod(i * 37.0, 96.0))
			tuft.size = Vector2(6, 2)
			_bg.add_child(tuft)
	_actors_layer = Control.new()
	_actors_layer.size = Vector2(W, H)
	add_child(_actors_layer)
	_fx_layer = Control.new()
	_fx_layer.size = Vector2(W, H)
	_fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fx_layer)
	_place_actors()
	_msg_panel = PanelContainer.new()
	_msg_panel.position = Vector2(8, 6)
	_msg_panel.custom_minimum_size = Vector2(464, 22)
	_msg = Label.new()
	_msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_msg_panel.add_child(_msg)
	add_child(_msg_panel)
	_party_panel = PanelContainer.new()
	_party_panel.visible = status == "rows"
	_party_panel.position = Vector2(176, 196)
	_party_panel.custom_minimum_size = Vector2(296, 68)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 1)
	_party_panel.add_child(rows)
	for a in engine.actors:
		if int(a["side"]) != 0:
			continue
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 4)
		var nm := Label.new()
		nm.text = _name(a)
		nm.custom_minimum_size = Vector2(70, 0)
		nm.clip_text = true
		var hp := ProgressBar.new()
		hp.custom_minimum_size = Vector2(80, 8)
		hp.show_percentage = false
		hp.max_value = int(a["max"]["hp"])
		hp.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_bar_style(hp, Color("#d0473a"))
		var hpl := Label.new()
		hpl.custom_minimum_size = Vector2(44, 0)
		var mp := ProgressBar.new()
		mp.custom_minimum_size = Vector2(44, 8)
		mp.show_percentage = false
		mp.max_value = maxi(1, int(a["max"]["mp"]))
		mp.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		_bar_style(mp, Color("#3c8ce8"))
		var mpl := Label.new()
		mpl.custom_minimum_size = Vector2(24, 0)
		row.add_child(nm)
		row.add_child(hp)
		row.add_child(hpl)
		row.add_child(mp)
		row.add_child(mpl)
		rows.add_child(row)
		_party_rows.append({"actor": engine.actors.find(a), "name": nm, "hp": hp, "hpl": hpl, "mp": mp, "mpl": mpl})
	add_child(_party_panel)
	_menu_panel = PanelContainer.new()
	var m := _rect(_L["menu"]) if _L.has("menu") else Rect2(8, 196, 162, 68)
	_menu_panel.position = m.position
	_menu_panel.custom_minimum_size = m.size
	var scroll := ScrollContainer.new()
	scroll.custom_minimum_size = Vector2(154, 60)
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_menu = VBoxContainer.new()
	_menu.add_theme_constant_override("separation", 1)
	_menu.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_menu)
	_menu_panel.add_child(scroll)
	_menu_panel.visible = false
	add_child(_menu_panel)
	_cursor = Label.new()
	_cursor.text = "▼"
	_cursor.add_theme_color_override("font_color", Color("#ffd27a"))
	_cursor.visible = false
	add_child(_cursor)
	if status == "cards":
		_build_cards()
	_audio = AudioStreamPlayer.new()
	add_child(_audio)
	_refresh()


# ---------------------------------------------------------------- backview
func _build_backview() -> void:
	var L := _L
	_bg = Control.new()
	_bg.size = Vector2(W, H)
	add_child(_bg)
	var terrain: String = setup.get("terrain", "grass")
	var bd := backdrop if backdrop != "auto" else ("forest" if terrain in ["forest", "mountain", "cave"] else "paddy")
	var bdp := "res://easybattle/backdrops/backview_%s.png" % bd
	if ResourceLoader.exists(bdp):
		var tr := TextureRect.new()
		tr.name = "Backdrop"
		tr.texture = load(bdp)
		tr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_bg.add_child(tr)
	else:
		var p := Painter.new()
		p.paint([[_rect(L["field"]), Color("#79c48a")], [_rect(L["strip"]), Color("#1a120c")]])
		_bg.add_child(p)
	var shadows := Painter.new()
	_bg.add_child(shadows)
	_actors_layer = Control.new()
	_actors_layer.size = Vector2(W, H)
	_actors_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_actors_layer)
	var hero_layer := Control.new()
	hero_layer.size = Vector2(W, H)
	hero_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hero_layer)
	var enemies: Array = []
	var heroes: Array = []
	for i in engine.actors.size():
		if int(engine.actors[i]["side"]) == 1:
			enemies.append(i)
		else:
			heroes.append(i)
	_sprites.resize(engine.actors.size())
	var defs: Array = []
	var sizes: Array = []
	for i in enemies:
		var e: Dictionary = {}
		for x in _db["enemies"]:
			if x["id"] == engine.actors[i]["id"]:
				e = x
		defs.append(e)
		var boss: bool = e.get("boss", false)
		sizes.append({"w": 80 if boss else 48, "h": 64 if boss else 48, "boss": boss})
	var rects := backview_enemy_rects(sizes, L["enemyBase"])
	var sh: Array = []
	for k in enemies.size():
		var i: int = enemies[k]
		var r: Rect2 = rects[k]
		var e: Dictionary = defs[k]
		# facing the camera; older exports without front strips use the side art
		var path := "res://easybattle/enemies/%s_front.png" % e.get("art", "")
		if not ResourceLoader.exists(path):
			path = "res://easybattle/enemies/%s.png" % e.get("art", "")
		var at := AtlasTexture.new()
		if ResourceLoader.exists(path):
			at.atlas = load(path)
		at.region = Rect2(0, 0, r.size.x, r.size.y)
		var spr := TextureRect.new()
		spr.name = "Enemy%d" % i
		spr.texture = at
		spr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		spr.position = r.position
		spr.size = r.size
		_actors_layer.add_child(spr)
		_sprites[i] = {"node": spr, "home": spr.position, "atlas": at, "w": int(r.size.x), "h": int(r.size.y), "enemy": true}
		var cx := r.position.x + r.size.x / 2.0
		var fy := r.position.y + r.size.y - 2
		var hw := r.size.x / 2.0 - 6
		sh.append([PackedVector2Array([Vector2(cx - hw, fy), Vector2(cx - hw * 0.7, fy - 2), Vector2(cx + hw * 0.7, fy - 2), Vector2(cx + hw, fy), Vector2(cx + hw * 0.7, fy + 2), Vector2(cx - hw * 0.7, fy + 2)]), Color(0, 0, 0, 0.28)])
	shadows.paint(sh)
	var row: Dictionary = _ui.get("sheetRow", {"side": 1, "back": 2})
	var scale := float(L.get("heroScale", 2))
	for k in heroes.size():
		var i: int = heroes[k]
		var a: Dictionary = engine.actors[i]
		var slot: Dictionary = L["slots"][k]
		var h: Dictionary = {}
		for x in _db["heroes"]:
			if x["id"] == a["id"]:
				h = x
		var back := "res://easybattle/heroes/%s.png" % h.get("back", "%s_back" % h.get("id", ""))
		var side := "res://easybattle/heroes/%s.png" % h.get("sprite", h.get("id", ""))
		var use_back := ResourceLoader.exists(back)
		var at := AtlasTexture.new()
		if use_back:
			at.atlas = load(back)
		elif ResourceLoader.exists(side):
			at.atlas = load(side)
		var y0 := int(row["back"] if use_back else row["side"]) * 48
		at.region = Rect2(0, y0, 48, 48)
		var spr := TextureRect.new()
		spr.name = "Hero%d" % i
		spr.texture = at
		spr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		var sr := _rect(slot["sprite"])
		spr.position = sr.position
		spr.scale = Vector2(scale, scale)
		hero_layer.add_child(spr)
		_sprites[i] = {"node": spr, "home": spr.position, "atlas": at, "w": int(sr.size.x), "h": int(sr.size.y), "enemy": false, "row": y0}
		var arc := Painter.new()
		arc.name = "Arc%d" % i
		add_child(arc)
		var hp := _ptext(_t("hp"), "makham-8", Color.WHITE)
		hp.name = "ArcLabel%d" % i
		var hl := _rect(slot["hpLabel"])
		_place(hp, hl.position.x, hl.position.y)
		add_child(hp)
		_arcs.append({"i": i, "p": arc, "hp": hp, "box": _rect(slot["arc"])})
	_msg_panel = null
	var win := _blue_panel(_rect(L["window"]))
	win.name = "Window"
	add_child(win)
	var tr0 := _rect(L["textRows"][0])
	_msg = _ptext("", "makham-16", BLUE["text"])
	_msg.name = "Message"
	_place(_msg, tr0.position.x, tr0.position.y)
	add_child(_msg)
	_grid = Control.new()
	_grid.name = "Menu"
	_grid.position = _rect(L["menu"]).position
	_grid.size = _rect(L["menu"]).size
	_grid.visible = false
	add_child(_grid)
	# classic code paths hide/show _menu_panel; in the back view it is the grid
	_menu_panel = PanelContainer.new()
	_menu_panel.visible = false
	_menu = VBoxContainer.new()
	if status == "cards":
		_build_cards()
	_fx_layer = Control.new()
	_fx_layer.size = Vector2(W, H)
	_fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_fx_layer)
	var cur := Painter.new()
	cur.paint([[PackedVector2Array([Vector2(-1, -1), Vector2(10, -1), Vector2(4.5, 6)]), BLUE["ink"]], [PackedVector2Array([Vector2(0, 0), Vector2(9, 0), Vector2(4.5, 5)]), Color("#ffe27a")]])
	cur.visible = false
	add_child(cur)
	_cursor = cur
	_audio = AudioStreamPlayer.new()
	add_child(_audio)
	_refresh()


func _draw_arc(a: Dictionary) -> void:
	var actor: Dictionary = engine.actors[a["i"]]
	var box: Rect2 = a["box"]
	var n := 16
	var hp := int(actor["hp"])
	var mx := maxi(1, int(actor["max"]["hp"]))
	var filled := 0 if hp <= 0 else maxi(1, int(ceil(float(n * hp) / mx)))
	var ratio := float(hp) / mx
	var col: Color = CARD["life"] if ratio > 0.5 else (CARD["life_low"] if ratio > 0.25 else CARD["life_crit"])
	var cx := box.position.x + box.size.x
	var cy := box.position.y + box.size.y
	var pts: Array = []
	for k in n:
		var ang := PI + (k + 0.5) * (PI / 2.0 / n)
		pts.append(Vector2(roundf(cx + cos(ang) * (box.size.x - 3)) - 2, roundf(cy + sin(ang) * (box.size.y - 3)) - 2))
	var cmds: Array = []
	for p in pts:
		cmds.append([Rect2(p - Vector2(1, 1), Vector2(6, 6)), BLUE["ink"]])
	for k in n:
		cmds.append([Rect2(pts[k], Vector2(4, 4)), col if k < filled else Color("#3a3020")])
	for k in filled:
		cmds.append([Rect2(pts[k], Vector2(4, 1)), Color("#d8ffd0")])
	a["p"].paint(cmds)
	a["hp"].modulate.a = 1.0 if hp > 0 else 0.5


# ---------------------------------------------------------------- status cards
func _build_cards() -> void:
	var crop: Dictionary = _ui.get("portraitCrop", {"x": 12, "y": 4, "w": 40, "h": 40})
	var k := 0
	for i in engine.actors.size():
		var a: Dictionary = engine.actors[i]
		if int(a["side"]) != 0:
			continue
		var R: Dictionary = _L["cards"][k]
		k += 1
		var c := Control.new()
		c.name = "Card%d" % i
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(c)
		var bg := Painter.new()
		c.add_child(bg)
		var pr := _rect(R["portrait"])
		var faces: Array = []
		var fp := "res://easybattle/portraits/%s.png" % a["id"]
		var portrait: Control
		if ResourceLoader.exists(fp):
			var tex: Texture2D = load(fp)
			for f in 4:
				var at := AtlasTexture.new()
				at.atlas = tex
				at.region = Rect2(f * 64 + int(crop["x"]), int(crop["y"]), int(crop["w"]), int(crop["h"]))
				faces.append(at)
			var t := TextureRect.new()
			t.texture = faces[0]
			t.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
			portrait = t
		else:
			var col := Color("#f4ae3d")
			for h in _db["heroes"]:
				if h["id"] == a["id"]:
					col = Color(h.get("color", "#f4ae3d"))
			var p := Painter.new()
			p.paint([[Rect2(Vector2.ZERO, pr.size), col]])
			portrait = p
		portrait.name = "Portrait"
		portrait.position = pr.position
		portrait.size = pr.size
		c.add_child(portrait)
		var bars := Painter.new()
		c.add_child(bars)
		var lvr := _rect(R["lv"])
		var lvbg := Painter.new()
		lvbg.paint([[lvr, CARD["border"]], [lvr.grow(-1), CARD["lv"]]])
		c.add_child(lvbg)
		var compact: bool = R.get("compact", false)
		var e := {"i": i, "R": R, "c": c, "bg": bg, "bars": bars, "portrait": portrait, "faces": faces,
			"lv": _ptext("", "makham-8", Color.WHITE),
			"life": _ptext("" if compact else _t("life"), "makham-16", Color("#d8f0d8")),
			"life_v": _ptext("", "makham-16", Color.WHITE),
			"pow": _ptext("" if compact else _t("pow"), "makham-16", Color("#d0e4ff")),
			"pow_v": _ptext("", "makham-16", Color.WHITE),
			"state": _ptext("", "makham-16", CARD["wait"])}
		for key in ["lv", "life", "life_v", "pow", "pow_v", "state"]:
			e[key].name = key.capitalize().replace(" ", "")
			c.add_child(e[key])
		_cards.append(e)


func card_state(i: int) -> String:
	if int(engine.actors[i]["hp"]) <= 0:
		return "down"
	return "ready" if i == _turn else "wait"


func _refresh_cards() -> void:
	for e in _cards:
		var R: Dictionary = e["R"]
		var a: Dictionary = engine.actors[e["i"]]
		var st := card_state(e["i"])
		var active := st == "ready"
		var r := _rect(R["rect"])
		var pr := _rect(R["portrait"])
		e["bg"].paint([[r, CARD["lv"]], [r.grow(-1), CARD["active"] if active else CARD["border"]], [r.grow(-2), CARD["active_fill"] if active else CARD["fill"]], [pr.grow(1), CARD["lv"]]])
		var hp := int(a["hp"])
		var ratio := float(hp) / maxf(1.0, float(a["max"]["hp"]))
		if e["faces"].size() == 4:
			e["portrait"].texture = e["faces"][3 if hp <= 0 else (1 if _result == "win" else (2 if ratio <= 0.3 else 0))]
		e["portrait"].modulate.a = 1.0 if hp > 0 else 0.55
		_set_text(e["lv"], "%s%d" % [_t("lv"), int(a["level"])])
		var lvr := _rect(R["lv"])
		_place(e["lv"], lvr.position.x + 2, lvr.position.y - 4)
		var ll := _rect(R["lifeLabel"])
		var pl := _rect(R["powLabel"])
		_place(e["life"], ll.position.x, ll.position.y)
		_place(e["pow"], pl.position.x, pl.position.y)
		_set_text(e["life_v"], "%d/%d" % [hp, int(a["max"]["hp"])])
		_set_text(e["pow_v"], "%d/%d" % [int(a["mp"]), int(a["max"]["mp"])])
		_place(e["life_v"], ll.end.x - _text_w(e["life_v"]), ll.position.y)
		_place(e["pow_v"], pl.end.x - _text_w(e["pow_v"]), pl.position.y)
		var lc: Color = CARD["life"] if ratio > 0.5 else (CARD["life_low"] if ratio > 0.25 else CARD["life_crit"])
		var cmds: Array = []
		for b in [[_rect(R["lifeBar"]), maxf(0.0, ratio), lc], [_rect(R["powBar"]), float(a["mp"]) / maxf(1.0, float(a["max"]["mp"])) if int(a["max"]["mp"]) > 0 else 0.0, CARD["pow"]]]:
			var br: Rect2 = b[0]
			cmds.append([br.grow(1), CARD["lv"]])
			cmds.append([br, Color("#2a2a3a")])
			cmds.append([Rect2(br.position, Vector2(roundf(br.size.x * b[1]), br.size.y)), b[2]])
		e["bars"].paint(cmds)
		_set_text(e["state"], _t(st))
		e["state"].add_theme_color_override("font_color", CARD["ready"] if st == "ready" else (CARD["down"] if st == "down" else CARD["wait"]))
		var sr := _rect(R["state"])
		_place(e["state"], sr.position.x + roundf((sr.size.x - _text_w(e["state"])) / 2.0), sr.position.y)


## Where everything ended up on screen, for tests and tools:
## {window, enemies: [Rect2], heroes: [Rect2], arcs: [Rect2], cards: [Rect2], card_text: [[Rect2 label, Rect2 card]],
##  menu_text: [[Rect2 label, Rect2 cell]], states: [String]}
func layout_rects() -> Dictionary:
	var out := {"window": Rect2(), "enemies": [], "heroes": [], "arcs": [], "cards": [], "card_text": [], "menu_text": [], "states": []}
	if _L.has("window"):
		out["window"] = _rect(_L["window"])
	for s in _sprites:
		if s:
			var r := Rect2(s["home"], Vector2(s["w"], s["h"]))
			out["enemies" if s["enemy"] else "heroes"].append(r)
	for a in _arcs:
		out["arcs"].append(a["box"])
	for e in _cards:
		var cr := _rect(e["R"]["rect"])
		out["cards"].append(cr)
		for key in ["lv", "life", "life_v", "pow", "pow_v", "state"]:
			var l: Label = e[key]
			if l.text != "":
				out["card_text"].append([Rect2(l.position, l.get_minimum_size()), cr])
		out["states"].append(card_state(e["i"]))
	for g in _gbuttons:
		var b: Button = g["b"]
		if b.visible:
			var t: Label = g["t"]
			out["menu_text"].append([Rect2(_grid.position + b.position + t.position, t.get_minimum_size()), Rect2(_grid.position + b.position, b.size)])
	return out


func _bar_style(bar: ProgressBar, col: Color) -> void:
	var bg := StyleBoxFlat.new()
	bg.bg_color = Color("#140e0a")
	bg.border_color = Color("#0d0906")
	bg.set_border_width_all(1)
	var fg := StyleBoxFlat.new()
	fg.bg_color = col
	bar.add_theme_stylebox_override("background", bg)
	bar.add_theme_stylebox_override("fill", fg)


func _place_actors() -> void:
	var enemies: Array = []
	var heroes: Array = []
	for i in engine.actors.size():
		if int(engine.actors[i]["side"]) == 1:
			enemies.append(i)
		else:
			heroes.append(i)
	_sprites.resize(engine.actors.size())
	for k in enemies.size():
		var i: int = enemies[k]
		var a: Dictionary = engine.actors[i]
		var e: Dictionary = {}
		for x in _db["enemies"]:
			if x["id"] == a["id"]:
				e = x
		var tex: Texture2D = load("res://easybattle/enemies/%s.png" % e["art"]) if ResourceLoader.exists("res://easybattle/enemies/%s.png" % e["art"]) else null
		var fw := 80 if e.get("boss", false) else 48
		var fh := 64 if e.get("boss", false) else 48
		var spr := TextureRect.new()
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(0, 0, fw, fh)
		spr.texture = at
		spr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		var cols := 3 if enemies.size() > 3 else enemies.size()
		var col := k % 3
		var rowi := k / 3
		var x := 36.0 + col * 60.0 + rowi * 28.0 + (0.0 if cols == 3 else 30.0)
		var y := 146.0 - fh + rowi * 40.0 + (col % 2) * 16.0
		if e.get("boss", false):
			x = 70.0
			y = 170.0 - fh
		spr.position = Vector2(x, y)
		spr.scale = Vector2(1, 1)
		_actors_layer.add_child(spr)
		_sprites[i] = {"node": spr, "home": spr.position, "atlas": at, "w": fw, "h": fh, "enemy": true}
	for k in heroes.size():
		var i: int = heroes[k]
		var a: Dictionary = engine.actors[i]
		var h: Dictionary = {}
		for x in _db["heroes"]:
			if x["id"] == a["id"]:
				h = x
		var path := "res://easybattle/heroes/%s.png" % h.get("sprite", h["id"])
		var spr := TextureRect.new()
		var at := AtlasTexture.new()
		if ResourceLoader.exists(path):
			at.atlas = load(path)
		at.region = Rect2(0, 48, 48, 48)
		spr.texture = at
		spr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		spr.position = Vector2(356.0 + k * 22.0, 86.0 + k * 28.0)
		_actors_layer.add_child(spr)
		_sprites[i] = {"node": spr, "home": spr.position, "atlas": at, "w": 48, "h": 48, "enemy": false}


func _hero_frame(i: int, frame: int) -> void:
	var s: Dictionary = _sprites[i]
	if s and not s["enemy"]:
		s["atlas"].region = Rect2(frame * 48, int(s.get("row", 48)), 48, 48)


func _enemy_frame(i: int, frame: int) -> void:
	var s: Dictionary = _sprites[i]
	if s and s["enemy"]:
		s["hit"] = frame == 2
		s["atlas"].region = Rect2(frame * s["w"], 0, s["w"], s["h"])


var _ms := 0.0


func _process(delta: float) -> void:
	_ms += delta * 1000.0
	# back view: enemies breathe (idle bob, frames 0/1), staggered so a group does not move in lockstep
	if layout == "backview":
		for i in _sprites.size():
			var s = _sprites[i]
			if s and s["enemy"] and not s.get("hit", false):
				s["atlas"].region = Rect2((int(floor(_ms / 420.0 + i * 0.5)) % 2) * s["w"], 0, s["w"], s["h"])
	_atb_process(delta)


func _refresh() -> void:
	for a in _arcs:
		_draw_arc(a)
	_refresh_cards()
	for r in _party_rows:
		var a: Dictionary = engine.actors[r["actor"]]
		r["hp"].value = int(a["hp"])
		r["hpl"].text = "%d/%d" % [int(a["hp"]), int(a["max"]["hp"])]
		r["mp"].value = int(a["mp"])
		r["mpl"].text = str(int(a["mp"]))
		r["name"].modulate = Color(1, 1, 1, 1) if int(a["hp"]) > 0 else Color(0.6, 0.4, 0.4, 1)


func _say(text: String) -> void:
	if layout == "backview":
		var w := float(_L["textRows"][0]["w"])
		var wrapped: String = _ef.wrap(text, "makham-16", int(w)) if _has_pixel_font() else text
		var lines := wrapped.split("\n")
		var keep := 1 if _grid.visible else 3
		_msg.text = "\n".join(lines.slice(0, keep))
		_msg.size = _msg.get_minimum_size()
		return
	_msg.text = text


func _center(i: int) -> Vector2:
	var s: Dictionary = _sprites[i]
	return s["node"].position + Vector2(s["w"] / 2.0, s["h"] / 2.0)


func _popup(i: int, text: String, col: Color) -> void:
	if layout == "backview":
		var pl := _ptext(text, "makham-16", col)
		pl.add_theme_color_override("font_shadow_color", Color("#0d0906"))
		pl.add_theme_constant_override("shadow_offset_x", 1)
		pl.add_theme_constant_override("shadow_offset_y", 1)
		var c := _center(i)
		# enemies stand right under the message window, so their numbers rise from the body
		pl.position = Vector2(roundf(c.x - _text_w(pl) / 2.0), roundf(c.y - (19.0 if _sprites[i]["enemy"] else 41.0)))
		_fx_layer.add_child(pl)
		var tw0 := create_tween()
		tw0.tween_property(pl, "position:y", pl.position.y - 14, 0.6 / maxf(speed, 0.01))
		tw0.tween_callback(pl.queue_free)
		return
	var l := Label.new()
	l.text = text
	l.add_theme_color_override("font_color", col)
	l.add_theme_color_override("font_outline_color", Color("#0d0906"))
	l.add_theme_constant_override("outline_size", 3)
	l.position = _center(i) + Vector2(-12, -30)
	_fx_layer.add_child(l)
	var tw := create_tween()
	tw.tween_property(l, "position:y", l.position.y - 14, 0.6 / maxf(speed, 0.01))
	tw.tween_callback(l.queue_free)


func _play_fx(id: String, i: int) -> void:
	if id == "":
		return
	var png := "res://easybattle/fx/%s.png" % id
	var meta := "res://easybattle/fx/%s.json" % id
	if not ResourceLoader.exists(png) or not FileAccess.file_exists(meta):
		return
	var info = JSON.parse_string(FileAccess.get_file_as_string(meta))
	var frames := SpriteFrames.new()
	frames.set_animation_loop("default", false)
	frames.set_animation_speed("default", float(info.get("fps", 16)) * speed)
	var tex: Texture2D = load(png)
	var fw := int(info["w"])
	var fh := int(info["h"])
	for f in int(info["frames"]):
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(f * fw, 0, fw, fh)
		frames.add_frame("default", at)
	var spr := AnimatedSprite2D.new()
	spr.sprite_frames = frames
	spr.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	spr.position = _center(i)
	_fx_layer.add_child(spr)
	spr.play("default")
	spr.animation_finished.connect(spr.queue_free)


func _play_sfx(id: String) -> void:
	if id == "" or speed <= 0.0:
		return
	var p := "res://easybattle/sfx/%s.wav" % id
	if ResourceLoader.exists(p):
		_audio.stream = load(p)
		_audio.play()


# ---------------------------------------------------------------- flow
func _next() -> void:
	_refresh()
	if engine.over != "":
		_finish()
		return
	var i := engine.current()
	if i < 0:
		_finish()
		return
	_turn = i if int(engine.actors[i]["side"]) == 0 else -1
	_refresh()
	if int(engine.actors[i]["side"]) == 1 or auto_party:
		await _wait(0.25)
		await _do(engine.auto())
	else:
		_pending = {"actor": i}
		_hero_step(i, true)
		_open_commands()


func _hero_step(i: int, forward: bool) -> void:
	var s: Dictionary = _sprites[i]
	if s and not s["enemy"]:
		var off := Vector2(0, -6) if layout == "backview" else Vector2(-10, 0)
		s["node"].position = s["home"] + (off if forward else Vector2.ZERO)


func _do(action: Dictionary) -> void:
	_state = "busy"
	_menu_panel.visible = false
	if _grid:
		_grid.visible = false
	_cursor.visible = false
	var events := engine.act(action)
	for ev in events:
		await _show(ev)
	_refresh()
	_next()


func _show(ev: Dictionary) -> void:
	match ev["t"]:
		"act":
			var a: Dictionary = engine.actors[ev["actor"]]
			var sk := engine.skill(ev["skill"])
			_say(_t("uses") % [_name(a), _label_of(sk)])
			_play_sfx(ev.get("sfx", ""))
			var s: Dictionary = _sprites[ev["actor"]]
			if s["enemy"]:
				var tw := create_tween()
				tw.tween_property(s["node"], "position", s["home"] + (Vector2(0, 8) if layout == "backview" else Vector2(12, 0)), 0.12 / maxf(speed, 0.01))
				tw.tween_property(s["node"], "position", s["home"], 0.12 / maxf(speed, 0.01))
			else:
				_hero_frame(ev["actor"], 18)
			await _wait(0.2)
			_hero_frame(ev["actor"], 19)
			for t in ev["targets"]:
				_play_fx(ev.get("fx", ""), t)
			await _wait(0.3)
			_hero_frame(ev["actor"], 0)
			_hero_step(ev["actor"], false)
		"item":
			var a: Dictionary = engine.actors[ev["actor"]]
			used_items[ev["item"]] = int(used_items.get(ev["item"], 0)) + 1
			_say(_t("uses") % [_name(a), _item_label(ev["item"])])
			for t in ev["targets"]:
				_play_fx("heal_plus", t)
			_play_sfx("powerup")
			await _wait(0.4)
			_hero_step(ev["actor"], false)
		"defend":
			_say(_t("defending") % _name(engine.actors[ev["actor"]]))
			_hero_step(ev["actor"], false)
			await _wait(0.3)
		"skip":
			var st := engine.status(ev["status"])
			_say(_t("skip") % [_name(engine.actors[ev["actor"]]), _label_of(st)])
			await _wait(0.4)
		"miss":
			_popup(ev["target"], _t("miss"), Color("#cdb492"))
			await _wait(0.2)
		"damage":
			var i: int = ev["target"]
			_enemy_frame(i, 2)
			_hero_frame(i, 20)
			_play_sfx("hurt" if not _sprites[i]["enemy"] else "")
			var txt := str(ev["amount"])
			if ev["crit"]:
				txt = _t("crit") + " " + txt
			elif ev["weak"]:
				txt = _t("weak") + " " + txt
			_popup(i, txt, Color("#fffaf0") if _sprites[i]["enemy"] else Color("#ff8a7a"))
			_refresh()
			await _wait(0.25)
			_enemy_frame(i, 0)
			_hero_frame(i, 0 if int(engine.actors[i]["hp"]) > 0 else 23)
		"heal":
			_popup(ev["target"], ("+%d MP" if ev["mp"] else "+%d") % int(ev["amount"]), Color("#79c48a") if not ev["mp"] else Color("#7ab8ff"))
			_refresh()
			await _wait(0.25)
		"status":
			var st := engine.status(ev["status"])
			_popup(ev["target"], ("+" if ev["on"] else "−") + _label_of(st), Color(st.get("color", "#ffd27a")))
			await _wait(0.2)
		"tick":
			_popup(ev["target"], str(ev["amount"]), Color("#c39bd3") if int(ev["amount"]) < 0 else Color("#79c48a"))
			_refresh()
			await _wait(0.2)
		"down":
			var i: int = ev["target"]
			if _sprites[i]["enemy"]:
				var tw := create_tween()
				tw.tween_property(_sprites[i]["node"], "modulate:a", 0.0, 0.3 / maxf(speed, 0.01))
			else:
				_hero_frame(i, 23)
			await _wait(0.3)
		"flee":
			_say(_t("fled") if ev["ok"] else _t("noflee"))
			await _wait(0.5)
		"nomp":
			_say(_t("nomp"))
			await _wait(0.4)
		"end":
			pass


func _item_label(id: String) -> String:
	var items_node := get_node_or_null("/root/Items")
	if items_node and items_node.has_method("item_name"):
		return items_node.item_name(id, lang)
	if _item_names.has(id):
		return _item_names[id].get(lang, _item_names[id]["th"])
	return id.replace("_", " ")


func _clear_menu() -> void:
	if _grid:
		for c in _grid.get_children():
			_grid.remove_child(c)
			c.queue_free()
		_gbuttons.clear()
		return
	for c in _menu.get_children():
		_menu.remove_child(c)
		c.queue_free()


func _button(text: String, cb: Callable, disabled := false) -> Button:
	if _grid:
		return _grid_button(text, cb, disabled)
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.disabled = disabled
	b.pressed.connect(cb)
	b.focus_mode = Control.FOCUS_ALL
	_menu.add_child(b)
	return b


func _focus_first() -> void:
	if _grid:
		_grid.visible = true
		var k := 0
		for j in _gbuttons.size():
			if not _gbuttons[j]["disabled"]:
				k = j
				break
		_gfocus(k)
		return
	for c in _menu.get_children():
		if c is Button and not c.disabled:
			c.grab_focus()
			return


func _open_commands() -> void:
	_state = "command"
	_clear_menu()
	var a: Dictionary = engine.actors[_pending["actor"]]
	_say(_name(a))
	_button(_t("attack"), func(): _choose_target({"kind": "attack"}, "enemy"))
	_button(_t("skills"), _open_skills, a["skills"].is_empty())
	var has_items := false
	for it in _db.get("items", []):
		if int(engine.items.get(it["item"], 0)) > 0:
			has_items = true
	_button(_t("items"), _open_items, not has_items)
	_button(_t("defend"), func(): _do({"kind": "defend"}))
	_button(_t("flee"), func(): _do({"kind": "flee"}))
	_menu_panel.visible = true
	_focus_first()


func _open_skills() -> void:
	_state = "skills"
	_clear_menu()
	var a: Dictionary = engine.actors[_pending["actor"]]
	for s in a["skills"]:
		var sk := engine.skill(s)
		var cost := int(sk.get("mp", 0))
		_button("%s  %d" % [_label_of(sk), cost], func(): _choose_target({"kind": "skill", "skill": s}, sk["target"]), cost > int(a["mp"]))
	_button(_t("back"), _open_commands)
	_focus_first()


func _open_items() -> void:
	_state = "items"
	_clear_menu()
	for it in _db.get("items", []):
		var n := int(engine.items.get(it["item"], 0))
		if n > 0:
			_button("%s ×%d" % [_item_label(it["item"]), n], func(): _choose_target({"kind": "item", "item": it["item"]}, it.get("target", "ally")))
	_button(_t("back"), _open_commands)
	_focus_first()


func _choose_target(action: Dictionary, target_kind: String) -> void:
	if target_kind in ["self", "all_enemies", "all_allies"]:
		_do(action)
		return
	_state = "target"
	_clear_menu()
	_say(_t("who"))
	var pool := engine.alive(1) if target_kind == "enemy" else engine.alive(0)
	for t in pool:
		var act := action.duplicate()
		act["target"] = t
		var b := _button("%s  %d/%d" % [_name(engine.actors[t]), int(engine.actors[t]["hp"]), int(engine.actors[t]["max"]["hp"])], func(): _do(act))
		b.set_meta("target", t)
		b.focus_entered.connect(_point.bind(t))
		b.mouse_entered.connect(_point.bind(t))
	_button(_t("back"), _open_commands)
	_focus_first()


## Back view: a 3 × 2 command grid inside the message window, paged when there are more than 6 entries.
func _grid_button(text: String, cb: Callable, disabled: bool) -> Button:
	var G: Dictionary = _L["grid"]
	var cw := float(G["cell"]["w"])
	var ch := float(G["cell"]["h"])
	var b := Button.new()
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	for st in ["normal", "hover", "pressed", "disabled", "focus"]:
		b.add_theme_stylebox_override(st, StyleBoxEmpty.new())
	b.size = Vector2(cw, ch)
	b.disabled = disabled
	b.name = "Cmd%d" % _gbuttons.size()
	var hl := Painter.new()
	hl.paint([[Rect2(2, 1, cw - 4, ch - 2), BLUE["sel"]], [PackedVector2Array([Vector2(3, 7), Vector2(7, 11), Vector2(3, 15)]), BLUE["sel_text"]]])
	hl.visible = false
	b.add_child(hl)
	var t := _ptext(text, "makham-16", BLUE["muted"] if disabled else BLUE["text"])
	var mx := int(cw) - 14
	if _text_w(t) > mx and text.contains("  "):
		_set_text(t, text.split("  ")[0])
	var s := text.split("  ")[0] if text.contains("  ") else text
	while _text_w(t) > mx and s.length() > 1:
		s = s.substr(0, s.length() - 1)
		_set_text(t, s)
	_place(t, 10, 0)
	b.add_child(t)
	var k := _gbuttons.size()
	b.pressed.connect(cb)
	b.mouse_entered.connect(func(): _gfocus(k))
	_grid.add_child(b)
	_gbuttons.append({"b": b, "hl": hl, "t": t, "disabled": disabled})
	return b


func _gfocus(k: int) -> void:
	if _gbuttons.is_empty():
		return
	_gsel = clampi(k, 0, _gbuttons.size() - 1)
	var G: Dictionary = _L["grid"]
	var per := int(G["cols"]) * int(G["rows"])
	var page := _gsel / per
	for j in _gbuttons.size():
		var e: Dictionary = _gbuttons[j]
		var p := j % per
		e["b"].visible = j / per == page
		e["b"].position = Vector2((p % int(G["cols"])) * float(G["cell"]["w"]), (p / int(G["cols"])) * float(G["cell"]["h"]))
		e["hl"].visible = j == _gsel
		e["t"].add_theme_color_override("font_color", BLUE["muted"] if e["disabled"] else (BLUE["sel_text"] if j == _gsel else BLUE["text"]))
	var f: Button = _gbuttons[_gsel]["b"]
	if f.has_meta("target"):
		_point(int(f.get_meta("target")))
	else:
		_cursor.visible = false


func _gstep(d: int) -> void:
	var n := _gbuttons.size()
	var k := _gsel
	for j in n:
		k = (k + d + n) % n
		if not _gbuttons[k]["disabled"]:
			break
	_gfocus(k)


func _point(i: int) -> void:
	_cursor.visible = true
	var s: Dictionary = _sprites[i]
	if layout == "backview":
		var y: float = s["node"].position.y - 6 if s["enemy"] else s["home"].y - 2
		_cursor.position = Vector2(roundf(s["node"].position.x + s["w"] / 2.0 - 4.5), y)
		return
	_cursor.position = s["node"].position + Vector2(s["w"] / 2.0 - 5, -14)


func _unhandled_input(event: InputEvent) -> void:
	if _state == "busy" or _state == "done":
		if _state == "done" and (event.is_action_pressed("ui_accept") or (event is InputEventMouseButton and event.pressed)):
			_close()
		return
	if _grid and _grid.visible and event is InputEventKey and event.pressed:
		var cols := int(_L["grid"]["cols"])
		var handled := true
		match event.keycode:
			KEY_RIGHT, KEY_D:
				_gstep(1)
			KEY_LEFT, KEY_A:
				_gstep(-1)
			KEY_DOWN, KEY_S:
				_gstep(cols)
			KEY_UP, KEY_W:
				_gstep(-cols)
			KEY_ENTER, KEY_KP_ENTER, KEY_Z, KEY_SPACE:
				var e: Dictionary = _gbuttons[_gsel]
				if not e["disabled"]:
					e["b"].pressed.emit()
			_:
				handled = false
		if handled:
			get_viewport().set_input_as_handled()
			return
	if event.is_action_pressed("ui_cancel") or (event is InputEventKey and event.pressed and event.keycode == KEY_X):
		if _state != "command":
			_open_commands()
			get_viewport().set_input_as_handled()


func _finish() -> void:
	if _state == "done":
		return
	_state = "done"
	_menu_panel.visible = false
	if _grid:
		_grid.visible = false
	_cursor.visible = false
	_result = engine.over
	_rewards = engine.rewards()
	_turn = -1
	_refresh()
	if layout == "backview" and _has_pixel_font():
		_finish_backview()
		return
	_result_panel = PanelContainer.new()
	_result_panel.position = Vector2(120, 60)
	_result_panel.custom_minimum_size = Vector2(240, 0)
	var box := VBoxContainer.new()
	_result_panel.add_child(box)
	var title := Label.new()
	title.text = _t(_result)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 14)
	title.add_theme_color_override("font_color", Color("#ffd27a"))
	box.add_child(title)
	if _result == "win":
		var l := Label.new()
		l.text = _t("xp") % [int(_rewards["xp"]), int(_rewards["coins"])]
		box.add_child(l)
		for d in _rewards["drops"]:
			var dl := Label.new()
			dl.text = _t("got") % [_item_label(d["item"]), int(d["n"])]
			box.add_child(dl)
		for lv in _rewards["levels"]:
			var ll := Label.new()
			var nm := ""
			for a in engine.actors:
				if a["id"] == lv["id"]:
					nm = _name(a)
			ll.text = _t("level") % [nm, int(lv["to"])]
			for s in lv["learned"]:
				ll.text += " · " + _t("learn") % _label_of(engine.skill(s))
			ll.add_theme_color_override("font_color", Color("#79c48a"))
			box.add_child(ll)
		for i in engine.actors.size():
			if int(engine.actors[i]["side"]) == 0 and int(engine.actors[i]["hp"]) > 0:
				_hero_frame(i, 16)
		_play_fx("level_up" if _rewards["levels"].size() else "", _party_rows[0]["actor"])
		_play_sfx("coin")
	add_child(_result_panel)
	_say(_t(_result))
	if opts.get("auto_close", false) or speed <= 0.0:
		await _wait(1.2)
		_close()


func _finish_backview() -> void:
	var lines: Array = []
	if _result == "win":
		lines.append(_t("xp") % [int(_rewards["xp"]), int(_rewards["coins"])])
		for d in _rewards["drops"]:
			lines.append(_t("got") % [_item_label(d["item"]), int(d["n"])])
		for lv in _rewards["levels"]:
			var nm := ""
			for a in engine.actors:
				if a["id"] == lv["id"]:
					nm = _name(a)
			lines.append(_t("level") % [nm, int(lv["to"])])
	var h := mini(124, 34 + 22 * lines.size())
	var box := _blue_panel(Rect2(100, 84, 280, h))
	box.name = "Result"
	var title := _ptext(_t(_result), "makham-16", BLUE["sel_text"])
	title.position = Vector2(roundf(140 - _text_w(title) / 2.0), 6)
	box.add_child(title)
	for k in mini(lines.size(), 4):
		var l := _ptext(lines[k], "makham-16", BLUE["text"])
		l.position = Vector2(14, 28 + k * 22)
		box.add_child(l)
	_result_panel = PanelContainer.new()
	add_child(box)
	if _result == "win":
		for i in engine.actors.size():
			if int(engine.actors[i]["side"]) == 0 and int(engine.actors[i]["hp"]) > 0:
				_hero_frame(i, 16)
		_play_sfx("coin")
	_refresh()
	_say(_t(_result))
	if opts.get("auto_close", false) or speed <= 0.0:
		await _wait(1.2)
		_close()


func _close() -> void:
	if not is_inside_tree():
		return
	finished.emit(_result, _rewards, used_items)
	if opts.get("keep", false):
		return
	queue_free()


func _atb_process(_delta: float) -> void:
	pass
