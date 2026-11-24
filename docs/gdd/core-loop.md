# Core loop

## 1. Overview
A day in Millbrook (and now the Reach): keep your body working, earn crowns, pay Aldric Voss's debt on time,
and push the story forward. Body systems from Mercenary Maintenance, combat from VEILWORK, ledger work from
Home Office Tycoon, setting and debt from Ledger & Ward.

## 2. Player fantasy
A competent person barely keeping their life together in a hostile valley: every shot costs a round, every spell
costs dinner, and the debt clock never stops.

## 3. Detailed rules
1. Time runs at 1 game minute per real second (`GAME_MINUTES_PER_REAL_SECOND = 1`); a day starts at 07:00.
2. Needs drift every second (body-needs.md). Ignoring them reduces aim, spell power, stamina and finally collapses you.
3. Crowns come from: contracts (work.md), ledger shifts, selling loot, quest rewards.
4. The debt (300 crowns) is paid in weekly instalments of 60 (economy-debt.md). Two missed instalments end the game.
5. The story (quests-story.md) gives direction and big rewards, including debt relief.
6. Sleep ends the day; the board refreshes; weather and a daily event are rolled.

## 4. Formulas
- Real time → game time: `minutes += dt × GAME_MINUTES_PER_REAL_SECOND` (`src/sim/balance.ts`).
- Weekly instalment due: `nextDueDay` starts at 7 and steps by `WEEK_DAYS = 7`.

## 5. Edge cases
- Collapsing (fatigue 98, health 0) skips time, costs `COLLAPSE_FEE = 12` crowns (0 with the strongbox upgrade) and may add a trauma.
- Modals pause the simulation; the frame loop still animates.

## 6. Dependencies
Every other module. Reads `GameState` (`src/sim/state.ts`).

## 7. Tuning knobs
| Knob | Value | Range |
|---|---|---|
| `GAME_MINUTES_PER_REAL_SECOND` | 1 | 0.5–2 |
| `START_CROWNS` | 40 | 20–80 |
| `INSTALMENT` | 60 | 40–90 |

## 8. Acceptance criteria
- New game starts day 1 at 07:00 with debt 300 → test "new game starts day 1 at 07:00 with debt 300".
- A full main chain can be played to an ending → test "main chain can be played through to an ending".
