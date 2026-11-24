# Firearms, melee and dodge

## 1. Overview
First-person shooting from VEILWORK with a six-shot revolver (two-handed grip) and, from v0.7, a lever carbine.
Melee with the staff, a dodge step, a holster.

## 2. Player fantasy
Deliberate gunplay: every round counts, your body state shows in your aim, and a good gun is a big purchase.

## 3. Detailed rules
1. Slot 1 is your firearm: revolver or carbine (switch from the pack once you own the carbine).
2. Each shot spends a round from the cylinder/tube; empty → dry click and auto-reload.
3. The revolver wears (condition) and fouls; below 50% it shoots wide, below 25% it can misfire. Oil or a smith cleans it.
4. Hit-scan bullets; the tracer starts at the muzzle; damage applies through `enemies.damage(…, 'bullet')`.
5. Melee: staff strike with knockback. Dodge: a fast step with invulnerability (hits ignored while `dodgeT > 0.1`).
6. Holster: no weapon in hand; townsfolk react to a drawn gun.

## 4. Formulas
- Damage: revolver `30` (`REVOLVER_DAMAGE`, 38 rifled), carbine `46` (`CARBINE_DAMAGE`), × `(1 + 0.015·marksman)`.
- Spread (radians) = `0.012 × spreadMultiplier(needs) × aimMult × move` with move 1 / 1.6 walking / 3 sprinting.
- `aimMult = (1 − 0.05·marksman) × (shaky hands 1.2) × (foul 1.5, revolver only) × (keen eye 0.8) × (carbine 0.6)`.
- Fire cooldown: revolver 0.4 s, carbine `CARBINE_COOLDOWN = 0.72` s. Reload: revolver 1.8 s (1.1 with speed loader), carbine `CARBINE_RELOAD = 2.4` s.
- Condition: −`COND_PER_SHOT = 0.5` per shot; foul below `COND_FOUL = 50`, misfire below `COND_MISFIRE = 25`.
- Melee 16 (26 iron-shod staff).

## 5. Edge cases
- Misfire is deterministic from kills, rounds and time (no RNG drift between save and load).
- The carbine has its own tube and loose rounds (`s.rifle`); switching does not move ammunition.

## 6. Dependencies
Body (spread), skills (marksman), economy (ammo, gear), animation (viewmodel and third-person poses), enemies.

## 7. Tuning knobs
| Knob | Value | Range |
|---|---|---|
| Base spread | 0.012 rad | 0.008–0.02 |
| `CARBINE_DAMAGE` / `CARBINE_AIM` | 46 / 0.6 | 40–55 / 0.5–0.8 |
| `RELOAD_TIME` / `RELOAD_TIME_LOADER` | 1.8 / 1.1 s | — |

## 8. Acceptance criteria
- Carbine: bought, own tube, harder hits, steadier aim, reload → test "the carbine: bought from Corwin…"; browser "the carbine fires from its own tube, in first person"; evidence `26-carbine-fp.png`, `27-carbine-tp.png`.
