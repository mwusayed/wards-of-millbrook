// Things that happen at your door in the morning (Mercenary Maintenance's hub events): small choices
// with real consequences. Which event fires is fixed by the day and the save's seed.
import * as B from './balance';
import * as G from './state';
import type { GameState } from './state';
import { mulberry32 } from './rng';
import { cleanRevolver } from './town';

export interface DoorOption { label: string; cond?: (s: GameState) => boolean; run: (s: GameState) => string }
export interface DoorEvent { id: string; title: string; text: string; when: (s: GameState) => boolean; options: DoorOption[] }
const clamp = G.clampNeedPublic;
const F = (s: GameState, k: string) => s.story.flags[k] ?? 0;

export const DOOR_EVENTS: DoorEvent[] = [
  { id: 'pilgrim', title: 'A pilgrim at the door', text: 'A dusty woman with a Quiet Flame token round her neck asks, very politely, for water and a crust before the last mile to the Chapel.', when: () => true, options: [
    { label: 'Give her a loaf and fill her flask', cond: s => s.inventory.bread > 0, run: s => { s.inventory.bread--; G.rep(s, 'chapel', 3, false); s.needs.stress = clamp('stress', s.needs.stress - 4); return 'She blesses the house, the hearth and, after a look at it, the revolver. You feel lighter all morning.'; } },
    { label: 'Water only', run: s => { G.rep(s, 'chapel', 1, false); return 'She drinks, thanks you, and goes on toward the square.'; } },
    { label: 'Send her on', run: () => 'She nods as if she expected it and goes on up the road.' },
  ] },
  { id: 'pip', title: 'Pip on the doorstep', text: 'The urchin Pip is asleep against your door with one of Bram\'s loaves hugged to his chest like a cat.', when: s => G.day(s) >= 2, options: [
    { label: 'Bring him in to eat by the fire', run: s => { G.rep(s, 'town', 2, false); s.inventory.herbs += 2; s.needs.stress = clamp('stress', s.needs.stress - 3); return 'He eats, talks without breathing for ten minutes, and leaves two bunches of Vale herbs on the table "for rent".'; } },
    { label: 'Walk him and the loaf back to Bram', run: s => { G.rep(s, 'town', 1, false); s.inventory.bread++; G.advanceMinutes(s, 15, 'active'); return 'Bram pretends to be angry, gives the boy the loaf anyway, and gives you one too for your trouble.'; } },
    { label: 'Tell the Watch', run: s => { G.rep(s, 'watch', 2, false); G.rep(s, 'town', -3, false); return 'Sergeant Vole collects him by the ear. Half the square watches you do it.'; } },
  ] },
  { id: 'reminder', title: 'A slip under the door', text: 'Tolan\'s boy has left a slip of Tower paper: "Instalment due. Master Voss is particular."', when: s => s.debt > 0 && s.nextDueDay - G.day(s) <= 2 && s.paidThisCycle < B.INSTALMENT && F(s, 'audit') < 2, options: [
    { label: 'Send the boy back with 10 crowns', cond: s => s.crowns >= 10, run: s => { G.payDebt(s, 10); return 'The boy counts it twice on your step and runs. Ten crowns nearer.'; } },
    { label: 'Keep the slip', run: s => { s.needs.stress = clamp('stress', s.needs.stress + 4); return 'You put it on the mantel where you will see it. That was a mistake.'; } },
  ] },
  { id: 'tinker', title: 'A tinker with a grindstone', text: 'A travelling tinker has set his wheel down by your gate. "Knives ground, locks eased, pistols cleaned. Two crowns, and I tell no stories."', when: s => s.revolverCond < 85, options: [
    { label: 'Hand him the revolver (2 crowns)', cond: s => s.crowns >= 2, run: s => { cleanRevolver(s, 'tinker'); return 'He strips it on a rag faster than you can follow and hands it back smelling of oil.'; } },
    { label: 'Not today', run: () => 'He shrugs, shoulders the wheel and walks on.' },
  ] },
  { id: 'leak', title: 'The roof', text: 'Last night\'s rain found a way in. There is a steady drip onto the foot of your bed and a dark patch spreading on the beam.', when: s => { const y = G.day(s) - 1; return y >= 1 && ['rain', 'storm'].includes(require_days().dayInfo(y, s.seed).weather); }, options: [
    { label: 'Climb up and fix it yourself (an hour)', run: s => { G.advanceMinutes(s, 60, 'active'); s.needs.fatigue = clamp('fatigue', s.needs.fatigue + 6); G.addXp(s, 'vigor', 15); return 'Two slates reseated, one thumb hit. It holds.'; } },
    { label: "Pay Dorran's boy 5 crowns", cond: s => s.crowns >= 5, run: s => { s.crowns -= 5; G.rep(s, 'town', 1, false); return 'He is up and down the ladder before your tea is cold.'; } },
    { label: 'Put a pot under it', run: s => { s.needs.comfort = clamp('comfort', s.needs.comfort - 12); return 'Plink. Plink. Plink. All day.'; } },
  ] },
  { id: 'basket', title: 'A basket on the step', text: 'A covered basket, still warm, with a sprig of something green tucked in the cloth. No note; none needed.', when: s => s.factions.chapel >= 10 || s.factions.town >= 15, options: [
    { label: 'Take it in', run: s => { s.inventory.herbs += 2; s.inventory.honeycake++; return 'Honey cakes and a bundle of herbs. Somebody in Millbrook has decided you are worth feeding.'; } },
  ] },
  { id: 'collector', title: "Aldric's man", text: 'A large man in Tower grey is leaning on your gatepost when you open the door. He does not come in. He does not need to.', when: s => s.missed > 0 && s.debt > 0, options: [
    { label: 'Pay him 20 crowns on the spot', cond: s => s.crowns >= 20, run: s => { G.payDebt(s, 20); return '"Master Voss will be told." He takes his time leaving.'; } },
    { label: 'Promise it by the due day', run: s => { s.needs.stress = clamp('stress', s.needs.stress + 8); return '"He counts promises too," says the man, and goes.'; } },
  ] },
  { id: 'ashroad', title: 'A quiet knock', text: 'A thin man you half recognise from the back of the Tankard. "You carry more rounds than you fire. I know people who fire more than they carry. Eight crowns a box."', when: s => s.inventory.ammo >= 2, options: [
    { label: 'Sell him one box of rounds (+8 crowns)', run: s => { s.inventory.ammo--; s.crowns += 8; G.rep(s, 'ashRoad', 3, false); G.rep(s, 'watch', -1, false); return 'He is gone before the coins stop being warm.'; } },
    { label: 'Close the door', run: s => { G.rep(s, 'watch', 1, false); return 'He tips an imaginary hat at the wood.'; } },
  ] },
  { id: 'dream', title: 'A dream of Ysolde', text: 'You wake with your aunt\'s voice still in the room, mid-lecture: something about the wrist, and not gripping the staff as if it owed you money.', when: s => G.tally(s, 'reads') >= 2, options: [
    { label: 'Write it down before it fades', run: s => { G.addXp(s, 'spellcraft', 25); s.needs.stress = clamp('stress', s.needs.stress - 5); return 'It fills half a page of her notebook, in your handwriting. It is good advice.'; } },
  ] },
];
// days.ts is imported lazily to keep this module free of an import cycle at load time
import * as DAYS from './days';
function require_days() { return DAYS; }

/** About one morning in three, something is at your door. Never on day 1, never the same event twice running. */
export function pickDoorEvent(s: GameState): DoorEvent | null {
  const d = G.day(s); if (d < 2 || F(s, 'doorDay') === d) return null;
  const r = mulberry32(d * 4099 + s.seed * 7 + 19);
  if (r() > 0.38) return null;
  const pool = DOOR_EVENTS.filter(e => e.when(s) && F(s, 'lastDoor:' + e.id) < d - 3);
  if (!pool.length) return null;
  const e = pool[Math.floor(r() * pool.length)];
  s.story.flags.doorDay = d; s.story.flags['lastDoor:' + e.id] = d;
  return e;
}
export function runDoorOption(s: GameState, e: DoorEvent, i: number): string {
  const o = e.options.filter(x => !x.cond || x.cond(s))[i]; if (!o) return '';
  const text = o.run(s); G.log(s, `${e.title}: ${text}`, 'info'); G.count(s, 'doorEvents');
  return text;
}
