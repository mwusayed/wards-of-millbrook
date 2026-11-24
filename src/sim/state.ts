// The one authoritative game state and every rule that changes it.
// Pure TypeScript: the 3D layer calls these functions; tests call them directly.
import * as B from './balance';
import type { Needs, NeedKey, ItemId, BuffId, SpellId } from './balance';
import { line } from './text';
import { generateBoard, generateLodgeBoard, generateWestBoard, generateCoastBoard, issuerFaction, FACTIONS, type Contract, type EnemyKind, type FactionId, ENEMY_NAMES } from './contracts';
import { generateShift, checkPosting, type LedgerEntry, type Account } from './ledger';
import { makeCase, makeAudit, type LedgerCase } from './cases';
import { SKILLS, SKILL_IDS, TRAITS, levelOf, rollTrauma, type SkillId, type TraitId } from './skills';
import { dayInfo, isWet } from './days';

export type Activity = 'rest' | 'active' | 'exert' | 'sleep';
export type LogKind = 'info' | 'good' | 'warn' | 'bad';
export interface Wound { severity: number; label: string }
export interface Shift { entries: LedgerEntry[]; index: number; correct: number; errors: number; lastResult: { ok: boolean; why: string } | null }

export interface NpcMemory { met: number; lastDay: number; mood: number; notes: string[] }
export type Fate = '' | 'tower' | 'chapel' | 'kept';
export interface QuestProgress { stage: number; state: 'active' | 'done' | 'failed'; startDay: number; doneDay: number }
export interface Story {
  flags: Record<string, number>;      // free-form story switches and counters
  ember: Fate; censer: Fate;          // what you did with each ward-stone
  sparkLearned: boolean;
  debtCleared: boolean; wardsDone: boolean;
  ending: string; freePlay: boolean;
}
export interface GameState {
  version: 5;
  seed: number;
  minutes: number;            // game minutes since day 1, 00:00
  needs: Needs;
  hp: number;
  wounds: Wound[];
  stamina: number;
  staminaLocked: boolean;
  mana: number;
  crowns: number;
  debt: number;
  nextDueDay: number;
  paidThisCycle: number;
  missed: number;
  inventory: Record<ItemId, number>;
  ammo: { mag: number; reserve: number };
  board: Contract[];
  boardDay: number;
  active: Contract | null;
  carryingLetter: boolean;
  contractsDone: number;
  job: { attention: number; shifts: number; firedUntilDay: number; lastShiftDay: number };
  shift: Shift | null;
  log: { day: number; time: string; text: string; kind: LogKind }[];
  gameover: null | 'debt' | 'won';
  stats: { kills: number; collapses: number; accidents: number };
  lastProcessedDay: number;
  // pass 2
  factions: Record<FactionId, number>;
  factionTouched: Record<FactionId, number>;
  savings: number;
  carryingCrate: boolean;
  upgrades: Record<B.HomeUpId, boolean>;
  talkedToday: Record<string, number>;
  // pass 3
  storage: Record<ItemId, number>;
  buffs: Partial<Record<BuffId, number>>;     // game minute when each buff ends
  spellReadyAt: Partial<Record<SpellId, number>>; // real-seconds clock (s.rt) when the spell is ready
  rt: number;                                  // real seconds of play, for cooldowns
  flags: { millEntered: boolean; millCleared: boolean; patriarchDay: number; emberGiven: boolean; notesRead: string[]; millCheckpoint: boolean };
  npcMemory: Record<string, NpcMemory>;
  recent: { lastCombatMin: number; lastKillKind: string; lastCastMin: number; healsToday: number; washedMin: number; ledgerCaseResult: string };
  ledgerCases: number;
  caseFile: { c: LedgerCase; index: number; correct: number; errors: number; last: { ok: boolean; why: string } | null } | null;
  // pass 4
  difficulty: B.Difficulty;
  skills: Record<SkillId, number>;             // experience per skill
  traits: TraitId[];
  gear: Record<B.GearId, boolean>;
  revolverCond: number;                        // 0..100
  quests: Record<string, QuestProgress>;
  story: Story;
  counters: Record<string, number>;            // lifetime tallies (meals cooked, crowns earned, …)
  discovered: string[];                        // waystones and places found
  // v0.7 (save version 5): the Eastern Reach
  firearm: B.FirearmId;                        // which gun is in slot 1
  rifle: { mag: number; reserve: number };     // the lever carbine's tube and loose rounds
  // v0.9: arms
  guns: { scattergun: { mag: number; reserve: number }; longrifle: { mag: number; reserve: number } };
  silverIn: number;                            // silvered rounds in the cylinder (they fire first)
  loadSilver: boolean;                         // reload with silvered rounds while you have them
  charm: ItemId | '';                          // the one charm you wear
}
export const newStory = (): Story => ({ flags: {}, ember: '', censer: '', sparkLearned: false, debtCleared: false, wardsDone: false, ending: '', freePlay: false });
const NEW_V4 = () => ({
  difficulty: 'standard' as B.Difficulty,
  skills: Object.fromEntries(SKILL_IDS.map(k => [k, 0])) as Record<SkillId, number>,
  traits: [] as TraitId[],
  gear: { rifled: false, loader: false, ironStaff: false, coat: false, satchel: false, lantern: false, carbine: false, oilskin: false, boots: false, waders: false, spyglass: false, seaboots: false } as Record<B.GearId, boolean>,
  revolverCond: 100,
  quests: {} as Record<string, QuestProgress>,
  story: newStory(),
  counters: {} as Record<string, number>,
  discovered: [] as string[],
  firearm: 'revolver' as B.FirearmId,
  rifle: { mag: 0, reserve: 0 },
  guns: { scattergun: { mag: 0, reserve: 0 }, longrifle: { mag: 0, reserve: 0 } },
  silverIn: 0,
  loadSilver: false,
  charm: '' as ItemId | '',
});
const HOME_UPS = () => ({ featherBed: false, rainBarrel: false, herbBox: false, bookshelf: false, strongbox: false });

export const MAG_SIZE = 6;
export const ROUNDS_PER_BOX = 6;

export function newGame(seed = 2041, difficulty: B.Difficulty = 'standard'): GameState {
  const s: GameState = {
    version: 5, seed, ...NEW_V4(), difficulty,
    minutes: 24 * 60 + B.START_HOUR * 60, // day 1, 07:00
    needs: { ...B.START_NEEDS },
    hp: B.HP_MAX, wounds: [], stamina: B.STAMINA_MAX, staminaLocked: false, mana: 0,
    crowns: B.START_CROWNS, debt: B.START_DEBT, nextDueDay: 7, paidThisCycle: 0, missed: 0,
    inventory: { ...B.EMPTY_INV(), bread: 2, ration: 1, soap: 1, bandage: 1, ammo: 2, onion: 1, herbs: 1 },
    ammo: { mag: MAG_SIZE, reserve: 12 },
    board: [], boardDay: 0, active: null, carryingLetter: false, contractsDone: 0,
    job: { attention: 10, shifts: 0, firedUntilDay: 0, lastShiftDay: 0 },
    shift: null, log: [], gameover: null,
    stats: { kills: 0, collapses: 0, accidents: 0 },
    storage: { ...B.EMPTY_INV(), ration: 2, bandage: 1, book: 1 }, buffs: {}, spellReadyAt: {}, rt: 0,
    flags: { millEntered: false, millCleared: false, patriarchDay: 0, emberGiven: false, notesRead: [], millCheckpoint: false },
    npcMemory: {}, recent: { lastCombatMin: -9999, lastKillKind: '', lastCastMin: -9999, healsToday: 0, washedMin: -9999, ledgerCaseResult: '' }, ledgerCases: 0, caseFile: null,
    lastProcessedDay: 1,
    factions: { town: 0, tower: -10, chapel: 0, watch: 0, ashRoad: 0, ashford: 0, fernhollow: 0, gullhaven: 0 }, factionTouched: { town: 1, tower: 1, chapel: 1, watch: 1, ashRoad: 1, ashford: 1, fernhollow: 1, gullhaven: 1 },
    savings: 0, carryingCrate: false, upgrades: HOME_UPS(), talkedToday: {},
  };
  s.mana = B.manaMax(s.needs);
  refreshBoard(s);
  log(s, line('wake', seed), 'info');
  log(s, 'Aunt Ysolde left you this house, and what she owed on it: 300 crowns to Aldric Voss. 60 is due at his clerk by the end of day 7.', 'warn');
  return s;
}

// ---------- time ----------
export const day = (s: GameState) => Math.floor(s.minutes / 1440);
export const hour = (s: GameState) => Math.floor((s.minutes % 1440) / 60);
export const minuteOfHour = (s: GameState) => Math.floor(s.minutes % 60);
export function clock(s: GameState): string { return `${String(hour(s)).padStart(2, '0')}:${String(minuteOfHour(s)).padStart(2, '0')}`; }

/** Minutes until the next 07:00 that is strictly in the future. */
export function minutesToMorning(s: GameState): number {
  const d = day(s), m = s.minutes % 1440;
  const target = (m < B.START_HOUR * 60 ? d : d + 1) * 1440 + B.START_HOUR * 60;
  return target - s.minutes;
}

export function log(s: GameState, text: string, kind: LogKind = 'info') {
  s.log.push({ day: day(s), time: clock(s), text, kind });
  if (s.log.length > 120) s.log.splice(0, s.log.length - 120);
}

