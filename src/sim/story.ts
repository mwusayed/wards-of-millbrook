// Quests and the story of Wards of Millbrook. The main chain is Ledger & Ward's "The Wardbreak"
// (Old Mill → Ember and Echo → Sunken Chapel → the gate) fused with the debt to Aldric Voss.
// Quests are data: each stage has a line of text and a test on real game state, or a conversation.
import * as B from './balance';
import * as G from './state';
import type { GameState, Fate } from './state';
import * as W from './west';
import * as SO from './south';

export interface TalkOpt { npc: string; label: string; reply: string | ((s: GameState) => string); cond?: (s: GameState) => boolean; then?: (s: GameState) => void }
export interface Stage { text: string | ((s: GameState) => string); done?: (s: GameState) => boolean; where?: string | ((s: GameState) => string); enter?: (s: GameState) => void; talks?: TalkOpt[] }
export interface Quest {
  id: string; name: string; kind: 'main' | 'side'; blurb: string;
  available: (s: GameState) => boolean;
  auto?: boolean;                      // starts by itself when available
  offer?: TalkOpt;                     // or is offered by someone
  startLog?: string;
  stages: Stage[];
  reward?: (s: GameState) => void; rewardText?: string;
}
const F = (s: GameState, k: string) => s.story.flags[k] ?? 0;
export const flag = F;
export function setFlag(s: GameState, k: string, v = 1) { s.story.flags[k] = v; }
const qDone = (s: GameState, id: string) => s.quests[id]?.state === 'done';
const qActive = (s: GameState, id: string) => s.quests[id]?.state === 'active';
export const questDone = qDone, questActive = qActive;
const nightNow = (s: GameState) => G.hour(s) >= 20 || G.hour(s) < 4;
const crowns = (s: GameState, n: number) => { s.crowns += n; G.count(s, 'crownsEarned', n); };

// ---- what a ward-stone can become ----
export const STONE: Record<'ember' | 'censer', { name: string; relief: number }> = { ember: { name: "Patriarch's Ember", relief: 50 }, censer: { name: "Acolyte's Censer", relief: 60 } };
export function decideStone(s: GameState, which: 'ember' | 'censer', fate: Exclude<Fate, ''>): boolean {
  if (s.story[which] !== '' || s.inventory[which] <= 0) return false;
  s.inventory[which]--; s.story[which] = fate; if (which === 'ember') s.flags.emberGiven = true;
  const st = STONE[which];
  if (fate === 'tower') {
    const off = Math.min(st.relief, s.debt); s.debt -= off; G.rep(s, 'tower', 10, false); G.rep(s, 'chapel', -4, false);
    G.log(s, which === 'ember' ? `Tolan turns the Ember over and goes quiet. "This was the Voss ward-stone." He strikes ${off} crowns from the debt.` : `Tolan wraps the Censer in black cloth without touching it. ${off} crowns come off the debt.`, 'good');
    if (s.debt <= 0) G.debtCleared(s, 'The stone settles the last of it. The house is yours.');
  } else if (fate === 'chapel') {
    G.rep(s, 'chapel', 15, false); G.rep(s, 'town', 8, false); G.rep(s, 'tower', -8, false);
    G.log(s, which === 'ember' ? 'Maren sets the Ember in the cold brazier. It catches. Out on the Mill Road, something that was listening stops.' : 'Maren hangs the Censer over the Quiet Flame. The smoke runs east, toward the drowned road, and the air in town tastes cleaner.', 'good');
  } else {
    G.addTrait(s, 'wardTouched'); G.rep(s, 'tower', -6, false); G.rep(s, 'chapel', -6, false); G.rep(s, 'ashRoad', 4, false);
    G.log(s, which === 'ember' ? 'You bind the Ember into the head of your staff with wire. It hums when you think about fire.' : 'You set the Censer beside the Ember in your staff. The two stones argue, then agree.', 'warn');
  }
  return true;
}
/** How many of the two recovered stones went each way. */
export function stoneCount(s: GameState, f: Exclude<Fate, ''>): number { return (s.story.ember === f ? 1 : 0) + (s.story.censer === f ? 1 : 0); }
/** A relit ward calms its part of the Vale (fewer ambient enemies there). */
export const wardLit = (s: GameState, which: 'ember' | 'censer') => s.story[which] === 'chapel' || (s.story[which] === 'tower' && s.story.wardsDone);

const ATTUNE = ['mill_road', 'raider_camp', 'whisper_stones'];
const attuned = (s: GameState) => ATTUNE.filter(k => F(s, 'attune:' + k)).length;

