extends Control
## Easy Battle demo: pick an encounter table (or a boss) and fight it with the sample party.
## Command line (after --): table=<id> seed=<n> auto=1 level=<n> lang=th|en|ms speed=<x> layout=classic|backview status=rows|cards|none

var _list: VBoxContainer
var _args := {}


func _ready() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.split("=", true, 1)
		_args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	Battle.lang = _args.get("lang", "th")
	Battle.reset_party([], int(_args.get("level", "4")))
	if _args.has("table"):
		_start(_args["table"])
		return
	_menu()


func _menu() -> void:
	for c in get_children():
		c.queue_free()
	var bg := ColorRect.new()
	bg.color = Color("#140e0a")
	bg.size = Vector2(480, 270)
	add_child(bg)
	var panel := PanelContainer.new()
	panel.position = Vector2(110, 20)
	panel.custom_minimum_size = Vector2(260, 230)
	add_child(panel)
	_list = VBoxContainer.new()
	panel.add_child(_list)
	var t := Label.new()
	t.text = "Easy Battle · ต่อสู้แบบผลัดตา"
	t.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_list.add_child(t)
	var lay := Button.new()
	lay.text = "Layout: %s · %s" % [_args.get("layout", "classic"), _args.get("status", "auto")]
	lay.pressed.connect(func():
		var order := ["classic", "backview"]
		_args["layout"] = order[(order.find(_args.get("layout", "classic")) + 1) % 2]
		_menu())
	_list.add_child(lay)
	var sts := Button.new()
	sts.text = "Status: %s" % _args.get("status", "auto")
	sts.pressed.connect(func():
		var order := ["auto", "rows", "cards", "none"]
		_args["status"] = order[(order.find(_args.get("status", "auto")) + 1) % 4]
		_menu())
	_list.add_child(sts)
	for e in Battle.db["encounters"]:
		var b := Button.new()
		var nm: Dictionary = e.get("name", {"th": e["id"]})
		b.text = ("★ " if e.get("scripted", false) else "") + nm.get(Battle.lang, nm.get("th", e["id"]))
		b.pressed.connect(_start.bind(e["id"]))
		_list.add_child(b)
	_list.get_child(3).grab_focus()


func _start(table: String) -> void:
	for c in get_children():
		c.queue_free()
	var setup := Battle.scripted(table, int(_args.get("seed", "7")))
	for t in Battle.db["encounters"]:
		if t["id"] == table:
			setup["terrain"] = t["terrains"][0] if t["terrains"][0] != "any" else "grass"
	var opts := {"auto": _args.has("auto"), "speed": float(_args.get("speed", "1")), "items": {"balm": 2, "teh_tarik": 1, "kurma": 2}, "lang": Battle.lang}
	if _args.get("layout", "") != "":
		opts["layout"] = _args["layout"]
	if _args.get("status", "auto") != "auto":
		opts["status"] = _args["status"]
	var scene := Battle.start(setup, self, opts)
	await Battle.battle_ended
	if not _args.has("table"):
		_menu()
