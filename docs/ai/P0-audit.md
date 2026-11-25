# P0: Repo audit and research (adaptive AI practice mode)

Status: **submitted for owner review**. No game code was changed in P0.
Date: 2026-11-25. Audited revision: `ebe1a02` (v0.9.4) on `main`.
Brief: `Claude-Adaptive-AI-Prompt-Pack.md`, section 3, P0.

## 0. Reconciliation with the pack

| Pack assumption | Actual |
|---|---|
| Target v0.9.2 Salt Gap preview | Repo is **v0.9.4**. Since v0.9.2: coast wired in (v0.9.3), ledges and mantle, visible boundaries, Close-button fix, playtest bots (v0.9.4). |
| `package.json` reports 0.1.0 | Still 0.1.0. Recommend bumping it to the game version (decision D7). |
| TypeScript 5.6.3, Three.js 0.170.0, Vite 6.0.7 | Confirmed in `package.json` (tsx 4.19.2 for tests). |
| 97 rules tests, Chromium launch failing | Now **105 tests pass**, and Chromium (SwiftShader) runs all six browser suites. |
| Three manual slots plus autosave | Confirmed: `slotKey()` in `src/main.ts`, keys `wards-of-millbrook-slot-{id}` plus `G.SAVE_KEY`. |

## 1. Baseline evidence (this host)

| Check | Command | Result | Evidence |
|---|---|---|---|
| Build | `npm run build` | PASS: bundle 1,314.5 kB, 412.9 kB gzip | `evidence/P0/build.txt` |
| Rules tests | `npm run test:sim` | PASS: 105 | `evidence/P0/tests.txt` |
| Browser suites | smoke, smoke2, smoke4, smoke6, smoke7 (2026-11-24/25) | PASS: 14, 19, 34, 22, 48 | `docs/qa/fixlist-v0.9.4.md` |
| Step throughput | `__game.step(60)` (1,800 ticks of 1/30 s) | 928 ticks/s (about 31× real time) | `evidence/P0/probe.txt` |
| Shader programs | bench (v0.9.3) | 22 at load, 22 after play: no compiles in play | `docs/qa/evidence/v0.9.3/bench.json` |

**Performance headroom is not measurable here.** This host renders with SwiftShader (software). The last bench (v0.9.3) shows CPU averages above the 2 ms budget in several scenes: Ashford 2.4 ms, Gullhaven 10.7 ms, the flats 5.8 ms, the Sea Cave store 9.4 ms. Earlier handovers flagged these numbers as host noise. Draw calls are inside budget (outdoor worst 352 at Ashford vs 400; dungeon worst 97 vs 250). **CPU headroom on real hardware is BLOCKED** until it is benched on a real-GPU machine (decision D3).

## 2. Path, symbol and evidence matrix

| Concern | Where | What it does today | Implication for the mode |
|---|---|---|---|
| Keyboard input | `src/main.ts` 207 `keydown`, 236 `keyup`, 237 `blur` | One `keys` set of `KeyboardEvent.code`; `blur` clears it. Actions are dispatched inside `keydown` by binding lookup. | The bot needs its own command path (P2). It must not synthesise DOM events. Human input must win at the same point. |
| Pointer lock | `src/main.ts` 265 to 275 | `requestPointerLock` with raw-mouse fallback; `pointerlockchange` handler. | Pause on lock loss (P2). |
| Remapping | `src/render/settings.ts` `Action`, `ACTIONS`, `DEFAULT_BINDINGS`, `keyName` | Bindings stored in `wards-of-millbrook-settings`. **Backslash is unbound** and `keyName` already names it. | Default binding is free. On ISO keyboards the key next to Left Shift reports `IntlBackslash`, not `Backslash`; the UI should show the bound key. |
| Frame loop | `src/main.ts` 2004 `frame(ts)` | Variable `dt`, clamped to 0.1 s, frame-rate cap optional. `update(dt)` runs only when no modal, no game over and no collapse. Visuals always animate. | **No fixed tick.** P1 must add one without changing game pace. |
| Simulation step | `src/main.ts` 2137 `update(dt)` | All per-frame gameplay: movement, enemies, story, needs, coast. | The unit to wrap in a fixed tick. |
| Test step hook | `src/main.ts` 2394 `__game.step(seconds)` | Fixed 1/30 s steps of `update`, the player visual and NPCs. | **Does not cover all authoritative updates** (next row). |
| Wall-clock gameplay timers | `src/main.ts`: 13 `setTimeout` calls. Gameplay ones: 450 (melee hit after 150 ms), 540 (effect finish), 624 (quick-eat applies bread after 1.6 s), 1536 (NPC action clear), `busyCollapse` fade (306 to 313) | Gameplay outcomes land on wall-clock time, outside `update()`. | **Main determinism blocker.** P1 must move these onto the tick. `busyCollapse` already froze an earlier bot sweep (fix list v0.9.4). |
| Gameplay randomness, seeded | `src/sim/rng.ts` `mulberry32`, `hashString`; `src/sim/town.ts` `rollLoot` seeds from `s.seed*17 + kills*7919` | Loot is deterministic per seed and kill count. | Good model for P1 streams. |
| Gameplay randomness, unseeded | `src/render/enemies.ts` (11 `Math.random`: strafe direction, wander target, LOS timer jitter, aim spread for gunners, spawn scatter); `src/main.ts` 372 (player shot spread), 777/784 (gate raid spawn), 848 (fish feed id) | Changes outcomes; not reproducible. | Must move to a seeded gameplay stream in P1. |
| Cosmetic randomness | flinch (main 303, enemies 185), puffs (411, 1165, 1173), thunder (2111), NPC chat line (1679), `src/sim/text.ts` 100, `rig.ts`, `viewmodel.ts`, `weather.ts`, `audio.ts` | Visual and audio only. | Separate visual stream; may stay unseeded. |
| New-game seed | `src/main.ts` 1910 | `Math.floor(Math.random()*1e6)` | Fine; it is stored in the save. |
| Enemy perception | `src/render/enemies.ts` 240 to 244 | Line of sight by ray against colliders, re-tested about 5 times a second with random jitter; per-kind `sight` 20 to 28 m. **No hearing model.** | P5 needs explicit perception at an observation boundary. |
| Enemy spawns | 31 `enemies.spawn(` calls in `src/main.ts` | Authored per site and event. | The director (P5) chooses among these; it should not invent new spawn points. |
| Campaign mutation | `G.*` rule calls on the single `s` (GameState); `killed` hook (main 116) calls `G.onKill`, feed and story | One mutable state object. | Practice isolation can snapshot `s` (next row). |
| Saves | `saveTo` 1892, `loadFrom` 1898, `G.serialize`; `src/sim/state.ts` version 5 with forward migration | Full state plus position serialises to one string. | **Practice copy is cheap**: serialise on entry, block writes, restore on exit. |
| Achievements | none found (`grep -i achievement src` returns nothing) | | Nothing to block. |
| Local storage keys | settings, 3 slots, autosave | | An adaptation record needs its own key, bound to slot (P4/P6). |
| Test hooks | `window.__game` (`start`, `step`, `teleport`, `view`, `world`, `player`, `enemies`, openers, `closeTopModal`) | Development only. | The bot must not use these in play (pack P3). |

