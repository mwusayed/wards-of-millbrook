# Wards of Millbrook: handover for continuation

Prepared 24 Nov 2026 by Claude (Anthropic) for Waiz (Mir Waiz Usayed), so another AI model (for example ChatGPT Pro)
or a human developer can take over. Read this file first, then `docs/STATUS.md`, `docs/WORKFLOW.md` and
`docs/TDD.md`. Everything below was written for v0.9.1; HANDOVER-CLAUDE.md has the v0.9.3 state on top of it.

---

## 1. What the game is

A browser 3D survival life-sim RPG with first- and third-person views, built in TypeScript and three.js. It combines
four of Waiz's earlier game designs:

| Source game | What it contributes |
|---|---|
| Mercenary Maintenance | Body needs (food, water, bladder, bowel, hygiene, comfort, fatigue, stress), wounds, contracts, debt |
| VEILWORK | First-person combat: revolver, spells, enemies |
| Ledger & Ward | The town of Millbrook, Aldric Voss's debt, factions, the Wardbreak story |
| Home Office Tycoon | Real double-entry bookkeeping work at the town ledger desk |

**The premise.** Aunt Ysolde left the player a stone house at the edge of Millbrook, a revolver, a staff, and a
300-crown debt to Aldric Voss of the Spire, with 60 crowns due every 7 days. The player keeps their body alive,
earns money (ledger work, notice-board contracts, trading, fishing, mining) and follows the story of the failing
wards across four regions.

**Where it runs.**
- Playable build: Waiz's claude.ai artifact "Wards of Millbrook" (private link, in his artifact gallery).
- `publish/wards.html` plus `publish/assets/index-*.js` is the same build: a single page that runs in any
  modern browser.

---

## 2. Version history

| Version | Date | Content |
|---|---|---|
| v0.1–v0.3 | Nov 2026 | First slice; save slots; revolver and holster; settings; the Old Mill and the Shade Patriarch |
| v0.6 | 15 Nov | Story (5 main and 8 side quests, endings); the Sunken Chapel and the Cinder Wraith; gate defence; skills and traits; weather; map; music |
| v0.7 | 21 Nov | Animation overhaul. The Eastern Reach: Brookfield, Thornwood, the toll tower, Ashford, Copper Hollow mine and the Warden Engine boss; 22 NPCs |
| v0.8 | 22 Nov | The Westmarch: Fernhollow, the Barrow Downs, King Orm's barrow; 16 NPCs; each character baked into one skinned mesh for performance |
| v0.9 | 22 Nov | Title screen; four firearms; silvered rounds; the gunsmith's armoury; grid inventory |
| v0.9.1 | 22 Nov | Long-gun reload animations redone; NPC seating and facing fixed (benches, stools, tables, counters) |
| v0.9.2 | 24 Nov | (Codex) Salt Gap preview: Dorran's charge, the blast, the tidal wreck |
| v0.9.3 | 24 Nov | The Saltway Coast wired and switched on: Gullhaven, the tide, the Sea Cave and the Wreck-Mother, five quests. See HANDOVER-CLAUDE.md |
| **v1.0 (next)** | — | Sign-off of the coast after Waiz plays it |

The full changelog is in `docs/CHANGELOG.md`.

---

## 3. Build, run and test

You need Node 20 or newer (it was built with Node 22.23).

```bash
npm install                  # three 0.170, vite 6, typescript 5.6, tsx
npx vite                     # dev server on :5173
npx tsc --noEmit             # type check (must be clean)
npx vite build               # production bundle in dist/
npx vite preview --port 5198 --strictPort   # serve dist/ for the browser suites
npx tsx tests/sim.test.ts    # rules tests: 97 pass
```

### Browser suites

The browser suites use Playwright with Chromium. They need `npm i -D playwright && npx playwright install chromium`
if Playwright is not installed globally. Every suite takes the URL of a running preview as its first argument.

