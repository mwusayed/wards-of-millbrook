# The Westmarch (v0.8)

## 1. Overview
Everything beyond Millbrook's sealed West Gate: the Heath Road, the charcoal burners' camp, the Barrow Downs with
the Ring of Nine and an antiquarian's dig, and Fernhollow, a lake village on Lake Hallow with a reed marsh to the
south. Underneath the great mound on the Downs: the Barrow of King Orm. Built like the Eastern Reach
(`render/west.ts`, `render/barrow.ts`, `render/npcs_west.ts`, `sim/west.ts`).

## 2. Player fantasy
Old country. A road over purple heath into low hills full of graves, where lights move at night and something
under the biggest mound is waking. A quiet village by a grey lake that has stopped catching fish. You are the
first person through the West Gate in nine years.

## 3. Detailed rules

### 3.1 Geography (world coordinates, north is −z)
| Place | Where | Notes |
|---|---|---|
| West Gate | x −42, z 1.5–7.5 | Barred until quest wq1 stage 2; two timber leaves swing open |
| Heath Road | x −64 → −250, along z ≈ 0–10 | Heather, gorse, a fallen milestone; wolves at `heath_road` (−128, 34) |
| Smeath's Clamp | (−104, −30) | Charcoal burners' camp in a birch copse: three smoking clamps, two huts, a fire |
| Barrow Downs | x −150 to −236, z −126 to −14 | Rolling ground; four long barrows; the Ring of Nine (−186, −66) |
| Vane's dig | (−166, −30) | The opened barrow, a tent, spoil heaps |
| King Orm's mound | (−200, −104), door at (−200, −90.5) | Round mound, stone facade |
| Fernhollow | x −300 to −238, z −18 to 56 | Green with a maypole, inn, longhouse, smithy, smokehouse, boatwright, cottages, jetty |
| Lake Hallow | west of x −300 | Water to the world edge; an island with a ruined tower (scenery) |
| Reed marsh | x −310 to −246, z 60 to 140 | Boardwalk causeway; the drowned walk it at night |

The West Gate is the only way in: the Vale's west edge stays closed. The new land is open from z −126 to 150.

### 3.2 People (15)
Fernhollow: Orla Hesk (headwoman), Davin Teague (innkeeper of the Heron and Reed), Liss Teague (his sister),
Cadoc Lowen (barrow-warden), Gammer Thrush (wise woman), Marra Quill (boatwright), Old Osric (pike fisher),
Ebba Rook (smokehouse), Tobin Crake (smith), Wynn Calder (shepherd). The Downs: Master Edwin Vane (antiquarian),
Sully (his digger). The camp: Gorse and Nettle Smeath. Millbrook: Watchman Odo Garth at the West Gate (after it opens).

### 3.3 Enemies
- **Barrow wight** — robed, bronze-helmed, slow. Rises out of the ground when it spawns (2 s) and sinks back at
  dawn. Lurching gait. Two-handed overhead chop. Each hit also brings *grave-chill*.
- **Grave-light** — a floating light that weaves toward you, swells, and bursts. Bursting kills it with no reward;
  shooting it first is the point.
- Night on the Downs (20:00–05:00): wights and grave-lights near the Ring of Nine and the opened barrow.
  Reed marsh at night: two drowned (until the crown is returned). The heath: two wolves, day and night.

### 3.4 The Barrow of King Orm (dungeon, off-map at (−180, 0, −330))
1. Entrance passage → antechamber (grave goods, two sleeping wights that rise as you come near).
2. Hall of Kings: six stone coffins; three wights rise when you reach the middle; **three unlit braziers**.
   Light all three (your lantern, or a Firebolt that lands within 1.6 m) and the inner slab sinks open.
3. Burial chamber: four lit braziers and the bier. **King Orm, the Barrow-King.**

### 3.5 Boss: King Orm
- Phase 1: *sweep* (wide arc in front; step back) and *cleave* (narrow and long; step aside). Grave-call at 70%
  and 40% health: two wights rise.
- Phase 2 (below 50%): the four braziers go out and the chamber goes dark except his crown and eyes. He is
  *shrouded*: he takes less damage the fewer braziers are lit. Every 26 s he snuffs the lit brazier nearest him.
  Relight braziers (lantern or Firebolt) to make him mortal again.
- On defeat he kneels and crumbles; the Crown of Orm stays on the bier.

### 3.6 Quests
| Id | Name | Kind | Giver | Outline |
|---|---|---|---|---|
| wq1 | The Sealed Gate | main | Old Petch | Renn's key → unbar the West Gate → walk to Fernhollow → meet Orla Hesk |
| wq2 | The King Under the Hill | main | (auto after wq1) | Cadoc → barrow-key from Vane (buy / persuade / threaten) → three heather for Gammer Thrush's rowan ward → enter the barrow → light the hall → defeat Orm → decide the crown → tell Hesk |
| wq3 | Smoke on the Heath | side | Nettle Smeath | Free Gorse from the grave-lights at the Ring of Nine after dark |
| wq4 | Old Grandmother | side | Old Osric | Land a Hallow pike from the jetty |
| wq5 | The Drowned Road | side | Liss Teague | Search the old causeway post in the reed marsh |

