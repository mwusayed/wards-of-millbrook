// All tuning numbers in one place. Donor noted on each block.

// ---- Time (MM: 1 real second = 1 game minute) ----
export const GAME_MINUTES_PER_REAL_SECOND = 1;
export const START_HOUR = 7;
export const WEEK_DAYS = 7;

// ---- Needs (MM v07 balance.ts, same units) ----
export type NeedKey = 'calories' | 'hydration' | 'bladder' | 'bowel' | 'hygiene' | 'comfort' | 'fatigue' | 'stress';
export const NEED_KEYS: NeedKey[] = ['calories', 'hydration', 'bladder', 'bowel', 'hygiene', 'comfort', 'fatigue', 'stress'];

export const NEED_INFO: Record<NeedKey, { max: number; unit: string; label: string; bad: 'low' | 'high' }> = {
  calories: { max: 3000, unit: 'kcal', label: 'Food', bad: 'low' },
  hydration: { max: 3000, unit: 'ml', label: 'Water', bad: 'low' },
  bladder: { max: 500, unit: 'ml', label: 'Bladder', bad: 'high' },
  bowel: { max: 400, unit: 'ml', label: 'Bowel', bad: 'high' },
  hygiene: { max: 100, unit: '%', label: 'Hygiene', bad: 'low' },
  comfort: { max: 100, unit: '%', label: 'Comfort', bad: 'low' },
  fatigue: { max: 100, unit: 'pt', label: 'Fatigue', bad: 'high' },
  stress: { max: 100, unit: 'pt', label: 'Stress', bad: 'high' },
};

export type Needs = Record<NeedKey, number>;
export const START_NEEDS: Needs = { calories: 2200, hydration: 2200, bladder: 120, bowel: 80, hygiene: 70, comfort: 60, fatigue: 15, stress: 20 };

/** Change per game hour. Signs follow the direction the value moves. */
export const DECAY_PER_HOUR: Record<'rest' | 'active' | 'exert' | 'sleep', Needs> = {
  rest: { calories: -100, hydration: -100, bladder: 50, bowel: 30, hygiene: -2, comfort: -1, fatigue: 6, stress: 1 },
  active: { calories: -140, hydration: -150, bladder: 50, bowel: 30, hygiene: -3, comfort: -2, fatigue: 10, stress: 2 },
  // MM "job" rate: combat and sprinting
  exert: { calories: -300, hydration: -300, bladder: 50, bowel: 30, hygiene: -5, comfort: -2, fatigue: 15, stress: 5 },
  // VEILWORK: sleep consumes at 0.35× waking rate; fatigue and stress recover
  sleep: { calories: -35, hydration: -35, bladder: 18, bowel: 10, hygiene: -1, comfort: 0, fatigue: -11.25, stress: -1.25 },
};

/** Thresholds (MM THRESHOLDS). */
export const T = {
  bladderUrge: 300, bladderAccident: 450,
  bowelUrge: 220, bowelAccident: 360,
  starving: 500, famished: 200,
  dehydrated: 375,
  filthy: 25, hygieneLow: 40,
  exhausted: 70, collapseFatigue: 98,
  paranoid: 80,
  comfortLow: 20,
};

export type Band = 'optimal' | 'strained' | 'critical';
/** VEILWORK-style bands, expressed per need in its own units. */
export function needBand(k: NeedKey, v: number): Band {
  switch (k) {
    case 'calories': return v < T.starving ? 'critical' : v < 1200 ? 'strained' : 'optimal';
    case 'hydration': return v < T.dehydrated ? 'critical' : v < 1100 ? 'strained' : 'optimal';
    case 'bladder': return v > T.bladderAccident - 50 ? 'critical' : v > T.bladderUrge ? 'strained' : 'optimal';
    case 'bowel': return v > T.bowelAccident - 40 ? 'critical' : v > T.bowelUrge ? 'strained' : 'optimal';
    case 'hygiene': return v < T.filthy ? 'critical' : v < T.hygieneLow ? 'strained' : 'optimal';
    case 'comfort': return v < T.comfortLow ? 'critical' : v < 45 ? 'strained' : 'optimal';
    case 'fatigue': return v > 85 ? 'critical' : v > 60 ? 'strained' : 'optimal';
    case 'stress': return v > T.paranoid ? 'critical' : v > 55 ? 'strained' : 'optimal';
  }
}

// ---- Checks (MM computeCheckSuccess, worst single need penalty) ----
export type CheckType = 'combat' | 'physical' | 'social' | 'focus';
export const NEED_MODIFIERS: { applies: (n: Needs) => boolean; checks: CheckType[]; penalty: number; reason: string }[] = [
  { applies: n => n.calories < T.famished, checks: ['combat', 'physical', 'social', 'focus'], penalty: 60, reason: 'Famished: your body is shutting down.' },
  { applies: n => n.hydration < T.dehydrated, checks: ['combat', 'physical', 'social', 'focus'], penalty: 40, reason: 'Dehydrated: hands tremble.' },
  { applies: n => n.calories < T.starving, checks: ['combat', 'physical'], penalty: 30, reason: 'Starving: arms shake.' },
  { applies: n => n.hygiene < T.filthy, checks: ['social'], penalty: 50, reason: 'Filthy: nobody takes you seriously.' },
  { applies: n => n.bladder > 375, checks: ['physical', 'combat', 'focus'], penalty: 20, reason: 'Bladder bursting: hard to think.' },
  { applies: n => n.fatigue > T.exhausted, checks: ['combat', 'focus'], penalty: 35, reason: 'Exhausted: reactions slowed.' },
  { applies: n => n.stress > T.paranoid, checks: ['social', 'focus'], penalty: 45, reason: 'Paranoid: you can\'t think straight.' },
];
export function checkChance(n: Needs, check: CheckType, bonus = 0): { chance: number; reason: string | null } {
  let worst = 0, reason: string | null = null;
  for (const m of NEED_MODIFIERS) if (m.applies(n) && m.checks.includes(check) && m.penalty > worst) { worst = m.penalty; reason = m.reason; }
  return { chance: Math.max(5, Math.min(100, 75 - worst + bonus)), reason };
}
/** Combat accuracy multiplier on weapon spread: 1 at full health, up to 2.2 when wrecked. */
export function spreadMultiplier(n: Needs): number {
  return 1 + (75 - checkChance(n, 'combat').chance) / 50;
}

// ---- Mana (Tower & Sands literal formulas, base scaled for a shooter) ----
export const MANA_BASE_MAX = 40;
export const MANA_BASE_REGEN = 2.5; // per real second
export function manaMax(n: Needs): number { return MANA_BASE_MAX * (1 + 2 * (n.calories / NEED_INFO.calories.max)); }
export function manaRegen(n: Needs): number { return MANA_BASE_REGEN * manaRegenFactor(n.hydration); }

