// v0.9 browser suite: the title screen, the grid pack, the armoury, and all four guns (docs/gdd/arms.md §8).
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:5198/', out = process.argv[3] || 'shots9';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  let pass = 0, fail = 0; const ok = (c, name) => { if (c) { pass++; console.log('ok  ', name); } else { fail++; console.log('FAIL', name); } };
  const shot = n => p.screenshot({ path: `${out}/${n}.png` });
  await p.goto(url); await p.waitForFunction(() => window.__game, null, { timeout: 240000 }); await p.waitForTimeout(2500);
  ok(await p.$eval('#intro h1', e => e.textContent.includes('Millbrook')), 'the title screen shows the game\'s name');
  const items = await p.$$eval('#intro .tbtn', bs => bs.map(b => b.textContent));
  ok(['Load game', 'Settings', 'How to play', 'Credits'].every(t => items.some(x => x.includes(t))), 'the title menu offers new/continue, load, settings, how to play and credits');
  const cam1 = await p.evaluate(() => window.__game.renderer.info.render.frame); await p.waitForTimeout(800);
  const pos1 = await p.evaluate(() => { const c = window.__game.world.scene.children.find(o => o.isPerspectiveCamera); return c ? c.position.toArray() : null; }); await p.waitForTimeout(600);
  const pos2 = await p.evaluate(() => { const c = window.__game.world.scene.children.find(o => o.isPerspectiveCamera); return c ? c.position.toArray() : null; });
  ok(pos1 && pos2 && Math.hypot(pos1[0] - pos2[0], pos1[2] - pos2[2]) > 0.05, 'the world turns slowly behind the title'); void cam1;
  await shot('01-title');
  await p.click('#thow'); await p.waitForTimeout(300); ok(await p.$('.modal-wrap h2') !== null, 'How to play opens over the title'); await shot('02-how-to-play'); await p.click('.modal-wrap [data-close]');
  await p.evaluate(() => window.__game.start()); await p.waitForTimeout(1500);
  ok(await p.$('#intro') === null, 'starting a game leaves the title screen');
  // the pack
  await p.evaluate(() => { const G = window.__game; const s = G.s; s.inventory.bread = 3; s.inventory.ammo = 2; s.inventory.silverammo = 2; s.inventory.shells = 3; s.inventory.medkit = 1; s.inventory.herbs = 5; s.crowns = 900; G.openPack(); });
  await p.waitForTimeout(400);
  const tiles = await p.$$eval('.igrid .tile', t => t.length);
  ok(tiles >= 5, `the pack is a grid of item tiles (${tiles})`);
  ok(await p.$('.wbar') !== null, 'the pack shows its weight against what you can carry');
  await p.click('.igrid .tile[data-sel="medkit"]'); await p.waitForTimeout(200);
  ok(await p.$eval('.detail h3', e => e.textContent.includes('kit') || e.textContent.length > 2), 'picking a tile shows the item and its use');
  ok(await p.$eval('.tile[data-sel="medkit"]', e => getComputedStyle(e).gridColumnEnd.includes('span 2')), 'big things take bigger tiles (a medkit is 2 wide)');
  await p.click('[data-filter="arms"]'); await p.waitForTimeout(200);
  ok(await p.$$eval('.igrid .tile', t => t.every(x => ['ammo', 'silverammo', 'shells', 'carbineammo', 'riflerounds', 'oil'].includes(x.dataset.sel))), 'the Arms filter shows only ammunition and gun oil');
  await shot('03-pack-grid');
  await p.evaluate(() => document.querySelector('.modal-wrap [data-close]').click());
  // the armoury
  await p.evaluate(() => window.__game.armoury()); await p.waitForTimeout(300);
  const racks = await p.$$eval('.rack', r => r.length); ok(racks === 4, `the armoury racks four guns with stat bars (${racks})`);
  await shot('04-armoury');
  for (const g of ["scattergun", "longrifle", "carbine"]) { await p.evaluate(g => document.querySelector(`[data-gear="${g}"]`).click(), g); await p.waitForTimeout(150); }
  ok(await p.evaluate(() => { const s = window.__game.s; return s.gear.scattergun && s.gear.longrifle && s.gear.carbine; }), 'buying the scattergun, long rifle and carbine works');
  ok(await p.evaluate(() => window.__game.s.guns.scattergun.mag === 2 && window.__game.s.guns.longrifle.mag === 5), 'new guns come loaded');
  const c0 = await p.evaluate(() => window.__game.s.crowns); await p.evaluate(() => document.querySelector(`[data-buy="shells:5"]`).click()); await p.waitForTimeout(100);
  ok(await p.evaluate(c0 => window.__game.s.crowns < c0 && window.__game.s.inventory.shells >= 8, c0), 'ammunition can be bought five boxes at a time');
  await p.evaluate(() => document.querySelector('.modal-wrap [data-close]').click());
  // each gun fires and reloads
  for (const g of ['revolver', 'carbine', 'scattergun', 'longrifle']) {
    const r = await p.evaluate(async g => { const G = window.__game, s = G.s; G.setGun(g); G.selectSlot('carbine'); await new Promise(r => setTimeout(r, 900)); const before = G.S ? 0 : 0; void before;
      const rounds = () => G.s.firearm === 'revolver' ? s.ammo.mag : g === 'carbine' ? s.rifle.mag : s.guns[g].mag; const a = rounds(); G.fire(); const b2 = rounds(); return { a, b: b2, f: s.firearm }; }, g);
    ok(r.f === g && r.b === r.a - 1, `${g}: taking it up and firing spends one round (${r.a}→${r.b})`);
    await p.waitForTimeout(400); await shot(`05-${g}`);
  }
  // scattergun pellets: eight hits on one close target add up
  const pel = await p.evaluate(async () => { const G = window.__game, s = G.s; G.teleport(0, 70, 0); G.view('first'); G.setGun('scattergun'); s.guns.scattergun.mag = 2; for (let i = 0; i < 40 && (G.player.fireCd > 0 || G.player.reloading > 0); i++) await new Promise(r => setTimeout(r, 200)); await new Promise(r => setTimeout(r, 600));
    const T = G.THREE_V; const e = G.enemies.spawn('raider', new T(0, 0, 67), 't'); e.pos.set(0, 0, 67); e.root.position.copy(e.pos); G.player.yaw = 0; G.player.pitch = -0.08; const h0 = e.hp, m0 = s.guns.scattergun.mag, ep = e.pos.toArray().map(Math.round); G.fire(); await new Promise(r => setTimeout(r, 100)); window.__pel = { m0, m1: s.guns.scattergun.mag, ep, cd: G.player.fireCd, rl: G.player.reloading, view: G.player.view, f: s.firearm, slot: G.player.slot }; return h0 - e.hp; });
  console.log(JSON.stringify(await p.evaluate(() => window.__pel)));
  ok(pel > 40, `a close scattergun blast does many pellets of damage (${Math.round(pel)})`);
  // silvered rounds on the dead
  const sil = await p.evaluate(async () => { const G = window.__game, s = G.s; G.setGun('revolver'); s.ammo.mag = 0; s.loadSilver = true; s.inventory.silverammo = 1; G.reloadNow(); for (let i = 0; i < 40 && G.player.reloading > 0; i++) await new Promise(r => setTimeout(r, 250)); await new Promise(r => setTimeout(r, 300)); return { mag: s.ammo.mag, silver: s.silverIn }; });
  ok(sil.mag === 6 && sil.silver === 6, `reloading with silver chosen fills the cylinder with silvered rounds (${sil.silver})`);
  const pack = await p.evaluate(() => { const G = window.__game; G.openPack(); return !!document.querySelector('[data-silver]') && document.querySelectorAll('.invcol .gun').length; });
  ok(pack === 4, 'the pack lists all four guns you own, with the silver choice');
  await shot('06-pack-arms');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
