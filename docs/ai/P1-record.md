# P1: Deterministic core and simulation harness

Status: **submitted for owner review** (Design A route, step 1 of P1 → P2 → P3A → P6 → P7 → P8).
Base: `22f8cc7` (P0). Authorised by Waiz on 2026-11-25: melee preflight, version metadata, P1 without a further approval round; stop before P2.

## 1. What changed, in one paragraph

The game now simulates in fixed **30 Hz ticks**. One function, `stepSim()` in `src/main.ts`, is the only place gameplay time moves, in play, in tests (`__game.step`) and in replays. Each displayed frame runs the ticks that are due (at most 4) and draws the player and enemies interpolated between the last two ticks. Gameplay that waited on wall-clock timers now waits on a **due-tick queue** (`src/sim/clock.ts`). Every random choice that changes what happens draws from a **seeded, saveable stream** (`gameplayRng`); flavour text has its own seeded stream (`textRng`); cosmetic randomness keeps `Math.random`. A browser-hosted **replay harness** (`scripts/replay.cjs`) records input per tick, replays it through the same step, hashes canonical state every tick and reports the first divergence.

## 2. Wall-timer classification (the 13 lines reported in P0, plus the fade continuations)

| File:line (at 22f8cc7) | Purpose | Authority | Pause behaviour now | Cancellation | Disposition |
|---|---|---|---|---|---|
| main 364 | scattergun double shot sound (18 ms) | cosmetic | wall clock | none | **kept** (audio) |
| main 364 | rifle cock sound after a shot | cosmetic | wall clock | none | **kept** (audio) |
| main 411 | heal spell puffs | cosmetic | wall clock | none | **kept** (visual) |
| main 450 | **melee hit 150 ms after the swing** | gameplay | stops with the game | queue cleared on load/new game | **`meleeHit` task, 5 ticks (167 ms)** |
| main 539 | **station with a fade: caption, then finish + save** | gameplay | stops | cleared on load | **`closure:stationFade` + `simFade`** |
| main 540 | **station finish (sleep, wash, cook, mine...)** | gameplay | stops | cleared on load | **`closure:stationFinish`, ticksFor(dur)** |
| main 559 (×2) | shower water sounds | cosmetic | wall clock | none | **kept** (audio) |
| main 624 | **quick-eat applies bread after 1.6 s** | gameplay | stops | saved with the game | **`eatFinish` task, 48 ticks** |
| main 770 | quest chime after the gate holds | cosmetic | wall clock | none | **kept** (audio) |
| main 952 (×2) | pick strike sounds | cosmetic | wall clock | none | **kept** (audio) |
| main 1536 | **panels' `act`: clear the player's action after it plays** | gameplay | stops | saved with the game | **`actClear` task** |
| main 2111 | thunder sound | cosmetic | wall clock | none | **kept** (audio) |
| main 2382 | test hook `key()` | test only | n/a | n/a | **kept** |
| main 312, 2202 | **collapse: fade, respawn, unlock movement** | gameplay | stops | cleared on load | **`simFade`** (movement unlocks on the clock) |
| 10 × `hud.fade(...).then(...)` (travel, dungeons, coach ×2, mine lift ×2, barrow, sea cave) | **move the player / change zone after a caption** | gameplay | stops | cleared on load | **`simFade`** |
| 2 × `await hud.fade` (case file, ledger shift) | **pay, end shift, story tick after a caption** | gameplay | stops | cleared on load | **`simFade`** |
| 8 × `hud.fade` with no continuation | caption only | cosmetic | wall clock | none | **kept** |
| `hud.ts` hitmarker, vignettes, fade-out; `audio.ts`; `music.ts` interval | cosmetic | cosmetic | wall clock | none | **kept** |

Named tasks (`meleeHit`, `eatFinish`, `actClear`) are written to saves with their remaining delay. Closures (fades, station finishes) run the same way but cannot be serialised; a save lists them under `p1.tq.dropped`. This matches v0.9.4, where a save during a station also lost the pending finish.

## 3. Randomness

| Stream | What draws from it | Saved | Hashed |
|---|---|---|---|
| `gameplayRng` (`src/sim/rng.ts`) | enemy strafe side and flips, wander targets, line-of-sight timing jitter, gunner aim error, spawn scatter, gate-raid spawns and archers, boss/wraith/engine/king/mother attack picks, player shot spread | yes (`p1.rng`) | yes |
| `textRng` | flavour lines that land in the campaign log (`src/sim/text.ts`) | yes (`p1.text`) | yes |
| loot (`T.rollLoot`, seeded by campaign seed and kill count) | loot drops | via campaign state | yes | **unchanged**: 8,400 rolls, identical digest `eec9889c` on 22f8cc7 and P1 (`evidence/P1/04-loot-parity.txt`) |
| `Math.random` | flinches, puffs, NPC fidgets and idle phase, enemy voice timing, critters, thunder, scenery built at load, model appearance | no | no |