// ---- Stamina (VEILWORK hysteresis) ----
export const STAMINA_MAX = 100;
export const STAMINA_DRAIN = 22;     // per second sprinting
export const STAMINA_REGEN = 16;     // per second
export const STAMINA_RESUME = 25;    // after exhausting to 0, sprint locked until this
export function staminaRegenMult(n: Needs): number {
  let m = 1;
  if (n.fatigue > T.exhausted) m *= 0.5;
  if (n.calories < T.starving) m *= 0.6;
  if (n.hydration < T.dehydrated) m *= 0.7;
  return m;
}

// ---- Health and wounds (Dust & Debt: wound separate from HP; LW threshold 15) ----
export const HP_MAX = 100;
export const WOUND_HIT_THRESHOLD = 15;
export const HP_REGEN_PER_MIN = 0.25; // out of combat, game minutes

// ---- Money (MM debt 300, weekly cadence; LW creditor Aldric Voss) ----
export const START_CROWNS = 40;
export const START_DEBT = 300;
export const INSTALMENT = 60;
export const MISSED_INSTALMENT_PENALTY = 15;
export const MISSES_TO_GAMEOVER = 2;
export const COLLAPSE_FEE = 12;

export const SHOP: { id: ItemId; price: number }[] = [
  { id: 'bread', price: 4 }, { id: 'ration', price: 7 }, { id: 'soap', price: 3 },
  { id: 'bandage', price: 9 }, { id: 'medkit', price: 26 }, { id: 'ammo', price: 6 }, { id: 'tonic', price: 12 },
  { id: 'flour', price: 3 }, { id: 'onion', price: 2 }, { id: 'saltfish', price: 6 }, { id: 'honey', price: 5 }, { id: 'herbs', price: 3 },
];

export type ItemId = 'bread' | 'ration' | 'soap' | 'bandage' | 'medkit' | 'ammo' | 'tonic'
  | 'flour' | 'onion' | 'saltfish' | 'honey' | 'herbs'
  | 'stew' | 'tea' | 'honeycake' | 'fishsupper' | 'ember'
  | 'pelt' | 'tags' | 'dust' | 'cinder' | 'moonpetal' | 'draught' | 'manadraught' | 'oil' | 'book' | 'censer' | 'lure' | 'auditfile' | 'ring'
  // v0.7: the Eastern Reach
  | 'eggs' | 'milk' | 'apple' | 'cheese' | 'smokedfish' | 'eelpie' | 'mushrooms' | 'berries' | 'boarmeat' | 'trout' | 'eel'
  | 'mushroomstew' | 'roastboar' | 'grilledtrout' | 'omelette' | 'berrytart'
  | 'salve' | 'salts' | 'carbineammo' | 'wolfpelt' | 'tusk' | 'copper' | 'wardcopper'
  | 'charmHare' | 'charmIron' | 'charmOwl' | 'charmCopper' | 'charmSalt' | 'charmClover'
  | 'rod' | 'pickaxe' | 'dispatch' | 'journal' | 'liftkey' | 'wardcore' | 'ledgerpage'
  // v0.8: the Westmarch
  | 'perch' | 'pike' | 'heather' | 'bilberries' | 'friedperch' | 'pikepie' | 'bilberrycake' | 'heathertea'
  | 'charmRowan' | 'charmHag' | 'charmOrm' | 'barrowgold'
  | 'westkey' | 'barrowkey' | 'rowanward' | 'ormcrown' | 'reedring'
  // v0.9: the Saltway Coast
  | 'mussels' | 'samphire' | 'crabmeat' | 'mackerel' | 'musselbroth' | 'crabcakes' | 'samphiresalad' | 'grilledmackerel'
  | 'charmShell' | 'blastcharge' | 'wrenlog' | 'signallantern' | 'customsledger' | 'shipsbell'
  // v0.9: arms
  | 'shells' | 'riflerounds' | 'silverammo';
export const ITEM_IDS: ItemId[] = ['bread', 'ration', 'soap', 'bandage', 'medkit', 'ammo', 'tonic', 'flour', 'onion', 'saltfish', 'honey', 'herbs', 'stew', 'tea', 'honeycake', 'fishsupper', 'ember',
  'pelt', 'tags', 'dust', 'cinder', 'moonpetal', 'draught', 'manadraught', 'oil', 'book', 'censer', 'lure', 'auditfile', 'ring',
  'eggs', 'milk', 'apple', 'cheese', 'smokedfish', 'eelpie', 'mushrooms', 'berries', 'boarmeat', 'trout', 'eel',
  'mushroomstew', 'roastboar', 'grilledtrout', 'omelette', 'berrytart',
  'salve', 'salts', 'carbineammo', 'wolfpelt', 'tusk', 'copper', 'wardcopper',
  'charmHare', 'charmIron', 'charmOwl', 'charmCopper', 'charmSalt', 'charmClover',
  'rod', 'pickaxe', 'dispatch', 'journal', 'liftkey', 'wardcore', 'ledgerpage',
  'perch', 'pike', 'heather', 'bilberries', 'friedperch', 'pikepie', 'bilberrycake', 'heathertea',
  'charmRowan', 'charmHag', 'charmOrm', 'barrowgold',
  'westkey', 'barrowkey', 'rowanward', 'ormcrown', 'reedring',
  'mussels', 'samphire', 'crabmeat', 'mackerel', 'musselbroth', 'crabcakes', 'samphiresalad', 'grilledmackerel',
  'charmShell', 'blastcharge', 'wrenlog', 'signallantern', 'customsledger', 'shipsbell', 'shells', 'riflerounds', 'silverammo'];
