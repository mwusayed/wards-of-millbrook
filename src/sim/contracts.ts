// Contract board. Archetypes from Mercenary Maintenance / Ledger & Ward, made playable in the 3D Vale.
import { mulberry32 } from './rng';

export type SiteId = 'mill_road' | 'raider_camp' | 'whisper_stones' | 'thornwood' | 'toll_tower' | 'brookfield' | 'hollow_road' | 'heath_road' | 'barrow_downs' | 'reed_marsh' | 'saltway' | 'gull_tower' | 'tidal_flats' | 'wreckers_cove';
export const SITES: Record<SiteId, { name: string }> = {
  mill_road: { name: 'the Old Mill road' },
  raider_camp: { name: 'the raider camp by the ford' },
  whisper_stones: { name: 'the Whisper Stones' },
  // v0.7: the Eastern Reach
  thornwood: { name: 'the woodcutters\' clearing in Thornwood' },
  toll_tower: { name: 'the old toll tower on the Ash Road' },
  brookfield: { name: 'Brookfield, Hobb Varley\'s farm' },
  hollow_road: { name: 'the hill road to Copper Hollow' },
  // v0.8: the Westmarch
  heath_road: { name: 'the Heath Road past the fallen milestone' },
  barrow_downs: { name: 'the Ring of Nine on the Barrow Downs' },
  reed_marsh: { name: 'the old causeway in the reed marsh' },
  // v0.9: the Saltway Coast
  saltway: { name: 'the Saltway by the carter\'s shrine' },
  gull_tower: { name: 'the Gull Tower above the Saltway' },
  tidal_flats: { name: 'the tidal flats below Gullhaven' },
  wreckers_cove: { name: 'Wreckers\' Cove under the cliffs' },
};
export const WEST_SITES: SiteId[] = ['mill_road', 'raider_camp', 'whisper_stones'];
export const EAST_SITES: SiteId[] = ['thornwood', 'toll_tower', 'brookfield', 'hollow_road'];
export const MARCH_SITES: SiteId[] = ['heath_road', 'barrow_downs', 'reed_marsh'];
export const COAST_SITES: SiteId[] = ['saltway', 'gull_tower', 'tidal_flats', 'wreckers_cove'];
export type EnemyKind = 'hound' | 'raider' | 'shade' | 'drowned' | 'imp' | 'wolf' | 'boar' | 'bandit' | 'hollow' | 'wight' | 'wisp' | 'crab' | 'smuggler' | 'pistoleer';
export const ENEMY_NAMES: Record<EnemyKind, string> = { hound: 'Hollow Hound', raider: 'Road Raider', shade: 'Shade Caster', drowned: 'Drowned Acolyte', imp: 'Inferno Imp', wolf: 'Thornwood Wolf', boar: 'Tusker Boar', bandit: 'Ash Road Crossbowman', hollow: 'Hollowed Miner', wight: 'Barrow Wight', wisp: 'Grave-light', crab: 'Shore Crab', smuggler: 'Cove Smuggler', pistoleer: 'Cove Pistoleer' };

export type ContractKind = 'sweep' | 'courier' | 'recovery';
export type FactionId = 'town' | 'tower' | 'chapel' | 'watch' | 'ashRoad' | 'ashford' | 'fernhollow' | 'gullhaven';
export const FACTIONS: Record<FactionId, { name: string; who: string }> = {
  town: { name: 'Millbrook folk', who: 'traders and neighbours' },
  tower: { name: 'The Tower', who: 'Aldric Voss and his clerks' },
  chapel: { name: 'Chapel of the Quiet Flame', who: 'Maren and the pilgrims' },
  watch: { name: 'The Watch', who: 'Captain Renn and the gate guards' },
  ashRoad: { name: 'Ash Road', who: 'smugglers and people who move things quietly' },
  ashford: { name: 'Ashford', who: 'the river town: the Reeve, the Lodge and the market' },
  fernhollow: { name: 'Fernhollow', who: 'the lake village: the headwoman, the barrow-warden and the boats' },
  gullhaven: { name: 'Gullhaven', who: 'the port: the harbourmaster, the boats, the auction and the lighthouse' },
};
const ISSUER_FACTION: Record<string, FactionId> = { 'Bree Calloway': 'gullhaven', 'Jowan Penhale': 'gullhaven', 'Morwenna Kitto': 'gullhaven', 'Captain Jago Vosper': 'gullhaven', 'Orla Hesk': 'fernhollow', 'Cadoc Lowen': 'fernhollow', 'Wynn Calder': 'fernhollow', 'Davin Teague': 'fernhollow', 'Lodge-master Dace Morrow': 'ashford', 'Reeve Hollis Garrow': 'ashford', 'Hobb Varley': 'ashford', 'Ulric Ashdown': 'ashford', 'Corporal Edda Strand': 'watch', 'Captain Ilsa Renn': 'watch', 'Sera Vint': 'town', 'Bram Thatch': 'town', 'Fenn Marlow': 'town', 'Old Petch': 'chapel', 'Brannic, the town ledger': 'tower', 'A man with no name at the Tankard': 'ashRoad' };
export const issuerFaction = (issuer: string): FactionId => ISSUER_FACTION[issuer] ?? 'town';
export interface Contract {
  id: string;
  kind: ContractKind;
  title: string;
  brief: string;
  site: SiteId;
  enemy?: EnemyKind;
  count: number;
  progress: number;
  pay: number;
  issuer: string;
  prep?: { armor?: boolean; supplies?: boolean; scouted?: boolean };
  expiresDay: number;
  /** A bounty on one named, much tougher enemy. */
  elite?: boolean;
  /** Which board posted it: Millbrook's (default) or the Wardens' Lodge in Ashford. */
  board?: 'lodge' | 'west' | 'coast';
}

