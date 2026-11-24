# Enemies

## 1. Overview
An AI loop from Tower & Sands (idle → alert → approach → telegraph → strike → recover), melee and ranged roles
from VEILWORK, status effects from Archmage. Code: `src/render/enemies.ts` (`DEFS`, `RESIST`, `EnemyManager`).

## 2. Player fantasy
Every enemy is readable: you can see the wind-up coming and answer it — step aside, shoot first, switch element.

## 3. Detailed rules
1. Idle enemies wander near home; with line of sight inside `sight` they chase (the drowned and the hollowed wait until you come near).
2. Melee: close to `reach × 0.85`, wind up for `windup` seconds, strike if you are inside reach and in front.
3. Ranged (shades, imps, crossbowmen) keep a band of distance and strafe; they fire projectiles you can dodge.
4. Special behaviour: wolves circle at 2–7 m then dart in; boars paw the ground then charge in a straight line (a wall stuns them); crossbowmen keep 9–18 m.
5. Status: burn (3 dmg per 0.5 s for 3 s), slow (half speed 3 s). Big hits (≥ 30% of max health) stagger.
6. Enemies far from home (48 m) give up and return, healing 20. Gate-defence enemies never give up.
7. Elites: 2.2× health, 1.3× damage, +6 sight, 1.22× size.
8. Line of sight is re-tested 5 times a second, not every frame.
9. v0.8: barrow wights stand until something comes near, rise out of the ground when spawned with `rise` (2 s, they cannot act while rising), lurch on a dragging left leg and chop two-handed; each hit brings grave-chill (`W.graveChill`). Grave-lights weave in (a sideways drift that swings back and forth), wind up by swelling, and burst within `WISP_BURST` m: full damage inside half the radius, 60% outside; a burst light dies with no reward.
10. v0.8: night spawns (tag `night`) appear on the Downs from 20:00 to 05:00 by `W.nightSpawns` and sink back into the ground at dawn (`EnemyManager.sink`, 2.4 s, no reward).

## 4. Formulas (from `DEFS`)
| Kind | HP | Speed | Sight | Reach | Wind-up | Damage | Recover |
|---|---|---|---|---|---|---|---|
| Hollow hound | 55 | 6.2 | 24 | 1.7 | 0.45 | 12 | 0.7 |
| Road raider | 80 | 4.4 | 22 | 2.0 | 0.6 | 18 | 0.8 |
| Shade caster | 60 | 3.0 | 28 | 13 | 0.85 | 14 | 1.6 |
| Drowned acolyte | 120 | 2.5 | 20 | 2.1 | 0.75 | 17 | 1.1 |
| Inferno imp | 38 | 5.0 | 26 | 12 | 0.5 | 9 | 0.9 |
| Thornwood wolf | 46 | 6.9 | 26 | 1.6 | 0.36 | 10 | 0.55 |
| Tusker boar | 135 | 4.6 (charge 11.5) | 18 | 9 | 0.95 | 24 | 1.3 (+1.4 if it hits a wall) |
| Ash Road crossbowman | 72 | 4.0 | 30 | 24 | 0.95 | 15 | 1.7 |
| Hollowed miner | 105 | 2.4 | 17 | 2.3 | 0.85 | 20 | 1.15 |
| Barrow wight (v0.8) | 150 | 2.7 | 20 | 2.3 | 0.9 | 22 + grave-chill | 1.2 |
| Grave-light (v0.8) | 26 | 3.6 | 24 | 1.8 (burst 2.6) | 0.7 | 16 | — (dies) |

Resistances (`RESIST`, × damage): shade fire 1.2; drowned frost 0.5, fire 1.25, spark 1.3; imp fire 0.25, frost 1.6;
wolf fire 1.2; boar bullet 0.85, melee 0.8, frost 1.3; hollowed frost 0.7, bullet 0.85, spark 1.6, fire 1.1;
wight bullet 0.75, fire 1.5, frost 0.4, melee 1.1; grave-light bullet 0.7, fire 0.5, frost 1.3, spark 2.0, melee 1.3.
Grave-chill per hit (`B.GRAVE_CHILL`): stamina −18, comfort −3; none with the *Grounded* buff.

Loot (`rollLoot`): wolf pelt 60%; boar meat or tusk 80%; crossbowman tags/carbine rounds 60% and coin 70%;
hollowed copper or ward-copper 60%; luck adds 15% (lucky trait, clover charm).

## 5. Edge cases
- Enemies more than 120 m away (Manhattan) are hidden and skip their AI unless chasing.
- Separation keeps packs from stacking; collisions use the world boxes.

## 6. Dependencies
World colliders, combat (damage kinds), contracts (sweeps tag enemies with the notice id), story (event spawns).

## 7. Tuning knobs
Each `DEFS` row, each `RESIST` entry, elite multipliers, the 48 m leash, line-of-sight interval 0.2 s.

## 8. Acceptance criteria
- Wolves at the fold spawn at night and their deaths complete the quest → browser "night at the fold brings four wolves", "driving them off completes the fold"; evidence `28-wolves.png`.
- Lodge notices spawn their enemies → browser "the Lodge board offers east notices and spawns them".
- Wights rise, then stand → smoke5 "barrow wights rise out of the ground"; evidence `20-wight-rising.png`. Grave-chill → smoke5 "a wight's blow hurts and brings grave-chill".
- Grave-lights burst with no reward; Spark puts them out → smoke5 "a grave-light that reaches you swells and bursts", "a Spark puts a grave-light out"; evidence `21-grave-lights.png`.
- Night spawns follow the crown and sink at dawn → rules "night spawns on the Downs follow the crown's fate"; smoke5 "night on the Downs…", "at dawn the night's dead sink…".
