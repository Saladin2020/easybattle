class_name EasyBattleEngine
extends RefCounted
## Deterministic battle engine: a line-for-line port of src/shared/engine.ts (parity-tested by test_battle.gd).
## Same seed + same actions = same log, damage and rewards as the TypeScript engine and the PixiJS runtime.

var db: Dictionary
var actors: Array = []
var round_no := 0
var queue: Array = []
var log: Array = []
var over := ""
var items: Dictionary = {}
var no_flee := false
var _rng_a := 0
## timing: "turn" (default) or "atb" (active time battle); atb_mode: "wait" or "active". See engine.ts.
var timing := "turn"
var atb_mode := "wait"
var gauge: Array = []
var steps := 0
const ATB := {"full": 1000, "base": 10, "start": 300, "roundSteps": 60, "stepsPerSecond": 30, "salt": 0x5eed0a7b}
var _skills: Dictionary = {}
var _statuses: Dictionary = {}
var _enemies: Dictionary = {}
var _heroes: Dictionary = {}

const ATTACK := {"id": "attack", "name": {"th": "โจมตี", "en": "Attack", "ms": "Serang"}, "kind": "physical", "target": "enemy", "power": 10, "mp": 0, "fx": "hit_sparks", "sfx": "hit"}


func _init(database: Dictionary, setup: Dictionary) -> void:
	db = database
	for s in db.get("skills", []):
		_skills[s["id"]] = s
	for s in db.get("statuses", []):
		_statuses[s["id"]] = s
	for e in db.get("enemies", []):
		_enemies[e["id"]] = e
	for h in db.get("heroes", []):
		_heroes[h["id"]] = h
	_rng_a = int(setup["seed"]) & 0xFFFFFFFF
	for k in setup.get("items", {}):
		items[k] = int(setup["items"][k])
	no_flee = bool(setup.get("noFlee", false))
	timing = "atb" if setup.get("timing", "turn") == "atb" else "turn"
	atb_mode = "active" if setup.get("atbMode", "wait") == "active" else "wait"
	var i := 0
	for p in setup["party"]:
		var h: Dictionary = _heroes[p["id"]]
		var lv := int(p["level"])
		var tr: Array = p.get("tree", [])
		var mx := tree_stats(h, lv, tr)
		var hp := mini(int(mx["hp"]), int(p.get("hp", mx["hp"])))
		var mp := mini(int(mx["mp"]), int(p.get("mp", mx["mp"])))
		var actor := {"side": 0, "index": i, "id": h["id"], "name": h["name"], "level": lv, "hp": hp, "mp": mp, "max": mx, "statuses": [], "defending": false, "skills": tree_skills(h, lv, tr), "weak": h.get("weak", []), "resist": h.get("resist", []), "immune": [], "xp": int(p.get("xp", 0))}
		if p.has("tree"):
			actor["tree"] = tr.duplicate()
		actors.append(actor)
		i += 1
	i = 0
	for x in setup["enemies"]:
		var e: Dictionary = _enemies[x["id"]]
		var lv := int(x.get("level", e["level"]))
		var mx := enemy_stats(e, lv)
		var sk: Array = []
		for s in e["skills"]:
			sk.append(s["skill"])
		actors.append({"side": 1, "index": i, "id": e["id"], "name": e["name"], "level": lv, "hp": int(mx["hp"]), "mp": int(mx["mp"]), "max": mx, "statuses": [], "defending": false, "skills": sk, "weak": e.get("weak", []), "resist": e.get("resist", []), "immune": e.get("immune", []), "xp": 0})
		if e.get("boss", false):
			no_flee = true
		i += 1
	if timing == "atb":
		# start gauges from a second stream so the action rolls keep their order
		var keep := _rng_a
		_rng_a = (int(setup["seed"]) ^ int(ATB["salt"])) & 0xFFFFFFFF
		for _a in actors:
			gauge.append(int(floor(_rnd() * ATB["start"])))
		_rng_a = keep
		round_no = 1
		log.append({"t": "round", "round": 1})
	else:
		_new_round()


