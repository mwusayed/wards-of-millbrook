# Wards of Millbrook | Claude adaptive AI prompt pack

## 0. Context and assumptions

Target the v0.9.2 Salt Gap Preview ZIP. Its title and handover identify the game version. The package manifest still reports 0.1.0. The stack is TypeScript 5.6.3, Three.js 0.170.0 and Vite 6.0.7. The prior pass recorded 97 passing rules tests and an unsuccessful Chromium launch. Establish fresh evidence on the implementation machine.

Assume desktop browser, local single-player, keyboard and mouse, and three manual save slots plus autosave. Assume no approved training corpus, external analytics service, console target, or pretrained checkpoint until P0 finds one. Proposed thresholds below are initial design decisions for owner approval. All proposed interfaces and artifact names are new unless explicitly identified as existing.

## 1. Executive brief for Claude

**Recommendation.** Build an optional practice and spectator mode. Watching the bot retreat when tired, seek cover or change tactics can teach the player how Millbrook works. Let the owner judge that value by observing whether players understand a decision and can immediately take over. Improving a score against the game’s own enemies is insufficient evidence of a better experience.

**Player contract.** Backslash opens an opt-in practice session starting from the current scene. Run it in an isolated copy of the campaign. Pausing freezes it. Taking control immediately restores manual input and the original campaign snapshot. Explain the return position before entry. The only information permitted to leave practice is an approved, bounded adaptation profile in its originating slot and optional local diagnostics. Never transfer loot, defeated enemies, debt relief, quest outcomes, cooldown advantages or time elapsed.

**Engineering contract.** Feed the player bot visible observations. A frozen policy proposes a legal game action, a governor checks it, and the same simulation command path used by the human executes it. A modest director may select approved adversary profiles at encounter boundaries using information visible in play. Offline training can change weights between reviewed releases. During play, a few quantized preferences may move within prescribed limits. Both actors use authored defaults whenever their policy is unavailable. Independent switches allow the owner to disable each layer.

**Release decision.** Keep experimental flags off by default. Ship only after replay, reward isolation, fairness, frame budgets, accessibility and rollback have evidence. The milestone excludes multiplayer, global learning, production model downloads and training on player devices. A working authored fallback is a useful development milestone. Label it accurately until a qualified offline model is supplied.

## 2. CLAUDE_MASTER_PROMPT.md

```text
Role: AAA gameplay and AI engineer accountable to game director Waiz.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Deliver the optional remappable Backslash mode in the supplied game. First audit, then execute only the authorized phase. Read src/main.ts, src/render/settings.ts, src/render/enemies.ts, src/sim/state.ts and docs/WORKFLOW.md. Preserve ordinary play and the existing Salt Gap preview scope. Put policy and adaptation rules in pure TypeScript. Keep scene and DOM dependencies at the boundary. Separate authority over input, rewards, time, save slots and perception from policy inference. Treat model outputs as untrusted data. All actions require legality checks at execution. Define deterministic fixed ticks and seeded decision streams; retain versioned replays. Use only vetted offline-trained weights, bounded per-slot adaptation, an independent governor and a deterministic utility fallback. Show a persistent HUD state, provide keyboard-accessible cancel, pause and takeover, and reset both adaptation profiles. Deny mode entry when session type is unknown or networked. Deny achievements, economic gains and deferred side effects during practice. Never auto-resume on load. Verify platform requirements only for declared targets and identify owner-only or restricted checks.
Deliverables: For each phase return a reviewable diff or audit, changed paths, commands, evidence paths, expected/actual results, known gaps, flag and rollback instructions, and a short continuation note usable in a fresh Claude chat.
Verification: Check each claimed behavior from its normal entry point and include a failure case. Compare the flags-off campaign with baseline. Record missing runtime or device evidence as BLOCKED. Rewrite vague criteria into stimulus, observable and threshold before implementation.
Definition of done and approval gate: A phase closes only when its evidence meets the agreed thresholds and Waiz accepts the result. Changes to progression semantics, data collection, model provenance or deployment targets require explicit approval.
```
## 3. Phase-gated prompts
### P0 — Repo audit and research

