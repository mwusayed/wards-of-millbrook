# Architecture decision records

Each record: the context, the decision, and what it costs. New decisions are appended; a reversed decision is
marked *Superseded by ADR-n*, not deleted.

---

### ADR-001 — No engine: Three.js in one page
- **Context.** The game is published as a claude.ai artifact: one HTML page plus files, opened in a browser, no installer.
- **Decision.** Write the game directly on Three.js with TypeScript and Vite. No game engine, no physics library.
- **Consequences.** Full control of the frame loop, small bundle, nothing to license. We write our own collision
  (circles against boxes), animation, AI and UI. (v0.1)

### ADR-002 — Rules apart from the scene
- **Context.** Body needs, money, quests and combat numbers must be testable quickly and without a GPU.
- **Decision.** `src/sim` is pure TypeScript with no Three.js or DOM. The scene reads the state; it never owns rules data.
- **Consequences.** 70 rules tests run in about a second. A little duplication where the scene keeps its own
  positions and animation state. (v0.1)

### ADR-003 — Procedural art, no asset files
- **Context.** Artifact size limits, no licensing questions, and a consistent look across many regions.
- **Decision.** Every model is built from primitives at load with flat-shaded standard materials; repeated props
  are instanced. No textures, models or sound files.
- **Consequences.** Tiny downloads and one coherent style (see `docs/ART_BIBLE.md`). Detail comes from shape and
  colour, not texture. Load time grows with the world (still a few seconds). (v0.1)

### ADR-004 — A fixed pool of point lights
- **Context.** In WebGL, changing the number of lights recompiles every lit shader, which caused hitches when lamps came on.
- **Decision.** Six point lights exist from the start and move to the lamps nearest the player, fading out and in
  as they move (`render/lights.ts`).
- **Consequences.** Zero runtime recompiles and a fixed per-pixel cost. Far lamps look lit only through their
  emissive glass. (v0.3)

### ADR-005 — Compile every shader at load
- **Context.** First use of a material (a spell flash, the shower, a boss) caused a one-off stall.
- **Decision.** `prewarm()` makes hidden things visible, compiles the whole scene once, and hides them again.
- **Consequences.** A slightly longer load; no stalls in play. A new material must exist in the scene at load. (v0.3)

### ADR-006 — Inertial blending instead of crossfades
- **Context.** Crossfading clips (v0.3–v0.6) smeared walk cycles into mush and made attacks feel late.
- **Decision.** Follow the current clip exactly; when the clip changes or a joint jumps, decay the old offset with a
  critically damped spring (`Humanoid.apply`, `decay`).
- **Consequences.** Crisp cycles and smooth transitions at the cost of storing an offset and velocity per joint. (v0.7)

### ADR-007 — Gait phase driven by distance
- **Context.** Time-driven walk cycles slide the feet whenever speed changes.
- **Decision.** The gait phase advances by distance travelled divided by stride length (`Humanoid.stride`).
- **Consequences.** Feet plant at any speed; every walker must report its real speed. (v0.7)

### ADR-008 — Dungeon interiors off the map
- **Context.** Interiors need their own lighting, fog and music, and must not be visible from the overworld.
- **Decision.** Each interior is built at a far-away spot (the mill at z −320, the chapel at x 160 z −320, the mine
  at x 330 z −330). Doors teleport the player and set `world.dungeon`.
- **Consequences.** No streaming. Culling is trivial: while inside, only that interior draws. Area tests use
  coordinates (`inMillArea`, `inChapelArea`, `inMineArea`). (v0.4)

### ADR-009 — Region cells and static batching
- **Context.** The Eastern Reach tripled the world; Ashford alone drew about 590 meshes.
- **Decision.** Sort the overworld into 80 m cells shown only within fog distance + 25 m; inside each cell, merge
  meshes that share a material and never change. Anything animated is registered and left alone.
- **Consequences.** Ashford fell to about 280 draw calls. Every object animated after load must be registered or
  it will be frozen into a merged mesh. (v0.7; extended to static groups in v0.8)

### ADR-010 — Versioned saves with step migrations and forward fill
- **Context.** Players keep saves across updates.
- **Decision.** Each save carries a version. `deserialize` migrates one version at a time, then fills any field a
  newer build added from the new-game defaults (`NEW_V4()`).
