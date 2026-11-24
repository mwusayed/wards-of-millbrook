# Wards of Millbrook — development workflow

How this game is built, adapted from a AAA pipeline (phase gates, a modular GDD, a TDD with budgets, a vertical
slice, a milestone ladder, verification-driven "done", test evidence and an AI governance layer) to a project
with one human director (Waiz) and one AI developer (Claude) working in passes.

The short version: **Waiz sets direction and owns every creative sign-off. Claude writes the spec before the
code, proves each feature with a test or a retained screenshot, publishes a playable build after every pass,
and records what was AI-made.**

---

## 1. Roles

| Role | Who | Owns |
|---|---|---|
| Game director | Waiz | Vision, scope, what ships, final say on feel and story |
| Designer, engineer, artist, QA, producer | Claude | Specs (GDD/TDD), code, procedural art, tests, evidence, docs, release |
| Players / reviewers | Waiz (and anyone he shares the link with) | Playtest notes, balance feedback |

Claude may make any design decision inside the director's brief (the brief so far: "as feature-complete as
possible; story and mechanics at your discretion"). Decisions that would change the vision (genre, tone, removing
systems, monetisation) go back to Waiz.

## 2. Phases and where the project is

| Phase | AAA meaning | This project | Status |
|---|---|---|---|
| Concept & prototype | Is the core verb fun? | v0.1: body needs + shooting + ledger work in one 3D slice | Done |
| Technical proof of concept | Highest-risk unknown on target hardware | Browser 3D with no engine: one loop, shader prewarm, pooled lights, smooth camera (v0.3) | Done |
| GDD + TDD | Living source of truth | `docs/gdd/`, `docs/TDD.md`, `docs/ADR.md` | Living (this pass) |
| Vertical slice | 15–60 min at shipping quality | Millbrook + Vale + Old Mill (v0.3–v0.4) | Done |
| Production → Alpha | Feature complete | v0.5–v0.7: story, chapel, Reach, Ashford, mine | **Current** |
| Beta | Content complete, polish, balance | Final regions, balance by real play, performance on real GPUs | Next |
| Release | Certification → gold | Browser build: no platform certification; a release checklist instead (§8) | Later |
| LiveOps | Continuous content | Passes after release, driven by Waiz's play notes | Later |

## 3. The pass loop (one "sprint")

Every pass follows the same eight steps. A pass ends with a published, playable build, never with half a feature.

1. **Brief.** Restate Waiz's request as goals and non-goals. Write it into `docs/ROADMAP.md` (status log).
2. **Spec.** For each new system or region, add or update its GDD module (`docs/gdd/<system>.md`) using the
   8-section template (§4) *before* writing code. Acceptance criteria are written as checks that can run.
3. **Technical plan.** Note budgets touched (draw calls, CPU ms, save fields) in `docs/TDD.md`; record any
   lasting decision as an ADR in `docs/ADR.md`.
4. **Build in vertical order.** Rules first (`src/sim`, pure TypeScript), then world and models (`src/render`),
   then UI (`src/ui`), then wiring (`src/main.ts`). Keep the build green between steps (`npx tsc --noEmit`).
5. **Verify.** Rules tests (`npm run test:sim`) for every formula and quest chain; a browser suite
   (`scripts/smoke*.cjs`) for anything you can only see; screenshots for visual features.
6. **Evidence.** Copy the screenshots and test output that prove the acceptance criteria into
   `docs/qa/evidence/<version>/` with an index (§6).
7. **Regress.** Re-run every earlier browser suite. Nothing ships with a red suite.
8. **Release.** Changelog, roadmap status, status doc, version string, publish to the same game link, zip the
   source, report to Waiz: what changed, what was verified, what was not.

## 4. GDD module template (8 sections)

Every system file in `docs/gdd/` uses these headings, in this order:

