// Contact frames of the v0.8 animation: a barrow wight rising, lurching and chopping; a grave-light weaving and
// swelling. Side-on camera that follows the creature. Writes shots8/anim/*.png and shots8/anim8-sheet.png.
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:5198/';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e.stack || e)));
  await page.goto(url); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, a) => page.evaluate(fn, a); const wait = ms => new Promise(r => setTimeout(r, ms));
  await g(() => { localStorage.clear(); window.__game.start('standard'); }); await wait(400);
  fs.mkdirSync('shots8/anim', { recursive: true });
  await g(() => {
    const G = window.__game; for (const e of [...G.enemies.list]) G.enemies.remove(e);
    G.s.minutes = Math.floor(G.s.minutes / 1440) * 1440 + 12 * 60; G.s.story.flags.westGateOpen = 1; G.syncBarrow(); G.view('third');
    G.teleport(-150, 60); G.player.yaw = 0; G.step(0.3);
    window.__target = null;
    window.__camHook = (cam, pl) => { const t = window.__target ? window.__target.pos : pl.pos; cam.position.set(t.x + 4.2, 1.3, t.z + 0.2); cam.lookAt(t.x, 1.0, t.z); };
  });
  let n = 0; const files = [];
  const frame = async name => { await wait(220); const f = `shots8/anim/${String(n++).padStart(2, '0')}-${name}.png`; await page.screenshot({ path: f, clip: { x: 300, y: 80, width: 300, height: 440 } }); files.push(f); };
  // the wight rises out of the ground
  await g(() => { const G = window.__game, V = G.THREE_V; const e = G.enemies.spawn('wight', new V(-150, 0, 50), 'anim', false, true); e.pos.set(-150, 0, 50); e.yaw = -Math.PI / 2; window.__target = e; G.player.pos.set(-150, 0, 70); });
  for (const dt of [0.2, 0.5, 0.5, 0.5, 0.5]) { await g(dt => window.__game.step(dt), dt); await frame('rise'); }
  // it lurches toward you on its dragging leg
  await g(() => { const G = window.__game, e = window.__target; G.player.pos.set(-150, 0, 40); e.state = 'chase'; e.t = 0; });
  for (let i = 0; i < 5; i++) { await g(() => window.__game.step(0.16)); await frame('lurch'); }
  // the two-handed chop
  await g(() => { const G = window.__game, e = window.__target; e.pos.set(-150, 0, 42); G.player.pos.set(-150, 0, 40); e.state = 'windup'; e.t = 0; e.anim = 0; });
  for (let i = 0; i < 5; i++) { await g(() => window.__game.step(0.22)); await frame('chop'); }
  // a grave-light weaves in and swells
  await g(() => { const G = window.__game, V = G.THREE_V; G.enemies.remove(window.__target); G.s.minutes = Math.floor(G.s.minutes / 1440) * 1440 + 22 * 60; const w = G.enemies.spawn('wisp', new V(-150, 0, 30), 'anim'); w.pos.set(-150, 0, 30); w.state = 'chase'; window.__target = w; G.player.pos.set(-150, 0, 16); });
  for (let i = 0; i < 4; i++) { await g(() => window.__game.step(0.25)); await frame('wisp'); }
  await g(() => { const w = window.__target; w.state = 'windup'; w.t = 0; w.anim = 0; window.__game.player.pos.set(-150, 0, w.pos.z - 4); });
  for (let i = 0; i < 3; i++) { await g(() => window.__game.step(0.2)); await frame('swell'); }
  await g(() => { window.__camHook = null; });
  console.log(JSON.stringify({ frames: n, errors: errors.slice(0, 3) }));
  await browser.close();
})();
