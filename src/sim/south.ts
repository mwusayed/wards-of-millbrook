// v0.9: rules for the Saltway Coast (docs/gdd/saltway.md): the Salt Gap and its blasting charge, the tide, the
// flats and the wreck of the Merry Wren, the Gull Tower's false light, Collector Marrow's ledger and what becomes
// of him, the keeper's oil, the sea chapel's blessing, and the Wreck-Mother's shell. Pure TypeScript like the
// rest of src/sim.
import * as B from './balance';
import * as G from './state';
import type { GameState } from './state';

const F = (s: GameState, k: string) => s.story.flags[k] ?? 0;
const set = (s: GameState, k: string, v = 1) => { s.story.flags[k] = v; };
const hourOf = (minutes: number) => (((minutes % 1440) + 1440) % 1440) / 60;

// ---------------- the tide ----------------
/** Tide level for an hour of the day (0–24, fractional): +1 high water at 02:00 and 14:00, −1 low at 08:00 and 20:00. */
export function tideLevel(hour: number): number { return Math.cos(2 * Math.PI * (hour - 2) / 12); }
export const tideAt = (s: GameState) => tideLevel(hourOf(s.minutes));
/** The flats (the far mussel beds, the wreck) are out of the water. */
export const flatsExposed = (s: GameState) => tideAt(s) < B.TIDE_LOW;
/** Game minutes until the flats are next exposed (0 if they are now). */
export function minutesToLowWater(s: GameState): number {
  for (let m = 0; m <= 720; m += 5) if (tideLevel(hourOf(s.minutes + m)) < B.TIDE_LOW) return m;
  return 0;
}
/** Game minutes until the water is back over the flats (0 if it already is). */
export function minutesToFlood(s: GameState): number {
  for (let m = 0; m <= 720; m += 5) if (tideLevel(hourOf(s.minutes + m)) >= B.TIDE_LOW) return m;
  return 0;
}
export function tideWord(s: GameState): string {
  const t = tideAt(s), rising = tideLevel(hourOf(s.minutes + 30)) > t;
  if (t < B.TIDE_LOW) return 'low water: the flats are out';
  if (t > 0.6) return 'high water';
  return rising ? 'the flood (rising)' : 'the ebb (falling)';
}
/** How fast you wade (flats at the turn of the tide, the flooded grotto). */
export function wadeMult(s: GameState): number {
  if (s.gear.seaboots || s.gear.waders) return 1;
  return G.buffActive(s, 'seaLegs') ? 1 - (1 - B.WADE_MULT) / 2 : B.WADE_MULT;
}
/** The water came back while you were out on the flats: it carries you to the shore. */
export function tideCarry(s: GameState) {
  s.stamina = Math.max(0, s.stamina - 10); G.count(s, 'tideCarried');
  G.log(s, 'The tide comes back faster than a man can walk. It lifts you off your feet and puts you down, coughing, on the shingle.', 'warn');
}

// ---------------- the Salt Gap ----------------
export function canBuyCharge(s: GameState): boolean { return !F(s, 'saltGapOpen') && s.inventory.blastcharge <= 0 && !F(s, 'chargeSet'); }
export function buyCharge(s: GameState): boolean {
  if (!canBuyCharge(s)) return false;
  if (s.crowns < B.CHARGE_PRICE) { G.log(s, `Dorran wants ${B.CHARGE_PRICE} crowns for a charge. "Powder isn't cheap and neither are my eyebrows."`, 'warn'); return false; }
  s.crowns -= B.CHARGE_PRICE; s.inventory.blastcharge = 1;
  G.log(s, `Dorran wraps the charge in a second layer of tarred canvas. "Light it, walk away. Do not stroll. Walk." −${B.CHARGE_PRICE} crowns.`, 'info');
  return true;
}
/** Set the charge against the rockfall and light the fuse (the scene runs the fuse, then calls blowGap). */
export function setCharge(s: GameState): boolean {
  if (F(s, 'saltGapOpen') || F(s, 'chargeSet')) return false;
  if (s.inventory.blastcharge <= 0) { G.log(s, 'Boulders the size of carts, wedged tight. Nothing short of blasting powder will shift them. Dorran sells it.', 'warn'); return false; }
  s.inventory.blastcharge = 0; set(s, 'chargeSet');
  G.log(s, `You pack the charge into a crack under the biggest boulder and light the fuse. It fizzes. ${B.BLAST.fuse} seconds. Walk.`, 'warn');
  return true;
}
/** Damage from the blast at `dist` metres. */
export function blastDamage(dist: number): number { return dist < B.BLAST.near ? B.BLAST.dmgNear : dist < B.BLAST.far ? B.BLAST.dmgFar : 0; }
/** The charge goes off: the gap is open for good. Returns the damage to apply to the player. */
export function blowGap(s: GameState, dist: number): number {
  if (F(s, 'saltGapOpen')) return 0;
  set(s, 'saltGapOpen'); s.story.flags.chargeSet = 0; G.count(s, 'gatesOpened');
  s.boardDay = 0; G.refreshBoard(s);                         // Gullhaven's notices appear at once
  G.log(s, 'The world goes white, then very loud, then very quiet. When the dust settles there is a gap in the rockfall a cart could drive through, and beyond it the smell of the sea.', 'good');
  return blastDamage(dist);
}

