// Skills that grow by doing (the "skill" layer of Mercenary Maintenance's check formula) and
// lasting traits: traumas from collapses and bad wounds, and earned strengths (MM traumas/traits).
import { mulberry32 } from './rng';

export type SkillId = 'marksman' | 'spellcraft' | 'vigor' | 'ledger' | 'medicine' | 'cooking' | 'survival';
export const SKILL_IDS: SkillId[] = ['marksman', 'spellcraft', 'vigor', 'ledger', 'medicine', 'cooking', 'survival'];
export const SKILLS: Record<SkillId, { name: string; how: string; per: string }> = {
  marksman: { name: 'Marksmanship', how: 'Grows when your shots hit.', per: 'Each level: 5% steadier aim, +1.5% revolver damage.' },
  spellcraft: { name: 'Spellcraft', how: 'Grows when you cast.', per: 'Each level: spells cost 2% less mana and hit 3% harder.' },
  vigor: { name: 'Vigour', how: 'Grows when you run, carry and take blows.', per: 'Each level: running tires you 3% less, carry 0.6 kg more.' },
  ledger: { name: 'Bookkeeping', how: 'Grows with every correct posting and finding.', per: 'Each level: +4% ledger pay. Level 3 shows account hints.' },
  medicine: { name: 'Field medicine', how: 'Grows when you bind, stitch and mend.', per: 'Each level: bandages restore 3 more health; Mend heals 3% more.' },
  cooking: { name: 'Cooking', how: 'Grows when you cook.', per: 'Each level: meal effects last 6% longer.' },
  survival: { name: 'Woodcraft', how: 'Grows when you gather, fish and mine.', per: 'Each level: a wider window when a fish bites, and a better chance of an extra find.' },
};
export const MAX_LEVEL = 10;
/** Total XP needed to reach a level. */
export const xpFor = (level: number) => 40 * level * (level + 1) / 2;
export function levelOf(xp: number): number { let l = 0; while (l < MAX_LEVEL && xp >= xpFor(l + 1)) l++; return l; }
export function progress(xp: number): { level: number; into: number; need: number } {
  const level = levelOf(xp); if (level >= MAX_LEVEL) return { level, into: 0, need: 0 };
  return { level, into: xp - xpFor(level), need: xpFor(level + 1) - xpFor(level) };
}

export type TraitId = 'badKnee' | 'jumpy' | 'scarred' | 'shakyHands' | 'stare' | 'hardened' | 'cleanHands' | 'ironGut' | 'roadwise' | 'lucky' | 'wardTouched';
export const TRAITS: Record<TraitId, { name: string; desc: string; good: boolean }> = {
  badKnee: { name: 'Bad knee', desc: 'That fall did something. You move 6% slower.', good: false },
  jumpy: { name: 'Jumpy', desc: 'You flinch at loud noises now. Being hit stresses you 25% more.', good: false },
  scarred: { name: 'Scarred', desc: 'The marks do not heal. Traders charge you 5% more.', good: false },
  shakyHands: { name: 'Shaky hands', desc: 'Your grip is not what it was. Shots spread 20% wider.', good: false },
  stare: { name: 'Thousand-yard stare', desc: 'You have seen worse. Being hit stresses you 30% less.', good: true },
  hardened: { name: 'Battle-hardened', desc: 'Pain is just information. You take 8% less damage.', good: true },
  cleanHands: { name: 'Clean hands', desc: 'Brannic trusts your figures: +10% ledger pay.', good: true },
  ironGut: { name: 'Iron gut', desc: 'Your own cooking agrees with you: cooked meals give 10% more.', good: true },
  roadwise: { name: 'Roadwise', desc: 'You know how to pace a long road: running tires you 15% less.', good: true },
  lucky: { name: 'Lucky', desc: "Fenn's lure in your pocket: you find loot more often.", good: true },
  wardTouched: { name: 'Ward-touched', desc: 'A ward-stone hums in your staff: spells hit 15% harder, and mana drinks a little more water.', good: true },
};
export const TRAUMAS: TraitId[] = ['badKnee', 'jumpy', 'scarred', 'shakyHands'];
/** Pick a trauma the player does not have yet, deterministically from the seed and a counter. */
export function rollTrauma(have: TraitId[], seed: number, counter: number, chance: number): TraitId | null {
  const r = mulberry32(seed * 131 + counter * 977 + 5);
  if (r() >= chance) return null;
  const pool = TRAUMAS.filter(t => !have.includes(t));
  return pool.length ? pool[Math.floor(r() * pool.length)] : null;
}