export type ItemKind = 'food' | 'meal' | 'med' | 'ammo' | 'ingredient' | 'misc' | 'quest' | 'loot' | 'charm' | 'tool';
export const ITEMS: Record<ItemId, { name: string; desc: string; weight: number; kind: ItemKind }> = {
  pelt: { name: 'Hound pelt', desc: 'Coarse grey hide. Sera buys them; Dorran pads coats with them.', weight: 0.9, kind: 'loot' },
  tags: { name: 'Raider tags', desc: 'Iron tokens raiders wear. Sergeant Vole pays a bounty for each.', weight: 0.05, kind: 'loot' },
  dust: { name: 'Shade dust', desc: 'Cold grey powder left by a shade. Maren steeps it into mana draughts.', weight: 0.05, kind: 'loot' },
  cinder: { name: 'Cinder essence', desc: 'A coal that never cools, from the Sunken Chapel. Worth good coin.', weight: 0.2, kind: 'loot' },
  moonpetal: { name: 'Moonpetal', desc: 'Pale flower that only opens in the Vale at night. Maren needs it for medicine.', weight: 0.05, kind: 'ingredient' },
  draught: { name: 'Healing draught', desc: 'Restores 35 health at once. Does not close wounds.', weight: 0.3, kind: 'med' },
  manadraught: { name: 'Mana draught', desc: 'Restores 40 mana without drawing on your water.', weight: 0.3, kind: 'med' },
  oil: { name: 'Gun oil and rag', desc: 'Cleans the revolver back to full condition. Ten minutes.', weight: 0.2, kind: 'misc' },
  book: { name: "Aunt Ysolde's notebook", desc: 'Half spell notes, half household accounts. Read it in your chair by the fire.', weight: 0.4, kind: 'misc' },
  censer: { name: "Acolyte's Censer", desc: 'The ward-stone of the Sunken Chapel, still warm with someone else\'s prayer.', weight: 0.8, kind: 'quest' },
  lure: { name: "Fenn's lucky lure", desc: 'A brass spinner on a frayed line. Fenn Marlow swears by it.', weight: 0.05, kind: 'quest' },
  auditfile: { name: 'Audit findings', desc: 'Your working papers on the Voss debt book. Numbers do not forget.', weight: 0.2, kind: 'quest' },
  ring: { name: "Widow Cael's ring", desc: 'A plain band, worn thin. Lost at the Whisper Stones.', weight: 0.01, kind: 'quest' },
  bread: { name: 'Loaf of bread', desc: '+700 kcal. Bram bakes them before dawn.', weight: 0.4, kind: 'food' },
  ration: { name: 'Iron ration', desc: 'Plain food that keeps: +900 kcal eaten cold. A base for stew.', weight: 0.6, kind: 'food' },
  soap: { name: 'Tallow soap', desc: 'Makes a wash or shower count for much more.', weight: 0.1, kind: 'misc' },
  bandage: { name: 'Linen bandage', desc: 'Binds one wound. Slow, but it holds.', weight: 0.1, kind: 'med' },
  medkit: { name: "Physician's kit", desc: 'Stitches the worst wound and restores 15 health. Takes half an hour.', weight: 0.8, kind: 'med' },
  ammo: { name: 'Revolver rounds ×6', desc: 'Brass cartridges for your six-shooter.', weight: 0.2, kind: 'ammo' },
  tonic: { name: 'Calming tonic', desc: '-30 stress. Tastes of mint and regret.', weight: 0.2, kind: 'med' },
  flour: { name: 'Sack of flour', desc: 'Ingredient: honey cakes.', weight: 0.8, kind: 'ingredient' },
  onion: { name: 'Onions', desc: "Ingredient: hunter's stew.", weight: 0.3, kind: 'ingredient' },
  saltfish: { name: 'Salt fish', desc: 'Ingredient: fish supper.', weight: 0.5, kind: 'ingredient' },
  honey: { name: 'Jar of honey', desc: 'Ingredient: honey cakes.', weight: 0.4, kind: 'ingredient' },
  herbs: { name: 'Vale herbs', desc: 'Ingredient: herb tea. Yara swears by them.', weight: 0.1, kind: 'ingredient' },
  stew: { name: "Hunter's stew", desc: '+1100 kcal, +20 comfort. Hearty: stamina recovers 30% faster for 4 hours.', weight: 0.9, kind: 'meal' },
  tea: { name: 'Herb tea', desc: '+500 ml water. Clear head: mana refills 30% faster for 3 hours (still costs water).', weight: 0.5, kind: 'meal' },
  honeycake: { name: 'Honey cakes', desc: '+900 kcal. Sweet tooth: spells burn 25% fewer calories for 3 hours.', weight: 0.4, kind: 'meal' },
  fishsupper: { name: 'Fish supper', desc: '+1000 kcal. Warm belly: fatigue builds 30% slower for 6 hours.', weight: 0.7, kind: 'meal' },
  ember: { name: "Patriarch's Ember", desc: 'A warm shard of an old ward-stone. Aldric Voss would want this.', weight: 0.5, kind: 'quest' },
  // ---- v0.7: the Eastern Reach ----
  eggs: { name: 'Half a dozen eggs', desc: '+350 kcal raw, if you must. Ingredient: omelette.', weight: 0.4, kind: 'food' },
  milk: { name: 'Jug of milk', desc: '+400 ml water and +250 kcal. Hobb\'s cows are honest cows.', weight: 1.0, kind: 'food' },
  apple: { name: 'Brookfield apple', desc: '+120 kcal, +80 ml water. Light enough to carry a dozen.', weight: 0.15, kind: 'food' },
  cheese: { name: 'Wheel of hard cheese', desc: '+800 kcal. Keeps for weeks.', weight: 0.6, kind: 'food' },
  smokedfish: { name: 'Smoked river fish', desc: '+750 kcal. Oskar smokes them over alder at the Ashford docks.', weight: 0.4, kind: 'food' },
  eelpie: { name: 'Eel pie', desc: '+1200 kcal, +15 comfort. The Drowned Lantern\'s pride. Hearty: stamina recovers 30% faster.', weight: 0.7, kind: 'meal' },
  mushrooms: { name: 'Thornwood blewits', desc: 'Lilac-footed mushrooms from the forest floor. Ingredient: mushroom stew, omelette.', weight: 0.15, kind: 'ingredient' },
  berries: { name: 'Thornberries', desc: '+120 kcal, +60 ml water. Ingredient: berry tart.', weight: 0.1, kind: 'food' },
  boarmeat: { name: 'Boar haunch', desc: 'Ingredient: roast boar. Ilse buys it too.', weight: 1.4, kind: 'ingredient' },
  trout: { name: 'River trout', desc: 'Caught in the Wend. Ingredient: grilled trout. Oskar pays well for them.', weight: 0.5, kind: 'ingredient' },
  eel: { name: 'Wend eel', desc: 'A long grey thing that bites. Oskar pays well for them.', weight: 0.6, kind: 'loot' },
  mushroomstew: { name: 'Mushroom stew', desc: '+900 kcal, +300 ml water. Forager: gathering, fishing and mining give one more for 4 hours.', weight: 0.8, kind: 'meal' },
  roastboar: { name: 'Roast boar', desc: '+1400 kcal, +20 comfort. Stout: take 10% less damage for 5 hours.', weight: 1.0, kind: 'meal' },
  grilledtrout: { name: 'Grilled trout', desc: '+750 kcal. Keen eye: shots spread 20% less for 4 hours.', weight: 0.4, kind: 'meal' },
  omelette: { name: 'Mushroom omelette', desc: '+800 kcal. Hearty: stamina recovers 30% faster for 4 hours.', weight: 0.4, kind: 'meal' },
  berrytart: { name: 'Thornberry tart', desc: '+700 kcal. Fleet: sprinting tires you 25% less for 3 hours.', weight: 0.4, kind: 'meal' },
  salve: { name: 'Comfrey salve', desc: 'Restores 20 health and soothes: -10 stress. Mother Ilse\'s recipe.', weight: 0.15, kind: 'med' },
  salts: { name: 'Smelling salts', desc: '-25 fatigue at once. Not a substitute for sleep, says the label.', weight: 0.05, kind: 'med' },
  carbineammo: { name: 'Carbine rounds ×8', desc: 'Long brass for the lever carbine.', weight: 0.35, kind: 'ammo' },
  wolfpelt: { name: 'Wolf pelt', desc: 'Thick grey winter fur. Worth more than a hound\'s.', weight: 1.0, kind: 'loot' },
  tusk: { name: 'Boar tusk', desc: 'Yellow ivory. Tamsin Reed carves charms from them.', weight: 0.2, kind: 'loot' },
  copper: { name: 'Copper ore', desc: 'Green-veined rock from the Hollow. Corwin and Dorran both buy it.', weight: 1.2, kind: 'loot' },
  wardcopper: { name: 'Ward-copper', desc: 'Copper that hums. The old wardwrights cut stones from seams like this.', weight: 0.5, kind: 'loot' },
  charmHare: { name: 'Hare\'s-foot charm', desc: 'Worn: you move 6% faster.', weight: 0.05, kind: 'charm' },
  charmIron: { name: 'Iron-nail charm', desc: 'Worn: shades, the drowned and the hollowed hit you 15% softer.', weight: 0.05, kind: 'charm' },
  charmOwl: { name: 'Owl-feather charm', desc: 'Worn: mana refills 20% faster between dusk and dawn.', weight: 0.05, kind: 'charm' },
  charmCopper: { name: 'Copper coil charm', desc: 'Worn: Spark costs 25% less mana and jumps one more time.', weight: 0.05, kind: 'charm' },
  charmSalt: { name: 'Salt locket', desc: 'Worn: wounds are 30% less likely, and you shrug off the cold of wet clothes.', weight: 0.05, kind: 'charm' },
  charmClover: { name: 'Four-leaf clover in resin', desc: 'Worn: enemies drop something 15% more often, and a bite on your line lasts a little longer.', weight: 0.05, kind: 'charm' },
  rod: { name: 'Fishing rod', desc: 'For the Wend and the reed pond. Look for still water by a jetty.', weight: 0.8, kind: 'tool' },
  pickaxe: { name: 'Miner\'s pick', desc: 'For copper seams. Swing it at green-streaked rock.', weight: 2.0, kind: 'tool' },
  dispatch: { name: 'Sealed dispatch', desc: 'The Watch\'s report for the Reeve of Ashford. Sergeant Vole\'s seal.', weight: 0.05, kind: 'quest' },
  journal: { name: 'Foreman Brask\'s journal', desc: 'Water-stained. The last pages are written very small.', weight: 0.3, kind: 'quest' },
  liftkey: { name: 'Lift-house key', desc: 'Iron key on a copper ring. Opens the winding house at Copper Hollow.', weight: 0.1, kind: 'quest' },
  wardcore: { name: 'Engine heart', desc: 'The rune-core of the Warden Engine. Still warm. Three people in Ashford want it.', weight: 1.5, kind: 'quest' },
  ledgerpage: { name: 'Torn ledger page', desc: 'Ash Road shipments, in code. Brannic or the Reeve could read it.', weight: 0.02, kind: 'quest' },
  // v0.8: the Westmarch
  perch: { name: 'Lake perch', desc: 'Striped and spiny. Fry it, or sell it to Ebba Rook.', weight: 0.4, kind: 'ingredient' },
  pike: { name: 'Hallow pike', desc: 'A long green ambush of a fish, all teeth. Pike pie, or Old Osric\'s envy.', weight: 1.6, kind: 'ingredient' },
  heather: { name: 'Heather sprigs', desc: 'Purple heath heather. Steeped, it settles the blood; bound with rowan, it wards a door.', weight: 0.1, kind: 'ingredient' },
  bilberries: { name: 'Bilberries', desc: '+120 kcal raw. Small, dark and sweet; they stain everything.', weight: 0.2, kind: 'food' },
  friedperch: { name: 'Fried perch', desc: '+700 kcal. Fleet: sprinting tires you 25% less for 3 hours.', weight: 0.35, kind: 'meal' },
  pikepie: { name: 'Pike pie', desc: '+1300 kcal. Stout: take 10% less damage for 5 hours.', weight: 0.6, kind: 'meal' },
  bilberrycake: { name: 'Bilberry cake', desc: '+750 kcal. Night eyes: the dark is less dark for 5 hours.', weight: 0.35, kind: 'meal' },
  heathertea: { name: 'Heather tea', desc: '+400 ml. Grounded: grave-chill cannot touch you for 4 hours.', weight: 0.3, kind: 'meal' },
  charmRowan: { name: 'Rowan-sprig charm', desc: 'Worn: barrow wights and grave-lights hit you 20% softer.', weight: 0.05, kind: 'charm' },
  charmHag: { name: 'Hag stone', desc: 'Worn: a stone with a hole worn through it. Stress builds 30% slower between dusk and dawn.', weight: 0.1, kind: 'charm' },
  charmOrm: { name: 'Orm\'s circlet', desc: 'Worn: every weapon does 20% more damage between dusk and dawn, but stress builds 20% faster.', weight: 0.3, kind: 'charm' },
  barrowgold: { name: 'Barrow gold', desc: 'A brooch, a ring, a twist of wire, older than any kingdom. Vane pays best. Cadoc would rather you didn\'t.', weight: 0.1, kind: 'loot' },
  westkey: { name: 'West Gate key', desc: 'A long iron key with a tag in Renn\'s hand: "West. Do not."', weight: 0.2, kind: 'quest' },
  barrowkey: { name: 'Bronze barrow-key', desc: 'Green bronze, shaped like a hand with two fingers raised. It opens King Orm\'s door.', weight: 0.3, kind: 'quest' },
  rowanward: { name: 'Rowan ward', desc: 'Rowan and heather bound with red thread by Gammer Thrush. Set it in the barrow door as you go in.', weight: 0.1, kind: 'quest' },
  ormcrown: { name: 'The Crown of Orm', desc: 'Bronze and gold, cold as lake water. Cadoc wants it back on the bier; Vane wants it in a glass case.', weight: 1.0, kind: 'quest' },
  reedring: { name: 'Reed-and-silver ring', desc: 'Plaited reed with silver wire through it, found on the old causeway post.', weight: 0.02, kind: 'quest' },
  // v0.9: the Saltway Coast
  mussels: { name: 'Mussels', desc: 'Blue-black, from the beds on the tidal flats. Three make a broth.', weight: 0.3, kind: 'ingredient' },
  samphire: { name: 'Samphire', desc: '+60 kcal raw. Salty green sea-asparagus from the edge of the flats.', weight: 0.1, kind: 'food' },
  crabmeat: { name: 'Crab meat', desc: 'White meat from a shore crab\'s claws. Crab cakes, with a little flour.', weight: 0.3, kind: 'ingredient' },
  mackerel: { name: 'Mackerel', desc: 'Barred green and silver, off the end of the quay. Grill it.', weight: 0.5, kind: 'ingredient' },
  musselbroth: { name: 'Mussel broth', desc: '+500 kcal, +300 ml. Warm belly: fatigue builds 30% slower for 6 hours.', weight: 0.5, kind: 'meal' },
  crabcakes: { name: 'Crab cakes', desc: '+850 kcal. Sea legs: wading and the tide slow you half as much for 3 hours.', weight: 0.4, kind: 'meal' },
  samphiresalad: { name: 'Samphire salad', desc: '+250 kcal. Clear head: mana refills 30% faster for 3 hours.', weight: 0.2, kind: 'meal' },
  grilledmackerel: { name: 'Grilled mackerel', desc: '+650 kcal. Hearty: stamina recovers 30% faster for 4 hours.', weight: 0.4, kind: 'meal' },
  charmShell: { name: 'Shell charm', desc: 'Worn: a cowrie and a limpet on tarred string. Crabs, the drowned and the Wreck-Mother hit you 20% softer.', weight: 0.05, kind: 'charm' },
  blastcharge: { name: 'Blasting charge', desc: 'Powder in tarred canvas with a slow fuse. Dorran wrapped it twice and told you not to drop it.', weight: 1.2, kind: 'quest' },
  wrenlog: { name: 'The Merry Wren\'s log', desc: 'Swollen with sea water. The last entry: "Steering for the harbour light, NW by W." The lighthouse is south-east.', weight: 0.4, kind: 'quest' },
  signallantern: { name: 'Red signal lantern', desc: 'A ship\'s lantern with red glass, from the top of the Gull Tower. Seen from the sea at night, it looks like the harbour light.', weight: 0.8, kind: 'quest' },
  customsledger: { name: 'Collector Marrow\'s ledger', desc: 'A private ledger: a payment "from the Cove" in the week after every wreck for three years.', weight: 0.3, kind: 'quest' },
  shells: { name: 'Scattergun shells ×6', desc: 'Paper shells of buckshot for the Breaker scattergun. Eight pellets each.', weight: 0.4, kind: 'ammo' },
  riflerounds: { name: 'Long-rifle rounds ×5', desc: 'Heavy, slow, accurate. For the Spire long rifle.', weight: 0.35, kind: 'ammo' },
  silverammo: { name: 'Silvered cartridges ×6', desc: 'Revolver rounds with silver-washed heads: 60% harder on the dead (wights, grave-lights, shades, the hollowed). Chosen in your pack; they load first.', weight: 0.25, kind: 'ammo' },
  shipsbell: { name: 'The Merry Wren\'s bell', desc: 'Bronze, green with the sea, her name cast round the lip. Heavy enough that you walk, not run.', weight: 6, kind: 'quest' },
};
/** What the market pays for things you bring back (before standing). */
export const SELL: Partial<Record<ItemId, number>> = { shells: 4, riflerounds: 5, silverammo: 9, mussels: 1, samphire: 1, crabmeat: 3, mackerel: 3, musselbroth: 4, crabcakes: 6, samphiresalad: 3, grilledmackerel: 4, perch: 3, pike: 9, heather: 1, bilberries: 1, friedperch: 4, pikepie: 7, bilberrycake: 4, heathertea: 2, barrowgold: 12, eggs: 1, milk: 1, apple: 0, cheese: 3, smokedfish: 3, eelpie: 5, mushrooms: 2, berries: 1, boarmeat: 6, trout: 5, eel: 7, mushroomstew: 5, roastboar: 7, grilledtrout: 5, omelette: 4, berrytart: 4, salve: 5, salts: 3, carbineammo: 5, wolfpelt: 9, tusk: 10, copper: 6, wardcopper: 24, charmHare: 12, charmIron: 12, charmOwl: 12, charmCopper: 15, charmSalt: 12, charmClover: 15, rod: 4, pickaxe: 6, pelt: 5, dust: 8, cinder: 16, herbs: 1, moonpetal: 4, bread: 1, ration: 3, soap: 1, bandage: 4, medkit: 12, ammo: 3, tonic: 5, flour: 1, onion: 1, saltfish: 3, honey: 2, stew: 5, tea: 2, honeycake: 4, fishsupper: 5, draught: 6, manadraught: 5, oil: 2 };
export const TAG_BOUNTY = 6;
export const EMPTY_INV = (): Record<ItemId, number> => Object.fromEntries(ITEM_IDS.map(k => [k, 0])) as Record<ItemId, number>;

