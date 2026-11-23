extends SceneTree
## Headless checks:  godot --headless --path <export> --script res://test_battle.gd
## 1. parity: replays the scripted battles from parity.json and compares with the TypeScript engine
## 2. encounters: every non-scripted table rolls a valid group
## 3. scene: an auto battle runs to the end in battle_scene.tscn and the Battle autoload applies rewards

func _canon(v) -> String:
	if v == null:
		return "null"
	if v is bool:
		return "true" if v else "false"
	if v is int:
		return str(v)
	if v is float:
		if v == floor(v):
			return str(int(v))
		return str(snappedf(v, 0.001))
	if v is String or v is StringName:
		return JSON.stringify(str(v))
	if v is Array:
		var parts: Array = []
		for x in v:
			parts.append(_canon(x))
		return "[" + ",".join(parts) + "]"
	if v is Dictionary:
		var keys: Array = v.keys()
		keys.sort()
		var parts2: Array = []
		for k in keys:
			parts2.append(JSON.stringify(str(k)) + ":" + _canon(v[k]))
		return "{" + ",".join(parts2) + "}"
	return JSON.stringify(v)


func _fnv(s: String) -> String:
	var h := 0x811c9dc5
	for b in s.to_utf8_buffer():
		h = h ^ b
		h = (h * 0x01000193) & 0xFFFFFFFF
	return "%08x" % h


func _init() -> void:
	var fail := false
	var data = JSON.parse_string(FileAccess.get_file_as_string("res://easybattle/easybattle.json"))
	var db: Dictionary = data["db"]
	var parity: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://easybattle/parity.json"))
	var n := 0
	for case in parity["cases"]:
		var e := EasyBattleEngine.new(db, case["setup"])
		for a in case["actions"]:
			if e.over != "":
				break
			e.act(e.auto() if a == null else a)
		e.auto_run()
		var snap := _canon(e.snapshot())
		var logh := _fnv(_canon(e.log))
		var rew := _canon(e.rewards())
		if snap != case["snapshot"] or logh != case["log"] or rew != case["rewards"]:
			print("FAIL parity %s" % case["name"])
			print("  gd  %s %s" % [snap, logh])
			print("  ts  %s %s" % [case["snapshot"], case["log"]])
			print("  gd rewards %s" % rew)
			print("  ts rewards %s" % case["rewards"])
			fail = true
		n += 1
	print("P| parity %s cases=%d" % ["ok" if not fail else "FAILED", n])
	await process_frame
	var ab = get_root().get_node_or_null("Battle")
	var tables := 0
	var rolls := 0
	for ep in (parity.get("encounters", []) if ab != null else []):
		for t in db["encounters"]:
			if t["id"] != ep["table"]:
				continue
			tables += 1
			for k in range(ep["rolls"].size()):
				var setup: Dictionary = ab.encounter_setup(t, k + 1)
				var ids: Array = []
				for f in setup["enemies"]:
					ids.append(f["id"])
				if "+".join(ids) != ep["rolls"][k]:
					print("FAIL encounter %s seed %d: gd %s ts %s" % [t["id"], k + 1, "+".join(ids), ep["rolls"][k]])
					fail = true
				rolls += 1
	print("E| tables=%d rolls=%d" % [tables, rolls])
	# scene run
	var root_node := Node.new()
	get_root().add_child(root_node)
	await process_frame
	var battle = get_root().get_node_or_null("Battle")
	if battle == null:
		print("FAIL no Battle autoload")
		fail = true
	else:
		battle.reset_party([], 6)
		var setup: Dictionary = battle.scripted("plains_fields", 5)
		var scene = battle.start(setup, root_node, {"auto": true, "speed": 0.0, "items": {"balm": 1}})
		var res = await battle.battle_ended
		print("S| scene result=%s party=%s" % [res[0], _canon(battle.party)])
		if res[0] != "win":
			fail = true
	print("FAIL" if fail else "OK")
	quit(1 if fail else 0)