export const QUESTS: Quest[] = [
  // ───────────── main chain ─────────────
  {
    id: 'mq0', name: 'A Roof and a Debt', kind: 'main', auto: true, available: () => true,
    blurb: 'Aunt Ysolde left you a stone house at the edge of Millbrook, and the 300 crowns she still owed on it.',
    startLog: 'Your first morning in Ysolde\'s house. Start with the basics: your body first, then the debt.',
    stages: [
      { text: 'Eat something and drink at home (hearth, cistern)', done: s => G.tally(s, 'ate') > 0 && G.tally(s, 'drank') > 0, where: 'hearth' },
      { text: 'Wash at the basin or take a shower', done: s => G.tally(s, 'washed') > 0, where: 'basin' },
      { text: 'Ask Tolan at the Counting House about the debt', where: 'npc:tolan', talks: [{ npc: 'tolan', label: 'About my aunt\'s debt…', reply: '"Ysolde Hale, three hundred crowns, secured on the house. Sixty by the end of every seventh day. Miss two and Master Voss takes the keys." He taps the book. "I only hold the pen. He holds the paper."' }] },
      { text: 'Earn some coin: work for Brannic at the ledger desk, or take a notice from the board', done: s => s.job.shifts + s.ledgerCases + s.contractsDone > 0, where: 'board' },
      { text: s => `Pay Tolan this week's instalment (${Math.min(B.INSTALMENT, G.tally(s, 'debtPaid'))}/${B.INSTALMENT} crowns)`, done: s => G.tally(s, 'debtPaid') >= B.INSTALMENT || s.debt <= 0, where: 'clerk' },
    ],
    reward: s => { G.rep(s, 'town', 4, false); s.inventory.bandage++; s.inventory.oil++; },
    rewardText: 'Sera sends over a bandage and a tin of gun oil: "Ysolde always paid on time. Start as you mean to go on."',
  },
  {
    id: 'mq1', name: 'The Wardbreak', kind: 'main', auto: true,
    available: s => (s.quests.mq0?.stage ?? 0) >= 3 || G.day(s) >= 3 || s.flags.millEntered,
    blurb: 'Shades are coming out of the Old Mill. The stone that kept them asleep has gone dark.',
    startLog: 'People in the square are talking about lights at the Old Mill. Old Petch has asked for you by name.',
    stages: [
      { text: 'Speak with Old Petch in the square', where: 'npc:petch', done: s => F(s, 'q:mq1:0') > 0 || s.flags.millCleared, talks: [{ npc: 'petch', label: 'You asked for me?', reply: '"Three stones kept the dark out of this valley, child. The Ember under the mill, the Censer in the chapel that sank, the Keystone up in Voss\'s Spire. The Ember went dark the night Miller Hask went down to look. Your aunt meant to relight it. She ran out of time, not nerve. The hatch is beside the ruined wheel, on the Mill Road. Take fire. He fears fire."' }] },
      { text: 'Find the cellar hatch by the ruined mill, south-west in the Vale', done: s => s.flags.millEntered, where: 'mill_door' },
      { text: 'Go down through the mill. Light the waystone when you find it', done: s => s.flags.millCheckpoint || s.flags.millCleared, where: 'mill_door' },
      { text: 'Defeat the Shade Patriarch', done: s => s.flags.millCleared, where: 'mill_door' },
      { text: 'Decide who gets the Ember: Tolan (the Tower), Maren (the Chapel), or keep it (use it from your pack)', done: s => s.story.ember !== '', where: s => 'npc:maren',
        talks: [
          { npc: 'tolan', label: 'Give the Ember to the Tower (50 off the debt)', cond: s => s.inventory.ember > 0, reply: '"Master Voss will be… relieved. It goes back in the Spire vault, where it should have stayed." He writes for a long time.', then: s => decideStone(s, 'ember', 'tower') },
          { npc: 'maren', label: 'Give the Ember to the Chapel (relight the mill ward)', cond: s => s.inventory.ember > 0, reply: '"Ysolde carried a coal from our flame to that mill every winter. You have just finished her errand." Maren does not thank you. She lights the brazier.', then: s => decideStone(s, 'ember', 'chapel') },
        ] },
    ],
    reward: s => { crowns(s, 25); G.rep(s, 'watch', 5, false); s.inventory.draught++; },
    rewardText: 'Captain Renn sends 25 crowns from the Watch purse and a healing draught: "For the mill. Don\'t spend it at the Tankard."',
  },
  {
    id: 'mq2', name: 'Ember and Echo', kind: 'main', auto: true, available: s => qDone(s, 'mq1'),
    blurb: 'The Ember answered something further off. Lira Voss thinks the Vale\'s old waystones can tell you where.',
    startLog: 'A note under your door, in a neat hand: "The Ember had an echo. Come to the Spire. — L. Voss"',
    stages: [
      { text: 'Speak with Lira Voss at the foot of Aldric\'s Spire', where: 'npc:lira', talks: [{ npc: 'lira', label: 'You wrote about an echo.', reply: '"When the Ember woke, a second stone rang back, faintly, from somewhere wet. My uncle will not discuss it. I will." She presses a chalk-marked pebble into your hand. "Touch this to the three waystone cairns in the Vale. Each will pull toward the echo. Three pulls make a place."' }] },
      { text: s => `Attune at the three waystone cairns in the Vale (${attuned(s)}/3)`, done: s => attuned(s) >= 3, where: s => 'cairn_' + (ATTUNE.find(k => !F(s, 'attune:' + k)) ?? 'whisper_stones') },
      { text: 'Bring what the cairns showed you back to Lira', where: 'npc:lira', talks: [{ npc: 'lira', label: 'All three pulled north-east.', reply: '"Past the Whisper Stones, where the pilgrim road goes under the water. The Sunken Chapel. Of course it is." She takes your staff, turns it once, and something in it clicks. "You will want this. Lightning does not care how wet a thing is. Key six."', then: s => { s.story.sparkLearned = true; } }] },
    ],
    reward: s => { crowns(s, 20); G.rep(s, 'tower', 5, false); G.addXp(s, 'spellcraft', 40); },
    rewardText: 'Lira has taught you Spark: lightning that jumps between enemies. She also counts out 20 crowns "for boots".',
  },
  {
    id: 'mq3', name: 'The Sunken Chapel', kind: 'main', auto: true, available: s => qDone(s, 'mq2'),
    blurb: 'The second ward-stone lies in a drowned chapel in the north-east of the Vale. Something burning keeps it company.',
    startLog: 'The Sunken Chapel lies north-east of the Whisper Stones. Go prepared: water, food, bandages, and more than one way of hurting things.',
    stages: [
      { text: 'Find the Sunken Chapel, north-east of the Whisper Stones', done: s => F(s, 'chapelEntered') > 0, where: 'chapel_door' },
      { text: s => `Open both sluice valves to drain the nave (${F(s, 'valveA') + F(s, 'valveB')}/2)`, done: s => F(s, 'valveA') + F(s, 'valveB') >= 2 || F(s, 'chapelCleared') > 0, where: 'chapel_door' },
      { text: 'Light the chapel waystone before the sanctum', done: s => F(s, 'chapelCheckpoint') > 0 || F(s, 'chapelCleared') > 0, where: 'chapel_door' },
      { text: 'Defeat the Cinder Wraith. It learns: do not hit it the same way three times running', done: s => F(s, 'chapelCleared') > 0, where: 'chapel_door' },
      { text: 'Decide who gets the Censer: Tolan (the Tower), Maren (the Chapel), or keep it (use it from your pack)', done: s => s.story.censer !== '', where: 'npc:maren',
        talks: [
          { npc: 'tolan', label: 'Give the Censer to the Tower (60 off the debt)', cond: s => s.inventory.censer > 0, reply: '"Two stones in the vault. Master Voss may even sleep." Tolan does not look as pleased as his words.', then: s => decideStone(s, 'censer', 'tower') },
          { npc: 'maren', label: 'Give the Censer to the Chapel (relight the pilgrim road ward)', cond: s => s.inventory.censer > 0, reply: '"It was ours before the water took it." Maren\'s hands shake when she takes the chain. "Brother Aldous carried it down there to keep it burning. You met what was left of him."', then: s => decideStone(s, 'censer', 'chapel') },
        ] },
    ],
    reward: s => { crowns(s, 40); G.rep(s, 'town', 6, false); G.rep(s, 'watch', 4, false); },
    rewardText: 'The town council votes you 40 crowns. Bram adds a honey cake nobody voted on.',
  },
  {
    id: 'mq4', name: 'Wardbreak Night', kind: 'main', auto: true, available: s => qDone(s, 'mq3'),
    blurb: 'With two stones moved, whatever is left in the Vale is coming for the third. It has to pass the South Gate first.',
    startLog: 'Captain Renn wants you at the South Gate. "They are massing at the tree line. All of them."',
    stages: [
      { text: 'Speak with Captain Renn at the South Gate', where: 'npc:renn', talks: [{ npc: 'renn', label: 'What do you need?', reply: '"Every shade, hound and hungry fool left in the Vale is coming for the Spire tonight, and the Spire is behind my gate. I have six guards and a sergeant. I need a mage with a gun. Eat. Sleep if you can. Be here after eight in the evening."' }] },
      { text: 'After 20:00, tell Renn you are ready (bring water, food and bandages)', where: 'npc:renn', done: s => F(s, 'gateStarted') > 0 || F(s, 'gateHeld') > 0, talks: [{ npc: 'renn', label: 'I\'m ready. Close the gate behind me.', cond: s => nightNow(s), reply: '"Then we hold. Three pushes, I\'d guess. Don\'t let them reach the posts."', then: s => setFlag(s, 'gateStarted') }, { npc: 'renn', label: 'When do you need me?', cond: s => !nightNow(s), reply: '"After eight. They don\'t like the light. Rest by your fire until then if you have nothing better to do."' }] },
      { text: s => F(s, 'gateStarted') ? `Hold the South Gate (wave ${Math.min(3, F(s, 'gateWave') || 1)} of 3)` : 'The gate held without you last night. After 20:00, tell Renn you are ready to try again', done: s => F(s, 'gateHeld') > 0, where: s => F(s, 'gateStarted') ? 'gate' : 'npc:renn',
        talks: [{ npc: 'renn', label: 'I\'m ready to try again.', cond: s => nightNow(s) && !F(s, 'gateStarted'), reply: '"Then get out there. Same as before: three pushes."', then: s => setFlag(s, 'gateStarted') }] },
      { text: 'Aldric Voss has come down from the Spire. Speak with him', where: 'npc:aldric', talks: [{ npc: 'aldric', label: 'Master Voss.', reply: s => aldricVerdict(s).speech, then: s => { const v = aldricVerdict(s); if (v.relief) { const off = Math.min(v.relief, s.debt); s.debt -= off; } s.story.wardsDone = true; s.story.ending = v.id; if (s.debt <= 0) G.debtCleared(s, v.debtLine); } }] },
    ],
    reward: s => { G.rep(s, 'town', 10, false); G.rep(s, 'watch', 10, false); G.addTrait(s, 'hardened'); },
    rewardText: 'Millbrook saw you stand at the gate. Nobody in this town will forget it.',
  },
  // ───────────── the ledger thread ─────────────
  {
    id: 'redink', name: 'Red Ink', kind: 'side', available: s => s.ledgerCases >= 1,
    blurb: 'Brannic says the Voss debt book does not cast. He will not say more to a clerk he cannot trust.',
    offer: { npc: 'brannic', label: 'You wanted to say something about the Voss book?', reply: '"Not here." He lowers his voice anyway. "The Tower\'s debt book has never once failed to balance, and no honest book is that lucky. Close three case files without a single error and I will let you look at it. Not before."' },
    stages: [
      { text: s => `Close 3 case files with no mistakes (${Math.min(3, G.tally(s, 'perfectCases'))}/3)`, done: s => G.tally(s, 'perfectCases') >= 3, where: 'ledger_desk' },
      { text: 'Ask Brannic for the Voss debt book', where: 'npc:brannic', talks: [{ npc: 'brannic', label: 'Three clean files. Show me the book.', reply: '"Tolan is at the Tankard until two. Sit at my desk. Start with your aunt\'s page; I think you will find it interesting."', then: s => setFlag(s, 'auditOpen') }] },
      { text: 'Work through the Voss audit at Brannic\'s desk (any error and you must start again tomorrow)', done: s => F(s, 'auditSolved') > 0, where: 'ledger_desk' },
      { text: 'Decide what to do with the audit: confront Tolan, take it to Captain Renn, or bring it to Lira Voss', done: s => F(s, 'audit') > 0, where: 'npc:renn',
        talks: [
          { npc: 'tolan', label: 'I\'ve read your book, Tolan. All of it.', cond: s => s.inventory.auditfile > 0, reply: '"…Ah." He closes the ledger very gently. "A hundred and twenty crowns your aunt paid that I… deferred. They come off. And thirty for yourself, for the trouble. We need never mention the ward-tax." His hand is already writing.', then: s => resolveAudit(s, 1) },
          { npc: 'renn', label: 'Captain, you should see these working papers.', cond: s => s.inventory.auditfile > 0, reply: 'Renn reads standing up, twice. "Ward-tax collected, never spent on wards. Repayments taken, never posted." She folds the papers into her coat. "Sergeant Vole will have a word with the Tower\'s clerk. Your aunt\'s hundred and twenty comes off tonight."', then: s => resolveAudit(s, 2) },
          { npc: 'lira', label: 'Your uncle\'s clerk has been keeping two sets of truth.', cond: s => s.inventory.auditfile > 0, reply: 'Lira goes white, then red. "He told my uncle the town would not pay. The town had paid." She is gone up the Spire stairs for an hour. When she comes back: "Tolan is dismissed. A hundred and fifty off your page, with my uncle\'s apology, which I have never before seen him write."', then: s => resolveAudit(s, 3) },
        ] },
    ],
    reward: s => { G.addXp(s, 'ledger', 80); G.addTrait(s, 'cleanHands'); },
    rewardText: 'Brannic slides your working papers back across the desk. "That is the best bookkeeping this house has seen in ten years." It is the nicest thing he has ever said.',
  },
  // ───────────── side quests ─────────────
  {
    id: 'bakers', name: "Baker's Delivery", kind: 'side', available: s => G.day(s) >= 2,
    blurb: 'Bram needs five loaves at the Gilded Tankard before the noon rush, and his knees say no.',
    offer: { npc: 'bram', label: 'Need a hand with anything?', reply: '"Five loaves for Tomlin at the Tankard, and my knees won\'t do the square twice today. Take them over and there\'s six crowns and a loaf in it."', then: s => { s.inventory.bread += 5; setFlag(s, 'bakersLoaves', 5); } },
    stages: [
      { text: 'Carry the five loaves to Tomlin at the Gilded Tankard (don\'t eat them)', where: 'npc:tomlin', talks: [{ npc: 'tomlin', label: 'Bram\'s bread, as ordered.', cond: s => s.inventory.bread >= 5, reply: '"Still warm! Tell Bram he\'s a saint with flour on." Tomlin counts the loaves twice anyway.', then: s => { s.inventory.bread -= 5; } }, { npc: 'tomlin', label: 'About Bram\'s loaves…', cond: s => s.inventory.bread < 5, reply: '"Five, he said. I count fewer. Buy what\'s missing from his stall and come back."' }] },
      { text: 'Tell Bram it\'s done', where: 'npc:bram', talks: [{ npc: 'bram', label: 'Delivered. Tomlin says you\'re a saint.', reply: '"A saint with bad knees. Here." Six crowns and a loaf, as promised.' }] },
    ],
    reward: s => { crowns(s, 6); s.inventory.bread++; G.rep(s, 'town', 4, false); },
    rewardText: '+6 crowns, a loaf, and Bram and Tomlin both think better of you.',
  },
  {
    id: 'herbs', name: "Maren's Herbs", kind: 'side', available: s => G.day(s) >= 2,
    blurb: 'Maren needs three moonpetals for fever medicine. They only open in the Vale at night.',
    offer: { npc: 'maren', label: 'Can I help the Chapel?', reply: '"Moonpetal. Three blooms. It opens only after dark, in the wet ground by the Vale\'s cairns and standing stones. The pilgrims bring fever with them and I am out." She looks at your revolver. "Go armed. Come back whole."' },
    stages: [
      { text: s => `Gather 3 moonpetals in the Vale at night (${Math.min(3, s.inventory.moonpetal)}/3)`, done: s => s.inventory.moonpetal >= 3, where: 'cairn_whisper_stones' },
      { text: 'Bring the moonpetals to Maren', where: 'npc:maren', talks: [{ npc: 'maren', label: 'Three moonpetals.', cond: s => s.inventory.moonpetal >= 3, reply: '"Good blooms. You cut them clean." She is already grinding. "The Chapel sells you draughts at a fair price from now on, and this one is a gift."', then: s => { s.inventory.moonpetal -= 3; } }] },
    ],
    reward: s => { G.rep(s, 'chapel', 10, false); s.inventory.draught += 2; },
    rewardText: 'Two healing draughts, and the Chapel of the Quiet Flame counts you a friend.',
  },
  {
    id: 'cart', name: 'The Missing Cart', kind: 'side', available: s => s.contractsDone >= 1,
    blurb: 'Sera\'s supply cart never came back from the ford road.',
    offer: { npc: 'sera', label: 'You look like you\'re counting something that isn\'t there.', reply: '"My cart. My nephew drove it out past the ford three days ago with half my stock. The mule came back. The boy walked in barefoot yesterday and won\'t say what he saw. Find the cart. Bring me the strongbox. I don\'t care what you do to whoever has it."' },
    stages: [
      { text: 'Find the wrecked cart on the road east of the raider camp', done: s => F(s, 'cartFound') > 0, where: 'cart' },
      { text: 'Carry Sera\'s strongbox back to her (you cannot run with it)', where: 'npc:sera', talks: [{ npc: 'sera', label: 'Your strongbox.', cond: s => F(s, 'cartFound') > 0, reply: 'Sera opens it, counts, and for the first time since you met her she breathes out all the way. "Prices for you just changed."', then: s => { s.carryingCrate = false; } }] },
    ],
    reward: s => { crowns(s, 18); G.rep(s, 'town', 8, false); setFlag(s, 'seraFriend'); },
    rewardText: '+18 crowns. Sera sells to you 10% cheaper from now on.',
  },
  {
    id: 'lure', name: "Fenn's Lucky Lure", kind: 'side', available: s => s.stats.kills >= 3,
    blurb: 'Fenn Marlow the hunter lost his brass lure by the pond near the Mill Road. He swears his luck went with it.',
    offer: { npc: 'fenn', label: 'You\'re Fenn Marlow? The hunter?', reply: '"Was. Haven\'t taken so much as a rabbit since I dropped my lure at the reed pond, west of the Mill Road. Brass spinner, my father\'s. Hounds den near there now. Fetch it and I\'ll tell you where the game runs. I can\'t pay much."' },
    stages: [
      { text: 'Search the reed pond west of the Mill Road for a brass lure', done: s => s.inventory.lure > 0 || F(s, 'lureGiven') > 0, where: 'pond' },
      { text: 'Return the lure to Fenn at the Tankard, or keep it (it is said to be lucky)', where: 'npc:fenn', done: s => F(s, 'lureGiven') > 0 || F(s, 'lureKept') > 0, talks: [
        { npc: 'fenn', label: 'Found it. Here.', cond: s => s.inventory.lure > 0, reply: '"Ha! Feel that? No, you wouldn\'t." Fenn kisses the brass. "Hounds den under the mill wheel and by the fallen oak; you\'ll find their pelts worth the walk. And take these. I owe you."', then: s => { s.inventory.lure--; setFlag(s, 'lureGiven'); s.inventory.pelt += 2; s.inventory.ration += 2; G.rep(s, 'town', 5, false); } },
        { npc: 'fenn', label: 'I looked. Nothing there. (Keep the lure)', cond: s => s.inventory.lure > 0, reply: 'Fenn\'s face closes. "Aye. Well. Thanks for looking." He goes back to his cup.', then: s => { setFlag(s, 'lureKept'); G.addTrait(s, 'lucky'); G.rep(s, 'town', -3, false); } },
      ] },
    ],
    rewardText: 'Fenn\'s lure is settled, one way or the other.',
  },
  {
    id: 'ring', name: "Widow Cael's Ring", kind: 'side', available: s => G.day(s) >= 3,
    blurb: 'Widow Cael left her wedding ring on a standing stone, forty years ago, as an offering. She wants it back before she dies.',
    offer: { npc: 'cael', label: 'Good day, Mistress Cael.', reply: '"You\'re Ysolde\'s. You have her way of standing." She takes your sleeve. "I left my ring on the tallest of the Whisper Stones the night my Harn went into the Vale. An offering. He did not come back, so the stones did not keep their side. I want it back. I am too old to be polite about it."' },
    stages: [
      { text: 'Search the tallest of the Whisper Stones for a ring', done: s => s.inventory.ring > 0 || qDone(s, 'ring'), where: 'cairn_whisper_stones' },
      { text: 'Bring the ring to Widow Cael', where: 'npc:cael', talks: [{ npc: 'cael', label: 'Is this it?', cond: s => s.inventory.ring > 0, reply: 'She does not put it on. She holds it in her fist against her chest. After a while: "Ysolde would have gone too. Take this. It was Harn\'s, and it\'s no use to a ghost."', then: s => { s.inventory.ring--; } }] },
    ],
    reward: s => { G.rep(s, 'town', 6, false); G.rep(s, 'chapel', 3, false); s.ammo.reserve += 12; s.inventory.oil++; },
    rewardText: 'Harn Cael\'s cartridge belt: 12 revolver rounds and a tin of oil, forty years old and perfectly kept.',
  },
  {
    id: 'well', name: 'The Cursed Well', kind: 'side', available: s => qDone(s, 'mq1') || G.day(s) >= 6,
    blurb: 'The square\'s well has started to taste of ash. People are drinking from rain barrels.',
    offer: { npc: 'petch', label: 'What\'s wrong with the well?', reply: '"Tastes of ash since the mill woke. Something of the Vale has got into the water. It will only show itself at night. Maren can give you salt for it; you will have to stand over the well and hold your ground while the salt works."', then: s => setFlag(s, 'wellTainted') },
    stages: [
      { text: 'Ask Maren for blessed salt', where: 'npc:maren', talks: [{ npc: 'maren', label: 'Petch says you have salt for the well.', reply: '"Here. Pour it in after dark and do not leave until the water stops moving. It will not like being asked to go."', then: s => setFlag(s, 'hasSalt') }] },
      { text: 'After dark, pour the salt into the well in the square and deal with what comes out', done: s => F(s, 'wellCleansed') > 0, where: 'well' },
      { text: 'Tell Old Petch the well is clean', where: 'npc:petch', talks: [{ npc: 'petch', label: 'The well is clean.', reply: '"I heard. Half the square heard." He draws a cup and drinks it slowly, watching you over the rim. "Sweet again. Your aunt would be unbearable about this."' }] },
    ],
    reward: s => { crowns(s, 15); G.rep(s, 'town', 10, false); G.rep(s, 'chapel', 4, false); setFlag(s, 'wellTainted', 0); },
    rewardText: '+15 crowns from the square\'s collection plate. The well is sweet again.',
  },
  {
    id: 'coat', name: 'Three Pelts', kind: 'side', available: s => s.inventory.pelt + s.storage.pelt > 0 || G.tally(s, 'kills:hound') >= 2,
    blurb: 'Dorran pads his coats with hound pelt. Bring him three and he will owe you.',
    offer: { npc: 'dorran', label: 'Do you buy hound pelts?', reply: '"Sera buys. I line coats with them. Bring me three good pelts and I\'ll knock a quarter off anything in this forge for you, for good."' },
    stages: [
      { text: s => `Bring Dorran 3 hound pelts (${Math.min(3, s.inventory.pelt)}/3 in your pack)`, where: 'npc:dorran', talks: [{ npc: 'dorran', label: 'Three pelts.', cond: s => s.inventory.pelt >= 3, reply: 'Dorran runs a thumb against the grain of each. "Clean kills. Good." He hangs them by the forge. "Quarter off. I don\'t forget."', then: s => { s.inventory.pelt -= 3; setFlag(s, 'dorranFriend'); } }] },
    ],
    reward: s => { G.rep(s, 'town', 4, false); },
    rewardText: 'Everything at Dorran\'s smithy now costs you 25% less.',
  },
  // ───────────── v0.7: the Eastern Reach ─────────────
  {
    id: 'eq1', name: 'The Road East', kind: 'main', available: s => qDone(s, 'mq1') || G.day(s) >= 4,
    blurb: 'Sergeant Vole has a sealed dispatch for the Reeve of Ashford, a river town two hours east of Millbrook.',
    offer: { npc: 'vole', label: 'Anything that needs carrying east?', reply: '"Funny you should ask." Vole fishes a sealed letter out of his coat. "Ashford\'s copper mine went quiet nine days ago, and their Reeve wants Millbrook\'s Watch to know it, in case whatever did it wanders west. Reeve Garrow, the Hall on the square. Out the new East Gate, follow the road past the farm, over the Wend. Or take Joss\'s coach if your feet are soft."', then: s => { s.inventory.dispatch = 1; } },
    stages: [
      { text: 'Follow the East Road out of the East Gate, over the River Wend to Ashford', where: 'ashford', done: s => s.discovered.includes('place:ashford') },
      { text: 'Give Vole\'s dispatch to Reeve Garrow in the Reeve\'s Hall, on the square', where: 'npc:garrow', talks: [{ npc: 'garrow', label: 'A dispatch from Millbrook\'s Watch.', cond: s => s.inventory.dispatch > 0, reply: 'Garrow breaks the seal, reads it twice and folds it very small. "Vole is thorough. Thank him." He looks at you properly. "You found Millbrook\'s stones, I hear. Then perhaps you can find fourteen miners. Nobody else will go up there."', then: s => { s.inventory.dispatch = 0; } }] },
    ],
    reward: s => { crowns(s, 20); G.rep(s, 'ashford', 10, false); G.rep(s, 'watch', 4, false); },
    rewardText: '+20 crowns. Ashford knows your name now; the coach and the Lodge are open to you.',
  },
  {
    id: 'eq2', name: 'Copper and Silence', kind: 'main', auto: true, available: s => qDone(s, 'eq1'),
    blurb: 'Copper Hollow, the mine north of Ashford, went silent nine days ago. Foreman Brask took fourteen men down. One came back.',
    startLog: 'Reeve Garrow wants to know what happened in Copper Hollow. Start with the people who saw the miners come back.',
    stages: [
      { text: 'Ask Mother Ilse about the miners who came back (the apothecary on the main street)', where: 'npc:ilse', talks: [{ npc: 'ilse', label: 'The Reeve says the miners who came back were sick.', reply: '"One miner came back. The rest of them came back in his head." She grinds something green. "Tam Ferrow. He coughs copper and he will not sleep indoors. He sits by the warehouses on the docks. Take him something hot or he will not even look at you."' }] },
      { text: s => s.inventory.eelpie > 0 ? 'Find Tam Ferrow by the dock warehouses and give him the eel pie' : 'Find Tam Ferrow by the dock warehouses (take him something hot: an eel pie from Wenna at the Drowned Lantern)', where: 'npc:tam', done: s => s.inventory.liftkey > 0 || F(s, 'liftkeyGiven') > 0, talks: [
        { npc: 'tam', label: 'Here. Eel pie, still hot. Tell me about the Hollow.', cond: s => s.inventory.eelpie > 0, reply: 'Tam eats half the pie before he speaks. "Brask broke through into the old vault. A seam in there that hums. And something stood up in front of it, stone and copper, like a smith built a man. It didn\'t chase us. It just stood up." He pushes an iron key at you. "The lift key. Brask gave it me to hold. The cage goes down to the deep gallery. Don\'t stand in front of it."', then: s => { s.inventory.eelpie--; s.inventory.liftkey = 1; setFlag(s, 'liftkeyGiven'); G.rep(s, 'ashford', 4, false); } },
        { npc: 'tam', label: 'Tam. I\'m going down there. Tell me what happened.', cond: s => s.inventory.eelpie <= 0, reply: 'Tam turns his face to the warehouse wall. "Go away." Behind you, Kit stage-whispers: "He likes Wenna\'s eel pie."' },
      ] },
      { text: 'Take the hill road north from Ashford\'s North Gate to Copper Hollow, and go in', where: 'copper_hollow', done: s => F(s, 'mineEntered') > 0 },
      { text: 'Ride the lift cage down to the deep gallery and find out what happened to Brask', where: s => F(s, 'mineEntered') ? 'mine_lift' : 'copper_hollow', done: s => s.inventory.journal > 0 || F(s, 'journalRead') > 0 },
      { text: 'Face what waits in the Wardwrights\' Vault, past the deep gallery', where: 'vault', done: s => F(s, 'engineDown') > 0 },
      { text: 'Decide what becomes of the ward-copper seam (at the seam, in the Vault)', where: 'vault', done: s => F(s, 'seamFate') > 0 },
      { text: 'Report to Reeve Garrow in Ashford', where: 'npc:garrow', talks: [{ npc: 'garrow', label: 'The Hollow is quiet. Here is what I found.', reply: s => F(s, 'seamFate') === 1 ? '"Sealed. The heart back in the seam and the Engine left to sleep." Garrow is quiet for a while. "The Lodge will grumble and the guild will shout. I will tell them both a warden made a decision I would have been too much of a coward to make. Here. The town\'s thanks, such as the purse allows."' : F(s, 'seamFate') === 2 ? '"Open. Ashford\'s guild will work it, and Ashford will eat this winter." He counts out a heavy purse without looking at it. "You have made a great many people rich, starting with yourself. I hope the stones down there forgive us."' : '"The Tower." Garrow\'s mouth goes thin. "Voss will have his heart of copper, and his wards, and his debts. I suppose that is his right; it was his family that set the Engine there." He pays you, correctly and not one crown more.' }] },
    ],
    reward: s => { const f = F(s, 'seamFate'); crowns(s, f === 2 ? 0 : f === 1 ? 45 : 30); G.rep(s, 'ashford', f === 2 ? 15 : f === 1 ? 8 : 2, false); setFlag(s, 'reachDone'); },
    rewardText: 'Copper Hollow is quiet again, and the Reach remembers who went down.',
  },
  {
    id: 'eq3', name: "Brask's Last Page", kind: 'side', auto: true, available: s => s.inventory.journal > 0 && !qDone(s, 'eq3'),
    blurb: 'Foreman Brask\'s journal, found in the deep gallery. Sela Brask asked to read the last page, "even if".',
    stages: [{ text: 'Bring Brask\'s journal to Sela Brask (the market square by day, her house by night)', where: 'npc:sela', talks: [{ npc: 'sela', label: 'I found his journal. I\'m sorry.', cond: s => s.inventory.journal > 0, reply: 'Sela reads the last page standing up, then sits on the fountain\'s edge and reads it again. "He wrote that he was sorry for the noise he made coming home late." She laughs, terribly. Then she presses something into your hand: a salt locket on a cord. "His. For luck below ground. It didn\'t work for him. Maybe it was waiting for you."', then: s => { s.inventory.journal--; s.inventory.charmSalt++; } }] }],
    reward: s => { G.rep(s, 'ashford', 6, false); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress + 4); },
    rewardText: 'Sela gave you Brask\'s salt locket (a charm: wear it from your pack).',
  },
  {
    id: 'eq4', name: 'Wolves at the Fold', kind: 'side', available: s => s.discovered.includes('place:brookfield'),
    blurb: 'Thornwood wolves have been taking Hobb Varley\'s sheep after dark.',
    offer: { npc: 'hobb', label: 'You look like a man who isn\'t sleeping.', reply: '"I\'m not. The wolves come down out of Thornwood after dark, four or five, bold as bailiffs. I sit up with a pitchfork and they laugh at me. Wait by the pen one night and put them off for good, and I\'ll pay what I can and feed you besides."' },
    stages: [
      { text: 'Wait by the Brookfield sheep pen after dark (from 20:00) and drive off the wolves', where: 'brookfield', done: s => F(s, 'foldDone') > 0 },
      { text: 'Tell Hobb Varley the pen is safe', where: 'npc:hobb', talks: [{ npc: 'hobb', label: 'Your sheep can sleep. So can you.', reply: 'Hobb shakes your hand for a long time. "Wheel of cheese. Dozen eggs. And you eat at my table whenever you come by, and Nell will talk your ear off, and that\'s a warning."', then: s => { s.inventory.cheese++; s.inventory.eggs += 2; } }] },
    ],
    reward: s => { crowns(s, 28); G.rep(s, 'ashford', 8, false); setFlag(s, 'hobbFriend'); },
    rewardText: '+28 crowns, cheese and eggs. Hobb\'s farm gate prices drop for you.',
  },
  {
    id: 'eq5', name: 'Bluebell', kind: 'side', available: s => s.discovered.includes('place:brookfield') && G.day(s) >= 3,
    blurb: 'Nell Varley\'s ewe, Bluebell, got out three nights ago and went up the Thornwood trail.',
    offer: { npc: 'nell', label: 'Bluebell? Your sheep?', reply: '"Grey face, one ear tagged, and she thinks she\'s a dog. She went up the Thornwood trail. Da says she\'s gone. Da doesn\'t know Bluebell." Nell looks at you with enormous seriousness. "Please?"' },
    stages: [
      { text: 'Search the Thornwood trail, past the woodcutters\' clearing, for Bluebell', where: 'ewe', done: s => F(s, 'eweFound') > 0 },
      { text: 'Lead Bluebell back to Nell at Brookfield (she will not be hurried)', where: 'npc:nell', talks: [{ npc: 'nell', label: 'Someone wants to see you.', cond: s => F(s, 'eweFound') > 0, reply: 'Nell makes a sound only dogs should hear and buries her face in Bluebell\'s fleece. When she comes up for air she gives you a lump of resin with a four-leaf clover in it. "For luck. I found it the day Bluebell was born. It\'s the luckiest thing I have except her."', then: s => { s.carryingCrate = false; s.inventory.charmClover++; } }] },
    ],
    reward: s => { G.rep(s, 'ashford', 5, false); s.inventory.apple += 4; },
    rewardText: 'Nell gave you a four-leaf clover in resin (a charm) and an apron full of apples.',
  },
  {
    id: 'eq6', name: 'The Toll', kind: 'side', available: s => s.discovered.includes('place:ashford'),
    blurb: 'An Ash Road gang has made a fort of the old toll tower and taxes everything on the East Road.',
    offer: { npc: 'dace', label: 'The toll on the East Road. Is that the Lodge\'s business?', reply: '"It is now." Morrow taps a map. "Crossbowmen, five or six, in the ruin of the old tower. They let the pedlar and the coach through, which tells me someone is paying for passage. Break them. Bring me whatever they keep in that chest of theirs; I want to know who\'s paying."' },
    stages: [
      { text: 'Break the Ash Road toll at the old tower (crossbowmen: use cover, side-step when they aim)', where: 'toll', done: s => F(s, 'tollCleared') > 0 },
      { text: 'Search the bandits\' chest at the toll tower', where: 'toll_chest', done: s => s.inventory.ledgerpage > 0 || F(s, 'ledgerRead') > 0 },
      { text: 'Show the coded ledger page to Reeve Garrow, or to Brannic in Millbrook', where: 'npc:garrow', talks: [
        { npc: 'garrow', label: 'The toll gang\'s ledger. It\'s in code.', cond: s => s.inventory.ledgerpage > 0, reply: 'Garrow reads it like a man reading his own obituary. "Shipments west. Carbines, ward-copper. Paid for by a house in Millbrook." He does not say which house. He does not have to; he looks toward the Spire. "I will write to your Captain Renn. Quietly."', then: s => { s.inventory.ledgerpage = 0; setFlag(s, 'ledgerRead', 1); G.rep(s, 'ashford', 8, false); G.rep(s, 'watch', 5, false); } },
        { npc: 'brannic', label: 'Can you read this? It\'s Ash Road.', cond: s => s.inventory.ledgerpage > 0, reply: 'Brannic decodes it in ten minutes with a pencil. "Carbines and ward-copper, west, through Millbrook. Paid by…" He stops, rubs the number out, writes it again. "By the Tower\'s own account. Tolan\'s hand." He folds it into his coat. "I will keep this. It is the kind of paper that keeps a clerk alive."', then: s => { s.inventory.ledgerpage = 0; setFlag(s, 'ledgerRead', 2); G.rep(s, 'tower', -6, false); G.addXp(s, 'ledger', 30); } },
      ] },
    ],
    reward: s => { crowns(s, 45); G.rep(s, 'ashRoad', -10, false); },
    rewardText: '+45 crowns. The East Road is free again.',
  },
  // ───────────── v0.8: the Westmarch ─────────────
  {
    id: 'wq1', name: 'The Sealed Gate', kind: 'main', available: s => qDone(s, 'mq1') || G.day(s) >= 5,
    blurb: 'Millbrook\'s West Gate has been barred for nine years. Old Petch says the lake village beyond it, Fernhollow, has not sent the post in a month.',
    offer: { npc: 'petch', label: 'Petch. What is behind the West Gate?', reply: '"Heath. Barrows. A lake, and a village on it called Fernhollow that sold us eels and peat when I was young." Petch looks at his hands. "They closed the gate in the fever year, and nobody thought to open it again. But Fernhollow\'s post-rider came through the Vale every month regardless, and he has not come for one. Someone should knock. Renn keeps the key, and she will not like it."' },
    stages: [
      { text: 'Ask Captain Renn for the West Gate key (the South Gate by day, the square at midday)', where: 'npc:renn', done: s => s.inventory.westkey > 0 || F(s, 'westGateOpen') > 0, talks: [{ npc: 'renn', label: 'I need the key to the West Gate.', reply: '"No." Renn looks at you for a long moment. "Petch put you up to this. Fine. The fever is nine years gone and I am tired of pretending a wall is a cure." She works an iron key off her ring. "If anything follows you back, you close it behind you. That is not a request."', then: s => { s.inventory.westkey = 1; } }] },
      { text: 'Unbar the West Gate, in the west wall of Millbrook, past your house', where: 'west_gate', done: s => F(s, 'westGateOpen') > 0 },
      { text: 'Follow the West Road over the heath to Fernhollow, on Lake Hallow', where: 'fernhollow', done: s => s.discovered.includes('place:fernhollow') },
      { text: 'Speak to Fernhollow\'s headwoman, Orla Hesk (the longhouse on the green)', where: 'npc:hesk', talks: [{ npc: 'hesk', label: 'Millbrook sends its regards. And asks why the post stopped.', reply: '"Because Aled Teague was the post, and the marsh took him." Orla Hesk is a broad, tired woman with a voice made for calling boats in. "Since harvest the dead walk on the Downs at night, the mist comes off the lake and stays, and the fish have gone deep. A scholar from your Spire opened a barrow up there and ran off with what was in it. Cadoc says the king under the big mound is waking. I say sit down and eat before you tell me you can help."' }] },
    ],
    reward: s => { crowns(s, 15); G.rep(s, 'fernhollow', 8, false); G.rep(s, 'watch', 2, false); },
    rewardText: '+15 crowns. Fernhollow\'s notice post on the green has work for you.',
  },
  {
    id: 'wq2', name: 'The King Under the Hill', kind: 'main', auto: true, available: s => qDone(s, 'wq1'),
    blurb: 'Since a Tower scholar broke open a barrow on the Downs, the dead walk at night. The barrow-warden says the king under the great mound is waking.',
    startLog: 'Orla Hesk says to find Cadoc Lowen, the barrow-warden, before you go anywhere near the Downs.',
    stages: [
      { text: 'Find Cadoc Lowen, the barrow-warden (his hut on the east edge of Fernhollow; the Ring of Nine at dusk)', where: 'npc:cadoc', talks: [{ npc: 'cadoc', label: 'Orla Hesk sent me. What is waking?', reply: '"Orm." Cadoc is old enough to have been old when Petch was young. "The last king of the hill people, under the great mound. Vane, the Spire\'s man, broke the little barrow by the road and took a bronze key from the dead in it: the key to Orm\'s door. You cannot close a door you have no key to. Get it back from him. Then Gammer Thrush must make you a ward, or the cold will not let you through. Then you go down, and you put him back to sleep."' }] },
      { text: 'Get the bronze barrow-key back from Master Vane at his dig on the Downs', where: 'npc:vane', done: s => s.inventory.barrowkey > 0 || F(s, 'barrowEntered') > 0, talks: [
        { npc: 'vane', label: `Buy the key back (${B.VANE_KEY_PRICE} crowns).`, cond: s => s.crowns >= B.VANE_KEY_PRICE, reply: s => s.inventory.barrowkey > 0 ? '"Sold, to the warden of… whoever you are." Vane brightens. "Do tell me what is down there. Drawings, if you can manage them."' : '"I am afraid scholarship has its price."', then: s => { W.vaneKey(s, 1); } },
        { npc: 'vane', label: 'Imagine the letter Millbrook would read: "Spire scholar robs graves."', cond: s => W.vaneCanPersuade(s), reply: '"There is no need for letters." Vane laughs too loudly. "Here. The key. A loan to the warden, of course. Of course."', then: s => { W.vaneKey(s, 2); } },
        { npc: 'vane', label: 'Give me the key, Vane. Now.', reply: 'Vane looks at your gun, then at your face, and decides the gun is the friendlier of the two.', then: s => { W.vaneKey(s, 3); } },
      ] },
      { text: s => `Bring Gammer Thrush ${B.WARD_HEATHER} sprigs of heather from the heath for a rowan ward (you have ${s.inventory.heather})`, where: 'npc:thrush', done: s => s.inventory.rowanward > 0 || F(s, 'barrowEntered') > 0, talks: [{ npc: 'thrush', label: 'Cadoc says you can make a ward for Orm\'s door.', cond: s => s.inventory.heather >= B.WARD_HEATHER, reply: '"Can, will, have. Hold this. No, by the end. The END."', then: s => { W.thrushWard(s); } }] },
      { text: 'Enter the Barrow of King Orm (the great mound at the north end of the Downs)', where: 'orm_mound', done: s => F(s, 'barrowEntered') > 0 },
      { text: s => `Light the three braziers in the Hall of Kings to open the inner door (${W.hallLitCount(s)}/3: your lantern, or a Firebolt)`, where: 'hall', done: s => F(s, 'hallLit') > 0 },
      { text: 'Face King Orm in the burial chamber. When the lights go out, light them again', where: 'bier', done: s => F(s, 'ormDown') > 0 },
      { text: 'Decide what becomes of the Crown of Orm (at the bier)', where: 'bier', done: s => F(s, 'crownFate') > 0 },
      { text: 'Tell Orla Hesk it is done', where: 'npc:hesk', talks: [{ npc: 'hesk', label: 'The king under the hill is down.', reply: s => F(s, 'crownFate') === 1 ? '"Cadoc came down off the Downs this morning singing. I have not heard him sing since I was a girl." Orla Hesk takes both your hands. "The mist went out with the dawn. Osric says the perch are back in the shallows. Fernhollow will not forget this. Eat. That is not a request either."' : F(s, 'crownFate') === 2 ? '"Vane went east this morning with a box under his arm and a smile on his face." Hesk does not smile. "The lights were on the Downs again last night. Fewer. Still there. You were paid, I suppose. Good for you."' : '"You kept it." Hesk looks at the circlet at your throat and then, deliberately, at your eyes. "Cadoc says the dead will walk less, not none. I say a crown is a heavy thing for one neck. We will see which of us is right."' }] },
    ],
    reward: s => { const f = F(s, 'crownFate'); crowns(s, f === 1 ? 40 : f === 3 ? 20 : 0); G.rep(s, 'fernhollow', f === 1 ? 15 : f === 3 ? 0 : -6, false); setFlag(s, 'westDone'); },
    rewardText: 'The Barrow Downs are quieter, and Fernhollow knows who went under the hill.',
  },
  {
    id: 'wq3', name: 'Smoke on the Heath', kind: 'side', available: s => s.discovered.includes('place:smeath'),
    blurb: 'Gorse Smeath went to cut birch by the standing stones and came back wrong. Now he sits at the Ring of Nine and watches the lights.',
    offer: { npc: 'nettle', label: 'Your clamp has gone cold. Where is your husband?', reply: '"Sitting in the Ring of Nine with his mouth open, that\'s where." Nettle Smeath has charcoal in every line of her face. "Three nights back the lights came for him. He went out to them like a dog to a whistle, and in the day he will not come home and in the night he will not wake up. Go and sit with him after dark, and put those lights out. I\'d go myself, but one of us has to keep the fires."' },
    stages: [
      { text: 'Go to Gorse at the Ring of Nine after dark (20:00 to 04:00) and put out the grave-lights around him', where: 'ring', done: s => F(s, 'gorseFreed') > 0 },
      { text: 'Tell Nettle Smeath her husband is coming home', where: 'npc:nettle', talks: [{ npc: 'nettle', label: 'Gorse is on his way home. Slowly.', reply: 'Nettle stands up, sits down, and stands up again. "Slowly is how he does everything." She digs in her apron and presses a cold stone into your hand: a flint with a hole worn clean through it. "Hag stone. My gran\'s. Look through it at night and the dark looks back less. Go on. Before I cry on you."', then: s => { s.inventory.charmHag++; } }] },
    ],
    reward: s => { crowns(s, 20); G.rep(s, 'fernhollow', 4, false); },
    rewardText: '+20 crowns. Nettle gave you a hag stone (a charm: wear it from your pack).',
  },
  {
    id: 'wq4', name: 'Old Grandmother', kind: 'side', available: s => s.discovered.includes('place:fernhollow'),
    blurb: 'Old Osric swears there is a pike in Lake Hallow older than he is. Since the mist came, nobody has had so much as a perch.',
    offer: { npc: 'osric', label: 'Any fish left in the lake?', reply: '"Perch, if you\'re patient. Eels, if you\'re unlucky. And Old Grandmother, if you\'re me, which you aren\'t." Osric spits over the jetty rail. "Biggest pike in the lake. Took my best spinner in the fever year. Pike bite at first light and last light. Catch one, any one, and bring it here, and I\'ll know the lake\'s still alive."' },
    stages: [
      { text: 'Catch a Hallow pike from the end of the Fernhollow jetty (pike bite best at dawn and dusk)', where: 'jetty', done: s => s.inventory.pike > 0 || F(s, 'pikeShown') > 0 },
      { text: 'Show the pike to Old Osric on the jetty', where: 'npc:osric', talks: [{ npc: 'osric', label: 'Is this one of hers?', cond: s => s.inventory.pike > 0, reply: '"One of her grandchildren, maybe." Osric holds the pike up to the light like a man holding a baby. "Ha! Still alive. The lake\'s still alive." He hands you a battered tin. "My spinners. They\'re no good to me; my eyes have gone. Bites come quicker with these, on Hallow water."', then: s => { setFlag(s, 'pikeShown'); setFlag(s, 'osricSpinners'); } }] },
    ],
    reward: s => { crowns(s, 18); G.rep(s, 'fernhollow', 5, false); },
    rewardText: '+18 crowns and Osric\'s spinners: fish bite sooner on Lake Hallow.',
  },
  {
    id: 'wq5', name: 'The Drowned Road', kind: 'side', available: s => s.discovered.includes('place:fernhollow') && G.day(s) >= 2,
    blurb: 'Aled Teague carried the post between Fernhollow and Millbrook. A month ago he took the old causeway across the reed marsh, at night, and did not come back.',
    offer: { npc: 'liss', label: 'Davin says you were to be married.', reply: '"In the spring." Liss Teague wipes the same tankard for the third time. "Aled always took the old causeway, because it\'s quicker and he was always late. There\'s a post at the far end where we tied ribbons when we were children. If he got that far he\'d have left me something. He always did. The drowned walk it at night now. Go in daylight, if you go."' },
    stages: [
      { text: 'Search the old causeway post in the reed marsh, south of Fernhollow', where: 'marsh_post', done: s => s.inventory.reedring > 0 || F(s, 'ringGiven') > 0 },
      { text: 'Bring Liss Teague what you found (the Heron and Reed)', where: 'npc:liss', talks: [{ npc: 'liss', label: 'He got as far as the post. He left you this.', cond: s => s.inventory.reedring > 0, reply: 'Liss turns the reed ring over and over. Silver wire through plaited reed, the way children make them. She puts it on. It fits. "He was always late," she says, and goes into the back, and Davin takes over the bar without a word. Later he tells you: "Your bed\'s paid for. Always. Don\'t argue with her; I never win."', then: s => { s.inventory.reedring = 0; setFlag(s, 'ringGiven'); setFlag(s, 'lissFriend'); } }] },
    ],
    reward: s => { crowns(s, 10); G.rep(s, 'fernhollow', 8, false); s.needs.stress = G.clampNeedPublic('stress', s.needs.stress + 4); },
    rewardText: 'Beds at the Heron and Reed are free for you from now on.',
  },
  // ───────────── v0.9: the Saltway Coast ─────────────
  {
    id: 'sq1', name: 'The Salt Gap', kind: 'main', available: s => B.FEATURES.coast && (qDone(s, 'mq1') || G.day(s) >= 4),
    blurb: 'No salt has come up from Gullhaven since a rockfall closed the Salt Gap, the gorge south of the Whisper Stones.',
    offer: { npc: 'sera', label: 'Your salt barrel is empty, Sera.', reply: '"Everyone\'s is." Sera Vint taps the barrel; it rings. "Salt comes up from Gullhaven, on the sea, through the Salt Gap south of the Whisper Stones. Came. A rockfall closed the gap at midsummer and the carters will not go the long way round through the hills. Dorran has blasting powder from when they cut the quarry. A charge, a match, and a long walk away, he says. I say: no salt, no salt fish, no winter."' },
    stages: [
      { text: `Buy a blasting charge from Dorran at the smithy (${B.CHARGE_PRICE} crowns)`, where: 'npc:dorran', done: s => s.inventory.blastcharge > 0 || F(s, 'chargeSet') > 0 || F(s, 'saltGapOpen') > 0, talks: [{ npc: 'dorran', label: `I need a blasting charge for the Salt Gap (${B.CHARGE_PRICE} crowns).`, cond: s => SO.canBuyCharge(s) && s.crowns >= B.CHARGE_PRICE, reply: '"Quarry powder. Old, but it\'s dry." Dorran weighs the parcel in his hand. "Set it low, under the big one. Light it. Then walk away, and keep walking until you\'re bored."', then: s => { SO.buyCharge(s); } }] },
      { text: `Set the charge at the rockfall in the Salt Gap, south of the Whisper Stones, and get well clear (more than ${B.BLAST.far} m)`, where: 'salt_gap', done: s => F(s, 'saltGapOpen') > 0 },
      { text: 'Follow the Saltway down to the sea, to Gullhaven', where: 'gullhaven', done: s => s.discovered.includes('place:gullhaven') },
      { text: 'Find the harbourmaster, Bree Calloway (the harbour office on the quay)', where: 'npc:bree', talks: [{ npc: 'bree', label: 'The Salt Gap is open. Millbrook would like its salt.', reply: '"Open? Somebody blew it?" Bree Calloway is a square, sunburnt woman with a voice that carries across water. "Then the carts go up tomorrow, and I owe you a drink. More than one. Sit down." She does not sit. "While you\'re here, and since you\'re the kind who blows up mountains: the Merry Wren went aground on our flats last month, with all hands. The town says the lighthouse was dark. I don\'t believe it."' }] },
    ],
    reward: s => { crowns(s, 30); G.rep(s, 'gullhaven', 10, false); G.rep(s, 'town', 5, false); },
    rewardText: '+30 crowns. The salt carts run again, and Gullhaven\'s notice post on the quay has work for you.',
  },
  {
    id: 'sq2', name: 'False Lights', kind: 'main', auto: true, available: s => qDone(s, 'sq1'),
    blurb: 'The Merry Wren went aground on the flats below Gullhaven with all hands. The town blames Keeper Trewin\'s lamp. The harbourmaster does not.',
    startLog: 'Bree Calloway asks you to hear Keeper Trewin out, at the lighthouse on the headland.',
    stages: [
      { text: 'Hear Keeper Trewin\'s side (the lighthouse on the headland, east of the harbour)', where: 'npc:trewin', talks: [{ npc: 'trewin', label: 'Bree says you swear the light was lit.', reply: '"Lit, trimmed, and me sat under it all night with my pipe." Amos Trewin has the stoop of a man who has climbed a hundred and twelve steps twice a day for forty years. "The Wren came in from the north-west, wrong side of the bar, straight for the flats. Like she was steering for something. Her log will say. She\'s out on the flats still, what\'s left of her. You can walk to her at low water."' }] },
      { text: 'Search the wreck of the Merry Wren for her log, out on the tidal flats (only at low water, about 06:00–10:00 and 18:00–22:00)', where: 'wreck', done: s => s.inventory.wrenlog > 0 || F(s, 'logFound') > 0 },
      { text: 'Find where a false harbour light was shown from: the Gull Tower, the ruin above the Saltway', where: 'gull_tower', done: s => s.inventory.signallantern > 0 || F(s, 'lanternFound') > 0 },
      { text: 'Find out who is paid when ships go aground: Collector Marrow\'s desk in the customs house (he sits at it by day)', where: 'customs', done: s => s.inventory.customsledger > 0 || F(s, 'ledgerFound') > 0 },
      { text: 'Follow the money to Wreckers\' Cove, west along the shore, and into the sea cave under the cliff', where: 'cove', done: s => F(s, 'caveEntered') > 0 },
      { text: 'Find what the smugglers keep fed at the back of the sea cave', where: 'grotto', done: s => F(s, 'motherDown') > 0 },
      { text: 'Decide what becomes of Collector Marrow (the customs house)', where: 'npc:marrow', done: s => F(s, 'collectorFate') > 0, talks: [
        { npc: 'marrow', label: 'Come with me to Bree Calloway. You can explain the ledger to the whole quay.', cond: s => s.inventory.customsledger > 0, reply: 'Marrow takes off his spectacles, folds them, and puts them in his pocket. "I wondered when." He walks out ahead of you without being asked.', then: s => { SO.decideCollector(s, 1); } },
        { npc: 'marrow', label: `This book is worth something to you. ${B.SQUEEZE} crowns, say.`, cond: s => s.inventory.customsledger > 0, reply: '"Everything is worth something to someone." Marrow unlocks a drawer. "That is the first thing they teach you in the Tower."', then: s => { SO.decideCollector(s, 2); } },
        { npc: 'marrow', label: 'Keep your book. The thing in the cave is dead. That ends it.', cond: s => s.inventory.customsledger > 0, reply: 'Marrow looks at you for a long moment, as if you were a column that does not add up. "How very generous," he says, and goes back to his writing.', then: s => { SO.decideCollector(s, 3); } },
      ] },
      { text: 'Tell Bree Calloway it is done', where: 'npc:bree', talks: [{ npc: 'bree', label: 'No more false lights on this coast.', reply: s => F(s, 'collectorFate') === 1 ? '"They took him up the Saltway this morning in Renn\'s cart, and Trewin walked down to the quay for the first time in a month and nobody would let him buy a drink." Bree grips your arm. "Gullhaven owes you. We pay our debts here. Mostly in fish."' : F(s, 'collectorFate') === 2 ? '"Marrow\'s still at his desk." Bree looks at you, then at your purse. "I\'m told the cave\'s quiet. Good. Thank you for that." She does not say anything else, which is worse.' : '"Marrow\'s still at his desk and you look pleased with yourself." Bree folds her arms. "The cave\'s quiet, and Trewin is cleared, and the man who sold the Wren\'s crew is still collecting harbour dues. You\'ll understand if I don\'t buy the drink."' }] },
    ],
    reward: s => { const f = F(s, 'collectorFate'); crowns(s, f === 1 ? 50 : 25); G.rep(s, 'gullhaven', f === 1 ? 20 : f === 2 ? 5 : 0, false); setFlag(s, 'coastDone'); setFlag(s, 'trewinCleared'); },
    rewardText: 'Keeper Trewin is cleared, and the coast knows who went into the sea cave.',
  },
  {
    id: 'sq3', name: 'Mussels and Samphire', kind: 'side', available: s => s.discovered.includes('place:gullhaven'),
    blurb: 'Jowan Penhale\'s kitchen at the Anchor and Gull has run out of mussels, and the pickers will not go out past the crabs.',
    offer: { npc: 'jowan', label: 'What\'s good tonight?', reply: '"Nothing, that\'s what\'s good." Jowan Penhale throws a dishcloth over his shoulder. "No mussels, no samphire, and the crabs on the flats have the pickers frightened off. Bring me six mussels and four of samphire, off the flats at low water, and I\'ll pay, and feed you besides."' },
    stages: [
      { text: s => `Bring Jowan ${B.MUSSELS_FOR_JOWAN} mussels and ${B.SAMPHIRE_FOR_JOWAN} samphire from the tidal flats (you have ${s.inventory.mussels} and ${s.inventory.samphire})`, where: 'npc:jowan', talks: [{ npc: 'jowan', label: 'Mussels and samphire, as ordered.', cond: s => s.inventory.mussels >= B.MUSSELS_FOR_JOWAN && s.inventory.samphire >= B.SAMPHIRE_FOR_JOWAN, reply: '"Look at that. Look at THAT." Jowan carries them off like a man carrying a baby. A pan clatters. Later he comes back with two crab cakes wrapped in paper. "On the house. Don\'t tell the house."', then: s => { s.inventory.mussels -= B.MUSSELS_FOR_JOWAN; s.inventory.samphire -= B.SAMPHIRE_FOR_JOWAN; s.inventory.crabcakes += 2; } }] },
    ],
    reward: s => { crowns(s, 25); G.rep(s, 'gullhaven', 5, false); },
    rewardText: '+25 crowns and two crab cakes (Sea legs).',
  },
  {
    id: 'sq4', name: 'The Merry Wren\'s Bell', kind: 'side', available: s => s.discovered.includes('place:gullhaven') && G.day(s) >= 2,
    blurb: 'The sea chapel rings a bell for every boat lost. The Merry Wren\'s own bell is still on her foredeck, out on the flats.',
    offer: { npc: 'elowen', label: 'Why is there an empty hook by the chapel door?', reply: '"That is where the Merry Wren\'s bell goes." Sister Elowen is young, freckled and very calm. "When a boat is lost we hang her bell here and ring it on her day. The Wren\'s is still on her foredeck, out on the flats. You can reach her at low water. It is heavy. Nobody has wanted to."' },
    stages: [
      { text: 'Bring up the Merry Wren\'s bell from her foredeck (the wreck on the flats, at low water)', where: 'wreck', done: s => s.inventory.shipsbell > 0 || F(s, 'bellRung') > 0 },
      { text: 'Carry the bell to Sister Elowen at the sea chapel (it is heavy: you can only walk)', where: 'npc:elowen', talks: [{ npc: 'elowen', label: 'The Merry Wren\'s bell.', cond: s => s.inventory.shipsbell > 0, reply: 'Elowen hangs the bell on its hook and rings it once. Down on the quay every head turns, and Captain Vosper takes off his hat. She presses a string of shells into your hand: a cowrie and a limpet on tarred cord. "The fishermen wear these. The sea knows its own. Now it knows you."', then: s => { s.inventory.shipsbell = 0; setFlag(s, 'bellRung'); s.inventory.charmShell++; } }] },
    ],
    reward: s => { crowns(s, 15); G.rep(s, 'gullhaven', 6, false); },
    rewardText: '+15 crowns and a shell charm (crabs and the drowned hit you softer).',
  },
  {
    id: 'sq5', name: 'The Keeper\'s Oil', kind: 'side', available: s => s.discovered.includes('place:lighthouse'),
    blurb: 'Since the Merry Wren, the chandler will not sell to Keeper Trewin, and the lighthouse lamp is burning the last of its oil.',
    offer: { npc: 'trewin', label: 'You look worried, keeper.', reply: '"Pasco Hendy won\'t sell me oil. Says he won\'t help the man who drowned the Wren." Trewin taps the reservoir; it sounds hollow. "Two flasks will see her through the week. He\'ll sell to you. I\'ll pay you back, and better than in coin."' },
    stages: [
      { text: s => `Bring Keeper Trewin ${B.OIL_FOR_KEEPER} flasks of lamp oil (the chandlery on the quay; you have ${s.inventory.oil})`, where: 'npc:trewin', talks: [{ npc: 'trewin', label: 'Two flasks of lamp oil.', cond: s => s.inventory.oil >= B.OIL_FOR_KEEPER, reply: '"Bless you." He goes up the hundred and twelve steps faster than you would have thought possible, and comes down with a brass spyglass. "Forty years I\'ve watched the sea with this. You\'ve better eyes. Watch it for me."', then: s => { SO.keeperOil(s); } }] },
    ],
    reward: s => { if (s.gear.spyglass) crowns(s, 30); else s.gear.spyglass = true; G.rep(s, 'gullhaven', 5, false); setFlag(s, 'keeperFriend'); },
    rewardText: 'Keeper Trewin gave you his brass spyglass (or 30 crowns if you have one).',
  },
];
const QMAP = new Map(QUESTS.map(q => [q.id, q]));
export const quest = (id: string) => QMAP.get(id)!;

