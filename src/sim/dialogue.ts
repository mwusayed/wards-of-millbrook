// Pass 3 dynamic dialogue. Every line is chosen by a rule that reads real game state; each NPC has a
// voice and remembers what happened between you. Pure TS: no DOM, testable headlessly.
import * as B from './balance';
import type { GameState, NpcMemory } from './state';
import { day, hour, maxHp, today } from './state';
import { isWet } from './days';
import type { FactionId } from './contracts';

export type Place = 'home' | 'town' | 'vale' | 'mill' | 'office' | 'ashford' | 'reach' | 'march' | 'fernhollow' | 'coast' | 'gullhaven';
export interface Ctx { s: GameState; npc: string; faction: FactionId; holstered: boolean; place: Place }
type Rule = { id: string; when: (c: Ctx, m: NpcMemory) => boolean; say: string[]; weight: number; note?: string; mood?: number };

export function memory(s: GameState, npc: string): NpcMemory {
  return (s.npcMemory[npc] ??= { met: 0, lastDay: 0, mood: 0, notes: [] });
}
const has = (m: NpcMemory, n: string) => m.notes.includes(n);
const sinceCombat = (s: GameState) => s.minutes - s.recent.lastCombatMin;

// Shared reactions any NPC can voice, but each speaker words them in their own way below.
const COMMON: Record<string, (c: Ctx, m: NpcMemory) => boolean> = {
  gunOut: c => !c.holstered && (c.place === 'town' || c.place === 'ashford' || c.place === 'fernhollow'),
  bleeding: c => c.s.wounds.length > 0,
  lowHp: c => c.s.hp < maxHp(c.s) * 0.45,
  starving: c => c.s.needs.calories < B.T.starving,
  thirsty: c => c.s.needs.hydration < B.T.dehydrated,
  filthy: c => c.s.needs.hygiene < B.T.hygieneLow,
  exhausted: c => c.s.needs.fatigue > 75,
  fresh: c => c.s.minutes - c.s.recent.washedMin < 90 && c.s.needs.hygiene > 80,
  justFought: c => sinceCombat(c.s) < 60,
  millCleared: c => c.s.flags.millCleared,
  millCleared_new: (c, m) => c.s.flags.millCleared && !has(m, 'saw-mill'),
  debtLate: c => c.s.missed > 0,
  debtDue: c => c.s.nextDueDay - day(c.s) <= 1 && c.s.paidThisCycle < B.INSTALMENT,
  debtLow: c => c.s.debt <= 120,
  late: c => hour(c.s) >= 21 || hour(c.s) < 5,
  early: c => hour(c.s) >= 5 && hour(c.s) < 8,
  liked: c => c.s.factions[c.faction] >= 25,
  disliked: c => c.s.factions[c.faction] <= -25,
  many: c => c.s.contractsDone >= 5,
  firstMeet: (c, m) => m.met === 0,
  regular: (c, m) => m.met >= 6,
  fired: c => c.s.job.firedUntilDay > day(c.s),
  goodClerk: c => c.s.recent.ledgerCaseResult === 'perfect',
  // pass 4: the story so far, and the weather
  rain: c => isWet(today(c.s).weather) && c.place !== 'mill',
  chapelCleared_new: (c, m) => (c.s.story.flags.chapelCleared ?? 0) > 0 && !has(m, 'saw-chapel'),
  stoneKept: c => c.s.story.ember === 'kept' || c.s.story.censer === 'kept',
  stoneChapel: c => c.s.story.ember === 'chapel' || c.s.story.censer === 'chapel',
  stoneTower: c => c.s.story.ember === 'tower' || c.s.story.censer === 'tower',
  gateHeld_new: (c, m) => (c.s.story.flags.gateHeld ?? 0) > 0 && !has(m, 'saw-gate'),
  debtFree: c => c.s.story.debtCleared,
  auditDone: c => (c.s.story.flags.audit ?? 0) > 0,
  traumatised: c => c.s.traits.some(t => t === 'badKnee' || t === 'jumpy' || t === 'scarred' || t === 'shakyHands'),
  festival: c => today(c.s).event === 'festival',
  // v0.7: the Eastern Reach
  engineDown_new: (c, m) => (c.s.story.flags.engineDown ?? 0) > 0 && !has(m, 'saw-engine'),
  engineDown: c => (c.s.story.flags.engineDown ?? 0) > 0,
  tollCleared: c => (c.s.story.flags.tollCleared ?? 0) > 0,
  carbine: c => c.s.firearm === 'carbine' && !c.holstered,
  charmed: c => c.s.charm !== '',
  fromMillbrook: (c, m) => m.met === 1 && c.s.factions.ashford < 8,
  // v0.8: the Westmarch
  ormDown_new: (c, m) => (c.s.story.flags.ormDown ?? 0) > 0 && !has(m, 'saw-orm'),
  crownReturned: c => (c.s.story.flags.crownFate ?? 0) === 1,
  crownSold: c => (c.s.story.flags.crownFate ?? 0) === 2,
  crownKept: c => (c.s.story.flags.crownFate ?? 0) === 3,
  westOpen_new: (c, m) => (c.s.story.flags.westGateOpen ?? 0) > 0 && !has(m, 'saw-west'),
  graveGold: c => c.s.inventory.barrowgold > 0,
  // v0.9: the Saltway Coast
  gapOpen_new: (c, m) => (c.s.story.flags.saltGapOpen ?? 0) > 0 && !has(m, 'saw-gap'),
  motherDown_new: (c, m) => (c.s.story.flags.motherDown ?? 0) > 0 && !has(m, 'saw-mother'),
  marrowTaken: c => (c.s.story.flags.collectorFate ?? 0) === 1,
  marrowPaid: c => (c.s.story.flags.collectorFate ?? 0) === 2,
  marrowFree: c => (c.s.story.flags.collectorFate ?? 0) === 3,
  bellRung: c => (c.s.story.flags.bellRung ?? 0) > 0,
  stressed: c => c.s.needs.stress > 60,
  lowWater: c => { const h = (c.s.minutes % 1440) / 60, t = Math.cos(2 * Math.PI * (h - 2) / 12); return t < -0.5 && (c.place === 'coast' || c.place === 'gullhaven'); },
};

