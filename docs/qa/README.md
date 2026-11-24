# QA

## Suites

| Suite | Runs | What it covers |
|---|---|---|
| `npx tsx tests/sim.test.ts` | Node | Rules: needs, combat numbers, economy, quests, dialogue, saves and migrations |
| `node scripts/smoke.cjs <url>` | Browser | Start, move, shoot, cast, eat, sleep, save and load |
| `node scripts/smoke2.cjs <url>` | Browser | Old Mill, boss, settings, slots |
| `node scripts/smoke3.cjs <url>` | Browser | Story, chapel, gate defence, endings, map, music moods |
| `node scripts/smoke4.cjs <url>` | Browser | Eastern Reach, Ashford, mine, Engine, carbine, fishing, mining, gathering, animation checks |
| `node scripts/smoke5.cjs <url>` | Browser | The Westmarch (v0.8) |
| `node scripts/smoke6.cjs <url>` | Browser | Title, grid pack, armoury, the four guns (v0.9) |
| `node scripts/smoke7.cjs <url>` | Browser | The Saltway Coast, saltway.md §8 (v0.9.3) |
| `node dev/bench93.cjs <url> [out.json]` | Browser | Budgets from `docs/TDD.md` §9, with coast and Sea Cave views |

Browser suites run headless Chromium with SwiftShader against `npx vite preview --port 5198`.

## Evidence

`docs/qa/evidence/<version>/` holds, for each version:

- `INDEX.md` — each acceptance criterion and its proof (test name or screenshot);
- `tests.txt` — raw output of every suite;
- `bench.json` — the budget run;
- screenshots `NN-what.png`, taken by the suites from scripted positions.

## Blind spots (every version)

The headless browser renders in software, so these are not verified by the suites: real-GPU frame pacing and
tearing, audio, pointer-lock feel, and anything that needs a human eye on balance and fun.
