// Pass 3 living-world feed. Rules watch real state; each has a priority and a cooldown so the feed
// stays alive without nagging. Events (a cast, a kill, a shop visit) are pushed by the game and go
// through the same cooldown gate. Pure TS.
import * as B from './balance';
import type { GameState } from './state';
import { day, hour, maxHp, loadState, activeBuffs } from './state';

export type FeedKind = 'survival' | 'combat' | 'reputation' | 'finance' | 'explore' | 'npc' | 'magic';
export interface FeedLine { text: string; kind: FeedKind; prio: number; at: number }
export interface FeedCtx { holstered: boolean; place: 'home' | 'town' | 'vale' | 'mill' | 'office' | 'ashford' | 'reach' | 'march' | 'fernhollow' | 'coast' | 'gullhaven'; nearNpc: string | null; inBoss: boolean }

type Rule = { id: string; kind: FeedKind; prio: number; cooldown: number; when: (s: GameState, c: FeedCtx) => boolean; say: (s: GameState, c: FeedCtx) => string[] };

const R: Rule[] = [
  { id: 'starving', kind: 'survival', prio: 3, cooldown: 90, when: s => s.needs.calories < B.T.starving, say: () => ['Your hands shake. Your body is burning muscle now; eat something.', 'Hunger is a fist in your gut. Anything would do.'] },
  { id: 'dehydrated', kind: 'survival', prio: 3, cooldown: 90, when: s => s.needs.hydration < B.T.dehydrated, say: () => ['Your tongue sticks to your teeth. Your mana has stopped refilling until you drink.', 'Headache behind the eyes: dehydration. No water, no mana.'] },
  { id: 'thirstMana', kind: 'magic', prio: 2, cooldown: 120, when: s => s.needs.hydration < 1100 && s.needs.hydration >= B.T.dehydrated && s.mana < B.manaMax(s.needs) * 0.5, say: () => ['Your mana trickles back slowly. You are thirsty, and magic drinks from you.'] },
  { id: 'exhausted', kind: 'survival', prio: 2, cooldown: 120, when: s => s.needs.fatigue > 80, say: () => ['Your eyelids are lead. If you don\'t sleep soon, you will sleep where you stand.'] },
  { id: 'bladder', kind: 'survival', prio: 2, cooldown: 90, when: s => s.needs.bladder > B.T.bladderUrge, say: () => ['You badly need the privy.'] },
  { id: 'filthy', kind: 'survival', prio: 1, cooldown: 240, when: s => s.needs.hygiene < B.T.hygieneLow, say: () => ['You smell of the Vale. People will notice, and Brannic certainly will.', 'Mud, sweat and powder. A shower at home would fix it.'] },
  { id: 'wounded', kind: 'combat', prio: 2, cooldown: 120, when: s => s.wounds.length > 0 && s.hp >= maxHp(s) - 1, say: s => [`Your health is as full as your ${s.wounds[0].label.toLowerCase()} allows. Mending won't close it; a bandage will.`] },
  { id: 'lowHp', kind: 'combat', prio: 3, cooldown: 40, when: s => s.hp < maxHp(s) * 0.3, say: () => ['You\'re badly hurt. Mend, bandage, or get out.'] },
  { id: 'heavy', kind: 'survival', prio: 1, cooldown: 180, when: s => loadState(s).band === 'heavy', say: () => ['Your pack drags at your shoulders. Stamina comes back slower.'] },
  { id: 'over', kind: 'survival', prio: 2, cooldown: 120, when: s => loadState(s).band !== 'light' && loadState(s).band !== 'heavy', say: () => ['You\'re carrying too much to run. Leave something in the chest at home.'] },
  { id: 'gunTown', kind: 'npc', prio: 2, cooldown: 60, when: (s, c) => !c.holstered && (c.place === 'town' || c.place === 'ashford' || c.place === 'fernhollow' || c.place === 'gullhaven') && !!c.nearNpc, say: (s, c) => [`${npcName(c.nearNpc!)} notices your drawn revolver and steps back. (H to holster)`] },
  { id: 'debtDue', kind: 'finance', prio: 2, cooldown: 300, when: s => s.nextDueDay - day(s) <= 1 && s.paidThisCycle < B.INSTALMENT && s.debt > 0, say: s => [`Aldric's instalment is due ${s.nextDueDay === day(s) ? 'today' : 'tomorrow'}. ${B.INSTALMENT - s.paidThisCycle} crowns still to pay.`] },
  { id: 'debtLate', kind: 'finance', prio: 2, cooldown: 600, when: s => s.missed > 0 && s.paidThisCycle < B.INSTALMENT, say: () => ['Aldric\'s patience is wearing thin. The debt remains unpaid.'] },
  { id: 'attention', kind: 'reputation', prio: 2, cooldown: 400, when: s => s.job.attention >= 70 && s.job.attention < B.ATTENTION_FIRED, say: () => ['Brannic has been watching your work closely. One more sloppy shift could cost you the job.'] },
  { id: 'millNews', kind: 'explore', prio: 2, cooldown: 99999, when: s => s.flags.millCleared && day(s) > s.flags.patriarchDay, say: () => ['Word of your actions at the Old Mill has reached the village. People nod at you in the square.'] },
  { id: 'night', kind: 'explore', prio: 1, cooldown: 600, when: (s, c) => c.place === 'vale' && (hour(s) >= 21 || hour(s) < 5), say: () => ['Night in the Vale. The hounds are bolder, and you can see less.'] },
  // v0.8: the Westmarch
  { id: 'downsNight', kind: 'explore', prio: 2, cooldown: 900, when: (s, c) => c.place === 'march' && (hour(s) >= 20 || hour(s) < 5) && (s.story.flags.crownFate ?? 0) !== 1, say: () => ['Lights on the Downs, low among the barrows. Where the lights go, the dead follow.', 'The heath is very quiet. Too quiet for wolves. Something colder is out tonight.'] },
  { id: 'lakeMist', kind: 'explore', prio: 1, cooldown: 1200, when: (s, c) => c.place === 'fernhollow' && (hour(s) < 9 || hour(s) >= 19) && !(s.story.flags.crownFate ?? 0), say: () => ['Mist comes off Lake Hallow in slow white sheets and lies in the lanes.', 'The lake is flat as pewter. No birds on it.'] },
  // v0.9: the Saltway Coast
  { id: 'tideTurn', kind: 'explore', prio: 2, cooldown: 600, when: (s, c) => (c.place === 'coast' || c.place === 'gullhaven') && ((s.minutes % 1440) / 60 > 9.4 && (s.minutes % 1440) / 60 < 10 || (s.minutes % 1440) / 60 > 21.4 && (s.minutes % 1440) / 60 < 22), say: () => ['The tide has turned. Out on the flats the channels are filling, quietly, from the far end first.', 'The sea is coming back in over the flats. Anyone out at the wreck has half an hour.'] },
  { id: 'gulls', kind: 'explore', prio: 1, cooldown: 1500, when: (s, c) => c.place === 'gullhaven' && hour(s) >= 6 && hour(s) < 19, say: () => ['Gulls fight over a fish head on the quay with the dedication of lawyers.', 'A gull lands on a bollard, looks at you, and decides you have nothing worth stealing.'] },
  { id: 'lighthouseBeam', kind: 'explore', prio: 1, cooldown: 1500, when: (s, c) => (c.place === 'coast' || c.place === 'gullhaven') && (hour(s) >= 20 || hour(s) < 5), say: s => [(s.story.flags.trewinCleared ?? 0) > 0 ? 'The lighthouse beam swings over the bay, steady as a heartbeat. Nobody on the quay looks up at it any more; that is what trust looks like.' : 'The lighthouse beam swings over the bay. Every time it passes, someone on the quay looks up at it, and then away.'] },
  { id: 'buffEnd', kind: 'survival', prio: 1, cooldown: 60, when: s => activeBuffs(s).some(b => b.left < 10), say: s => [`${B.BUFFS[activeBuffs(s).find(b => b.left < 10)!.id].name} is wearing off.`] },
];
function npcName(id: string) { return ({ bree: 'Bree Calloway', jowan: 'Jowan Penhale', trewin: 'Keeper Trewin', marrow: 'Collector Marrow', morwenna: 'Morwenna Kitto', nan: 'Nan Polgreen', tegen: 'Tegen Rowse', elowen: 'Sister Elowen', jago: 'Captain Vosper', pasco: 'Pasco Hendy', lowdy: 'Lowdy Pengelly', treloar: 'Old Treloar', bram: 'Bram', sera: 'Sera', brannic: 'Brannic', tolan: 'Tolan', vole: 'Sergeant Vole', petch: 'Old Petch', hesk: 'Orla Hesk', teague: 'Davin Teague', liss: 'Liss', tobin: 'Tobin Crake', ebba: 'Ebba Rook', marra: 'Marra Quill' } as Record<string, string>)[id] ?? 'Someone'; }

