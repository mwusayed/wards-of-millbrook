# The Saltway Coast (v0.9)

## 1. Overview
South of the Whisper Stones a rockfall has closed the **Salt Gap**, the gorge the salt carts used to climb. Blast
it open and the old **Saltway** runs down through rough grass and gorse, past a carter's shrine and the ruined
**Gull Tower**, to the sea: **Gullhaven**, a fishing port on a curved bay with a lighthouse on its headland; the
**tidal flats** where the wreck of the *Merry Wren* lies; and **Wreckers' Cove**, where a sea cave runs under the
cliffs to the lair of **the Wreck-Mother**. Built like the Westmarch: `render/south.ts` (region),
`render/seacave.ts` (dungeon and boss), `render/npcs_south.ts` (people), `sim/south.ts` (rules).

## 2. Player fantasy
Salt wind after the inland valleys. A busy little harbour where everyone knows the wrecks are no accident and
nobody will say so. Wading out at low tide for mussels, the lighthouse beam sweeping the bay at night, and
something enormous under the cliffs that eats ships.

## 3. Detailed rules
### 3.1 Geography (world coordinates; north is −z, the sea is to the south)
| Place | Where | Notes |
|---|---|---|
| The Salt Gap | x −6 to 10, z 136–172 | A gorge in the Vale's south edge. A rockfall at z 146 blocks it until blasted (sq1) |
| The Saltway | (2, 172) → (70, 318) | Rough grass and gorse; a milestone; Old Treloar's shrine at (20, 200) |
| The Gull Tower | (64, 246) | A ruined watchtower held by smugglers (site `gull_tower`) |
| Gullhaven | x 40–130, z 318–372 | Quay and boats, market, the Anchor and Gull inn, chandlery, customs house, net lofts, sea chapel, fish auction, cottages |
| The lighthouse | (152, 388), on a headland | The keeper's cottage beside it; the lamp sweeps the bay from dusk to dawn |
| Tidal flats | x −60 to 30, z 352–396 | Mussel beds and samphire; the wreck of the *Merry Wren* at (−22, 384); crabs |
| Wreckers' Cove | (−96, 372) | A smugglers' camp on the shingle and the sea-cave mouth (site `wreckers_cove`) |
| The Sea Cave | off-map, around (520, −340) | Dungeon: tunnel, the smugglers' store, the flooded grotto |

The coast is closed on the east and west by cliffs; the only way in is the gap. The off-map dungeon bands
(ADR-015) gain one: the Sea Cave is x ≥ 430, and the mine's band is capped at 250 ≤ x < 430.

### 3.2 People (12)
| Id | Who | Where | Role |
|---|---|---|---|
| bree | Harbourmaster Bree Calloway | harbour office, the quay | sq1 end, sq2 giver; the `coast` notice post |
| jowan | Jowan Penhale | the Anchor and Gull | innkeeper (meals, bed); sq3 |
| trewin | Keeper Amos Trewin | the lighthouse | accused of letting the lamp go out; sq5 |
| marrow | Collector Silas Marrow | the customs house | the Tower's man on the coast; sq2's last choice |
| morwenna | Morwenna Kitto | the fish auction | buys fish at a premium (×1.3) |
| nan | Nan Polgreen | the net lofts | mends nets on the quay; gossip |
| tegen | Tegen Rowse | the slipway | shipwright; sells sea boots |
| elowen | Sister Elowen | the sea chapel | sq4; blessing (clears stress) |
| jago | Captain Jago Vosper | the quay bench | retired; tells the wreck stories |
| pasco | Pasco Hendy | the chandlery | lamp oil, rope, the spyglass |
| lowdy | Lowdy Pengelly | the flats (low tide), cottages | mussel-picker; shows where the beds are |
| treloar | Old Treloar | the carter's shrine | the last salt carter; tells of the gap |

### 3.3 Enemies
- **Shore crab**: low, wide, armoured. Circles sideways at about 3 m, darts in to pinch, backs off. Bullets ×0.6,
  frost ×1.5. Packs of 2–4 on the flats and in the cave. Drops crab meat.
- **Smuggler**: cutlass fighter (raider rules). **Pistoleer**: keeps 10–16 m away, aims for 1.1 s (the muzzle
  glints), fires one flintlock ball (fast, 18 damage), reloads for 3 s. Both at the Gull Tower and the Cove.

### 3.4 The Sea Cave
Tunnel from the cove → the smugglers' store (crates of the *Merry Wren*'s own cargo; the second ledger) → the
grotto: a round sea cave, half-flooded, with three rock platforms and a pool where the sea comes in.