/** The audit: `how` 1 = hush money from Tolan, 2 = the Watch, 3 = Lira and Aldric. */
export function resolveAudit(s: GameState, how: 1 | 2 | 3) {
  if (F(s, 'audit')) return;
  s.inventory.auditfile = 0; setFlag(s, 'audit', how);
  const off = Math.min(how === 3 ? 150 : 120, s.debt); s.debt -= off;
  if (how === 1) { crowns(s, 30); G.rep(s, 'tower', -5, false); G.rep(s, 'ashRoad', 5, false); G.log(s, `Tolan strikes ${off} crowns from your page and pushes 30 across the counter. Neither of you says thank you.`, 'warn'); }
  if (how === 2) { G.rep(s, 'watch', 15, false); G.rep(s, 'town', 6, false); G.rep(s, 'tower', -12, false); G.log(s, `The Watch takes the Tower's clerk in for questions. ${off} crowns of your aunt's repayments are finally posted.`, 'good'); }
  if (how === 3) { G.rep(s, 'tower', 12, false); G.rep(s, 'town', 4, false); G.log(s, `Aldric Voss dismisses his clerk and strikes ${off} crowns from your page in his own hand.`, 'good'); }
  if (s.debt <= 0) G.debtCleared(s, 'With the missing repayments posted, the page balances to nothing. The house is yours.');
}
/** v0.7: what becomes of the ward-copper seam under Copper Hollow (and the Engine's heart).
 *  1 = seal it (the heart goes back; the Reach's wards hold), 2 = open it to Ashford's guild (150 crowns),
 *  3 = send the heart to Aldric Voss (80 crowns off the debt; the Tower keeps the wards). */