```text
Role: technical producer and AI researcher.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Inventory real call sites for keyboard and pointer-lock input, remapping, frame/update stepping, enemy perception/spawns, campaign mutation, achievements if present, local storage, save migration and test hooks. Trace one player action and one delayed kill reward end to end. Inspect src/sim/rng.ts (mulberry32, hashString), Math.random in src/render/enemies.ts, frame(ts), update(dt), saveTo and loadFrom in src/main.ts. Separate cosmetic randomness from gameplay randomness. Inspect docs/TDD.md, package-lock.json, scripts/smoke*.cjs and dev/bench8.cjs. Research two shipped adaptive systems from first-party talks or papers; distinguish authored pacing, online parameter changes and trained policies. Cite sources, dates, applicability and uncertainty. Check current official guidance for target browsers and any declared storefront. Price QA in runs and machine-hours: seeds × scenarios × profiles × builds × replay repetitions.
Deliverables: Path/symbol/evidence matrix, baseline build and test logs, CPU and bundle headroom by scene, privacy and storage threat model, training-data inventory, two feasible designs and an owner decision sheet.
Verification: Run npm ci, npm run build and npm run test:sim (node --import tsx tests/sim.test.ts if IPC blocks tsx). Serve dist and run browser suites sequentially. Identify whether __game.step covers all authoritative updates. List unsupported targets and missing evidence.
Definition of done and approval gate: Owner accepts practice-copy semantics, thresholds, target hardware and data rights. No implementation in P0.
```
### P1 — Deterministic core and simulation harness

```text
Role: simulation and replay engineer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Introduce a fixed authoritative tick (propose 60 Hz), stable entity IDs, deterministic iteration and separate RNG streams for gameplay and visuals. Capture the current RNG state or reconstruct from seed plus draw count. Move authoritative decisions out of render timing without changing ordinary game pace. Represent human and bot inputs as ordered tick commands. Include enemies, collision, timers, world time, delayed rewards and director queues in the headless harness. Replay header includes build, rules, schema, model digest, flags, start state, config and seed. Record external observations/events where unavoidable. Hash canonical state at intervals; compare decisions as well as resulting state.
Deliverables: Headless runner, golden fixtures with expected hashes, record/playback/first-divergence commands, migration and compatibility notes.
Verification: Run 3 seeds × 3 scenes (town, combat, tide) × 10,000 ticks twice under differing render schedules. Compare uninterrupted and checkpoint-restored runs. Change one input and prove the runner identifies the first differing tick. Test a mismatched model digest.
Definition of done and approval gate: Zero unexplained differences on declared deterministic targets. Reject incompatible replays explicitly; never bless a new golden without explaining the diff.
```
### P2 — Auto-play UX and input

```text
Role: gameplay UX and input engineer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Extend Action, ACTIONS, DEFAULT_BINDINGS and keyName in src/render/settings.ts. Default to KeyboardEvent.code Backslash; display the bound key and handle alternate layouts and conflicts. Add an accessible menu entry. In src/main.ts arbitrate human input before bot dispatch. Confirm entry with focus on Cancel, explain practice and return position. Provide an always visible text badge (active/paused/speed), keyboard and pointer takeover, pause, 0.5× and 1×. Ignore repeats or typing in editable fields. Pause on blur or pointer-lock loss. Give takeover priority even while paused or in a modal; flush queued bot input before the next tick. Isolate the full campaign snapshot including scene state or instantiate an independent practice world. Block manual and auto writes, rewards, delayed callbacks and external unlocks from practice. Return to exact entry state on exit/crash/reload, default manual mode.
Deliverables: State transition table, binding and HUD changes, practice session boundary, reward/write interception and accessibility walkthrough.
Verification: Use real keyboard and menu entry. Check confirm/cancel, remap/restart, rapid toggles, pause/speed, focus loss, load, takeover during combat and during a discarded delayed reward. Compare canonical campaign state and all campaign slot bytes before/after. Exercise rewards via trade, ledger, debt, quest, loot and XP. Freeze campaign time.
Definition of done and approval gate: No bot command executes after takeover, no progression delta, keyboard-only exit and visible state at every active speed. Owner accepts the return-to-entry behavior.
```
### P3 — Offline-trained player policy

