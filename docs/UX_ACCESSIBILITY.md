# UX and accessibility requirements

Project-wide requirements, then per-screen notes. Status: **met**, **partial** or **not yet**.

## 1. Requirements

| # | Requirement | Status | Where |
|---|---|---|---|
| A1 | Every action can be rebound; bindings saved per browser | met | Settings → Controls (`render/settings.ts`) |
| A2 | HUD text size adjustable (0.85–1.3×) | met | Settings → HUD scale |
| A3 | Mouse sensitivity, invert Y, raw input, smoothing, field of view | met | Settings |
| A4 | Separate master, effects and music volumes | met | Settings |
| A5 | Colour is never the only signal: needs bars carry labels, feed lines carry words | met | `ui/hud.ts` |
| A6 | The game pauses whenever a window is open | met | `hud.modalOpen` stops `update` |
| A7 | Option to reduce camera motion (head bob, shake, recoil kick) | met in v0.8 | Settings → Camera motion |
| A8 | Option to toggle run instead of holding it | met in v0.8 | Settings → Run: hold / toggle |
| A9 | Frame-rate cap (30/60) and a frame monitor (F3) | met | Settings |
| A10 | Graphics scale down for weak machines (resolution, shadows, effects, view distance) | met | Settings |
| A11 | Readable contrast: light text on dark panels, at least 4.5:1 | met | HUD and panel styles |
| A12 | No flashing faster than 3 times a second | partial | Lightning and the Engine's sparks flash briefly; reduced by A7 |
| A13 | Gamepad support | not yet | — |
| A14 | Subtitles | n/a | No voiced lines; all speech is written |

## 2. Screens

| Screen | Purpose | Notes |
|---|---|---|
| Title | New game (three difficulties), continue, load slot, settings | Version shown under the title |
| HUD | Needs, money, debt, time and weather, compass with markers, slot bar, prompts, the world feed | Scales with A2 |
| Pack (Tab) | Items, weights, eat and drink | Shows carry weight against the cap |
| Journal (J) | Quests, the ledger, skills, relationships | |
| Map (M) | Local and Reach sheets; walk to discovered places | Travel blocked in danger, with the reason shown |
| Dialogue | Conversation choices with the person's voice | Choices numbered for keyboard use |
| Traders, inn, coach, bard, seam | Reach windows (`ui/reach_ui.ts`) | Prices and what you own shown together |
| Pause (Esc) | Resume, save, load, settings, quit to title | Opens when pointer lock is lost |
| Settings | Graphics, sound, controls, camera | Applied without reloading |

## 3. Interaction rules

- One key (E) does every "use, talk, take"; the prompt names the thing and the action.
- Anything that costs money says the cost before you commit.
- Anything that cannot be done right now says why (closed, too heavy, not enough crowns, enemies near).
