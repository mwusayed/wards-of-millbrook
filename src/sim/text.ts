import { textRng } from './rng';
// Feed lines in the Mercenary Maintenance voice, rewritten for Millbrook.
// Each action has several variants so the log reads differently every day.

export const LINES: Record<string, string[]> = {
  wake: [
    'You wake before the bells. The house is cold and the debt is still there.',
    'Grey light through the shutters. Your back reminds you of yesterday.',
    'You wake to a cart rattling past. Another day of owing Aldric.',
    'The hearth went out in the night. You lie still a moment longer than you should.',
    'Morning. You count the crowns in your head before your feet touch the floor.',
    'A crow on the sill watches you get up. It does not look impressed.',
  ],
  sleep: [
    'You sleep like someone with nothing left to give the day.',
    'The straw mattress crackles. You are gone before it settles.',
    'You sleep badly, then well, then not long enough.',
    'Dreams of the Vale. You wake once, listen, then sink back down.',
    'Eight hours. The body takes its due.',
  ],
  eat: [
    'You eat standing up. It counts.',
    'Bram\'s bread, still faintly warm somehow. You finish it too fast.',
    'You chew and stare at nothing. The shaking in your hands eases.',
    'Crumbs on your coat. Food in your belly. Small victories.',
    'You eat like someone might take it from you. Nobody does.',
  ],
  cook: [
    'You heat the ration over the hearth. It smells better than it has any right to.',
    'Stew from a tin and an onion. The house feels like a home for ten minutes.',
    'You cook, you eat, you sit a moment with the warm bowl in your hands.',
    'The ration hisses in the pan. You eat it straight from the iron.',
  ],
  drink: [
    'Cistern water, cold enough to ache. You drink until you have to breathe.',
    'You drink from the ladle. It tastes of stone and rain.',
    'Water. Simple. Your head clears a little.',
    'You drink, refill, drink again. Thirst is a quiet thief.',
  ],
  well: [
    'You haul up the bucket. The well is older than the town, they say.',
    'Cold water from the square well. A child watches you drink, then runs off.',
    'The rope creaks. The water is clean today.',
  ],
  privy: [
    'You use the privy. The door does not lock. It never has.',
    'The privy. Five minutes nobody can ask anything of you.',
    'A draft comes up from below. You don\'t think about it.',
    'Maintenance, not dignity. You treat it like maintenance.',
    'You use the privy. Somewhere a crow laughs. Probably not at you.',
  ],
  wash: [
    'You scrub the day off at the basin. Most of it comes off.',
    'Cold water, rough cloth. You feel almost human.',
    'You wash the blood from under your nails. Some of it is yours.',
    'The basin water turns grey. You change it and go again.',
  ],
  washSoap: [
    'Tallow soap and hot water. You come out of it a different person, briefly.',
    'You lather up properly for once. Even your hair forgives you.',
  ],
  bandage: [
    'You clean the wound and bind it tight. It throbs, then settles.',
    'Linen, a splash of spirits, teeth gritted. The bleeding stops.',
    'You stitch what needs stitching and wrap the rest. Not pretty. It holds.',
  ],
  sit: [
    'You sit by the hearth and let your shoulders drop.',
    'You sit. The chair creaks. You don\'t move for a while.',
    'You sit and listen to the town through the walls. It helps.',
  ],
  tonic: ['The tonic tastes of mint and regret. Your pulse slows.', 'You down the tonic. The edges of the day soften.'],
  accidentBladder: [
    'You don\'t make it. Nobody saw. You will remember anyway.',
    'Too late. You walk home stiffly, staring straight ahead.',
  ],
  accidentBowel: ['Your body makes the decision for you. You need a wash, and a moment.'],
  hurt: ['That will leave a mark.', 'Something tears. You keep moving.', 'Hot pain, then numbness. A wound.'],
  collapse: [
    'The world tilts and goes dark. You wake on your own floor; someone dragged you home and took a fee for it.',
    'You go down hard. A watchman finds you at dawn and charges for the cart.',
  ],
  kill: ['It drops and stays down.', 'One less thing in the Vale.', 'It falls. Your hands are shaking.', 'Done. Breathe.'],
  contractTaken: ['You pull the notice from the board and fold it into your coat.', 'You take the notice. The pay is good. That should worry you.'],
  contractDone: ['Notice fulfilled. Coin counted twice.', 'The clerk pays without looking at you. Fine by you.'],
  payDebt: [
    'Aldric\'s clerk counts the coins twice and writes it in the book.',
    'You pay. The clerk\'s quill scratches. The number gets smaller.',
    'Coins on the counter. "Same time next week," says the clerk.',
  ],
  shiftStart: ['You sit at the counting desk. Brannic slides the day\'s papers across.', 'Ink, sand, ledger. Brannic nods once and goes back to his own book.'],
  shiftEnd: ['Shift done. Brannic counts your entries and your pay.', 'You blot the last line and stretch your fingers.'],
  buy: ['You pay and pocket it.', 'Coins change hands. Bram adds a word of advice for free.', 'You buy it. The purse gets lighter.'],
  noCoin: ['You count again. Still not enough.', 'Your purse says no.'],
};

export function line(key: string, seed?: number): string {
  const pool = LINES[key];
  if (!pool || pool.length === 0) return key;
  const i = seed !== undefined ? Math.abs(seed) % pool.length : Math.floor(textRng.next() * pool.length) % pool.length; // P1: seeded
  return pool[i];
}
