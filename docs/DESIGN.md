# Wards of Millbrook — Design (working title)

Version 0.3 · 11 Nov 2026 · Owner: Waiz · Builder: Claude (direct code, no Z.ai)

## 1. The game in one paragraph
You are a hedge-mage and sell-sword living alone in a small stone house at the edge of Millbrook, owing 300 crowns to the Tower. Your body is the difficulty slider: you eat, drink, sleep, wash and use the privy, and every need you neglect makes you weaker at work and in a fight. You earn two ways: honest shifts at the Counting House posting the town's ledger (real bookkeeping), or contracts from the board that send you into the Whispering Vale to fight with a carbine, a staff and spells. You come home hurt, treat your wounds, pay what you owe, and do it again until the debt is gone — or it buries you.

## 2. Pillars
1. **Body as difficulty** (Mercenary Maintenance). Eight needs in real units; neglect has concrete costs; no single need kills you outright.
2. **Home is a place, not a menu** (VEILWORK, Tower & Sands). Every recovery action is a physical station you walk to and use, with an animation.
3. **Two honest ways to pay the debt** (Ledger & Ward, Home Office Tycoon). Safe work that is real bookkeeping, or dangerous work that is real combat.
4. **Combat you can read** (VEILWORK, Archmage). First- or third-person; every action has a clear animation and telegraph.
5. **Consequences persist** (Dust & Debt, MM). Wounds outlast health, missed payments add stress, mistakes at work raise Boss Attention.

## 3. Core loops
- **Moment:** move, aim, cast, shoot, dodge, interact.
- **Day:** wake → eat/drink/wash/privy → shift or contract → return → treat, rest, sleep.
- **Week:** a debt instalment is due every 7 days; rent of the body is paid in food and sleep.
- **Campaign:** clear the 300-crown debt (win), or miss two instalments (Debt Called) or break down (Collapse).

## 4. Where every system comes from
| System | Donor | Source file | Notes |
|---|---|---|---|
| 8 needs, units, decay, thresholds | MM v07 | src/lib/game/balance.ts | Same units: kcal, ml, % and points |
| Check penalties from needs | MM v07 | balance.ts `NEED_MODIFIERS`, `computeCheckSuccess` | Worst single penalty applies |
| Needs → mana | Tower & Sands v1.2 | page.tsx §3 | Max mana × (1 + 2·fullness), regen × (1 + hydration) |
| Bands optimal/strained/critical, stamina hysteresis, sleep at 0.35× | VEILWORK v4 | src/game/core/config.ts | Exhaust at 0, resume at 25% |
| First-person guns, viewmodel, recoil, reload | VEILWORK v4 | src/lib/fps/weapon.ts | Rebuilt with new models |
| Spells and element feel | Archmage / LW | data/spells.ts | Firebolt, Frost Shard, Stone Ward in v0.1 |
| Enemy telegraph → strike → recover | Tower & Sands, Archmage | page.tsx §7, data/enemies.ts | |
| Millbrook, Vale, NPC names, creditor | Ledger & Ward v1 | data/world.ts, npcs.ts, economy.ts | Debt owed to Aldric Voss |
| Boss Attention | Ledger & Ward v1 | economy.ts `bossAttentionDelta` | +5 per error, +8 if filthy, +8 visibly injured |
| Ledger shift (real journals) | Home Office Tycoon v5 | game-store.ts posting rules | Debit/credit choice per source document |
| Contracts and prep | MM v07 / LW | jobs.ts, economy.ts | Sweep, Courier in v0.1 |
| Wound separate from HP | Dust & Debt | index.html | Wounds cap max HP until treated |
| Text variety | MM v07 | logVariants.ts | Rewritten for Millbrook |
| State-driven NPC lines and feed with cooldowns | MM v07 | dialogue and log variants | sim/dialogue.ts, sim/feed.ts |
| Three-way match, reconciliation | HOT v5 | investigations | sim/cases.ts |
| Magic costs calories, regen drinks water | Waiz's v0.3 brief | — | balance.ts SPELLS, manaRegenFactor |
| Deterministic, tested sim | HOT v5 | src/sim/core | Pure TS sim, headless tests |

## 5. Architecture
- `src/sim/*` — pure TypeScript game rules. No Three.js, no DOM. Everything that matters (needs, money, contracts, ledger, checks, saves) lives here and is tested headlessly.
- `src/render/*` — Three.js presentation: world, procedural rigged models, animation, camera, combat feel.
- `src/ui/*` — DOM HUD and dialogs.
- One authoritative state. Switching first/third person changes only the camera and which body is drawn.

## 6. Pass plan
- **Pass 1 (this build):** home with 7 stations, Millbrook square, Counting House, market, contract board, debt clerk, the Vale with three enemy types; first/third-person with animated models; needs, wounds, mana, stamina; carbine, staff, three spells, melee; ledger shift; Sweep contracts; weekly instalments; save/load; sound effects.
- **Pass 2 (done, v0.2):** Recovery contracts and prep; conversations; five factions with drift; Millbrook Trust savings; feather-bed upgrade; revolver, holster, save slots, performance.
- **Pass 3 (done, v0.3):** Old Mill dungeon and Shade Patriarch; inventory weight and storage chest; cooking with buffs; reconciliation and invoice cases; plus smoothness fixes, bathroom, dynamic dialogue and feed, healing and the calorie/water magic economy.
- **Pass 4 (done, v0.6):** Sunken Chapel; adaptive Cinder Wraith; gate defence; audit; six endings; settings and rebinding. Also added beyond the plan: skills and traits, weather, map, door events, side quests, music. Details in `docs/CHANGELOG.md` and `docs/ROADMAP.md`.
- **v0.7 (done):** animation overhaul (inertial blending, distance-synced gait, foot joints, lean, landing, look-at, flinch, fidgets, beast gallop, spring-driven first person) and the Eastern Reach (Brookfield, Thornwood, the toll, the River Wend, Ashford, Copper Hollow and the Warden Engine, 22 people, carbine, charms, fishing, mining).
- **v0.8 (done):** the Westmarch: the West Gate, the Heath Road, the Smeaths' charcoal camp, the Barrow Downs and the Ring of Nine, Fernhollow on Lake Hallow, the reed marsh, the Barrow of King Orm (brazier puzzle; a boss whose second phase puts the lights out), 15 people, barrow wights and grave-lights, five quests ending in the Crown of Orm, new food, charms, waders and a Fernhollow faction; built to `docs/WORKFLOW.md` with the spec in `docs/gdd/westmarch.md`.
- **Next:** balance from real play, merge static geometry per cell to cut draw calls, Aldric's Spire interior as the last dungeon, a horse or cart for the East Road.

## 7. Rules for every pass
1. Run `npm run test:sim` and `npm run playtest` before and after. A pass is done only when both are green.
2. Change one system per pass; list what must not change.
3. Update this file's pass plan and `docs/CHANGELOG.md`.