export function decideSeam(s: GameState, fate: 1 | 2 | 3): boolean {
  if (F(s, 'seamFate') > 0 || !F(s, 'engineDown')) return false;
  setFlag(s, 'seamFate', fate); if (s.inventory.wardcore > 0) s.inventory.wardcore--;
  if (fate === 1) { G.rep(s, 'chapel', 12, false); G.rep(s, 'ashford', 4, false); G.rep(s, 'tower', -6, false); setFlag(s, 'reachWarded'); G.log(s, 'You set the Engine\'s heart back into the seam. The veins of ward-copper brighten, then dim to a steady glow. Somewhere above, the hill stops humming.', 'good'); }
  if (fate === 2) { crowns(s, 150); G.rep(s, 'ashford', 10, false); G.rep(s, 'chapel', -10, false); setFlag(s, 'seamOpen'); G.log(s, 'You chalk the guild\'s mark on the seam and carry the heart out to sell. Ashford\'s guild pays 150 crowns for the rights you just made possible.', 'good'); }
  if (fate === 3) { const off = Math.min(80, s.debt); s.debt -= off; G.rep(s, 'tower', 14, false); G.rep(s, 'ashford', -6, false); G.log(s, `You wrap the Engine's heart for the Tower. Aldric Voss's reply comes by the next coach: ${off} crowns struck from your page, and a single line: "My grandfather built that. Thank you for not breaking it."`, 'good'); if (s.debt <= 0) G.debtCleared(s, 'The heart of the Engine settles what was left of the debt. The house is yours.'); }
  return true;
}
/** v0.8: what becomes of the Crown of Orm. 1 = return it to the bier (the barrow is sealed),
 *  2 = sell it to Master Vane (200 crowns; the Downs stay haunted), 3 = keep it (it becomes Orm's circlet). */
