#!/usr/bin/env bash
# v0.9.3: smoke7 (the coast) first, and the coastal bench. Needs NODE_PATH to reach Playwright if it is global.
# Final evidence run for a version (docs/WORKFLOW.md §6): every suite, sequentially (one browser at a time),
# against the preview build on :5198. Usage: dev/evidence.sh v0.8
set -u
V=${1:?version}; OUT=docs/qa/evidence/$V; URL=http://127.0.0.1:5198/
mkdir -p "$OUT" shots8 shots9 shots93
{
  echo "# $V evidence run, $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "== rules (npx tsx tests/sim.test.ts)"; npx tsx tests/sim.test.ts 2>&1 | tail -3
  for s in smoke7 smoke6 smoke5 smoke4 smoke smoke2 smoke3; do echo "== scripts/$s.cjs ($(date -u +%H:%M))"; timeout 1800 node scripts/$s.cjs $URL $( [ $s = smoke5 ] && echo shots8 )$( [ $s = smoke6 ] && echo shots9 )$( [ $s = smoke7 ] && echo shots93 ) 2>&1 | grep -v "^\s*at " | tail -70; done
  echo "== scripts/npccheck.cjs (all regions)"; timeout 300 node scripts/npccheck.cjs $URL 2>&1 | tail -30
  echo "== scripts/look8.cjs"; timeout 900 node scripts/look8.cjs $URL shots8/look 2>&1 | tail -6
  echo "== scripts/anim8.cjs"; timeout 600 node scripts/anim8.cjs $URL 2>&1 | tail -3
  echo "== budgets (node dev/bench93.cjs: bench8 plus the coast and the Sea Cave)"; timeout 1500 node dev/bench93.cjs $URL "$OUT/bench.json" 2>&1 | tail -120
} > "$OUT/tests.txt" 2>&1
echo finished
