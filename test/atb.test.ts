import { describe, expect, it } from "vitest";
import { ATB, Battle, PARITY_SETUP, type BattleSetup } from "../src/shared/engine.js";
import { loadDbStrict } from "../src/lib/workspace.js";
import { tempWorkspace } from "./helpers.js";

const db = await (async () => {
  const { root, cleanup } = await tempWorkspace();
  const d = await loadDbStrict(root);
  await cleanup();
  return d;
})();

const atb = (extra: Partial<BattleSetup> = {}): BattleSetup => ({ ...PARITY_SETUP, timing: "atb", ...extra });

/** Who acts, in order, over an auto battle. */
function turns(b: Battle, max = 60): number[] {
  const out: number[] = [];
  for (let n = 0; n < max && !b.over; n++) {
    const i = b.current();
    if (i < 0) break;
    out.push(i);
    b.act(b.auto(i), i);
  }
  return out;
}

describe("ATB (active time battle)", () => {
  it("turn mode stays the default and its log is unchanged", () => {
    const a = new Battle(db, PARITY_SETUP);
    const b = new Battle(db, { ...PARITY_SETUP, timing: "turn" });
    a.autoRun();
    b.autoRun();
    expect(a.timing).toBe("turn");
    expect(b.log).toEqual(a.log);
    expect(a.snapshot()).not.toHaveProperty("gauge");
  });

  it("gauges fill by speed: faster actors act more often, in proportion", () => {
    // everyone defends, so nobody falls and the counts measure speed alone
    const b = new Battle(db, atb({ seed: 5 }));
    const count = b.actors.map(() => 0);
    for (let k = 0; k < 3000; k++) {
      b.advance(1);
      for (let r = b.readyActor(); r >= 0; r = b.readyActor()) {
        count[r]! += 1;
        b.act({ kind: "defend" }, r);
      }
    }
    const gain = b.actors.map((_, i) => b.atbGain(i));
    expect(gain[0]).toBe(b.stat(b.actors[0]!, "spd") + ATB.base);
    const order = (xs: number[]) => xs.map((_, i) => i).sort((x, y) => xs[y]! - xs[x]! || x - y);
    const fast = order(gain)[0]!;
    const slow = order(gain).at(-1)!;
    expect(gain[fast]).toBeGreaterThan(gain[slow]!);
    expect(count[fast]).toBeGreaterThan(count[slow]!);
    for (let i = 0; i < gain.length; i++) expect(Math.abs(count[i]! - (3000 * gain[i]!) / ATB.full)).toBeLessThanOrEqual(2);
  });

  it("turns rotate by speed from the first fill", () => {
    const b = new Battle(db, atb({ seed: 5 }));
    const t = turns(b, 12);
    expect(new Set(t).size).toBeGreaterThan(2);
  });

  it("orders a simultaneous fill by overflow, then speed", () => {
    const b = new Battle(db, atb({ seed: 11 }));
    b.gauge = b.gauge.map(() => ATB.full - 1);
    b.advance(1);
    const r = b.ready();
    expect(r.length).toBe(b.actors.length);
    const gains = r.map((i) => b.atbGain(i));
    expect([...gains].sort((x, y) => y - x)).toEqual(gains);
  });

  it("is deterministic with a seed (same steps → same log, gauges, rewards)", () => {
    const run = () => {
      const b = new Battle(db, atb({ seed: 77 }));
      for (let k = 0; k < 400 && !b.over; k++) {
        b.advance(3, k % 5 === 0);
        let r = b.readyActor();
        while (r >= 0 && !b.over) {
          b.act(b.auto(r), r);
          r = b.readyActor();
        }
      }
      return { log: b.log, snap: b.snapshot(), rew: b.rewards() };
    };
    const a = run();
    expect(a.snap.over).not.toBe("");
    expect(run()).toEqual(a);
    expect(new Battle(db, atb({ seed: 78 })).gauge).not.toEqual(new Battle(db, atb({ seed: 77 })).gauge);
  });

  it("start gauges do not shift the action rolls", () => {
    const b = new Battle(db, atb());
    expect(b.gauge.every((g) => g >= 0 && g < ATB.start)).toBe(true);
    expect(b.rnd()).toBe(new Battle(db, PARITY_SETUP).rnd());
  });

  it("wait mode: time stops while a command menu is open; active mode keeps running", () => {
    const w = new Battle(db, atb({ atbMode: "wait" }));
    const g0 = [...w.gauge];
    expect(w.advance(20, true)).toBe(0);
    expect(w.gauge).toEqual(g0);
    expect(w.steps).toBe(0);
    expect(w.advance(20, false)).toBe(20);
    expect(w.gauge).not.toEqual(g0);

    const a = new Battle(db, atb({ atbMode: "active" }));
    expect(a.advance(20, true)).toBe(20);
    expect(a.steps).toBe(20);
  });

  it("acting empties the gauge; readyActor never lets time run", () => {
    const b = new Battle(db, atb({ seed: 3 }));
    expect(b.readyActor()).toBe(-1);
    expect(b.steps).toBe(0);
    while (b.ready().length === 0) b.advance(1);
    const i = b.readyActor();
    expect(b.gauge[i]).toBe(ATB.full);
    b.act({ kind: "defend" }, i);
    expect(b.gauge[i]).toBe(0);
    expect(b.ready()).not.toContain(i);
    // acting for someone who is not ready does nothing
    const notReady = b.actors.findIndex((_, k) => !b.ready().includes(k));
    expect(b.act({ kind: "defend" }, notReady)).toEqual([]);
  });

  it("rounds tick every ATB.roundSteps steps", () => {
    const b = new Battle(db, atb({ seed: 9 }));
    expect(b.round).toBe(1);
    for (let k = 0; k < ATB.roundSteps * 2; k++) {
      b.advance(1);
      for (let r = b.readyActor(); r >= 0 && !b.over; r = b.readyActor()) b.act({ kind: "defend" }, r);
    }
    expect(b.round).toBe(3);
  });
});