### Traced paths

**Player action (jump).** `keydown` → binding lookup in `keys` → `update()` reads `down('jump')` → `mantleTop()` (`src/sim/climb.ts`) → `player.vy` → gravity and `walkTop()` floor. Entirely inside `update()`, so it is step-safe.

**Delayed kill reward (melee).** `keydown` F → `melee()` (main 447) sets cooldown and animation → `setTimeout(150 ms)` → `enemies.damage` → on death the `killed` hook (main 116) → `G.onKill` (stats, quests, feed) and `dropLoot` → `T.rollLoot` (seeded) → sack mesh → `updatePickups` grants the loot on proximity. The reward path crosses a wall-clock timer and a proximity pickup.

**Open finding.** A probe that spawned a raider 1.5 m in front of the player and pressed F started the swing (cooldown set), but **no damage call happened**, either during `step()` or after 500 ms of wall clock (`evidence/P0/probe.txt`). The cause was not found in P0, and **no existing suite checks that melee lands**. It may be a probe artefact or a real melee bug. It needs a 30-second check in play (decision D8) and a regression test in P1.

## 3. Privacy and storage threat model

| Asset | Threat | Current state | Control needed |
|---|---|---|---|
| Campaign slots | Practice writes leak into a slot (autosave, manual save, delayed timers) | Autosave and manual save write directly. | Block writes while practice is active; restore the snapshot on exit, crash and reload (P2). |
| Adaptation profile | Cross-slot or cross-character leakage; unbounded values | Does not exist yet. | Dedicated key, versioned, bounded, bound to slot generation (P4, P6). |
| Diagnostics | Personal data in traces | No telemetry exists; no outbound calls beyond static assets. | Local ring buffer only, no names, keys or text (P6). |
| Model file | Executable or tampered checkpoint | No model exists. | Data-only format, digest pin (P3). |
| Storage quota | `setItem` failure | Already wrapped in try/catch. | Keep; fall back to defaults. |

## 4. Training-data inventory

There is **none**. No recorded play, no demonstration set, no checkpoint and no licence for player data. The only feasible source is **synthetic demonstrations generated by the game's own utility bot** on seeded scenarios. Training on recorded human play would need your explicit approval and a consent design (decision D4).

## 5. Research: two shipped adaptive systems

