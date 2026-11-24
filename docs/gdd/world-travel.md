# World, travel, weather and days

## 1. Overview
A flat walkable world built procedurally at load (`src/render/world.ts`, `east.ts`, `chapel.ts`, `mine.ts`):
Millbrook and the Whispering Vale in the west; the Eastern Reach (Brookfield, Thornwood, the toll tower, the
River Wend, Ashford, Copper Hollow) since v0.7. Dungeon interiors live far off the map and are entered by doors.

## 2. Player fantasy
A valley you learn on foot: landmarks, roads, the river you can only cross at the bridge or the ford.

**v0.8:** the Westmarch, west of Millbrook through the West Gate (x −42): the Heath Road, the Smeaths' clamp, the Barrow Downs, Fernhollow on Lake Hallow and the reed marsh, plus the Barrow of King Orm off the map at (−180, −330). See `westmarch.md`.

## 3. Detailed rules
1. Regions are named (`world.regionAt`) and announced when you enter them; places are discovered within 14–26 m.
2. The map (M) has two sheets (Millbrook & the Vale; the Eastern Reach) and lets you walk to discovered places;
   walking takes the real walking time and costs the same food and water.
3. The coach runs 07:00–20:00 between Millbrook's East Gate and Ashford's West Gate.
4. The river blocks movement except on the bridge, the ford (wading slows you) and the Ashford pier.
5. Each day rolls weather (clear, overcast, rain, fog, storm) and maybe an event (market, pilgrims, raid warning, festival, tinker).
6. The reed marsh slows you off the boardwalk like the ford; fen waders cancel both (`world.inMarsh`, `inFord`).
7. Rendering: the overworld is split into 80 m cells (x from −340 since v0.8); cells beyond fog distance + 25 m are hidden; each dungeon
   draws only when you are inside it. Static meshes are merged per cell at load.

## 4. Formulas
- Walk time = `max(2, round(distance / 4.2))` minutes. Coach = `COACH_MINUTES = 100`, `COACH_COST = 6`.
- Cell visible if `distance(player, cellBounds) < fogFar + 25`.
- Wet weather: comfort −5/h (storm −9 and stress +3/h) outdoors, unless oilskin or salt locket.

## 5. Edge cases
- No map travel while enemies chase you, during the gate defence, carrying a strongbox or leading Bluebell.
- Loading a save inside a dungeon restores the dungeon state; outside, it clears it.

## 6. Dependencies
Story (places as quest targets), enemies (site spawns), NPC routes, lights (pooled, zone per dungeon).

## 7. Tuning knobs
Cell size 80 m, discovery radii, walk speed 4.2 m/s, coach cost and time, weather table in `days.ts`.

## 8. Acceptance criteria
- Walk out through the East Gate → browser "walk east through the new East Gate".
- Arriving discovers Ashford and advances the quest → browser "arriving in Ashford is discovered…".
- Map has an Eastern Reach sheet → browser; evidence `30-map-reach.png`.