// ---- Carrying (pass 3) ----
export const CARRY_CAPACITY = 18;   // kg, not counting worn gear
export const GEAR_WEIGHT = 2.5;     // revolver, staff, coat
export const LOAD_HEAVY = 0.75;     // fraction of capacity: stamina recovers slower
export const LOAD_OVER = 1.0;       // can't sprint, slower walk
export const LOAD_CRUSHING = 1.3;   // much slower

// ---- Cooking and meal buffs (pass 3) ----
export type BuffId = 'hearty' | 'clearHead' | 'sweetTooth' | 'warmBelly' | 'forager' | 'stout' | 'keenEye' | 'fleet' | 'steamed' | 'nightEyes' | 'grounded' | 'seaLegs';
export const BUFFS: Record<BuffId, { name: string; desc: string; minutes: number }> = {
  hearty: { name: 'Hearty', desc: 'Stamina recovers 30% faster', minutes: 240 },
  clearHead: { name: 'Clear head', desc: 'Mana refills 30% faster (still costs water)', minutes: 180 },
  sweetTooth: { name: 'Sweet tooth', desc: 'Spells burn 25% fewer calories', minutes: 180 },
  warmBelly: { name: 'Warm belly', desc: 'Fatigue builds 30% slower', minutes: 360 },
  forager: { name: 'Forager', desc: 'Gathering, fishing and mining give one more', minutes: 240 },
  stout: { name: 'Stout', desc: 'Take 10% less damage', minutes: 300 },
  keenEye: { name: 'Keen eye', desc: 'Shots spread 20% less', minutes: 240 },
  fleet: { name: 'Fleet', desc: 'Sprinting tires you 25% less', minutes: 180 },
  steamed: { name: 'Steamed through', desc: 'Stress builds 30% slower (the bathhouse)', minutes: 360 },
  nightEyes: { name: 'Night eyes', desc: 'The dark is less dark: you see farther at night', minutes: 300 },
  grounded: { name: 'Grounded', desc: 'Grave-chill cannot touch you', minutes: 240 },
  seaLegs: { name: 'Sea legs', desc: 'Wading and the tide slow you half as much', minutes: 180 },
};
export const MAX_MEAL_BUFFS = 2;
export const RECIPES: { id: 'stew' | 'tea' | 'honeycake' | 'fishsupper' | 'mushroomstew' | 'roastboar' | 'grilledtrout' | 'omelette' | 'berrytart' | 'friedperch' | 'pikepie' | 'bilberrycake' | 'heathertea' | 'musselbroth' | 'crabcakes' | 'samphiresalad' | 'grilledmackerel'; needs: Partial<Record<ItemId, number>>; minutes: number }[] = [
  { id: 'friedperch', needs: { perch: 1 }, minutes: 15 },
  { id: 'pikepie', needs: { pike: 1, flour: 1 }, minutes: 40 },
  { id: 'bilberrycake', needs: { bilberries: 2, flour: 1 }, minutes: 25 },
  { id: 'heathertea', needs: { heather: 1 }, minutes: 10 },
  { id: 'musselbroth', needs: { mussels: 3 }, minutes: 20 },
  { id: 'crabcakes', needs: { crabmeat: 1, flour: 1 }, minutes: 25 },
  { id: 'samphiresalad', needs: { samphire: 2 }, minutes: 5 },
  { id: 'grilledmackerel', needs: { mackerel: 1 }, minutes: 15 },
  { id: 'mushroomstew', needs: { mushrooms: 2, onion: 1 }, minutes: 30 },
  { id: 'roastboar', needs: { boarmeat: 1 }, minutes: 45 },
  { id: 'grilledtrout', needs: { trout: 1 }, minutes: 15 },
  { id: 'omelette', needs: { eggs: 1, mushrooms: 1 }, minutes: 10 },
  { id: 'berrytart', needs: { berries: 2, flour: 1, honey: 1 }, minutes: 35 },
  { id: 'stew', needs: { ration: 1, onion: 1 }, minutes: 30 },
  { id: 'tea', needs: { herbs: 1 }, minutes: 10 },
  { id: 'honeycake', needs: { flour: 1, honey: 1 }, minutes: 25 },
  { id: 'fishsupper', needs: { saltfish: 1, bread: 1 }, minutes: 20 },
];

