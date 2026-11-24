// v0.7: rules for the Eastern Reach: traders, charms, the lever carbine, fishing, mining, gathering,
// the Ashford bathhouse, renting a bed at the Drowned Lantern, and the coach between the two towns.
// Pure TypeScript, testable headlessly like the rest of src/sim.
import * as B from './balance';
import * as G from './state';
import * as T from './town';
import type { GameState } from './state';
import type { ItemId, GearId } from './balance';
import { mulberry32 } from './rng';

export type ShopId = keyof typeof B.SHOPS;
const SHOP_FACTION: Record<ShopId, 'ashford' | 'ashRoad' | 'watch' | 'fernhollow' | 'tower' | 'gullhaven'> = { farm: 'ashford', apothecary: 'ashford', gunsmith: 'ashford', fishmonger: 'ashford', curio: 'ashford', pedlar: 'ashRoad', lodge: 'watch',
  smokehouse: 'fernhollow', wisewoman: 'fernhollow', smithyWest: 'fernhollow', boatwright: 'fernhollow', burners: 'fernhollow', antiquarian: 'tower',
  chandlery: 'gullhaven', fishauction: 'gullhaven', anchor: 'gullhaven', shipwright: 'gullhaven' };
const rng = (s: GameState, salt: number) => mulberry32(s.seed * 31 + Math.floor(s.minutes) * 7 + G.tally(s, 'rolls') * 131 + salt);
const roll = (s: GameState, salt = 0) => { G.count(s, 'rolls'); return rng(s, salt)(); };