### 3.5 Boss: the Wreck-Mother
A crab the size of a cart. Her front is shell (hits from within 60° of her facing do ×0.3). When she rears up to
slam (1.1 s telegraph) her belly is open: any hit does ×1.8 until she lands. Attacks: claw sweep (120° arc, 4 m),
the rear-up slam (2.5 m circle in front), brine spray (cone, 8 m, slows for 2 s). She calls crabs from the walls
at 75% and 35%. **Phase 2 (below 50%)**: the tide comes in over 6 s: the grotto floor floods (wading, ×0.65 speed
unless wearing waders or sea boots) except the three platforms, and she charges between platforms.

### 3.6 Quests
| Id | Name | Kind | Giver | Outline |
|---|---|---|---|---|
| sq1 | The Salt Gap | main | Sera Vint | Buy a blasting charge from Dorran → set it at the rockfall → stand clear → walk the Saltway to Gullhaven → see the harbourmaster |
| sq2 | False Lights | main | Bree Calloway | Keeper Trewin is blamed for the *Merry Wren* → hear him out → the ship's log in the wreck (low tide) → the Gull Tower's red signal lanterns → the customs ledger → Wreckers' Cove → the Sea Cave → the Wreck-Mother → Collector Marrow: arrest, squeeze or let go |
| sq3 | Mussels and Samphire | side | Jowan Penhale | Bring 6 mussels and 4 samphire for the inn's kitchen |
| sq4 | The Merry Wren's Bell | side | Sister Elowen | Bring the ship's bell up from the wreck at low tide (heavy: carried at a walk) |
| sq5 | The Keeper's Oil | side | Keeper Trewin | Bring 2 lamp oil to the lighthouse |

### 3.7 Items, meals and gear
Mussels, samphire and crab meat (raw); **mussel broth** (warm belly), **crab cakes** (*Sea legs*: wading and the
tide slow you half as much, 3 h), **samphire salad** (clear head). **Shell charm** (sq4 reward: crab and drowned
damage ×0.8). **Spyglass** (gear: enemy names and health at twice the range; the map marks the next tide).
**Sea boots** (gear: wade at full speed, like waders). Quest items: blasting charge, the *Merry Wren*'s log,
a red signal lantern, the customs ledger, the ship's bell. A Gullhaven faction; a `coast` notice post with
contracts (sweeps of the Saltway, the flats and the cove, a courier to Millbrook, a bounty every third day).

### 3.8 Services and traders
The Anchor and Gull (meals, a bed: 12 cr), the chandlery (lamp oil, rope, spyglass), the fish auction (buys fish
×1.3), Tegen's slipway (sea boots), the sea chapel (Sister Elowen's blessing: −15 stress, once a day).

## 4. Formulas
- Tide level `tide(h) = cos(2π (h − 2) / 12)` for hour h: high water at 02:00 and 14:00, low at 08:00 and 20:00.
  The flats are **exposed** while `tide < −0.5` (about 06:00–10:00 and 18:00–22:00). The far mussel beds and the
  wreck can be reached only then; when the water comes back while you are out there, it carries you back to the
  shore (−10 stamina) with a warning 30 game minutes before.
- The blast: the charge burns 8 s after it is set. At the blast, within 6 m: 40 damage; 6–12 m: 15; beyond: none.
- Crab: hp 40, speed 4.8, reach 1.3, windup 0.4 s, damage 9. Smuggler as raider (hp 85). Pistoleer: hp 60,
  range 22 m, windup 1.1 s, damage 18, ball speed 42 m/s, reload 3 s.
- Wreck-Mother: hp 1300; sweep 22; slam 34; spray 10 + slow (×0.6 for 2 s); front ×0.3 (|angle| < 60°); belly
  ×1.8 during the rear-up; phase 2 below 650 hp; the flood takes 6 s; wading ×0.65.
- Prices: blasting charge 25, lamp oil 8 (existing), spyglass 70, sea boots 40, crab cakes 14, mussel broth 9,
  samphire salad 7. The fish auction pays ×1.3 for fish. Marrow's squeeze: +150 crowns, Gullhaven −15.
- Faction changes: sq1 Gullhaven +10, town +5; sq2 Gullhaven +20; arrest: Watch +10, Tower −10; squeeze:
  Gullhaven −15; let go: Tower +10, Gullhaven −20. sq3 +5, sq4 +5, sq5 +5.