## ATB: gauge gain per time step.
func atb_gain(i: int) -> int:
	return stat(actors[i], "spd") + int(ATB["base"])


func _step() -> void:
	steps += 1
	if steps % int(ATB["roundSteps"]) == 0:
		round_no += 1
		log.append({"t": "round", "round": round_no})
	var filled: Array = []
	for i in actors.size():
		if int(actors[i]["hp"]) <= 0:
			gauge[i] = 0
			continue
		if queue.has(i):
			continue
		gauge[i] = int(gauge[i]) + atb_gain(i)
		if int(gauge[i]) >= int(ATB["full"]):
			filled.append([i, int(gauge[i]) - int(ATB["full"])])
			gauge[i] = int(ATB["full"])
	filled.sort_custom(func(x, y):
		if x[1] != y[1]:
			return int(x[1]) > int(y[1])
		var a: Dictionary = actors[x[0]]
		var b: Dictionary = actors[y[0]]
		var sa := stat(a, "spd")
		var sb := stat(b, "spd")
		if sa != sb:
			return sa > sb
		if a["side"] != b["side"]:
			return int(a["side"]) < int(b["side"])
		return int(a["index"]) < int(b["index"]))
	for f in filled:
		queue.append(f[0])


## ATB: let time run n steps; 0 when over, in turn mode, or in "wait" mode with a menu open.
func advance(n: int, menu_open: bool = false) -> int:
	if timing != "atb" or over != "" or (menu_open and atb_mode == "wait"):
		return 0
	for _k in n:
		_step()
	return n


## ATB: actors with a full gauge, in the order they act.
func ready() -> Array:
	var r: Array = []
	for i in queue:
		if int(actors[i]["hp"]) > 0:
			r.append(i)
	return r


## ATB: the actor to act now without letting time run (-1 when nobody is ready).
func ready_actor(who: int = -1) -> int:
	return _atb_next(who, false)


func _atb_next(who: int, run: bool) -> int:
	var guard := 0
	while over == "":
		queue = ready()
		if who >= 0 and not queue.has(who):
			return -1
		if queue.is_empty():
			if not run or guard > 100000:
				return -1
			guard += 1
			_step()
			continue
		var i: int = who if who >= 0 else queue[0]
		if _start_turn(i):
			return i
		if who >= 0:
			return -1
	return -1


func _start_turn(i: int) -> bool:
	var a: Dictionary = actors[i]
	a["defending"] = false
	for s in a["statuses"]:
		var k: String = status(s["id"])["kind"]
		if k == "sleep" or k == "stun":
			log.append({"t": "skip", "actor": i, "status": s["id"]})
			_end_turn(i)
			return false
	return true


