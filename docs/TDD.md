# Wards of Millbrook — technical design (TDD)

The engineering blueprint: platform, architecture, module map, frame loop, budgets and coding standards.
Lasting decisions and their reasons are in `docs/ADR.md`. System rules are in `docs/gdd/`.

## 1. Platform and stack

| | |
|---|---|
| Target | Desktop browsers with WebGL2 (Chrome, Edge, Firefox, Safari 16+). Keyboard and mouse with pointer lock. |
| Renderer | Three.js 0.170 (WebGL2), no game engine |
| Language | TypeScript 5.6, strict; ES modules |
| Build | Vite 6: one HTML page and one JS bundle (about 1.05 MB, 320 KB gzipped) |
| Audio | Web Audio, synthesized at runtime (`render/audio.ts`, `render/music.ts`); no sample files |
| Art | Procedural: every model is built from primitives at load; no textures or model files |
| Storage | `localStorage`: settings (`wards-of-millbrook-settings`), autosave (`G.SAVE_KEY`), three slots (`wards-of-millbrook-slot-<n>`) |
| Distribution | Published as a claude.ai artifact (same link for every version), plus a source zip |
| Tests | `tsx` for rules tests; Playwright + headless Chromium (SwiftShader WebGL) for browser suites |

## 2. Architecture

Four layers, with dependencies pointing one way only:

```
 src/sim/*   pure rules: state, formulas, quests, dialogue, economy      (no three, no DOM)
     ▲
 src/render/* three.js scene: world builders, rigs, animation, enemies, bosses, lights, audio
     ▲
 src/ui/*    DOM panels: HUD, menus, map, traders, dialogue windows
     ▲
 src/main.ts hub: input, the frame loop, player controller, wiring between rules, scene and UI
```

- The rules layer owns the game state `s` (`sim/state.ts`). Every change to money, needs, quests or items goes
  through a rules function, so the whole game can be tested without a browser.
- The scene reads the state; it never stores rules data of its own (positions, animation and AI state are scene data).
- UI panels get callbacks from `main.ts`; they do not import the scene.

## 3. Module map (v0.8)

