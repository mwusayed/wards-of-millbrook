// Deterministic random numbers (same algorithm family used in Ledger & Ward's economy.ts).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** P1: a random stream whose whole state is one 32-bit number, so it can be saved, restored and hashed.
 *  Same algorithm as mulberry32. `gameplayRng` drives every random choice that changes what happens
 *  (enemy strafing, wander targets, line-of-sight timing, enemy aim, attack picks, shot spread, spawn
 *  scatter). Cosmetic randomness (flinches, puffs, NPC fidgets, sounds) keeps Math.random. */
export class RngStream {
  constructor(public state: number) { this.state = state >>> 0; }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}
export const gameplayRng = new RngStream(1);
/** P1: flavour-text choices (src/sim/text.ts). Separate from gameplayRng so a line of text never shifts
 *  a combat roll, but still seeded and saved, because the chosen line lands in the campaign log. */
export const textRng = new RngStream(2);
/** Seed for a campaign's gameplay stream when a save has none (older saves, new games). */
export function gameplaySeed(seed: number, minutes: number): number { return hashString(`gameplay:${seed}:${minutes}`); }
