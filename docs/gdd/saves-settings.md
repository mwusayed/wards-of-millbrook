# Saves and settings

## 1. Overview
An autosave every game hour and three manual slots that survive a new game (localStorage). Save format version 5.
Settings (graphics, sound, HUD size, key bindings) stored separately.

## 2. Player fantasy
Never lose an evening's play; old saves keep working after an update.

## 3. Detailed rules
1. `serialize` writes `{ s, extra }` (state plus position, view, slot, holster).
2. `deserialize` accepts versions 1–5 and migrates step by step, then forward-fills any field a newer build added.
3. Loading inside a dungeon restores that dungeon; outside, clears it.

## 4. Formulas
None.

## 5. Edge cases
- Corrupt JSON or non-finite needs → the save is rejected, not loaded half-way.

## 6. Dependencies
Every module that adds state must add its default to `NEW_V4()` (forward fill) and, if needed, a migration step.

## 7. Tuning knobs
Autosave interval (1 game hour), number of slots (3).

## 8. Acceptance criteria
- v0.1 → v5, v0.3 → v5, v0.6 (v4) → v5 migrations → tests "v0.1 saves migrate…", "v0.3 saves load into v4…", "v0.6 (v4) saves load into v5…".
- Saves are version 5 and keep the carbine and charm → browser check.