```text
Role: offline ML and gameplay integration engineer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Propose a pure interface decide(observation, legalActions, tick, rngState) returning action ID and bounded arguments. Document observation units, quantization, masks and tie-breaking. Give the bot only sight, audible cues, known inventory and usable controls. Train offline on licensed or seeded synthetic demonstrations, split by scenario/seed, retain recipe and held-out results. Start with a small exported deterministic model, e.g. a fitted shallow classification tree. Validate feature order, schema, hash, dimensions, finite values and action IDs before loading the bundled immutable checkpoint. Reject executable model content. Use a deterministic utility selector for idle, move, recover, retreat or engage; both policies pass through the same governor. No DOM event synthesis, test hooks, direct state mutation or inference-time network.
Deliverables: Offline recipe, model manifest/card and digest, adapter, fallback, evaluation report versus fallback, inference cost and rollback switch.
Verification: Run held-out routes and compare legal-action rate, success, idle loops, inference cost and repeatability. Inject missing, oversized, invalid, non-finite and wrong-version models; each must select fallback before the next action. Replay both paths.
Definition of done and approval gate: Ship a trained model only with reproducible provenance, owner-agreed quality threshold and budget headroom. If unavailable, deliver fallback marked fallback-only and leave trained-policy gate blocked.
```
### P4 — Bounded online adaptation

```text
Role: player modeling engineer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Implement a rule-based estimator from completed encounter summaries. Allow only aggression, preferred range, flank frequency, resource caution and ability usage. Use integer levels 0–100, default 50, hard interval 35–65. Proposed update: after three valid samples, at most once per 600 simulated ticks and once per completed encounter, add sign(observed target minus current preference), limited to one level. Define the observation, units, threshold and neutral band for each knob. Short/invalid samples do nothing. Never update from pause, menus or absent observations. Persist only versioned, bounded values, counters and cooldown in the originating slot via a dedicated adaptation record. Disable adaptation separately from auto-play. Reset parameters, counters and pending samples together.
Deliverables: Typed allowlist, formulas and fixtures, slot identity and reset spec, current-profile viewer with plain-language rationale.
Verification: Drive 1,000 extreme samples, alternating samples and missing data; assert limits, cadence and no update on duplicate encounter IDs. Switch slots, save/reload, reset twice and replay the same samples. Verify model digest never changes.
Definition of done and approval gate: All parameter and isolation assertions pass. No mutation of model weights, global settings or another slot. Owner can explain at least one observed change.
```
### P5 — Enemy adaptive director

```text
Role: encounter designer and enemy AI engineer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Select from approved frozen enemy profiles and authored encounter options at encounter boundaries. Start with low/standard pressure, at most one tier change per two completed encounters and no pressure beyond the authored encounter cap. Freeze escalation after a player defeat for two encounters. Stop reinforcing at capacity; never spawn in sight or in a safe zone. Enforce modified enemy perception at the observation boundary: occlusion, hearing radius, expiring last-known position and no reads of hidden player state. Proposed fairness floors: 18 ticks from first perception to aimed attack at 60 Hz; seeded aim point offset of at least 2 degrees for directed ranged attacks, with occasional geometrical hits still possible. Preserve slower authored reactions and larger authored errors. Exclude scripted bosses until independently approved. Limit this director to practice by default.
Deliverables: Director rules, explicit caps by encounter, perception and aim traces, profile manifest, visible pacing explanation, director-only reset and rollback.
Verification: Compare paired runs with identical observable histories and different hidden positions. Decisions must match until perception differs. Test corners, occluders, safe zones, spawn saturation, difficulty after repeated success/failure and invariant minima on every applicable attack.
Definition of done and approval gate: Zero hidden-information, spawn-budget or fairness violations. Owner accepts example traces and observed encounter difficulty.
```
### P6 — Governor, telemetry, privacy and reset