const clampNeed = (k: NeedKey, v: number) => Math.max(0, Math.min(B.NEED_INFO[k].max, v));

export function maxHp(s: GameState): number {
  return Math.max(20, B.HP_MAX - s.wounds.reduce((a, w) => a + w.severity, 0));
}

/** Advance game time. Used both for the live clock and for time-skipping actions. */
export function advanceMinutes(s: GameState, minutes: number, act: Activity) {
  if (s.gameover) return;
  const rate = B.DECAY_PER_HOUR[act];
  let left = minutes;
  while (left > 0) {
    const step = Math.min(left, 10);
    left -= step;
    const warm = buffActive(s, 'warmBelly'), dn = act === 'sleep' ? 1 : B.DIFFICULTY[s.difficulty].needs, blessed = (s.story.flags.blessedUntil ?? 0) > s.minutes;
    for (const k of B.NEED_KEYS) {
      let r = rate[k];
      if (k === 'fatigue' && warm && r > 0) r *= 0.7;
      if (k === 'calories' || k === 'hydration' || (k === 'fatigue' && r > 0)) r *= dn;
      if (k === 'stress' && r > 0 && blessed) r *= 0.5;
      if (k === 'stress' && r > 0 && (s.charm === 'charmHag' || s.charm === 'charmOrm')) { const h = (s.minutes % 1440) / 60; if (h >= 20 || h < 5) r *= s.charm === 'charmHag' ? 0.7 : 1.2; }
      s.needs[k] = clampNeed(k, s.needs[k] + r * step / 60);
    }
    // Hunger and thirst at zero hurt (no single need kills outright: you collapse first).
    if (s.needs.calories <= 0 || s.needs.hydration <= 0) s.hp = Math.max(0, s.hp - 0.6 * step);
    else if (act !== 'exert') s.hp = Math.min(maxHp(s), s.hp + B.HP_REGEN_PER_MIN * step * (act === 'sleep' ? 3 : 1));
    // Accidents (MM thresholds)
    if (s.needs.bladder >= B.T.bladderAccident) {
      s.needs.bladder = 0; s.needs.hygiene = clampNeed('hygiene', s.needs.hygiene - 35); s.needs.stress = clampNeed('stress', s.needs.stress + 15); s.needs.comfort = clampNeed('comfort', s.needs.comfort - 30);
      s.stats.accidents++; log(s, line('accidentBladder'), 'bad');
    }
    if (s.needs.bowel >= B.T.bowelAccident) {
      s.needs.bowel = 0; s.needs.hygiene = clampNeed('hygiene', s.needs.hygiene - 50); s.needs.stress = clampNeed('stress', s.needs.stress + 20); s.needs.comfort = clampNeed('comfort', s.needs.comfort - 40);
      s.stats.accidents++; log(s, line('accidentBowel'), 'bad');
    }
    s.minutes += step;
    rollDays(s);
    if (s.gameover) return;
  }
}

/** Real-time tick from the game loop (seconds). Needs move by game minutes; mana and stamina by real time. */
export function tickReal(s: GameState, dt: number, opts: { sprinting: boolean; moving: boolean; inCombat: boolean }) {
  if (s.gameover) return;
  let act: Activity = opts.sprinting || opts.inCombat ? 'exert' : opts.moving ? 'active' : 'rest';
  if (act === 'exert' && s.active?.prep?.supplies) act = 'active'; // packed supplies: no extra drain in the field
  advanceMinutes(s, dt * B.GAME_MINUTES_PER_REAL_SECOND, act);
  // Stamina hysteresis (VEILWORK)
  if (opts.sprinting && !s.staminaLocked) {
    s.stamina -= B.STAMINA_DRAIN * (1 - 0.03 * level(s, 'vigor')) * (hasTrait(s, 'roadwise') ? 0.85 : 1) * (buffActive(s, 'fleet') ? 0.75 : 1) * dt;
    addXp(s, 'vigor', dt * 0.5);
    if (s.stamina <= 0) { s.stamina = 0; s.staminaLocked = true; }
  } else {
    const loadMul = loadState(s).staminaMult;
    s.stamina = Math.min(B.STAMINA_MAX, s.stamina + B.STAMINA_REGEN * B.staminaRegenMult(s.needs) * (buffActive(s, 'hearty') ? 1.3 : 1) * loadMul * dt);
    if (s.staminaLocked && s.stamina >= B.STAMINA_RESUME) s.staminaLocked = false;
  }
  s.rt += dt;
  regenMana(s, dt);
  if (s.needs.fatigue >= B.T.collapseFatigue) collapse(s, 'You fall asleep where you stand.');
}

function rollDays(s: GameState) {
  while (day(s) > s.lastProcessedDay) {
    const ended = s.lastProcessedDay;
    s.lastProcessedDay++;
    s.job.attention = Math.max(0, s.job.attention - B.ATTENTION_DECAY_PER_DAY);
    if (ended >= s.nextDueDay) {
      if (s.paidThisCycle < B.INSTALMENT && s.debt > 0) {
        s.missed++;
        rep(s, 'tower', -15, false);
        s.debt += B.MISSED_INSTALMENT_PENALTY;
        s.needs.stress = clampNeed('stress', s.needs.stress + 20);
        log(s, `You missed Aldric's instalment. The clerk adds ${B.MISSED_INSTALMENT_PENALTY} crowns and a note in red ink.`, 'bad');
        if (s.missed >= B.MISSES_TO_GAMEOVER) { s.gameover = 'debt'; log(s, 'Debt called. Aldric\'s men come for the house.', 'bad'); return; }
      }
      s.paidThisCycle = 0;
      s.nextDueDay += B.WEEK_DAYS;
      // Millbrook Trust pays weekly interest on savings (MM banking, reskinned)
      if (s.savings > 0) { const i = Math.max(1, Math.round(s.savings * B.SAVINGS_INTEREST)); s.savings += i; log(s, `The Millbrook Trust adds ${i} crowns of interest to your savings.`, 'good'); }
    }
    if (s.active && day(s) > s.active.expiresDay) { log(s, `The notice "${s.active.title}" expired.`, 'warn'); rep(s, issuerFaction(s.active.issuer), -4, false); s.active = null; s.carryingLetter = false; s.carryingCrate = false; }
    // Faction drift toward neutral when neglected (Ledger & Ward / Daggerfall normalisation, scaled to this game's pace)
    for (const f of Object.keys(s.factions) as FactionId[]) if (s.lastProcessedDay - s.factionTouched[f] > B.FACTION_DRIFT_AFTER_DAYS && s.factions[f] !== 0) s.factions[f] += s.factions[f] > 0 ? -1 : 1;
    s.talkedToday = {};
    if (s.upgrades.herbBox) s.storage.herbs++;
    for (const k of Object.keys(s.counters)) if (k.startsWith('today:')) delete s.counters[k];
    refreshBoard(s);
  }
}

export function refreshBoard(s: GameState) {
  const d = day(s);
  if (s.boardDay === d) return;
  s.boardDay = d;
  s.board = [...generateBoard(d, s.seed), ...generateLodgeBoard(d, s.seed), ...((s.story?.flags?.westGateOpen ?? 0) > 0 ? generateWestBoard(d, s.seed) : []), ...((s.story?.flags?.saltGapOpen ?? 0) > 0 ? generateCoastBoard(d, s.seed) : [])].filter(c => !s.active || c.id !== s.active.id);
}