# ---------------------------------------------------------------- rng (mulberry32, same as easyitems.gd)
func _rnd() -> float:
	_rng_a = (_rng_a + 0x6D2B79F5) & 0xFFFFFFFF
	var t := _rng_a
	t = _imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF
	return float((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0


func _imul(a: int, b: int) -> int:
	var ah := (a >> 16) & 0xFFFF
	var al := a & 0xFFFF
	var bh := (b >> 16) & 0xFFFF
	var bl := b & 0xFFFF
	return (al * bl + (((ah * bl + al * bh) & 0xFFFF) << 16)) & 0xFFFFFFFF


static func _fl(a: int, b: int) -> int:
	return int(floor(float(a) / float(b)))


# ---------------------------------------------------------------- stats
static func xp_to_next(database: Dictionary, level: int) -> int:
	var c: Dictionary = database["rules"]["xp"]
	var l := level - 1
	return int(c["base"]) + int(c["step"]) * l + int(c["quad"]) * l * l


static func hero_stats(h: Dictionary, level: int) -> Dictionary:
	var out := {}
	for k in h["base"]:
		out[k] = int(floor(float(h["base"][k]) + float(h["growth"].get(k, 0)) * float(level - 1)))
	return out


func enemy_stats(e: Dictionary, level: int) -> Dictionary:
	var out := {}
	var pct := 100 + int(db["rules"]["enemyScale"]) * (level - int(e["level"]))
	for k in e["stats"]:
		out[k] = maxi(1 if k == "hp" else 0, _fl(int(e["stats"][k]) * pct, 100))
	return out


static func hero_skills(h: Dictionary, level: int) -> Array:
	var out: Array = []
	for l in h["skills"]:
		if int(l["level"]) <= level:
			out.append(l["skill"])
	return out


# ---- skill trees (same rules as the TypeScript engine) ----
static func skill_points(database: Dictionary, level: int) -> int:
	return maxi(0, level - 1) * int(database["rules"].get("pointsPerLevel", 1))


static func tree_spent(h: Dictionary, unlocked: Array) -> int:
	var n := 0
	for node in h.get("tree", []):
		if unlocked.has(node["id"]):
			n += int(node.get("cost", 1))
	return n


## "ok" or why not: unknown_node · unlocked · level:N · requires:<id> · points
static func tree_check(database: Dictionary, h: Dictionary, level: int, unlocked: Array, node_id: String) -> String:
	var node = null
	for x in h.get("tree", []):
		if x["id"] == node_id:
			node = x
	if node == null:
		return "unknown_node"
	if unlocked.has(node_id):
		return "unlocked"
	if level < int(node.get("level", 1)):
		return "level:%d" % int(node["level"])
	for r in node.get("requires", []):
		if not unlocked.has(r):
			return "requires:%s" % r
	if skill_points(database, level) - tree_spent(h, unlocked) < int(node.get("cost", 1)):
		return "points"
	return "ok"


static func tree_unlock(database: Dictionary, h: Dictionary, level: int, unlocked: Array, node_id: String) -> Dictionary:
	var result := tree_check(database, h, level, unlocked, node_id)
	var out := unlocked.duplicate()
	if result == "ok":
		out.append(node_id)
	return {"result": result, "tree": out}


static func tree_stats(h: Dictionary, level: int, unlocked: Array = []) -> Dictionary:
	var out := hero_stats(h, level)
	for node in h.get("tree", []):
		if unlocked.has(node["id"]) and node.has("stats"):
			for k in node["stats"]:
				out[k] = int(out.get(k, 0)) + int(node["stats"][k])
	return out


static func tree_skills(h: Dictionary, level: int, unlocked: Array = []) -> Array:
	var out := hero_skills(h, level)
	for node in h.get("tree", []):
		if node.has("skill") and unlocked.has(node["id"]) and not out.has(node["skill"]):
			out.append(node["skill"])
	return out


func skill(id: String) -> Dictionary:
	if id == "attack":
		return _skills.get("attack", ATTACK)
	return _skills[id]


func status(id: String) -> Dictionary:
	return _statuses[id]


func alive(side: int) -> Array:
	var out: Array = []
	for i in actors.size():
		if int(actors[i]["side"]) == side and int(actors[i]["hp"]) > 0:
			out.append(i)
	return out


func stat(a: Dictionary, k: String) -> int:
	var v := int(a["max"][k])
	for s in a["statuses"]:
		var d := status(s["id"])
		if d["kind"] == k and k != "res":
			v = _fl(v * int(d.get("amount", 100)), 100)
	return v


func _new_round() -> void:
	round_no += 1
	log.append({"t": "round", "round": round_no})
	var order: Array = []
	for i in actors.size():
		if int(actors[i]["hp"]) > 0:
			order.append(i)
	order.sort_custom(func(x, y):
		var a: Dictionary = actors[x]
		var b: Dictionary = actors[y]
		var sa := stat(a, "spd")
		var sb := stat(b, "spd")
		if sa != sb:
			return sa > sb
		if a["side"] != b["side"]:
			return int(a["side"]) < int(b["side"])
		return int(a["index"]) < int(b["index"]))
	queue = order


func current() -> int:
	if timing == "atb":
		return _atb_next(-1, true)
	while over == "":
		while queue.size() and int(actors[queue[0]]["hp"]) <= 0:
			queue.pop_front()
		if queue.is_empty():
			_new_round()
			continue
		var i: int = queue[0]
		if not _start_turn(i):
			continue
		return i
	return -1


func act(action: Dictionary, who: int = -1) -> Array:
	var start := log.size()
	var i := _atb_next(who, false) if timing == "atb" and who >= 0 else current()
	if i < 0:
		return []
	var a: Dictionary = actors[i]
	log.append({"t": "turn", "actor": i})
	var kind: String = action.get("kind", "attack")
	var target = action.get("target", null)
	if kind == "defend":
		a["defending"] = true
		log.append({"t": "defend", "actor": i})
	elif kind == "flee":
		_flee(i)
	elif kind == "item":
		_use_item(i, action.get("item", ""), target)
	else:
		var sk := skill("attack" if kind == "attack" else action.get("skill", "attack"))
		var cost := int(sk.get("mp", 0))
		if cost > int(a["mp"]):
			log.append({"t": "nomp", "actor": i, "skill": sk["id"]})
		else:
			a["mp"] = int(a["mp"]) - cost
			_use_skill(i, sk, target)
	if over == "":
		_end_turn(i)
	_check_end()
	return log.slice(start)


func _targets_for(i: int, target_kind: String, target) -> Array:
	var a: Dictionary = actors[i]
	var foes := alive(1 if int(a["side"]) == 0 else 0)
	var friends := alive(int(a["side"]))
	match target_kind:
		"self":
			return [i]
		"all_enemies":
			return foes
		"all_allies":
			return friends
		"ally":
			if target != null and friends.has(int(target)):
				return [int(target)]
			return friends.slice(0, 1)
		_:
			if target != null and foes.has(int(target)):
				return [int(target)]
			return foes.slice(0, 1)


func _use_skill(i: int, sk: Dictionary, target) -> void:
	var a: Dictionary = actors[i]
	var targets := _targets_for(i, sk["target"], target)
	var ev := {"t": "act", "actor": i, "skill": sk["id"], "targets": targets}
	if sk.has("fx"):
		ev["fx"] = sk["fx"]
	if sk.has("sfx"):
		ev["sfx"] = sk["sfx"]
	log.append(ev)
	for ti in targets:
		var t: Dictionary = actors[ti]
		var kind: String = sk["kind"]
		if kind == "physical" or kind == "magic":
			if int(t["hp"]) <= 0:
				continue
			var acc := float(sk.get("accuracy", 95))
			if _rnd() * 100.0 >= acc:
				log.append({"t": "miss", "actor": i, "target": ti})
				continue
			var crit := false
			if kind == "physical":
				crit = _rnd() * 100.0 < float(db["rules"]["crit"])
			var variance := 90 + int(floor(_rnd() * 21.0))
			var power := int(sk.get("power", 10))
			var raw := 0
			if kind == "physical":
				raw = _fl(stat(a, "atk") * power, 10) - _fl(stat(t, "def"), 2)
			else:
				raw = _fl(stat(a, "mag") * power, 10) - _fl(int(t["max"]["res"]), 2)
			if raw < 1:
				raw = 1
			raw = _fl(raw * variance, 100)
			if crit:
				raw = _fl(raw * 3, 2)
			var el: String = sk.get("element", "none")
			var immune: bool = el != "none" and t["immune"].has(el)
			var weak: bool = el != "none" and t["weak"].has(el)
			var resist: bool = el != "none" and t["resist"].has(el)
			if weak:
				raw = _fl(raw * 3, 2)
			if resist:
				raw = _fl(raw, 2)
			if t["defending"]:
				raw = _fl(raw, 2)
			if raw < 1:
				raw = 1
			if immune:
				raw = 0
			t["hp"] = maxi(0, int(t["hp"]) - raw)
			log.append({"t": "damage", "target": ti, "amount": raw, "crit": crit, "weak": weak, "resist": resist, "immune": immune})
			if raw > 0:
				_wake(ti)
			if int(t["hp"]) <= 0:
				t["statuses"] = []
				log.append({"t": "down", "target": ti})
				continue
			if sk.has("status"):
				_try_status(ti, sk["status"]["id"], int(sk["status"].get("chance", 100)))
		elif kind == "heal":
			if int(t["hp"]) <= 0:
				continue
			var amount := mini(int(t["max"]["hp"]) - int(t["hp"]), _fl(stat(a, "mag") * int(sk.get("power", 10)), 10))
			t["hp"] = int(t["hp"]) + amount
			log.append({"t": "heal", "target": ti, "amount": amount, "mp": false})
			if sk.has("status"):
				_try_status(ti, sk["status"]["id"], int(sk["status"].get("chance", 100)))
		elif kind == "cure":
			_cure(ti, sk.get("cures", []))
		elif sk.has("status"):
			if int(t["hp"]) > 0:
				_try_status(ti, sk["status"]["id"], int(sk["status"].get("chance", 100)))


func _try_status(ti: int, id: String, chance: int) -> void:
	if chance < 100 and _rnd() * 100.0 >= float(chance):
		return
	var t: Dictionary = actors[ti]
	var d := status(id)
	var found := false
	for s in t["statuses"]:
		if s["id"] == id:
			s["turns"] = int(d["turns"])
			found = true
	if not found:
		t["statuses"].append({"id": id, "turns": int(d["turns"])})
	log.append({"t": "status", "target": ti, "status": id, "on": true})


func _negative(id: String) -> bool:
	var d := status(id)
	var k: String = d["kind"]
	if k == "poison" or k == "sleep" or k == "stun":
		return true
	if k == "regen":
		return false
	return int(d.get("amount", 100)) < 100


func _cure(ti: int, ids: Array) -> void:
	var t: Dictionary = actors[ti]
	var keep: Array = []
	for s in t["statuses"]:
		var hit := ids.has(s["id"]) if ids.size() else _negative(s["id"])
		if hit:
			log.append({"t": "status", "target": ti, "status": s["id"], "on": false})
		else:
			keep.append(s)
	t["statuses"] = keep


func _wake(ti: int) -> void:
	var t: Dictionary = actors[ti]
	var keep: Array = []
	for s in t["statuses"]:
		if status(s["id"])["kind"] == "sleep":
			log.append({"t": "status", "target": ti, "status": s["id"], "on": false})
		else:
			keep.append(s)
	t["statuses"] = keep


func _use_item(i: int, item: String, target) -> void:
	var def = null
	for x in db.get("items", []):
		if x["item"] == item:
			def = x
			break
	if def == null or int(items.get(item, 0)) < 1:
		log.append({"t": "nomp", "actor": i, "skill": "item:" + item})
		return
	items[item] = int(items.get(item, 0)) - 1
	var targets := _targets_for(i, def.get("target", "ally"), target)
	log.append({"t": "item", "actor": i, "item": item, "targets": targets})
	for ti in targets:
		var t: Dictionary = actors[ti]
		if int(def.get("hp", 0)):
			var amount := mini(int(t["max"]["hp"]) - int(t["hp"]), int(def["hp"]))
			t["hp"] = int(t["hp"]) + amount
			log.append({"t": "heal", "target": ti, "amount": amount, "mp": false})
		if int(def.get("mp", 0)):
			var amount2 := mini(int(t["max"]["mp"]) - int(t["mp"]), int(def["mp"]))
			t["mp"] = int(t["mp"]) + amount2
			log.append({"t": "heal", "target": ti, "amount": amount2, "mp": true})
		if def.has("cures"):
			_cure(ti, def["cures"])


func _avg_spd(side: int) -> int:
	var xs := alive(side)
	var s := 0
	for x in xs:
		s += stat(actors[x], "spd")
	return _fl(s, xs.size()) if xs.size() else 0


func _flee(i: int) -> void:
	var chance := int(db["rules"]["flee"]) + 2 * (_avg_spd(0) - _avg_spd(1))
	chance = maxi(10, mini(95, chance))
	if no_flee or int(actors[i]["side"]) != 0:
		chance = 0
	var ok := chance > 0 and _rnd() * 100.0 < float(chance)
	log.append({"t": "flee", "ok": ok, "chance": chance})
	if ok:
		over = "fled"
		log.append({"t": "end", "result": "fled"})


func _end_turn(i: int) -> void:
	if timing == "atb":
		queue.erase(i)
		gauge[i] = 0
	elif queue.size() and queue[0] == i:
		queue.pop_front()
	var a: Dictionary = actors[i]
	if int(a["hp"]) <= 0:
		return
	var keep: Array = []
	for s in a["statuses"]:
		var d := status(s["id"])
		if d["kind"] == "poison" or d["kind"] == "regen":
			var amt := maxi(1, _fl(int(a["max"]["hp"]) * int(d.get("amount", 5)), 100))
			if d["kind"] == "poison":
				var dmg := mini(int(a["hp"]), amt)
				a["hp"] = int(a["hp"]) - dmg
				log.append({"t": "tick", "target": i, "status": s["id"], "amount": -dmg})
			else:
				var heal := mini(int(a["max"]["hp"]) - int(a["hp"]), amt)
				a["hp"] = int(a["hp"]) + heal
				log.append({"t": "tick", "target": i, "status": s["id"], "amount": heal})
		s["turns"] = int(s["turns"]) - 1
		if int(s["turns"]) > 0:
			keep.append(s)
		else:
			log.append({"t": "status", "target": i, "status": s["id"], "on": false})
	a["statuses"] = keep if int(a["hp"]) > 0 else []
	if int(a["hp"]) <= 0:
		log.append({"t": "down", "target": i})
	_check_end()


func _check_end() -> void:
	if over != "":
		return
	if alive(1).is_empty():
		over = "win"
		log.append({"t": "end", "result": "win"})
	elif alive(0).is_empty():
		over = "lose"
		log.append({"t": "end", "result": "lose"})


func auto(who: int = -1) -> Dictionary:
	var i := _atb_next(who, false) if timing == "atb" and who >= 0 else current()
	if i < 0:
		return {"kind": "defend"}
	var a: Dictionary = actors[i]
	if int(a["side"]) == 1:
		var e: Dictionary = _enemies[a["id"]]
		var usable: Array = []
		for s in e["skills"]:
			if int(skill(s["skill"]).get("mp", 0)) <= int(a["mp"]):
				usable.append(s)
		var total := 0.0
		for s in usable:
			total += float(s["weight"])
		var r := _rnd() * total
		var pick: String = usable[usable.size() - 1]["skill"] if usable.size() else "attack"
		for s in usable:
			r -= float(s["weight"])
			if r < 0.0:
				pick = s["skill"]
				break
		var sk := skill(pick)
		var pool := alive(1) if sk["target"] == "ally" else alive(0)
		var tgt = pool[int(floor(_rnd() * float(pool.size())))] if pool.size() else null
		return {"kind": "skill", "skill": pick, "target": tgt}
	var friends := alive(0)
	var low := -1
	for f in friends:
		var x: Dictionary = actors[f]
		if int(x["hp"]) * 100 < int(x["max"]["hp"]) * 40 and (low < 0 or int(x["hp"]) * int(actors[low]["max"]["hp"]) < int(actors[low]["hp"]) * int(x["max"]["hp"])):
			low = f
	if low >= 0:
		for s in a["skills"]:
			var sk := skill(s)
			if sk["kind"] == "heal" and int(sk.get("mp", 0)) <= int(a["mp"]):
				return {"kind": "skill", "skill": sk["id"], "target": low}
		for it in db.get("items", []):
			if int(it.get("hp", 0)) and int(items.get(it["item"], 0)) > 0:
				return {"kind": "item", "item": it["item"], "target": low}
	var foes := alive(1)
	var tg: int = foes[0]
	for f in foes:
		if int(actors[f]["hp"]) < int(actors[tg]["hp"]):
			tg = f
	var best := "attack"
	var best_score := 10
	for s in a["skills"]:
		var sk := skill(s)
		if (sk["kind"] != "physical" and sk["kind"] != "magic") or int(sk.get("mp", 0)) > int(a["mp"]):
			continue
		var t: Dictionary = actors[tg]
		var score := int(sk.get("power", 10)) * (stat(a, "mag") if sk["kind"] == "magic" else stat(a, "atk"))
		score = _fl(score, maxi(1, int(a["max"]["mag"]) if sk["kind"] == "magic" else int(a["max"]["atk"])))
		if sk.has("element") and t["weak"].has(sk["element"]):
			score = _fl(score * 3, 2)
		if sk["target"] == "all_enemies" and foes.size() > 1:
			score = score * 2
		if score > best_score:
			best_score = score
			best = s
	if best == "attack":
		return {"kind": "attack", "target": tg}
	return {"kind": "skill", "skill": best, "target": tg}


func auto_run(max_turns: int = 400) -> Array:
	var start := log.size()
	var n := 0
	while n < max_turns and over == "":
		act(auto())
		n += 1
	return log.slice(start)


func rewards() -> Dictionary:
	var r := {"xp": 0, "coins": 0, "drops": [], "loot": [], "levels": [], "party": []}
	if over == "win":
		for a in actors:
			if int(a["side"]) != 1:
				continue
			var e: Dictionary = _enemies[a["id"]]
			var pct := 100 + 10 * (int(a["level"]) - int(e["level"]))
			r["xp"] += _fl(int(e["xp"]) * pct, 100)
			r["coins"] += _fl(int(e["coins"]) * pct, 100)
			for d in e.get("drops", []):
				if _rnd() * 100.0 < float(d["chance"]):
					var found := false
					for x in r["drops"]:
						if x["item"] == d["item"]:
							x["n"] += int(d.get("n", 1))
							found = true
					if not found:
						r["drops"].append({"item": d["item"], "n": int(d.get("n", 1))})
			if e.has("loot"):
				r["loot"].append(e["loot"])
	for a in actors:
		if int(a["side"]) != 0:
			continue
		var h: Dictionary = _heroes[a["id"]]
		var level := int(a["level"])
		var xp := int(a["xp"]) + (int(r["xp"]) if int(a["hp"]) > 0 else 0)
		var learned: Array = []
		while level < int(db["rules"]["maxLevel"]) and xp >= xp_to_next(db, level):
			xp -= xp_to_next(db, level)
			level += 1
			for l in h["skills"]:
				if int(l["level"]) == level:
					learned.append(l["skill"])
		if level != int(a["level"]):
			r["levels"].append({"id": a["id"], "from": int(a["level"]), "to": level, "learned": learned})
		var mx := tree_stats(h, level, a.get("tree", []))
		var hp := int(a["hp"])
		if level != int(a["level"]) and int(a["hp"]) > 0:
			hp = mini(int(mx["hp"]), int(a["hp"]) + (int(mx["hp"]) - int(a["max"]["hp"])))
		var pm := {"id": a["id"], "level": level, "hp": maxi(1 if over == "lose" else 0, hp), "mp": int(a["mp"]), "xp": xp}
		if a.has("tree"):
			pm["tree"] = a["tree"].duplicate()
		r["party"].append(pm)
	return r


func snapshot() -> Dictionary:
	var acts: Array = []
	for a in actors:
		var st: Array = []
		for s in a["statuses"]:
			st.append("%s:%d" % [s["id"], int(s["turns"])])
		acts.append({"id": a["id"], "hp": int(a["hp"]), "mp": int(a["mp"]), "st": ",".join(st)})
	var snap := {"round": round_no, "over": over, "actors": acts, "items": items, "log": log.size()}
	if timing == "atb":
		var g: Array = []
		for x in gauge:
			g.append(str(int(x)))
		snap["steps"] = steps
		snap["gauge"] = ",".join(g)
	return snap