// ---- Magic economy (pass 3): spells burn calories, refilling mana drinks water ----
export type SpellId = 'firebolt' | 'frost' | 'ward' | 'heal' | 'spark';
export const SPELLS: Record<SpellId, { name: string; mana: number; kcal: number; cooldown: number; desc: string }> = {
  firebolt: { name: 'Firebolt', mana: 8, kcal: 25, cooldown: 0.55, desc: '22 damage and burning. Staggers shades.' },
  frost: { name: 'Frost Shard', mana: 10, kcal: 30, cooldown: 0.6, desc: '13 damage and slows for 3 s.' },
  ward: { name: 'Stone Ward', mana: 14, kcal: 45, cooldown: 1.0, desc: 'Absorbs the next 30 damage for 12 s.' },
  heal: { name: 'Mend', mana: 22, kcal: 70, cooldown: 6, desc: 'Restores 28 health over a breath. Does not close wounds.' },
  spark: { name: 'Spark', mana: 16, kcal: 50, cooldown: 1.3, desc: 'Lightning that jumps between up to three enemies for 18 each. Taught by Lira Voss.' },
};
export const HEAL_AMOUNT = 28;
export const HEAL_FATIGUE = 4;            // each mend tires you a little
export const HEAL_STARVING_MULT = 0.5;    // a starving body heals poorly
export const MANA_WATER_ML = 6;           // ml of water used per point of mana refilled
/** Regen speed by hydration: halted when severely dehydrated, slower when thirsty, up to 1.5× well-watered. */
export function manaRegenFactor(hydration: number): number {
  if (hydration < 200) return 0;
  if (hydration < T.dehydrated) return 0.25;
  if (hydration < 1100) return 0.6;
  return Math.min(1.5, 1 + (hydration - 1100) / 3800);
}