/** Price at an Eastern Reach trader: standing with that trader's people, market day, scars. */
export function shopPrice(s: GameState, shop: ShopId, id: ItemId): number {
  const base = B.SHOPS[shop].items.find(x => x.id === id)?.price ?? 0;
  const f = s.factions[SHOP_FACTION[shop]];
  return Math.max(1, Math.round(base * (1 - f / 400) * G.dayPriceMult(s) * (G.hasTrait(s, 'scarred') ? 1.05 : 1)));
}
export function buyFrom(s: GameState, shop: ShopId, id: ItemId): boolean {
  const p = shopPrice(s, shop, id); if (!p) return false;
  if (s.crowns < p) { G.log(s, 'You count your purse twice. Not enough.', 'warn'); return false; }
  s.crowns -= p; s.inventory[id]++; G.count(s, 'bought');
  G.log(s, `Bought ${B.ITEMS[id].name} (−${p}).`, 'info'); return true;
}
export function gearPrice(s: GameState, g: GearId, shop: ShopId): number { return Math.max(1, Math.round(B.GEAR[g].cost * (1 - s.factions[SHOP_FACTION[shop]] / 400))); }
export function buyGear(s: GameState, g: GearId, shop: ShopId): boolean {
  if (s.gear[g]) return false;
  const p = gearPrice(s, g, shop); if (s.crowns < p) { G.log(s, 'Not enough crowns for that.', 'warn'); return false; }
  s.crowns -= p; s.gear[g] = true; G.count(s, 'gearBought');
  if (g === 'carbine') { s.rifle.mag = B.CARBINE_MAG; s.inventory.carbineammo += 1; G.log(s, 'Corwin Hale works the lever twice and hands it over loaded. "Eight in the tube. Switch to it from your pack."', 'good'); }
  else if (g === 'scattergun' || g === 'longrifle') { const GD = B.GUNS[g]; s.guns[g].mag = GD.mag; s.inventory[GD.ammo] += 1; G.log(s, g === 'scattergun' ? 'Corwin breaks the scattergun open, drops two shells in and snaps it shut. "Close work only. At twenty paces it\'s a very loud insult."' : 'Mira Hale hands you the long rifle like a newborn. "Five in the magazine. Breathe out, then squeeze. Take it up from your pack."', 'good'); }
  else G.log(s, `${B.GEAR[g].name}: ${B.GEAR[g].desc}`, 'good');
  return true;
}
/** What this trader pays: a quarter more for the things they actually want. */
export function sellPriceAt(s: GameState, shop: ShopId, id: ItemId): number {
  const base = T.sellPrice(s, id); if (!base) return 0;
  const wants = B.SHOPS[shop].buys?.includes(id);
  return Math.max(1, Math.round(base * (wants ? (B.SHOPS[shop].pays ?? 1.25) : 1) * (1 + s.factions[SHOP_FACTION[shop]] / 400)));
}
export function sellAt(s: GameState, shop: ShopId, id: ItemId, n = 1): number {
  const p = sellPriceAt(s, shop, id); if (!p) return 0;
  n = Math.min(n, s.inventory[id]); if (n <= 0) return 0;
  s.inventory[id] -= n; s.crowns += p * n; G.count(s, 'crownsEarned', p * n); G.count(s, 'sold', n);
  if (id === 'barrowgold') { G.count(s, 'graveGoodsSold', n); G.rep(s, 'fernhollow', -2 * n, false); }
  if (s.charm === id && s.inventory[id] <= 0) s.charm = '';
  G.log(s, `Sold ${n} × ${B.ITEMS[id].name} for ${p * n} crowns.`, 'info'); return p * n;
}
// ---------------- charms ----------------
export function wearCharm(s: GameState, id: ItemId): boolean {
  if (B.ITEMS[id].kind !== 'charm' || s.inventory[id] <= 0) return false;
  s.charm = s.charm === id ? '' : id;
  G.log(s, s.charm ? `You hang the ${B.ITEMS[id].name.toLowerCase()} round your neck. ${B.ITEMS[id].desc.replace(/^Worn: /, '')}` : 'You take the charm off.', 'info');
  return true;
}
// ---------------- the carbine ----------------
/** Cycle to the next gun you own (v0.9: four of them). */
export function switchFirearm(s: GameState): boolean {
  const own = G.ownedGuns(s); if (own.length < 2) return false;
  return G.setFirearm(s, own[(own.indexOf(s.firearm) + 1) % own.length]);
}
// ---------------- using things from the pack ----------------
export function useItem(s: GameState, id: ItemId): string | null {
  if (s.inventory[id] <= 0) return null;
  if (id === 'salve') { s.inventory.salve--; s.hp = Math.min(G.maxHp(s), s.hp + 20); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 10); G.addXp(s, 'medicine', 6); G.advanceMinutes(s, 5, 'rest'); return 'The salve smells of comfrey and goose-fat. The ache goes quiet. +20 health.'; }
  if (id === 'salts') { s.inventory.salts--; s.needs.fatigue = G.clampNeedPublic('fatigue', s.needs.fatigue - 25); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress + 3); return 'Ammonia hits the back of your skull. You are very awake. −25 fatigue.'; }
  return null;
}
// ---------------- fishing ----------------
export type FishSpot = 'river' | 'pond' | 'lake' | 'marsh' | 'sea';
/** How long until a bite (seconds of real time) and how long the bite lasts. Dawn, dusk and rain bring fish up. */
export function fishTiming(s: GameState, spot: FishSpot = 'river'): { wait: number; window: number } {
  const h = G.hour(s), good = (h >= 5 && h <= 8) || (h >= 18 && h <= 21), wet = G.today(s).weather === 'rain' || G.today(s).weather === 'overcast';
  const wait = (4 + roll(s, 1) * 8) * (good ? 0.6 : 1) * (wet ? 0.8 : 1) * (spot === 'lake' && (s.story.flags.osricSpinners ?? 0) > 0 ? 0.7 : 1);
  return { wait, window: 0.75 + 0.06 * G.level(s, 'survival') + (s.charm === 'charmClover' ? 0.1 : 0) };
}
export function landFish(s: GameState, spot: FishSpot, caught: boolean): string {
  G.advanceMinutes(s, 8, 'rest'); G.count(s, 'casts');
  if (!caught) { G.addXp(s, 'survival', 1); return roll(s, 2) < 0.5 ? 'The line goes slack. Whatever it was, it is smarter than you.' : 'Too slow. The float bobs once, mockingly, and lies still.'; }
  const r = roll(s, 3), extra = G.buffActive(s, 'forager') ? 1 : 0;
  let item: ItemId, text: string;
  if (spot === 'pond') { item = r < 0.75 ? 'trout' : 'eel'; text = item === 'trout' ? 'A fat pond trout, gold-bellied.' : 'An eel, furious about everything.'; }
  else if (spot === 'lake') {
    const h = G.hour(s), pikeP = (h >= 5 && h <= 8) || (h >= 18 && h <= 21) ? 0.22 : 0.1;
    item = r < pikeP ? 'pike' : r < pikeP + 0.25 ? 'eel' : 'perch';
    text = item === 'pike' ? 'The rod bends double. Something long, green and furious comes up out of Lake Hallow: a pike!' : item === 'eel' ? 'A lake eel, thick as your wrist.' : 'A striped perch, spines up, offended.';
  } else if (spot === 'sea') {
    // v0.9: off the end of Gullhaven quay; mackerel run on the flood tide
    item = r < 0.8 ? 'mackerel' : r < 0.93 ? 'crabmeat' : 'saltfish';
    text = item === 'mackerel' ? 'A mackerel, barred green and silver, drumming on the stones.' : item === 'crabmeat' ? 'A crab hanging on to the bait out of pure spite. You keep the claws.' : 'A sea bream. Morwenna will call it salt-fish once it is cured.';
  } else if (spot === 'marsh') { item = r < 0.6 ? 'eel' : 'perch'; text = item === 'eel' ? 'A marsh eel out of the black water between the reeds.' : 'A little reed perch.'; }
  else { item = r < 0.6 ? 'trout' : r < 0.9 ? 'eel' : 'saltfish'; text = item === 'trout' ? 'A Wend trout, silver and kicking.' : item === 'eel' ? 'A Wend eel. It bites the rod, then you.' : 'A river bream. Oskar calls them "salt-fish" once they\'re cured.'; }
  s.inventory[item] += 1 + extra; G.addXp(s, 'survival', 6); G.count(s, 'fishCaught', 1 + extra);
  s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 4);
  return `${text} +${1 + extra}`;
}
// ---------------- mining and gathering ----------------
export function mine(s: GameState, deep: boolean): string {
  if (s.inventory.pickaxe <= 0) return '';
  G.advanceMinutes(s, 12, 'exert'); s.needs.fatigue = G.clampNeedPublic('fatigue', s.needs.fatigue + 3);
  const lvl = G.level(s, 'survival'), extra = (G.buffActive(s, 'forager') ? 1 : 0) + (roll(s, 4) < 0.1 + lvl * 0.03 ? 1 : 0);
  s.inventory.copper += 1 + extra; let text = `Green-veined copper ore. +${1 + extra}`;
  if (deep && roll(s, 5) < 0.3) { s.inventory.wardcopper++; text += ' And a sliver that hums: ward-copper.'; }
  G.addXp(s, 'survival', 5); G.addXp(s, 'vigor', 2); G.count(s, 'mined');
  return text;
}
export function gather(s: GameState, kind: 'shroom' | 'berry' | 'apple' | 'heather' | 'bilberry' | 'mussel' | 'samphire'): string {
  const lvl = G.level(s, 'survival'), extra = (G.buffActive(s, 'forager') ? 1 : 0) + (roll(s, 6) < 0.08 + lvl * 0.04 ? 1 : 0);
  if (kind === 'shroom') { s.inventory.mushrooms += 2 + extra; G.addXp(s, 'survival', 3); return `Lilac-footed blewits, a handful. +${2 + extra}`; }
  if (kind === 'berry') { s.inventory.berries += 3 + extra; G.addXp(s, 'survival', 3); return `Thornberries, and only a little blood. +${3 + extra}`; }
  if (kind === 'heather') { s.inventory.heather += 2 + extra; G.addXp(s, 'survival', 2); return `Heather sprigs, purple and wiry, smelling of honey. +${2 + extra}`; }
  if (kind === 'mussel') { s.inventory.mussels += 3 + extra; G.addXp(s, 'survival', 3); s.needs.hygiene = G.clampNeedPublic('hygiene', s.needs.hygiene - 3); return `Mussels prised off the bed with cold fingers. +${3 + extra}`; }
  if (kind === 'samphire') { s.inventory.samphire += 2 + extra; G.addXp(s, 'survival', 2); return `Samphire from the mud at the edge of the flats, salty and green. +${2 + extra}`; }
  if (kind === 'bilberry') { s.inventory.bilberries += 3 + extra; G.addXp(s, 'survival', 3); return `Bilberries from the low bushes between the barrows. Your fingers go blue. +${3 + extra}`; }
  s.inventory.apple += 3 + extra; G.addXp(s, 'survival', 1); return `Windfalls, mostly sound. +${3 + extra} apples`;
}
// ---------------- Ashford services ----------------
export function bathe(s: GameState): boolean {
  if (s.crowns < B.BATH_COST) { G.log(s, `Greta holds out her hand. "${B.BATH_COST} crowns, love. Steam isn't free."`, 'warn'); return false; }
  s.crowns -= B.BATH_COST; G.advanceMinutes(s, 40, 'rest');
  s.needs.hygiene = 100; s.needs.comfort = G.clampNeedPublic('comfort', s.needs.comfort + 25); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 15); s.needs.fatigue = G.clampNeedPublic('fatigue', s.needs.fatigue - 5);
  s.recent.washedMin = s.minutes; G.applyBuff(s, 'steamed'); G.count(s, 'baths');
  G.log(s, 'Hot water to the chin, cedar steam, and nobody wants anything from you for forty minutes. Clean, warm, and steamed through.', 'good');
  return true;
}
export function innCost(s: GameState, where: 'ashford' | 'fernhollow' | 'gullhaven' = 'ashford'): number { return where === 'gullhaven' ? ((s.story.flags.jowanFriend ?? 0) > 0 ? 0 : B.GULL_INN_COST) : where === 'fernhollow' && (s.story.flags.lissFriend ?? 0) > 0 ? 0 : B.INN_ROOM_COST; }
export function innSleep(s: GameState, where: 'ashford' | 'fernhollow' | 'gullhaven' = 'ashford'): number | false {
  const cost = innCost(s, where);
  if (s.crowns < cost) { G.log(s, where === 'gullhaven' ? `Jowan Penhale points at the board over the bar: ${cost} crowns a bed, a candle and a jug of water. "Gulls sleep on the roof for nothing. You're welcome to join them."` : where === 'fernhollow' ? `Davin Teague taps the slate behind the bar. "${cost} crowns a bed. The heron on the sign sleeps free; you aren't a heron."` : `Wenna shakes her head. "Beds are ${B.INN_ROOM_COST} crowns. The floor's free, but Jory sleeps on it."`, 'warn'); return false; }
  s.crowns -= cost; G.count(s, 'innNights');
  const mins = G.sleep(s, true);
  s.needs.comfort = G.clampNeedPublic('comfort', s.needs.comfort + 10);
  return mins;
}
export function takeCoach(s: GameState, to: 'ashford' | 'millbrook'): boolean {
  if (s.crowns < B.COACH_COST) { G.log(s, `Joss taps the fare board: ${B.COACH_COST} crowns. "No coin, no cushion."`, 'warn'); return false; }
  s.crowns -= B.COACH_COST; G.advanceMinutes(s, B.COACH_MINUTES, 'rest'); G.count(s, 'coachRides');
  s.needs.comfort = G.clampNeedPublic('comfort', s.needs.comfort - 5);
  G.log(s, to === 'ashford' ? 'The coach rattles east along the road, over the Wend bridge and in at Ashford\'s West Gate.' : 'The coach bumps west past Brookfield\'s fields and sets you down at Millbrook\'s East Gate.', 'info');
  return true;
}
export function warmAtHearth(s: GameState, where: 'farm' | 'burners' = 'farm'): string {
  G.advanceMinutes(s, 15, 'rest');
  s.needs.comfort = G.clampNeedPublic('comfort', s.needs.comfort + 12); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 4);
  if (where === 'burners') return 'The Smeaths\' fire is built of offcuts and charcoal dust and burns blue at the edges. Your clothes steam dry. Nettle doesn\'t ask where you have been.';
  return 'Hobb\'s hearth smells of apple wood. Nell brings you a heel of bread without being asked.';
}
