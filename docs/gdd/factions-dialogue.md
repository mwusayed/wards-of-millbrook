# Factions and dialogue

## 1. Overview
Six factions (Millbrook folk, the Tower, the Chapel, the Watch, Ash Road, Ashford) with standing −100..100 that
changes prices and pay and drifts back to neutral when neglected. Dialogue picks each line by a rule over real game
state, in each person's own voice, and remembers what it said (`src/sim/dialogue.ts`).

## 2. Player fantasy
People notice: your gun, your smell, your wounds, what you did yesterday, what you did with the stones.

## 3. Detailed rules
1. Greeting = the most urgent true reaction this person has a line for (`PRIORITY`), avoiding their last line.
2. Memory per NPC: times met, last day, mood, notes ("saw-mill", "saw-engine"…).
3. Some reactions have consequences (Sera's one-time discount; Petch calms you).
4. Talking once a day raises that person's faction slightly; a drawn gun lowers it.
5. Drift: after 5 days without contact, standing moves 1 toward 0 per day.

**v0.8:** a seventh faction, **Fernhollow** (the lake village: the headwoman, the barrow-warden and the boats). Issuers on the notice post: Orla Hesk, Cadoc Lowen, Wynn Calder, Davin Teague. Selling barrow gold costs 2 standing per piece. New reactions: `ormDown_new`, `westOpen_new`, `crownReturned/Sold/Kept`, `graveGold`; 16 new voices (`dialogue.ts`).

## 4. Formulas
- Standing labels: ≥60 Honoured, ≥25 Trusted, ≥8 Liked, >−8 Neutral, >−25 Wary, >−60 Disliked, else Hated (`standing`).

## 5. Edge cases
- People hidden by the story (Aldric before the finale, Tolan after the audit) cannot be talked to.

## 6. Dependencies
Economy (prices, pay), quests (talk options), NPC renderer (talk gestures, look-at).

## 7. Tuning knobs
`FACTION_DRIFT_AFTER_DAYS 5`, per-reaction priority order, voice tables.

## 8. Acceptance criteria
- Dialogue rule tests in `tests/sim.test.ts` (pass 3); 39 people present and animating → browser "22 people of the Reach…".
