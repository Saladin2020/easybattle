extends SceneTree
## Frame capture for previews (needs a renderer, e.g. xvfb-run … --rendering-driver opengl3):
##   godot --path <export> --script res://capture.gd -- table=plains_fields seed=7 out=/tmp/frames every=3 max=900 lang=th

var _args := {}
var _frame := 0
var _saved := 0
var _done := false


func _init() -> void:
	for a in OS.get_cmdline_user_args():
		var kv := a.split("=", true, 1)
		_args[kv[0]] = kv[1] if kv.size() > 1 else "1"
	DirAccess.make_dir_recursive_absolute(_args.get("out", "/tmp/easybattle-frames"))
	await process_frame
	var battle = get_root().get_node("Battle")
	battle.lang = _args.get("lang", "th")
	battle.reset_party([], int(_args.get("level", "5")))
	var setup: Dictionary = battle.scripted(_args.get("table", "plains_fields"), int(_args.get("seed", "7")))
	setup["terrain"] = _args.get("terrain", "grass")
	var holder := Control.new()
	get_root().add_child(holder)
	battle.start(setup, holder, {"auto": true, "speed": float(_args.get("speed", "1.5")), "items": {"balm": 2, "kurma": 1}, "keep": true, "auto_close": true, "lang": battle.lang})
	battle.battle_ended.connect(func(_r, _w): _done = true)


func _process(_delta: float) -> bool:
	_frame += 1
	var every := int(_args.get("every", "3"))
	if _frame > 2 and _frame % every == 0:
		var img := get_root().get_texture().get_image()
		img.save_png("%s/frame_%04d.png" % [_args.get("out", "/tmp/easybattle-frames"), _saved])
		_saved += 1
	if (_done and _frame % every == 0 and _saved > 10) or _frame > int(_args.get("max", "1800")):
		print("saved %d frames" % _saved)
		return true
	return false
