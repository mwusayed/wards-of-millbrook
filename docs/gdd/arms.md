# Arms, the pack and the title screen (v0.9)

## 1. Overview
Waiz asked for buying, guns, ammunition, weapons, an inventory system and a title screen. v0.9 gives the player four
firearms with different jobs, ammunition you choose, a gunsmith's armoury to buy them from, a grid pack, and a title
screen in front of the live world. (The Saltway Coast, drafted as v0.9 in `saltway.md`, moves to v1.0; its rules
and buildings are in the code, switched off by `FEATURES.coast`.)

## 2. Player fantasy
Choosing the right gun for the job: the revolver for everyday, the carbine for the road, the scattergun for things
that get close, the long rifle for things you would rather not let close. Loading silver before going under the hill.

## 3. Rules
| Gun | Damage | Mag | Reload | Cooldown | Aim (× base cone) | Range | Ammunition (per box) | Price |
|---|---|---|---|---|---|---|---|---|
| Service revolver | 30 (38 rifled) | 6 | 1.8 s (1.1 with loader) | 0.4 s | 1 | 120 m | revolver rounds ×6, or silvered ×6 | starting |
| Hale lever carbine | 46 | 8 | 2.4 s | 0.72 s | 0.6 | 120 m | carbine rounds ×8 | 150 |
| Breaker scattergun | 8 pellets × 12 | 2 | 2.2 s | 0.85 s | 3.5 | 26 m | shells ×6 | 120 |
| Spire long rifle | 88 | 5 | 3.0 s | 1.3 s | 0.25 | 160 m | long-rifle rounds ×5 | 240 |

- Each pellet is its own ray; hits on one target add up. Pellet damage falls off with distance (to 35% at 26 m).
- **Silvered cartridges** (18 crowns at Hale & Daughter, 16 at Tobin Crake): ×1.6 against the dead (wights,
  grave-lights, shades, the hollowed, the drowned). With "Load silvered rounds first" ticked in the pack, a reload
  takes a whole silver box into the cylinder; silver rounds fire first.
- Slot 1 holds the gun in hand; you take up any gun you own from the pack. The others are slung on your back.
- New guns are bought loaded and come with one box.

## 4. The pack (grid with weight)
Ten columns, six rows (eight with a satchel). Each kind of item is one tile with its count; big things take bigger
tiles (a medkit 2×1, a pickaxe 1×3, the ship's bell 2×2). Filters: all, arms, food, medicine, materials, quest. The
weight bar is the real limit (light, heavy, over, crushing as before); tiles that do not fit spill below the frame
with a warning. Picking a tile shows the item, its weight and its use. The arms column lists every gun you own with
loaded and spare rounds; worn gear and the charm are listed under it.

## 5. The armoury
Hale & Daughter in Ashford: a rack of the four guns with damage, rate, range, accuracy and capacity bars, ammunition
by the box or five boxes, the gunsmithing upgrades, and selling. Ammunition is also sold at the Wardens' Lodge
(shells) and by Tobin Crake in Fernhollow (shells, silver).

## 6. The title screen
The live world behind it: the camera circles Millbrook at late afternoon. On the left: the crest, the name, and
Continue (or New game), New game, Load game, Settings, How to play and Credits; a "New in" card on the right. The
game HUD is hidden until you start.

## 7. Edge cases
Old saves get the new fields (no guns, no silver). Switching guns while reloading cancels the reload. A fouled
revolver still misfires; the other guns do not foul.

## 8. Acceptance criteria
1. The title screen shows over a moving world and offers every menu entry; starting leaves it.
2. The pack is a grid with sized tiles, filters, a weight bar and an item detail with its use.
3. The armoury shows four guns with stats; guns and ammunition (×1, ×5) can be bought.
4. Each gun can be taken up, fires one round per shot and reloads from its own ammunition.
5. A close scattergun blast lands several pellets; silver loads and counts as silver.
6. v0.8 saves load; every earlier suite passes; budgets hold.