1. **Overview** — what it is in two sentences, and which source game it comes from.
2. **Player fantasy** — what it should feel like to the player.
3. **Detailed rules** — the behaviour, step by step.
4. **Formulas** — every number as a formula with named variables, each linked to the constant in code
   (`src/sim/balance.ts`, etc.). A number that is not in code is a bug in the doc.
5. **Edge cases** — the odd situations and what happens.
6. **Dependencies** — systems it reads from and writes to.
7. **Tuning knobs** — the constants a designer would change, with current values and safe ranges.
8. **Acceptance criteria** — checks, each mapped to a test name or an evidence file.

## 5. Definition of Done

A feature is done only when all of these are true:

- It is in the published build and reachable in normal play (not only through test hooks).
- Its GDD module exists and matches the code (formulas point at real constants).
- Every acceptance criterion has a passing rules test, a passing browser check, or a retained screenshot.
- Saves that existed before still load (migration test), and the new state survives save and load.
- No new page errors in any browser suite; all earlier suites still pass.
- Performance budgets in `docs/TDD.md` are still met where they can be measured headlessly.
- The changelog says what it is in player terms, and what was *not* verified.

"A parse check is not a run": a type-check or a successful build never counts as proof that a feature works.

## 6. QA evidence

- Folder: `docs/qa/evidence/<version>/`. Each pass adds screenshots (`NN-what.png`) and the raw output of every
  test suite (`tests.txt`), plus `INDEX.md` mapping each acceptance criterion to its proof.
- Screenshots are taken by the browser suites from scripted positions, so they can be retaken after a change.
- Known blind spots of the headless test browser are listed every time: real-GPU frame pacing, tearing, audio.

## 7. AI governance

Everything in this repository is AI-assisted. The rules:

1. **Hand-off points.** Waiz's request → Claude's brief and spec → Claude builds → automated checks → Waiz plays
   and signs off (or redirects). Nothing is considered accepted until Waiz has played it.
2. **Acceptance by asset class.** Code: rules tests + browser suite. Procedural art (models, worlds): screenshot
   review against `docs/ART_BIBLE.md`. Writing (dialogue, quests): read-through for tone and for no real people,
   brands or copyrighted text. Audio: generated in the browser at runtime; no samples.
3. **Provenance.** `docs/PROVENANCE.md` logs, per version, the model, what was generated, what Waiz decided, and
   what source material (his own earlier games) was used.
4. **Human ownership.** Waiz owns the creative direction and the final decision; Claude drafts and implements.
   No external assets, fonts or code are copied in except the open-source libraries listed in `package.json`.

## 8. Release checklist (instead of platform certification)

- [ ] `npx tsc --noEmit` clean, `npm run test:sim` all pass
- [ ] every `scripts/smoke*.cjs` suite passes against `vite preview`
- [ ] no page errors in any suite; intro shows the right version
- [ ] save from the previous version loads (migration test)
- [ ] evidence folder and index written
- [ ] CHANGELOG, ROADMAP status log, STATUS updated
- [ ] published to the same artifact link; old asset removed
- [ ] source zip sent; project status doc updated

## 9. Documents in this repo

| Document | Purpose |
|---|---|
| `docs/WORKFLOW.md` | This process |
| `docs/DESIGN.md` | The game in one page: pillars, loops, where each system comes from |
| `docs/gdd/` | One file per system, 8-section template |
| `docs/TDD.md` | Architecture, module map, budgets, coding standards |
| `docs/ADR.md` | Architecture decision records |
| `docs/ART_BIBLE.md` | Visual rules for the procedural art |
| `docs/UX_ACCESSIBILITY.md` | HUD, input, readability and accessibility requirements |
| `docs/qa/` | Test evidence per version |
| `docs/PROVENANCE.md` | AI provenance log |
| `docs/ROADMAP.md` | Briefs, milestones and the status log |
| `docs/CHANGELOG.md` | What changed in each version, in player terms |
| `docs/STATUS.md` | One-page current state (also kept in the claude.ai project) |