```text
Role: safety and save-systems engineer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Harden the minimal governor already used in P2–P5. Reject unknown/nonfinite/out-of-range commands, stale tick, invalid source/session and actions outside stamina, cooldown, perception or ownership limits. Recheck reward authority at commit including async queues. Reject duplicate reward/event IDs; detect repeated rejected actions or stuck policy loops. After 3 invalid proposals in 60 ticks latch fallback; if fallback fails, pause and return manual. Record tick, reason enum, flags, policy/rules versions, fallback transition and quantized adapter state in a bounded local ring. Proposed 512 events per session, no names, raw keys, text, account/device IDs or uploaded traces. Separate optional diagnostics from minimal volatile replay state. Provide inspect, opt out, clear, explicit replay export and reset. Validate/migrate adaptation separately; malformed data falls back to defaults without damaging campaign saves. Bind records to slot generation so a reused slot cannot inherit another character.
Deliverables: Governor matrix, event dictionary and retention limits, save/reset/migration paths, model pin and last-known-good rollback procedure.
Verification: Inject stale commands, duplicate events, malformed records, storage quota failures, slot overwrite and model downgrade. Verify opt-out stops optional writes, clear removes prior diagnostics and reset removes both player and director adaptation. Confirm no network requests beyond static assets.
Definition of done and approval gate: No campaign corruption or reward leakage. Every rejection and rollback has a reproducible trace and an owner-readable reason.
```
### P7 — QA, simulation, red-team and certification

```text
Role: QA lead for a single-player browser game.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Build a matrix spanning flags, speeds, human takeover, saves, policy versions and locales/layouts. Exercise game-rule abuse using synthetic in-process commands and fixtures: duplicated loot events, stale bot commands, out-of-order quest completions and gain-through-time. Cover cold start, interrupted write, rollback with a newer profile, speed changes mid-action and 100 toggle cycles. Soak 100 seeds × 10,000 ticks with checkpoint and replay; track illegal actions, unresolved stalls, fatigue/debt drift in the campaign and runaway pressure. Run six historic browser suites sequentially and add a normal-input suite. Use docs/TDD.md budgets; compare CPU average/p99, draw calls, bundle gzip and shader count with flag off/on at Ashford and the coast.
Deliverables: Raw logs, seed manifest, first-divergence traces, screenshot and keyboard checklist, device/browser results, defect list and target-specific compliance matrix.
Verification: Reproduce any failure on its seed. Require identical canonical hashes on supported configurations, zero progression leaks, and no regression beyond approved budgets. Verify real-device frame pacing and keyboard-only operation separately. Distinguish public browser readiness from formal platform certification.
Definition of done and approval gate: Block release on critical failures or missing mandatory target evidence. No certification claim without actual platform review.
```
### P8 — Documentation and LiveOps