Older saves have no `p1` block: the streams are seeded from `hash(seed, minutes)` on load.

## 4. Other determinism fixes found by the harness

- **Shots and spells aimed from the rendered camera** (smoothed, with head bob and recoil) and spells spawned from the **animated hand**. Both depend on frame timing. They now use `aimEye()` (the same camera position computed from game state, without smoothing, bob or recoil) and `simHand()`. The drawn tracer still starts at the drawn hand.
- **Key presses acted inside the keydown event**, between ticks. Gameplay verbs (interact, attack, melee, dodge, reload, weapon slots, quick-eat, holster, lantern, view) now queue and run at the start of the next tick. Menus (inventory, journal, map, Escape) still open at once.
- **Story checks, the feed, NPC movement and the ewe** ran on frame time; they now run on ticks (story every 15 ticks, feed every 30).
- **Visual animation** (water, lights, critters, braziers, title camera) uses a separate render clock, so it stays smooth and keeps moving behind menus.
- **The game-over screen** was opened by the frame loop, so a replay paused there only when a frame happened to run. It is now decided inside `stepSim` on the tick the game ends (`08b-gameover-stall.txt`: direct, 60 fps and irregular runs stop on the same tick with the same state).
- **Moonpetal at night** read `world.night`, which only the drawing code set. It now uses `nightAmount(hour)`, the same formula, from game time.
- **The feed's gap between lines** (`gapUntil`) was neither saved nor reset on load, so the same save emitted different log lines depending on what the session did before. It is now saved, and a load or new game always resets the feed.
- **Load order (pre-existing bug):** `storyTick` ran inside `resetWorldState`, before the saved position was restored, so discovery and quest checks ran against wherever you stood before loading. A save loaded from the coast after a session at the flats could grant the flats' discovery and 8 survival XP that the save never had. The story refresh now runs after the position and clock are restored.
- **Held keys:** each tick applies the input frame's keys (in live play that is the same set it was sampled from), so a replay and play take the same path.

## 5. Behaviour changes to playtest on real hardware

| Change | Before (v0.9.4) | Now |
|---|---|---|
| Melee hit timing | 150 ms after the swing | 167 ms (5 ticks, rounded up so it is never early) |
| Key press latency | instant | start of the next tick (at most 33 ms) |
| Menus open | the world kept moving under them: fades and station timers finished, NPCs walked | **all game time stops**: pending hits, eats, fades and NPCs wait until the menu closes |
| Low frame rate | the world slowed down but wall-clock timers (stations, fades) did not | everything slows together |
| Long frame (hitch, background tab) | one update of up to 100 ms | up to 4 ticks (133 ms); beyond that the game slows instead of jumping |
| Aim origin in third person | the smoothed camera | the unsmoothed camera position (differs only while the camera is easing back after a wall squeeze) |
| Drawing at high refresh rates | player and enemies drawn at their current position | interpolated between ticks; **bosses and projectiles are not interpolated** and may look steppy at 144 Hz |

## 6. Evidence

All runs: Chromium 1.63 (SwiftShader, software rendering) on the build host. Evidence in `docs/ai/evidence/P1/`.