| Script | Checks | What it covers |
|---|---|---|
| `scripts/smoke.cjs` | 14 | Core loop and Millbrook |
| `scripts/smoke2.cjs` | 19 | Story, dungeons, saves |
| `scripts/smoke3.cjs` | 8 | Gate defence and misc |
| `scripts/smoke4.cjs` | 34 | Eastern Reach and animation |
| `scripts/smoke5.cjs` | 40 | Westmarch and King Orm |
| `scripts/smoke6.cjs` | 22 | Title screen, grid pack, armoury, the four guns |

Other checks:
- `scripts/npccheck.cjs`: every NPC stop and waypoint is clear of walls and furniture (301 stops, all clear).
- `scripts/seatcheck.cjs`: a portrait of every seated NPC stop, for reviewing poses by eye.
- `dev/bench8.cjs`: performance per area (draw calls, CPU, shader programs).
- `dev/evidence.sh <version>`: runs everything above in sequence and writes `docs/qa/evidence/<version>/`.

**Important:**
- Never run two Playwright browsers at once. In this environment that crashed the renderer ("Target crashed").
- The headless browser renders in software (SwiftShader), so time runs slowly in tests. Wait on game state rather
  than fixed timeouts.

### Test hooks

`window.__game` exposes test hooks, including:
- start, step, teleport, view
- interactWith, save, load, openMap, openSettings
- openPack, armoury, setGun, reloadNow, selectSlot
- the objects s (game state), world, enemies, folk, player, vm, renderer, THREE_V
- `cfg` is a function: call `cfg()`.

---

## 4. Architecture

```
src/
  main.ts            ~200 KB. The hub: input, player controller, camera, firing, interactions, every region's
                     wiring, the frame loop, saves, the title screen, shader prewarm, test hooks.
  sim/               PURE RULES: no three.js, no DOM. Everything here is unit-tested.
    balance.ts       All numbers: items, prices, shops, gear, guns (GUNS table), buffs, recipes, FEATURES flags
    state.ts         GameState, newGame, needs/damage/eating/reloading/firing, serialize/deserialize + migration
    story.ts         Every quest as data (stages, talks, rewards); updateQuests, talkChoices, chooseTalk
    dialogue.ts      NPC reactions (COMMON conditions, VOICE lines per NPC, PRIORITY order)
    contracts.ts     Notice-board sites, enemy kinds, factions, board generators (town, lodge, west, coast)
    reach.ts         Shops, buying and selling, fishing, gathering, inns, firearm switching
    west.ts          Westmarch rules (gate, barrow, Orm's shroud, crown decision)
    south.ts         Saltway Coast rules (tides, blast, wreck, ledger, Wreck-Mother armour) (v1.0, built)
    town.ts, ledger.ts, cases.ts, events.ts, skills.ts, feed.ts, text.ts
  render/            three.js.
    world.ts         World class: helpers (block, cyl, shell, roof, window, lantern, interact), region culling
                     cells (80 m), static batching (mergeStatic), dungeon groups, materials (MAT, M())
    rig.ts           17-joint Humanoid rig, clips (all NPC/player poses), Hound (beasts), makeTool, makeCarbine
    bake.ts          bakeSkinned(): merges a rig's parts into one SkinnedMesh (ADR-017)
    crab.ts          Crab rig (shore crabs and the Wreck-Mother)
    npcs.ts          Townsfolk class, Millbrook NPC defs, alignStops() seating/facing pass; npcs_east/west/south.ts
    enemies.ts       EnemyManager: AI, projectiles, raycast hits, DEFS/RESIST per kind
    viewmodel.ts     First-person hands and guns, reload/draw/recoil animation
    east.ts, west.ts, south.ts   Region builders (Reach, Westmarch, Saltway Coast)
    mine.ts, barrow.ts, chapel.ts, seacave.ts, boss.ts, wraith.ts   Dungeons and bosses
    lights.ts (light pool), audio.ts, music.ts, settings.ts, perf.ts
  ui/                hud.ts (HUD and ALL CSS), panels.ts, reach_ui.ts (traders, armoury), map.ts
tests/sim.test.ts    97 rules tests
docs/                Design and process (see §6)
```

### Conventions to keep

