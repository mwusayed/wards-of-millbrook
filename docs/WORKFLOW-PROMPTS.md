# Production prompts for Claude

Use a single prompt per pass. Read HANDOVER-CLAUDE.md first. Each prompt names the output needed to review the work.

## Research

Working on Wards of Millbrook, identify the decision facing Waiz. Compare relevant precedents and engine documentation. Record sources, dates, conflicting findings and the cheapest experiment that could change the decision.

## Concept and scope

Working on Wards of Millbrook, describe the player choice, expected feeling, dependencies and exclusions. Produce a one-page brief with a playable success condition.

## Prototype and vertical slice

Working on Wards of Millbrook, build the smallest route from the title screen to the intended payoff. Capture where a new player hesitates and what the game communicates.

## Specification

Working on Wards of Millbrook, update the relevant GDD before coding. Document fantasy, rules, formulas, edge cases, dependencies, tuning and observable acceptance criteria.

## Technical planning

Working on Wards of Millbrook, trace the state, render, UI and save paths. Record any durable architecture decision and identify the performance budget affected.

## Rules and persistence

Working on Wards of Millbrook, implement pure rules under src/sim. Exercise success, rejection, repeated interactions and old saves. Record the exact test output.

## World and art

Working on Wards of Millbrook, build the location in procedural geometry. Check collision, readable landmarks, lighting and batching. Capture day and night views from normal player height.

## Narrative and economy

Working on Wards of Millbrook, trace each quest from discovery through reward and aftermath. Check prerequisites, duplicate rewards, dialogue and faction consequences.

## Animation and audio

Working on Wards of Millbrook, stage the action in both camera modes. Inspect contact, timing, sound cues and camera motion with accessibility settings at minimum. Record what was heard by a person.

## UI and accessibility

Working on Wards of Millbrook, connect each control through the normal input path. Check keyboard access, readable feedback, escaping menus, save/load and motion settings.

## Integration

Working on Wards of Millbrook, wire interactions into the live loop. Trace the same action on foot, after fast travel and after reloading. Document where time pauses.

## Code review

Working on Wards of Millbrook, review the diff for state ownership, repeated side effects, invalid saves, unbounded per-frame work and code outside scope. Cite exact files and propose small fixes.

## QA and triage

Working on Wards of Millbrook, run rules then one browser suite at a time. Capture repro steps, expected and actual results, severity, logs and screenshots. Re-run affected cases after fixing.

## Performance

Working on Wards of Millbrook, benchmark worst headings at new locations against docs/TDD.md. Separate CPU, draw calls and shader counts. Request real-device evidence for frame pacing.

## Human playtest

Working on Wards of Millbrook, give Waiz a goal without revealing the route. Record where orientation, controls, balance or story lose him. Turn observations into ranked changes for review.

## Release and packaging

Working on Wards of Millbrook, build from the lockfile, serve the packaged HTML, exercise a previous save, update release notes and evidence, and deliver the full source ZIP. Record unresolved checks and release status.

## Operations and handoff

Working on Wards of Millbrook, triage incoming reports by player impact, reproduce on the tagged build, patch and regress. Update provenance, status and the next Claude prompt with remaining work.

## Production coordination

Working on Wards of Millbrook, map dependencies, owners, input documents and acceptance evidence for each work item. Sequence work with shared files or browser sessions. Ask Waiz to decide changes to the game vision.

## Localization

Working on Wards of Millbrook, inventory new player-facing strings, preserve proper names, check text expansion in panels and report missing coverage.

## CI and automation

Working on Wards of Millbrook, create reproducible build and packaging steps. Fail on test failures and archive raw outputs. Run browser jobs sequentially and keep credentials outside the project.
