# Wards of Millbrook — gap audit and roadmap (13 Nov 2026)

Waiz's instruction: research what is missing, add everything worthwhile, make the game as feature-complete
as possible; story and mechanics at Claude's discretion. This file is the working plan and status log.

## 1. Audit: what the source games have that v0.3 does not
Source read: Ledger & Ward v1 (quests.ts, enemies.ts, npcs.ts, world.ts), Mercenary Maintenance v07
(types.ts, balance.ts, jobs.ts, logVariants.ts, store.ts), Archmage v4, Home Office Tycoon v5.

| Missing in v0.3 | Donor | Plan |
|---|---|---|
| Main quest chain "The Wardbreak" (Old Mill → Ember and Echo → Sunken Chapel → gate defence) | LW/ARCH quests.ts | Milestone 1–2 |
| Side quests (Baker's Delivery, Maren's Herbs, Cursed Well, Missing Cart, lost lure) | LW/ARCH | Milestone 3 |
| 12 more named townsfolk (Maren, Dorran, Tomlin, Renn, Lira Voss, Yara, Pip, Widow Cael…) | LW npcs.ts | Milestone 1 |
| Enterable Tankard, Chapel, smithy with services | LW buildings.ts | Milestone 1 |
| Sunken Chapel, Drowned Acolyte, Inferno Imp | LW world.ts, enemies.ts | Milestone 2 |
| Adaptive Cinder Wraith: 3 same-element hits → 50% resist + behaviour change | LW enemies.ts adaptiveTriggers | Milestone 2 |
| Endings and epilogue | — (new) | Milestone 2 |
| Loot tables, reagents, selling | LW items.ts | Milestone 1 |
| Traumas and positive traits from extreme events | MM balance.ts | Milestone 1 |
| Difficulty modes (standard / hardened) | MM | Milestone 1 |
| Home upgrades (many), hobbies and activities | MM | Milestone 3 |
| Hub events with choices | MM HubEvent | Milestone 3 |
| Contacts / relationships view | MM contacts.ts | Milestone 1 (journal People tab) |
| Skills that grow with use | MM 7-layer check (skills) | Milestone 1 |
| Map screen | LW MapUI | Milestone 3 |
| Key rebinding, volume | MM settings.ts | Milestone 1 |
| Music and ambience | (only VEILWORK had audio) | Milestone 3 |
| Weather | TAS | Milestone 3 |
| Boss health bar, target bar | — | Milestone 1 |

