# Wards of Millbrook — build status

Playable build: https://claude.ai/artifact/TbhKNCwJFRNqmyMgPfd22S (v0.9, 22 Nov 2026)
Source: wards-of-millbrook-v0.9-source.zip (sent in chat). Process: docs/WORKFLOW.md; evidence: docs/qa/evidence/v0.9/. Design: docs/DESIGN.md; history: docs/CHANGELOG.md; plan and status log: docs/ROADMAP.md.

## What it is
First/third-person survival life-sim RPG combining Mercenary Maintenance (needs, wounds, contracts, debt), VEILWORK (first-person combat), Ledger & Ward (Millbrook, Aldric's debt, factions, the Wardbreak) and Home Office Tycoon (real debit/credit ledger work). Built directly by Claude in TypeScript + Three.js.

## v0.9 (22 Nov 2026): Arms and the Title
- Title screen over a slowly circling live view of Millbrook (Continue, New, Load, Settings, How to play, Credits).
- Four firearms (revolver, lever carbine, Breaker scattergun, Spire long rifle) with their own ammo, models and recoil; silvered rounds ×1.6 against the dead.
- Hale & Daughter's armoury with stat bars; ammo by one or five boxes. Grid pack with sized tiles, filters, weight bar.
- Fixes: v0.7/v0.8 conversation reactions now show; four townsfolk no longer stand in tables.
- Tests: 97 rules; smoke6 22 (new), smoke5 40, smoke4 34, smoke 14, smoke2 19, smoke3 8 — all pass.

## v0.8 (22 Nov 2026): the Westmarch
- New region west through Millbrook's West Gate (opened with Renn's key): the heath, the Smeaths' charcoal camp, Fernhollow on Lake Hallow (jetty, Heron and Reed inn, longhouse, smokehouse, wise woman), the Barrow Downs (Ring of Nine, long barrows, Vane's dig), the reed marsh.
- Fourth dungeon: King Orm's barrow, where the braziers you light are the fight: the more are lit, the weaker his shroud.
- 16 new NPCs (55 in all), five quests (The Sealed Gate, The King Under the Hill with three endings for the crown, Smoke on the Heath, Old Grandmother, The Drowned Road).
- New enemies: barrow wights (rise from the ground, grave-chill) and grave-lights. Lake and marsh fishing, heather and bilberries, three charms, fen waders, five meals, Fernhollow faction.
- Accessibility: camera-motion slider and run toggle.
- Tech: every character and animal is one skinned mesh (ADR-017), bringing every outdoor view inside the 400 draw-call budget (was 828 at Ashford); no shader compiles during play (ADR-018).
- Tests: 86 rules tests; browser suites smoke 14, smoke2 19, smoke3 8, smoke4 34, smoke5 40 (Westmarch), all passing.

## v0.7 (21 Nov 2026): animation feel and the Eastern Reach
- Animation: inertial blending (crisp cycles, smooth transitions), distance-synced gait with foot joints, hip sway and counter-rotation, strafing/backpedal, face-the-way-you-walk when holstered, air and landing poses, lean, flinch, head look-at, 14 new townsfolk clips with fidgets and tools, beast gallop, spring-driven first person (figure-eight bob, inertia, sprint carry, landing dip, recoil, draw/holster, full revolver reload with ejected brass, idle fidget).
- New region east of Millbrook's new East Gate: Brookfield farm (animals), Thornwood (Hollow Oak), bandit toll tower, River Wend (bridge, ford), Ashford (walled river town: Reeve's Hall, Drowned Lantern inn, Wardens' Lodge, apothecary, gunsmith, charm shop, bathhouse, shrine, market, docks), Copper Hollow mine (third dungeon) with the Warden Engine boss.
- 22 new NPCs (39 in all), a pedlar who walks the road daily, a coach between the towns.
- Quests: The Road East, Copper and Silence (three endings for the ward-copper seam), Brask's Last Page, Wolves at the Fold, Bluebell, The Toll. Lodge notice board with east contracts and bounties.
- New enemies: wolves, boars, crossbowmen, hollowed miners. Lever carbine, six charms, fishing, mining, gathering, new meals and buffs, Woodcraft skill, Ashford faction.
- Tech: 80 m culling cells and per-dungeon groups; save format v5 (v4 saves migrate).
- Tests: 70 rules tests; browser suites all pass: smoke 14, smoke2 19, smoke3 8, smoke4 34 (Eastern Reach and animation).

## Earlier
- v0.6 (15 Nov): story (5 main quests, 8 side quests, endings), Sunken Chapel and Cinder Wraith, gate defence, skills/traits, weather, map, music.
- v0.3 (11 Nov): smoothness fixes, settings, Old Mill and Shade Patriarch. v0.2: save slots, revolver, holster. v0.1: first slice.

## Not verified / open
- Smoothness on a real GPU (the test browser renders in software). Frame spikes over 16 ms at Ashford and the reed marsh right after a teleport.
- Balance by real play (King Orm especially); audio.
- Four v0.7 townsfolk stand slightly inside a table edge (cosmetic).

## Next: v1.0 "The Saltway Coast" (spec docs/gdd/saltway.md)
- In the build but switched off (`FEATURES.coast`): its rules and quests (tested), the coast, Gullhaven, the sea cave and the Wreck-Mother, crabs, smugglers, 12 people, the map sheet.
- To do: game-loop wiring (interactions, tide, flooding, boss), browser suite, screenshots, release.

## v0.9.2 Salt Gap Preview, 24 November 2026

Codex connected the Salt Gap and tidal wreck interactions. See HANDOVER-CLAUDE.md for the change inventory, scope and outstanding acceptance checks. Build and 97 rules checks passed. Browser verification is pending.