// ---------------- False Lights ----------------
const NEED_LOW = 'The wreck is under the sea at this hour; only her masthead shows. The flats are out about 06:00 to 10:00 and 18:00 to 22:00.';
/** The Merry Wren's log, from the captain's cabin. Only at low water. */
export function searchWreck(s: GameState): string {
  if (!flatsExposed(s)) return NEED_LOW;
  if (F(s, 'logFound')) return 'The cabin is empty now: a chart table, a cracked lamp, a captain\'s boot full of sand.';
  s.inventory.wrenlog = 1; set(s, 'logFound'); G.addXp(s, 'ledger', 6);
  return 'In the captain\'s locker, wrapped in oilcloth, the ship\'s log. The last entry, in a steady hand: "Harbour light sighted, NW by W. Steering for it." Gullhaven\'s lighthouse is south-east of where she struck.';
}
/** The ship's bell on the foredeck (sq4). Only at low water; heavy, so you walk. */
export function takeBell(s: GameState): string {
  if (!flatsExposed(s)) return NEED_LOW;
  if (F(s, 'bellTaken')) return 'The bell\'s bracket is empty.';
  s.inventory.shipsbell = 1; set(s, 'bellTaken');
  return 'You work the pin out of the bracket and the bell drops into your arms like a drowned dog. Heavy. You will be walking back.';
}
export const carryingBell = (s: GameState) => s.inventory.shipsbell > 0;
/** The red lantern at the top of the Gull Tower. */
export function takeLantern(s: GameState): string {
  if (F(s, 'lanternFound')) return 'Only the iron hook where the lantern hung, and soot on the stones.';
  s.inventory.signallantern = 1; set(s, 'lanternFound');
  return 'On a hook facing the sea: a ship\'s lantern with red glass, the wick trimmed and the oil fresh. From out on the water, at night, this is the harbour light. The real one is three miles south-east.';
}
/** Collector Marrow's desk in the customs house: he sits at it by day. */
export const marrowAtDesk = (s: GameState) => { const h = hourOf(s.minutes); return h >= 7 && h < 19; };
export function takeLedger(s: GameState): string {
  if (F(s, 'ledgerFound')) return 'The desk drawer is empty but for sealing wax.';
  if (marrowAtDesk(s)) return 'Collector Marrow is at his desk, writing slowly in a small book he closes when you look at it. Come back when he has gone home (after 19:00).';
  s.inventory.customsledger = 1; set(s, 'ledgerFound'); G.addXp(s, 'ledger', 12);
  return 'Under the official ledger, a second one. Payments "from the Cove", in the week after every wreck for three years, and a key taped inside the back cover, tagged "store".';
}
/** The grille over the sea cave in Wreckers' Cove opens with the key from Marrow's ledger. */
export function caveBlock(s: GameState): string {
  if (F(s, 'caveEntered')) return '';
  if (!F(s, 'ledgerFound')) return 'A grille of old ship\'s timbers bars the cave mouth, chained and padlocked. Whoever uses this way in carries a key.';
  return '';
}
export function enterCave(s: GameState): boolean {
  if (caveBlock(s)) return false;
  if (!F(s, 'caveEntered')) { set(s, 'caveEntered'); G.log(s, 'The key from Marrow\'s ledger turns. Beyond the grille the cave goes back into the cliff, and something deep inside it clicks, like a great many knives.', 'warn'); }
  return true;
}