// ---------- body actions ----------
export function eat(s: GameState, item: 'bread'): boolean {
  if (s.inventory[item] <= 0) { log(s, 'You have nothing to eat on you.', 'warn'); return false; }
  s.inventory[item]--; count(s, 'ate');
  s.needs.calories = clampNeed('calories', s.needs.calories + 700);
  s.needs.bowel = clampNeed('bowel', s.needs.bowel + 40);
  advanceMinutes(s, 5, 'rest');
  log(s, line('eat'), 'good');
  return true;
}
// ---------- cooking and meal buffs (pass 3) ----------
export function buffActive(s: GameState, b: BuffId): boolean { return (s.buffs[b] ?? 0) > s.minutes; }
export function activeBuffs(s: GameState): { id: BuffId; left: number }[] {
  return (Object.keys(s.buffs) as BuffId[]).filter(b => buffActive(s, b)).map(id => ({ id, left: s.buffs[id]! - s.minutes }));
}
/** Stacking rule: at most two meal buffs; eating the same meal again refreshes it; a third new buff replaces the one closest to running out. */
export function applyBuff(s: GameState, b: BuffId) {
  for (const k of Object.keys(s.buffs) as BuffId[]) if (!buffActive(s, k)) delete s.buffs[k];
  const act = activeBuffs(s);
  if (!buffActive(s, b) && act.length >= B.MAX_MEAL_BUFFS) {
    const drop = act.sort((x, y) => x.left - y.left)[0];
    delete s.buffs[drop.id];
    log(s, `${B.BUFFS[drop.id].name} fades to make room. (Two meal effects at most.)`, 'info');
  }
  s.buffs[b] = s.minutes + Math.round(B.BUFFS[b].minutes * (1 + 0.06 * level(s, 'cooking')));
}
export function canCook(s: GameState, id: string): boolean {
  const r = B.RECIPES.find(x => x.id === id); if (!r) return false;
  return Object.entries(r.needs).every(([k, n]) => s.inventory[k as ItemId] >= (n as number));
}
/** Cook a recipe at the hearth. The meal goes into your pack to eat when you choose (so you can prepare before an expedition). */
export function cookRecipe(s: GameState, id: string): boolean {
  const r = B.RECIPES.find(x => x.id === id);
  if (!r || !canCook(s, id)) { log(s, 'You are missing ingredients for that.', 'warn'); return false; }
  for (const [k, n] of Object.entries(r.needs)) s.inventory[k as ItemId] -= n as number;
  s.inventory[r.id]++;
  advanceMinutes(s, r.minutes, 'rest');
  s.needs.comfort = clampNeed('comfort', s.needs.comfort + 6);
  addXp(s, 'cooking', 16); count(s, 'cooked');
  log(s, `You cook ${B.ITEMS[r.id].name.toLowerCase()} (${r.minutes} min). It's in your pack.`, 'good');
  return true;
}
const MEALS: Record<string, { kcal: number; water: number; comfort: number; bowel: number; buff: BuffId | null; mins: number }> = {
  stew: { kcal: 1100, water: 150, comfort: 20, bowel: 55, buff: 'hearty', mins: 10 },
  tea: { kcal: 40, water: 500, comfort: 8, bowel: 0, buff: 'clearHead', mins: 5 },
  honeycake: { kcal: 900, water: 0, comfort: 12, bowel: 35, buff: 'sweetTooth', mins: 5 },
  fishsupper: { kcal: 1000, water: 0, comfort: 15, bowel: 50, buff: 'warmBelly', mins: 10 },
  ration: { kcal: 900, water: 0, comfort: 0, bowel: 45, buff: null, mins: 5 },
  // v0.7
  eggs: { kcal: 350, water: 0, comfort: 0, bowel: 20, buff: null, mins: 3 },
  milk: { kcal: 250, water: 400, comfort: 4, bowel: 15, buff: null, mins: 2 },
  apple: { kcal: 120, water: 80, comfort: 2, bowel: 8, buff: null, mins: 1 },
  cheese: { kcal: 800, water: 0, comfort: 4, bowel: 35, buff: null, mins: 4 },
  smokedfish: { kcal: 750, water: 0, comfort: 4, bowel: 35, buff: null, mins: 5 },
  berries: { kcal: 120, water: 60, comfort: 2, bowel: 6, buff: null, mins: 1 },
  eelpie: { kcal: 1200, water: 50, comfort: 15, bowel: 55, buff: 'hearty', mins: 10 },
  mushroomstew: { kcal: 900, water: 300, comfort: 14, bowel: 45, buff: 'forager', mins: 10 },
  roastboar: { kcal: 1400, water: 0, comfort: 20, bowel: 65, buff: 'stout', mins: 12 },
  grilledtrout: { kcal: 750, water: 0, comfort: 10, bowel: 35, buff: 'keenEye', mins: 8 },
  omelette: { kcal: 800, water: 0, comfort: 8, bowel: 35, buff: 'hearty', mins: 6 },
  berrytart: { kcal: 700, water: 0, comfort: 12, bowel: 30, buff: 'fleet', mins: 6 },
  // v0.8: the Westmarch
  bilberries: { kcal: 120, water: 50, comfort: 2, bowel: 6, buff: null, mins: 1 },
  friedperch: { kcal: 700, water: 0, comfort: 10, bowel: 32, buff: 'fleet', mins: 6 },
  pikepie: { kcal: 1300, water: 0, comfort: 18, bowel: 60, buff: 'stout', mins: 10 },
  bilberrycake: { kcal: 750, water: 0, comfort: 12, bowel: 32, buff: 'nightEyes', mins: 6 },
  heathertea: { kcal: 60, water: 400, comfort: 8, bowel: 0, buff: 'grounded', mins: 5 },
  // v0.9: the Saltway Coast
  samphire: { kcal: 60, water: 40, comfort: 2, bowel: 4, buff: null, mins: 1 },
  musselbroth: { kcal: 500, water: 300, comfort: 14, bowel: 25, buff: 'warmBelly', mins: 8 },
  crabcakes: { kcal: 850, water: 0, comfort: 12, bowel: 35, buff: 'seaLegs', mins: 6 },
  samphiresalad: { kcal: 250, water: 80, comfort: 6, bowel: 12, buff: 'clearHead', mins: 4 },
  grilledmackerel: { kcal: 650, water: 0, comfort: 10, bowel: 30, buff: 'hearty', mins: 6 },
};
export const isEdible = (id: ItemId) => !!MEALS[id];
export function eatMeal(s: GameState, id: ItemId): boolean {
  const m = MEALS[id]; if (!m || s.inventory[id] <= 0) return false;
  s.inventory[id]--; count(s, 'ate');
  s.needs.calories = clampNeed('calories', s.needs.calories + m.kcal * (m.buff && hasTrait(s, 'ironGut') ? 1.1 : 1));
  s.needs.hydration = clampNeed('hydration', s.needs.hydration + m.water);
  if (m.buff && count(s, 'mealsEaten') >= 10) addTrait(s, 'ironGut');
  s.needs.comfort = clampNeed('comfort', s.needs.comfort + m.comfort);
  s.needs.bowel = clampNeed('bowel', s.needs.bowel + m.bowel);
  if (m.water) s.needs.bladder = clampNeed('bladder', s.needs.bladder + m.water / 12);
  advanceMinutes(s, m.mins, 'rest');
  if (m.buff) { applyBuff(s, m.buff); log(s, `You eat the ${B.ITEMS[id].name.toLowerCase()}. ${B.BUFFS[m.buff].name}: ${B.BUFFS[m.buff].desc.toLowerCase()} for ${B.BUFFS[m.buff].minutes / 60} h.`, 'good'); }
  else log(s, line('eat'), 'good');
  return true;
}
export function cook(s: GameState): boolean {
  if (s.inventory.ration > 0) {
    s.inventory.ration--; count(s, 'ate');
    s.needs.calories = clampNeed('calories', s.needs.calories + 1100);
    s.needs.comfort = clampNeed('comfort', s.needs.comfort + 20);
    s.needs.bowel = clampNeed('bowel', s.needs.bowel + 60);
    advanceMinutes(s, 20, 'rest');
    log(s, line('cook'), 'good');
    return true;
  }
  if (s.inventory.bread > 0) return eat(s, 'bread');
  log(s, 'The larder is empty. Bram\'s stall in the square sells bread and rations.', 'warn');
  return false;
}
export function drink(s: GameState, source: 'cistern' | 'well') {
  s.needs.hydration = clampNeed('hydration', s.needs.hydration + 700); count(s, 'drank');
  if (source === 'well' && s.story.flags.wellTainted) { s.needs.stress = clampNeed('stress', s.needs.stress + 6); s.needs.bowel = clampNeed('bowel', s.needs.bowel + 40); log(s, 'The well water tastes of ash. Your stomach turns over.', 'warn'); }
  s.needs.bladder = clampNeed('bladder', s.needs.bladder + 60);
  advanceMinutes(s, 2, 'rest');
  log(s, line(source === 'well' ? 'well' : 'drink'), 'good');
}
export function privy(s: GameState) {
  s.needs.bladder = 0; s.needs.bowel = 0;
  s.needs.stress = clampNeed('stress', s.needs.stress - 3);
  advanceMinutes(s, 5, 'rest');
  log(s, line('privy'), 'info');
}
/** Wash basin: hands and face. Quick, small. Soap is only used if you have plenty. */
export function wash(s: GameState) {
  const soap = s.inventory.soap > 0;
  s.needs.hygiene = clampNeed('hygiene', s.needs.hygiene + (soap ? 25 : 15));
  s.needs.comfort = clampNeed('comfort', s.needs.comfort + 4);
  advanceMinutes(s, 3, 'rest'); count(s, 'washed');
  s.recent.washedMin = s.minutes;
  log(s, line(soap ? 'washSoap' : 'wash'), 'good');
}
/** Shower: a full wash from the rain-tank above. Uses soap if you have it, takes 20 minutes, eases stress. */
export function shower(s: GameState) {
  const soap = s.inventory.soap > 0;
  if (soap) s.inventory.soap--;
  const hot = s.upgrades.rainBarrel;
  s.needs.hygiene = clampNeed('hygiene', s.needs.hygiene + (soap ? 85 : 55) + (hot ? 10 : 0));
  s.needs.comfort = clampNeed('comfort', s.needs.comfort + 18 + (hot ? 10 : 0));
  s.needs.stress = clampNeed('stress', s.needs.stress - 8 - (hot ? 6 : 0));
  advanceMinutes(s, 20, 'rest'); count(s, 'washed');
  s.recent.washedMin = s.minutes;
  log(s, hot ? (soap ? 'Hot water and soap. You stay under it longer than you need to.' : 'Hot water, no soap. Still the best ten minutes of the day.') : soap ? 'You scrub under the cold rain-tank with soap until the Vale is off you.' : 'Cold water, no soap. Better than nothing, and you feel human again.', 'good');
}
export function sit(s: GameState) {
  s.needs.comfort = clampNeed('comfort', s.needs.comfort + 40);
  s.needs.stress = clampNeed('stress', s.needs.stress - 8);
  advanceMinutes(s, 30, 'rest');
  log(s, line('sit'), 'info');
}
export function useTonic(s: GameState): boolean {
  if (s.inventory.tonic <= 0) { log(s, 'No tonic left.', 'warn'); return false; }
  s.inventory.tonic--; s.needs.stress = clampNeed('stress', s.needs.stress - 30); log(s, line('tonic'), 'good'); return true;
}
export function treatWound(s: GameState): boolean {
  if (s.wounds.length === 0) { log(s, 'Nothing needs dressing. You check twice anyway.', 'info'); return false; }
  if (s.inventory.bandage <= 0) { log(s, 'No bandages. Sera sells linen at the market.', 'warn'); return false; }
  s.inventory.bandage--;
  const w = s.wounds.sort((a, b) => b.severity - a.severity).shift()!;
  advanceMinutes(s, 15, 'rest');
  s.hp = Math.min(maxHp(s), s.hp + 3 * level(s, 'medicine')); addXp(s, 'medicine', 20);
  log(s, `${line('bandage')} (${w.label} treated)`, 'good');
  return true;
}
/** Sleep in your own bed: to 07:00 if evening/night, otherwise a two-hour nap. */
export function sleep(s: GameState, away = false): number {
  const h = hour(s);
  let mins: number;
  if (h >= 18 || h < 6) mins = minutesToMorning(s);
  else mins = 120;
  advanceMinutes(s, mins, 'sleep');
  if (s.gameover) return mins;
  s.hp = Math.min(maxHp(s), s.hp + mins * 0.15);
  if (s.upgrades.featherBed && mins > 120 && !away) { s.needs.fatigue = 0; s.needs.comfort = clampNeed('comfort', s.needs.comfort + 25); s.needs.stress = clampNeed('stress', s.needs.stress - 10); }
  // Sleep refills mana, but the body still pays for it in water.
  const want = B.manaMax(s.needs) - s.mana;
  const canAfford = Math.max(0, (s.needs.hydration - 200) / B.MANA_WATER_ML);
  const got = Math.min(want, canAfford);
  s.mana += got; s.needs.hydration = clampNeed('hydration', s.needs.hydration - got * B.MANA_WATER_ML);
  s.recent.healsToday = 0;
  log(s, line('sleep'), 'good');
  if (got < want - 1) log(s, 'You wake with a dry mouth and only part of your mana back. Drink before you cast.', 'warn');
  if (mins > 120) log(s, line('wake'), 'info');
  return mins;
}