const VOICE: Record<string, Partial<Record<keyof typeof COMMON, string[]>>> = {
  bram: {
    gunOut: ['"Put that iron away, friend. You\'ll scare the bread."', 'Bram steps back from the counter. "Holster that before you point it at my oven."'],
    starving: ['"You look hollow. Here, smell that crust. Four crowns and you\'ll stop swaying."', '"When did you last eat? Don\'t answer. Buy a loaf."'],
    thirsty: ['"Your lips are cracked. Well\'s twenty paces that way. Go."'],
    bleeding: ['"You\'re dripping on my step. Sera has linen; get it bound."'],
    filthy: ['Bram wrinkles his nose. "I\'ll sell to you, but stand downwind."'],
    fresh: ['"You clean up nice. Almost didn\'t know you without the mud."'],
    justFought: ['"You smell of powder and wet dog. Rough morning out there?"'],
    millCleared_new: ['"They say the mill\'s quiet now. My grandad ground flour there. Thank you."'],
    millCleared: ['"Folk are talking about grinding at the Old Mill again. Because of you."'],
    early: ['"Up before the bread! First loaf\'s still hot."'],
    late: ['"Ovens are cold, friend. Come at dawn."'],
    regular: ['"The usual, then. I set one aside when I saw you coming."'],
    firstMeet: ['"New face. Bram Thatch, baker. I feed this town; it doesn\'t always thank me."'],
  },
  sera: {
    gunOut: ['Sera\'s hand goes under the counter. "Holster it, or I stop being polite."', '"Weapons away in my shop. I won\'t ask twice."'],
    bleeding: ['"That needs binding, and I sell binding. Nine crowns, and you\'re not bleeding on my floor."'],
    lowHp: ['"You\'re grey as ash. A physician\'s kit costs, but so does a funeral."'],
    disliked: ['"Cash first. Your word\'s not worth much in this square."'],
    liked: ['"For you, I kept a box of rounds back. Don\'t tell the Watch."'],
    debtDue: ['"Instalment\'s tomorrow, isn\'t it? Don\'t spend it all here."'],
    justFought: ['"Back from the Vale in one piece? Mostly? Good for business."'],
    millCleared_new: ['"You went into the mill and came back. That\'s worth something. Ten percent off, this once."'],
    regular: ['"You again. Fine. What do you need?"'],
    firstMeet: ['"Sera Vint. I sell what keeps you alive. Prices are fair; you won\'t think so."'],
  },
  brannic: {
    gunOut: ['"Not in my Counting House. Holster it or leave."'],
    filthy: ['"Wash before you touch my ledger. I mean it."'],
    exhausted: ['"Your eyes are swimming. Tired clerks post to the wrong side."'],
    bleeding: ['"Bleed on my ledger and you\'re done."'],
    goodClerk: ['"Your last file balanced to the copper. I noticed."'],
    fired: ['"I said a week. It hasn\'t been a week."'],
    debtLow: ['"Under a hundred and twenty to Voss? You might actually do it."'],
    regular: ['"Ink\'s fresh. Sit down."'],
    firstMeet: ['"Brannic. I keep the town\'s books. Debits left, credits right. Can you count?"'],
  },
  tolan: {
    debtLate: ['"Master Voss noticed the missed week. He notices everything."', '"Red ink on your page. Master Voss does not forget red ink."'],
    debtDue: ['"Tomorrow, sixty crowns. Master Voss is particular about tomorrow."'],
    debtLow: ['"Your balance is... respectable. Master Voss is almost pleased. Almost."'],
    millCleared_new: ['Tolan straightens. "If you found anything in the mill, an old stone, a warm one... Master Voss would want to see it."'],
    liked: ['"You pay on time. I\'ve told Master Voss so."'],
    disliked: ['"The Tower takes a dim view of you. I\'d pay early, if I were you."'],
    gunOut: ['"The Tower is not impressed by firearms."'],
    firstMeet: ['"Tolan, clerk to Master Aldric Voss. You owe him three hundred crowns. We\'ll be seeing a lot of each other."'],
  },
  vole: {
    gunOut: ['"Good. Keep it drawn past the gate, holster it in the square."'],
    justFought: ['"Heard shots from the Vale. Yours? How many?"'],
    many: ['"You\'ve thinned the hounds more than my whole watch. Captain Renn wants to buy you a drink."'],
    millCleared_new: ['"The mill. Alone. Captain Renn won\'t believe it. I hardly do."'],
    millCleared: ['"Patrols go past the mill now without crossing themselves. Your doing."'],
    late: ['"Gate stays shut after dark. You want out, you go at your own risk."'],
    lowHp: ['"You\'re in no state for the Vale. Go home and sleep, that\'s an order."'],
    firstMeet: ['"Sergeant Vole. South Gate is mine. Don\'t make me write you up."'],
  },
  petch: {
    millCleared_new: ['"The Patriarch\'s gone? Then the mill-wheel will turn again. I\'d hoped to live to see it."'],
    millCleared: ['"The miller\'s ghost can rest. You did a good thing, whatever they paid you."'],
    exhausted: ['"Sit down before you fall down. The bench is free."'],
    starving: ['"Bones showing. Magic eats you from the inside, you know. Eat bread before you cast."'],
    thirsty: ['"Dry as parchment. Spells drink you, child. The well is free."'],
    late: ['"Stars out. The Vale wakes at night. You shouldn\'t."'],
    regular: ['"You keep coming back to an old man. I like that."'],
    firstMeet: ['"Old Petch. I\'ve seen four Tower debts called. Let\'s hope yours isn\'t the fifth."'],
  },
};
Object.assign(VOICE, {
  maren: {
    firstMeet: ['"You are Ysolde\'s. Maren Soloway. I keep the Quiet Flame, and I patch whoever the Vale sends back."'],
    bleeding: ['"Sit. No, sit. That needs closing now, not after you have told me how brave you were."'],
    lowHp: ['"You are the colour of candle wax. Drink this before you fall on my floor."'],
    traumatised: ['"Your hands. I see it. Some wounds do not bleed; I can help with those too, for a price the Chapel must ask."'],
    gunOut: ['"Not before the Flame. Put it away."'],
    exhausted: ['"When did you last sleep a whole night? The Flame will keep. Go home."'],
    stoneChapel: ['"The brazier has not gone out since you brought the stone. Pilgrims weep when they see it. I let them."'],
    stoneKept: ['Maren looks at your staff for a long moment. "It is warm, isn\'t it. It will ask you for things. Be careful what you agree to."'],
    stoneTower: ['"The Tower has the stone again. Well. It burns, wherever it sits. I tell myself that is what matters."'],
    chapelCleared_new: ['"You saw Brother Aldous. What was left." She closes her eyes. "Thank you for ending it. Nobody else would go."'],
    gateHeld_new: ['"I watched from the chapel roof. I have not prayed that hard since I took vows."'],
    rain: ['"Rain on the roof and the Flame steady. There are worse days."'],
    regular: ['"Back again. Whole, this time? Let me look at you."'],
  },
  dorran: {
    firstMeet: ['"Kade. Smith. You\'re the hedge-mage with Ysolde\'s revolver. It pulls left; I can fix that."'],
    gunOut: ['"Point it at the floor in my forge. Sparks and powder don\'t mix."'],
    justFought: ['"That barrel\'s still warm. Clean it tonight or it\'ll foul by morning."'],
    filthy: ['"I work in soot all day and you still smell worse than me."'],
    millCleared_new: ['"Heard about the mill. I shod the miller\'s horse, back when there was a miller. Good work."'],
    gateHeld_new: ['"Every blade on that palisade was mine. First time they\'ve all been used on the same night. You held."'],
    stoneKept: ['"That staff hums. I can hear it over the bellows. I\'m not touching it, so don\'t ask."'],
    regular: ['"What broke?"'],
  },
  tomlin: {
    firstMeet: ['"Tomlin Wren. Welcome to the Gilded Tankard: hot food, cold ale, and the only honest dice for a day\'s ride."'],
    gunOut: ['"Holster it, friend. The last gun drawn in here cost me a mirror."'],
    starving: ['"You look like you\'d eat the table. Sit down. Pot pie, six crowns."'],
    filthy: ['"I\'ll serve you, but at the far end of the bar."'],
    festival: ['"Lamplight Eve! First one\'s on the house, same as every year since my father\'s time."'],
    millCleared_new: ['"The whole room drank to you last night. You weren\'t here. Typical hero."'],
    gateHeld_new: ['"Your money\'s no good here tonight. Tomorrow it\'s good again."'],
    rain: ['"Filthy out. Good for business. Come in by the fire."'],
    late: ['"Last orders went an hour ago, but for you I can find a heel of bread."'],
    regular: ['"The usual corner\'s free."'],
  },
  fenn: {
    firstMeet: ['"Fenn Marlow. I hunted the Vale for thirty years. Now I hunt the bottom of this cup."'],
    justFought: ['"You\'ve blood on your boots. Hound? You can smell it, the wet-dog rot."'],
    many: ['"You\'ve taken more out of the Vale this month than I did in my last three years. Don\'t get proud. It notices pride."'],
    regular: ['"Sit. Tell me what\'s moving out there."'],
  },
  noname: {
    firstMeet: ['"You don\'t need my name. You need to know I buy things the Watch would rather count."'],
    liked: ['"Friend of the Ash Road. Friend\'s prices."'],
    gunOut: ['He does not react to the revolver at all, which is somehow worse.'],
    auditDone: ['"I heard about the Tower\'s clerk. Numbers. Who knew they could hurt a man."'],
    regular: ['"You again. Good. Reliable people are rare."'],
  },
  renn: {
    firstMeet: ['"Captain Renn. You go through my gate, you come back through my gate. That is the whole arrangement."'],
    gunOut: ['"Outside the palisade, draw what you like. Inside, it stays in leather."'],
    justFought: ['"You\'ve been busy. How many, and where?"'],
    lowHp: ['"You\'re no use to me dead. Chapel, then bed. Go."'],
    many: ['"My sergeant says you\'ve done more sweeps than the Watch this month. He\'s right, and I don\'t like it."'],
    millCleared_new: ['"The mill, alone. I\'d have sent six and lost four."'],
    chapelCleared_new: ['"The drowned chapel as well. If this town had a medal I\'d pin it on you. We have a bounty tin."'],
    gateHeld_new: ['"We held. I have written it in the Watch book exactly as it happened, and nobody will believe it."'],
    late: ['"Gate\'s barred. If you must go out, I\'ll open it once. Coming back is your affair."'],
    regular: ['"Report."'],
  },
  lira: {
    firstMeet: ['"Lira Voss. Yes, his niece. No, I do not collect for him. I study the wards; someone in this family should."'],
    thirsty: ['"Your lips are split. Mana follows water. You know this. Drink."'],
    starving: ['"You are burning yourself for fuel. Eat, or your next spell will take something you wanted to keep."'],
    stoneKept: ['"You bound it into your staff." She is fascinated and appalled in equal parts. "Write down everything it does. Everything."'],
    stoneChapel: ['"Uncle Aldric is furious that the Chapel has a stone. He is also sleeping better than he has in years. Do not tell him I noticed."'],
    stoneTower: ['"The vault is fuller. He is… not happier. Relieved. With him those are different things."'],
    auditDone: ['"I went through the rest of Tolan\'s books. Yours was not the only page. We are writing to forty families."'],
    gateHeld_new: ['"I watched it from the Spire window with a spyglass and a bucket to be sick in. You were magnificent."'],
    regular: ['"Good. I have a question about how the staff felt when you last cast in the rain."'],
  },
  aldric: {
    firstMeet: ['"So. Ysolde\'s heir." Aldric Voss looks at you the way he must look at a column of figures. "You have her stubbornness. It kept this town standing last night."'],
    debtFree: ['"Your page is closed. You owe me nothing. I find I do not know how to talk to people who owe me nothing."'],
    stoneKept: ['"That staff. I can feel it from here. Be better at this than I was."'],
    regular: ['"You again. Good. Walk with me a moment."'],
  },
  pip: {
    firstMeet: ['"You\'re the one living in the witch\'s house! Is it true the chair rocks by itself?"'],
    gunOut: ['"Can I hold it? I won\'t shoot anything. Probably."'],
    starving: ['"You look like me in winter. Bram drops a loaf at dawn, by accident. I can show you where."'],
    millCleared_new: ['"Did it scream? Petch said it would scream. I bet Jory a button it screamed."'],
    gateHeld_new: ['"I was on the tavern roof! I saw the lightning! Do it again!"'],
    regular: ['"I followed you yesterday. You didn\'t notice. I\'m getting good."'],
  },
  yara: {
    firstMeet: ['"Yara Fen. I knew your aunt forty years. She stole my moonpetal patch and I stole her tea recipe. We were even."'],
    thirsty: ['"Tea, child. Now. Herbs by the cairns, a pot at your hearth."'],
    exhausted: ['"Warm fish supper and an early bed. Fatigue is a debt too, and it compounds."'],
    rain: ['"Good rain. The herbs will be fat tomorrow."'],
    stoneChapel: ['"Moonpetal by the mill has doubled since that brazier was lit. The ground knows."'],
    regular: ['"Let me see your tongue. Hm. More water."'],
  },
  cael: {
    firstMeet: ['"You are Ysolde\'s. Come closer, my eyes are not what they were. Yes. The same jaw."'],
    gateHeld_new: ['"Forty years I watched that gate bring nothing. Last night it kept something out. That will do."'],
    late: ['"I do not sleep much. Old women and owls."'],
    regular: ['"Sit with me a minute. Nobody sits any more."'],
  },
});
Object.assign(VOICE.bram!, { gateHeld_new: ['"I baked all night for the Watch. You get the first loaf. Don\'t argue."'], rain: ['"Rain keeps the square empty and the bread dry in here. Come under the awning."'], festival: ['"Lamplight Eve! Honey cakes at cost. Don\'t tell Sera I\'ve gone soft."'], debtFree: ['"A free householder! That\'s worth a loaf on me, once."'] });
Object.assign(VOICE.sera!, { chapelCleared_new: ['"The drowned chapel too? At this rate I\'ll run out of things to be afraid of. Bad for trade."'], gateHeld_new: ['"I kept the shutters closed and a crossbow on the counter. Didn\'t need it. Thank you."'], stoneKept: ['"That staff of yours is making my scales read wrong. Stand back from the counter."'] });
Object.assign(VOICE.brannic!, { auditDone: ['"Forty years of clean trial balances in that book, and all of them lies. You found it with a pencil. Sit down; I have real work for you now."'], debtFree: ['"Your own page ruled off. Most clerks never see that. Keep working anyway; I need you."'] });
Object.assign(VOICE.tolan!, { stoneChapel: ['"The Chapel. You gave a Voss stone to the Chapel." Tolan\'s pen has stopped. "Master Voss will have… remarks."'], auditDone: ['Tolan does not look up from the book. His ears are red.'], debtFree: ['"Your page is closed. I have nothing to say to you that the book has not already said."'] });
Object.assign(VOICE.vole!, { chapelCleared_new: ['"The chapel that sank. You went down there. I\'ve patrolled past it for ten years with my eyes shut."'], gateHeld_new: ['"I was at your left shoulder all night and I still don\'t believe it. Drinks are on the Watch."'], rain: ['"Wet night, quiet gate. Hounds hate rain worse than I do."'] });
Object.assign(VOICE.petch!, { chapelCleared_new: ['"Two stones found in one lifetime. Ysolde looked for the second for thirty years. You walk faster than she did."'], gateHeld_new: ['"I have seen four debts called and one wardbreak turned. I did not expect the second. Sit by an old man."'], stoneKept: ['"You kept one. Hm. The old wardens carried them, before the Tower built vaults. It is not wrong. It is heavy."'] });

