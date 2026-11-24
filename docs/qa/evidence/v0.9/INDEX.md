# QA evidence — v0.9 (Arms and the Title)

Spec: `docs/gdd/arms.md` (§8). Raw output of every suite: `tests.txt`. Budgets: `bench.json`. Screenshots by `scripts/smoke6.cjs`.

## Suites
| Suite | Result |
|---|---|
| `tests/sim.test.ts` (rules, includes the coast rules ahead of v1.0) | 97 passed |
| `scripts/smoke6.cjs` (title, pack, armoury, guns) | 22 passed, 0 failed |
| `scripts/smoke5.cjs` (Westmarch) | 40 passed, 0 failed |
| `scripts/smoke4.cjs` | 34 passed, 0 failed |
| `scripts/smoke.cjs` | 14 passed, 0 failed |
| `scripts/smoke2.cjs` | 19 passed, 0 failed |
| `scripts/smoke3.cjs` | 8 passed, 0 failed |
| `scripts/npccheck.cjs` | 301 stops; every reachable stop clear (the four v0.8 Reach stops fixed). 3 stops of the switched-off coast (v1.0) touch a table edge: fix with the coast. |

## Acceptance criteria → proof
| Criterion | Check | Evidence |
|---|---|---|
| Title over a moving world, full menu, starting leaves it | smoke6 checks 1–5 | `01-title.jpg`, `02-how-to-play.jpg` |
| Grid pack: sized tiles, filters, weight bar, detail | smoke6 pack checks | `03-pack-grid.jpg`, `06-pack-arms.jpg` |
| Armoury: four guns with stats; buy guns and ammo ×1/×5 | smoke6 armoury checks | `04-armoury.jpg` |
| Each gun taken up, fires, reloads from its own ammo | smoke6 per-gun checks | `05-revolver.jpg` … `05-longrifle.jpg` |
| Scattergun pellets add up; silver loads as silver | smoke6 | — |
| Old saves load; earlier suites pass; budgets hold | rules + all suites + bench | below |

## Budgets (SwiftShader; worst of eight headings)
All spots within 400 draw calls (worst 399, Smeaths' clamp; dungeons 71 and 93). Shader programs 22 at load, 22 after.
CPU average under 2 ms everywhere except Millbrook (2.4). p99 over 16 ms at Millbrook and Fernhollow (16.7), one
spike each after a teleport. No page errors.

## Not verified
Real-GPU feel, gun balance by real play, audio.