| Module | Size | Purpose |
|---|---|---|
| `sim/state.ts` | 58 KB | Game state, needs, time, combat rules, saves and migrations |
| `sim/balance.ts` | 29 KB | Every tunable constant: items, spells, gear, shops, buffs, recipes |
| `sim/story.ts` | 54 KB | Main, Reach and side quests; flags; endings |
| `sim/dialogue.ts` | 26 KB | Conversation trees, voices, relationship effects |
| `sim/reach.ts` | 10 KB | Eastern Reach rules: traders, charms, carbine, fishing, mining, gathering, services (and the Westmarch's shops, lake fishing, inn) |
| `sim/west.ts` | 6 KB | v0.8 Westmarch rules: the West Gate, Vane's key, the rowan ward, the barrow door and braziers, Orm's shroud, grave-chill, night spawns |
| `sim/contracts.ts`, `cases.ts`, `ledger.ts`, `town.ts`, `events.ts`, `days.ts`, `skills.ts`, `feed.ts`, `text.ts`, `rng.ts` | 1–15 KB | Contract board, ledger cases, bookkeeping, factions, daily events, weather, skills, the world feed, text helpers, seeded random |
| `render/world.ts` | 62 KB | World builder (Millbrook, Vale, Old Mill), colliders, interactables, regions, batching, sky and fog |
| `render/east.ts` | 48 KB | The Eastern Reach: Brookfield, Thornwood, toll tower, river, Ashford, Copper Hollow |
| `render/chapel.ts`, `mine.ts` | 9 KB, 19 KB | Drowned Chapel and Copper Hollow interiors; the Warden Engine boss |
| `render/west.ts` | 52 KB | v0.8: the Westmarch: West Gate, heath, charcoal camp, Barrow Downs, Fernhollow, Lake Hallow, reed marsh |
| `render/barrow.ts` | 22 KB | v0.8: the Barrow of King Orm and King Orm, the Barrow-King |
| `render/rig.ts` | 66 KB | 17-joint humanoid rig, inertial blending, gait, clips, beasts, props |
| `render/bake.ts` | 6 KB | v0.8: bakes each character, beast and farm animal into one skinned mesh (ADR-017) |
| `render/viewmodel.ts` | 20 KB | First-person arms and weapons, spring motion, staged actions |
| `render/enemies.ts` | 25 KB | Enemy types, AI, projectiles |
| `render/boss.ts`, `wraith.ts` | 11 KB, 16 KB | Mill and chapel bosses |
| `render/npcs.ts`, `npcs_east.ts`, `npcs_west.ts` | 19 KB, 21 KB, 14 KB | Townsfolk, schedules, routes, fidgets |
| `render/lights.ts` | 3 KB | Fixed pool of point lights |
| `render/settings.ts`, `perf.ts`, `weather.ts`, `audio.ts`, `music.ts` | 2–7 KB | Settings, frame monitor (F3), rain and fog particles, sound effects, music |
| `ui/hud.ts`, `panels.ts`, `map.ts`, `reach_ui.ts` | 9–26 KB | HUD, menus and panels, the map, Reach windows |
| `main.ts` | 181 KB | Input, loop, player, interactions, story wiring, test hooks |

## 4. Frame loop

One `requestAnimationFrame` loop (`frame()` in `main.ts`). `dt` is clamped to 0.1 s; an optional frame cap
(30 or 60) skips frames. Order each frame:

1. Mouse look is applied (`applyLook`), then, if the game is live (started, no modal, not game over), `update(dt)`:
   player controller and collision, interactions, combat, enemies and projectiles, bosses, time and needs.
2. Always, even with a window open: sky and fog for the time of day, pooled lights, world animation, region
   visibility, river and critters, the ewe, roofs, townsfolk, the player's model, weather particles, lantern, compass.
3. HUD refresh every 0.1 s, world feed every 1 s, story checks every 0.5 s.
4. Test camera hook (`window.__camHook`, only set by test scripts), then one `renderer.render()`.

Time: 1 real second = 1 game minute while live.

## 5. World build

- Built at load by `World` (and `buildEast`, `buildChapel`, `buildMine`). Repeated props (trees, rocks, fence
  posts, crops) go through `put()` and become one `InstancedMesh` per kind.
- Collision: a list of axis-aligned boxes; the player and NPCs are circles pushed out of boxes.
- Interactables: a list of points with a radius, label and animation; the nearest one in reach is offered.
- Dungeon interiors sit off the map: the Old Mill at (0, −320), the chapel at (160, −320), the mine at (330, −330), the barrow at (−180, −330).
- Regions: the overworld is split into 80 m cells and each dungeon is one group. A cell is drawn only while it is
  within fog distance + 25 m; a dungeon only while you are inside it.
- Static batching: inside each cell, meshes that share a material and never change are merged into one mesh, including the meshes of wholly static groups (v0.8).

## 6. Rendering

- Lighting: one sun with a shadow map (shadows off / low / high), one hemisphere light, and a **fixed pool of six
  point lights** that move to the lamps nearest the player (fade out, jump, fade in). The number of lights never
  changes, so shaders never recompile at runtime.
- Shader prewarm: at load every material is compiled once with everything normally hidden made visible
  (`prewarm()` in `main.ts`), every enemy kind, boss and projectile is spawned once, each instanced shadow-caster
  material is drawn after a plain one (ADR-018), and one real frame is drawn so the shadow-pass programs exist.
  A shadows on/off change recompiles once, in the settings code.
- Characters and animals: built from parts, then baked into one skinned mesh each (ADR-017). The joints are the
  bones; the rig code is unchanged. Farm animals past 70 m are hidden and not stepped.
- Fog distance and far plane follow the view-distance setting (default 260 m).
- Resolution scale 0.5–1.5 of the device pixel ratio (capped).

## 7. Saves

`serialize` writes `{ s, extra }`. Version 5 since v0.7. `deserialize` migrates 1 → 2 → 3 → 4 → 5, then
forward-fills any field a newer build added (`NEW_V4()`). Rejects corrupt JSON and non-finite needs.
See `docs/gdd/saves-settings.md`.

## 8. Test hooks

`window.__game` exposes `start`, `step(dt)` (runs `update` plus townsfolk and the ewe), `teleport`, `view`, `bench`,
state access and a few shortcuts. They exist in the published build so the browser suites can drive it; nothing
in normal play calls them.

## 9. Budgets

Measured headlessly (SwiftShader, 1280×720, third person). CPU is the game's own work per frame (`__game.bench`:
update, townsfolk, regions, river, lights, HUD); it excludes the GPU and the browser's compositing.

