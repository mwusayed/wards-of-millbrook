# Continue Wards of Millbrook for Mir Waiz Usayed

You are continuing my existing TypeScript and Three.js browser RPG. Unpack this archive and work directly on this source. Preserve every project and previous save. I own the creative sign-off. Deliver playable increments and describe the parts you verified.

Start with this file, then HANDOVER.md for the inherited v0.9.1 baseline, docs/COAST-PREVIEW.md, docs/gdd/saltway.md and docs/WORKFLOW.md. The production reference and reusable prompts are in docs/PRODUCTION-WORKFLOW.txt and docs/WORKFLOW-PROMPTS.md. Use docs/TDD.md for budgets and docs/ADR.md for decisions. Millbrook and the Vale, the Eastern Reach and the Westmarch are the three established regions. The coast is the fourth region in development.

## Changes in v0.9.2

src/main.ts adds a Dorran service, the coast interaction dispatcher, live fuse and tide updates, return to shore, load-time gate synchronization and preview title copy. src/render/south.ts exposes the rockfall prompt. The rockfall consumes the purchased charge. Retreat during its eight-second fuse. The gate's permanent state lives in the existing story flags. Loading with a charge set restarts the fuse. Low tide permits collection at the wreck. The tower and customs desk use the existing rules. The cave mouth explains the preview limit. The full coast quest flag remains off pending integration.

The source and both static delivery directories are included. npm ci followed by npm run build rebuilds dist. Use npm run dev for development. The publish/wards.html entry references the updated bundle. No external deployment was performed.

## Resume with verification

Read docs/qa/evidence/v0.9.2. The strict TypeScript build and all 97 inherited simulation tests passed. The Chromium process could not create its singleton socket in the build host. Browser behavior, rendering, timing, accessibility and player balance need direct verification. Earlier screenshots belong to earlier releases. Start a preview on port 5198, run the existing six smoke suites sequentially, then walk from the smith to the gap without teleportation. Check damage at safe and unsafe distances, loading before and after the blast, visual disappearance of the rockfall and tide carry from the deep flats. Test new game after loading an open gate.

## Finish the coast

Use HANDOVER.md section 8 as the detailed integration list. Reconcile it against the new dispatcher before editing. Add missing services, gathering, notice board, discoveries, travel and map data. Add tide warning and wading. Connect the sea cave entry, enemies, Wreck-Mother's damage windows, flood, platforms and completion flags. Check NPC presence, cargo and quest item visuals. Reconcile Dorran's preview purchase with quest dialogue before enabling the five coast quests. Play all three Collector decisions and verify save restoration. Extend smoke7 and add coastal benchmark locations. Check each of the eight criteria in saltway.md against specific evidence. Preserve performance targets of 400 outdoor draw calls, 250 dungeon calls, average CPU 2 ms and zero new shader programs in play.

Update STATUS, ROADMAP, CHANGELOG, provenance and evidence after each accepted milestone. Package source, lockfile, build, prompts and evidence together. Report what changed, the player route, pass counts, failures and any decisions Waiz needs to make. Treat v1.0 as pending until its criteria have evidence.
