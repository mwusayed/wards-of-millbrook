# Quests and story

## 1. Overview
Quests are data (`src/sim/story.ts`): stages with a text, a "done" test on real game state or a conversation,
and an optional map target. Main chain: The Wardbreak (Ledger & Ward) fused with the debt. From v0.7: the
Eastern Reach chain.

## 2. Player fantasy
The valley's old wards are failing and you are the one who keeps turning up where they broke.

## 3. Detailed rules
1. Quests start automatically when available, or by an offer in conversation (◆ options).
2. A stage advances when its `done` test is true, or when its conversation is chosen.
3. Chains: mq0 A Roof and a Debt → mq1 The Wardbreak → mq2 Ember and Echo → mq3 The Sunken Chapel → mq4 Wardbreak Night;
   eq1 The Road East → eq2 Copper and Silence. Sides: Red Ink, Baker's Delivery, Maren's Herbs, The Missing Cart,
   Fenn's Lucky Lure, Widow Cael's Ring, The Cursed Well, Three Pelts, Brask's Last Page, Wolves at the Fold, Bluebell, The Toll.
4. Choices with lasting effects: each ward-stone (Tower / Chapel / keep), the audit outcome, the ward-copper seam (seal / guild / Tower).
5. Endings: Warden of Millbrook, The Tower's Hand, Hedge-Mage Ascendant, The Honest Ledger, Free and Clear, Debt Called; free play after.

**v0.8, the Westmarch (`wq1`–`wq5`, details in `westmarch.md` §3.6):** *The Sealed Gate* (Petch → Renn's key → the West Gate → Fernhollow → Orla Hesk), *The King Under the Hill* (Cadoc → Vane's key three ways → Gammer Thrush's ward → the barrow → three braziers → King Orm → the crown, `decideCrown` 1/2/3 → Hesk), and side tasks *Smoke on the Heath*, *Old Grandmother*, *The Drowned Road*.

## 4. Formulas
- Stone relief: Ember 50, Censer 60 (`STONE`); seam to the Tower 80; guild 150 crowns; seal 45 from the Reeve.
- Aldric's verdict relief: both to the Tower = all; both to the Chapel = 100; mixed = 60; both kept = 0 (`aldricVerdict`).

## 5. Edge cases
- `updateQuests` loops up to four times so a finished quest can start the next in the same tick.
- Quest items are never sold by traders' sell lists.

## 6. Dependencies
Every system: quests read state and grant crowns, items, standing, traits.

## 7. Tuning knobs
Rewards in each quest's `reward`, availability tests, relief amounts.

## 8. Acceptance criteria
- Main chain playable to an ending → test "main chain can be played through to an ending".
- Reach arc playable → test "the Eastern Reach arc plays through…"; browser checks for each eq stage.
