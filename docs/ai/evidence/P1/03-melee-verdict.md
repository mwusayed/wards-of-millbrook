# P1 preflight: melee on unmodified v0.9.4 (22f8cc7)

Setup: clean checkout of 22f8cc7, `npm ci`, `npm run build`, `vite preview` on port 5199, Chromium 1.63 with SwiftShader.
Player at (-20, 0, 0), yaw 0 (forward is -z). Stationary raider (speed 0, idle, alive, not rising), HP 80.
Input: real `keydown KeyF` through the normal binding path. `setTimeout` and `enemies.damage` were wrapped to trace scheduling, callback execution, range/arc checks and damage.
Trace: `03-melee-baseline-trace.json`. Probe: `03-melee-trace-probe.cjs`.

| Case | Target | Swing | Callback | Range check (< 2.5 m) | Arc check (dot > 0.45) | Damage | HP |
|---|---|---|---|---|---|---|---|
| In arc | (-20, -1.5), 1.5 m ahead | cooldown 0.7 | scheduled 150 ms; **ran at 1,642 ms** | 1.5 m, pass | 1.0, pass | 16 | 80 -> 64 |
| Out of arc | (-18.5, 0), 1.5 m to the right | cooldown 0.7 | scheduled 150 ms; ran at 2,341 ms | 1.5 m, pass | 0.0, fail | none | 80 -> 80 |

Measured frame intervals on this host: 717, 1617, 1700, 3650, 1550 ms. Timers fire between frames, so a 150 ms timer lands 1.5 to 2.3 s late.

Explicit stepping: `step(0.5)` immediately after the key did **not** apply the hit (HP 80 after the step). The hit landed only on the wall clock.

## Verdict: probe defect. Game melee is correct.

The P0 probe waited 400 to 500 ms of wall time and concluded no hit. The callback had not run yet because software-rendered frames starve timers. With a longer wait, the in-arc target takes 16 damage and the out-of-arc target takes none. Combat tuning unchanged.

Determinism finding (input to P1): melee damage is applied by a wall-clock `setTimeout`, not by the simulation step. P1 moves it onto the tick queue; the regression then asserts the hit inside `step()`.
