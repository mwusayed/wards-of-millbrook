// Town services and trade (pass 4): loot and selling, Dorran's smithy, the Gilded Tankard,
// the Chapel of the Quiet Flame, and things to do at home. All rules, no rendering.
import * as B from './balance';
import * as G from './state';
import type { GameState } from './state';
import type { ItemId } from './balance';
import { mulberry32 } from './rng';
import { TRAITS, TRAUMAS, type TraitId } from './skills';

const clamp = G.clampNeedPublic;

// ---------- loot ----------
export type LootKind = 'hound' | 'raider' | 'shade' | 'drowned' | 'imp' | 'wolf' | 'boar' | 'bandit' | 'hollow' | 'crab' | 'smuggler' | 'pistoleer' | 'elite';
export interface Loot { item?: ItemId; n?: number; crowns?: number }
/** What a kill leaves behind. Deterministic from the seed and the kill count, so reloading cannot re-roll it. */
export function rollLoot(s: GameState, kind: LootKind): Loot | null {
  const r = mulberry32(s.seed * 17 + s.stats.kills * 7919 + 3);
  const luck = (G.hasTrait(s, 'lucky') ? 0.15 : 0) + (s.charm === 'charmClover' ? 0.15 : 0);
  const hit = (p: number) => r() < p + luck;
  switch (kind) {
    case 'hound': return hit(0.55) ? { item: 'pelt', n: 1 } : null;
    case 'raider': { const tag = hit(0.7), coin = hit(0.6); if (!tag && !coin) return null; return { item: tag ? 'tags' : undefined, n: 1, crowns: coin ? 2 + Math.floor(r() * 6) : 0 }; }
    case 'shade': return hit(0.55) ? { item: 'dust', n: 1 } : null;
    case 'drowned': return hit(0.5) ? (r() < 0.5 ? { item: 'dust', n: 1 } : { crowns: 3 + Math.floor(r() * 6) }) : null;
    case 'imp': return hit(0.5) ? { item: 'cinder', n: 1 } : null;
    case 'wolf': return hit(0.6) ? { item: 'wolfpelt', n: 1 } : null;
    case 'boar': return hit(0.8) ? (r() < 0.55 ? { item: 'boarmeat', n: 1 } : { item: 'tusk', n: 1 }) : null;
    case 'bandit': { const tag = hit(0.6), coin = hit(0.7); if (!tag && !coin) return null; return { item: tag ? (r() < 0.25 ? 'carbineammo' : 'tags') : undefined, n: 1, crowns: coin ? 3 + Math.floor(r() * 8) : 0 }; }
    case 'hollow': return hit(0.6) ? (r() < 0.6 ? { item: 'copper', n: 1 } : { item: 'wardcopper', n: 1 }) : null;
    // v0.9.3: the coast (saltway.md §3.3): crabs drop crab meat; cove men carry coin and the odd box of rounds
    case 'crab': return hit(0.7) ? { item: 'crabmeat', n: 1 } : null;
    case 'smuggler': { const coin = hit(0.75), salt = hit(0.3); if (!coin && !salt) return null; return { item: salt ? 'saltfish' : undefined, n: 1, crowns: coin ? 3 + Math.floor(r() * 8) : 0 }; }
    case 'pistoleer': { const coin = hit(0.7), shot = hit(0.35); if (!coin && !shot) return null; return { item: shot ? 'ammo' : undefined, n: 1, crowns: coin ? 4 + Math.floor(r() * 8) : 0 }; }
    case 'elite': return { item: 'cinder', n: 1, crowns: 10 + Math.floor(r() * 10) };
  }
}
export function collectLoot(s: GameState, l: Loot): string {
  const parts: string[] = [];
  if (l.item) { s.inventory[l.item] += l.n ?? 1; parts.push(`${B.ITEMS[l.item].name}${(l.n ?? 1) > 1 ? ' ×' + l.n : ''}`); }
  if (l.crowns) { s.crowns += l.crowns; G.count(s, 'crownsEarned', l.crowns); parts.push(`${l.crowns} crowns`); }
  return parts.join(' and ');
}