## 2. Story (fused from Ledger & Ward's Wardbreak and the debt)
- You inherited your aunt Ysolde's house and her 300-crown debt to Aldric Voss, Town Mage.
- Three ward-stones keep the Vale's dark out of Millbrook: the Ember (Old Mill), the Censer (Sunken Chapel)
  and the Keystone (Aldric's Spire). Two have gone dark; Aldric squeezes debtors to keep the third lit.
- Each stone you recover can go to the Tower (debt relief), the Chapel (ward relit, town safer) or be kept (power).
- Ledger thread "Red Ink": clean case files lead to the Voss Audit, which shows Tolan never posted
  your aunt's repayments. Real debit/credit work cuts the debt to its true balance.
- Finale: the Wardbreak night at the South Gate. Epilogue assembled from your choices; free play after.

## 3. Milestones
- [x] **M1 (v0.4) Story and progression**: light pool, rebinding, volume, difficulty, boss/target bars, skills,
      traits, loot + selling, quest engine, MQ0 tutorial, MQ1 Wardbreak with Ember choice, journal tabs,
      tavern/chapel/smithy interiors and services, 8 new NPCs.
- [x] **M2 (v0.5) Pass 4**: Sunken Chapel, Drowned Acolyte, Inferno Imp, Cinder Wraith (adaptive), Spark spell,
      MQ2–MQ4, gate defence, Voss audit, endings, free play.
- [x] **M3 (v0.6) Living world**: weather, daily events, door events, map + compass, fast travel, lantern,
      gathering, side quests, music, dodge, home activities and upgrades, bounties and elites.
- [x] Polish: tests and docs done. A balance pass by a human player is still needed.
- [x] **M4 (v0.7) The Eastern Reach**: animation overhaul, Ashford, Copper Hollow, the Warden Engine, 22 people.
- [ ] **M5 (v0.8) The Westmarch**: see the brief below and `docs/gdd/westmarch.md`.

## 3b. Brief — v0.8 "The Westmarch" (21 Nov 2026)
Waiz's request: keep adding similar content (areas, towns, NPCs, items, locations, animation), following the
new workflow.

**Goals**
- Open Millbrook's sealed West Gate through a quest, and add the land beyond it: the Heath Road, the charcoal
  burners' camp, the Barrow Downs with the Ring of Nine, an antiquarian's dig, and Fernhollow, a lake village on
  Lake Hallow with a reed marsh to the south.
- 15 new people with schedules, lines and conversation; a new faction (Fernhollow).
- Two new enemies with their own animation (the barrow wight, which rises from the ground and lurches; the
  grave-light, a floating light that weaves and bursts), night-time spawning on the Downs.
- A new dungeon, the Barrow of King Orm, with a brazier puzzle, and a new boss, the Barrow-King, whose second
  phase puts the lights out: relighting braziers is how you hurt him.
- Five quests (two main, three side) ending in a choice about the Barrow-King's crown.
- New items: two fish, heather and bilberries, four meals, two buffs, three charms, waders, barrow gold; new
  traders, an inn, a notice post with Westmarch contracts, a map sheet.
- Accessibility (UX A7, A8): a camera-motion setting and run toggle.
- Technology: static batching for whole static groups (draw calls in Brookfield and the Vale); `dev/bench8.cjs`
  budget check.

**Non-goals**: horses, new spells, gamepad, voiced lines, a second boat-travel system.

## 3d. Brief — v0.9 "Arms and the Title" (22 Nov 2026)
- **Ask** (Waiz): "Buying, guns, ammo, weapons, and inventory system, create a title screen." Chosen: title screen plus a full arms overhaul, grid pack with weight.
- **Scope**: `docs/gdd/arms.md`. The coast brief below moves to v1.0.

## 3c. Brief — v1.0 "The Saltway Coast" (drafted 22 Nov 2026 as v0.9)
- **Ask** (Waiz, standing): keep adding areas, towns, people, items, places and animation, at maximum effort, by the
  workflow.
- **Goal**: a fourth region with a different feel from the inland three: the sea. A port town, tides as a rule
  the player plans around, a boss built on armour and timing (where King Orm was built on light).
- **Scope**: the Salt Gap (blasted open), the Saltway, the Gull Tower, Gullhaven (12 people), the lighthouse, the
  tidal flats and the wreck, Wreckers' Cove, the Sea Cave and the Wreck-Mother; crabs, smugglers and pistoleers;
  five quests; new meals, gear and a charm; a coast map sheet and notice post. Spec: `docs/gdd/saltway.md`.
- **Animation**: a crab rig (tripod gait sideways, claw snaps), the boss's rear-up and slam, net-mending and
  rope-hauling townsfolk clips, gulls.
- **Out of scope**: sailing, swimming, horses (still task #31).
- **Done when**: `saltway.md` §8 is met with evidence in `docs/qa/evidence/v0.9/`, every earlier suite passes and
  the budgets hold.

## 4. Status log
- 13 Nov: audit done; baseline 46 rules tests green.

- 15 Nov 2026: M1, M2 and M3 finished and published as v0.6. 60 rules tests and 41 browser checks pass. Left open: real-GPU smoothness check, audio by ear, balance from real play, updating scripts/playtest.cjs.

- 21 Nov 2026 (v0.7): animation overhaul and the Eastern Reach (second town, mine dungeon, new boss, 22 people, carbine, charms, fishing, mining, six new quests). 70 rules tests and 34 new browser checks pass. Open: real-GPU smoothness, balance, merging static geometry.

- 22 Nov 2026 (v0.8): the Westmarch (Fernhollow, the Barrow Downs, the barrow and King Orm, 16 people, five quests,
  wights and grave-lights, lake fishing, charms, two accessibility settings). Every character and animal is now one
  skinned mesh (ADR-017), which brought every outdoor view inside the 400 draw-call budget; no shader compiles
  during play (ADR-018). 86 rules tests, 40 Westmarch browser checks and every earlier suite pass; evidence in
  `docs/qa/evidence/v0.8/`. Open: real-GPU smoothness, balance by real play, audio.

## v0.9.2 Salt Gap Preview, 24 November 2026

Codex connected the Salt Gap and tidal wreck interactions. See HANDOVER-CLAUDE.md for the change inventory, scope and outstanding acceptance checks. Build and 97 rules checks passed. Browser verification is pending.
