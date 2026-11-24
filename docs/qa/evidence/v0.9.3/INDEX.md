# v0.9.3 evidence: The Saltway Coast (24 Nov 2026)

Build: `npm ci && npm run build` (strict TypeScript, Vite) — `build.txt`. Preview `npx vite preview --port 5198`;
headless Chromium (SwiftShader), one browser at a time. Raw output: `tests.txt` (full run via `dev/evidence.sh
v0.9.3`, then a final re-run of smoke7 and smoke after the last fixes, appended at the end).

## Pass counts

| Suite | v0.9.2 baseline (before any change) | v0.9.3 |
|---|---|---|
| rules `tests/sim.test.ts` | 97 | **102** (5 new) |
| smoke7 (new, the coast) | — | **48 / 48** (final re-run; also 48/48 in the full run) |
| smoke6 | 22 / 22 | 22 / 22 |
| smoke5 | 40 / 40 | 40 / 40 |
| smoke4 | 34 / 34 | 34 / 34 |
| smoke | 14 / 14 | 13 / 14 in the full run, **14 / 14** on re-run (see flaky) |
| smoke2 | 18 / 19 | **19 / 19** |
| smoke3 | 8 / 8 | 8 / 8 |
| npccheck | — | 301 stops, 0 bad (includes the 12 coast people) |
| look8 / anim8 | — | no errors / 22 frames, no errors |

**Flaky checks (not caused by this change):** smoke2 "left the chapel" failed once on unchanged v0.9.2 and passed
on v0.9.3; smoke "dodge moves you" failed once (0.79 m) and passed on re-run. Both start from wherever a randomly
wandering enemy stands and wait on real time; a dodge into a wall moves you less.

## saltway.md §8, criterion by criterion (smoke7 check names in quotes)

1. **Gap blocked until blown, open after save/load** — "walking from the smithy to the gap on foot (no teleport)
   is stopped by the rockfall" (a real keyboard walk: smithy, South Gate, the Vale, past the Whisper Stones);
   "setting the charge uses it; loading mid-fuse lights the fuse again from 8 s"; "the blast at 3 m does the near
   damage"; "at 9 m … 15; at 20 m none"; "after the blast you can walk through the gap"; "loading after the blast
   keeps the gap open; a save from before it closes the gap again with every boulder back"; "a new game after
   loading an open gap starts with the rockfall back". Shots 01, 02. **8/8**
2. **Saltway to Gullhaven, discovered; coast map sheet** — "down the Saltway…"; "the map has a Saltway Coast
   sheet". Shots 03, 04, 11. **2/2**
3. **Tide formula; wreck only at low tide; carried back** — "the tide follows cos(2π(h−2)/12)… and the sea surface
   moves with it"; "at high water the wreck cannot be searched"; "at low water … the Merry Wren's log"; "… you are
   warned (once); when it comes in you are carried to the shore"; "the near flats are waded…". Shots 05, 13. **5/5**
4. **Crabs circle and dart; pistoleers keep distance, aim, fire; smugglers as raiders** — four checks incl. the
   morning site groups. Shot 10 (crabs on the flats). **4/4**
5. **The Wreck-Mother** — wake + boss bar; front ×0.3 / side ×1 / belly ×1.8; sweep, rear-and-slam, brine spray
   (slows); crab call at 75%; flood over ~6 s at half health with wading off the platforms; reset on leaving;
   defeat; calm after save/load; plus cave entry, store guards. Shots 07, 08, 09. **10/10**
6. **sq1–sq5; Marrow arrested, squeezed or let go** — Dorran's single charge (counter vs quest line); a charge
   bought early skips ahead; Bree; False Lights clues; each Collector fate restored from the same save, with its
   faction effects and persistence; the three side quests; NPC presence. Shots 10, 14 (the bell carried). **11/11**
7. **Meals, gear, charm, traders, inn, auction** — the four coast traders open; sea boots; auction pays more; crab
   cakes give Sea legs; blessing; inn sleeps to morning; sea fishing; gathering and the far-bed rule; crates; the
   notice post. The shell charm is covered under 6 (sq4 reward); rules tests cover all meals. **6/6**
8. **Old saves, earlier suites, budgets** — rules "v0.8 saves load into v0.9…"; "a save inside the Sea Cave
   restores into the cave"; every earlier suite (above); budgets (below); "no page errors". **2/2**

## Budgets (`bench.json`, `dev/bench93.cjs`, final run after the culling fixes)

- Draw calls outdoors, worst of 8 headings: max **375** (the Salt Gap looking north; was 425 before the fixes).
  Every coast view ≤ 375, Gullhaven 244, by night ≤ 261. Inland views unchanged or lower (e.g. Smeath 413 → 320).
- Dungeons: max **97** (mine); Sea Cave store 32, grotto with the boss up and flooded 28.
- Shader programs: 22 at load, **22 after visiting everything** (no compiles in play).
- CPU per frame: the averages on this build host varied run to run (the same spot measured 0.5 ms and 8.5 ms in
  different runs; worst single frames up to 190 ms at Thornwood, unrelated to the coast). Treat CPU as **not
  verified** here; it needs a real machine.
- The bench section inside `tests.txt` is the first run, before the two culling fixes; `bench.json` is final.

## Screenshots (from scripted positions at player height; SwiftShader)
01 rockfall · 02 gap open · 03 Gullhaven by day · 04 coast map · 05 the wreck at low tide · 06 lighthouse at night ·
07 the smugglers' store · 08 the Wreck-Mother · 09 the flooded grotto · 10 crabs on the flats with the bell ·
11 Gull Tower · 12 Gullhaven at night · 13 the flats at dusk · 14 the bell carried (front view).

## Not verified
Real-GPU frame pacing and CPU; audio by ear; balance by a human (the boss, pistoleers, prices); how the dark cave
reads on a real screen (shots 08–09 are dim in software rendering).