// One-shot events pushed by the game. Lines read the state at the moment of the event.
export const EVENTS = {
  cast: (s: GameState, spell: B.SpellId) => s.needs.calories < 900 ? 'Your stomach tightens as the spell drains the last of your energy.' : spell === 'heal' ? 'Warmth knits the torn flesh. Your stomach growls for it.' : null,
  castNoMana: (s: GameState) => s.needs.hydration < B.T.dehydrated ? 'Nothing comes. You are too dry for magic; drink first.' : 'Your mana is spent. It returns faster when you\'ve had water.',
  drinkLowMana: (s: GameState) => s.mana < B.manaMax(s.needs) * 0.5 ? 'The water eases your thirst, but your magical reserves are still recovering.' : null,
  healCapped: (s: GameState) => s.wounds.length ? `Mending can't close your ${s.wounds[0].label.toLowerCase()}. Your max health stays lower until it's bandaged.` : null,
  kill: (s: GameState, kind: string) => s.stats.kills === 1 ? 'Your first kill. Your hands don\'t stop shaking for a while.' : s.stats.kills % 10 === 0 ? `${s.stats.kills} kills now. The Watch has started to keep count.` : null,
  shopGun: (npc: string) => `${npcName(npc)} notices your unholstered revolver and steps back.`,
  bossPhase: (phase: number) => phase === 2 ? 'The Patriarch tears free of the millstone. The dark thickens; watch the floor.' : phase === 3 ? 'He staggers, guttering. Now: fire hurts him most.' : null,
};

