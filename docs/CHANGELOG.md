# Changelog



## v0.9.1 — Reloads and seats (22 Nov 2026)
- Reloads for the long guns redone: the gun comes down into view with both hands on it, and the left hand carries
  a visible round to the gun for each one loaded. Carbine: rounds through the loading gate, then the lever.
  Scattergun: the barrels break open, two shells out, two in, snapped shut. Long rifle: bolt up and back, rounds
  pressed in from above, bolt home.
- Townsfolk sit properly: anyone with a seated stop by a bench now sits on it, facing out (Old Petch in the
  square was sitting in the air beside his bench); every other seated stop gets a stool under it; people at a
  table, desk or counter face it and are pulled up close enough to reach it.
- Checks: rules 97, smoke6 22, smoke 14, smoke5 40, NPC route check 301 stops clear.

## v0.9 — Arms and the Title (22 Nov 2026)
- **Title screen**: the live world turns behind it (Millbrook at late afternoon); Continue, New game, Load, Settings,
  How to play, Credits, and a "New in" card. The HUD stays hidden until you start.
- **Four firearms**: the service revolver, the Hale lever carbine, the new Breaker scattergun (eight pellets,
  close range) and the new Spire long rifle (88 damage, slow, very accurate), each with its own ammunition, first-
  and third-person models, recoil and sounds. Take up any gun you own from the pack; the others hang on your back.
- **Silvered cartridges**: ×1.6 against the dead; choose to load them first.
- **Hale & Daughter's armoury**: the guns on a rack with stat bars, ammunition by one or five boxes, gunsmithing,
  selling. Shells and silver also at the Lodge and in Fernhollow.
- **Grid pack**: sized tiles, filters, weight bar, item detail, arms column.
- Fixed: conversation reactions from v0.7 and v0.8 (the crown, the engine, the toll, charms, the carbine) never
  showed, because they were missing from the priority order. Four Eastern Reach townsfolk no longer stand inside
  tables.
- Under the hood: the Saltway Coast (v1.0) rules, region, sea cave, boss, crabs, smugglers and 12 people are in
  the build but switched off (`FEATURES.coast`).

**Verified**: 97 rules tests; the new arms and title browser suite (22 checks, `scripts/smoke6.cjs`); every earlier
suite; budgets. Evidence: `docs/qa/evidence/v0.9/`.

## v0.8 — 22 Nov 2026 — The Westmarch
Waiz asked for more of the same: more areas, towns, people, items and places, built to the new workflow (spec first in `docs/gdd/westmarch.md`, then rules, world, interface, wiring, tests and evidence).

**The Westmarch (new region, west of Millbrook)**
- Millbrook's **West Gate**, barred for nine years, opens through a quest. Beyond it: the **Heath Road** over purple heather and gorse, a fallen milestone, and Wynn Calder's sheep fold.
- **The Smeaths' clamp**: a charcoal burners' camp in a birch copse, three smoking earth clamps, turf huts and a fire to warm yourself at.
- **The Barrow Downs**: five long barrows, the **Ring of Nine** standing stones, Master Vane's dig at a barrow he broke open, and King Orm's great mound with its stone door.
- **Fernhollow**, a lake village on **Lake Hallow**: a green with a maypole, the Heron and Reed inn, the headwoman's longhouse, a smithy, a smokehouse, a boatwright's slipway with a half-built boat, a jetty out over the water, an island with a ruined tower in the mist.
- **The reed marsh** south of the village: black pools, reeds, a boardwalk causeway, and the old causeway post.
- **15 new people** with daily routes, conversations and services, including the barrow-warden who walks to the stones every afternoon and keeps vigil at night.
- The map has a third sheet, the Westmarch; new places can be walked back to.