export function decideCrown(s: GameState, fate: 1 | 2 | 3): boolean {
  if (F(s, 'crownFate') > 0 || !F(s, 'ormDown')) return false;
  setFlag(s, 'crownFate', fate); if (s.inventory.ormcrown > 0) s.inventory.ormcrown--;
  if (fate === 1) { G.rep(s, 'fernhollow', 12, false); G.rep(s, 'chapel', 6, false); setFlag(s, 'westSealed'); G.log(s, 'You set the crown back on the brow of what is left of King Orm. The braziers burn up white for a breath and settle. The cold goes out of the stone like a held breath let go.', 'good'); }
  if (fate === 2) { crowns(s, B.CROWN_SALE); G.rep(s, 'fernhollow', -12, false); G.rep(s, 'tower', 4, false); setFlag(s, 'crownSold'); G.log(s, `You carry the crown out under your coat. Master Vane pays ${B.CROWN_SALE} crowns without haggling, which tells you it was worth more.`, 'warn'); }
  if (fate === 3) { s.inventory.charmOrm++; G.rep(s, 'fernhollow', -4, false); setFlag(s, 'crownKept'); G.log(s, 'You bend the old gold into a circlet small enough to wear at the throat. It is cold, and stays cold. At night you feel it hum, and your hands feel quicker.', 'warn'); }
  return true;
}
/** Tolan no longer keeps the debt book after the Watch or Aldric have dealt with him. */
export const tolanGone = (s: GameState) => F(s, 'audit') >= 2;

