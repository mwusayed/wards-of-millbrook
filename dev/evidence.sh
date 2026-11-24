#!/usr/bin/env bash
# Final evidence run for a version (docs/WORKFLOW.md §6): every suite, sequentially (one browser at a time),
# against the preview build on :5198. Usage: dev/evidence.sh v0.8
set -u
V=${1:?version}; OUT=docs/qa/evidence/$V; URL=http://127.0.0.1:5198/
mkdir -p "$OUT" shots8 shots9
{
  echo "# $V evidence run, $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "== rules (npx tsx tests/sim.test.ts)"; npx tsx tests/sim.test.ts 2>&1 | tail -3
  for s in smoke6 smoke5 smoke4 smoke smoke2 smoke3; do echo "== scripts/$s.cjs"; timeout 1500 node scripts/$s.cjs $URL $( [ $s = smoke5 ] && echo shots8 )$( [ $s = smoke6 ] && echo shots9 ) 2>&1 | grep -v "^\s*at " | tail -60; done
  echo "== scripts/npccheck.cjs (all regions)"; timeout 300 node scripts/npccheck.cjs $URL 2>&1 | tail -30
  echo "== scripts/look8.cjs"; timeout 900 node scripts/look8.cjs $URL shots8/look 2>&1 | tail -6
  echo "== scripts/anim8.cjs"; timeout 600 node scripts/anim8.cjs $URL 2>&1 | tail -3
  echo "== budgets (node dev/bench8.cjs)"; timeout 900 node dev/bench8.cjs $URL "$OUT/bench.json" 2>&1 | tail -80
} > "$OUT/tests.txt" 2>&1
echo finished