// ---- Ledger shift (HOT posting rules; LW Ledger Aide 13c/hr) ----
export const SAVINGS_INTEREST = 0.03; // per week
export const FACTION_DRIFT_AFTER_DAYS = 5;
export const UPGRADE_COST = { featherBed: 45 };  // kept for old code paths; see HOME_UP

export const SHIFT_ENTRIES = 5;
export const SHIFT_HOURS = 4;
export const PAY_PER_CORRECT = 11;
export const SHIFT_START_HOUR = 8;
export const SHIFT_LAST_START_HOUR = 15;
// LW bossAttentionDelta
export const ATTENTION_PER_ERROR = 5;
export const ATTENTION_FILTHY = 8;
export const ATTENTION_INJURED = 8;
export const ATTENTION_DECAY_PER_DAY = 2;
export const ATTENTION_REVIEW = 80;
export const ATTENTION_FIRED = 100;

// ---- Difficulty (MM standard / hardened, plus a gentler mode) ----
export type Difficulty = 'gentle' | 'standard' | 'harsh';
export const DIFFICULTY: Record<Difficulty, { name: string; desc: string; needs: number; dmg: number; fee: number }> = {
  gentle: { name: 'Gentle', desc: 'Hunger, thirst and tiredness build 25% slower; enemies hit 25% softer.', needs: 0.75, dmg: 0.75, fee: 6 },
  standard: { name: 'Standard', desc: 'The game as designed.', needs: 1, dmg: 1, fee: 12 },
  harsh: { name: 'Harsh', desc: 'Needs build 20% faster; enemies hit 25% harder; collapsing costs more.', needs: 1.2, dmg: 1.25, fee: 20 },
};

