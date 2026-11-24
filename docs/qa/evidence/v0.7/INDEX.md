# QA evidence — v0.7 (The Eastern Reach)

Recorded retroactively on 21–22 Nov 2026, when the workflow (`docs/WORKFLOW.md`) was adopted. The browser suites
were re-run against the v0.7 build (with the copper-charm fix) and all passed; see `tests.txt`.
Note: the rules run in `tests.txt` happened after the first v0.8 rules tests had been written (spec first), so it
shows 86 tests; the 70 v0.7 tests are among them and all pass.

## Suites
| Suite | Result |
|---|---|
| `scripts/smoke.cjs` | 14 passed, 0 failed |
| `scripts/smoke2.cjs` | 19 passed, 0 failed |
| `scripts/smoke3.cjs` | 8 passed, 0 failed |
| `scripts/smoke4.cjs` | 34 passed, 0 failed |
| `tests/sim.test.ts` | 86 passed (70 from v0.7) |

## Acceptance criteria → proof
| Criterion | Proof |
|---|---|
| Walk out through the East Gate | smoke4 "walk east through the new East Gate"; `01-east-gate.jpg` |
| Gait phase follows distance, limbs move | smoke4 "gait phase advances with distance…"; `20-run-third.jpg`, `21-strafe-left.jpg`, `anim-sheet.jpg` |
| The Road East and Copper and Silence play through | smoke4 quest checks; rules "the Eastern Reach arc plays through" |
| Copper Hollow: dungeon, lift, waystone, journal | smoke4 mine checks; `22-mine-workings.jpg`, `23-deep-gallery.jpg` |
| The Warden Engine: armour, stun, defeat | smoke4 Engine checks; `24-engine.jpg` |
| Fishing, mining, gathering | smoke4 activity checks; `25-fishing-bite.jpg` |
| The carbine in both views | smoke4 carbine checks; `26-carbine-fp.jpg`, `27-carbine-tp.jpg` |
| Wolves at the fold, Bluebell | smoke4 event checks; `28-wolves.jpg`, `29-bluebell.jpg` |
| The map's Reach sheet | smoke4 map check; `30-map-reach.jpg` |
| The new places read as intended (art review) | `02-brookfield.jpg` … `11-ashford-night.jpg` |
| v0.6 saves load into v5 | rules "v0.6 (v4) saves load into v5…" |

## Not verified
Real-GPU frame pacing, audio, balance by real play.
