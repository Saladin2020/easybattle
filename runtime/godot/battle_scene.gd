extends Control
## Easy Battle scene: side-view turn-based battle UI (480×270, nearest filter). Built in code so it works as-is and
## picks up Easy UI's theme, Easy FX strips and Easy SFX sounds when they are in the project.
##
##   var scene = Battle.start(Battle.scripted("plains_fields"))      # or Battle.step(...) on the overworld
##   await Battle.battle_ended
##
## Keys: arrows / WASD to move, Enter / Z / Space to choose, Esc / X to go back. Mouse works on every button.

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
var _cursor: Label
var _audio: AudioStreamPlayer
var _busy := false
var _state := "busy"
var _pending: Dictionary = {}
var _result := ""
var _rewards: Dictionary = {}


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
	return data["db"] if data.has("db") else data


func _t(key: String) -> String:
	return TEXT[key].get(lang, TEXT[key]["en"])


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
	_menu_panel.position = Vector2(8, 196)
	_menu_panel.custom_minimum_size = Vector2(162, 68)
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
	_audio = AudioStreamPlayer.new()
	add_child(_audio)
	_refresh()


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
		s["atlas"].region = Rect2(frame * 48, 48, 48, 48)


func _enemy_frame(i: int, frame: int) -> void:
	var s: Dictionary = _sprites[i]
	if s and s["enemy"]:
		s["atlas"].region = Rect2(frame * s["w"], 0, s["w"], s["h"])


func _refresh() -> void:
	for r in _party_rows:
		var a: Dictionary = engine.actors[r["actor"]]
		r["hp"].value = int(a["hp"])
		r["hpl"].text = "%d/%d" % [int(a["hp"]), int(a["max"]["hp"])]
		r["mp"].value = int(a["mp"])
		r["mpl"].text = str(int(a["mp"]))
		r["name"].modulate = Color(1, 1, 1, 1) if int(a["hp"]) > 0 else Color(0.6, 0.4, 0.4, 1)


func _say(text: String) -> void:
	_msg.text = text


func _center(i: int) -> Vector2:
	var s: Dictionary = _sprites[i]
	return s["node"].position + Vector2(s["w"] / 2.0, s["h"] / 2.0)


func _popup(i: int, text: String, col: Color) -> void:
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
		s["node"].position = s["home"] + (Vector2(-10, 0) if forward else Vector2.ZERO)


func _do(action: Dictionary) -> void:
	_state = "busy"
	_menu_panel.visible = false
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
				tw.tween_property(s["node"], "position", s["home"] + Vector2(12, 0), 0.12 / maxf(speed, 0.01))
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
	for c in _menu.get_children():
		_menu.remove_child(c)
		c.queue_free()


func _button(text: String, cb: Callable, disabled := false) -> Button:
	var b := Button.new()
	b.text = text
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.disabled = disabled
	b.pressed.connect(cb)
	b.focus_mode = Control.FOCUS_ALL
	_menu.add_child(b)
	return b


func _focus_first() -> void:
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
		b.focus_entered.connect(_point.bind(t))
		b.mouse_entered.connect(_point.bind(t))
	_button(_t("back"), _open_commands)
	_focus_first()


func _point(i: int) -> void:
	_cursor.visible = true
	var s: Dictionary = _sprites[i]
	_cursor.position = s["node"].position + Vector2(s["w"] / 2.0 - 5, -14)


func _unhandled_input(event: InputEvent) -> void:
	if _state == "busy" or _state == "done":
		if _state == "done" and (event.is_action_pressed("ui_accept") or (event is InputEventMouseButton and event.pressed)):
			_close()
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
	_cursor.visible = false
	_result = engine.over
	_rewards = engine.rewards()
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


func _close() -> void:
	if not is_inside_tree():
		return
	finished.emit(_result, _rewards, used_items)
	if opts.get("keep", false):
		return
	queue_free()