// ---------------- the Wreck-Mother ----------------
/** Damage multiplier for a hit on the Wreck-Mother. `angle` is between her facing and the direction to the shooter
 *  (0 = straight in front). Her front is shell; while she rears up her belly is open. */
export function motherArmour(angle: number, rearing: boolean): number {
  if (rearing) return 1.8;
  return Math.abs(angle) < Math.PI / 3 ? 0.3 : 1;
}
export const MOTHER_PHASE2 = 0.5, MOTHER_CALLS = [0.75, 0.35];
export function motherDown(s: GameState) {
  if (F(s, 'motherDown')) return;
  set(s, 'motherDown'); G.count(s, 'bossesDown'); G.addXp(s, 'vigor', 30);
  G.log(s, 'The Wreck-Mother sinks into the pool with a sound like a ship settling. The tide goes out of the grotto, and on the rocks where she lay you see the bones of boats.', 'good');
}
/** What becomes of Collector Marrow: 1 = arrest (the Watch), 2 = squeeze him, 3 = let him go. */
export function decideCollector(s: GameState, how: 1 | 2 | 3): boolean {
  if (F(s, 'collectorFate') || !F(s, 'motherDown') || s.inventory.customsledger <= 0) return false;
  set(s, 'collectorFate', how); s.inventory.customsledger = 0;
  if (how === 1) {
    G.rep(s, 'watch', 10, false); G.rep(s, 'tower', -10, false); G.rep(s, 'gullhaven', 10, false);
    G.log(s, 'Bree Calloway reads the ledger on the customs house steps, aloud, to everyone on the quay. Two of Renn\'s men take Marrow inland in irons. Nobody throws anything. Nearly nobody.', 'good');
  } else if (how === 2) {
    s.crowns += B.SQUEEZE; G.count(s, 'crownsEarned', B.SQUEEZE); G.rep(s, 'gullhaven', -15, false); G.rep(s, 'ashRoad', 4, false);
    G.log(s, `Marrow counts ${B.SQUEEZE} crowns onto the desk without looking at you, and you hand him back his book. He will still be collector tomorrow. +${B.SQUEEZE} crowns.`, 'warn');
  } else {
    G.rep(s, 'tower', 10, false); G.rep(s, 'gullhaven', -20, false);
    G.log(s, 'You put the ledger on his desk and leave. Marrow does not thank you. By evening the whole quay knows you were in there, and nobody knows why he is still free.', 'warn');
  }
  return true;
}

// ---------------- the keeper, the chapel ----------------
export function keeperOil(s: GameState): boolean {
  if (F(s, 'keeperOiled')) return false;
  if (s.inventory.oil < B.OIL_FOR_KEEPER) { G.log(s, `Keeper Trewin needs ${B.OIL_FOR_KEEPER} flasks of lamp oil. You have ${s.inventory.oil}.`, 'warn'); return false; }
  s.inventory.oil -= B.OIL_FOR_KEEPER; set(s, 'keeperOiled');
  G.log(s, 'Trewin pours the oil into the reservoir like a priest. "There. She\'ll burn till morning. Let them say she was dark now."', 'good');
  return true;
}
/** Sister Elowen's blessing at the sea chapel: once a day. */
export function blessing(s: GameState): boolean {
  const d = G.day(s);
  if (F(s, 'blessedDay') === d) { G.log(s, 'Sister Elowen smiles. "Once a day is plenty. The sea does not need reminding."', 'info'); return false; }
  set(s, 'blessedDay', d); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - B.BLESSING_STRESS);
  G.log(s, 'Sister Elowen touches salt water to your forehead and says the fishermen\'s blessing. For a moment the noise in your head goes out like a tide.', 'good');
  return true;
}

/** The smugglers' store in the Sea Cave. */
export const CAVE_LOOT: Record<string, { items: Partial<Record<B.ItemId, number>>; crowns: number; text: string }> = {
  cave_crate_1: { items: { saltfish: 2, oil: 2, ammo: 3 }, crowns: 25, text: 'Crates stencilled MERRY WREN, GULLHAVEN, broken open: salt fish, lamp oil, cartridges. Her own cargo.' },
  cave_crate_2: { items: { draught: 1, carbineammo: 3, bandage: 2 }, crowns: 80, text: 'The Merry Wren\'s strongbox, forced. The smugglers left the coins in it: they knew nobody would ever come down here.' },
};
