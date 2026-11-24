# QA evidence — v0.8 (The Westmarch)

Spec: `docs/gdd/westmarch.md` (acceptance criteria in §8). Raw output of every suite: `tests.txt`. Budgets:
`bench.json` (summarised below). Screenshots (JPEG, 960 px) are taken by `scripts/smoke5.cjs`, `scripts/look8.cjs`
and `scripts/anim8.cjs` from scripted positions.

## Suites
| Suite | Result |
|---|---|
| `tests/sim.test.ts` (rules) | 86 passed |
| `scripts/smoke5.cjs` (the Westmarch) | 40 passed, 0 failed |
| `scripts/smoke4.cjs` (the Eastern Reach, animation) | 34 passed, 0 failed |
| `scripts/smoke.cjs` | 14 passed, 0 failed |
| `scripts/smoke2.cjs` | 19 passed, 0 failed |
| `scripts/smoke3.cjs` | 8 passed, 0 failed |
| `scripts/npccheck.cjs` (every stop and waypoint is standing room) | 221 stops checked; every Westmarch stop clear. 4 Eastern Reach stops (v0.7: Corwin, Greta, Edda, Pell) stand 0.1–0.3 m inside a table or counter edge. Cosmetic; fixed in v0.9. |

## Acceptance criteria → proof
| Criterion (`westmarch.md` §8) | Rules test | Browser check | Evidence |
|---|---|---|---|
| West Gate opens only with Renn's key, stays open after save/load | "wq1: the West Gate needs Renn's key…" | "the West Gate is barred…", "Renn's key opens the West Gate…", "the open gate survives save and load…" | `01-west-gate-open.jpg` |
| Walking west reaches Fernhollow and discovers it | — | "walk west through the open West Gate", "walk the West Road to Fernhollow…" | `03-fernhollow.jpg`, `look-03-fernhollow.jpg` |
| Vane gives the key three ways | "wq2: Vane's key: buy, persuade, threaten" | "Vane gives up the barrow-key…" | — |
| The rowan ward needs three heather | "wq2: Gammer Thrush's ward needs three heather…" | "Gammer Thrush binds the rowan ward…" | — |
| Hall braziers open the inner door | "the Hall of Kings opens when all three braziers are lit" | "three coffins open in the Hall; lighting three braziers sinks the inner slab" | `14-hall-lit.jpg` |
| Orm's shroud follows the lit braziers | "Orm's shroud follows the lit braziers" | "below half health the braziers die…", "relighting a brazier…", "a Firebolt that lands by an unlit brazier lights it" | `23-orm-dark.jpg` |
| Orm can be beaten and the crown decided three ways | "decideCrown: return, sell or keep…" | "King Orm wakes…", "King Orm falls…", "at the bier you can return the crown…" | `22-king-orm.jpg`, `24-orm-falls.jpg` |
| Night spawns follow the crown's fate | "night spawns on the Downs follow the crown's fate" | "night on the Downs…", "at dawn the night's dead sink…" | `21-grave-lights.jpg` |
| Wights rise, grave-lights burst | "grave-chill drains stamina…" | "barrow wights rise out of the ground…", "a wight's blow… grave-chill", "a grave-light… bursts", "a Spark puts a grave-light out" | `20-wight-rising.jpg`, `anim8-sheet.jpg` |
| New meals, charms, fish and services work | "Westmarch meals…", "Westmarch charms…", "lake fishing…", "Westmarch gathering, traders and the inn…" | "cutting heather…", "a bed at the Heron and Reed…", "Marra Quill sells fen waders", "fishing Lake Hallow…", "the reed marsh slows you… unless you wear waders" | `05-jetty-fishing.jpg` |
| Side tasks | "side tasks: Gorse, Old Grandmother and the drowned road" | "Smoke on the Heath…", "The Drowned Road…" | — |
| The map has a Westmarch sheet | — | "the map has a Westmarch sheet" | `30-map-westmarch.jpg` |
| Accessibility A7, A8 | — | "settings offer camera motion and run toggle", "run toggle: one press runs, another walks" | — |
| v0.7 saves load into v0.8 with the new fields | "v0.7 saves load into v0.8…" | "saves keep the Westmarch…" | — |
| Budgets hold in the new places | — | `dev/bench8.cjs` | `bench.json` (below) |

## Art review (against `docs/ART_BIBLE.md`)
`look-*.jpg`: the West Gate, the heath, Fernhollow by day and night, the green, the jetty at dusk, the Smeaths'
clamp, the Ring of Nine, King Orm's mound, Vane's dig, the reed marsh, inside the Heron and Reed, and the barrow.

## Budgets
Recorded with a software renderer (SwiftShader), so the CPU numbers are an upper bound and real GPUs will be smoother.
Draw calls are the worst of eight headings at each spot.

| Spot | CPU avg (ms) | p99 (ms) | Draw calls (worst) |
|---|---|---|---|
| Millbrook | 1.03 | 3.4 | 314 |
| The Vale | 1.43 | 8.2 | 365 |
| Brookfield | 2.22 | 15.3 | 321 |
| Thornwood | 0.74 | 7.1 | 294 |
| Toll tower | 1.18 | 8.7 | 294 |
| Ashford | 1.43 | 16.4 | 345 |
| The docks | 0.89 | 4.5 | 371 |
| Copper Hollow (outside) | 0.54 | 4.0 | 323 |
| The heath | 0.57 | 4.5 | 314 |
| Smeaths' clamp | 0.46 | 2.6 | 352 |
| The Downs | 0.52 | 4.9 | 352 |
| Fernhollow | 1.12 | 10.4 | 344 |
| The reed marsh | 3.00 | 20.6 | 359 |
| The mine (dungeon) | 1.09 | 7.2 | 102 |
| The barrow (dungeon) | 0.99 | 5.8 | 83 |

- **Draw calls: met everywhere** (outdoor budget 400, dungeons 250). Before the skinned bake (ADR-017) Ashford measured 828.
- **Shader programs: met.** 22 at load, 22 after the whole route (ADR-018).
- **CPU average: met** (budget 2 ms) everywhere except Brookfield (2.2) and the reed marsh (3.0), both under the software renderer.
- **p99: missed at Ashford (16.4) and the marsh (20.6)** against 16 ms. Both are single spikes while the cells around the
  teleport stream in; the bench teleports, which a walking player never does. Watch on real hardware.
- No page errors.

## Not verified
Real-GPU frame pacing, audio, balance by real play (King Orm's numbers especially), and how the barrow's darkness
reads on a real monitor.