```text
Role: release producer and policy maintainer.
Context: Wards of Millbrook v0.9.2, local desktop browser RPG, TypeScript/Three.js. Read HANDOVER-CLAUDE.md, docs/TDD.md and the last accepted phase record. If absent, reconstruct the needed facts from source.
Constraints: Single-player practice only. No campaign economy or achievement progression, cross-save adaptation, online weight training or unbounded updates. Preserve projects and old saves. For each AI feature require a default-off flag, replay records, local bounded telemetry, tests and a tested rollback. No outbound telemetry by default.
Gate: Stop and ask Waiz if a non-negotiable is ambiguous. Work only within this assignment. Report PASS, FAIL or BLOCKED with evidence. Wait for owner sign-off before the next phase or release.
Task: Assemble the nine controlled documents from section 4 or create them from the artifact list below. Tie every behavioral claim to a source symbol, build, test or manual observation. Version policies, manifests, schemas and replay compatibility together. Stage immutable packages in isolated local practice sessions, validate candidate, then offer a reversible build switch to the previous known-good pair. Rehearse disabling the director, adapter, player policy and whole mode independently, including offline startup. Keep previous packages.
Deliverables: Charter, UX spec, player/enemy design, safety case, telemetry/privacy spec, QA plan, certification checklist, LiveOps playbook and provenance log; release manifest and handover with commands and evidence.
Verification: Have a reviewer follow the rollback procedure from only the playbook. Restore the prior package, load an old save, replay its matching trace and exercise manual control. Audit every document against its acceptance row.
Definition of done and approval gate: Owner signs the manifest, evidence index and open limitations before promotion. Unverified targets remain explicitly blocked.
```
## 4. Documentation prompts

Each block can be used independently. Document titles below are proposed deliverables.

### D1 — Adaptive AI Charter

```text
Role: game director’s technical editor.
Context: Draft or update the Adaptive AI Charter for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Define the practice promise, eligible session types, offline training boundary, permitted online knobs, prohibited progression, director scope, reset ownership and human approval rights.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A charter mapping each promise to a flag, owner and observable failure.
Verification: Trace one permitted practice action, one forbidden reward and a denied network/unknown session.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D2 — Auto-Play Mode UX Spec

```text
Role: interaction designer.
Context: Draft or update the Auto-Play Mode UX Spec for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Specify every transition from manual, confirmation, active and paused through takeover, focus loss, saving, loading and error recovery. Provide exact confirm/cancel, HUD, remap, speed, reset and return-to-entry copy.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A state table with trigger, focus destination, clock behavior, effective input owner, persistent badge and campaign-write behavior.
Verification: Walk through a keyboard-only run on a non-US layout and a takeover with a queued command. Attach observations and mark untested assistive technology.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D3 — Player and Enemy AI Design Doc

```text
Role: systems designer.
Context: Draft or update the Player and Enemy AI Design Doc for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Write a separate eight-section module for player policy and enemy director. Use overview, player fantasy, rules, formulas, edge cases, dependencies, tuning knobs and acceptance criteria in that order. Include shared observation and governor boundaries.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: Two modules with integer units, seed stream, cooldown and clamp examples; link each tuning constant to production code.
Verification: Compute one update by hand for each module. Compare with fixtures at both parameter bounds and after reset.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D4 — Safety & Fairness Case

```text
Role: independent gameplay assurance reviewer.
Context: Draft or update the Safety & Fairness Case for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Give each claim a hazard, precondition, prevention, detector, failure response, evidence and residual risk. Cover hidden information, minimum reaction, aim error, reward authority, queued work, runaway difficulty and fallback failure.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A claim/evidence matrix and unresolved counterexamples.
Verification: Try to falsify each claim with at least one paired or negative fixture and cite its seed and result.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D5 — Telemetry & Privacy Spec

```text
Role: privacy engineer.
Context: Draft or update the Telemetry & Privacy Spec for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Inventory every stored field and destination for settings, per-slot adaptation, volatile diagnostics and explicitly exported replays. Specify purpose, range, retention, quota, opt-out, clear and export behavior.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A field dictionary and data lifecycle table with a redacted example trace and storage-key ownership.
Verification: Compare network and storage snapshots before enabling, after opt-out, after erasure and after slot reuse.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D6 — QA/Test Plan

```text
Role: QA lead.
Context: Draft or update the QA/Test Plan for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Map deterministic, behavioral, performance, integration, device, accessibility and save-migration risks to reproducible cases. Include setup, seed, exact command, expected result, owner and severity.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A runnable matrix distinguishing automated evidence, human checks and blocked tests.
Verification: Pick three representative cases and reproduce from a clean checkout, including a deliberate failure that produces a useful trace.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D7 — Certification Checklist