## 5. Edge cases
- Standing next to the charge: the blast damage applies (it can kill: normal death and respawn rules).
- The gap is blocked by a collider until the flag `saltGapOpen`; the flag survives save and load and old saves
  get it unset.
- A save inside the Sea Cave restores into the cave (its x band); after the boss, the grotto stays calm.
- The flood (phase 2) resets if you die or leave; the boss heals to full and the grotto drains.
- The tide check runs on game time, so sleeping through it works; at the wreck when the water returns you are
  carried back, never drowned.
- sq2's ledger can be read before or after the tower; the cove needs both clues.
- The ship's bell is heavy: carrying it is like carrying a crate (walk only); dropping it is not possible.

## 6. Dependencies
World regions and batching (`world.ts`), the enemy manager (new kinds), the rig (crab, new clips), the map (a
`coast` sheet), saves (new flags, faction, items: forward fill, no version bump), the light pool (the lighthouse
lamp is an anchor), the travel list.

## 7. Tuning knobs
Tide period and threshold; blast radii; crab numbers per pack; pistoleer range; Wreck-Mother hp, armour angle and
multipliers; flood speed; prices. All in `sim/balance.ts` or `sim/south.ts`.

## 8. Acceptance criteria
1. The Salt Gap is blocked until the charge is set and blown; it stays open after save and load.
2. Walking the Saltway reaches Gullhaven and discovers it; the map has a coast sheet.
3. The tide follows the formula; the wreck can be reached only at low tide, and the returning water carries you back.
4. Crabs circle and dart; pistoleers keep their distance, aim and fire; smugglers fight as raiders.
5. The Wreck-Mother: front armour, belly window, sweep, slam, spray, crab calls, the flood at half health, defeat.
6. sq1–sq5 play through; Marrow can be arrested, squeezed or let go, with their faction effects.
7. New meals, gear, the charm, traders, the inn and the auction work.
8. v0.8 saves load with the new fields; every earlier suite still passes; budgets hold in the new places.

## 9. As built in v0.9.3 (24 Nov 2026)
Rules added or made precise while wiring the coast into the live game. All tested (rules: `tests/sim.test.ts`,
v0.9.3 block; browser: `scripts/smoke7.cjs`).
- **One charge, two ways to buy it.** Dorran's counter sells the charge (25 crowns) whenever none is held, set or
  spent. While The Salt Gap's own Dorran line is on offer, that line is the purchase and the counter button is
  hidden, so there is never a second button. A charge bought (or a gap blown) before Sera's offer counts: accepting
  sq1 afterwards skips the finished stages.
- **The fuse.** Setting the charge takes 1.6 s (kneel); the fuse is 8 s with sparks and a four-second call. A save
  made mid-fuse relights it from 8 s on load. The blast shakes the camera with distance and throws dust.
- **Wading on the flats.** The near flats (z 350–368) are waded (×0.65, sea boots or waders ×1, sea legs halfway)
  only while the water is over them (`tide ≥ −0.5`). At low water they are dry sand.
- **The tide warning** is given once per low water, to a player on the far flats, when 30 game minutes or less
  remain. When the water returns the player is put down at the shore edge (z ≈ 351, same x), −10 stamina, and the
  game saves.
- **Far mussel beds** (z > 366) can be picked only at low water; picked beds and samphire return the next morning.
- **Site groups** (from the morning the gap is open): the Saltway 2 smugglers; the Gull Tower a pistoleer and a
  smuggler; the flats 3 crabs; the cove 2 smugglers and a pistoleer.
- **Loot:** crab 70% crab meat; smuggler 75% coin (3–10) and 30% salt fish; pistoleer 70% coin (4–11) and 35% a box
  of cartridges. Deterministic per seed and kill count like every other kill.
- **The Sea Cave:** two smugglers and a pistoleer wake when you enter the store (until the Wreck-Mother is dead).
  The grotto floods in 6 s and drains in 3 s. Leaving or collapsing in the cave resets the fight (full health,
  drained, her crabs removed). A save in the cave restores into the cave.
- **The bell** is carried like a strongbox: no running, no walking the map, shown held against the chest.
- **People:** Lowdy is on the flats at low water and on the quay by day; Collector Marrow is gone from the
  customs house after an arrest; the shrine, milestone, keeper's log, tide board and the town pump all respond.
- **Map:** the coast sheet opens by default south of the gap; the wreck is marked (sand-coloured when it can be
  reached); the next low water shows once you own the spyglass or have read the harbour tide board.