**Rules versus rendering.** Rules go in `src/sim` and must not import three.js or touch the DOM. Rendering and UI
call into sim. Add a rules test for every new rule.

**Coordinates.**
- North is −z. Forward is (−sin yaw, −cos yaw).
- For a spot (x, z) looking at (tx, tz): yaw = atan2(−(tx−x), −(tz−z)).

**Walkable ground and colliders.**
- Walkable ground is flat at y = 0. Terrain only rises behind colliders.
- Colliders are axis-aligned boxes: `{minX, maxX, minZ, maxZ, h}`.

**Off-map dungeons.** They live at z < −270 in x bands (ADR-015):

| Dungeon | x band |
|---|---|
| Barrow | x < −100 |
| Mill | −100 to 100 |
| Chapel | 100 to 250 |
| Mine | 250 to 430 |
| Sea Cave | ≥ 430 |

**Performance.**

| Budget | Limit |
|---|---|
| Draw calls outdoors | ≤ 400 |
| Draw calls in dungeons | ≤ 250 |
| CPU average | ≤ 2 ms |
| Shader compiles during play | 0 |

Every rigged model is baked (ADR-017). Static meshes are merged per 80 m cell. Anything animated or toggled must be
"kept" in `world.mergeStatic`. The prewarm compiles every shader at load (ADR-018). If you add an enemy kind or a
projectile, add it to `prewarm()` in main.ts.

**Saves.**
- Saves live in localStorage. New top-level state fields forward-fill automatically through `NEW_V4()`.
- Nested records (gear, factions) need explicit merges in `deserialize`.
- Always add a migration test.

**Feature flags.** `B.FEATURES.coast` is currently false.

---

## 5. Game content (current)

### Regions