| Gate item | Result | File |
|---|---|---|
| `npm ci`, build, rules suite on clean 22f8cc7 | PASS: 105 tests, bundle identical to P0 (`index-C58RBWop.js`) | `00-npm-ci.txt`, `01-build.txt`, `02-tests.txt` |
| Melee preflight | **probe defect**; game correct (16 damage in arc, none outside) | `03-melee-verdict.md`, `03-melee-baseline-trace.json` |
| Rules suite after P1 | PASS: 110 (105 + 5 clock/queue/RNG tests) | `05-tests-after.txt` |
| Melee regression after P1 | PASS 6/6: hit lands on tick 5 after the swing, inside `step()`; miss outside the arc; a menu holds a queued hit and it lands once after | `scripts/melee-regress.cjs`, `06-melee-regress.txt` |
| P1 gate checks | PASS 11/11: quick-eat at 48 ticks; menu pause (steps and frames); slot save mid-delay and load: same tick, same delay, one effect; collapse lock on the clock (wall time alone does not release it); 5,000 ms frame runs 4 ticks; 60 frames at 60 fps run 30 ticks | `scripts/p1-verify.cjs`, `07-p1-verify.txt` |
| Replay: render schedules | PASS: 900-tick combat fixture identical per tick (state hashes and decisions) at 30, 60, 144 fps and an irregular schedule with 120/300 ms hitches | `08-replay-short.txt` |
| Replay: game over mid-run | PASS: direct, 60 fps and irregular all stop on the same tick | `08b-gameover-stall.txt` |
| Replay: first divergence | PASS: one input changed at tick 40, first differing tick reported 40 | `08-replay-short.txt` |
| Replay: wrong model digest | PASS: rejected with the field named | `08-replay-short.txt` |
| Matrix: 3 seeds (11, 4242, 90001) × 3 scenes (town, combat, tide) × 10,000 ticks: repeat run, 60 fps, irregular schedule, checkpoint-restored | **PASS 9/9**: every comparison identical per tick (light hash), every 30 ticks (full hash incl. campaign) and in the decision log; no stalls, no renderer crashes, no page errors | `replay/matrix.json`, fixtures `replay/<scene>-<seed>.json` |
| Browser suites after P1 | smoke 14, smoke2 19, smoke3 8, smoke4 34, smoke5 40, smoke6 22, smoke7 48 | `09-suites-after.txt` |
| Save compatibility | PASS 6/6: a v0.9.4 save loads in P1 (streams seeded); a P1 save loads in v0.9.4 (rollback keeps saves) | `10-save-compat.txt` |

### Test-suite adaptations (and why they are not loosened assertions)

The old suites waited on the **wall clock** for things that are now on the **game clock**. On this host a rendered frame takes 0.7 to 3.6 s, so the game runs at about a tenth of real speed and wall-clock waits time out. Changes:
- `until` / `waitIdle` helpers advance the game 0.2 s per check instead of sleeping, and are bounded by game time (30 s) instead of wall time, so a busy host cannot time them out (smoke, smoke2, smoke4, smoke5, smoke7). A run with the wall-time bound failed smoke4's copper and mushroom checks once under load (mining needs 96 ticks; 20 s of wall time gave fewer); the game-time bound removed that.
- Waits of 1.5 s or more after a door, lift, cave or bed transition became the same span of game time (`step`).
- smoke2: heal before the 6 s nave-drain step. Root cause, measured on both builds: the old build reached that step at 100 HP because the valve stations finished on wall time while the game was nearly frozen; with the stations on the game clock, the chapel's enemies get their full time and the player arrives at 15 to 33 HP and can collapse mid-drain. The test checks drainage, not survival.

No assertion was removed or weakened.

## 7. Known gaps (P1 does not claim these)

1. **Exact return is not P1.** A save-string checkpoint carries the clock, the streams, named tasks, height and vertical speed, but not live enemies, ground loot, closure tasks or boss state. The matrix's checkpoint check therefore rebuilds the half-way state from the start state plus inputs (the seed + input reconstruction the brief allows). Owner requirement for P3A: exact return proved mid-encounter (enemies, loot, height, vertical speed, cooldowns, queued actions, gameplay RNG).
2. **The runner is browser-hosted**, not Node: enemies and collision live in Three.js scene code. It drives the same `stepSim` with rendering off.
3. **Determinism is claimed for one build on Chromium.** Cross-browser floating point is not claimed.
4. **Real-device feel and frame pacing: BLOCKED** until played on the reference machine (owner).
5. **Pre-existing, not changed:** a damage collapse runs two fades (1.6 s, then 1.4 s from `G.collapse`'s `pendingRespawn`) and `respawnHome` twice, about 3 s of black screen. Worth a separate fix if unintended.
6. **Pre-existing, not changed:** losing pointer lock opens the Paused menu (correct design; tests must dismiss it).
7. Enemy damage tint compares `performance.now()` with game-time timers (visual only, pre-existing).

## 8. Flag and rollback

P1 is the game's clock, not an AI feature, so it has no runtime flag; the AI features (P2 on) will. **Rollback:** `git revert` the P1 commit returns the v0.9.4 loop. Saves are compatible both ways: save format stays v5, and the P1 data lives in the free-form `extra.p1` block, which v0.9.4 ignores and P1 seeds when missing (`10-save-compat.txt`).

## 9. Continuation note

Repo `mwusayed/wards-of-millbrook`. P1 commits follow `2862727`. Next is P2 (practice mode UX and isolation) only after Waiz accepts P1. Key entry points: `stepSim`, `sampleInput`, `frameAt`, `tq` and `simFade` in `src/main.ts`; `src/sim/clock.ts`; `gameplayRng`/`textRng` in `src/sim/rng.ts`; `__game.sim` hooks; `scripts/replay.cjs`, `scripts/p1-verify.cjs`, `scripts/melee-regress.cjs`.
