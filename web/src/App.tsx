import { useCallback, useEffect, useMemo, useState } from "react";
import { get, post, type Actor, type SimResult, type Summary } from "./api";

const TABS = ["party", "enemies", "skills", "encounters", "simulate", "documents", "check"] as const;
type Tab = (typeof TABS)[number];
const TAB_TH: Record<Tab, string> = { party: "ปาร์ตี้", enemies: "ศัตรู", skills: "สกิล", encounters: "ตารางเจอศัตรู", simulate: "จำลองการต่อสู้", documents: "ไฟล์", check: "ตรวจ" };

function describe(e: Record<string, unknown> & { t: string }, actors: Actor[]): string {
  const n = (i: unknown) => (typeof i === "number" && actors[i] ? actors[i]!.name.en : "?");
  switch (e.t) {
    case "round": return `— round ${e.round} —`;
    case "act": return `${n(e.actor)} uses ${e.skill} → ${(e.targets as number[]).map(n).join(", ")}`;
    case "item": return `${n(e.actor)} uses item ${e.item}`;
    case "damage": return `  ${n(e.target)} −${e.amount}${e.crit ? " CRIT" : ""}${e.weak ? " weak!" : ""}${e.resist ? " resist" : ""}${e.immune ? " immune" : ""}`;
    case "heal": return `  ${n(e.target)} +${e.amount} ${e.mp ? "MP" : "HP"}`;
    case "miss": return `  ${n(e.target)} dodges`;
    case "status": return `  ${n(e.target)} ${e.on ? "+" : "−"}${e.status}`;
    case "tick": return `  ${n(e.target)} ${e.status} ${e.amount}`;
    case "skip": return `${n(e.actor)} can't act (${e.status})`;
    case "defend": return `${n(e.actor)} defends`;
    case "down": return `  ${n(e.target)} is down`;
    case "flee": return `flee ${e.ok ? "ok" : "failed"} (${e.chance}%)`;
    case "end": return `== ${String(e.result).toUpperCase()} ==`;
    default: return e.t;
  }
}