**New story: The King Under the Hill**
- *The Sealed Gate*: get Captain Renn's key, unbar the West Gate, walk to Fernhollow.
- *The King Under the Hill*: the barrow-warden, a bronze key that Vane took (buy it, talk him round, or lean on him), Gammer Thrush's rowan ward, the **Barrow of King Orm**: an antechamber whose dead rise as you pass, the **Hall of Kings** (three braziers to light, with a lantern or a Firebolt, before the inner slab sinks), and the burial chamber.
- **King Orm, the Barrow-King**: a wide sweep (step back) and a long cleave (step aside), and he calls the dead at 70% and 40%. Below half health **every fire in the chamber goes out**: in the dark he is hard to hurt, and he walks to the braziers and breathes them out. Relight them to hurt him.
- At his bier you decide the **Crown of Orm**: return it (the barrow is sealed and the dead mostly stop walking), sell it to Vane (200 crowns, Fernhollow turns cold), or keep it (Orm's circlet: stronger at night, more stress).
- Side stories: *Smoke on the Heath* (free Gorse Smeath from the grave-lights at the Ring of Nine), *Old Grandmother* (land a Hallow pike for Old Osric), *The Drowned Road* (what Liss Teague's betrothed left on the causeway post).

**New enemies, with their own animation**
- **Barrow wights** claw their way up out of the ground, lurch on a dragging leg, and chop two-handed. Their blows bring *grave-chill* (stamina and comfort drain). Fire hurts them most; frost hardly at all.
- **Grave-lights** float and weave toward you, swell, and burst. A burst light is gone with no reward: shoot it first (Spark does double).
- At night the Downs fill with them, and the drowned walk the marsh; at dawn they sink back into the ground. What walks depends on what became of the crown.

**Items and activities**: lake perch and Hallow pike (fish from the jetty or the marsh boardwalk), heather and bilberries to gather, fried perch, pike pie, bilberry cake (*Night eyes*: see further at night) and heather tea (*Grounded*: no grave-chill); the rowan-sprig charm, the hag stone and Orm's circlet; barrow gold (Vane pays best, the warden disapproves); fen waders (wade the ford and the marsh at full speed). New traders: Ebba Rook's smokehouse, Gammer Thrush, Tobin Crake's smithy and gun bench, Marra Quill's slipway, the Smeaths' stores, and Vane. A Fernhollow faction, its own notice post with Westmarch contracts and a bounty every third day.

**Accessibility**: a *Camera motion* setting (full, reduced, none: head bob, shake and recoil kick) and *Run: press to toggle*.

**Fixes and technology**
- **Every character and animal is now one skinned mesh** instead of ~24 separate parts (ADR-017). The bench had
  measured up to 828 draw calls in Ashford's market; the worst view anywhere outdoors is now 371, inside the 400
  budget. The animation is unchanged: the same joints drive the new skins.
- Lamp glass and lit windows share materials and are batched with the town; farm animals beyond the fog are no
  longer drawn.
- The last two mid-game shader compiles are gone: the first-person muzzle-flash light no longer changes the light
  count, and the shadow programs for every enemy, boss and instanced caster are compiled at load (ADR-018).
- Static batching now also merges wholly static groups (stalls, huts, hulls, barrows), not only loose meshes.
- Two river fishing spots faced away from the water; they now face it.
- Firebolts that hit the floor now report where they landed (used for lighting braziers).
- New budget check `dev/bench8.cjs` (CPU, draw calls at 8 headings, shader programs) and the workflow document set (`docs/WORKFLOW.md`, `docs/gdd/`, `docs/TDD.md`, `docs/ADR.md`, `docs/ART_BIBLE.md`, `docs/UX_ACCESSIBILITY.md`, `docs/PROVENANCE.md`, `docs/qa/`).

**Verified**: 86 rules tests; the new Westmarch browser suite (40 checks, `scripts/smoke5.cjs`); every earlier browser suite; the NPC route check; screenshots and the budget run in `docs/qa/evidence/v0.8/`.
**Not verified**: real-GPU smoothness, balance by real play (King Orm's numbers especially), audio.

## v0.7 — 21 Nov 2026 — Animation feel and the Eastern Reach
Waiz asked for better-looking, better-feeling animation and for the world to grow: more areas, a second town, more people, more items and more places to go. Everything below was built and tested in this pass.

**Animation: look and feel**
- New blending: clips are followed exactly while they play, so walk and run cycles keep their full swing and timing (the old system smoothed every joint, which made all motion floaty). When the animation changes, the old pose blends into the new one with a critically damped spring ("inertial blending"), so changes are smooth without lag.
- Gait rebuilt: the stride is driven by distance covered, so feet no longer slide. Knees bend in the swing and take the weight at contact, ankles roll heel to toe (new foot joints), hips sway and drop, the chest counter-rotates and the head stays level.
- Strafing and walking backwards turn the hips toward the movement; holstered, the character faces the way you walk; a shuffle when you turn on the spot; separate rising and falling poses in a jump; a landing dip with the legs bending to keep the feet planted.
- Body lean into acceleration and turns, hit flinches that rock the body and settle, a death fall that buckles at the knees before dropping, head look-at (townsfolk turn their heads toward you as you pass), and capes that trail when moving.
- Fourteen new clips for townsfolk: looking around, stretching, scratching, folded arms, pointing, sweeping, stirring, fishing, chopping, mining, shovelling, lute playing, guard stance, sitting on the ground, drinking at a table, bowing, cheering. People fidget between tasks, carry the tool for their work, and walk around buildings instead of through them.
- Beasts: a real gallop with the spine flexing and paws keeping pace with the ground, sniffing and ear twitches at rest, a crouched wind-up, a lunging bite, and kicking legs when they fall.
- First person: a figure-eight bob in step with your feet, a weapon that trails your view and overshoots, a sprint carry, a landing dip, recoil and camera kick on springs, raising and lowering the weapon when you switch or holster, a revolver reload that swings the cylinder out, ejects six brass cases and loads round by round, an idle fidget that spins the cylinder, and a hit shake on the camera. The field of view widens a little at a sprint.

**The Eastern Reach (new region)**
- Millbrook has a new East Gate. The East Road leads past **Brookfield** (the Varley farm, with fields, an orchard, sheep, hens and cows that wander and look at you), **Thornwood** (a dense forest with a woodcutters' clearing and the ancient Hollow Oak), the **toll tower** (an Ash Road bandit fort), the **River Wend** (a stone bridge and a shallow ford you can wade) to **Ashford**.
- **Ashford**, a walled river-market town: the Reeve's Hall, the Drowned Lantern inn (meals, ale, a bed for the night), the Wardens' Lodge (its own notice board and stores), Mother Ilse's apothecary, Hale & Daughter gunsmiths, Tamsin Reed's charm shop, a bathhouse, a shrine of the Quiet Flame, a market square with a fountain, and docks with boats and a fish stall.
- **Copper Hollow**, a mine up the hill road north of Ashford: the old workings, a lift cage down to the deep gallery lit by veins of ward-copper, and the Wardwrights' Vault.
- **22 new people** with daily routes, voices and services, including a pedlar who walks the East Road between the towns every day.
- The map has a second sheet for the Reach; places you find can be walked back to; a coach runs between Millbrook's East Gate and Ashford (6 crowns).

**New story: Copper and Silence**
- *The Road East*: carry Sergeant Vole's dispatch to the Reeve of Ashford.
- *Copper and Silence*: find out why the mine went quiet. Bring Tam Ferrow an eel pie for the lift key, go down, read Foreman Brask's journal, and face **the Warden Engine**, a stone-and-copper guardian. Its front is armoured; the rune-core in its back is not. It slams (jump the ring), charges in a straight line (step aside and let it hit a pillar, which stuns it) and pushes back anyone who hugs it. Spark locks its joints. Then decide the fate of the ward-copper seam: seal it, open it to Ashford's guild (150 crowns) or send its heart to Aldric Voss (80 crowns off the debt).
- Side stories: *Brask's Last Page*, *Wolves at the Fold* (a night defence of Hobb Varley's sheep), *Bluebell* (find Nell's lost ewe and lead her home), *The Toll* (break the bandit fort and decode their ledger, which points back to Millbrook).

**New enemies**: Thornwood wolves (circle, then dart in), tusker boars (paw the ground, then charge straight: step aside), Ash Road crossbowmen (keep their distance and fire bolts you can side-step), and the hollowed miners of Copper Hollow.

**New items and activities**
- **Lever carbine** (Hale & Daughter): eight rounds, 46 damage, steadier aim, slower to work; switch firearms from your pack. Its own first- and third-person models and animation.
- **Six charms** (wear one at a time): hare's foot (faster), iron nail (undead hit softer), owl feather (night mana), copper coil (cheaper Spark), salt locket (fewer wounds, no soaking), four-leaf clover (more loot, easier fishing).
- **Fishing** with a rod at the bridge, the ford, the Ashford pier or the reed pond: cast, wait, strike when the float dips. **Mining** copper with a pick (and sometimes ward-copper deep down). **Gathering** mushrooms, thornberries and windfall apples.
- New food and five new recipes with new effects (forager, stout, keen eye, fleet), salves and smelling salts, oilskin coat and hobnailed boots, wolf pelts, boar tusks, copper ore and more for selling. Each trader pays a quarter more for the goods they actually want.
- A new skill, Woodcraft, grows by gathering, fishing and mining. A new faction: Ashford.

**Technical**
- The world is split into 80-metre cells and each dungeon is its own group; whole areas you cannot see are skipped, and dungeons you are not in are never drawn.
- Static batching: inside each cell, meshes that share a material and never change are merged at load (927 meshes into 96). Draw calls in Ashford fell from about 590 to about 280 per frame.
- Townsfolk follow doorway waypoints between their stops, so Ashford's people leave and enter buildings through the doors. The Ashford pier is walkable.
- CPU cost per frame (simulation and animation, measured in the test browser): about 1 ms on average in Millbrook, Brookfield, Thornwood and Ashford.
- Save format 5; v0.6 saves load and gain the new fields.
- 70 rules tests (10 new). The v0.6 browser suites still pass (14 + 19 + 8 checks). New browser suite `scripts/smoke4.cjs`: 34 checks covering walking out of the East Gate, the gait, the whole new quest line, the mine and the Engine fight rules, fishing, mining, gathering, traders, the carbine in first and third person, charms, coach, inn, bath, the Lodge board, the wolves at the fold, Bluebell, the new townsfolk, the map and v5 saves.

**Not verified**
- Smoothness on a real graphics card (the test browser renders in software), and how the new areas run on low-end machines.
- Balance of the new region by real play.

## v0.6 — 15 Nov 2026 — Story, Pass 4 and a living world
Built in three stages (v0.4 story and progression, v0.5 Pass 4, v0.6 living world) and released together. See `docs/ROADMAP.md` for the audit that chose the features.

**Story**
- Main chain in five quests: A Roof and a Debt (tutorial), The Wardbreak (Old Mill), Ember and Echo (attune three cairns, learn Spark), The Sunken Chapel, Wardbreak Night (gate defence).
- Three ward-stones. Each one you recover goes to the Tower (debt relief), the Chapel (ward relit) or stays with you (the Ward-touched trait). Aldric's verdict and the ending depend on those choices.
- Ledger thread "Red Ink": three clean files open an audit of your aunt's account. Solve it and 120 crowns of repayments Tolan never posted come off the debt.
- Six endings with epilogue slides, then free play.
- Eight side quests: bakers' delivery, Maren's herbs, the missing cart, the lost lure, the ring, the tainted well, the coat, and elite bounties.
- 11 new townsfolk (17 in all) with daily routes, faction, condition-based lines and a gold marker when they have business with you.

**Pass 4**
- The Sunken Chapel: flooded nave you wade through, two sluice valves that drain it, crypt waystone checkpoint, sanctum.
- The Cinder Wraith, an adaptive boss: hit it the same way three times running (twice from phase 2) and it hardens against that kind of damage for 14 s and counters. Ten attacks over three phases.
- New enemies: Drowned Acolyte and Inferno Imp, each with their own resistances. Elite versions of every enemy.
- Wardbreak Night: three waves at the South Gate, with the Watch firing from the tower.
- Spark, a sixth spell: lightning that jumps between enemies, stronger in rain.

**Progression**
- Six skills that grow with use (marksman, spellcraft, vigor, ledger, medicine, cooking), four traumas and seven positive traits.
- Three difficulty levels. Gear from Dorran's forge (rifled barrel, speed loader, iron-shod staff, coat, satchel, lantern). Five home upgrades. Revolver condition, cleaning and misfires.
- Loot drops, selling, bounty tags.

**Living world**
- Enterable Gilded Tankard (meals, ale, rumours, dice), Chapel of the Quiet Flame (healing, blessing, trait cures), smithy.
- Weather (clear, overcast, rain, fog, storm) that changes light, fog, sound, wetness and spell power; daily events (market, pilgrims, raid warning, festival, tinker).
- Nine morning door events with choices.
- Map (M) with walking to places you have found, compass with quest markers, quest tracker, journal (J) with five tabs.
- Dodge roll (C), hand lantern (L), herb and moonpetal gathering, reading, meditating, waiting.
- Generative music in ten moods and rain and thunder, all made in the browser.
- Settings: master, effects and music volume, HUD size, every key rebindable.

**Technical**
- Six pooled lights serve every lamp, hearth and torch, so the light count never changes and shaders never recompile.
- Save format v4; v1–v3 saves migrate.
- 60 rules tests. Three browser scripts (`scripts/smoke.cjs`, `smoke2.cjs`, `smoke3.cjs`) with 41 checks, all passing.

**Fixed during the pass**
- The game failed to start in one build because the music variable was used before it was declared. Caught by the browser test.
- The chapel drain only advanced while frames were drawn. It now runs in the simulation step.
- A click on a dialog's backdrop could close a ledger shift without standing you up.
- "You badly need the privy" fired at the start of a new game.

**Not verified**
- Screen tearing and smoothness on a real graphics card, and how the music and rain sound. The test browser has no GPU and no speakers.
- The older `scripts/playtest.cjs` (33 checks, written for v0.3) has not been updated for the new menus.

## v0.3 — 11 Nov 2026 — Smoothness fixes, bathroom, living dialogue, magic economy, Pass 3
**Fixed (camera stutter, tearing, snap-back): root causes found and removed**
- HUD rebuilt its panels with innerHTML ten times a second. Each rebuild forced a page layout, and those spikes landed while the camera was turning. The HUD is now built once; updates change only text, bar widths and classes, and only when a value changes. Panels use CSS containment.
- Every HUD panel had `backdrop-filter: blur`. Because the 3D view behind it changes every frame, the browser re-blurred all of it on every frame. Removed.
- Snap-back: some Chrome builds report one huge mouse jump right after pointer lock or at the screen edge. Those deltas are now discarded, the first 120 ms after locking is ignored, and raw (unaccelerated) mouse input is requested where supported. Mouse movement is gathered and applied once per frame, so the camera, the body and your shots use the same aim.
- Frame timing: the frame step is now taken from the browser's display-synced timestamp. The old 0.05 s cap made the game run in slow motion below 20 fps and then catch up. There is still exactly one loop.
- Third-person camera: when something blocks it, it now pulls in instantly but returns smoothly, instead of jumping between distances. V blends between first and third person over about 0.2 s with no position jump.
- Shadows no longer crawl or shimmer as you move: the shadow box is snapped to whole shadow texels.
- Shader hitches: everything that is normally hidden (shower water, boss telegraphs, the boss, tracers, puffs) is compiled while the game loads.
- Enemies check line of sight 5 times a second instead of every frame. The camera code reuses its vectors instead of allocating new ones each frame.
- New **Settings** menu (Esc → Settings): resolution scale, shadows off/low/high, effects and clutter, view distance, field of view, frame cap, mouse sensitivity, invert Y, raw mouse, look smoothing. Saved per browser.
- **F3** turns on a performance overlay: fps, 1% low, average and worst frame time, spikes over 33 ms, and a frame-time graph.
- Note: tearing is controlled by the browser and the display (vsync). It can't be verified in the headless test browser, so please check it on your machine with F3 on.

**Changed**
- Bathroom: the wash basin is now inside the bathroom on the east wall, with a mirror and jug. A shower stands beside it behind a partition, with a rain tank, a curtain and falling water. The privy has moved to the back corner. Each fixture has its own spot to stand in.
- Basin: quick hands-and-face wash (3 min, +15 hygiene, or +25 with soap; doesn't use up soap). Shower: full wash (20 min, +55 hygiene, or +85 with soap, which it uses), plus comfort and less stress.
- Magic now has a physical cost. Every spell costs mana and calories: Firebolt 8 mana/25 kcal, Frost Shard 10/30, Stone Ward 14/45, Mend 22/70.
- Mana refills on its own, but each point uses 6 ml of water. Refill runs at 1.5× when well watered, slows when thirsty, and stops when severely dehydrated. Sleep refills mana only as far as your water allows.
- New spell, **Mend** (key 5): restores 28 health, half that when starving. It has a 6 s cooldown, makes you a little more tired, and does not close wounds (bandages and the new physician's kit do).
- All spell and economy numbers live in `src/sim/balance.ts`.

**Added**
- Dynamic dialogue (`src/sim/dialogue.ts`). Six NPCs, each in their own voice, react to:
  - a drawn revolver in town, wounds, low health, hunger, thirst, filth, exhaustion or a fresh wash;
  - a fight you've just had, late or due debt, faction standing, your ledger work, being fired, the Old Mill, and the time of day.
- They remember you: how often you've met, what they last said, the mill news, a drawn gun. Some conversations have consequences: Sera's one-time discount after the mill, Petch calming you, and a small standing loss if you talk to people with your gun out.
- A living-world feed under the compass (`src/sim/feed.ts`): survival, magic, combat, reputation, money, exploration and NPC reactions. Every line comes from real game state and goes through priorities and cooldowns. During the boss fight it stays quiet except for urgent lines.
- Old Mill dungeon, entered by a cellar hatch beside the ruined mill on the Mill Road. It has:
  - an entry hall, a grain store with a lever, a flooded corridor behind a gate, a wheel chamber with a checkpoint waystone, and the Patriarch's arena;
  - three notes that tell the story and hint at the fight, and three loot crates;
  - its own lighting (blue torchlight, close fog) and cold air that dries you out;
  - a warning if you go in hungry, thirsty, without bandages or low on rounds.
- Shade Patriarch: three phases with telegraphed attacks.
  - Phase 1: Grasp (a ring on the floor) and Call (summons shades).
  - Phase 2: Volley (a glowing wind-up, then five orbs) and Darkness (pools under you that burst and drain mana).
  - Phase 3: Wail (an expanding ring; hide behind a pillar).
  - Fire builds a stagger meter; a staggered Patriarch takes double damage. Dying sends you back to the waystone, and the boss resets.
  - Rewards: 60 crowns, the Patriarch's Ember, −15 Boss Attention, and more standing with Millbrook, the Chapel and the Tower. Afterwards the mill stays cleared, the town talks about it, and Tolan takes the Ember for 50 off the debt.
- Carrying weight: 18 kg capacity, with gear counted. Heavy loads slow stamina recovery a little at a time, overloaded means no running, and a crushing load means much slower movement and no picking up more. A pack bar on the HUD shows it.
- The home chest now stores items (saved with your game), with move-one, move-all and "store all ingredients" buttons.
- Cooking at the hearth from new ingredients sold at the market (flour, onions, salt fish, honey, Vale herbs). Each meal gives a timed effect:
  - Hunter's stew: Hearty, faster stamina, 4 h.
  - Herb tea: Clear head, faster mana refill, 3 h (still uses water).
  - Honey cakes: Sweet tooth, spells burn 25% fewer calories, 3 h.
  - Fish supper: Warm belly, fatigue builds 30% slower, 6 h.
  - You can have two effects at once. Eating the same meal again refreshes it; a third effect replaces the one closest to running out.
- Ledger case files at Brannic's desk, as an alternative to a shift:
  - Reconciliation: cash book against the strongbox count and Trust statement. Find the gap and post the correcting journals for a bank fee, a duplicated receipt, swapped digits or an unrecorded sale.
  - Invoice investigation: three-way match of purchase order, goods received note and invoice. Catch over-billing on quantity or price, duplicates and a forged vendor.
  - Every answer is worked out from the documents. Clean files pay more, lower Boss Attention and raise standing. Catching the forgery pleases the Watch.
- Physician's kit (market): closes the worst wound and restores 15 health.
- Save format v3. v0.1 and v0.2 saves are upgraded.
- 47 rules tests, including the five magic scenarios from the brief, and 33 browser checks.

## v0.2 — 11 Nov 2026 — Fixes from Waiz's playtest, plus pass 2
**Fixed**
- Saving: three manual save slots plus an autosave. Overwrite asks for a second click. Starting a new game no longer erases your saves; load any slot from the title screen or the pause menu. v0.1 saves load and are upgraded.
- Stutter: spell projectiles no longer add lights (each new light forced every shader to recompile mid-fight). Trees, grass and the palisade are drawn as instanced meshes (about 1,200 meshes became 9 draw calls; 374 draw calls in the Vale). Fewer point lights, lighter shadows, lower pixel ratio, shared effect geometry, shaders pre-compiled at load, HUD only rewrites panels that changed.

**Changed**
- Starting weapon is a six-shot revolver held in a two-handed grip in both views. 30 damage, 1.8 s reload with the cylinder swung out.
- H holsters or draws: revolver on the hip, staff across the back. Clicking while holstered draws.

**Added (pass 2)**
- Five factions (Millbrook folk, the Tower, the Chapel, the Watch, Ash Road). Standing changes shop prices (up to ±25%) and contract pay (up to ±50%), and drifts back toward neutral after 5 days without contact.
- Mercenary Maintenance prep on the contract board: Armour up (−25% damage), Pack field supplies (no extra drain while fighting), Scout the route (+15% pay).
- Recovery notices: take stolen goods from a guarded cairn and carry them back (no sprinting while carrying).
- Millbrook Trust savings at the Counting House: 3% a week, safe from collapse fees.
- Home improvement: feather mattress (full nights clear fatigue, +comfort, −stress).
- Conversations with townsfolk: chat, ask about the Vale, ask for advice, ask about work. Talking once a day raises their faction slightly.
- 8 new rules tests (28 total); browser playthrough now has 19 checks.

## v0.1 — 8 Nov 2026 — First playable slice
Built directly by Claude from the analysed source of Mercenary Maintenance v07, VEILWORK v4, Ledger & Ward v1, Tower & Sands v1.2 and Home Office Tycoon v5. No Z.ai passes.

**Added**
- Pure rules core (`src/sim`): 8 needs in MM units and rates, VEILWORK bands and stamina hysteresis, Tower & Sands mana formulas, MM worst-need check penalty, wounds that cap max health (Dust & Debt), weekly instalments on a 300-crown debt to Aldric Voss (Ledger & Ward), contract board with Sweep and Courier notices, ledger shift with real debit/credit postings (Home Office Tycoon) and Boss Attention (Ledger & Ward), save/load with validation.
- Procedural rigged humanoid and hound models with 22 animation clips: idle, walk, run, jump, reach, eat, drink, wash, sit, write, sleep, aim, shoot, reload, cast, staff idle, wind-up, swing, hit, die, float, cast orb, wave. Upper/lower body layering so you can walk while aiming or casting.
- First-person viewmodel with bob, sway, recoil, muzzle flash, reload, cast glow, melee swing, reach, eat and wash.
- Third-person over-the-shoulder camera with wall avoidance; V switches views. Roofs hide when you are indoors in third person.
- World: your house (bed, hearth, chair, cistern, wash basin, enclosed privy, medical table, chest), Millbrook square (well, contract board, market stall), the Counting House (ledger desk, Aldric's clerk), six other buildings, palisade and South Gate, and the Whispering Vale with three sites (Old Mill road, raider camp, Whisper Stones) and waystone cairns.
- Enemies: Hollow Hound (fast bite), Road Raider (club, telegraphed swing), Shade Caster (keeps distance, slow orbs). Burn and slow statuses from spells.
- Combat: carbine (8-round magazine, reload, spread worsened by bad needs and movement), Firebolt, Frost Shard, Stone Ward, melee strike with knockback.
- Six townsfolk with daily routes and lines: Bram, Sera, Brannic, Tolan, Sergeant Vole, Old Petch.
- Day/night lighting with lanterns, procedural sound effects and wind.
- Tests: 20 headless rules tests (`npm run test:sim`) and a browser playthrough with screenshots (`scripts/playtest.cjs`).

**Fixed during the pass**
- Sleeping or collapsing at exactly 07:00 woke you at 15:00 the same day (caught by tests).

## v0.9.2 Salt Gap Preview, 24 November 2026

Codex connected the Salt Gap and tidal wreck interactions. See HANDOVER-CLAUDE.md for the change inventory, scope and outstanding acceptance checks. Build and 97 rules checks passed. Browser verification is pending.