```text
Role: platform readiness producer.
Context: Draft or update the Certification Checklist for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: List actual launch targets, authority, dated official requirement links, applicability rationale, evidence, owner and status. Track browser input, persistence, disclosure, accessibility, privacy and interruption recovery. Record restricted platform requirements as owner tasks.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: Target-specific readiness checklist with separate internal and external sign-off columns.
Verification: Inspect each PASS against target-specific evidence. Record N/A with rationale and do not infer console certification from browser tests.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D8 — LiveOps Playbook

```text
Role: release engineer.
Context: Draft or update the LiveOps Playbook for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Document triggers, contacts by role, version pinning, reversible promotion, offline disable, independent flags, local reset, known-good package and incompatible replay behavior. Include what happens to existing saves at each step.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A stepwise incident runbook with actual commands, expected status and recovery paths for a failed rollback.
Verification: Have another person rehearse corrupt-checkpoint and runaway-director incidents from the runbook and record elapsed recovery time.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

### D9 — Provenance Log

```text
Role: model and asset steward.
Context: Draft or update the Provenance Log for Wards of Millbrook. Read the current source, docs/WORKFLOW.md, docs/TDD.md and the accepted phase evidence. Cite paths and versions. Mark proposed designs separately from observed behavior.
Task: Inventory each AI-influenced model, training set, synthetic generator, script and asset changed in this milestone. Record origin, rights evidence, creator/model version, human edits, seed, build toolchain, hash and approving owner.
Constraints: Single-player isolated practice. No achievement/economy transfer, cross-save learning, multiplayer bot or online weight training. Cover flags, replay, tests, bounded local telemetry and rollback where applicable. Identify ambiguity in any non-negotiable and ask the owner before resolving it.
Deliverables: A manifest linking the distributed checkpoint to its recipe, data split, evaluation and previous known-good version.
Verification: Rebuild a sample artifact and compare hashes or document the source of variation. Quarantine assets without permission evidence.
Definition of done: Every claim has a check, owner and pass condition. Record missing evidence as pending.
Stop/approval gate: Submit the document and evidence index to Waiz. Do not mark it accepted or change shipping behavior on the strength of a document draft.
```

## 5. Acceptance criteria and verification gates

Record revision, fixture, seed, runtime, expected value, actual value and evidence path for each gate. Keep raw logs with the phase record. A screenshot can establish HUD visibility; proving the absence of campaign writes requires state comparisons and observation at the write boundary.

| Gate | Required evidence to advance |
|---|---|
| P0 baseline | Source map and dependency versions reconcile with the supplied ZIP. The owner accepts scope, target matrix, data rights and explicit performance thresholds. |
| P1 determinism | Repeated runs and restored runs yield identical decision streams and canonical hashes. A deliberately changed command reports its first divergence. Cosmetic variation cannot change gameplay. |
| P2 UX and isolation | Cancel leaves manual play intact. Backslash and the rebound key behave as specified. Takeover cancels every pending bot action before the next simulation tick. Campaign snapshot, stored slot bytes and observed reward writes confirm isolation through exit and reload. |
| P3 model | Held-out results meet the P0 threshold against the utility baseline. Checkpoint is immutable, reproducible, licensed and pinned. Invalid inputs exercise fallback. A fallback-only build cannot pass the trained-model gate. |
| P4 adaptation | Extreme inputs never exceed approved value or rate limits. Reset reproduces the neutral profile. Slot B’s state stays identical while slot A adapts. |
| P5 fairness | All observable-history pairs agree until new information arrives. Every directed ranged attack meets approved aim and reaction floors; encounter and spawn limits hold across seeds. |
| P6 safety and privacy | Zero illegal commits, progression leaks or cross-slot writes. Every forced fault produces the specified fallback or safe stop. Optional telemetry off generates zero optional stored events. |
| P7 QA and certification readiness | Prior suites and new soak pass. Zero unexplained replay divergence. Compare against project budgets including 2 ms average CPU, 16 ms p99, 400 outdoor/250 dungeon draw calls and zero new shader programs in play. Report inherited overruns separately and seek an explicit disposition. Actual target-device and accessible-input checks have named reviewers. |
| P8 documentation and rollback | Nine documents agree with the tested revision. Independent reviewer restores the pinned previous package and verifies save, replay and manual control. Owner records release decision. |