/** Aldric's judgment after the gate, from what you did with the two stones. */
export function aldricVerdict(s: GameState): { id: string; speech: string; relief: number; debtLine: string } {
  const t = stoneCount(s, 'tower'), c = stoneCount(s, 'chapel'), k = stoneCount(s, 'kept');
  if (t === 2) return { id: 'tower', relief: 999, debtLine: 'Aldric Voss tears your page out of the debt book himself.', speech: '"Both stones in my vault, and the gate still standing." Aldric Voss looks older than his portrait. "The Keystone will hold another generation. Your aunt\'s debt is void. I will have work for you, if you want it: the Tower pays its own."' };
  if (c === 2) return { id: 'warden', relief: 100, debtLine: 'With the town\'s collection, the debt is gone.', speech: '"You gave them both to the Chapel." He says it without heat. "Forty years I kept those wards on my own purse and my own nerve, and the town hated me for the bills. Let Maren carry them, then. The square passed a hat for you this morning. A hundred crowns comes off your page. It is more than they ever raised for me."' };
  if (k === 2) return { id: 'hedge', relief: 0, debtLine: '', speech: 'Aldric stops well short of you. His eyes go to your staff and stay there. "Two ward-stones in a hedge-mage\'s stick. Ysolde would have… no. I do not know what she would have done." He does not mention the debt, or come any closer. "The wards are yours now, wherever you stand. Try to stand near Millbrook."' };
  return { id: 'mixed', relief: 60, debtLine: 'The last of the debt goes with a stroke of Aldric\'s pen.', speech: '"One stone here, one there. A cautious sort of courage." He almost smiles. "But the gate held and both wards burn, which is more than I managed. Sixty crowns off your page, and my thanks, which I am told are rarer."' };
}