const ISSUERS = ['Captain Ilsa Renn', 'Sera Vint', 'Bram Thatch', 'Fenn Marlow', 'Old Petch'];
const SWEEP_BRIEFS: Partial<Record<EnemyKind, string[]>> & Record<'hound' | 'raider' | 'shade', string[]> = {
  hound: ['Hollow Hounds have been taking sheep near {site}. Put down {n}.', 'Something with too many teeth is hunting {site}. Kill {n} hounds and the road reopens.'],
  raider: ['Raiders are taxing carts at {site}. Remove {n} of them. The Watch won\'t ask how.', '{n} raiders robbed the bakery cart near {site}. Bram wants them gone.'],
  shade: ['Shades drift around {site} after dark. Disperse {n} before someone wanders in.', 'The pilgrims won\'t pass {site} while the shades walk. Banish {n}.'],
};

export function generateBoard(day: number, salt = 0): Contract[] {
  const r = mulberry32(day * 2654435761 + salt * 97 + 3);
  const sites: SiteId[] = ['mill_road', 'raider_camp', 'whisper_stones'];
  const kinds: EnemyKind[] = ['hound', 'raider', 'shade'];
  const out: Contract[] = [];
  for (let i = 0; i < 3; i++) {
    const site = sites[i];
    const enemy = kinds[(i + day) % 3];
    const n = 2 + Math.floor(r() * 3);
    const pay = 20 + n * 9 + (enemy === 'shade' ? 10 : 0) + Math.floor(r() * 10);
    const briefs = SWEEP_BRIEFS[enemy]!;
    const brief = briefs[Math.floor(r() * briefs.length)].replace('{site}', SITES[site].name).replace('{n}', String(n));
    out.push({ id: `c${day}-${i}-${salt}`, kind: 'sweep', title: `Sweep: ${n} ${enemyPlural(enemy)}`, brief, site, enemy, count: n, progress: 0, pay, issuer: ISSUERS[Math.floor(r() * ISSUERS.length)], expiresDay: day + 3 });
  }
  const cs: SiteId = sites[Math.floor(r() * 3)];
  out.push({ id: `c${day}-cour-${salt}`, kind: 'courier', title: 'Courier: sealed letter', brief: `Carry a sealed letter to the waystone at ${SITES[cs].name} and leave it in the cairn. Don't read it.`, site: cs, count: 1, progress: 0, pay: 22 + Math.floor(r() * 10), issuer: 'Brannic, the town ledger', expiresDay: day + 2 });
  // Recovery (MM extraction archetype): fetch something from a guarded site and bring it back
  const rs: SiteId = sites[(day + 1) % 3];
  const things = ['the bakery cart\'s strongbox', 'a pilgrim\'s reliquary', 'the toll-keeper\'s satchel'];
  const what = things[Math.floor(r() * things.length)];
  out.push({ id: `c${day}-rec-${salt}`, kind: 'recovery', title: `Recovery: ${what.replace(/^(the|a) /, '')}`, brief: `Something taken lies by the cairn at ${SITES[rs].name}: ${what}. Bring it back to the board. Whatever took it may still be there.`, site: rs, enemy: (['hound', 'raider', 'shade'] as EnemyKind[])[(day + 1) % 3], count: 1, progress: 0, pay: 38 + Math.floor(r() * 14), issuer: r() < 0.3 ? 'A man with no name at the Tankard' : 'Sera Vint', expiresDay: day + 3 });
  // Bounty (pass 4): one named elite, every other day
  if (day % 2 === 0) {
    const bs: SiteId = sites[(day / 2) % 3], be: EnemyKind = kinds[(day / 2 + 1) % 3];
    const names: Record<string, string[]> = { hound: ['the Grey Mother', 'Old Three-Legs', 'the Mill Pack\'s alpha'], raider: ['Red Hanno', 'the Toll-Taker', 'Ysra Half-Hand'], shade: ['the Lamplighter', 'the Thing at the Third Stone', 'Brother Nobody'] };
    const who = names[be][Math.floor(r() * 3)];
    out.push({ id: `c${day}-bounty-${salt}`, kind: 'sweep', elite: true, title: `Bounty: ${who}`, brief: `${who[0].toUpperCase() + who.slice(1)} has been seen at ${SITES[bs].name}. Bigger, meaner and harder to put down than the rest; it takes twice the killing. The Watch pays well, and it will be carrying something.`, site: bs, enemy: be, count: 1, progress: 0, pay: 48 + Math.floor(r() * 16), issuer: 'Captain Ilsa Renn', expiresDay: day + 3 });
  }
  return out;
}

