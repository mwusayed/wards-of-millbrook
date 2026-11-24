# Magic

## 1. Overview
Five spells (Firebolt, Frost Shard, Stone Ward, Mend, Spark) cast from the staff. Tower & Sands mana formulas, and
the v0.3 rule that magic is paid for by the body: every spell burns calories, every point of mana refilled drinks water.

## 2. Player fantasy
A hedge-mage who has to eat and drink to keep casting. Big magic means a big dinner.

## 3. Detailed rules
1. Casting needs mana and spends calories; each spell has a cooldown.
2. Mana refills on its own, drawing water; thirsty, it refills slowly; badly dehydrated, it stops.
3. Firebolt burns (and staggers shades and the Patriarch); Frost slows; Ward absorbs 30 damage for 12 s; Mend heals 28 but closes no wounds; Spark chains to three enemies.
4. Weather changes spell power (Spark stronger in rain).

## 4. Formulas
- `manaMax = 40 × (1 + 2 × calories / 3000)` (`manaMax`): 40 starving → 120 full.
- `regen = 2.5/s × manaRegenFactor(hydration)` × clear head 1.3 × owl charm 1.2 at night.
- Water per mana point `MANA_WATER_ML = 6` (+1 if ward-touched).
- Cost `= base × (1 − 0.02·spellcraft)` (`manaCost`); power `= (1 + 0.03·spellcraft) × (ward-touched 1.15)`.
- Base costs (mana / kcal / cooldown): Firebolt 8/25/0.55, Frost 10/30/0.6, Ward 14/45/1.0, Mend 22/70/6, Spark 16/50/1.3 (`SPELLS`).

## 5. Edge cases
- Sleep refills mana only as far as your water allows; you wake thirsty with a warning.
- The copper coil charm makes Spark 25% cheaper (`manaCost`) and jump to one more enemy (`castSpark`).

## 6. Dependencies
Body (calories, hydration), skills (spellcraft), weather, enemies (resistances by damage kind).

## 7. Tuning knobs
`MANA_BASE_MAX 40`, `MANA_BASE_REGEN 2.5`, `MANA_WATER_ML 6`, per-spell costs, `HEAL_AMOUNT 28`.

## 8. Acceptance criteria
- Mana max follows fullness → test "mana max follows fullness (TAS formula)".
- Five magic-economy scenarios → the pass-3 magic tests in `tests/sim.test.ts`.