## 6. Risk register and fallback instructions

| Risk | Trigger | Claude’s fallback instruction |
|---|---|---|
| Nondeterminism | First differing hash or decision on replay | Freeze promotion, retain both traces, bisect the first tick and isolate RNG/time/order differences. Disable the affected policy until the fixture passes. |
| Difficulty runaway | Pressure changes twice inside cooldown, or rises during recovery | Lock to authored standard encounters and clear director history for the affected practice session. Preserve the failing seed. |
| Reward hacking | Any practice-originated campaign payout, time skip or delayed side effect | Stop practice, cancel queued work and restore the intact entry snapshot. Disable auto-play until every reward path has a regression case. |
| Player distrust | Player misses the badge, misunderstands position restoration or cannot explain a difficulty change | Default to manual and fixed difficulty. Revise disclosure and test it with a fresh player before approval. |
| Save corruption | Invalid profile, slot identity mismatch, migration or quota failure | Discard only the invalid adapter record, use neutral defaults and preserve the campaign. If entry isolation cannot be guaranteed, deny practice. |
| Multiplayer confusion | Session provenance is unknown or networked | Deny at the simulation authority boundary and hide entry controls. Verify direct command submission is also rejected. |
| Certification failure | Requirement has no permitted authoritative source or target evidence | Block that target, assign the assessment to its platform owner and offer an adaptation-disabled candidate for re-evaluation. |
| Compute overrun | Measured frame or bundle cost exceeds the agreed envelope | Reduce decision frequency on fixed tick boundaries, quantize or shrink the model, rebenchmark. Use the authored fallback if still over budget. |
| Privacy issue | Unexpected identifier, persistent event after opt-out or outbound diagnostics | Disable collection and export, clear affected local diagnostics through documented controls and review the schema before re-enabling. |
| Bad checkpoint | Digest mismatch, out-of-range output or incompatible observation schema | Reject before activation, pin the last reviewed compatible model or use utility fallback. Replays requiring another model must report incompatibility. |

## 7. Human validation checklist

| After | Waiz’s sign-off check |
|---|---|
| P0 | Read the practice contract. Confirm the player returns to the exact entry state, choose target devices and approve the baseline and thresholds. |
| P1 | Ask for the first differing tick in a deliberately altered replay and matching hashes for the original. |
| P2 | Rebind the key, enter practice, pause and take over under pressure. Check the HUD, return position, inventory and debt. |
| P3 | Watch the same route with the trained and fallback policies. Check the model digest, held-out results and missing-model behavior. |
| P4 | Inspect the before/after values for a repeated encounter, reset slot A, and check slot B. |
| P5 | Watch an occluded encounter and a defeat followed by recovery. Inspect what the director knew at each decision. |
| P6 | Disable diagnostics, clear a profile and open an old save. Watch a rejected command trigger safe behavior. |
| P7 | Inspect failures as well as passes. Sign the keyboard-only and target-device checks after playing the packaged build. |
| P8 | Follow the rollback playbook from a clean copy. Resume manual play and confirm the manifest matches the package. |

## How to use this pack

Attach the v0.9.2 project ZIP and this Markdown file to Claude. Paste section 2 as the standing project instruction and P0 as the first task. After reviewing its evidence, paste one approved phase at a time. Use D1–D9 when their subjects first arise and refresh them in P8. For a fresh chat, attach the latest source, accepted phase record and evidence index, then paste the master and next phase. Keep the original project and each accepted build.