- **Consequences.** Every pass adds defaults and a migration test. A field is never renamed in place. (v0.2, v5 in v0.7)

### ADR-011 — One game minute per real second
- **Context.** Body needs must matter within a session without being a chore.
- **Decision.** Time runs at 60× while live; sleeping, working and travelling skip time in chunks.
- **Consequences.** A game day is 24 real minutes of free play. Balance numbers are per game hour. (v0.1)

### ADR-012 — Synthesized audio
- **Context.** No sound files (ADR-003), but the world must not be silent.
- **Decision.** Effects and music are made with Web Audio at runtime from oscillators and noise.
- **Consequences.** Zero download size for audio; the sound palette is simple. Audio cannot be checked headlessly. (v0.3)

### ADR-013 — Test hooks ship in the build
- **Context.** Browser suites must drive the real published build.
- **Decision.** `window.__game` stays in production. Normal play never calls it.
- **Consequences.** A curious player can cheat from the console; acceptable for a single-player browser game. (v0.2)

### ADR-014 — Night spawns are tagged enemies that sink at dawn
- **Context.** The Downs should fill with the dead at night and empty by day, without a second enemy system.
- **Decision.** At 20:00 the game spawns enemies tagged `night` (counts from `W.nightSpawns`, which reads the crown's
  fate); at dawn each is told to `sink` (2.4 s, no reward, then removed). Spawns near the player rise out of the ground.
- **Consequences.** One code path for every enemy; nothing to save (night spawns are not persisted, and come back
  the next night or after a load). (v0.8)

### ADR-015 — The off-map dungeons are told apart by x
- **Context.** The barrow sits west of the mill under the map (x −180); the old test `inMillArea` (z < −270, x < 100)
  would have claimed it.
- **Decision.** Mill: −100 ≤ x < 100; barrow: x < −100; chapel: 100 ≤ x < 250; mine: x ≥ 250. Each also has its own
  region group for culling.
- **Consequences.** Saves made inside any dungeon restore into the right one. A fifth dungeon needs its own band. (v0.8)

### ADR-016 — Lighting is a mechanic, not only a mood
- **Context.** The art pillar is lamplight against the dark; the barrow boss is built on it.
- **Decision.** Braziers are light-pool anchors that can be switched on and off (`LightAnchor.on`), paired with a fire
  mesh. Darkness is a hemisphere-light level per dungeon (`world.barrowDark`), never a change in light count.
- **Consequences.** No shader recompiles when the lights go out (ADR-004 holds). The boss reads `lit` directly. (v0.8)

### ADR-017 — Characters and animals are baked into one skinned mesh each
- **Context.** The v0.8 bench measured up to 828 draw calls at Ashford against a budget of 400. A townsperson was
  ~24 part meshes (each drawn again in the shadow pass), so 18 visible people cost over 800 calls on their own.
- **Decision.** Every articulated model (the humanoid rig, hounds/wolves/boars, farm animals) is built from parts as
  before, then `bakeSkinned()` (`render/bake.ts`) merges the parts into one `SkinnedMesh`: one bone per existing
  joint, weight 1, part colours moved into vertex colours. Joints keep animating exactly as before. Parts with a
  special material (double-sided, see-through, glowing, metal, named) stay separate; parts sharing such a material
  on one joint are merged into one mesh. Culling uses the rest-pose bounds plus a margin.
- **Consequences.** About one draw call per character (plus shadow), from ~24. Worst heading anywhere outdoors fell
  to 371. Code that recolours a part after construction would no longer work (none does; `tint()` still works on
  the whole model). Two shader programs were added (skinned, skinned depth), compiled at load. (v0.8)

### ADR-018 — The shader prewarm forces each depth-material variant
- **Context.** three.js shares one depth material for shadows and only re-picks its program when instancing or
  skinning changes, so which variant (front, back, double-sided) gets compiled depends on draw order. The bench
  caught one compile during play: the double-sided instanced rocks at Copper Hollow.
- **Decision.** `prewarm()` draws, for each instanced shadow-caster material, a plain caster followed by an
  instanced one at the shadow box's centre, so every instanced depth variant exists before play.
- **Consequences.** Zero programs compiled during the bench route (22 at load, 22 after). A new instanced caster
  material is covered automatically. (v0.8)
