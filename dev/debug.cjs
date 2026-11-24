const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 450 } });
  p.on('pageerror', e => console.log('ERR', e.message));
  const g = (fn, ...a) => p.evaluate(fn, ...a); const w = ms => p.waitForTimeout(ms);
  await p.goto('http://localhost:5199/'); await w(1200); await g(() => window.__game.start()); await w(500);
  console.log('modal after start', await g(() => window.__game.modalOpen()));
  // combat
  await g(() => { const G = window.__game; G.teleport(-32, 84, 0); }); await w(1500);
  console.log('enemies', await g(() => window.__game.enemies.list.map(e => [e.kind, e.state, Math.round(e.hp), Math.round(e.pos.distanceTo(window.__game.player.pos))])));
  for (let i = 0; i < 6; i++) { const r = await g(() => { const G = window.__game; const e = G.faceNearestEnemy(); const before = e.hp; G.attack(); return [e.kind, before, e.hp, G.s.ammo.mag, G.player.fireCd, G.player.reloading, G.modalOpen()]; }); console.log('shot', JSON.stringify(r)); await w(400); }
  console.log('kills', await g(() => window.__game.s.stats.kills));
  await p.mouse.click(400, 225); await w(300);
  console.log('modal after click', await g(() => window.__game.modalOpen()), await g(() => document.pointerLockElement && document.pointerLockElement.id));
  await b.close();
})();