// ---------- selling and bounties ----------
export function sellPrice(s: GameState, id: ItemId): number {
  const base = B.SELL[id]; if (!base) return 0;
  return Math.max(1, Math.round(base * (1 + s.factions.town / 400)));
}
export function sell(s: GameState, id: ItemId, n = 1): number {
  const p = sellPrice(s, id); if (!p) return 0;
  n = Math.min(n, s.inventory[id]); if (n <= 0) return 0;
  s.inventory[id] -= n; s.crowns += p * n; G.count(s, 'crownsEarned', p * n); G.count(s, 'sold', n);
  G.log(s, `Sold ${n} × ${B.ITEMS[id].name} for ${p * n} crowns.`, 'info');
  return p * n;
}
/** Sergeant Vole pays the Watch bounty on raider tags. */
export function claimBounty(s: GameState): number {
  const n = s.inventory.tags; if (n <= 0) return 0;
  const pay = n * B.TAG_BOUNTY; s.inventory.tags = 0; s.crowns += pay; G.count(s, 'crownsEarned', pay); G.count(s, 'tagsTurnedIn', n);
  G.rep(s, 'watch', Math.max(1, Math.floor(n / 2)), false);
  G.log(s, `Vole counts ${n} raider tag${n > 1 ? 's' : ''} into a tin and pays the Watch bounty: ${pay} crowns.`, 'good');
  return pay;
}

// ---------- Dorran's smithy ----------
export function gearCost(s: GameState, id: B.GearId): number { return Math.round(B.GEAR[id].cost * (s.story.flags.dorranFriend ? 0.75 : 1)); }
export function canBuyGear(s: GameState, id: B.GearId): { ok: boolean; why: string } {
  if (s.gear[id]) return { ok: false, why: 'Owned' };
  if (id === 'coat' && s.inventory.pelt + s.storage.pelt < 3) return { ok: false, why: 'Needs 3 hound pelts' };
  if (s.crowns < gearCost(s, id)) return { ok: false, why: 'Not enough crowns' };
  return { ok: true, why: '' };
}
export function buyGear(s: GameState, id: B.GearId): boolean {
  if (!canBuyGear(s, id).ok) return false;
  if (id === 'coat') { let need = 3; const fromPack = Math.min(need, s.inventory.pelt); s.inventory.pelt -= fromPack; need -= fromPack; s.storage.pelt -= need; }
  s.crowns -= gearCost(s, id); s.gear[id] = true;
  G.log(s, `Dorran sets down his hammer. "${B.GEAR[id].name}. It'll hold." (${B.GEAR[id].desc})`, 'good');
  return true;
}
/** Clean the revolver: free with an oil kit (10 minutes), or paid at the smith or the tinker. */
export function cleanRevolver(s: GameState, how: 'oil' | 'smith' | 'tinker'): boolean {
  if (s.revolverCond >= 99) { G.log(s, 'The revolver is already clean.', 'info'); return false; }
  if (how === 'oil') { if (s.inventory.oil <= 0) return false; s.inventory.oil--; G.advanceMinutes(s, 10, 'rest'); }
  else { const cost = how === 'tinker' ? 2 : 3; if (s.crowns < cost) return false; s.crowns -= cost; G.advanceMinutes(s, 10, 'rest'); }
  s.revolverCond = 100;
  G.log(s, how === 'oil' ? 'You strip, oil and wipe the revolver. The cylinder spins like new.' : 'Cleaned, oiled and handed back wrapped in a rag.', 'good');
  return true;
}
export function condText(c: number): string { return c >= 80 ? 'clean' : c >= B.COND_FOUL ? 'used' : c >= B.COND_MISFIRE ? 'fouled: shoots wide' : 'filthy: may misfire'; }

