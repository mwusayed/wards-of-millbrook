# Body: needs, stamina, health, wounds

## 1. Overview
Eight needs in real units (kcal, ml, %, points) with rest/active/exert/sleep rates, from Mercenary Maintenance;
VEILWORK bands and stamina hysteresis; Dust & Debt wounds that cap health until treated.

## 2. Player fantasy
"I am a body." Hunger, thirst, a full bladder and a bad night all show up in your aim and your temper.

## 3. Detailed rules
1. Needs: calories, hydration, bladder, bowel, hygiene, comfort, fatigue, stress (`NEED_KEYS`).
2. Each changes per game hour by activity: rest, active (moving), exert (sprinting/combat), sleep (`DECAY_PER_HOUR`).
3. Each need has a band: optimal / strained / critical (`needBand`). Bands feed the check system.
4. Checks (combat, physical, social, focus) start at 75% and lose the single worst need penalty (`NEED_MODIFIERS`).
5. Stamina drains while sprinting and locks at 0 until it recovers to 25 (hysteresis).
6. Hits of 15+ damage leave a wound that lowers max health until bound (bandage) or stitched (physician's kit).
7. Fatigue 98 → you fall asleep where you stand (collapse).

## 4. Formulas
- Need per hour (rest): calories −100, hydration −100, bladder +50, bowel +30, hygiene −2, comfort −1, fatigue +6, stress +1. Exert: calories −300, hydration −300. Sleep: 0.35× waking food/water, fatigue −11.25/h (`DECAY_PER_HOUR`).
- Check chance = `clamp(75 − worstPenalty + bonus, 5, 100)` (`checkChance`).
- Spread multiplier = `1 + (75 − combatChance) / 50` (`spreadMultiplier`), so 1.0 healthy, up to 2.4 wrecked.
- Stamina: drain `22/s × (1 − 0.03·vigor) × (roadwise 0.85) × (fleet 0.75)`; regen `16/s × staminaRegenMult(needs) × (hearty 1.3) × load`.
- Wound severity = `round(damage × 0.6)` for hits ≥ `WOUND_HIT_THRESHOLD = 15`.

## 5. Edge cases
- The salt locket charm skips about 30% of wounds; the stout buff cuts damage 10%.
- Sleeping at the Drowned Lantern skips the feather-bed bonus (`sleep(s, away = true)`).

## 6. Dependencies
Combat (spread, damage taken), magic (mana max from calories, regen from water), economy (collapse fee), dialogue (NPCs react).

## 7. Tuning knobs
| Knob | Value | Safe range |
|---|---|---|
| `T.starving` / `T.dehydrated` | 500 kcal / 375 ml | ±25% |
| `T.exhausted` | 70 | 60–80 |
| `STAMINA_DRAIN` / `STAMINA_REGEN` | 22 / 16 per s | 15–30 / 10–25 |
| `WOUND_HIT_THRESHOLD` | 15 | 12–20 |

## 8. Acceptance criteria
- Rest burns 100 kcal per hour; exertion three times that → tests "needs decay per MM rates…", "exertion burns three times rest calories".
- Feather bed clears fatigue on a full night → test "feather bed clears fatigue on a full night".