| Metric | Budget | How measured |
|---|---|---|
| CPU per frame, average, any overworld spot | ≤ 2 ms | `dev/bench8.cjs` |
| CPU per frame, 99th percentile | ≤ 16 ms | `dev/bench8.cjs` |
| Draw calls, worst heading, any overworld spot | ≤ 400 | `dev/bench8.cjs` (8 headings per spot) |
| Draw calls inside a dungeon | ≤ 250 | `dev/bench8.cjs` |
| Shader compiles after load | 0 | `renderer.info.programs` count before and after a play-through (`scripts/smoke*.cjs`) |
| Point lights in the scene | 6, fixed | `LightPool` |
| Page errors in any suite | 0 | every browser suite |
| Bundle size (gzip) | ≤ 450 KB | `vite build` output |

Measured values for each version are in `docs/qa/evidence/<version>/bench.json` and summarised in the evidence index.

v0.8 (after ADR-017 and ADR-018, SwiftShader): every spot within the draw-call budget, worst heading 371 calls (the
docks), dungeons 102 (the mine) and 83 (the barrow); 22 programs at load and none added during the bench route. CPU
average within 2 ms except Brookfield (2.2) and the reed marsh (3.0); p99 over 16 ms at Ashford and the marsh (cell
streaming after a teleport). Before the skinned bake the same route measured up to 828 calls (Ashford).

## 10. Coding standards

1. `src/sim` imports nothing from `three`, `src/render`, `src/ui` or the DOM.
2. Every number a designer might tune lives in `sim/balance.ts` (or the named constants block at the top of a
   scene module) and is quoted in the system's GDD module.
3. New state fields: add the default to the new-game state **and** to `NEW_V4()`; bump the save version only
   when a field needs a migration step; add a migration test.
4. Anything the game moves, hides or swaps after the world is built must be registered (lamps, fires, nodes,
   gates, critters) so static batching leaves it alone.
5. No per-frame allocation in hot paths (reuse vectors); no new lights at runtime; no material created per frame.
6. Comments say *why*. Player-facing text uses plain words and no real people, brands or copyrighted lines.
7. Keep `npx tsc --noEmit` clean between steps; a pass ends with every suite green.

## 11. Known technical debt

- `main.ts` is 181 KB (the Westmarch block added 18 KB). Plan: move the region blocks (Reach, Westmarch) into `src/game/` modules behind a small context object; the obstacle is that `s` is reassigned on load, so modules must read it through a getter.
- Vite warns that the bundle is over 500 KB. Acceptable for one page; splitting would complicate the artifact.
- Enemies beyond 120 m (Manhattan) skip their AI unless chasing.
- Real-GPU frame pacing, tearing and audio cannot be measured headlessly; they need play on real machines.
- The Drowned Lantern's island tower sets its material double-sided, and that material is the shared dark stone,
  so every dark-stone mesh is double-sided (a little extra fill, no visible change). Fix: clone it. (Found in v0.8,
  scheduled for v0.9.)
- The skinned bake reads part colours once. A future effect that recolours one part (a dyed shirt, a wound) needs a
  vertex-colour update in `bake.ts`, or that part kept separate.
