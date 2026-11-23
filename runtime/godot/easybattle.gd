extends Node
## Easy Battle autoload ("Battle"). Loads res://easybattle/easybattle.json, keeps the party (levels, XP, HP, MP),
## rolls random encounters per overworld region / culture / terrain, and starts battles in battle_scene.tscn.
##
## Integrations (all optional, detected at runtime):
##   Easy Items  /root/Items  — battle items come from the bag; drops and loot tables go into it.
##   Easy Save   to_dict() / from_dict() — store the party in your SaveManager slot.
##   Easy UI     res://easyui/themes/teak.tres — used as the battle UI theme when present.
##   Easy FX     res://easybattle/fx/<id>.png + .json strips (export bundles the ones skills use).
##   Easy SFX    res://easybattle/sfx/<id>.wav (export bundles the ones skills use).

signal battle_started(setup: Dictionary)
signal battle_ended(result: String, rewards: Dictionary)
signal party_changed

const DB_PATH := "res://easybattle/easybattle.json"
const SCENE_PATH := "res://easybattle/battle_scene.tscn"

var db: Dictionary = {}
var party: Array = []          # [{id, level, hp, mp, xp}]
var coins := 0
var steps := 0
var lang := "th"
var _rng := RandomNumberGenerator.new()
var _scene: Node = null


func _ready() -> void:
	load_db()
	_rng.seed = 20261123


func load_db(path: String = DB_PATH) -> void:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("Easy Battle: cannot open %s" % path)
		return
	var data = JSON.parse_string(f.get_as_text())
	db = data["db"] if data.has("db") else data
	if party.is_empty():
		reset_party()


func reset_party(ids: Array = [], level: int = 1) -> void:
	party = []
	var size := int(db["rules"]["partySize"])
	var pick: Array = ids if ids.size() else []
	if pick.is_empty():
		for h in db["heroes"]:
			if pick.size() < size:
				pick.append(h["id"])
	for id in pick:
		var h := hero(id)
		var mx := EasyBattleEngine.hero_stats(h, level)
		party.append({"id": id, "level": level, "hp": int(mx["hp"]), "mp": int(mx["mp"]), "xp": 0})
	coins = int(db["rules"].get("startCoins", 0))
	party_changed.emit()


func hero(id: String) -> Dictionary:
	for h in db["heroes"]:
		if h["id"] == id:
			return h
	return {}


func enemy(id: String) -> Dictionary:
	for e in db["enemies"]:
		if e["id"] == id:
			return e
	return {}


func label(entry: Dictionary, l: String = "") -> String:
	var n: Dictionary = entry.get("name", {})
	var k := l if l != "" else lang
	return n.get(k, n.get("th", entry.get("id", "")))


func heal_party() -> void:
	for p in party:
		var mx := EasyBattleEngine.hero_stats(hero(p["id"]), int(p["level"]))
		p["hp"] = int(mx["hp"])
		p["mp"] = int(mx["mp"])
	party_changed.emit()


# ---------------------------------------------------------------- encounters
func terrain_of(code: String) -> String:
	return db["rules"]["terrainCodes"].get(code, "grass")


func pick_table(region: String, culture: String, terrain: String) -> Dictionary:
	var pool: Array = []
	for t in db["encounters"]:
		if t.get("scripted", false):
			continue
		if terrain == "" or t["terrains"].has("any") or t["terrains"].has(terrain):
			pool.append(t)
	for t in pool:
		if region != "" and t.get("regions", []).has(region):
			return t
	for t in pool:
		if culture != "" and t.get("cultures", []).has(culture):
			return t
	for t in pool:
		if t.get("regions", []).is_empty() and t.get("cultures", []).is_empty():
			return t
	return {}


