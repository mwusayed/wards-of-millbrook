// Browser check for the living-world features: map and walking, door events, bounty notices, moods, weather.
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:5198/';
const out = 'shots4'; fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shot = async n => { await g(() => window.__game.step(0.1)); await wait(350); await page.screenshot({ path: `${out}/${n}.png` }); };
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`); };
  await g(() => { localStorage.clear(); }); await page.reload(); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  await g(() => window.__game.start('standard')); await wait(500);
  // discovery and the map
  await g(() => { const G = window.__game; for (const e of [...G.enemies.list]) G.enemies.remove(e); const p = G.world.places.cairn_mill_road; G.teleport(p.x + 3, p.z + 3); G.step(0.3); G.storyTick(); });
  ok('walking up to a cairn discovers it', await g(() => window.__game.s.discovered.includes('cairn_mill_road')), JSON.stringify(await g(() => window.__game.s.discovered)));
  await g(() => window.__game.openMap()); await wait(400); await shot('40-map');
  ok('map lists Home as a place to walk to', await g(() => !!document.querySelector('[data-go="home"]')));
  const before = await g(() => window.__game.s.minutes);
  await g(() => document.querySelector('[data-go="home"]').click()); await wait(3500); await g(() => window.__game.step(0.5));
  const after = await g(() => ({ m: window.__game.s.minutes, d: window.__game.player.pos.distanceTo(window.__game.world.homeSpawn), modal: window.__game.modalOpen() }));
  ok('walking home moves you and costs time', after.d < 6 && after.m > before + 1, JSON.stringify({ before, after }));
  // door events: every event's every option runs without error
  const door = await g(() => { const G = window.__game; const bad = []; let n = 0; for (const e of G.DOOR_EVENTS) { e.options.forEach((o, i) => { try { G.s.crowns = 200; const t = o.run(G.s); n++; if (!t || typeof t !== 'string') bad.push(e.id + ':' + i); } catch (err) { bad.push(e.id + ':' + i + ' ' + err); } }); } return { n, bad }; });
  ok(`all ${door.n} door-event options run`, door.bad.length === 0 && door.n > 15, JSON.stringify(door.bad));
  await g(() => { const G = window.__game; G.P.openDoorEvent(G.ui, G.DOOR_EVENTS[0]); }); await wait(300); await shot('41-door-event');
  await g(() => document.querySelector('[data-opt="0"]').click()); await wait(200); await shot('42-door-result');
  await g(() => document.querySelector('[data-ok]').click()); await wait(200);
  ok('door event closes cleanly', await g(() => !window.__game.modalOpen()));
  // bounty notice on an even day
  await g(() => { const G = window.__game; G.s.minutes = 4 * 1440 + 9 * 60; G.step(2.2); G.storyTick(); G.openBoard(); }); await wait(300); await shot('43-board-bounty');
  ok('notice board offers a bounty on an even day', await g(() => /Bounty:/.test(document.querySelector('.modal').textContent)), await g(() => 'day ' + Math.floor(window.__game.s.minutes / 1440 + 1)));
  await g(() => window.__game.closeModal());
  // moods and weather
  const moods = await g(() => { const G = window.__game; const o = {}; G.teleport(G.world.homeSpawn.x, G.world.homeSpawn.z); G.s.minutes = 4 * 1440 + 10 * 60; G.step(0.3); o.home = G.pickMood(); G.teleport(0, 0); G.step(0.3); o.town = G.pickMood(); for (const e of [...G.enemies.list]) G.enemies.remove(e); G.teleport(-60, 70); G.step(0.3); o.vale = G.pickMood(); G.s.minutes = 4 * 1440 + 23 * 60; G.step(0.3); return new Promise(r => setTimeout(() => { o.night = G.pickMood(); r(o); }, 1500)); });
  ok('music mood follows place and hour', moods.home === 'home' && moods.town === 'town' && moods.night === 'night', JSON.stringify(moods));
  await g(() => { const G = window.__game; G.s.minutes = 5 * 1440 + 13 * 60; G.world.weather = 'storm'; G.view('third'); G.teleport(0, 12, 0); G.step(1.5); }); await shot('44-weather');
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(2); });