// ---------- combat-facing ----------
export function damage(s: GameState, amount: number, source: string): boolean {
  if (s.gameover) return false;
  if (s.charm === 'charmIron' && (source === 'shade' || source === 'drowned' || source === 'hollow' || source === 'wraith' || source === 'engine')) amount = Math.round(amount * 0.85);
  if (s.charm === 'charmRowan' && (source === 'wight' || source === 'wisp' || source === 'orm')) amount = Math.round(amount * 0.8);
  if (s.charm === 'charmShell' && (source === 'crab' || source === 'drowned' || source === 'mother')) amount = Math.round(amount * 0.8);
  s.hp -= amount;
  s.recent.lastCombatMin = s.minutes;
  s.needs.stress = clampNeed('stress', s.needs.stress + amount * 0.15 * (hasTrait(s, 'jumpy') ? 1.25 : 1) * (hasTrait(s, 'stare') ? 0.7 : 1));
  addXp(s, 'vigor', amount * 0.3);
  if (amount >= B.WOUND_HIT_THRESHOLD && !(s.charm === 'charmSalt' && ((s.stats.kills + s.hp + count(s, 'saltRoll')) % 10) < 3)) {
    const sev = Math.round(amount * 0.6);
    s.wounds.push({ severity: sev, label: woundLabel(source) });
    log(s, `${line('hurt')} ${woundLabel(source)} (max health -${sev} until treated).`, 'bad');
    s.hp = Math.min(s.hp, maxHp(s));
    if (sev >= 16) { const t = rollTrauma(s.traits, s.seed, count(s, 'badWounds'), 0.2); if (t) addTrait(s, t); }
  }
  if (s.hp <= 0) { collapse(s, ''); return true; }
  return false;
}
function woundLabel(src: string) { return src === 'wolf' ? 'Torn bite' : src === 'boar' ? 'Gore wound' : src === 'bandit' ? 'Bolt wound' : src === 'hollow' || src === 'engine' ? 'Crushing blow' : src === 'hound' ? 'Bite wound' : src === 'raider' ? 'Deep cut' : src === 'shade' ? 'Shade burn' : src === 'drowned' ? 'Cold bruise' : src === 'imp' || src === 'wraith' ? 'Cinder burn' : 'Bruising'; }

export function collapse(s: GameState, why: string) {
  s.stats.collapses++;
  const fee = s.upgrades.strongbox ? 0 : Math.min(s.crowns, B.DIFFICULTY[s.difficulty].fee);
  { const t = rollTrauma(s.traits, s.seed, s.stats.collapses + 50, 0.3); if (t) addTrait(s, t); }
  if (s.stats.collapses >= 3) addTrait(s, 'stare');
  s.crowns -= fee;
  s.needs.stress = clampNeed('stress', s.needs.stress + 15);
  if (why) log(s, why, 'bad');
  log(s, `${line('collapse')} (-${fee} crowns)`, 'bad');
  // Wake at home, next morning
  advanceMinutes(s, minutesToMorning(s), 'sleep');
  s.hp = Math.max(30, Math.min(maxHp(s), 45));
  s.needs.fatigue = Math.min(s.needs.fatigue, 40);
  s.stamina = B.STAMINA_MAX; s.staminaLocked = false;
  s.carryingLetter = s.active?.kind === 'courier' ? s.carryingLetter : false;
  pendingRespawn = true;
}
let pendingRespawn = false;
/** The renderer asks once per frame whether the player must be moved home. */
export function consumeRespawn(): boolean { const r = pendingRespawn; pendingRespawn = false; return r; }

export function spendMana(s: GameState, cost: number): boolean {
  if (s.mana < cost) return false;
  s.mana -= cost; return true;
}
export function fireRound(s: GameState): boolean {
  if (s.ammo.mag <= 0) return false;
  s.ammo.mag--; return true;
}
export function reload(s: GameState): boolean {
  if (s.firearm === 'scattergun' || s.firearm === 'longrifle') {
    const g = B.GUNS[s.firearm], st = s.guns[s.firearm];
    if (st.mag >= g.mag) return false;
    if (st.reserve <= 0 && s.inventory[g.ammo] > 0) { s.inventory[g.ammo]--; st.reserve += g.perBox; }
    if (st.reserve <= 0) { log(s, `Out of ${B.ITEMS[g.ammo].name.replace(/ ×\d+$/, '').toLowerCase()}. Hale & Daughter in Ashford sell them.`, 'warn'); return false; }
    const take = Math.min(g.mag - st.mag, st.reserve); st.mag += take; st.reserve -= take; return true;
  }
  if (s.firearm === 'carbine') {
    if (s.rifle.mag >= B.CARBINE_MAG) return false;
    if (s.rifle.reserve <= 0 && s.inventory.carbineammo > 0) { s.inventory.carbineammo--; s.rifle.reserve += 8; }
    if (s.rifle.reserve <= 0) { log(s, 'Out of carbine rounds. Hale & Daughter in Ashford sell them.', 'warn'); return false; }
    const take = Math.min(B.CARBINE_MAG - s.rifle.mag, s.rifle.reserve); s.rifle.mag += take; s.rifle.reserve -= take; return true;
  }
  if (s.ammo.mag >= MAG_SIZE) return false;
  if (s.loadSilver && s.inventory.silverammo > 0) {
    // silvered rounds: a box at a time, straight into the cylinder; what doesn't fit goes back to the box count
    const take = Math.min(MAG_SIZE - s.ammo.mag, B.GUNS.revolver.perBox); s.inventory.silverammo--; s.ammo.mag += take; s.silverIn = Math.min(s.ammo.mag, s.silverIn + take);
    if (take < B.GUNS.revolver.perBox) s.ammo.reserve += B.GUNS.revolver.perBox - take;   // the leftover silver is kept loose with the lead (it fires as lead)
    return true;
  }
  if (s.ammo.reserve <= 0 && s.inventory.ammo > 0) { s.inventory.ammo--; s.ammo.reserve += ROUNDS_PER_BOX; }
  if (s.ammo.reserve <= 0) { log(s, 'Out of rounds. Sera sells revolver cartridges at the market.', 'warn'); return false; }
  const need = MAG_SIZE - s.ammo.mag, take = Math.min(need, s.ammo.reserve);
  s.ammo.mag += take; s.ammo.reserve -= take; return true;
}

export function onKill(s: GameState, kind: EnemyKind, tag: string | null) {
  s.stats.kills++; s.recent.lastCombatMin = s.minutes; s.recent.lastKillKind = kind;
  if (s.stats.kills >= 30) addTrait(s, 'hardened');
  count(s, 'kills:' + kind);
  s.needs.stress = clampNeed('stress', s.needs.stress + 2);
  if (s.active && s.active.kind === 'sweep' && tag === s.active.id) {
    s.active.progress++;
    log(s, `${line('kill')} ${ENEMY_NAMES[kind]} ${s.active.progress}/${s.active.count}.`, 'good');
    if (s.active.progress >= s.active.count) log(s, 'Notice fulfilled. Return to the contract board in the square to be paid.', 'good');
  } else log(s, `${line('kill')} (${ENEMY_NAMES[kind]})`, 'info');
}