export function enemyPlural(k: EnemyKind) { return ({ hound: 'Hollow Hounds', raider: 'Road Raiders', shade: 'Shade Casters', drowned: 'Drowned Acolytes', imp: 'Inferno Imps', wolf: 'Thornwood Wolves', boar: 'Tusker Boars', bandit: 'Ash Road crossbowmen', hollow: 'Hollowed Miners', wight: 'Barrow Wights', wisp: 'Grave-lights', crab: 'Shore Crabs', smuggler: 'Cove Smugglers', pistoleer: 'Cove Pistoleers' } as Record<EnemyKind, string>)[k]; }

// ---- v0.7: the Wardens' Lodge in Ashford posts harder work in the Eastern Reach ----
const LODGE_BRIEFS: Partial<Record<EnemyKind, string[]>> = {
  wolf: ['A Thornwood pack has learned the woodcutters\' hours. Thin it by {n} near {site}.', 'Wolves took two of Hobb Varley\'s ewes and a dog. {n} of them, at {site}.'],
  boar: ['A tusker has gored a carter on {site}. There are {n} of them rooting there now. Mind the charge; step aside, don\'t run.', 'Boars are tearing up the hill road. {n} to put down near {site}.'],
  bandit: ['Crossbowmen are holding {site} and taxing everything with wheels. Remove {n}. Use cover.', 'The Ash Road toll is back at {site}. The Reeve wants {n} of the toll-takers gone.'],
};
const LODGE_ISSUERS = ['Lodge-master Dace Morrow', 'Reeve Hollis Garrow', 'Hobb Varley', 'Ulric Ashdown'];
export function generateLodgeBoard(day: number, salt = 0): Contract[] {
  const r = mulberry32(day * 2246822519 + salt * 131 + 11);
  const plan: [SiteId, EnemyKind][] = [['thornwood', 'wolf'], ['brookfield', 'wolf'], ['toll_tower', 'bandit'], ['hollow_road', 'boar']];
  const out: Contract[] = [];
  for (let i = 0; i < 3; i++) {
    const [site, enemy] = plan[(i + day) % plan.length];
    const n = enemy === 'boar' ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 3);
    const pay = 34 + n * 11 + (enemy === 'bandit' ? 14 : enemy === 'boar' ? 10 : 0) + Math.floor(r() * 12);
    const briefs = LODGE_BRIEFS[enemy]!;
    const brief = briefs[Math.floor(r() * briefs.length)].replace('{site}', SITES[site].name).replace('{n}', String(n));
    out.push({ id: `l${day}-${i}-${salt}`, kind: 'sweep', title: `Lodge: ${n} ${enemyPlural(enemy)}`, brief, site, enemy, count: n, progress: 0, pay, issuer: LODGE_ISSUERS[Math.floor(r() * LODGE_ISSUERS.length)], expiresDay: day + 3, board: 'lodge' });
  }
  const cs: SiteId = (['thornwood', 'brookfield', 'hollow_road'] as SiteId[])[Math.floor(r() * 3)];
  out.push({ id: `l${day}-cour-${salt}`, kind: 'courier', title: 'Courier: Lodge dispatch', brief: `Leave a sealed Lodge dispatch in the cairn at ${SITES[cs].name}. The rangers check it at dusk.`, site: cs, count: 1, progress: 0, pay: 30 + Math.floor(r() * 12), issuer: 'Lodge-master Dace Morrow', expiresDay: day + 2, board: 'lodge' });
  if (day % 3 === 1) {
    const who = ['Mallory Crane, the Toll Captain', 'Old Gorehide', 'the Pale Bitch of Thornwood'][Math.floor(day / 3) % 3];
    const [bs, be]: [SiteId, EnemyKind] = who.startsWith('Mallory') ? ['toll_tower', 'bandit'] : who.startsWith('Old') ? ['hollow_road', 'boar'] : ['thornwood', 'wolf'];
    out.push({ id: `l${day}-bounty-${salt}`, kind: 'sweep', elite: true, title: `Bounty: ${who}`, brief: `${who} has been seen at ${SITES[bs].name}. The Lodge pays double for this one, and the Reeve adds a purse.`, site: bs, enemy: be, count: 1, progress: 0, pay: 70 + Math.floor(r() * 20), issuer: 'Lodge-master Dace Morrow', expiresDay: day + 3, board: 'lodge' });
  }
  return out;
}