// ---------- engine ----------
export function startQuest(s: GameState, id: string) {
  if (s.quests[id]) return;
  const q = quest(id);
  s.quests[id] = { stage: 0, state: 'active', startDay: G.day(s), doneDay: 0 };
  G.log(s, `New ${q.kind === 'main' ? 'quest' : 'task'}: ${q.name}. ${q.startLog ?? q.blurb}`, 'info');
  setFlag(s, 'questNew', F(s, 'questNew') + 1);
  q.stages[0].enter?.(s);
}
const stageDone = (s: GameState, q: Quest, i: number) => { const st = q.stages[i]; return st.done ? st.done(s) : F(s, `q:${q.id}:${i}`) > 0; };
/** Advance every active quest as far as the state allows; start automatic quests. Cheap; call a few times a second. */
export function updateQuests(s: GameState): boolean {
  let any = false;
  for (let i = 0; i < 4; i++) { if (!updateOnce(s)) break; any = true; }
  return any;
}
function updateOnce(s: GameState): boolean {
  let changed = false;
  for (const q of QUESTS) if (q.auto && !s.quests[q.id] && q.available(s)) { startQuest(s, q.id); changed = true; }
  for (const q of QUESTS) {
    const p = s.quests[q.id]; if (!p || p.state !== 'active') continue;
    while (p.stage < q.stages.length && stageDone(s, q, p.stage)) {
      p.stage++; changed = true;
      if (p.stage < q.stages.length) { const st = q.stages[p.stage]; G.log(s, `${q.name}: ${typeof st.text === 'function' ? st.text(s) : st.text}.`, 'info'); st.enter?.(s); }
    }
    if (p.stage >= q.stages.length) {
      p.state = 'done'; p.doneDay = G.day(s); q.reward?.(s);
      G.log(s, `${q.kind === 'main' ? 'Quest' : 'Task'} complete: ${q.name}.${q.rewardText ? ' ' + q.rewardText : ''}`, 'good');
      setFlag(s, 'questDone', F(s, 'questDone') + 1); G.count(s, 'questsDone');
    }
  }
  return changed;
}
export interface TalkChoice { key: string; label: string }
/** What you can raise with this person right now: quest offers and the current stage's conversation. */
export function talkChoices(s: GameState, npc: string): TalkChoice[] {
  const out: TalkChoice[] = [];
  for (const q of QUESTS) {
    const p = s.quests[q.id];
    if (!p && q.offer && q.offer.npc === npc && q.available(s) && (!q.offer.cond || q.offer.cond(s))) out.push({ key: `offer:${q.id}`, label: q.offer.label });
    if (p?.state === 'active') q.stages[p.stage]?.talks?.forEach((t, i) => { if (t.npc === npc && (!t.cond || t.cond(s))) out.push({ key: `stage:${q.id}:${p.stage}:${i}`, label: t.label }); });
  }
  return out;
}
/** Carry out a conversation choice. Returns what they say. */
export function chooseTalk(s: GameState, key: string): string {
  const [kind, id, st, ti] = key.split(':'); const q = quest(id); if (!q) return '';
  let t: TalkOpt;
  if (kind === 'offer') { t = q.offer!; startQuest(s, id); t.then?.(s); }
  else { t = q.stages[Number(st)].talks![Number(ti)]; t.then?.(s); if (!q.stages[Number(st)].done) setFlag(s, `q:${id}:${st}`); }
  const reply = typeof t.reply === 'function' ? t.reply(s) : t.reply;
  updateQuests(s);
  return reply;
}
export interface Tracked { id: string; title: string; lines: string[]; where: string | null; kind: 'main' | 'side' }
export function describe(s: GameState, id: string): Tracked | null {
  const q = quest(id), p = s.quests[id]; if (!q || !p || p.state !== 'active') return null;
  const st = q.stages[p.stage]; if (!st) return null;
  const w = st.where; return { id, title: q.name, kind: q.kind, lines: [typeof st.text === 'function' ? st.text(s) : st.text], where: w ? (typeof w === 'function' ? w(s) : w) : null };
}
/** The quest shown on the HUD: the one you pinned in the journal, else the main quest, else any task. */
export function tracked(s: GameState): Tracked | null {
  const active = QUESTS.filter(q => s.quests[q.id]?.state === 'active');
  const pin = active.find(q => F(s, 'track:' + q.id));
  const pick = pin ?? active.find(q => q.kind === 'main') ?? active[0];
  return pick ? describe(s, pick.id) : null;
}
export function track(s: GameState, id: string) { for (const k of Object.keys(s.story.flags)) if (k.startsWith('track:')) delete s.story.flags[k]; setFlag(s, 'track:' + id); }
/** Does this person have something new to say to you? (shown as a mark over their head and in the prompt) */
export const hasBusiness = (s: GameState, npc: string) => talkChoices(s, npc).length > 0;

