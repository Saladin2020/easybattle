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
			if a == null:
				e.act(e.auto())
			elif a.has("wait"):
				e.advance(int(a["wait"]), bool(a.get("menu", false)))
			elif a.has("ready"):
				var r := e.ready_actor()
				if r >= 0:
					e.act(e.auto(r), r)
			else:
				e.act(a)
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
		# back view + status cards in every language: fits 480×270, nothing overlaps, READY!/WAIT.../DOWN states
		if FileAccess.file_exists("res://easybattle/backdrops/backview_paddy.png"):
			for lang in ["th", "en", "ms"]:
				battle.lang = lang
				battle.reset_party([], 6)
				var bs: Dictionary = battle.scripted("paddy_pests" if _has_table(db, "paddy_pests") else "plains_fields", 3)
				var sc = battle.start(bs, root_node, {"speed": 0.0, "layout": "backview", "status": "cards", "lang": lang, "keep": true})
				for f in 30:
					await process_frame
					if sc._state == "command":
						break
				var bad := _check_layout(sc.layout_rects(), lang)
				var st: Array = sc.layout_rects()["states"]
				if st.count("ready") != 1 or st.count("wait") != st.size() - 1:
					bad.append("states %s" % [st])
				var hi: int = sc._turn
				var keep_hp: int = sc.engine.actors[hi]["hp"]
				sc.engine.actors[hi]["hp"] = 0
				sc._refresh()
				if not "down" in sc.layout_rects()["states"]:
					bad.append("no DOWN state")
				sc.engine.actors[hi]["hp"] = keep_hp
				sc._refresh()
				print("B| backview %s cards=%d enemies=%d states=%s %s" % [lang, sc._cards.size(), sc.layout_rects()["enemies"].size(), ",".join(st), "ok" if bad.is_empty() else "FAILED " + "; ".join(bad)])
				if not bad.is_empty():
					fail = true
				sc.auto_party = true
				sc._do(sc.engine.auto())
				for f in 400:
					await process_frame
					if sc._state == "done":
						break
				print("B| backview %s result=%s" % [lang, sc._result])
				if sc._state != "done":
					fail = true
				sc.queue_free()
				await process_frame
			# classic + cards and classic + none still build
			for stv in ["cards", "none"]:
				battle.lang = "th"
				battle.reset_party([], 6)
				var sc2 = battle.start(battle.scripted("plains_fields", 5), root_node, {"speed": 0.0, "auto": true, "status": stv, "keep": true})
				for f in 400:
					await process_frame
					if sc2._state == "done":
						break
				var bad2 := _check_layout(sc2.layout_rects(), "th")
				print("B| classic %s result=%s %s" % [stv, sc2._result, "ok" if bad2.is_empty() else "FAILED " + "; ".join(bad2)])
				if sc2._state != "done" or not bad2.is_empty():
					fail = true
				sc2.queue_free()
				await process_frame
	print("FAIL" if fail else "OK")
	quit(1 if fail else 0)


func _has_table(db: Dictionary, id: String) -> bool:
	for t in db["encounters"]:
		if t["id"] == id:
			return true
	return false


func _check_layout(L: Dictionary, lang: String) -> Array:
	var bad: Array = []
	var screen := Rect2(0, 0, 480, 270)
	var all: Array = []
	if L["window"].size.x > 0:
		all.append(["window", L["window"]])
	for k in L["enemies"].size():
		all.append(["enemy%d" % k, L["enemies"][k]])
	for k in L["arcs"].size():
		all.append(["arc%d" % k, L["arcs"][k]])
	for k in L["cards"].size():
		all.append(["card%d" % k, L["cards"][k]])
	for x in all + L["heroes"].map(func(r): return ["hero", r]):
		if not screen.encloses(x[1]):
			bad.append("%s off screen %s" % [x[0], x[1]])
	for i in all.size():
		for j in range(i + 1, all.size()):
			if all[i][1].intersects(all[j][1]):
				bad.append("%s overlaps %s" % [all[i][0], all[j][0]])
	for e in L["enemies"]:
		for c in L["cards"]:
			if e.intersects(c):
				bad.append("enemy under card")
	for pair in L["card_text"] + L["menu_text"]:
		var t: Rect2 = pair[0]
		var c: Rect2 = pair[1]
		if t.position.x < c.position.x or t.end.x > c.end.x:
			bad.append("[%s] text %s wider than %s" % [lang, t, c])
	return bad