| System | Kind | What it changes, and when | What applies to Millbrook | Uncertainty |
|---|---|---|---|---|
| **Left 4 Dead AI Director** (Valve, 2008; Michael Booth, "The AI Systems of Left 4 Dead", 2009) | Authored pacing. Rules, not learning. | Builds intensity, then relaxes it; places items and mobs; drives "adaptive dramatic pacing". Also runs bot survivors as "competent human player proxies". | The model for P5: a rule-based director that picks among authored encounters at boundaries, plus a bot companion with simple goals (ShouldHurry, ShouldPickUp). | The slides describe goals and structure, not exact formulas. |
| **Gran Turismo Sophy** (Sony AI, Polyphony; Wurman et al., *Nature* 602, 10 Feb 2022) | Offline-trained policy (deep RL). | Trained offline on many machines, then shipped as fixed agents; specialised per car and track; trained on control, tactics and "etiquette" with penalty terms. | The model for P3: train offline, ship frozen weights, add rule penalties (here, the governor). Its scale (GPU clusters, per-track agents) is far beyond this project. | Compute and data needs are not comparable to a browser RPG. |
| *(Contrast)* **Forza Drivatar** (Microsoft, from 2005; cloud-based from 2013) | Online learning from player behaviour. | Learns how each player drives and races that clone in other players' games. | Shows what the pack **excludes**: online learning and cross-player transfer. | Implementation details are not public at the level of formulas. |

Sources: `cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf`; `nature.com/articles/s41586-021-04357-7`; `news.xbox.com/en-us/2014/09/30/games-forza-horizon-2-drivatars/`.

## 6. Two feasible designs

**Design A: utility bot first (recommended).**
Practice = serialise `s` and position on entry, block all saves while active, restore on exit, crash or reload. A deterministic utility selector (idle, move, recover, retreat, engage) drives the player through a command queue that `update()` consumes, the same way keys are consumed. No trained model. Determinism work is limited to what practice needs: a fixed tick around `update()`, the gameplay timers moved onto it, and enemy randomness on a seeded stream.
Cost: about 3 to 4 phases' worth (P1 narrow, P2, P3 as fallback-only, P6). Low risk to normal play.
Gives you: Backslash practice mode with a watchable bot and safe return. The trained-model gate stays BLOCKED, as the pack allows.

**Design B: the full pack.**
Everything in A, plus a trained shallow decision tree from synthetic demos (P3), bounded per-slot adaptation (P4), and the encounter director with perception and aim floors (P5).
Cost: all of P1 to P8. Biggest risk: P1's 60 Hz fixed tick across the whole of `main.ts` (226 KB) and 13 timers, and P5's perception rewrite of `enemies.ts`.
Gives you: the full adaptive system.

A is a strict subset of B, so starting with A loses nothing.

## 7. QA cost estimate (runs and machine-hours on this host)

Using 928 simulated ticks/s at 30 Hz (the 60 Hz the pack proposes would halve this):

| Phase gate | Runs | Ticks | Time on this host |
|---|---|---|---|
| P1: 3 seeds × 3 scenes × 10,000 ticks × 2 schedules, plus restore runs | 36 | 360,000 | about 7 min |
| P7 soak: 100 seeds × 10,000 ticks with replay (×2) | 200 | 2,000,000 | about 36 min |
| Per build per profile | × builds × profiles | | multiply accordingly |

Browser startup adds about 3 s per run. A run split across browsers in parallel would cut this.

## 8. Owner decision sheet

| # | Decision | Options | My recommendation |
|---|---|---|---|
| D1 | Practice semantics | (a) snapshot on entry, discard everything on exit; (b) separate practice world | **(a).** Saves already serialise the whole state, so this is cheap and exact. You return to exactly where you pressed Backslash. |
| D2 | Design | A (utility bot first) or B (full pack) | **A now**, then B in later phases if you like what you see. |
| D3 | Target hardware | Desktop Chrome / Edge / Firefox; name a reference real-GPU machine | Desktop Chrome and Edge first. **Needs a real-GPU machine (yours) for the CPU budget**; this host cannot measure it. |
| D4 | Training data | Synthetic only, or also your own recorded play | **Synthetic only.** No player recording. |
| D5 | Fixed tick rate | 30 Hz (matches today's test hook) or 60 Hz (pack) | **30 Hz** to start: same as the existing hook, twice the test throughput. Revisit if aim or reaction feel coarse. |
| D6 | Thresholds | Pack proposals: adaptation band 35 to 65, one level per 600 ticks; 18-tick reaction floor; 2° aim offset | Accept as starting values. At 30 Hz, 18 ticks is 0.6 s; the equivalent of the pack's 0.3 s is **9 ticks**. |
| D7 | Version number | Bump `package.json` to 0.9.4 | Yes. |
| D8 | Melee probe | Check in play whether F hits an enemy in front of you | Please try it once. If it doesn't hit, it's a real bug and I'll fix it before P1. |
| D9 | Ordering | Close the v0.9.4 open items first (east edge, lake walls, stuck spot) or start P1 | Your call. They're small and independent of this work. |

## 9. Continuation note (for a fresh chat)

Repo `mwusayed/wards-of-millbrook`, `main` at the commit that adds this file. P0 is submitted, not accepted. On acceptance, paste the master prompt (pack section 2) plus P1, and attach this file and Waiz's answers to D1 to D9. Key facts: no fixed tick; 13 `setTimeout` calls, several of them gameplay; enemy randomness unseeded in `src/render/enemies.ts`; saves serialise the whole state (snapshot-ready); Backslash is unbound; real-GPU performance is BLOCKED on this host.
