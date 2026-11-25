// P1 (v0.9.5 work): the authoritative clock. The game simulates in fixed ticks of 1/30 s; rendering runs
// at whatever rate the display gives and interpolates between ticks. Gameplay that used to wait on
// setTimeout (wall clock) is put on a due-tick queue instead, so it happens on the same tick however
// fast or slow the frames are, and stops when the game is paused.
// Pure TypeScript, no DOM: tested headlessly in tests/sim.test.ts.

export const TICK_HZ = 30;
export const TICK_S = 1 / TICK_HZ;
/** Most ticks one rendered frame may run. A longer frame (a hitch, a background tab) slows the game
 *  down instead of jumping it forward. 4 ticks = 133 ms, close to the old 100 ms dt clamp. */
export const MAX_CATCHUP_TICKS = 4;

/** Ticks for a delay in milliseconds, rounded up so nothing happens early. Never less than one tick:
 *  150 ms -> 5 ticks (167 ms), 1600 ms -> 48 ticks. */
export function ticksFor(ms: number): number {
  return Math.max(1, Math.ceil(ms * TICK_HZ / 1000 - 1e-9));
}

export interface QueuedTask { due: number; seq: number; kind: string; data?: unknown }
interface Entry extends QueuedTask { fn?: () => void }
/** What a save keeps of the queue: delays relative to the save tick, so it can be restored at any tick. */
export interface SavedQueue { v: 1; tasks: { in: number; seq: number; kind: string; data?: unknown }[]; dropped: string[] }

/**
 * Tasks due at a tick, run in (due, seq) order. Two kinds:
 *  - named tasks (`at`): a registered kind plus JSON data; they survive a save and a load;
 *  - closures (`closure`): code captured in place (a fade's continuation); they run the same way but
 *    cannot be written to a save. A save lists them in `dropped`.
 */
export class TickQueue {
  private items: Entry[] = [];
  private seq = 0;
  private handlers = new Map<string, (data: any) => void>();

  on(kind: string, fn: (data: any) => void): void { this.handlers.set(kind, fn); }

  at(tick: number, delayTicks: number, kind: string, data?: unknown): number {
    if (!this.handlers.has(kind)) throw new Error(`TickQueue: no handler for '${kind}'`);
    return this.push({ due: tick + Math.max(1, Math.floor(delayTicks)), seq: this.seq++, kind, data });
  }
  closure(tick: number, delayTicks: number, label: string, fn: () => void): number {
    return this.push({ due: tick + Math.max(1, Math.floor(delayTicks)), seq: this.seq++, kind: 'closure:' + label, fn });
  }
  private push(e: Entry): number {
    let i = this.items.length;
    while (i > 0 && (this.items[i - 1].due > e.due || (this.items[i - 1].due === e.due && this.items[i - 1].seq > e.seq))) i--;
    this.items.splice(i, 0, e);
    return e.seq;
  }

  /** Run everything due at or before `tick`. Returns the kinds that ran, in order (the decision log). */
  run(tick: number): string[] {
    const ran: string[] = [];
    while (this.items.length && this.items[0].due <= tick) {
      const e = this.items.shift()!;
      ran.push(e.kind);
      if (e.fn) e.fn(); else this.handlers.get(e.kind)!(e.data);
    }
    return ran;
  }

  cancel(kind: string): number { const n = this.items.length; this.items = this.items.filter(e => e.kind !== kind); return n - this.items.length; }
  clear(): void { this.items = []; }
  get size(): number { return this.items.length; }
  /** Order-stable description of what is pending, for state hashing and tests. */
  describe(): QueuedTask[] { return this.items.map(({ due, seq, kind, data }) => ({ due, seq, kind, data })); }

  save(tick: number): SavedQueue {
    const tasks: SavedQueue['tasks'] = [], dropped: string[] = [];
    for (const e of this.items) { if (e.fn) dropped.push(e.kind); else tasks.push({ in: e.due - tick, seq: e.seq, kind: e.kind, data: e.data }); }
    return { v: 1, tasks, dropped };
  }
  /** Replaces the queue with a saved one. Unknown kinds and malformed entries are skipped, not thrown. */
  load(tick: number, saved: SavedQueue | undefined | null): number {
    this.items = [];
    if (!saved || saved.v !== 1 || !Array.isArray(saved.tasks)) return 0;
    let n = 0;
    for (const t of saved.tasks) {
      if (!t || typeof t.kind !== 'string' || !this.handlers.has(t.kind) || !Number.isFinite(t.in)) continue;
      this.push({ due: tick + Math.max(1, Math.floor(t.in)), seq: this.seq++, kind: t.kind, data: t.data }); n++;
    }
    return n;
  }
}
