// Melee preflight trace. Usage: node melee_trace.cjs <url> <out.json>
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const url = process.argv[2], out = process.argv[3];
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(120000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__game.start()); await p.waitForTimeout(800);
  const result = {};
  for (const [label, offset] of [['inArc', [0, -1.5]], ['outOfArc', [1.5, 0]]]) {
    await p.evaluate(({ offset }) => {
      const G = window.__game, P = G.player; const T = window.__trace = { t0: performance.now(), ev: [] };
      const log = (k, d) => T.ev.push({ ms: Math.round(performance.now() - T.t0), k, ...d });
      for (const e of [...G.enemies.list]) G.enemies.remove(e);
      for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50; G.s.hp = 100;
      G.teleport(-20, 0, 0); G.step(0.1);
      const e = G.enemies.spawn('raider', P.pos.clone(), 'probe'); e.pos.set(P.pos.x + offset[0], 0, P.pos.z + offset[1]); e.speed = 0; window.__e = e;
      // keep it stationary: freeze its AI by idling it every step
      log('setup', { player: [P.pos.x, P.pos.y, P.pos.z].map(v => +v.toFixed(3)), yaw: +P.yaw.toFixed(3), enemy: [e.pos.x, e.pos.z], hp: e.hp, alive: e.alive, state: e.state, rise: e.rise, action: !!P.action, modal: G.modalOpen(), meleeCd: P.meleeCd, gameover: G.s.gameover });
      const origST = window.setTimeout; window.__origST = origST;
      window.setTimeout = (fn, ms, ...a) => { const id = origST(() => { log('timeout-run', { delay: ms }); const pp = P.pos, f = { x: -Math.sin(P.yaw), z: -Math.cos(P.yaw) }; for (const en of G.enemies.list) { const tx = en.pos.x - pp.x, tz = en.pos.z - pp.z, dl = Math.hypot(tx, tz); log('check', { kind: en.kind, alive: en.alive, dl: +dl.toFixed(3), dot: +((f.x * tx + f.z * tz) / (dl || 1)).toFixed(3), inRange: dl < 2.5, inArc: (f.x * tx + f.z * tz) / (dl || 1) > 0.45, playerYaw: +P.yaw.toFixed(3) }); } try { fn(...a); } catch (err) { log('timeout-threw', { msg: err.message }); } log('timeout-done', { hp: window.__e.hp }); }, ms); log('timeout-scheduled', { delay: ms }); return id; };
      const od = G.enemies.damage.bind(G.enemies); G.enemies.damage = (en, amt, ...r) => { log('damage', { amount: +amt.toFixed(2), hpBefore: en.hp }); const v = od(en, amt, ...r); log('damage-done', { hpAfter: en.hp }); return v; };
      dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF' }));
      log('keydown', { meleeCd: +P.meleeCd.toFixed(3) });
      G.step(1 / 30);
      log('after-1-step', { meleeCd: +P.meleeCd.toFixed(3), hp: e.hp });
      dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyF' }));
      G.step(0.5); log('after-step-0.5s', { hp: e.hp, enemyPos: [+e.pos.x.toFixed(2), +e.pos.z.toFixed(2)] });
    }, { offset });
    await p.waitForTimeout(6000);
    result[label] = await p.evaluate(() => { window.setTimeout = window.__origST; return { hpEnd: window.__e.hp, events: window.__trace.ev }; });
  }
  result.frameMs = await p.evaluate(() => new Promise(r => { const ts = []; let last = performance.now(); const f = t => { ts.push(Math.round(t - last)); last = t; if (ts.length < 6) requestAnimationFrame(f); else r(ts); }; requestAnimationFrame(f); })); console.log('frame intervals ms', result.frameMs);
  result.pageErrors = errs;
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  for (const k of ['inArc', 'outOfArc']) { console.log('==', k, 'hpEnd', result[k].hpEnd); for (const e of result[k].events) console.log(' ', JSON.stringify(e)); }
  console.log('pageErrors', errs);
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