// v0.7: voices of the Eastern Reach
Object.assign(VOICE, {
  garrow: { firstMeet: ['"You\'re the one from Millbrook. Vole\'s letter said you\'d be taller." He holds out a hand anyway.'], gunOut: ['"Holster that in my hall, if you please. I have guards for the shooting."'], engineDown_new: ['"The Hollow is quiet the right way, the miners say. The Reeve of Ashford owes you a debt, and I pay mine."'], engineDown: ['"Copper is moving again. So is the market. So am I, frankly; I slept last night."'], tollCleared: ['"The toll fire is out. The barges cheered. I pretended not to."'], filthy: ['"There is a bathhouse, at the east end. I mention it as a public service."'], debtLate: ['"A Voss clerk wrote to me asking whether you had been seen in Ashford. I wrote back that I do not answer the Tower\'s letters."'] },
  wenna: { firstMeet: ['"New face! Sit, eat, pay, in that order. I\'m Wenna. This is the Lantern. That\'s Jory; ignore him."'], starving: ['"You look like a coat on a peg. Eel pie. Now."'], filthy: ['"Lovely to see you. Lovelier from over there. Greta\'s bathhouse, love, east end."'], late: ['"Kitchen\'s cold but the beds are warm. Three crowns."'], engineDown_new: ['"Drinks on the house! One drink. One. Jory, that means you too."'], rain: ['"Rain\'s good for trade. Wet people drink."'] },
  dace: { firstMeet: ['"Morrow. I run the Lodge. You\'ve got the look of someone who has been bitten by something and kept walking. Good."'], justFought: ['"Fresh blood on your boots. Tell me it\'s theirs and tell me what it was."'], tollCleared: ['"The toll gang\'s scattered. The Lodge owes you a drink and the Reeve owes you a purse."'], many: ['"You\'re making my rangers look slow. Keep at it."'], carbine: ['"Hale carbine. Good. Now learn to work the lever without looking."'] },
  ilse: { firstMeet: ['"Ilse. Mother Ilse, to the miners, though I\'ve no children but the ones who cough."'], bleeding: ['"Sit down before you fall down. Then pay me. Then I\'ll stitch you."'], lowHp: ['"You\'re grey. Salve, now, and a sit."'], exhausted: ['"Salts will wake you and cost you. Sleep is cheaper."'] },
  corwin: { firstMeet: ['"Corwin Hale. That\'s my name over the door, and my daughter\'s, though she\'d say hers first."'], gunOut: ['"Point it at the floor in my shop. The floor has never done anything to anyone."'], carbine: ['"How\'s she shooting? Clean the action after rain. Every time."'] },
  tamsin: { firstMeet: ['"Tamsin Reed. Curios, charms and the occasional curse, removed."'], charmed: ['"I see you\'re wearing one. Mine? Good. Not mine? I\'ll pretend I didn\'t notice."'] },
  oskar: { firstMeet: ['"Oskar Penn. Fish. That\'s it, that\'s me."'], rain: ['"Rain! Best fishing weather there is. Go on, the trout are hungry."'] },
  aldous: { firstMeet: ['"Welcome to the Flame\'s little house. Mind the step: it\'s older than the town."'], traumatised: ['"Kneel a while. You are carrying something heavier than your pack."'], stoneChapel: ['"Maren wrote that a stone came home to her brazier. I wept, a little. Do not tell her."'], engineDown_new: ['"The forge-stone\'s guardian is at rest. Whatever you choose to do with the seam, choose it slowly."'] },
  tam: { firstMeet: ['Tam doesn\'t look up. "If the Reeve sent you, tell him I\'m not going back down."'], engineDown_new: ['Tam stands up for the first time since you met him. "It\'s… down? It\'s really down?" He sits again, but differently.'] },
  sela: { firstMeet: ['"You\'re going up there. I can see it on you. Bring him home, or bring me why."'], engineDown_new: ['"So it\'s done." She holds her elbows. "Thank you for going down where he went."'] },
  hobb: { firstMeet: ['"Varley. This is my farm, those are my sheep, and that\'s my daughter pretending not to listen."'], starving: ['"Have an apple. Have three. You look like you walked from Millbrook on an empty belly."'], justFought: ['"Was it wolves? Tell me it was wolves and tell me they\'re fewer."'] },
  nell: { firstMeet: ['"Hello! Are you a warden? You\'ve got a gun. Wardens have guns. Have you seen a sheep?"'] },
  ulric: { firstMeet: ['"Ashdown. I cut wood. You don\'t look like you cut wood."'], justFought: ['"Wolves? Good. Every one you drop is one less at my back while I swing."'] },
  mags: { firstMeet: ['"Mags! Everyone knows Mags. Now you do. Buying?"'], debtLate: ['"Owe the Tower, do you? So does half the Reach. Buy something cheerful."'] },
  edda: { firstMeet: ['"Strand, bridge watch. Renn\'s cousin, before you ask. Everyone asks."'], tollCleared: ['"The toll fire is out. I can see the whole road from here and I like the view better."'] },
});