export function App() {
  const [ws, setWs] = useState<Summary | null>(null);
  const [tab, setTab] = useState<Tab>("party");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<string>("");
  const [detail, setDetail] = useState<unknown>(null);
  const reload = useCallback(() => get<Summary>("/api/workspace").then(setWs).catch((e: Error) => setStatus(e.message)), []);
  useEffect(() => void reload(), [reload]);
  useEffect(() => {
    if (!sel || !ws) return;
    get<{ db: Record<string, Array<{ id: string }>> }>("/api/db").then((r) => {
      for (const k of ["heroes", "enemies", "skills", "encounters", "statuses"]) {
        const e = r.db[k]?.find((x) => x.id === sel);
        if (e) return setDetail(e);
      }
    });
  }, [sel, ws]);
  if (!ws) return <div className="panel">Loading… {status}</div>;
  return (
    <>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" />
          <div>
            <h1 className="brand">Easy <span>Battle</span></h1>
            <p className="brand-th">ระบบต่อสู้ผลัดตา · {ws.heroes.length} heroes · {ws.enemies.length} enemies · {ws.skills.length} skills · {ws.encounters.length} tables</p>
          </div>
        </div>
        <div className="status">{status || ws.root}</div>
      </header>
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "on" : ""} onClick={() => setTab(t)} data-tab={t}>{TAB_TH[t]} · {t}</button>
        ))}
      </nav>
      <div className="main">
        <section className="panel">
          {tab === "party" && (
            <div className="cards">
              {ws.heroes.map((h) => (
                <div key={h.id} className={`card ${sel === h.id ? "on" : ""}`} onClick={() => setSel(h.id)}>
                  <div className="sprite" style={{ backgroundImage: `url(/api/hero/${h.id}.png)`, backgroundPosition: "0 -48px" }} />
                  <b>{h.th}</b> <small>{h.en} · {h.role} · HP {h.hp}</small>
                  <div>{h.skills.map((s) => <span key={s} className="tag">{s}</span>)}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "enemies" && (
            <div className="cards">
              {ws.enemies.map((e) => (
                <div key={e.id} className={`card ${sel === e.id ? "on" : ""}`} onClick={() => setSel(e.id)}>
                  <div className="enemy-art" role="img" aria-label={e.en} style={{ width: (e.boss ? 80 : 48) * 2, height: (e.boss ? 64 : 48) * 2, backgroundImage: `url(/api/enemy/${e.id}.png)`, backgroundSize: `${(e.boss ? 80 : 48) * 6}px ${(e.boss ? 64 : 48) * 2}px` }} />
                  <b>{e.th}</b> <small>{e.en} · Lv{e.level} · HP {e.hp} · {e.xp}xp {e.coins}c</small>
                  <div>{e.boss && <span className="tag boss">boss</span>}{e.weak.map((w) => <span key={w} className="tag">weak {w}</span>)}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "skills" && (
            <table className="grid">
              <thead><tr><th>id</th><th>ชื่อ</th><th>kind</th><th>target</th><th>power</th><th>MP</th><th>element</th></tr></thead>
              <tbody>
                {ws.skills.map((s) => (
                  <tr key={s.id} onClick={() => setSel(s.id)} style={{ cursor: "pointer" }}>
                    <td className="mono">{s.id}</td><td>{s.th} <small>{s.en}</small></td><td>{s.kind}</td><td>{s.target}</td><td>{s.power}</td><td>{s.mp}</td>
                    <td style={{ color: ws.elements.find((e) => e.id === s.element)?.color }}>{s.element}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "encounters" && <Encounters ws={ws} onPick={setSel} />}
          {tab === "simulate" && <Simulate ws={ws} />}
          {tab === "documents" && <Documents ws={ws} onSaved={() => { reload(); setStatus("saved"); }} />}
          {tab === "check" && <Check />}
        </section>
        <aside className="panel">
          <h3>{sel || "detail"}</h3>
          {detail ? <pre className="log">{JSON.stringify(detail, null, 1)}</pre> : <p className="brand-th">Pick a hero, enemy, skill or table.</p>}
          <h3>XP curve</h3>
          <p className="mono" style={{ fontSize: "0.75rem" }}>next(L) = {ws.rules.xp.base} + {ws.rules.xp.step}(L−1) + {ws.rules.xp.quad}(L−1)²</p>
          <h3>Export</h3>
          <div className="row">
            {ws.exportPresets.map((p) => (
              <button key={p} onClick={() => post<{ dirs: string[]; files: number }>("/api/export", { preset: p }).then((r) => setStatus(`exported ${r.files} files → ${r.dirs.join(", ")}`)).catch((e: Error) => setStatus(e.message))}>{p}</button>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}

function Encounters({ ws, onPick }: { ws: Summary; onPick: (id: string) => void }) {
  const [region, setRegion] = useState("");
  const [culture, setCulture] = useState("thai");
  const [terrain, setTerrain] = useState("field");
  const [rolls, setRolls] = useState<Array<{ seed: number; table: string; enemies: Array<{ id: string; level: number }> }>>([]);
  const roll = () => post<{ rolls: typeof rolls }>("/api/encounter", { region: region || undefined, culture, terrain, seed: 1, times: 8 }).then((r) => setRolls(r.rolls));
  return (
    <>
      <table className="grid">
        <thead><tr><th>table</th><th>regions</th><th>cultures</th><th>terrains</th><th>rate</th><th>groups</th></tr></thead>
        <tbody>
          {ws.encounters.map((t) => (
            <tr key={t.id} onClick={() => onPick(t.id)} style={{ cursor: "pointer" }}>
              <td className="mono">{t.id}{t.scripted && <span className="tag boss">scripted</span>}</td><td>{t.regions.join(", ")}</td><td>{t.cultures.join(", ")}</td><td>{t.terrains.join(", ")}</td><td>{t.rate}</td><td>{t.groups}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3 style={{ marginTop: "1rem" }}>Roll</h3>
      <div className="row">
        <label>region <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="overworld region id" /></label>
        <label>culture <select value={culture} onChange={(e) => setCulture(e.target.value)}>{["thai", "malay", "chinese", "rural", "coastal", "any"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label>terrain <select value={terrain} onChange={(e) => setTerrain(e.target.value)}>{["field", "forest", "mountain", "river", "beach", "town", "cave", "any"].map((c) => <option key={c}>{c}</option>)}</select></label>
        <button className="primary" onClick={roll}>Roll ×8</button>
      </div>
      {rolls.map((r) => <div key={r.seed} className="mono" style={{ fontSize: "0.78rem" }}>seed {r.seed}: {r.table} → {r.enemies.map((e) => `${e.id} Lv${e.level}`).join(", ")}</div>)}
    </>
  );
}

function Simulate({ ws }: { ws: Summary }) {
  const [party, setParty] = useState(() => ws.heroes.slice(0, ws.rules.partySize).map((h) => ({ id: h.id, level: 5 })));
  const [enemies, setEnemies] = useState<string[]>(() => ws.enemies.filter((e) => !e.boss).slice(0, 3).map((e) => e.id));
  const [seed, setSeed] = useState(1);
  const [res, setRes] = useState<SimResult | null>(null);
  const [rate, setRate] = useState("");
  const setup = useMemo(() => ({ party, enemies: enemies.map((id) => ({ id })), seed, items: { balm: 2, teh_tarik: 1 } }), [party, enemies, seed]);
  return (
    <>
      <h3>Party</h3>
      {party.map((p, i) => (
        <div className="row" key={i}>
          <select value={p.id} onChange={(e) => setParty(party.map((q, k) => (k === i ? { ...q, id: e.target.value } : q)))}>{ws.heroes.map((h) => <option key={h.id} value={h.id}>{h.th} ({h.id})</option>)}</select>
          <label>Lv <input type="number" min={1} max={ws.rules.maxLevel} value={p.level} onChange={(e) => setParty(party.map((q, k) => (k === i ? { ...q, level: Number(e.target.value) } : q)))} /></label>
        </div>
      ))}
      <h3>Enemies</h3>
      <div className="row">
        {enemies.map((id, i) => <button key={i} onClick={() => setEnemies(enemies.filter((_, k) => k !== i))}>{id} ×</button>)}
        <select value="" onChange={(e) => e.target.value && enemies.length < 5 && setEnemies([...enemies, e.target.value])}><option value="">+ add</option>{ws.enemies.map((e) => <option key={e.id} value={e.id}>{e.th} ({e.id})</option>)}</select>
      </div>
      <div className="row">
        <label>seed <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} /></label>
        <button className="primary" onClick={() => post<SimResult>("/api/sim", { setup }).then(setRes)}>Auto battle</button>
        <button onClick={() => post<{ runs: number; wins: number; avgRounds: number }>("/api/sim", { setup, runs: 100 }).then((r) => setRate(`${r.wins}/${r.runs} wins · ${r.avgRounds.toFixed(1)} rounds avg`))}>Win rate ×100</button>
        <span className="ok">{rate}</span>
      </div>
      {res && (
        <>
          <h3>Result: <span className={res.result === "win" ? "ok" : "err"}>{res.result}</span> · {res.rewards.xp} XP · {res.rewards.coins} coins {res.rewards.drops.map((d) => `· ${d.item}×${d.n}`).join(" ")}</h3>
          <div className="cards">
            {res.actors.map((a, i) => (
              <div key={i} className="card"><b>{a.name.th}</b><small>{a.name.en} Lv{a.level} · {a.hp}/{a.max.hp}</small>
                <div className="bar"><i style={{ width: `${(100 * a.hp) / a.max.hp}%` }} /></div>
                <div className="bar mp"><i style={{ width: `${(100 * a.mp) / Math.max(1, a.max.mp)}%` }} /></div>
              </div>
            ))}
          </div>
          {res.rewards.levels.map((l) => <p key={l.id} className="ok">{l.id} Lv{l.from} → {l.to} {l.learned.join(", ")}</p>)}
          <div className="log">{res.log.filter((e) => e.t !== "turn").map((e) => describe(e, res.actors)).join("\n")}</div>
        </>
      )}
    </>
  );
}

function Documents({ ws, onSaved }: { ws: Summary; onSaved: () => void }) {
  const [id, setId] = useState(ws.docs[0] ?? "core");
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string[]>([]);
  useEffect(() => void get<{ doc: unknown }>(`/api/docs/${id}`).then((r) => setText(JSON.stringify(r.doc, null, 2))).catch(() => setText("")), [id]);
  const save = (dryRun: boolean) => {
    let doc: unknown;
    try { doc = JSON.parse(text); } catch (e) { return setMsg([`JSON: ${(e as Error).message}`]); }
    post<{ ok: boolean; errors: Array<{ path: string; message: string }>; warnings: Array<{ path: string; message: string }> }>(`/api/docs/${id}`, { doc, dryRun }).then((r) => {
      setMsg([...(r.errors.map((e) => `✗ ${e.path}: ${e.message}`)), ...r.warnings.map((w) => `! ${w.path}: ${w.message}`), r.errors.length ? "not saved" : dryRun ? "valid" : "saved"]);
      if (r.ok && !dryRun) onSaved();
    }).catch((e: Error) => setMsg([e.message]));
  };
  return (
    <>
      <div className="row">
        <select value={id} onChange={(e) => setId(e.target.value)}>{ws.docs.map((d) => <option key={d}>{d}</option>)}</select>
        <button onClick={() => save(true)}>Validate</button>
        <button className="primary" onClick={() => save(false)}>Save</button>
      </div>
      <textarea className="json" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      {msg.map((m, i) => <div key={i} className={m.startsWith("✗") ? "err" : m.startsWith("!") ? "warn" : "ok"}>{m}</div>)}
    </>
  );
}

function Check() {
  const [r, setR] = useState<{ errors: Array<{ path: string; message: string }>; warnings: Array<{ path: string; message: string }>; cross: Record<string, unknown> } | null>(null);
  useEffect(() => void get<NonNullable<typeof r>>("/api/check").then(setR), []);
  if (!r) return <p>checking…</p>;
  return (
    <>
      <h3 className={r.errors.length ? "err" : "ok"}>{r.errors.length} errors · {r.warnings.length} warnings</h3>
      {r.errors.map((e, i) => <p key={i} className="err">{e.path}: {e.message}</p>)}
      {r.warnings.map((e, i) => <p key={i} className="warn">{e.path}: {e.message}</p>)}
      <pre className="log">{JSON.stringify(r.cross, null, 1)}</pre>
    </>
  );
}