export class Feed {
  lines: FeedLine[] = [];
  private last: Record<string, number> = {};
  private gapUntil = 0;   // game-minute gate between any two feed lines
  /** Evaluate rules (call about once a real second). Only the single highest-priority eligible rule fires. */
  tick(s: GameState, c: FeedCtx): FeedLine | null {
    if (s.minutes < this.gapUntil) return null;
    let best: Rule | null = null;
    for (const r of R) {
      if (s.minutes - (this.last[r.id] ?? -1e9) < r.cooldown) continue;
      if (c.inBoss && r.prio < 3 && r.kind !== 'combat') continue; // keep the boss fight readable
      if (!r.when(s, c)) continue;
      if (!best || r.prio > best.prio) best = r;
    }
    if (!best) return null;
    const opts = best.say(s, c);
    return this.emit(s, best.id, opts[(day(s) + s.stats.kills) % opts.length], best.kind, best.prio, best.cooldown);
  }
  /** Push a one-shot event line; it still respects a per-id cooldown. */
  push(s: GameState, id: string, text: string | null, kind: FeedKind, prio = 2, cooldown = 20): FeedLine | null {
    if (!text) return null;
    if (s.minutes - (this.last[id] ?? -1e9) < cooldown) return null;
    return this.emit(s, id, text, kind, prio, cooldown);
  }
  private emit(s: GameState, id: string, text: string, kind: FeedKind, prio: number, _cd: number): FeedLine {
    this.last[id] = s.minutes; this.gapUntil = s.minutes + (prio >= 3 ? 2 : 6);
    const l = { text, kind, prio, at: s.minutes };
    this.lines.push(l); if (this.lines.length > 30) this.lines.shift();
    return l;
  }
  save() { return { last: this.last, gap: this.gapUntil }; }
  /** P1: a load replaces the whole feed gate (cooldowns and the gap); nothing carries over from the session. */
  load(o: any) { this.last = o?.last && typeof o.last === 'object' ? { ...o.last } : {}; this.gapUntil = Number.isFinite(o?.gap) ? o.gap : 0; }
}