// ---------- endings ----------
export interface Ending { id: string; title: string; slides: { head: string; text: string }[]; final: boolean }
export function ending(s: GameState): Ending {
  if (s.gameover === 'debt') return { id: 'debt', title: 'Debt Called', final: true, slides: [{ head: 'The house', text: 'Two instalments missed. Aldric\'s men carry Ysolde\'s chair out into the rain, then her bed, then her books. You watch from the square with your revolver and your staff and nowhere to hang either.' }, { head: 'The Vale', text: s.flags.millCleared ? 'The mill is quiet, at least. That much of you stays in Millbrook.' : 'Out past the gate, the lights at the Old Mill burn a little brighter each night.' }] };
  const slides: { head: string; text: string }[] = [];
  const v = s.story.wardsDone ? aldricVerdict(s) : null;
  const d = G.day(s);
  slides.push({ head: 'The house', text: s.story.debtCleared ? `Day ${d}. The page with your aunt's name on it is ${v?.id === 'tower' ? 'torn out of the book' : 'ruled off at nothing'}. The stone house at the edge of Millbrook is yours: the hearth, the cistern, the bed that finally feels like your own.` : 'The debt still stands in the book. That is tomorrow\'s problem.' });
  if (F(s, 'audit') === 1) slides.push({ head: 'The ledger', text: 'Tolan still keeps the Tower\'s book, and still cannot meet your eye. Thirty crowns bought your silence. Some nights you count them.' });
  if (F(s, 'audit') === 2) slides.push({ head: 'The ledger', text: 'The Watch walked Tolan out of the Counting House at noon, in front of everyone. Brannic keeps your working papers in his own drawer, and shows them to apprentices.' });
  if (F(s, 'audit') === 3) slides.push({ head: 'The ledger', text: 'Aldric Voss dismissed his clerk on the strength of your arithmetic. Lira keeps the Tower\'s book now, and it balances for honest reasons.' });
  if (!s.story.wardsDone) {
    slides.push({ head: 'The Vale', text: s.flags.millCleared ? (F(s, 'chapelCleared') ? 'Two stones recovered, and the Vale gathering itself for one last push at the gate. Captain Renn is waiting.' : 'The Old Mill is quiet. But the Ember had an echo, somewhere wet, and it has not stopped ringing.') : 'The lights at the Old Mill still burn at night, and Old Petch still asks for you. Paying a debt and keeping a town are different things.' });
    return { id: 'house', title: 'Free and Clear', slides, final: false };
  }
  const t = stoneCount(s, 'tower'), c = stoneCount(s, 'chapel'), k = stoneCount(s, 'kept');
  slides.push({ head: 'The wards', text: t === 2 ? 'Both stones sit in the Spire vault beside the Keystone. The wards burn steady and belong, as they always have, to one family. People sleep. They also pay.' : c === 2 ? 'The Ember burns in the Chapel brazier and the Censer swings over the Quiet Flame. Pilgrims walk the drowned road again. For the first time in forty years the wards belong to the town.' : k === 2 ? 'Both stones ride in your staff. The wards hold wherever you stand, and falter a little whenever you leave. Millbrook has become very interested in your health.' : 'One stone in the Tower, one in the Chapel' + (k ? ', one in your own staff' : '') + '. Nobody in Millbrook quite has the wards, so nobody can quite hold them over anybody else.' });
  slides.push({ head: 'The gate', text: 'They still talk about Wardbreak Night at the Tankard: the mage with a revolver in one hand and lightning in the other, standing where the palisade gives out. Sergeant Vole tells it best. He was there.' });
  slides.push({ head: 'Millbrook', text: s.factions.town >= 40 ? 'Bram sets a loaf aside for you every morning without being asked. Sera has stopped pretending to check your coin.' : s.factions.town >= 0 ? 'The town nods to you in the square. It is not love, but it is a place.' : 'The town owes you, and resents owing. You know how that feels from the other side.' });
  slides.push({ head: 'You', text: `${d} days. ${s.contractsDone} notices, ${s.job.shifts + s.ledgerCases} days at the ledger, ${s.stats.kills} things put down, ${s.stats.collapses} mornings you woke up on your own floor without remembering the walk home.${s.traits.length ? ' It left marks: ' + s.traits.length + ' of them.' : ''} Ysolde's notebook has a new last page, in your hand.` });
  const title = t === 2 ? "The Tower's Hand" : c === 2 ? 'Warden of Millbrook' : k === 2 ? 'Hedge-Mage Ascendant' : F(s, 'audit') >= 2 ? 'The Honest Ledger' : 'Free and Clear';
  return { id: v!.id, title, slides, final: s.story.debtCleared };
}
/** Rumours at the Tankard: pointers toward whatever you have not done yet. */
export function rumour(s: GameState): string {
  const pool: string[] = [];
  if (!s.flags.millEntered) pool.push('"Lights in the Old Mill again last night. Petch says he knows why. Petch always says that."');
  if (s.flags.millCleared && !F(s, 'chapelEntered')) pool.push('"A pilgrim swore he saw fire under the water, out past the Whisper Stones. Fire. Under water."');
  if (!s.quests.redink && s.ledgerCases < 1) pool.push('"Brannic gives his good work to clerks who ask for case files, not shifts. Pays better too."');
  if (!s.quests.cart) pool.push('"Sera\'s nephew came back from the ford road with no cart, no boots and no colour in his face."');
  if (!s.quests.lure) pool.push('"Fenn Marlow\'s been drinking in that corner for a month. Says he lost his luck at the reed pond."');
  if (!s.gear.lantern) pool.push('"Dorran sells a decent lantern. You\'ll want one where you\'re going. I can see it in your boots."');
  if (!s.quests.ring) pool.push('"Widow Cael\'s been at her window all week, looking north at the stones."');
  if (s.revolverCond < 60) pool.push('"That revolver of yours sounds dry. Oil it, or Dorran will do it for three crowns."');
  pool.push('"Raiders pay their tags no mind, but the Watch pays six crowns apiece for them. Ask Vole."', '"Rain puts fire out and makes frost bite. Any hedge-witch will tell you."', '"Moonpetal only opens after dark. Maren pays in medicine."', '"Three clean case files and Brannic starts trusting you with the interesting books."');
  return pool[(G.day(s) * 3 + G.tally(s, 'rumours')) % pool.length];
}
