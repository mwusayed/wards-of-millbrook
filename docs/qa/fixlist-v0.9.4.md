# Fix list: v0.9.4 (playtest bot pass)

Date: 2026-11-24. Built with `npm run build`; tested with `npx tsx tests/sim.test.ts` (105 pass) and the browser suites.

## Confirmed fixes

| # | Area | Problem | Fix | Evidence |
|---|------|---------|-----|----------|
| 1 | Movement | Nothing could be stood on above about 0.9 m. Platforms and ledges were walls, and the jump peaks at 0.88 m. | **Step-up:** ledges up to `STEP_UP` (0.6 m) are walked onto. **Mantle:** a jump beside a walkable top up to `WALK_TOP_MAX` (1.2 m) gets enough speed to land on it. Walkable tops are stood on at their height; walking off an edge starts a fall. `src/sim/climb.ts`, `collide()` in `src/render/world.ts`, and the movement/gravity block in `src/main.ts`. | Climb test: **42 of 42** ledges between 0.3 and 1.2 m reached (`bugwalk-run/climb.json`). Unit tests: 105 pass, including step, walkTop and mantle cases. |
| 2 | Boundaries | Old north and south edges were invisible 9 m colliders at z −130..−126 and z 150..154 (West Reach x −372..−64 and East Road x 64..312). They were not leftovers: the code added them on purpose as old map edges, and the hills beyond them are visual only (the player stays at height 0), so removing them outright would have let the player walk into hills. | Replaced each with a **visible 3 m drystone wall** on the same line and footprint (`west.ts`, `east.ts`). Collision matches the look now. | Screenshots facing north from both sides show the wall on the horizon (`check-run/*_facing_north.png`, deleted after review). |
| 3 | Scripts | `npm run playtest` pointed at `scripts/playtest.mjs`, which does not exist. | Points at `scripts/bugwalk.cjs`; added an `npm run bugwalk` script. | `package.json` |

| 4 | Menus | Close did nothing in some menus. The chest's Close button had no click handler: `openModal` wired Close before the chest rendered its contents, and every re-render (after a transfer) dropped it again. Also, long menus (map, inventory) pushed Close below the fold. | Close is now handled by delegation on the modal, so any `[data-close]` button works wherever and whenever it renders, and a guard stops double closes. The Close row is pinned to the bottom of long menus. (`openModal` in `src/main.ts`, `.modal > p:last-child` in `src/ui/hud.ts`.) | Journal, map, inventory, shop and chest all close with a real click, and the chest closes after a transfer (`openChest` now exposed to the test hooks). smoke4 34/34, smoke7 48/48. |

## Bot corrections (not game bugs)

These were false alarms caused by the bot. They are fixed in the bot so they won't come back.

- Wrong world handle: the bot read `G.W` (the barrow world) instead of `G.world`.
- Wrong jump probe: the jump test read the height at the wrong moment; now it records the peak.
- Synchronous sweep froze after a collapse: `busyCollapse` waits on a timed fade, which never fires during a synchronous loop. The bot now keeps needs at 50 and HP full during the sweep. This is why an early run reported 437 "stuck" points.
- Climb approach facing: two sides faced away from the ledge. Fixed.
- Climb timing: the bot read the height at the end of the walk, after the player had walked off the far side. It now records the peak.
- Visual bot: a death fade was flagged as a black frame. The bot now clears enemies before each shot.

## Verified clean

- Ground sweep, 1,184 sampled points: 0 stuck, 0 falls, 0 console errors.
- Static audit: 0 NaN geometry, 0 missing materials, 0 unloaded textures.
- Visual pass, 14 landmarks × 5 angles (70 frames): 0 objective defects (no magenta fallback, no unexpected black or blank frames, lighting consistent across angles).
- Regression: smoke7 48/48, smoke 14/14, smoke2 19/19, smoke4 34/34.

## Open (decisions or follow-ups)

1. **East edge at x 308..312** is still an invisible 9 m collider (`east.ts`). Needs the same treatment as fix 2 if it is not meant as a boundary.
2. **Lake walls** (`west.ts`, x −380..LAKE_X) are invisible barriers over open water. They are probably fine as water-edge collision, but they should be made visible or justified.
3. **One unconfirmed stuck point** at (−144, 44) in the March zone: moved 0.4 m, not a full stop. Needs a look in play.
4. **Sweep renderer crash** seen once at about point 330 in a long sweep, not reproduced after the chunked rewrite. Recorded as a bot-side issue, unresolved. If it recurs in normal play it is a real bug.
5. **Visual judgement** is still a person's call. The bot checks only objective signals (magenta, black, blank, lighting consistency).