| Region | How you get there | What's there |
|---|---|---|
| Millbrook and the Whispering Vale | Start | Home, square, market, smithy (Dorran), store (Sera Vint), chapel, ledger office, Renn's watch |
| The Eastern Reach | East Gate | Brookfield farm; Thornwood; the toll tower; River Wend; Ashford (gunsmith Hale & Daughter, Wardens' Lodge, inn, docks); Copper Hollow mine and the Warden Engine |
| The Westmarch | West Gate, with Renn's key | The heath; Smeaths' charcoal camp; Fernhollow on Lake Hallow; the Barrow Downs; the reed marsh; King Orm's barrow |

### Dungeons and bosses

| Dungeon | Boss |
|---|---|
| Old Mill | Shade Patriarch |
| Sunken Chapel | Cinder Wraith |
| Copper Hollow | Warden Engine |
| King Orm's barrow | King Orm (the lit braziers weaken his shroud) |

### People

About 55 active NPCs. Each has a daily schedule of stops, lines, and an "about" text; reactions are in dialogue.ts.

### Enemies

- Hounds, raiders, shades, the drowned, imps
- Wolves, boars, crossbowmen (bandits), hollowed miners
- Barrow wights, grave-lights
- Built but off until the coast opens: crabs, smugglers, pistoleers

### Arms (v0.9)

| Gun | Damage | Rounds | Ammo | Price |
|---|---|---|---|---|
| Service revolver | 30 (38 rifled) | 6 | Revolver rounds, or silvered (×1.6 against the dead) | Starting gun |
| Hale lever carbine | 46 | 8 | Carbine rounds | 150 crowns |
| Breaker scattergun | 8 pellets × 12 | 2 | Shells | 120 crowns |
| Spire long rifle | 88 | 5 | Long-rifle rounds | 240 crowns |

Spells: Firebolt, Frost, Spark, Ward, Mend. Each costs mana plus calories, and mana refills use water.

### Systems

- Body needs and buffs
- Cooking and meals; fishing, mining, gathering
- Factions; notice boards with contracts and bounties
- Skills and traits; weather; day/night; travel
- Inns; charms
- The grid pack (weight limit)
- Map sheets per region
- Settings and accessibility (camera motion, run toggle)

---

## 6. Documentation map (`docs/`)

| File | Purpose |
|---|---|
| `STATUS.md` | Current state, version summaries, open issues. Start here |
| `WORKFLOW.md` | The development process (brief → spec → tech plan → build → verify → evidence → release). Follow it |
| `ROADMAP.md` | Milestones, briefs per version, status log |
| `CHANGELOG.md` | What changed per version |
| `DESIGN.md` | The overall design vision |
| `TDD.md` | Technical design: architecture, frame loop, budgets and measurements, coding standards, tech debt |
| `ADR.md` | Architecture decisions ADR-001 to ADR-018 (why things are the way they are) |
| `ART_BIBLE.md` | Visual style: low-poly flat-shaded, palette, lighting |
| `UX_ACCESSIBILITY.md` | UX rules and accessibility checklist |
| `PROVENANCE.md` | Everything is generated in code; no licensed assets |
| `gdd/*.md` | Game design modules (8 sections each: overview, fantasy, rules, formulas, edge cases, dependencies, tuning, acceptance criteria) |
| `qa/evidence/v0.7, v0.8, v0.9/` | Test outputs, budgets (`bench.json`), screenshots per release |

The GDD modules are: core-loop, body-needs, economy-debt, work, firearms-combat, magic, enemies, bosses,
quests-story, factions-dialogue, world-travel, items-activities, animation, saves-settings, westmarch, arms,
saltway.

---

## 7. Known issues and technical debt

- **Real hardware:** smoothness on a real GPU has not been measured; only the software renderer has. Single slow
  frames (16–20 ms) were measured right after teleports in Millbrook, Ashford, Fernhollow and the reed marsh.
- **Balance:** not checked by real play (the bosses especially; also the gun prices and damage).
- **Audio:** generated in code and very simple.
- **Shared dark-stone material:** the Drowned Lantern island tower sets it double-sided (cosmetic). Fix by
  cloning the material in `east.ts`.
- **Tool props:** they are separate meshes on the hand (a few extra draw calls per NPC holding one).
- **Size of main.ts:** about 200 KB. Splitting it into modules (input, firing, interactions, per-region wiring)
  would help.
- **Night seating portraits:** in `scripts/seatcheck.cjs` some night-time seated NPCs showed standing. A direct
  test showed the lighthouse keeper seated correctly, so this is believed to be a test-setup artifact, not
  confirmed for every NPC. Verify in play.
- **Horses and riding:** not started (a long-standing idea).

---

## 8. The Saltway Coast (done in v0.9.3; this list is kept as the record of what was wired)

Spec: `docs/gdd/saltway.md`. A coastal region south of the Whisper Stones, reached by blasting the Salt Gap.

### Already built, compiling, and behind `FEATURES.coast = false`

**Rules (`sim/south.ts`, plus additions in balance/state/story/dialogue/contracts/reach/feed):**
- Tides: high at 02:00 and 14:00, low at 08:00 and 20:00, flats exposed about 06–10 and 18–22.
- The blasting charge.
- The wreck log and the ship's bell.
- The Gull Tower lantern.
- Marrow's ledger (taken at night) and the cave key.
- The Wreck-Mother's armour (front ×0.3, belly ×1.8 when rearing).
- The Marrow decision (arrest, squeeze or let go).
- The keeper's oil and the chapel blessing.
- Quests sq1–sq5.
- Coast meals, gear, shops, the Gullhaven faction, the coast notice board.
- 11 rules tests (inside the 97).

**Rendering:**
- `render/south.ts`: the gorge, the Saltway, the Gull Tower, Gullhaven town, the lighthouse with its beam, the
  tidal flats and the wreck, Wreckers' Cove, gulls, the sea with tide level.
- `render/seacave.ts`: the cave dungeon and the WreckMother boss class.
- `render/crab.ts`: the crab rig.
- Enemies crab, smuggler and pistoleer in enemies.ts.
- `npcs_south.ts`: 12 NPCs.
- The map coast sheet.

### To do (in main.ts, mirroring the Westmarch wiring)

The Westmarch wiring is the "West block" in main.ts: barrowKing, syncBarrow, goBarrow, barrowTick, westEvents,
westInteract, discoverWest.

1. **Feature flag:** set `B.FEATURES.coast = true` and un-hide the `rockfall` interactable in south.ts.
2. **Interactions:** add a `southInteract(id)` routed from `interactWith`, covering:
   - rockfall (setCharge, then an 8 s fuse, the blast via `SO.blowGap(dist)`, then `world.south.openGap()` with
     camera shake and dust; apply the returned damage)
   - wreck_log, wreck_bell, tower_lantern, customs_desk, cave_mouth / cave_exit
   - cave_crate_1/2 (CAVE_LOOT), inn_bar_s (anchor shop) / inn_bed_s (innSleep 'gullhaven')
   - chandlery, auction (fishauction), shipwright, sea_chapel (blessing)
   - notice_coast (board 'coast'), fish_sea (FishSpot 'sea'), tide_table, keeper_log, shrine_s, milestone_s
   - mussel_* and samphire_* nodes (`R.gather`)
3. **Tide each frame:**
   - Call `world.south.setTide(SO.tideAt(s))` and `world.south.animate(...)`.
   - On the flats (`inFlats`): set `player.wading` with `SO.wadeMult`.
   - If `inDeepFlats` while not `SO.flatsExposed`: teleport the player to the shore and call `SO.tideCarry`,
     with a warning 30 game minutes before.
4. **Sea cave:**
   - `goSeaCave(enter)` uses `world.setDungeon('seacave')` and the spawn at `world.seacave.spawn`.
   - Spawn 2 smugglers and 1 pistoleer when entering the store.
   - Create a `WreckMother` with hooks: hurtPlayer, slowPlayer, feed, defeated → `SO.motherDown`, sound,
     spawnCrab (tag 'mother_call'), shake, flood → tween `world.seacave.setFlood(0→1 over 6 s)`.
   - Wake her when the player enters the grotto.
   - Show a boss bar.
   - Wading in the flood unless the player is on a platform.
   - Restore the cave on load.
5. **Site spawns (SITE_KIND):** saltway → smuggler, gull_tower → pistoleer, tidal_flats → crab,
   wreckers_cove → smuggler.
6. **Kill hook:** exclude the tags 'mother' and 'orm' from `killed()`.
7. **Map:** pass `coast` features, `coastKnown`, `gapOpen` and `lowTideIn` to the map.
8. **Discovery:** discover places (`place:gullhaven`, `place:lighthouse`, ...) using `world.south.regions`.
9. **Travel and music:** add TRAVEL entries and music zones.
10. **Townsfolk presence:** Lowdy appears on the flats only at low tide; the other coast NPCs follow their
    schedules.
11. **Release:**
    - Write `scripts/smoke7.cjs` for `saltway.md` §8.
    - Add coast spots and the seacave to the bench.
    - Run `dev/evidence.sh v1.0`.
    - Fix the 3 coast NPC stops `npccheck` may flag.
    - Update docs and publish.

### To publish a new build to Waiz's artifact

1. Run `npx vite build`.
2. Copy `dist/assets/index-<hash>.js` into `publish/assets/`.
3. Update the script src in `publish/wards.html`.

(Inside claude.ai, Claude republishes it to the same artifact URL. Elsewhere, any static host serving
`publish/` works.)

---

## 9. How Waiz likes to work (for the next AI)

- Waiz gives broad direction ("continue", "add more areas, towns, NPCs, items", "fix this" with a screenshot) and
  expects finished, playable builds, not plans.
- Follow `docs/WORKFLOW.md`: write or extend the spec first, keep the rules tested, verify in a real browser with
  screenshots, record evidence, then release.
- Report plainly: what changed, what passed, what is not verified.
- Keep everything made in code (no external assets), low-poly flat-shaded, and inside the performance budgets.

---

## 10. Zip contents

- Everything above, except `node_modules` (run `npm install`).
- `publish/`: the ready-to-run build.
- `dist/`: the last build.
- `docs/qa/evidence/`: per-release test outputs and screenshots.
- `shots9/seats`: NPC seating portraits.
- `HANDOVER.md`: this file.