// ---- Gear and home improvements (pass 4) ----
export type GearId = 'rifled' | 'loader' | 'ironStaff' | 'coat' | 'satchel' | 'lantern' | 'carbine' | 'oilskin' | 'boots' | 'waders' | 'spyglass' | 'seaboots' | 'scattergun' | 'longrifle';
export const GEAR: Record<GearId, { name: string; desc: string; cost: number }> = {
  rifled: { name: 'Rifled barrel', desc: 'Revolver damage 30 → 38.', cost: 55 },
  loader: { name: 'Speed loader', desc: 'Reload in 1.1 seconds instead of 1.8.', cost: 35 },
  ironStaff: { name: 'Iron-shod staff', desc: 'Melee damage 16 → 26 and a harder shove.', cost: 30 },
  coat: { name: 'Pelt-lined coat', desc: 'Take 10% less damage, always. Dorran needs 3 hound pelts for it.', cost: 40 },
  satchel: { name: 'Second satchel', desc: 'Carry 6 kg more.', cost: 30 },
  lantern: { name: 'Hand lantern', desc: 'Light in dark places. Toggle with the lantern key.', cost: 15 },
  carbine: { name: 'Hale lever carbine', desc: 'Eight rounds, 46 damage, steady at range. Slower to work and to reload. Switch firearms from your pack.', cost: 150 },
  scattergun: { name: 'Breaker scattergun', desc: 'Two barrels of buckshot: eight pellets of 12 damage each. Devastating close, useless far. Shells ×6.', cost: 120 },
  longrifle: { name: 'Spire long rifle', desc: 'Five rounds, 88 damage, dead steady and very slow. For shooting what you would rather not meet. Long-rifle rounds ×5.', cost: 240 },
  oilskin: { name: 'Oilskin coat', desc: 'Rain runs off it: you never get soaked.', cost: 45 },
  boots: { name: 'Hobnailed boots', desc: 'Move 5% faster on any ground.', cost: 40 },
  waders: { name: 'Fen waders', desc: 'Waxed leather to the hip: wade the ford and the reed marsh at full speed.', cost: 35 },
  spyglass: { name: 'Brass spyglass', desc: 'See a foe\'s name and health at twice the distance; the map marks the next low tide.', cost: 70 },
  seaboots: { name: 'Sea boots', desc: 'Tarred to the thigh: wade the flats, the ford, the marsh and the flooded grotto at full speed.', cost: 40 },
};
/** v0.8: the Westmarch. Grave-chill (wight and grave-light hits), the crown's price, the barrow fight. */
export const GRAVE_CHILL = { stamina: 18, comfort: 3 };
export const CROWN_SALE = 200, VANE_KEY_PRICE = 60, WARD_HEATHER = 3;
/** v0.9: the Saltway Coast (docs/gdd/saltway.md §4). */
/** The coast is built but not yet wired into the game loop (v1.0): its quests stay closed until then. */
export const FEATURES = { coast: false };
export const CHARGE_PRICE = 25, SQUEEZE = 150, OIL_FOR_KEEPER = 2, MUSSELS_FOR_JOWAN = 6, SAMPHIRE_FOR_JOWAN = 4;
export const BLAST = { fuse: 8, near: 6, far: 12, dmgNear: 40, dmgFar: 15 };
export const TIDE_LOW = -0.5, WADE_MULT = 0.65, GULL_INN_COST = 5, BLESSING_STRESS = 15;
export const CARBINE_DAMAGE = 46, CARBINE_MAG = 8, CARBINE_RELOAD = 2.4, CARBINE_COOLDOWN = 0.72, CARBINE_AIM = 0.6;
/** v0.9 (docs/gdd/arms.md): every firearm. Damage is per pellet; spread is a multiplier on the base aim cone. */
export type FirearmId = 'revolver' | 'carbine' | 'scattergun' | 'longrifle';
export const FIREARM_IDS: FirearmId[] = ['revolver', 'carbine', 'scattergun', 'longrifle'];
export const GUNS: Record<FirearmId, { name: string; short: string; damage: number; pellets: number; mag: number; reload: number; cooldown: number; aim: number; range: number; ammo: ItemId; perBox: number; weight: number }> = {
  revolver: { name: 'Service revolver', short: 'Revolver', damage: 30, pellets: 1, mag: 6, reload: 1.8, cooldown: 0.4, aim: 1, range: 120, ammo: 'ammo', perBox: 6, weight: 1.1 },
  carbine: { name: 'Hale lever carbine', short: 'Carbine', damage: CARBINE_DAMAGE, pellets: 1, mag: CARBINE_MAG, reload: CARBINE_RELOAD, cooldown: CARBINE_COOLDOWN, aim: CARBINE_AIM, range: 120, ammo: 'carbineammo', perBox: 8, weight: 3.2 },
  scattergun: { name: 'Breaker scattergun', short: 'Scattergun', damage: 12, pellets: 8, mag: 2, reload: 2.2, cooldown: 0.85, aim: 3.5, range: 26, ammo: 'shells', perBox: 6, weight: 3.6 },
  longrifle: { name: 'Spire long rifle', short: 'Long rifle', damage: 88, pellets: 1, mag: 5, reload: 3.0, cooldown: 1.3, aim: 0.25, range: 160, ammo: 'riflerounds', perBox: 5, weight: 4.4 },
};
/** Silvered revolver rounds against the dead. */
export const SILVER_MULT = 1.6;
export const UNDEAD: string[] = ['wight', 'wisp', 'shade', 'hollow', 'drowned'];
/** Ashford services. */
export const BATH_COST = 4, INN_ROOM_COST = 3, COACH_COST = 6, COACH_MINUTES = 100;
/** What each trader in the Eastern Reach sells (base prices before standing). */
export const SHOPS: Record<'farm' | 'apothecary' | 'gunsmith' | 'fishmonger' | 'curio' | 'pedlar' | 'lodge' | 'smokehouse' | 'wisewoman' | 'smithyWest' | 'boatwright' | 'burners' | 'antiquarian' | 'chandlery' | 'fishauction' | 'anchor' | 'shipwright', { name: string; items: { id: ItemId; price: number }[]; gear?: GearId[]; buys?: ItemId[]; pays?: number }> = {
  farm: { name: 'Brookfield farm gate', items: [{ id: 'eggs', price: 3 }, { id: 'milk', price: 2 }, { id: 'apple', price: 1 }, { id: 'cheese', price: 7 }, { id: 'onion', price: 2 }, { id: 'flour', price: 3 }, { id: 'honey', price: 5 }], buys: ['wolfpelt', 'boarmeat', 'mushrooms', 'berries'] },
  apothecary: { name: 'Mother Ilse\'s apothecary', items: [{ id: 'bandage', price: 8 }, { id: 'salve', price: 11 }, { id: 'salts', price: 7 }, { id: 'tonic', price: 11 }, { id: 'draught', price: 16 }, { id: 'manadraught', price: 15 }, { id: 'medkit', price: 24 }, { id: 'herbs', price: 3 }], buys: ['herbs', 'moonpetal', 'mushrooms', 'berries', 'dust', 'boarmeat'] },
  gunsmith: { name: 'Hale & Daughter, gunsmiths', items: [{ id: 'ammo', price: 6 }, { id: 'silverammo', price: 18 }, { id: 'carbineammo', price: 9 }, { id: 'shells', price: 8 }, { id: 'riflerounds', price: 12 }, { id: 'oil', price: 4 }], gear: ['carbine', 'scattergun', 'longrifle', 'rifled', 'loader'], buys: ['copper', 'wardcopper', 'tags'] },
  fishmonger: { name: 'Oskar Penn, fish and tackle', items: [{ id: 'smokedfish', price: 5 }, { id: 'saltfish', price: 5 }, { id: 'rod', price: 12 }], buys: ['trout', 'eel', 'saltfish'] },
  curio: { name: 'Tamsin Reed, curios and charms', items: [{ id: 'charmHare', price: 40 }, { id: 'charmIron', price: 38 }, { id: 'charmOwl', price: 36 }, { id: 'charmCopper', price: 48 }, { id: 'charmSalt', price: 34 }, { id: 'charmClover', price: 52 }], buys: ['tusk', 'wardcopper', 'cinder', 'dust', 'moonpetal', 'wolfpelt'] },
  pedlar: { name: 'Mags the pedlar\'s pack', items: [{ id: 'bread', price: 5 }, { id: 'ration', price: 8 }, { id: 'ammo', price: 7 }, { id: 'bandage', price: 10 }, { id: 'soap', price: 3 }, { id: 'apple', price: 1 }, { id: 'pickaxe', price: 22 }], buys: ['pelt', 'wolfpelt', 'tusk', 'copper'] },
  lodge: { name: 'Wardens\' Lodge stores', items: [{ id: 'ration', price: 7 }, { id: 'bandage', price: 9 }, { id: 'ammo', price: 6 }, { id: 'carbineammo', price: 9 }, { id: 'shells', price: 9 }, { id: 'pickaxe', price: 20 }], gear: ['oilskin', 'boots', 'satchel'] },
  // v0.8: the Westmarch
  smokehouse: { name: 'Ebba Rook\'s smokehouse', items: [{ id: 'smokedfish', price: 4 }, { id: 'saltfish', price: 5 }, { id: 'friedperch', price: 6 }, { id: 'pikepie', price: 11 }, { id: 'rod', price: 12 }], buys: ['perch', 'pike', 'trout', 'eel', 'saltfish'] },
  wisewoman: { name: 'Gammer Thrush\'s cottage', items: [{ id: 'charmRowan', price: 36 }, { id: 'charmHag', price: 42 }, { id: 'salve', price: 11 }, { id: 'tonic', price: 11 }, { id: 'herbs', price: 3 }, { id: 'heathertea', price: 4 }], buys: ['herbs', 'moonpetal', 'heather', 'bilberries', 'dust', 'mushrooms'] },
  smithyWest: { name: 'Tobin Crake, smith', items: [{ id: 'ammo', price: 6 }, { id: 'silverammo', price: 16 }, { id: 'carbineammo', price: 9 }, { id: 'shells', price: 8 }, { id: 'oil', price: 4 }, { id: 'bandage', price: 9 }], gear: ['lantern', 'satchel'], buys: ['copper', 'tags', 'wolfpelt', 'pelt'] },
  boatwright: { name: 'Marra Quill\'s slipway', items: [{ id: 'rod', price: 10 }], gear: ['waders'], buys: ['perch', 'eel'] },
  burners: { name: 'The Smeaths\' fire', items: [{ id: 'bread', price: 5 }, { id: 'ration', price: 7 }, { id: 'apple', price: 1 }, { id: 'bilberries', price: 1 }], buys: ['wolfpelt', 'pelt', 'boarmeat'] },
  antiquarian: { name: 'Master Vane\'s dig', items: [], buys: ['barrowgold', 'dust', 'cinder'], pays: 1.7 },
  // v0.9: the Saltway Coast
  chandlery: { name: 'Pasco Hendy, chandler', items: [{ id: 'oil', price: 4 }, { id: 'ration', price: 7 }, { id: 'bandage', price: 9 }, { id: 'ammo', price: 7 }, { id: 'carbineammo', price: 10 }, { id: 'soap', price: 3 }, { id: 'rod', price: 11 }], gear: ['spyglass', 'lantern'], buys: ['tags', 'copper', 'pelt'] },
  fishauction: { name: 'Morwenna Kitto\'s fish auction', items: [{ id: 'mackerel', price: 4 }, { id: 'smokedfish', price: 5 }, { id: 'saltfish', price: 5 }], buys: ['mackerel', 'crabmeat', 'mussels', 'trout', 'eel', 'perch', 'pike', 'saltfish'], pays: 1.3 },
  anchor: { name: 'The Anchor and Gull kitchen', items: [{ id: 'musselbroth', price: 10 }, { id: 'crabcakes', price: 14 }, { id: 'samphiresalad', price: 7 }, { id: 'grilledmackerel', price: 9 }, { id: 'bread', price: 4 }, { id: 'tea', price: 3 }], buys: ['mussels', 'samphire', 'crabmeat'] },
  shipwright: { name: 'Tegen Rowse\'s slipway', items: [{ id: 'rod', price: 10 }, { id: 'oil', price: 4 }], gear: ['seaboots'], buys: ['wolfpelt', 'tusk'] },
};
export const REVOLVER_DAMAGE = 30, REVOLVER_DAMAGE_RIFLED = 38, MELEE_DAMAGE = 16, MELEE_DAMAGE_IRON = 26, RELOAD_TIME = 1.8, RELOAD_TIME_LOADER = 1.1;
export const COND_PER_SHOT = 0.5;      // revolver condition lost per shot
export const COND_FOUL = 50;           // below this the gun shoots wide
export const COND_MISFIRE = 25;        // below this it sometimes misfires
export type HomeUpId = 'featherBed' | 'rainBarrel' | 'herbBox' | 'bookshelf' | 'strongbox';
export const HOME_UP: Record<HomeUpId, { name: string; desc: string; cost: number }> = {
  featherBed: { name: 'Feather mattress', desc: "A full night's sleep clears all fatigue, +25 comfort, −10 stress.", cost: 45 },
  rainBarrel: { name: 'Hot-water copper', desc: 'Warm showers: +10 hygiene, +10 comfort and −6 more stress each time.', cost: 40 },
  herbBox: { name: 'Window herb box', desc: 'One bunch of Vale herbs appears in your chest every morning.', cost: 25 },
  bookshelf: { name: 'Bookshelf and lamp', desc: 'Reading in your chair teaches twice as much and calms more.', cost: 35 },
  strongbox: { name: 'Iron strongbox', desc: 'Collapsing costs you nothing from your purse.', cost: 50 },
};
