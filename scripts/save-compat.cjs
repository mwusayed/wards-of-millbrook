// P1 save compatibility, both directions. Usage: node scripts/save-compat.cjs <oldUrl v0.9.4> <newUrl P1>
const { chromium } = require('playwright');
(async () => {
  const [oldUrl, newUrl] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let pass = 0, fail = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + x)); c ? pass++ : fail++; };
  const page = async url => { const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(300000); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.__errs = errs; await p.goto(url); await p.waitForTimeout(1500); return p; };
  const make = p => p.evaluate(() => { const G = window.__game; G.start(); G.newGame(); G.s.crowns = 77; G.s.inventory.bread = 4; G.s.minutes += 300; G.teleport(12, -30, 0.5); G.step(0.2); G.saveTo('2'); return { raw: localStorage.getItem('wards-of-millbrook-slot-2'), crowns: G.s.crowns, bread: G.s.inventory.bread, minutes: G.s.minutes, pos: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)] }; });
  const load = (p, raw) => p.evaluate(raw => { const G = window.__game; G.start(); localStorage.setItem('wards-of-millbrook-slot-2', raw); const ok = G.loadFrom('2'); G.step(0.5); return { ok, crowns: G.s.crowns, bread: G.s.inventory.bread, minutes: G.s.minutes, pos: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)], version: G.s.version, tick: G.sim ? G.sim.tick : null }; }, raw);
  // old -> new
  const po = await page(oldUrl); const oldSave = await make(po); await po.close();
  const pn = await page(newUrl); const onNew = await load(pn, oldSave.raw);
  ok(onNew.ok && onNew.crowns === 77 && onNew.bread === 4 && onNew.version === 5 && JSON.stringify(onNew.pos) === JSON.stringify(oldSave.pos), 'a v0.9.4 save loads in P1 (no p1 block: streams seeded, campaign intact)', JSON.stringify({ oldSave: { ...oldSave, raw: undefined }, onNew }));
  ok(!JSON.parse(oldSave.raw).extra.p1, 'the v0.9.4 save really has no p1 block');
  ok(pn.__errs.length === 0, 'no page errors loading the old save in P1', JSON.stringify(pn.__errs.slice(0, 2)));
  // new -> old
  const newSave = await make(pn); await pn.close();
  const po2 = await page(oldUrl); const onOld = await load(po2, newSave.raw);
  ok(!!JSON.parse(newSave.raw).extra.p1, 'the P1 save carries a p1 block in extra (save format still v5)');
  ok(onOld.ok && onOld.crowns === 77 && onOld.bread === 4 && onOld.version === 5 && JSON.stringify(onOld.pos) === JSON.stringify(newSave.pos), 'a P1 save loads in v0.9.4 (rollback keeps saves)', JSON.stringify({ newSave: { ...newSave, raw: undefined }, onOld }));
  ok(po2.__errs.length === 0, 'no page errors loading the P1 save in v0.9.4', JSON.stringify(po2.__errs.slice(0, 2)));
  console.log(`${pass} passed, ${fail} failed`); await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