Object.assign(VOICE, {
  hesk: { firstMeet: ['"Hesk. Orla. I keep this village fed, dry and arguing. You came through the West Gate? Then sit; nobody has in nine years."'], starving: ['"Eat something. Davin has eel and barley on. I\'ll not have folk fainting on my green."'], ormDown_new: ['"Cadoc says the king is down." Orla Hesk sits on the longhouse step as if her knees have been cut. "Thank you. That is all I have. Thank you."'], crownSold: ['"Good day." She does not say your name.'], rain: ['"Rain off the lake. It never stops, it only changes its mind about how hard."'] },
  teague: { firstMeet: ['"The Heron and Reed. I\'m Davin. Bed\'s three, eel and barley\'s six, and if you\'re from the Tower you can drink in the rain."'], filthy: ['"There\'s a bucket by the back door. Use it before you sit on my benches."'], late: ['"Last orders were an hour ago. Sit anyway. Nobody sleeps well this side of harvest."'], ormDown_new: ['"Free ale for whoever put the old king down, and that\'s the only free ale I\'ve poured in thirty years."'] },
  liss: { firstMeet: ['Liss gives you a quick, tired smile. "Davin\'s sister. I do the rooms and the singing. Mostly the rooms, lately."'], late: ['"Can\'t sleep either? The mist gets in through the shutters."'] },
  cadoc: { firstMeet: ['The old man leans on a staff of black bog-oak. "Cadoc. I keep the barrows. Kept. They are not keeping very well."'], graveGold: ['Cadoc looks at your pack. "There is barrow gold in there. I can smell it. It belongs to the dead. Sell it if you must; just do not tell me where."'], ormDown_new: ['"He is sleeping again. I felt it at dawn, like a door closing in the next room." Cadoc grips your arm hard. "I am too old to thank you properly. Here: this is me trying."'], crownKept: ['"You wear it at your throat." Cadoc says nothing else, which is worse.'] },
  thrush: { firstMeet: ['"Thrush. Gammer to my friends, of which I have one, and he\'s a goat." She peers up at you. "You\'re all boots and no sense. Come in, mind the cat."'], bleeding: ['"Sit. No, sit on the stool, not the cat. Who taught you to bleed like that?"'], exhausted: ['"Heather tea and bed. I\'d sell you the first if you\'d take the second."'] },
  marra: { firstMeet: ['"Marra Quill, boats. Mind the pitch, it\'s hot." She does not stop caulking. "You want waders, not a boat. Everyone from the east wants a boat until they\'re in one."'], rain: ['"Good weather for seeing where the hulls leak."'] },
  osric: { firstMeet: ['"Osric." The old man does not take his eyes off his float. "Shh. You\'ll frighten the lake."'], crownReturned: ['"Perch in the shallows this morning, like when I was a boy." Osric is smiling, which looks like it hurts. "Whatever you did up there, do it again sometime."'] },
  ebba: { firstMeet: ['"Ebba Rook. Smoke, salt and eels. If it swims, I can make it keep."'], filthy: ['"You smell worse than my smokehouse and that\'s a professional opinion."'] },
  tobin: { firstMeet: ['"Crake. Smith. Horseshoes, hinges, and since the dead got up, a lot of sword-straightening."'], carbine: ['"Ashford gun. Pretty. Can it stop a wight? No. Can it make one think twice? Also no. Fire, friend. Fire."'], gunOut: ['"Put that away near the forge. Hot iron and loaded guns are a short story."'] },
  wynn: { firstMeet: ['"Wynn Calder. I keep sheep on the heath, or I did, before the wolves started keeping them for me."'], justFought: ['"Was that wolves I heard? Tell me you got the grey one. He\'s cleverer than me."'] },
  vane: { firstMeet: ['"Edwin Vane, of the Spire\'s Antiquarian Society." He offers a hand stained with old earth. "You must be the person Hesk sends to frighten scholars. I warn you, I frighten very easily."'], graveGold: ['"Is that barrow gold? Oh, do let me see. I pay far better than the smokehouse woman, and I write down where it came from, which is more than she does."'], crownSold: ['"The Society will be thrilled. I am thrilled. I may finally be forgiven for the drainage fiasco."'] },
  sully: { firstMeet: ['"Sully. I dig. He points, I dig." Sully leans on his shovel. "Don\'t tell him I said, but I don\'t like it down there. Something breathes."'] },
  nettle: { firstMeet: ['"Nettle Smeath. That\'s our clamp, that\'s our hut, and that\'s Gorse\'s axe with nobody holding it."'], ormDown_new: ['"The lights are gone off the Ring. Gorse slept all night without talking. I owe you, and I don\'t say that."'] },
  gorse: { firstMeet: ['"Smeath. Gorse." He rubs his eyes. "Nettle says I was away three nights. Felt like an afternoon. A long one."'] },
  gorse_lost: { firstMeet: ['Gorse Smeath sits in the middle of the Ring of Nine, staring at nothing. "They\'re beautiful," he says, to nobody. "When they come, they\'re beautiful."'] },
  garth: { firstMeet: ['"Garth, Watch. West Gate." He looks out at the heath. "Nine years I stood on the other side of this. I think I liked it better shut."'], westOpen_new: ['"Renn put me on this gate the morning you opened it. Thanks for that." He does not sound thankful.'] },
  // v0.9: Gullhaven and the Saltway
  bree: { firstMeet: ['"Bree Calloway, harbourmaster. If it floats, I tax it; if it sinks, I bury it. Which are you?"'], gapOpen_new: ['"You\'re the one who blew the gap. The salt carts went up the Saltway at dawn singing. Carters. Singing. I have lived too long."'], motherDown_new: ['"They say something under the cove made a noise last night like a ship breaking, and then nothing. The boats went out this morning past the cove for the first time in a year."'], marrowTaken: ['"New collector comes down from the Spire next week. I\'ve asked for one who can\'t count."'], marrowPaid: ['"Marrow bought a new coat." Bree does not look at you. "Nice coat."'], regular: ['"Tide tables are on the board. Read them before you walk out to anything."'] },
  jowan: { firstMeet: ['"The Anchor and Gull! Jowan Penhale. Beds are five, broth is ten, and the gull on the roof is called Admiral. Do not feed the Admiral."'], starving: ['"You look like a man who\'s been eating gorse. Sit. Broth."'], lowWater: ['"Tide\'s out. If you\'re going out on the flats, the mussels by the wreck are the fat ones. Mind the crabs."'], filthy: ['"Smell of you. There\'s a pump in the yard. I\'ll not have you frightening the Admiral."'] },
  trewin: { firstMeet: ['"Amos Trewin. Keeper. They\'ll have told you I let her go dark. I never did."'], motherDown_new: ['"I slept last night. First time since the Wren." He looks out at the cove. "Whatever you did down there, thank you."'], marrowTaken: ['"They let me buy my own drink at the Anchor. I didn\'t know how much I missed paying for things."'] },
  marrow: { firstMeet: ['Collector Silas Marrow looks up from a ledger. "Customs. If you have goods to declare, declare them. If not, the door is behind you."'], gunOut: ['"Put that away. This is a customs house, not a tavern."'], marrowFree: ['Marrow does not look up. "Was there something else?"'] },
  morwenna: { firstMeet: ['"Morwenna Kitto, the auction. Fish in, coin out, and I pay a third more than any fishmonger inland because I can."'], lowWater: ['"Low water. Mackerel come in on the flood; try the quay end after the turn."'] },
  nan: { firstMeet: ['Nan Polgreen does not stop mending. "Nan. Nets. Sit if you\'re sitting, hold this if you\'re helping, go away if you\'re neither."'], motherDown_new: ['"My Tom\'s boat was the Kittiwake, eleven year ago. Went down off the cove in a flat calm." She ties a knot very tight. "Now I know what took her. That\'s something."'] },
  tegen: { firstMeet: ['"Tegen Rowse. I build boats, and lately I build them twice." She slaps a hull. "Sea boots, if you\'re walking the flats. Tarred to the thigh."'] },
  elowen: { firstMeet: ['"Sister Elowen. The sea chapel is open always; the sea does not keep hours either."'], bellRung: ['"Every evening I ring the Wren\'s bell once. The town comes out on the quay to hear it. Thank you."'], stressed: ['"You carry a lot. Come in. The blessing is free, and the salt water is plentiful."'] },
  jago: { firstMeet: ['Captain Jago Vosper takes his pipe out. "Forty years at sea, and I\'ve never seen a light where a light shouldn\'t be. Until this year."'], motherDown_new: ['"A crab. A CRAB. Forty years." He laughs until he coughs. "Nobody will believe me at the Anchor."'], regular: ['"The Wren came in on a falling tide, wrong side of the bar. No master in his right mind. Unless he was following a light."'] },
  pasco: { firstMeet: ['"Pasco Hendy, chandler. Oil, rope, tar, shot, and a brass spyglass I\'ll let go to the right buyer."'], marrowTaken: ['"I\'ve been selling Keeper Trewin his oil again." Pasco looks at his boots. "I should never have stopped."'] },
  lowdy: { firstMeet: ['"Lowdy. I pick mussels." She holds up a bucket. "I used to pick more, before the crabs got clever."'], lowWater: ['"Out we go. The far beds by the wreck are best, but watch the channels: the tide comes back up them first."'] },
  treloar: { firstMeet: ['Old Treloar leans on his shrine. "Forty years I took the salt up through that gap. Then the hill fell down on it."'], gapOpen_new: ['"Heard it go from here. Shook the shrine. I said a prayer, then I said a worse word, then I went and looked." He grins. "Cart road\'s open."'] },
});

