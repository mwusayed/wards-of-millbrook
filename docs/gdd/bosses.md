# Bosses

## 1. Overview
Each dungeon ends in a boss with one rule to learn. Patriarch: fire staggers. Wraith: adapts to what you repeat.
Warden Engine: armoured front, open back. Code: `src/render/boss.ts`, `wraith.ts`, `mine.ts`.

## 2. Player fantasy
A fight you win by understanding it, not by having more health.

## 3. Detailed rules
**Shade Patriarch (Old Mill, 640 HP).** Phase 1 bound to the millstone (grasp ring, summons); phase 2 below 60%
(volley of five orbs, dark pools); phase 3 below 25% (wail: hide behind a pillar). Fire builds stagger (34 per
burn); at 100 he is staggered and takes double damage.

**Cinder Wraith (Sunken Chapel, 820 HP).** Hit it with the same damage kind three times running (twice from
phase 2) and it hardens against that kind (×0.3 for 14 s) and counters; changing kind deals ×1.15.

**Warden Engine (Copper Hollow, 1250 HP).** Front armour ×0.25, sides ×0.6, back core ×1.6, stunned ×1.5. Slam: a
ring telegraph, then an expanding wave you must jump or outrun. Charge: a lane telegraph, then 13 m/s in a straight
line; hitting a wall or pillar stuns it for 3.2 s (2.6 in phase 2). Hugging it for 2.2 s triggers a push-back pulse.
Spark stuns it for 1.2 s. Below 50%: faster, and hollowed miners join every 22 s.

**King Orm, the Barrow-King (Barrow of King Orm, 1100 HP, v0.8).** Wakes rising from the bier when you enter the chamber after the Hall is lit. Sweep: a 100° arc telegraph, 3.8 m (step back). Cleave: a lane telegraph 1.6 × 5 m (step aside). Calls two wights at 70% and 40%. Below 50% every brazier in the chamber goes out and the room goes dark (`world.barrowDark`): he is *shrouded* and takes `ormShroud(lit)`; every 26 s he walks to the lit brazier nearest him and breathes it out. Relight braziers with the lantern (interact) or a Firebolt that lands within 1.6 m. Fire always does ×1.25. On defeat he kneels and crumbles; the crown stays on the bier and the lights return.

## 4. Formulas
- Engine damage taken = `amount × mult`, mult from `behind()` = −dot(facing, toPlayer): >0.35 → 1.6; >−0.2 → 0.6; else 0.25; stunned 1.5.
- Slam wave radius grows 12 m/s to 11 m; hit if the wave passes you while you are on the ground (26 × 0.8 damage).
- Charge damage 26 plus a 4 m shove; pulse 10 damage and a 6 m shove.
- Orm damage taken = `amount × (phase 1 ? 1 : 0.35 + 0.1625 × lit) × (fire ? 1.25 : 1)` (`ormShroud`, `ORM_FIRE_MULT`); sweep 24, cleave 32 (`ORM_ATK`); snuff every `ORM_SNUFF_EVERY` = 26 s.

## 5. Edge cases
- Dying resets the boss to full health and phase 1; you wake at the dungeon's waystone if you lit it.
- A boss's summons are removed on reset and killed on its death.

## 6. Dependencies
Enemy manager (external enemies), story flags (`millCleared`, `chapelCleared`, `engineDown`), HUD boss bar.

## 7. Tuning knobs
`PATRIARCH`, Wraith adaptation streak (3/2) and duration (14 s), `ENGINE` def, Engine multipliers and stun times; `ORM`, `ORM_ATK`, shroud formula, snuff interval.

## 8. Acceptance criteria
- Engine front armoured, back open → browser "the Engine's front is armoured and its back core is not".
- Charge into a wall stuns → browser "a charge into the wall stuns it". Death sets the flag and gives the heart → browser "the Engine falls…".
- Wraith adapts → smoke2 suite; Patriarch → v0.3 playtest.
- Orm wakes rising; goes dark below half; shroud follows the braziers; lantern and Firebolt relight; he falls and the crown is decided → smoke5 "King Orm wakes…", "below half health the braziers die…", "relighting a brazier…", "a Firebolt that lands by an unlit brazier lights it", "King Orm falls…"; rules "Orm's shroud follows the lit braziers"; evidence `22-king-orm.png`, `23-orm-dark.png`, `24-orm-falls.png`.