**The crown** (`decideCrown`): 1 = return it to the bier (the barrow is sealed; the dead mostly stop walking;
the drowned leave the marsh), 2 = sell it to Vane (200 crowns; Fernhollow turns cold; the Downs stay haunted),
3 = keep it (it becomes *Orm's circlet*, a charm; the Downs stay half-haunted).

### 3.7 Items, meals and gear
| Item | Kind | From | Use |
|---|---|---|---|
| Lake perch, Hallow pike | fish | Jetty, marsh boardwalk | Sell, cook |
| Heather sprigs | ingredient | Heath patches (regrow each morning) | Heather tea, the rowan ward |
| Bilberries | food | Downs bushes (regrow each morning) | Eat, bilberry cake |
| Fried perch, pike pie, bilberry cake, heather tea | meals | Cook at a hearth | Buffs below |
| Rowan-sprig charm, hag stone | charms | Gammer Thrush; Nettle (reward) | See formulas |
| Orm's circlet | charm | Keep the crown | See formulas |
| Barrow gold | loot | Wights, barrow crates | Sell (Vane pays most; Cadoc dislikes it) |
| Fen waders | gear | Marra Quill | Wade the ford and the marsh at full speed |

### 3.8 Services and traders
The Heron and Reed (bed, bar); the notice post (Westmarch contracts); Ebba Rook's smokehouse; Gammer Thrush;
Tobin Crake's smithy (and gun bench); Marra Quill's slipway; the Smeath fire (warm yourself, a few goods);
Vane (buys barrow gold).

## 4. Formulas
- Wight: `hp 150, speed 2.7, sight 20, reach 2.3, windup 0.9, dmg 22, recover 1.2` (`DEFS.wight`).
  Resist: bullet ×0.75, fire ×1.5, frost ×0.4, melee ×1.1 (`RESIST.wight`).
  Grave-chill per hit: stamina −18, comfort −3 (`B.GRAVE_CHILL`), none with the *Grounded* buff.
- Grave-light: `hp 26, speed 3.6, sight 24, reach 1.8, windup 0.7, dmg 16` (`DEFS.wisp`); burst radius 2.6 m
  (`WISP_BURST`). Resist: bullet ×0.7, fire ×0.5, frost ×1.3, spark ×2, melee ×1.3.
- Night spawns on the Downs (`west.nightSpawns(fate)`): no fate yet or sold → 2 wights + 3 lights; kept → 1 + 2;
  returned → 0 + 1. Marsh drowned: 2 until returned.
- King Orm: `hp 1100, speed 2.2, reach 3.6` (`ORM`); sweep 24 dmg (arc 100°, 3.8 m), cleave 32 dmg (width 1.6 m,
  5 m). Damage taken ×`0.35 + 0.1625·lit` in phase 2 (lit = 0–4), ×1.25 from fire, always. Snuff every 26 s.
- Meals: fried perch (perch, 15 min) +700 kcal *Fleet*; pike pie (pike + flour, 40 min) +1300 kcal *Stout*;
  bilberry cake (2 bilberries + flour, 25 min) +750 kcal *Night eyes*; heather tea (heather, 10 min) +60 kcal
  +400 ml *Grounded*.
- *Night eyes* (300 min): night ambient light +0.35 and fog pushed 35% further out at night.
  *Grounded* (240 min): no grave-chill.
- Charms: rowan sprig: wights and grave-lights hit 20% softer. Hag stone: stress builds 30% slower from 20:00 to
  05:00. Orm's circlet: +20% damage with everything from 20:00 to 05:00, stress builds 20% faster.
- Fishing on the lake: perch 65%, eel 25%, pike 10% (22% at dawn and dusk); marsh: eel 60%, perch 40%.
  Osric's spinners (wq4 reward): lake waits ×0.7.
- Prices: barrow gold sells for 12 (Vane pays ×1.7 = 20); waders 35; rowan sprig 36; hag stone 42; inn bed 3
  (free after wq5).

## 5. Edge cases
- The West Gate can only be unbarred with the key; once open it stays open (saved flag `westGateOpen`).
- The barrow door needs both the barrow-key and the rowan ward; without them it says which is missing.
- If you leave the barrow during the fight, Orm resets (full health, braziers relit).
- The crown decision is final; selling needs Vane alive and at his dig (he always is).
- A grave-light that bursts on you does not count as a kill for contracts, but does count as "gone" for wq3.
- Night spawns despawn (sink) at dawn even mid-fight.

## 6. Dependencies
World (regions, cells, colliders, map), enemies, NPC schedules, dialogue voices, story engine, contracts (new
board), economy (shops), saves (new items, flags, faction — forward filled), lights (zone `barrow`), music moods.

## 7. Tuning knobs
`DEFS.wight`, `DEFS.wisp`, `WISP_BURST`, `ORM`, snuff interval (26 s), shroud formula, night spawn counts,
`B.GRAVE_CHILL`, fish tables, meal values, shop prices in `B.SHOPS`, Vane's multiplier (1.7).

## 8. Acceptance criteria
| Criterion | Proof |
|---|---|
| West Gate opens only with Renn's key, and stays open after save/load | rules "wq1: the West Gate…"; browser "the West Gate opens…" |
| Walking west reaches Fernhollow and discovers it | browser "walk the West Road to Fernhollow"; evidence `03-fernhollow.png` |
| Vane gives the key three ways | rules "wq2: Vane's key: buy, persuade, threaten" |
| The rowan ward needs three heather | rules "wq2: Gammer Thrush's ward…" |
| Hall braziers open the inner door | browser "lighting three braziers opens the inner door" |
| Orm's shroud follows the lit braziers | rules "Orm's shroud…" |
| Orm can be beaten and the crown decided three ways | rules "decideCrown…"; browser "King Orm falls…" |
| Night spawns follow the crown's fate | rules "night spawns on the Downs…" |
| Wights rise and grave-lights burst | browser "a wight rises…", "a grave-light bursts…"; evidence `20-wight.png`, `21-gravelight.png` |
| New meals, charms, fish and services work | rules "Westmarch meals…", "Westmarch charms…", "lake fishing…" |
| v0.7 saves load into v0.8 with the new fields | rules "v0.7 saves load into v0.8…" |
| Budgets hold in the new places | `bench.json` (TDD §9) |