// The order in which reactions take priority when several apply (urgent first).
export const REACTIONS = () => Object.keys(COMMON);
export const PRIORITY: (keyof typeof COMMON)[] = ['firstMeet', 'gunOut', 'motherDown_new', 'gapOpen_new', 'ormDown_new', 'westOpen_new', 'engineDown_new', 'gateHeld_new', 'chapelCleared_new', 'millCleared_new', 'bleeding', 'lowHp', 'starving', 'thirsty', 'fired', 'debtLate', 'debtDue', 'filthy', 'exhausted', 'justFought', 'goodClerk', 'graveGold', 'carbine', 'charmed', 'crownReturned', 'crownSold', 'crownKept', 'marrowTaken', 'marrowPaid', 'marrowFree', 'bellRung', 'engineDown', 'tollCleared', 'lowWater', 'stressed', 'fromMillbrook', 'disliked', 'liked', 'fresh', 'auditDone', 'stoneKept', 'stoneChapel', 'stoneTower', 'traumatised', 'festival', 'rain', 'debtFree', 'debtLow', 'many', 'millCleared', 'early', 'late', 'regular'];

/** Greeting for a conversation. Picks the most urgent true reaction this NPC has a line for, avoiding the line they said last time. */
export function greet(c: Ctx, fallback: string[]): { text: string; reason: string } {
  const m = memory(c.s, c.npc), v = VOICE[c.npc] ?? {};
  for (const k of PRIORITY) {
    const lines = v[k]; if (!lines || !COMMON[k](c, m)) continue;
    const last = m.notes.find(n => n.startsWith('said:'));
    const pick = lines.length > 1 ? lines.filter(l => 'said:' + l.slice(0, 20) !== last) : lines;
    const text = pick[(day(c.s) + m.met) % pick.length];
    return { text, reason: k };
  }
  return { text: fallback[(day(c.s) + m.met) % fallback.length], reason: 'idle' };
}
/** Record that a conversation happened; remember meaningful things so they don't repeat and later lines can refer to them. */
export function remember(c: Ctx, reason: string, text: string) {
  const m = memory(c.s, c.npc);
  if (m.lastDay !== day(c.s)) m.met++;
  m.lastDay = day(c.s);
  m.notes = m.notes.filter(n => !n.startsWith('said:'));
  m.notes.push('said:' + text.slice(0, 20));
  if (reason === 'millCleared_new') m.notes.push('saw-mill');
  if (reason === 'chapelCleared_new') m.notes.push('saw-chapel');
  if (reason === 'gateHeld_new') m.notes.push('saw-gate');
  if (reason === 'engineDown_new') m.notes.push('saw-engine');
  if (reason === 'ormDown_new') m.notes.push('saw-orm');
  if (reason === 'westOpen_new') m.notes.push('saw-west');
  if (reason === 'gapOpen_new') m.notes.push('saw-gap');
  if (reason === 'motherDown_new') m.notes.push('saw-mother');
  if (reason === 'gunOut') m.mood -= 2;
  if (reason === 'fresh' || reason === 'goodClerk') m.mood += 1;
  if (m.notes.length > 12) m.notes = m.notes.slice(-12);
}
/** A consequence of a conversation, applied by the caller (e.g. Sera's one-time discount after the mill). */
export function consequence(reason: string, npc: string): null | 'discount' | 'calm' {
  if (npc === 'sera' && reason === 'millCleared_new') return 'discount';
  if (npc === 'petch' && reason === 'exhausted') return 'calm';
  return null;
}
