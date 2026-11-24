# Wards of Millbrook (working title)

A first/third-person survival life-sim RPG. You live in Millbrook, owe Aldric Voss 300 crowns, and keep your body going while you earn: honest ledger shifts at the Counting House, or contracts in the Whispering Vale with a carbine, a staff and spells.

## Run it
Requires Node.js 20+.
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (open with any static server)
npm run test:sim   # rules tests, no browser needed
```
Browser playthrough test (needs Playwright installed globally): start the dev server, then `node scripts/playtest.cjs http://localhost:5173/ shots`.

## Controls
Mouse look (click to capture) · WASD move · Shift run · Space jump · Left click fire/cast · Right click or F melee · 1–4 carbine and spells · R reload · E use/talk · V first/third person · Q eat bread · Tab pack · J journal · Esc menu and save.

## Where things live
- `src/sim/` — all rules, pure TypeScript, tested headlessly. Change balance in `balance.ts`.
- `src/render/` — Three.js: world, rigged models and animation clips (`rig.ts`), enemies, townsfolk, viewmodel, sound.
- `src/ui/hud.ts` — HUD and dialogs.
- `docs/DESIGN.md` — vision, donor map (which old game each system came from), pass plan, rules for every pass.
- `docs/CHANGELOG.md` — what changed and when.

## How the work is done
`docs/WORKFLOW.md` is the process (brief → spec → plan → build → verify → evidence → regress → release). Each
system has a design module in `docs/gdd/` (8 sections ending in acceptance criteria); `docs/TDD.md` has the
architecture and budgets, `docs/ADR.md` the decisions, `docs/ART_BIBLE.md` the look, `docs/UX_ACCESSIBILITY.md`
the interface rules, `docs/PROVENANCE.md` what was AI-made, and `docs/qa/evidence/<version>/` the proof.

## Tests (v0.8)
```
npm run test:sim                 # 86 rules tests
npx vite build && npx vite preview --host 127.0.0.1 --port 5198 &
node scripts/smoke5.cjs http://127.0.0.1:5198/    # v0.8: the Westmarch (39 checks)
node scripts/smoke4.cjs http://127.0.0.1:5198/    # v0.7: the Eastern Reach and animation
node scripts/smoke.cjs  http://127.0.0.1:5198/    # progression, town, combat additions
node scripts/smoke2.cjs http://127.0.0.1:5198/    # chapel, Wraith, gate defence, ending, audit
node scripts/smoke3.cjs http://127.0.0.1:5198/    # map, door events, bounty, music mood
node dev/bench8.cjs     http://127.0.0.1:5198/ out.json   # budgets (docs/TDD.md §9)
node scripts/look8.cjs  http://127.0.0.1:5198/ shots8     # look-around screenshots of the Westmarch
```
New keys: C dodge, L lantern, M map, J journal. All keys can be changed in Settings.