// ---------- economy ----------
export function buy(s: GameState, id: ItemId): boolean {
  const entry = B.SHOP.find(x => x.id === id)!;
  const price = priceOf(s, id);
  if (s.crowns < price) { log(s, line('noCoin'), 'warn'); return false; }
  s.crowns -= price;
  s.inventory[id]++;
  log(s, `${line('buy')} ${B.ITEMS[id].name} (-${entry.price}).`, 'info');
  return true;
}
export function payDebt(s: GameState, amount: number): boolean {
  amount = Math.min(amount, s.crowns, s.debt);
  if (amount <= 0) { log(s, line('noCoin'), 'warn'); return false; }
  s.crowns -= amount; s.debt -= amount; s.paidThisCycle += amount; count(s, 'debtPaid', amount);
  rep(s, 'tower', Math.max(1, Math.round(amount / 20)), false);
  log(s, `${line('payDebt')} Paid ${amount}; ${s.debt} left.`, 'good');
  if (s.debt <= 0) debtCleared(s, 'The last line in Aldric\'s book is crossed out. The house is yours. You are free.');
  return true;
}
/** The debt reaches zero by any road: the ending screen follows (the player may keep living in Millbrook after). */
export function debtCleared(s: GameState, text: string) {
  s.debt = 0; if (s.story.debtCleared) return;
  s.story.debtCleared = true; s.gameover = 'won'; log(s, text, 'good');
}
export function takeContract(s: GameState, id: string): Contract | null {
  if (s.active) { log(s, 'Finish or abandon your current notice first.', 'warn'); return null; }
  const c = s.board.find(x => x.id === id);
  if (!c) return null;
  s.active = { ...c, prep: {} };
  s.board = s.board.filter(x => x.id !== id);
  if (c.kind === 'courier') s.carryingLetter = true;
  log(s, `${line('contractTaken')} "${c.title}" for ${c.issuer}.`, 'info');
  return s.active;
}
export function abandonContract(s: GameState) {
  if (!s.active) return;
  log(s, `You tear up "${s.active.title}". Nobody will trust you with the next one quite as fast.`, 'warn');
  s.needs.stress = clampNeed('stress', s.needs.stress + 5);
  rep(s, issuerFaction(s.active.issuer), -5);
  s.active = null; s.carryingLetter = false; s.carryingCrate = false;
}
export function deliverLetter(s: GameState): boolean {
  if (!s.active || s.active.kind !== 'courier' || !s.carryingLetter) return false;
  s.carryingLetter = false; s.active.progress = 1;
  log(s, 'You tuck the letter under the cairn\'s top stone. Back to the board for your pay.', 'good');
  return true;
}
export function contractReady(s: GameState) { return !!s.active && s.active.progress >= s.active.count; }
export function turnInContract(s: GameState): boolean {
  if (!s.active || !contractReady(s)) return false;
  const f = issuerFaction(s.active.issuer);
  const pay = contractPay(s, s.active);
  s.crowns += pay; s.contractsDone++; s.carryingCrate = false; count(s, 'crownsEarned', pay);
  if (s.contractsDone >= 8) addTrait(s, 'roadwise');
  rep(s, f, 6);
  if (s.active.kind === 'sweep') rep(s, 'watch', 2, false);
  log(s, `${line('contractDone')} +${pay} crowns.`, 'good');
  s.active = null;
  return true;
}

// ---------- the Counting House (ledger shift) ----------
export function canStartShift(s: GameState): { ok: boolean; why: string } {
  const h = hour(s);
  if (s.job.firedUntilDay > day(s)) return { ok: false, why: `Brannic won't have you back until day ${s.job.firedUntilDay}.` };
  if (s.job.lastShiftDay === day(s)) return { ok: false, why: 'One shift a day. Brannic doesn\'t pay for tired eyes.' };
  if (h < B.SHIFT_START_HOUR || h > B.SHIFT_LAST_START_HOUR) return { ok: false, why: `The Counting House takes clerks from ${B.SHIFT_START_HOUR}:00 to ${B.SHIFT_LAST_START_HOUR}:00.` };
  return { ok: true, why: '' };
}
export function startShift(s: GameState): Shift | null {
  const c = canStartShift(s);
  if (!c.ok) { log(s, c.why, 'warn'); return null; }
  // LW bossAttentionDelta: arriving filthy or visibly injured
  if (s.needs.hygiene < B.T.hygieneLow) { s.job.attention += B.ATTENTION_FILTHY; log(s, 'Brannic wrinkles his nose. (+Boss Attention)', 'warn'); }
  if (s.wounds.length > 0) { s.job.attention += B.ATTENTION_INJURED; log(s, 'Brannic eyes your wounds. "Bleed on my ledger and you\'re done." (+Boss Attention)', 'warn'); }
  s.shift = { entries: generateShift(day(s), s.seed, B.SHIFT_ENTRIES), index: 0, correct: 0, errors: 0, lastResult: null };
  log(s, line('shiftStart'), 'info');
  return s.shift;
}
export function postEntry(s: GameState, debit: Account, credit: Account) {
  if (!s.shift) return null;
  const e = s.shift.entries[s.shift.index];
  const res = checkPosting(e, debit, credit);
  s.shift.lastResult = res;
  if (res.ok) s.shift.correct++; else { s.shift.errors++; s.job.attention += B.ATTENTION_PER_ERROR; }
  s.shift.index++;
  return res;
}
export function endShift(s: GameState): { pay: number; correct: number; errors: number } | null {
  if (!s.shift) return null;
  const { correct, errors } = s.shift;
  // Needs slow the work (MM focus check): a tired, hungry clerk gets through less and is paid less.
  const focus = B.checkChance(s.needs, 'focus');
  const pay = Math.round(correct * B.PAY_PER_CORRECT * Math.min(1, focus.chance / 75) * ledgerPayMult(s));
  addXp(s, 'ledger', correct * 8); count(s, 'crownsEarned', pay);
  if (focus.reason) log(s, `${focus.reason} Your pay suffers.`, 'warn');
  s.crowns += pay;
  s.job.shifts++; s.job.lastShiftDay = day(s);
  s.shift = null;
  advanceMinutes(s, B.SHIFT_HOURS * 60, 'rest');
  s.needs.stress = clampNeed('stress', s.needs.stress + 6 + errors * 3);
  s.needs.fatigue = clampNeed('fatigue', s.needs.fatigue + 8);
  log(s, `${line('shiftEnd')} ${correct} correct, ${errors} wrong. +${pay} crowns.`, correct >= 4 ? 'good' : 'info');
  rep(s, 'town', correct >= 4 ? 2 : errors >= 3 ? -2 : 0, false); rep(s, 'tower', correct >= 4 ? 1 : 0, false);
  if (s.job.attention >= B.ATTENTION_FIRED) {
    s.job.firedUntilDay = day(s) + 7; s.job.attention = 40;
    log(s, 'Brannic closes the ledger in your face. "Come back in a week. Maybe."', 'bad');
  } else if (s.job.attention >= B.ATTENTION_REVIEW) log(s, 'Brannic calls you over for a word about your work. Careful now.', 'warn');
  return { pay, correct, errors };
}

// ---------- pass 2: factions, prep, recovery, bank, home, talk ----------
export function rep(s: GameState, f: FactionId, delta: number, announce = true) {
  const before = s.factions[f];
  s.factions[f] = Math.max(-100, Math.min(100, before + delta));
  s.factionTouched[f] = day(s);
  if (announce && delta !== 0) log(s, `${FACTIONS[f].name} ${delta > 0 ? 'think a little better of you' : 'think less of you'} (${delta > 0 ? '+' : ''}${delta}).`, delta > 0 ? 'good' : 'warn');
}
export function standing(v: number): string { return v >= 60 ? 'Honoured' : v >= 25 ? 'Trusted' : v >= 8 ? 'Liked' : v > -8 ? 'Neutral' : v > -25 ? 'Wary' : v > -60 ? 'Disliked' : 'Hated'; }
/** Shop prices follow how Millbrook folk feel about you: up to 25% off, or dearer if they dislike you. */
export function priceOf(s: GameState, id: ItemId): number { const base = B.SHOP.find(x => x.id === id)!.price; return Math.max(1, Math.round(base * (1 - s.factions.town / 400) * (hasTrait(s, 'scarred') ? 1.05 : 1) * dayPriceMult(s) * (s.story.flags.seraFriend ? 0.9 : 1))); }
/** Contract pay follows the issuer's faction standing, plus 15% if you scouted the route. */
export function contractPay(s: GameState, c: Contract): number { return Math.round(c.pay * (1 + s.factions[issuerFaction(c.issuer)] / 200) * (c.prep?.scouted ? 1.15 : 1) * (c.kind === 'sweep' && today(s).event === 'raidWarning' ? 1.2 : 1)); }
export type PrepId = 'armor' | 'supplies' | 'scouted';
export const PREP: Record<PrepId, { name: string; desc: string; cost: number; hours: number }> = {
  armor: { name: 'Armour up', desc: 'Strap on boiled leather: take 25% less damage until this notice is done.', cost: 12, hours: 0 },
  supplies: { name: 'Pack field supplies', desc: 'Jerky and a full skin: fighting no longer burns extra food and water on this notice.', cost: 8, hours: 0 },
  scouted: { name: 'Scout the route', desc: 'Spend an hour asking travellers: +15% pay when you turn it in.', cost: 0, hours: 1 },
};
export function buyPrep(s: GameState, p: PrepId): boolean {
  if (!s.active || s.active.prep?.[p]) return false;
  const d = PREP[p];
  if (s.crowns < d.cost) { log(s, line('noCoin'), 'warn'); return false; }
  s.crowns -= d.cost; if (d.hours) advanceMinutes(s, d.hours * 60, 'active');
  s.active.prep = { ...s.active.prep, [p]: true };
  log(s, `${d.name}: done.`, 'info'); return true;
}
/** v0.8: Orm's circlet: every weapon does 20% more damage between dusk and dawn. */
export function dealtMult(s: GameState): number { const h = hour(s); return s.charm === 'charmOrm' && (h >= 20 || h < 5) ? 1.2 : 1; }
export function damageTakenMult(s: GameState): number { return (s.active?.prep?.armor ? 0.75 : 1) * B.DIFFICULTY[s.difficulty].dmg * (s.gear.coat ? 0.9 : 1) * (hasTrait(s, 'hardened') ? 0.92 : 1) * (buffActive(s, 'stout') ? 0.9 : 1); }
export function pickUpCrate(s: GameState): boolean {
  if (!s.active || s.active.kind !== 'recovery' || s.carryingCrate || s.active.progress >= 1) return false;
  s.carryingCrate = true; s.active.progress = 1;
  log(s, 'You heave it onto your shoulder. Back to the board in the square.', 'good'); return true;
}
export function deposit(s: GameState, amount: number): boolean {
  amount = Math.min(amount, s.crowns); if (amount <= 0) return false;
  s.crowns -= amount; s.savings += amount; log(s, `You deposit ${amount} crowns with the Millbrook Trust. Collapsing in the Vale can't cost you this.`, 'info'); return true;
}
export function withdraw(s: GameState, amount: number): boolean {
  amount = Math.min(amount, s.savings); if (amount <= 0) return false;
  s.savings -= amount; s.crowns += amount; log(s, `You withdraw ${amount} crowns.`, 'info'); return true;
}
export function buyUpgrade(s: GameState, u: B.HomeUpId): boolean {
  if (s.upgrades[u]) return false;
  const cost = B.HOME_UP[u].cost;
  if (s.crowns < cost) { log(s, line('noCoin'), 'warn'); return false; }
  s.crowns -= cost; s.upgrades[u] = true;
  log(s, u === 'featherBed' ? 'A feather mattress, delivered by two of Dorran\'s boys. Full nights now clear all fatigue and ease the mind.' : `${B.HOME_UP[u].name}: delivered and fitted by evening.`, 'good'); return true;
}
/** Friendly talk: once a day per person, a small boost with their faction. */
export function talkedTo(s: GameState, npcId: string, f: FactionId): boolean {
  if (s.talkedToday[npcId]) return false;
  s.talkedToday[npcId] = 1; rep(s, f, 1, false); return true;
}

