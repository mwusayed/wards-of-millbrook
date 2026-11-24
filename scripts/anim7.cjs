// Contact sheets of the v0.7 animation: frames of each motion, cropped around the character, side view.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e.stack || e)));
  await page.goto('http://127.0.0.1:5198/'); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, a) => page.evaluate(fn, a); const wait = ms => new Promise(r => setTimeout(r, ms));
  await g(() => { localStorage.clear(); window.__game.start('standard'); }); await wait(400);
  fs.mkdirSync('shots7/anim', { recursive: true });
  // a side-on camera: freeze the frame loop's camera by moving the player model into an open field and
  // placing the camera to its left
  await g(() => { const G = window.__game; for (const e of [...G.enemies.list]) G.enemies.remove(e); G.s.minutes = Math.floor(G.s.minutes / 1440) * 1440 + 12 * 60; G.view('third'); G.teleport(80, 30); G.player.yaw = -Math.PI / 2; G.step(0.3);
    window.__camHook = (cam, pl) => { const p = pl.pos; cam.position.set(p.x + 0.4, 1.15, p.z + 3.6); cam.lookAt(p.x + 0.4, 0.95, p.z); };
    window.__snap = () => {}; });
  let n = 0;
  const frame = async (name) => { await g(() => window.__snap()); await wait(250); const buf = await page.screenshot({ clip: { x: 300, y: 60, width: 300, height: 480 } }); fs.writeFileSync(`shots7/anim/${String(n++).padStart(2, '0')}-${name}.png`, buf); };
  // walk cycle: hold W, step a little, snap
  for (const [label, key, sprint] of [['walk', 'KeyW', false], ['run', 'KeyW', true]]) {
    await page.keyboard.down(key); if (sprint) await page.keyboard.down('ShiftLeft');
    for (let i = 0; i < 4; i++) { await g(dt => { window.__game.step(dt); window.__game.teleport(80, 30); }, sprint ? 0.07 : 0.1); await frame(`${label}${i}`); }
    await page.keyboard.up(key); if (sprint) await page.keyboard.up('ShiftLeft');
    await g(() => window.__game.step(0.5));
  }
  await g(() => { window.__game.toggleHolster(); window.__game.step(0.6); }); await frame('idle-holstered');
  await page.keyboard.down('KeyW'); for (let i = 0; i < 3; i++) { await g(() => { window.__game.step(0.12); window.__game.teleport(80, 30); }); await frame('walk-holstered' + i); } await page.keyboard.up('KeyW');
  // jump arc and landing
  await g(() => { window.__game.toggleHolster(); window.__game.step(0.5); });
  await page.keyboard.down('Space'); await g(() => window.__game.step(0.05)); await page.keyboard.up('Space');
  for (let i = 0; i < 5; i++) { await g(() => window.__game.step(0.15)); await frame('jump' + i); }
  await page.keyboard.down('KeyA'); for (let i = 0; i < 3; i++) { await g(() => { window.__game.step(0.12); window.__game.teleport(80, 30); }); await frame('strafe' + i); } await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyS'); for (let i = 0; i < 2; i++) { await g(() => { window.__game.step(0.12); window.__game.teleport(80, 30); }); await frame('back' + i); } await page.keyboard.up('KeyS');
  await g(() => { const G = window.__game; G.player.model.flinch(0.5, 1, 1.5); G.step(0.08); }); await frame('flinch');
  console.log('frames', n, 'errors', errors.length, errors[0] ?? '');
  await browser.close();
})();
