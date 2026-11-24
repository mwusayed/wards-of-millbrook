// Every townsperson's stops and waypoints must be standing room (not inside a wall or prop), so nobody spends the
// day walking into a wall. Prints the offenders. Usage: node scripts/npccheck.cjs <url> [region]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 600 } });
  await p.goto(process.argv[2] || 'http://127.0.0.1:5198/');
  await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const region = process.argv[3] || '';
  const r = await p.evaluate(region => {
    const G = window.__game, out = [], cols = G.world.colliders;
    const inside = (x, z, r) => cols.filter(c => x > c.minX - r && x < c.maxX + r && z > c.minZ - r && z < c.maxZ + r && (c.h ?? 9) > 0.4);
    let n = 0;
    for (const f of G.folk) {
      if (region && f.def.region !== region) continue;
      for (const st of f.def.stops) {
        for (const [x, z, what] of [[st.x, st.z, 'stop'], ...(st.via ?? []).map(v => [v[0], v[1], 'via'])]) {
          n++; const hit = inside(x, z, 0.28).filter(c => !(what.startsWith('stop') && ['sit', 'write', 'drinkMug'].includes(f.def.stops.find(q => q.x === x && q.z === z)?.clip) && (c.h ?? 9) <= 0.65));
          if (hit.length) out.push(`${f.def.id} ${what} (${x}, ${z}) inside ${hit.map(c => `[${c.minX.toFixed(1)}..${c.maxX.toFixed(1)}, ${c.minZ.toFixed(1)}..${c.maxZ.toFixed(1)}]`).join(' ')}`);
        }
      }
    }
    return { checked: n, bad: out };
  }, region);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
