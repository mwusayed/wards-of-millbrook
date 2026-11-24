# Continue Wards of Millbrook for Mir Waiz Usayed

You are continuing my TypeScript and Three.js browser RPG. Work directly on this source. Preserve every project and
every previous save. I own the creative sign-off. Deliver playable increments and say exactly what you verified.

Read this file, then HANDOVER.md (architecture, conventions, budgets), docs/STATUS.md, docs/gdd/saltway.md (§9 is
"as built"), docs/WORKFLOW.md and docs/qa/evidence/v0.9.3/INDEX.md. Reusable prompts: docs/WORKFLOW-PROMPTS.md.
Regions: Millbrook and the Vale, the Eastern Reach, the Westmarch, and the Saltway Coast (live since v0.9.3).

## State at v0.9.3 (24 Nov 2026, Claude)
- The coast is switched on (`FEATURES.coast = true`) and fully wired in src/main.ts (the "Saltway Coast" block:
  `southInteract`, `updateCoast`, `seaCaveTick`, `goSeaCave`, `discoverCoast`, `syncCoastProps`, the `mother`
  WreckMother with its hooks). All five coast quests are open.
- Every saltway.md §8 criterion has browser evidence: `scripts/smoke7.cjs` 48/48. Rules 102. Earlier suites all
  pass (two known flaky checks, see INDEX). Budgets hold: outdoors ≤ 375 draw calls, dungeons ≤ 97, no shader
  compiles in play. CPU timings on the build host are too noisy to judge.
- Engine changes worth knowing: enemies past the fog are hidden each frame; region cells now cull at fog + 10 m
  (was + 25); sea boots wade the ford and marsh; finished west/coast notices are paid at their own post.

## Resume with
1. `npm ci && npm run build`, `npx vite preview --port 5198 --strictPort`, then `bash dev/evidence.sh v0.9.4`
   (needs Playwright; set `NODE_PATH` if it is installed globally). One browser at a time.
2. Waiz's decisions (ask, do not guess): the Anchor and Gull bed is 5 crowns in code and 12 in the spec; whether
   Sera's sq1 offer should be reworded when the gap was blown before she asked; whether to call this v1.0 once he
   has played the coast.
3. Open work: real-GPU frame pacing and CPU on Waiz's machine; balance from his play notes (Wreck-Mother, the
   pistoleers); the grotto is dim in software rendering (check on a real screen; `seacave.ts` has a fill light);
   the player's arms do not take the carry pose while standing still with the bell or a strongbox (walking is
   fine); main.ts is ~215 KB and should be split (input, combat, interactions per region).

## Report back with
What changed, the player route, pass counts and failures, budget numbers, and decisions Waiz needs to make.
Update STATUS, ROADMAP, CHANGELOG, PROVENANCE and the evidence folder after each accepted milestone, and package
source, lockfile, build, prompts and evidence together.