## Call once per overworld step. Returns {} or a battle setup (enemies + seed) when an encounter triggers.
func step(region: String, culture: String, ground_code: String) -> Dictionary:
	var t := pick_table(region, culture, terrain_of(ground_code))
	if t.is_empty():
		return {}
	steps += 1
	if _rng.randf() * float(t["rate"]) >= 1.0 or steps < 4:
		return {}
	steps = 0
	return encounter_setup(t)


func encounter_setup(t: Dictionary, seed: int = -1) -> Dictionary:
	var s := seed if seed >= 0 else int(_rng.randi() & 0x7FFFFFFF)
	# group roll uses a scrambled seed (same as groupSeed() in the TS engine)
	var e := EasyBattleEngine.new(db, {"party": [], "enemies": [], "seed": (s * 0x9E3779B1) & 0xFFFFFFFF})
	var total := 0.0
	for g in t["groups"]:
		total += float(g["weight"])
	var r := e._rnd() * total
	var pick: Dictionary = t["groups"][t["groups"].size() - 1]
	for g in t["groups"]:
		r -= float(g["weight"])
		if r < 0.0:
			pick = g
			break
	var foes: Array = []
	for id in pick["enemies"]:
		foes.append({"id": id, "level": int(enemy(id)["level"]) + int(pick.get("levelBonus", 0))})
	return {"table": t["id"], "enemies": foes, "seed": s, "music": t.get("music", ""), "background": t.get("background", "")}


func scripted(table_id: String, seed: int = 1) -> Dictionary:
	for t in db["encounters"]:
		if t["id"] == table_id:
			return encounter_setup(t, seed)
	return {}


# ---------------------------------------------------------------- battles
func bag() -> Dictionary:
	var out := {}
	var items_node := get_node_or_null("/root/Items")
	for it in db.get("items", []):
		if items_node and items_node.has_method("count"):
			out[it["item"]] = int(items_node.count(it["item"]))
	return out


## Starts battle_scene.tscn on top of the current scene (or under `parent`). Emits battle_ended when done.
func start(setup: Dictionary, parent: Node = null, opts: Dictionary = {}) -> Node:
	var full := setup.duplicate(true)
	if not full.has("party"):
		full["party"] = party.duplicate(true)
	if not full.has("items"):
		var b := bag()
		full["items"] = b if b.size() else opts.get("items", {})
	var scene: Node = load(SCENE_PATH).instantiate()
	scene.setup = full
	scene.opts = opts
	scene.finished.connect(_on_finished.bind(full))
	(parent if parent else get_tree().root).add_child(scene)
	_scene = scene
	battle_started.emit(full)
	return scene


func _on_finished(result: String, rewards: Dictionary, used_items: Dictionary, setup: Dictionary) -> void:
	apply_rewards(result, rewards, used_items, setup)
	battle_ended.emit(result, rewards)


func apply_rewards(result: String, rewards: Dictionary, used_items: Dictionary, setup: Dictionary) -> void:
	party = rewards.get("party", party)
	coins += int(rewards.get("coins", 0))
	var items_node := get_node_or_null("/root/Items")
	if items_node:
		for id in used_items:
			if int(used_items[id]) > 0 and items_node.has_method("remove"):
				items_node.remove(id, int(used_items[id]))
		for d in rewards.get("drops", []):
			if items_node.has_method("add"):
				items_node.add(d["item"], int(d["n"]))
		var i := 0
		for table in rewards.get("loot", []):
			if items_node.has_method("loot"):
				items_node.loot(table, int(setup.get("seed", 1)) + i)
			i += 1
	party_changed.emit()


# ---------------------------------------------------------------- Easy Save
func to_dict() -> Dictionary:
	return {"format": "easybattle-save/1", "party": party.duplicate(true), "coins": coins}


func from_dict(d: Dictionary) -> void:
	if d.get("format", "") != "easybattle-save/1":
		return
	party = d.get("party", []).duplicate(true)
	for p in party:
		for k in ["level", "hp", "mp", "xp"]:
			p[k] = int(p.get(k, 0))
	coins = int(d.get("coins", 0))
	party_changed.emit()