// ---------- save / load ----------
export const SAVE_KEY = 'wards-of-millbrook-save-v1';
// ---------- magic economy (pass 3) ----------
/** Mana refills over real time, faster when well watered; every point refilled costs water. Severe dehydration halts it. */
export function regenMana(s: GameState, dt: number) {
  const mm = B.manaMax(s.needs);
  if (s.mana >= mm) { s.mana = mm; return; }
  let gain = B.manaRegen(s.needs) * (buffActive(s, 'clearHead') ? 1.3 : 1) * (s.charm === 'charmOwl' && (hour(s) >= 19 || hour(s) < 6) ? 1.2 : 1) * dt;
  const ml = B.MANA_WATER_ML + (hasTrait(s, 'wardTouched') ? 1 : 0);
  gain = Math.min(gain, mm - s.mana, Math.max(0, (s.needs.hydration - 150) / ml));
  if (gain <= 0) return;
  s.mana += gain;
  s.needs.hydration = clampNeed('hydration', s.needs.hydration - gain * ml);
}
export type CastResult = { ok: true; heal?: number } | { ok: false; why: 'cooldown' | 'mana' | 'body' };
/** Cast a spell: pays mana and calories, starts its cooldown. Heal restores health up to max (wounds still cap it). */
export function castSpell(s: GameState, id: SpellId): CastResult {
  const sp = B.SPELLS[id];
  if (id === 'spark' && !s.story.sparkLearned) return { ok: false, why: 'body' };
  if ((s.spellReadyAt[id] ?? 0) > s.rt) return { ok: false, why: 'cooldown' };
  const cost = manaCost(s, id);
  if (s.mana < cost) return { ok: false, why: 'mana' };
  if (s.needs.calories <= 0) { log(s, 'Your body has nothing left to burn. Eat before you cast again.', 'warn'); return { ok: false, why: 'body' }; }
  const kcal = sp.kcal * (buffActive(s, 'sweetTooth') ? 0.75 : 1);
  s.mana -= cost;
  s.needs.calories = clampNeed('calories', s.needs.calories - kcal);
  addXp(s, 'spellcraft', id === 'heal' ? 4 : 3); count(s, 'casts');
  s.spellReadyAt[id] = s.rt + sp.cooldown;
  s.recent.lastCastMin = s.minutes;
  if (id === 'heal') {
    const starving = s.needs.calories < B.T.starving;
    const amt = B.HEAL_AMOUNT * (starving ? B.HEAL_STARVING_MULT : 1) * (1 + 0.03 * level(s, 'medicine'));
    addXp(s, 'medicine', 5);
    const before = s.hp;
    s.hp = Math.min(maxHp(s), s.hp + amt);
    s.needs.fatigue = clampNeed('fatigue', s.needs.fatigue + B.HEAL_FATIGUE);
    s.recent.healsToday++;
    return { ok: true, heal: s.hp - before };
  }
  return { ok: true };
}
export function spellReadyIn(s: GameState, id: SpellId): number { return Math.max(0, (s.spellReadyAt[id] ?? 0) - s.rt); }

// ---------- carrying and storage (pass 3) ----------
export function carriedWeight(s: GameState): number {
  let w = B.GEAR_WEIGHT + (s.carryingCrate ? 6 : 0) + (s.gear.lantern ? 0.6 : 0);
  for (const k of B.ITEM_IDS) w += (s.inventory[k] || 0) * B.ITEMS[k].weight;
  return Math.round(w * 10) / 10;
}
export function loadState(s: GameState): { kg: number; cap: number; frac: number; band: 'light' | 'heavy' | 'over' | 'crushing'; speedMult: number; staminaMult: number; canSprint: boolean } {
  const kg = carriedWeight(s), cap = carryCap(s), frac = kg / cap;
  if (frac >= B.LOAD_CRUSHING) return { kg, cap, frac, band: 'crushing', speedMult: 0.55, staminaMult: 0.4, canSprint: false };
  if (frac >= B.LOAD_OVER) return { kg, cap, frac, band: 'over', speedMult: 0.8, staminaMult: 0.6, canSprint: false };
  if (frac >= B.LOAD_HEAVY) { const t = (frac - B.LOAD_HEAVY) / (B.LOAD_OVER - B.LOAD_HEAVY); return { kg, cap, frac, band: 'heavy', speedMult: 1 - 0.1 * t, staminaMult: 1 - 0.3 * t, canSprint: true }; }
  return { kg, cap, frac, band: 'light', speedMult: 1, staminaMult: 1, canSprint: true };
}
/** Move n of an item between pack and home chest. Taking out is refused if it would put you past the crushing limit. */
export function transfer(s: GameState, id: ItemId, n: number, dir: 'store' | 'take'): number {
  const from = dir === 'store' ? s.inventory : s.storage, to = dir === 'store' ? s.storage : s.inventory;
  let moved = 0;
  for (let i = 0; i < n && from[id] > 0; i++) {
    if (dir === 'take' && (carriedWeight(s) + B.ITEMS[id].weight) / carryCap(s) > B.LOAD_CRUSHING) { log(s, 'You cannot carry any more than that.', 'warn'); break; }
    from[id]--; to[id] = (to[id] || 0) + 1; moved++;
  }
  return moved;
}