// ---- v0.8: Fernhollow's notice post: work in the Westmarch ----
const WEST_BRIEFS: Partial<Record<EnemyKind, string[]>> = {
  wolf: ['Wynn Calder has lost three ewes on the heath. Wolves, {n} of them, along {site}.', 'Heath wolves are following the carters. Put down {n} near {site}.'],
  wight: ['The dead are walking at {site} again. Lay {n} of them back down. Fire works; bullets less.', 'Cadoc counts {n} wights risen near {site}. He asks for them to be put to rest, not robbed.'],
  wisp: ['Grave-lights are leading sheep into the barrows at {site}. Put out {n}. Shoot them before they come close.', 'Children are following the lights at {site}. {n} of them need putting out.'],
  drowned: ['Something walks the causeway at {site} after dark. {n} of them. The boats will not go out.', 'The marsh dead have taken to standing in the reeds at {site}. {n} to drive off.'],
};
const WEST_ISSUERS = ['Orla Hesk', 'Cadoc Lowen', 'Wynn Calder', 'Davin Teague'];
export function generateWestBoard(day: number, salt = 0): Contract[] {
  const r = mulberry32(day * 3266489917 + salt * 197 + 23);
  const plan: [SiteId, EnemyKind][] = [['heath_road', 'wolf'], ['barrow_downs', 'wight'], ['reed_marsh', 'drowned'], ['barrow_downs', 'wisp']];
  const out: Contract[] = [];
  for (let i = 0; i < 3; i++) {
    const [site, enemy] = plan[(i + day) % plan.length];
    const n = enemy === 'wight' || enemy === 'drowned' ? 2 + Math.floor(r() * 2) : 3 + Math.floor(r() * 2);
    const pay = 32 + n * 12 + (enemy === 'wight' ? 14 : enemy === 'drowned' ? 10 : 0) + Math.floor(r() * 10);
    const briefs = WEST_BRIEFS[enemy]!;
    const brief = briefs[Math.floor(r() * briefs.length)].replace('{site}', SITES[site].name).replace('{n}', String(n));
    out.push({ id: `w${day}-${i}-${salt}`, kind: 'sweep', title: `Notice: ${n} ${enemyPlural(enemy)}`, brief, site, enemy, count: n, progress: 0, pay, issuer: WEST_ISSUERS[Math.floor(r() * WEST_ISSUERS.length)], expiresDay: day + 3, board: 'west' });
  }
  const cs: SiteId = MARCH_SITES[Math.floor(r() * 3)];
  out.push({ id: `w${day}-cour-${salt}`, kind: 'courier', title: 'Courier: a letter for the cairn', brief: `Leave Orla Hesk's letter in the cairn at ${SITES[cs].name}. The post-rider collects from there, when there is a post-rider.`, site: cs, count: 1, progress: 0, pay: 26 + Math.floor(r() * 10), issuer: 'Orla Hesk', expiresDay: day + 3, board: 'west' });
  if (day % 3 === 2) {
    const who = ['the Hollow King\'s Champion', 'Old Brindle, the heath wolf', 'the Lantern Woman'][Math.floor(day / 3) % 3];
    const [bs, be]: [SiteId, EnemyKind] = who.includes('Champion') ? ['barrow_downs', 'wight'] : who.includes('Brindle') ? ['heath_road', 'wolf'] : ['reed_marsh', 'drowned'];
    out.push({ id: `w${day}-bounty-${salt}`, kind: 'sweep', elite: true, title: `Bounty: ${who}`, brief: `${who[0].toUpperCase() + who.slice(1)} has been seen at ${SITES[bs].name}. Fernhollow has put together a purse; Cadoc adds his blessing, for what it is worth.`, site: bs, enemy: be, count: 1, progress: 0, pay: 75 + Math.floor(r() * 20), issuer: 'Orla Hesk', expiresDay: day + 3, board: 'west' });
  }
  return out;
}