// ---------- the Gilded Tankard ----------
export const TAVERN = { meal: 6, ale: 3, room: 8 };
export function tavernMeal(s: GameState): boolean {
  if (s.crowns < TAVERN.meal) return false;
  s.crowns -= TAVERN.meal;
  s.needs.calories = clamp('calories', s.needs.calories + 950); s.needs.hydration = clamp('hydration', s.needs.hydration + 300);
  s.needs.comfort = clamp('comfort', s.needs.comfort + 18); s.needs.stress = clamp('stress', s.needs.stress - 6); s.needs.bowel = clamp('bowel', s.needs.bowel + 50);
  G.advanceMinutes(s, 30, 'rest'); G.rep(s, 'town', 1, false);
  G.log(s, 'Tomlin\'s pot pie, a heel of bread and somebody else doing the washing up.', 'good');
  return true;
}
export function tavernAle(s: GameState): boolean {
  const free = G.today(s).event === 'festival' && !G.tally(s, 'today:freeAle');
  if (!free && s.crowns < TAVERN.ale) return false;
  if (free) G.count(s, 'today:freeAle'); else s.crowns -= TAVERN.ale;
  const n = G.count(s, 'today:ales');
  s.needs.stress = clamp('stress', s.needs.stress - (n <= 2 ? 12 : 5)); s.needs.hydration = clamp('hydration', s.needs.hydration + 200);
  s.needs.bladder = clamp('bladder', s.needs.bladder + 90); s.needs.comfort = clamp('comfort', s.needs.comfort + 5);
  if (n >= 3) { s.needs.fatigue = clamp('fatigue', s.needs.fatigue + 8); G.log(s, 'The third ale goes down easier than it should. The room has a slight lean to it.', 'warn'); }
  else G.log(s, free ? 'Lamplight Eve: the first one is on the house.' : 'Small beer, cool from the cellar. Your shoulders come down from around your ears.', 'good');
  G.advanceMinutes(s, 15, 'rest');
  return true;
}
/** Dice at the Tankard ("Sevens"): roll two dice, you may re-roll one, then the house rolls. Higher total wins; the house takes ties. */
export interface DiceGame { bet: number; dice: [number, number]; rerolled: boolean; house: [number, number] | null; result: '' | 'win' | 'lose'; round: number }
const die = (s: GameState, salt: number) => 1 + Math.floor(mulberry32(s.seed * 53 + s.minutes * 31 + G.tally(s, 'diceRolls') * 97 + salt)() * 6);
export const DICE_MAX_ROUNDS = 6;
export function diceStart(s: GameState, bet: number): DiceGame | null {
  if (bet <= 0 || s.crowns < bet || G.tally(s, 'today:dice') >= DICE_MAX_ROUNDS) return null;
  G.count(s, 'today:dice'); G.count(s, 'diceRolls');
  return { bet, dice: [die(s, 1), die(s, 2)], rerolled: false, house: null, result: '', round: G.tally(s, 'today:dice') };
}
export function diceReroll(s: GameState, g: DiceGame, which: 0 | 1) { if (g.rerolled || g.house) return; G.count(s, 'diceRolls'); g.dice[which] = die(s, 3 + which); g.rerolled = true; }
export function diceStand(s: GameState, g: DiceGame) {
  if (g.house) return; G.count(s, 'diceRolls');
  g.house = [die(s, 7), die(s, 8)];
  const you = g.dice[0] + g.dice[1], them = g.house[0] + g.house[1];
  g.result = you > them ? 'win' : 'lose';
  if (g.result === 'win') { s.crowns += g.bet; G.count(s, 'diceWon', g.bet); s.needs.stress = clamp('stress', s.needs.stress - 3); }
  else { s.crowns -= g.bet; G.count(s, 'diceLost', g.bet); s.needs.stress = clamp('stress', s.needs.stress + 2); }
  G.advanceMinutes(s, 5, 'rest');
  G.log(s, g.result === 'win' ? `Dice: your ${you} beats the house's ${them}. +${g.bet} crowns.` : `Dice: the house's ${them} ${them === you ? 'ties' : 'beats'} your ${you}. −${g.bet} crowns.`, g.result === 'win' ? 'good' : 'warn');
}