// ---------- ledger cases (pass 3) ----------
/** The Voss audit (quest "Red Ink"): one special file; any error and you must come back tomorrow. */
export function startAudit(s: GameState) {
  const c = canStartShift(s);
  if (!c.ok) { log(s, c.why, 'warn'); return null; }
  s.caseFile = { c: makeAudit(s.debt), index: 0, correct: 0, errors: 0, last: null };
  return s.caseFile;
}
export function startCase(s: GameState) {
  const c = canStartShift(s);
  if (!c.ok) { log(s, c.why, 'warn'); return null; }
  if (s.needs.hygiene < B.T.hygieneLow) { s.job.attention += B.ATTENTION_FILTHY; log(s, 'Brannic wrinkles his nose. (+Boss Attention)', 'warn'); }
  s.caseFile = { c: makeCase(day(s), s.seed, s.ledgerCases), index: 0, correct: 0, errors: 0, last: null };
  return s.caseFile;
}
export function answerCase(s: GameState, option: number) {
  const f = s.caseFile; if (!f) return null;
  const q = f.c.questions[f.index]; const o = q?.options[option]; if (!o) return null;
  f.last = { ok: o.ok, why: o.why };
  if (o.ok) f.correct++; else { f.errors++; s.job.attention += B.ATTENTION_PER_ERROR; }
  f.index++;
  return f.last;
}
export function endCase(s: GameState): { pay: number; correct: number; errors: number; perfect: boolean } | null {
  const f = s.caseFile; if (!f) return null;
  const total = f.c.questions.length, perfect = f.errors === 0 && f.correct === total;
  if (f.c.kind === 'audit') {
    s.job.lastShiftDay = day(s); advanceMinutes(s, 3 * 60, 'rest'); s.needs.fatigue = clampNeed('fatigue', s.needs.fatigue + 8);
    if (perfect) { s.story.flags.auditSolved = 1; s.inventory.auditfile = 1; addXp(s, 'ledger', 60); log(s, 'It casts. Every line of it. You copy your working papers out twice and put one copy inside your shirt.', 'good'); }
    else log(s, 'Somewhere you slipped, and a wrong audit is worse than none. Brannic shuts the book. "Tomorrow. Fresh eyes."', 'warn');
    s.caseFile = null; return { pay: 0, correct: f.correct, errors: f.errors, perfect };
  }
  const focus = B.checkChance(s.needs, 'focus');
  let pay = Math.round((f.correct * 9 + (perfect ? 12 : 0)) * Math.min(1, focus.chance / 75) * ledgerPayMult(s));
  addXp(s, 'ledger', f.correct * 12 + (perfect ? 15 : 0));
  if (perfect && count(s, 'perfectCases') >= 5) addTrait(s, 'cleanHands');
  if (focus.reason) log(s, `${focus.reason} Your pay suffers.`, 'warn');
  if (perfect && f.c.fraud) { pay += 10; rep(s, 'watch', 5, false); log(s, 'Sergeant Vole takes the forged Ashroad invoice off you personally. (+Watch)', 'good'); }
  s.crowns += pay; s.ledgerCases++; s.job.shifts++; s.job.lastShiftDay = day(s);
  advanceMinutes(s, 3 * 60, 'rest');
  s.needs.fatigue = clampNeed('fatigue', s.needs.fatigue + 7);
  s.needs.stress = clampNeed('stress', s.needs.stress + 4 + f.errors * 4);
  if (perfect) { s.job.attention = Math.max(0, s.job.attention - 6); rep(s, 'town', 3, false); rep(s, 'tower', 2, false); }
  else if (f.errors >= 2) rep(s, 'town', -2, false);
  s.recent.ledgerCaseResult = perfect ? 'perfect' : f.errors >= 2 ? 'sloppy' : 'fair';
  log(s, `Case closed: ${f.correct}/${total} right. +${pay} crowns.${perfect ? ' Brannic almost smiles.' : ''}`, perfect ? 'good' : f.errors >= 2 ? 'warn' : 'info');
  if (s.job.attention >= B.ATTENTION_FIRED) { s.job.firedUntilDay = day(s) + 7; s.job.attention = 40; log(s, 'Brannic closes the ledger in your face. "Come back in a week. Maybe."', 'bad'); }
  s.caseFile = null;
  return { pay, correct: f.correct, errors: f.errors, perfect };
}

// ---------- Old Mill and the Shade Patriarch (pass 3) ----------
export function enterMill(s: GameState) {
  const first = !s.flags.millEntered; s.flags.millEntered = true;
  const warn: string[] = [];
  if (s.needs.hydration < 1100) warn.push('thirsty');
  if (s.needs.calories < 1200) warn.push('hungry');
  if (s.inventory.bandage + s.inventory.medkit === 0) warn.push('without bandages');
  if (s.ammo.mag + s.ammo.reserve < 12) warn.push('low on rounds');
  if (warn.length) log(s, `You go down into the Old Mill ${warn.join(', ')}. The cold down here dries you out.`, 'warn');
  else if (first) log(s, "The Old Mill. Damp stone, a wheel that hasn't turned in years, and something breathing below.", 'info');
  return warn;
}
/** Inside the mill the cold dries you out: about 50 ml per real minute on top of normal thirst. */
export function millTick(s: GameState, dt: number) { s.needs.hydration = clampNeed('hydration', s.needs.hydration - 0.8 * dt); }
export function touchMillCheckpoint(s: GameState): boolean { if (s.flags.millCheckpoint) return false; s.flags.millCheckpoint = true; log(s, 'You light the old waystone in the mill. If you fall down here, you will wake beside it.', 'good'); return true; }
export function readNote(s: GameState, id: string, text: string) { if (!s.flags.notesRead.includes(id)) { s.flags.notesRead.push(id); } log(s, text, 'info'); }
export function defeatPatriarch(s: GameState) {
  if (s.flags.millCleared) return;
  s.flags.millCleared = true; s.flags.patriarchDay = day(s);
  s.crowns += 60; s.inventory.ember++;
  s.job.attention = Math.max(0, s.job.attention - 15);
  rep(s, 'town', 12, false); rep(s, 'chapel', 8, false); rep(s, 'tower', 4, false);
  s.needs.stress = clampNeed('stress', s.needs.stress - 15);
  log(s, "The Shade Patriarch comes apart like smoke in wind. Something warm is left in the ash: the Patriarch's Ember. (+60 crowns)", 'good');
}
/** Hand the Ember to Aldric's clerk: it was the Voss family ward-stone. Takes up to 50 off the debt. */
export function giveEmber(s: GameState): boolean {
  if (s.inventory.ember <= 0 || s.flags.emberGiven) return false;
  s.inventory.ember--; s.flags.emberGiven = true;
  const off = Math.min(50, s.debt); s.debt -= off; rep(s, 'tower', 10, false);
  log(s, `The clerk turns the Ember over and goes quiet. "This was the Voss ward-stone." He strikes ${off} crowns from the debt.`, 'good');
  if (s.debt <= 0) { s.gameover = 'won'; log(s, 'The debt is paid. The house is yours.', 'good'); }
  return true;
}

export function serialize(s: GameState, extra: unknown): string { return JSON.stringify({ s, extra }); }
export function deserialize(json: string): { s: GameState; extra: any } | null {
  try {
    const o = JSON.parse(json);
    if (!o || !o.s || typeof o.s.minutes !== 'number') return null;
    if (![1, 2, 3, 4, 5].includes(o.s.version)) return null;
    if (o.s.version === 1) { // migrate v0.1 saves
      Object.assign(o.s, { version: 2, factions: { town: 0, tower: -10, chapel: 0, watch: 0, ashRoad: 0 }, factionTouched: { town: 1, tower: 1, chapel: 1, watch: 1, ashRoad: 1 }, savings: 0, carryingCrate: false, upgrades: { featherBed: false }, talkedToday: {} });
      if (o.s.ammo?.mag > 6) o.s.ammo.mag = 6;
    }
    if (o.s.version === 2) { // migrate v0.2 saves
      o.s.version = 3;
      o.s.inventory = { ...B.EMPTY_INV(), ...o.s.inventory };
      o.s.storage = { ...B.EMPTY_INV(), ration: 2, bandage: 1 };
      Object.assign(o.s, { buffs: {}, spellReadyAt: {}, rt: 0, npcMemory: {}, ledgerCases: 0, caseFile: null,
        flags: { millEntered: false, millCleared: false, patriarchDay: 0, emberGiven: false, notesRead: [], millCheckpoint: false },
        recent: { lastCombatMin: -9999, lastKillKind: '', lastCastMin: -9999, healsToday: 0, washedMin: -9999, ledgerCaseResult: '' } });
    }
    if (o.s.version === 3) { // migrate v0.3 saves
      o.s.version = 4;
      Object.assign(o.s, NEW_V4());
      o.s.upgrades = { ...HOME_UPS(), ...o.s.upgrades };
      if (o.s.flags?.emberGiven) o.s.story.ember = 'tower';
      if (o.s.debt <= 0) o.s.story.debtCleared = true;
    }
    if (o.s.version === 4) o.s.version = 5; // v0.6 saves: the new fields are filled below
    o.s.factions = { town: 0, tower: -10, chapel: 0, watch: 0, ashRoad: 0, ashford: 0, fernhollow: 0, gullhaven: 0, ...o.s.factions }; o.s.factionTouched = { town: 1, tower: 1, chapel: 1, watch: 1, ashRoad: 1, ashford: 1, fernhollow: 1, gullhaven: 1, ...o.s.factionTouched };
    // forward-compatible fill: anything a newer build added and this save lacks
    o.s.inventory = { ...B.EMPTY_INV(), ...o.s.inventory }; o.s.storage = { ...B.EMPTY_INV(), ...o.s.storage };
    { const d = NEW_V4(); for (const k of Object.keys(d) as (keyof typeof d)[]) if (o.s[k] === undefined) o.s[k] = d[k]; o.s.skills = { ...d.skills, ...o.s.skills }; o.s.gear = { ...d.gear, ...o.s.gear }; o.s.story = { ...newStory(), ...o.s.story }; o.s.upgrades = { ...HOME_UPS(), ...o.s.upgrades }; }
    o.s.spellReadyAt = {}; o.s.rt = 0;
    for (const k of B.NEED_KEYS) if (!Number.isFinite(o.s.needs?.[k])) return null;
    return o;
  } catch { return null; }
}
/** Physician's kit: stitches the worst wound outright and restores 15 health. 30 minutes. */
export function useMedkit(s: GameState): boolean {
  if (s.inventory.medkit <= 0 || s.wounds.length === 0) return false;
  s.inventory.medkit--;
  const w = s.wounds.sort((a, b) => b.severity - a.severity).shift()!;
  advanceMinutes(s, 30, 'rest');
  s.hp = Math.min(maxHp(s), s.hp + 15); addXp(s, 'medicine', 30);
  log(s, `You stitch the ${w.label.toLowerCase()} closed with the physician's kit.`, 'good');
  return true;
}

