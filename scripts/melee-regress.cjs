// P1 regression: melee lands inside the simulation step on tick 5 after the swing, and only inside the arc.
// Usage: node scripts/melee-regress.cjs [url]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:5198/';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(120000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => { window.__game.start(); window.__game.sim.setExternalClock(true); });
  let pass = 0, fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); c ? pass++ : fail++; };
  for (const [label, off, expectHit] of [['in arc', [0, -1.5], true], ['out of arc', [1.5, 0], false]]) {
    const r = await p.evaluate(({ off }) => {
      const G = window.__game, P = G.player;
      for (const e of [...G.enemies.list]) G.enemies.remove(e); for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50; G.s.hp = 100;
      G.teleport(-20, 0, 0); G.step(0.2);
      const e = G.enemies.spawn('raider', P.pos.clone(), 'probe'); e.pos.set(P.pos.x + off[0], 0, P.pos.z + off[1]); e.speed = 0;
      const hp0 = e.hp; const per = [];
      G.sim.press('melee');
      for (let i = 0; i < 8; i++) { G.step(1 / 30); per.push(e.hp); }
      return { hp0, per, cd: P.meleeCd };
    }, { off });
    const firstDrop = r.per.findIndex(h => h < r.hp0);
    if (expectHit) { ok(firstDrop === 5, `${label}: damage lands on tick ${firstDrop + 1} after the press (swing tick 1 + 5); hp ${r.hp0} -> ${r.per.at(-1)}`); ok(r.hp0 - r.per.at(-1) === 16, `${label}: exactly one hit of 16`); }
    else ok(firstDrop === -1, `${label}: no damage (hp ${r.per.at(-1)})`);
  }
  // pause during a queued hit: a menu stops the clock; the hit lands once after it closes
  const q = await p.evaluate(() => {
    const G = window.__game, P = G.player;
    for (const e of [...G.enemies.list]) G.enemies.remove(e); G.teleport(-20, 0, 0); G.step(0.2); P.meleeCd = 0;
    const e = G.enemies.spawn('raider', P.pos.clone(), 'probe'); e.pos.set(P.pos.x, 0, P.pos.z - 1.5); e.speed = 0; const hp0 = e.hp;
    G.sim.press('melee'); G.step(2 / 30); G.openJournal(); const t0 = G.sim.tick; G.step(1); const pausedTicks = G.sim.tick - t0, hpPaused = e.hp;
    G.closeModal(); G.step(10 / 30);
    return { pausedTicks, hpPaused, hp0, hpEnd: e.hp };
  });
  ok(q.pausedTicks === 0 && q.hpPaused === q.hp0, `menu open: clock stopped (${q.pausedTicks} ticks) and the queued hit waited`);
  ok(q.hp0 - q.hpEnd === 16, `after the menu closes the hit lands exactly once (hp ${q.hp0} -> ${q.hpEnd})`);
  ok(errs.length === 0, 'no page errors ' + JSON.stringify(errs.slice(0, 2)));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
