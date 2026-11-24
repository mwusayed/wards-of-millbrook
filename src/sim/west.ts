// v0.8: rules for the Westmarch (docs/gdd/westmarch.md): the West Gate, Master Vane's barrow-key, Gammer
// Thrush's rowan ward, the barrow door and its braziers, King Orm's shroud, grave-chill, and what walks the
// Downs at night depending on what became of the crown. Pure TypeScript like the rest of src/sim.
import * as B from './balance';
import * as G from './state';
import type { GameState } from './state';

const F = (s: GameState, k: string) => s.story.flags[k] ?? 0;
const set = (s: GameState, k: string, v = 1) => { s.story.flags[k] = v; };

/** Unbar the West Gate with Renn's key. Once open it stays open. */
export function openWestGate(s: GameState): boolean {
  if (F(s, 'westGateOpen')) return false;
  if (s.inventory.westkey <= 0) { G.log(s, 'The bar is chained and padlocked. Captain Renn keeps the key.', 'warn'); return false; }
  set(s, 'westGateOpen'); G.count(s, 'gatesOpened');
  s.boardDay = 0; G.refreshBoard(s);                     // Fernhollow's notices appear at once
  G.log(s, 'The padlock gives with a shriek of rust. You lift the bar and put your shoulder to the gate; it groans open on nine years of weeds. West: heath, a road, and a long way off, the glint of a lake.', 'good');
  return true;
}

/** Master Vane's barrow-key: 1 = buy it, 2 = talk him round (Tower standing or the audit), 3 = lean on him. */
export function vaneCanPersuade(s: GameState): boolean { return s.factions.tower >= 0 || F(s, 'audit') > 0; }
export function vaneKey(s: GameState, how: 1 | 2 | 3): boolean {
  if (s.inventory.barrowkey > 0 || F(s, 'keyFrom') > 0) return false;
  if (how === 1) {
    if (s.crowns < B.VANE_KEY_PRICE) { G.log(s, `Vane names his price: ${B.VANE_KEY_PRICE} crowns. You do not have it.`, 'warn'); return false; }
    s.crowns -= B.VANE_KEY_PRICE; G.rep(s, 'tower', 2, false);
    G.log(s, `Vane counts the coins twice and hands over the key with a little bow. "A loan. To the cause of scholarship." −${B.VANE_KEY_PRICE} crowns.`, 'info');
  }
  if (how === 2) {
    if (!vaneCanPersuade(s)) return false;
    G.rep(s, 'tower', -2, false); G.rep(s, 'fernhollow', 3, false); G.addXp(s, 'ledger', 12);
    G.log(s, 'You explain, slowly, how a letter about a Tower scholar robbing graves would read in Millbrook. Vane goes pale and finds the key in his second pocket.', 'good');
  }
  if (how === 3) {
    G.rep(s, 'tower', -8, false); G.rep(s, 'fernhollow', 4, false); set(s, 'vaneScared');
    G.log(s, 'You do not raise your voice. You do not have to. Vane puts the key on the table and steps back from it.', 'warn');
  }
  s.inventory.barrowkey = 1; set(s, 'keyFrom', how); return true;
}

/** Gammer Thrush binds a rowan ward from three sprigs of heather (and gives you a rowan charm the first time). */
export function thrushWard(s: GameState): boolean {
  if (s.inventory.rowanward > 0 || F(s, 'wardMade')) return false;
  if (s.inventory.heather < B.WARD_HEATHER) { G.log(s, `Gammer Thrush wants ${B.WARD_HEATHER} sprigs of heather from the heath. You have ${s.inventory.heather}.`, 'warn'); return false; }
  s.inventory.heather -= B.WARD_HEATHER; s.inventory.rowanward = 1; s.inventory.charmRowan++; set(s, 'wardMade');
  G.log(s, 'Gammer Thrush binds rowan, heather and red thread while she mutters at you about boots. She gives you the ward, and a second sprig "for your own neck, idiot".', 'good');
  return true;
}

/** What stops you going into King Orm's barrow, if anything. */
export function barrowBlock(s: GameState): string {
  if (s.inventory.barrowkey <= 0 && !F(s, 'barrowEntered')) return 'A slab of stone with a bronze lock shaped like a hand. Cadoc said Master Vane took the key.';
  if (s.inventory.rowanward <= 0 && !F(s, 'barrowEntered')) return 'The key turns, but cold pours out of the dark like water and pushes you back. Cadoc said not without a ward: Gammer Thrush makes them.';
  return '';
}
export function enterBarrow(s: GameState): boolean {
  if (barrowBlock(s)) return false;
  if (!F(s, 'barrowEntered')) { set(s, 'barrowEntered'); s.inventory.rowanward = 0; G.log(s, 'You wedge the rowan ward into the doorframe. The cold stops pushing. Below, in the dark, something very old turns over in its sleep.', 'warn'); }
  return true;
}

/** The three braziers in the Hall of Kings: light all three and the inner slab sinks. Returns true when that happens. */
export function lightHallBrazier(s: GameState, i: 1 | 2 | 3): boolean {
  if (F(s, 'hallBrazier' + i)) return false;
  set(s, 'hallBrazier' + i);
  if (F(s, 'hallBrazier1') && F(s, 'hallBrazier2') && F(s, 'hallBrazier3') && !F(s, 'hallLit')) { set(s, 'hallLit'); return true; }
  return false;
}
export const hallLitCount = (s: GameState) => [1, 2, 3].filter(i => F(s, 'hallBrazier' + i)).length;

/** King Orm takes less damage the fewer braziers are lit (phase 2). 4 lit = full damage. */
export function ormShroud(lit: number): number { return 0.35 + 0.1625 * Math.max(0, Math.min(4, lit)); }
export const ORM_FIRE_MULT = 1.25, ORM_SNUFF_EVERY = 26;

/** Wight and grave-light hits: the cold gets into you. */
export function graveChill(s: GameState): boolean {
  if (G.buffActive(s, 'grounded')) return false;
  s.stamina = Math.max(0, s.stamina - B.GRAVE_CHILL.stamina);
  s.needs.comfort = G.clampNeedPublic('comfort', s.needs.comfort - B.GRAVE_CHILL.comfort);
  return true;
}

/** What walks at night: the Downs and the reed marsh, by what became of the crown. */
export function nightSpawns(s: GameState): { wights: number; wisps: number; drowned: number } {
  const fate = F(s, 'crownFate');
  if (fate === 1) return { wights: 0, wisps: 1, drowned: 0 };
  if (fate === 3) return { wights: 1, wisps: 2, drowned: 2 };
  return { wights: 2, wisps: 3, drowned: 2 };
}
export const isNightHour = (h: number) => h >= 20 || h < 5;

/** The barrow's grave goods. */
export const BARROW_LOOT: Record<string, { items: Partial<Record<B.ItemId, number>>; crowns: number; text: string }> = {
  barrow_crate_1: { items: { barrowgold: 2, bandage: 1 }, crowns: 0, text: 'Grave goods in a niche: two brooches green with age, and a strip of linen you decide not to think about.' },
  barrow_crate_2: { items: { barrowgold: 4, draught: 1, ammo: 2 }, crowns: 60, text: 'King Orm\'s hoard: a heap of coins no one has spent in a thousand years, gold wire, and, oddly, two boxes of rounds and a draught. Vane was here before you, once, and ran.' },
};