// ---------- pass 4: skills, traits, gear, tallies ----------
export function level(s: GameState, k: SkillId): number { return levelOf(s.skills[k] ?? 0); }
export function hasTrait(s: GameState, t: TraitId): boolean { return s.traits.includes(t); }
export function addXp(s: GameState, k: SkillId, amount: number) {
  const before = levelOf(s.skills[k] ?? 0);
  s.skills[k] = (s.skills[k] ?? 0) + amount;
  const after = levelOf(s.skills[k]);
  if (after > before) { log(s, `${SKILLS[k].name} is now level ${after}. ${SKILLS[k].per}`, 'good'); s.story.flags.levelUp = (s.story.flags.levelUp ?? 0) + 1; }
}
export function addTrait(s: GameState, t: TraitId): boolean {
  if (s.traits.includes(t)) return false;
  s.traits.push(t);
  log(s, `${TRAITS[t].good ? 'You have changed' : 'Something in you has changed'}: ${TRAITS[t].name}. ${TRAITS[t].desc}`, TRAITS[t].good ? 'good' : 'bad');
  return true;
}
export function removeTrait(s: GameState, t: TraitId) { s.traits = s.traits.filter(x => x !== t); }
/** Add to a lifetime tally and return the new value. Keys starting "today:" reset each morning. */
export function count(s: GameState, key: string, by = 1): number { return (s.counters[key] = (s.counters[key] ?? 0) + by); }
export const tally = (s: GameState, key: string) => s.counters[key] ?? 0;
export function manaCost(s: GameState, id: SpellId): number { return Math.round(B.SPELLS[id].mana * (1 - 0.02 * level(s, 'spellcraft')) * (id === 'spark' && s.charm === 'charmCopper' ? 0.75 : 1) * 10) / 10; }
/** Multiplier on spell damage from skill and traits. */
export function spellPower(s: GameState): number { return (1 + 0.03 * level(s, 'spellcraft')) * (hasTrait(s, 'wardTouched') ? 1.15 : 1); }
export function revolverDamage(s: GameState, target?: string, silver = false): number {
  const base = s.firearm === 'revolver' ? (s.gear.rifled ? B.REVOLVER_DAMAGE_RIFLED : B.REVOLVER_DAMAGE) : B.GUNS[s.firearm].damage;
  return base * (1 + 0.015 * level(s, 'marksman')) * (silver && target && B.UNDEAD.includes(target) ? B.SILVER_MULT : 1);
}
/** v0.9: the guns you own (the revolver always). */
export function ownedGuns(s: GameState): B.FirearmId[] { return B.FIREARM_IDS.filter(g => g === 'revolver' || s.gear[g as B.GearId]); }
export function setFirearm(s: GameState, g: B.FirearmId): boolean {
  if (!ownedGuns(s).includes(g) || s.firearm === g) return false;
  s.firearm = g; log(s, `You take up the ${B.GUNS[g].name.toLowerCase()}.`, 'info'); return true;
}
export function meleeDamage(s: GameState): number { return s.gear.ironStaff ? B.MELEE_DAMAGE_IRON : B.MELEE_DAMAGE; }
export function reloadTime(s: GameState): number { return s.firearm !== 'revolver' ? B.GUNS[s.firearm].reload : s.gear.loader ? B.RELOAD_TIME_LOADER : B.RELOAD_TIME; }
/** The gun in slot 1, and its loaded / spare rounds. */
export const firearm = (s: GameState) => s.firearm ?? 'revolver';
export function gunRounds(s: GameState): { mag: number; size: number; spare: number } {
  if (s.firearm === 'scattergun' || s.firearm === 'longrifle') { const g = B.GUNS[s.firearm], st = s.guns[s.firearm]; return { mag: st.mag, size: g.mag, spare: st.reserve + s.inventory[g.ammo] * g.perBox }; }
  return s.firearm === 'carbine' ? { mag: s.rifle.mag, size: B.CARBINE_MAG, spare: s.rifle.reserve + s.inventory.carbineammo * 8 } : { mag: s.ammo.mag, size: MAG_SIZE, spare: s.ammo.reserve + s.inventory.ammo * 6 + s.inventory.silverammo * 6 };
}
/** Aim spread multiplier from skill, trauma and a fouled barrel (on top of the needs penalty). */
export function aimMult(s: GameState): number { return (1 - 0.05 * level(s, 'marksman')) * (hasTrait(s, 'shakyHands') ? 1.2 : 1) * (s.firearm === 'revolver' && s.revolverCond < B.COND_FOUL ? 1.5 : 1) * (buffActive(s, 'keenEye') ? 0.8 : 1) * B.GUNS[s.firearm ?? 'revolver'].aim; }
export function carryCap(s: GameState): number { return B.CARRY_CAPACITY + (s.gear.satchel ? 6 : 0) + 0.6 * level(s, 'vigor'); }
export function moveMult(s: GameState): number { return (hasTrait(s, 'badKnee') ? 0.94 : 1) * (s.charm === 'charmHare' ? 1.06 : 1) * (s.gear.boots ? 1.05 : 1); }
export function ledgerPayMult(s: GameState): number { return (1 + 0.04 * level(s, 'ledger')) * (hasTrait(s, 'cleanHands') ? 1.1 : 1); }
export const today = (s: GameState) => dayInfo(day(s), s.seed);
export function dayPriceMult(s: GameState): number { return today(s).event === 'market' ? 0.85 : 1; }
/** Pull the trigger: the round may be missing, or a fouled gun may misfire (the round is kept). */
/** Whether the last revolver round fired was silvered. */
export let lastSilver = false;
export function tryFire(s: GameState): 'ok' | 'empty' | 'misfire' {
  if (s.firearm === 'carbine') { if (s.rifle.mag <= 0) return 'empty'; s.rifle.mag--; count(s, 'shots'); return 'ok'; }
  if (s.firearm === 'scattergun' || s.firearm === 'longrifle') { const st = s.guns[s.firearm]; if (st.mag <= 0) return 'empty'; st.mag--; count(s, 'shots'); return 'ok'; }
  if (s.ammo.mag <= 0) return 'empty';
  if (s.revolverCond < B.COND_MISFIRE && ((s.stats.kills * 7 + s.ammo.mag * 13 + Math.floor(s.rt * 3)) % 8) === 0) return 'misfire';
  s.ammo.mag--; s.revolverCond = Math.max(0, s.revolverCond - B.COND_PER_SHOT); count(s, 'shots');
  if (s.silverIn > 0) { s.silverIn = Math.min(s.silverIn - 1, s.ammo.mag); lastSilver = true; } else lastSilver = false;
  return 'ok';
}
export function shotHit(s: GameState) { addXp(s, 'marksman', 4); count(s, 'hits'); }
/** Rain and storms make the outdoors miserable: called by the game loop while you stand in them. */
export function wetTick(s: GameState, dt: number) {
  const w = today(s).weather; if (!isWet(w) || s.gear.oilskin || s.charm === 'charmSalt') return;
  s.needs.comfort = clampNeed('comfort', s.needs.comfort - (w === 'storm' ? 9 : 5) * dt / 60);
  if (w === 'storm') s.needs.stress = clampNeed('stress', s.needs.stress + 3 * dt / 60);
}
export const clampNeedPublic = clampNeed;

// ---------- the Sunken Chapel and the Cinder Wraith (pass 4) ----------
export function enterChapel(s: GameState): string[] {
  const first = !s.story.flags.chapelEntered; s.story.flags.chapelEntered = 1;
  const warn: string[] = [];
  if (s.needs.hydration < 1100) warn.push('thirsty');
  if (s.needs.calories < 1200) warn.push('hungry');
  if (s.inventory.bandage + s.inventory.medkit + s.inventory.draught === 0) warn.push('without bandages or draughts');
  if (s.ammo.mag + s.ammo.reserve + s.inventory.ammo * 6 < 18) warn.push('low on rounds');
  if (!s.story.sparkLearned) warn.push('without Spark');
  if (warn.length) log(s, `You wade down into the Sunken Chapel ${warn.join(', ')}. The water is cold enough to hurt.`, 'warn');
  else if (first) log(s, 'The Sunken Chapel. Black water to the knee, drowned pews, and somewhere ahead a light that is the wrong colour for a candle.', 'info');
  return warn;
}
/** Wading in the flooded nave chills you: comfort drains and you tire faster. */
export function chapelTick(s: GameState, dt: number, wading: boolean) {
  if (!wading) return;
  s.needs.comfort = clampNeed('comfort', s.needs.comfort - 0.35 * dt);
  s.needs.fatigue = clampNeed('fatigue', s.needs.fatigue + 0.03 * dt);
}
export function touchChapelCheckpoint(s: GameState): boolean { if (s.story.flags.chapelCheckpoint) return false; s.story.flags.chapelCheckpoint = 1; log(s, 'You light the waystone in the crypt. If you fall in the sanctum, you will wake beside it.', 'good'); return true; }
export function defeatWraith(s: GameState) {
  if (s.story.flags.chapelCleared) return;
  s.story.flags.chapelCleared = 1; s.story.flags.wraithDay = day(s);
  s.crowns += 80; count(s, 'crownsEarned', 80); s.inventory.censer++;
  s.job.attention = Math.max(0, s.job.attention - 10);
  rep(s, 'town', 10, false); rep(s, 'chapel', 10, false); rep(s, 'watch', 5, false);
  s.needs.stress = clampNeed('stress', s.needs.stress - 15);
  log(s, 'The Cinder Wraith folds in on itself like paper in a fire, and for a moment a tired man in a brother\'s robe is standing there. Then only the Censer, still swinging. (+80 crowns from the altar plate)', 'good');
}