// ---- v0.9: Gullhaven's notice post on the quay: work on the Saltway Coast ----
const COAST_BRIEFS: Partial<Record<EnemyKind, string[]>> = {
  crab: ['The crabs on {site} have got bold: {n} of them nipping the mussel-pickers. Thin them out at low tide.', 'Lowdy Pengelly will not go out on {site} until someone sees off {n} shore crabs. Mind the claws; bullets glance off.'],
  smuggler: ['Cove men on {site} again, {n} of them, cutlasses out. The harbourmaster wants them gone.', 'Carts are being stopped on {site} by {n} smugglers. Bree Calloway pays for each one moved on.'],
  pistoleer: ['{n} pistoleers are shooting at the salt carts from {site}. Keep your head down and close the distance.', 'Someone is sniping at the boats from {site}: {n} men with flintlocks.'],
};
const COAST_ISSUERS = ['Bree Calloway', 'Jowan Penhale', 'Morwenna Kitto', 'Captain Jago Vosper'];
export function generateCoastBoard(day: number, salt = 0): Contract[] {
  const r = mulberry32(day * 2654435761 + salt * 211 + 41);
  const plan: [SiteId, EnemyKind][] = [['tidal_flats', 'crab'], ['saltway', 'smuggler'], ['gull_tower', 'pistoleer'], ['wreckers_cove', 'smuggler'], ['tidal_flats', 'crab']];
  const out: Contract[] = [];
  for (let i = 0; i < 3; i++) {
    const [site, enemy] = plan[(i + day) % plan.length];
    const n = enemy === 'crab' ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
    const pay = 30 + n * 12 + (enemy === 'pistoleer' ? 16 : enemy === 'smuggler' ? 8 : 0) + Math.floor(r() * 10);
    const briefs = COAST_BRIEFS[enemy]!;
    const brief = briefs[Math.floor(r() * briefs.length)].replace('{site}', SITES[site].name).replace('{n}', String(n));
    out.push({ id: `s${day}-${i}-${salt}`, kind: 'sweep', title: `Quay notice: ${n} ${enemyPlural(enemy)}`, brief, site, enemy, count: n, progress: 0, pay, issuer: COAST_ISSUERS[Math.floor(r() * COAST_ISSUERS.length)], expiresDay: day + 3, board: 'coast' });
  }
  const cs: SiteId = (['saltway', 'tidal_flats', 'gull_tower'] as SiteId[])[Math.floor(r() * 3)];
  out.push({ id: `s${day}-cour-${salt}`, kind: 'courier', title: 'Courier: harbour post', brief: `Leave the harbourmaster's sealed post in the cairn at ${SITES[cs].name}. The salt carters pick it up on their way inland.`, site: cs, count: 1, progress: 0, pay: 24 + Math.floor(r() * 8), issuer: 'Bree Calloway', expiresDay: day + 2, board: 'coast' });
  if (day % 3 === 1) {
    const who = ['Black Ned Pascoe', 'Old Snapper, the flats crab', 'Red Lowena'][Math.floor(day / 3) % 3];
    const [bs, be]: [SiteId, EnemyKind] = who.startsWith('Black') ? ['wreckers_cove', 'smuggler'] : who.startsWith('Old') ? ['tidal_flats', 'crab'] : ['gull_tower', 'pistoleer'];
    out.push({ id: `s${day}-bounty-${salt}`, kind: 'sweep', elite: true, title: `Bounty: ${who}`, brief: `${who} has been seen at ${SITES[bs].name}. The harbour and the auction have put up a purse between them.`, site: bs, enemy: be, count: 1, progress: 0, pay: 75 + Math.floor(r() * 20), issuer: 'Bree Calloway', expiresDay: day + 3, board: 'coast' });
  }
  return out;
}