// ---------- the Chapel of the Quiet Flame ----------
export const CHAPEL = { heal: 10, blessing: 5, cure: 40, draught: 14, manadraught: 12 };
const half = (s: GameState, n: number) => G.today(s).event === 'pilgrims' ? Math.ceil(n / 2) : n;
export const chapelHealCost = (s: GameState) => half(s, Math.max(4, CHAPEL.heal - Math.floor(Math.max(0, s.factions.chapel) / 15)));
export function chapelHeal(s: GameState): boolean {
  const cost = chapelHealCost(s);
  if (!s.wounds.length || s.crowns < cost) return false;
  s.crowns -= cost;
  const w = s.wounds.sort((a, b) => b.severity - a.severity).shift()!;
  s.hp = Math.min(G.maxHp(s), s.hp + 20); G.advanceMinutes(s, 20, 'rest'); G.rep(s, 'chapel', 1, false);
  G.log(s, `Maren cleans and closes the ${w.label.toLowerCase()} with warm hands and no small talk.`, 'good');
  return true;
}
export function blessing(s: GameState): boolean {
  if (s.crowns < CHAPEL.blessing) return false;
  s.crowns -= CHAPEL.blessing; s.needs.stress = clamp('stress', s.needs.stress - 25);
  s.story.flags.blessedUntil = s.minutes + 12 * 60; G.advanceMinutes(s, 15, 'rest'); G.rep(s, 'chapel', 1, false);
  G.log(s, 'You kneel by the Quiet Flame until your breathing matches it. Stress builds half as fast for twelve hours.', 'good');
  return true;
}
export function cureTrait(s: GameState, t: TraitId): boolean {
  if (!TRAUMAS.includes(t) || !G.hasTrait(s, t) || s.crowns < CHAPEL.cure) return false;
  s.crowns -= CHAPEL.cure; G.removeTrait(s, t); G.advanceMinutes(s, 60, 'rest');
  G.log(s, `An hour of Maren's hands, herbs and patience. ${TRAITS[t].name} is gone.`, 'good');
  return true;
}
export function draughtCost(s: GameState, id: 'draught' | 'manadraught'): number { return id === 'manadraught' && s.inventory.dust > 0 ? CHAPEL.manadraught - 5 : CHAPEL[id]; }
export function buyDraught(s: GameState, id: 'draught' | 'manadraught'): boolean {
  const cost = draughtCost(s, id); if (s.crowns < cost) return false;
  if (id === 'manadraught' && s.inventory.dust > 0) s.inventory.dust--;
  s.crowns -= cost; s.inventory[id]++; G.log(s, `Maren stoppers a ${B.ITEMS[id].name.toLowerCase()} for you.`, 'info'); return true;
}
export function useDraught(s: GameState, id: 'draught' | 'manadraught'): boolean {
  if (s.inventory[id] <= 0) return false; s.inventory[id]--;
  if (id === 'draught') { s.hp = Math.min(G.maxHp(s), s.hp + 35); G.log(s, 'Bitter, then warm. The edges of things come back into focus.', 'good'); }
  else { s.mana = Math.min(B.manaMax(s.needs), s.mana + 40); G.log(s, 'Cold going down, like breathing in winter. Mana, without the thirst.', 'good'); }
  return true;
}

// ---------- at home: the chair by the fire ----------
export function readBook(s: GameState): boolean {
  if (s.inventory.book + s.storage.book <= 0) return false;
  const first = !G.tally(s, 'today:read'); G.count(s, 'today:read'); const n = G.count(s, 'reads');
  const mult = s.upgrades.bookshelf ? 2 : 1;
  G.advanceMinutes(s, 60, 'rest');
  s.needs.stress = clamp('stress', s.needs.stress - 8 * mult); s.needs.comfort = clamp('comfort', s.needs.comfort + 10);
  if (first) { const k = n % 2 ? 'ledger' : 'spellcraft'; G.addXp(s, k, 14 * mult); G.log(s, k === 'ledger' ? 'An hour in Ysolde\'s household accounts. She balanced to the copper, every month. (Bookkeeping grows.)' : 'An hour in Ysolde\'s spell notes. Her margins argue with the textbook, and win. (Spellcraft grows.)', 'good'); }
  else G.log(s, 'You read on by the fire. Nothing new sinks in today, but it is a good hour.', 'info');
  return true;
}
/** Sit and breathe: mana comes back at double speed for an hour (it still drinks water), and stress drops. */
export function meditate(s: GameState) {
  const mm = B.manaMax(s.needs), want = mm - s.mana, afford = Math.max(0, (s.needs.hydration - 250) / B.MANA_WATER_ML), got = Math.min(want, afford);
  s.mana += got; s.needs.hydration = clamp('hydration', s.needs.hydration - got * B.MANA_WATER_ML);
  s.needs.stress = clamp('stress', s.needs.stress - 12);
  G.advanceMinutes(s, 60, 'rest');
  G.log(s, got < want - 1 ? 'You sit with the fire for an hour. Your mana only half returns: you are too dry.' : 'You sit with the fire for an hour. Your mana settles back, full and quiet.', 'good');
}
/** Pass time in the chair until the given hour (0–23). */
export function waitUntil(s: GameState, hour: number): number {
  const m = s.minutes % 1440; let mins = hour * 60 - m; if (mins <= 0) mins += 1440;
  G.advanceMinutes(s, mins, 'rest'); s.needs.comfort = clamp('comfort', s.needs.comfort + 15);
  G.log(s, `You wait by the fire until ${String(hour).padStart(2, '0')}:00.`, 'info');
  return mins;
}
