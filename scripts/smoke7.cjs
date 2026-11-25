// v0.9.3 browser checks: the Saltway Coast (docs/gdd/saltway.md §8) plus the v0.9.2 handover checks: a real walk
// from Dorran's smithy to the Salt Gap, blast damage at safe and unsafe distances, loading before and after the
// blast and mid-fuse, the rockfall's disappearance, a new game after loading an open gap, the tide and its carry,
// wading, crabs/smugglers/pistoleers, the Sea Cave and the Wreck-Mother, all five quests and all three Collector
// decisions with save restoration, services, NPC presence and screenshots by day and night.
// Usage: node scripts/smoke7.cjs <url> [shotDir]
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:5198/';
const SHOTS = process.argv[3] || 'shots93';
fs.mkdirSync(SHOTS, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e.stack || e))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let pass = 0, fail = 0; const crit = {};
  const ok = (c, name, cond, extra = '') => { cond ? pass++ : fail++; (crit[c] = crit[c] || []).push(cond); console.log(`${cond ? 'PASS' : 'FAIL'}  [${c}] ${name} ${cond ? '' : extra}`); };
  const waitIdle = async (ms = 30000) => { for (let i = 0; i * 200 < ms; i++) { if (await g(() => !window.__game.player.action)) return true; await g(() => window.__game.step(0.2)); } return false; }; // P1: stations end on the game clock
  const closeAll = () => g(() => { const G = window.__game; for (let i = 0; i < 6 && G.modalOpen(); i++) G.closeModal(); });
  const shot = async (n, view = 'first') => { await g(v => { window.__game.view(v); window.__game.step(0.15); }, view); await wait(500); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
  const clear = () => g(() => { const G = window.__game; for (const e of [...G.enemies.list]) if (!e.external) G.enemies.remove(e); });
  const hour = h => g(h => { const s = window.__game.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + Math.round(h * 60); }, h);
  const look = (yaw, pitch = 0) => g(([y, p]) => { const G = window.__game; G.player.yaw = y; G.player.pitch = p; }, [yaw, pitch]);
  const fresh = async () => { await g(() => { const G = window.__game; G.newGame('standard'); const s = G.s; s.crowns = 400; s.quests.mq1 = { stage: 9, state: 'done', startDay: 1, doneDay: 1 }; G.S.updateQuests(s); }); await clear(); };
  /** Walk with the movement keys toward each waypoint in turn (no teleporting); returns where it ended up. */
  const walk = async (pts, maxSec = 120) => g(async ([pts, maxSec]) => {
    const G = window.__game, P = G.player; let i = 0, t = 0, stuck = 0, last = P.pos.clone();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    while (i < pts.length && t < maxSec) {
      const [x, z] = pts[i], dx = x - P.pos.x, dz = z - P.pos.z;
      if (Math.hypot(dx, dz) < 1.2) { i++; continue; }
      P.yaw = Math.atan2(-dx, -dz); P.pitch = 0; G.step(0.5); t += 0.5;
      if (P.pos.distanceTo(last) < 0.3) stuck++; else stuck = 0; last.copy(P.pos);
      if (stuck > 6) break;
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
    return { x: P.pos.x, z: P.pos.z, reached: i, of: pts.length, t, stuck: stuck > 6 };
  }, [pts, maxSec]);
  await g(() => { localStorage.clear(); window.__game.start('standard');
    // step with the player kept alive, summing the damage taken (combat checks must not end in a collapse)
    window.__hstep = (sec, each) => { const G = window.__game, s = G.s; let hurt = 0; for (let i = 0; i < Math.round(sec / 0.1); i++) { s.wounds.length = 0; s.hp = G.GS.maxHp(s); const h = s.hp; G.step(0.1); hurt += Math.max(0, h - s.hp); each?.(i); } s.hp = G.GS.maxHp(s); return hurt; }; });
  await wait(600);
  await fresh();

  // ================= 1. The Salt Gap =================
  await hour(10);
  const pre = await g(() => { const G = window.__game, s = G.s; return { coast: G.GS && true, offer: G.S.talkChoices(s, 'sera').some(c => c.key === 'offer:sq1'), blocked: G.world.colliders.includes(G.world.south.rockfall.collider) }; });
  ok(1, 'the coast is on: Sera offers The Salt Gap and the rockfall collider is in place', pre.offer && pre.blocked, JSON.stringify(pre));
  // the real walk: Dorran's smithy, out of the South Gate, down the Vale past the Whisper Stones, into the gap
  await g(() => { const G = window.__game; G.teleport(25.4, 16.4); });
  const route = [[20.5, 16], [12, 22], [1, 26], [0, 30], [0, 36], [0, 50], [6, 80], [3, 92], [3, 104], [10, 106], [11, 118], [6, 128], [2, 134], [2, 144]];
  const w1 = await walk(route, 160);
  const held = await g(() => window.__game.player.pos.z);
  ok(1, 'walking from the smithy to the gap on foot (no teleport) is stopped by the rockfall', w1.reached >= route.length - 1 && held < 145.2 && held > 136, JSON.stringify(w1));
  await look(Math.PI, 0.05); await shot('01-rockfall-day');
  // Dorran: the counter sells the charge before the quest; once The Salt Gap asks, the quest line is the purchase
  const dor = await g(() => { const G = window.__game; G.talkTo('dorran'); const svc = !!document.querySelector('[data-svc="charge"]'); const story = [...document.querySelectorAll('[data-story]')].some(b => /blasting charge/i.test(b.textContent)); return { svc, story }; });
  await closeAll();
  await g(() => { const G = window.__game; G.S.chooseTalk(G.s, 'offer:sq1'); });
  const dor2 = await g(() => { const G = window.__game; G.talkTo('dorran'); const svc = !!document.querySelector('[data-svc="charge"]'); const b = [...document.querySelectorAll('[data-story]')].find(b => /blasting charge/i.test(b.textContent)); const c0 = G.s.crowns; b?.click(); return { svc, story: !!b, bought: G.s.inventory.blastcharge, paid: c0 - G.s.crowns, stage: G.s.quests.sq1.stage }; });
  await closeAll();
  const dor3 = await g(() => { const G = window.__game; G.talkTo('dorran'); const r = { svc: !!document.querySelector('[data-svc="charge"]'), story: [...document.querySelectorAll('[data-story]')].some(b => /blasting charge/i.test(b.textContent)) }; return r; });
  await closeAll();
  ok(6, 'Dorran: his counter sells a charge before the quest; during The Salt Gap only the quest line does; one charge only', dor.svc && !dor.story && !dor2.svc && dor2.story && dor2.bought === 1 && dor2.paid === 25 && !dor3.svc && !dor3.story, JSON.stringify({ dor, dor2, dor3 }));
  // set the charge; save mid-fuse and load: the fuse starts again
  await g(() => { const G = window.__game; G.teleport(2, 141); G.interactWith('rockfall'); }); await waitIdle();
  const set1 = await g(() => { const G = window.__game, s = G.s; G.step(3); const left = G.fuseRemaining; G.save(); G.step(1); G.load(); return { set: G.S.flag(s, 'chargeSet') || G.S.flag(G.s, 'chargeSet'), inv: G.s.inventory.blastcharge, left, after: G.fuseRemaining, open: G.S.flag(G.s, 'saltGapOpen') }; });
  ok(1, 'setting the charge uses it; loading mid-fuse lights the fuse again from 8 s', set1.set === 1 && set1.inv === 0 && set1.left < 5.5 && set1.after === 8 && !set1.open, JSON.stringify(set1));
  // a save from before the blast, for the load checks
  await g(() => window.__game.saveTo('1'));
  // unsafe distance: stand 3 m from the charge
  const near = await g(() => { const G = window.__game, s = G.s, c = G.world.south.charge; G.teleport(c.x + 1.5, c.z - 2.5); const h = s.hp; for (let i = 0; i < 86; i++) { for (const e of [...G.enemies.list]) if (!e.external) G.enemies.remove(e); G.step(0.1); } return { dmg: h - s.hp, open: G.S.flag(s, 'saltGapOpen'), collider: G.world.colliders.includes(G.world.south.rockfall.collider), shown: G.world.south.rockfall.meshes.filter(m => m.visible).length, of: G.world.south.rockfall.meshes.length, stage: s.quests.sq1.stage }; });
  ok(1, 'the blast at 3 m does the near damage (40 at Standard); the rockfall collider and most boulders are gone', near.dmg >= 30 && near.open === 1 && !near.collider && near.shown <= 3 && near.stage >= 2, JSON.stringify(near));
  await g(() => window.__game.step(1.5)); await look(Math.PI, 0.02); await g(() => { const G = window.__game; G.teleport(2, 139); }); await shot('02-gap-open-day');
  const through = await walk([[2, 150], [2, 172], [6, 184]], 30);
  ok(1, 'after the blast you can walk through the gap and on to the Saltway', through.z > 178, JSON.stringify(through));
  const persist = await g(() => { const G = window.__game; G.save(); G.load(); const a = { flag: G.S.flag(G.s, 'saltGapOpen'), collider: G.world.colliders.includes(G.world.south.rockfall.collider) }; G.loadFrom('1'); const b = { flag: G.S.flag(G.s, 'saltGapOpen'), charge: G.S.flag(G.s, 'chargeSet'), collider: G.world.colliders.includes(G.world.south.rockfall.collider), shown: G.world.south.rockfall.meshes.filter(m => m.visible).length }; G.load(); const c = { flag: G.S.flag(G.s, 'saltGapOpen'), collider: G.world.colliders.includes(G.world.south.rockfall.collider) }; return { a, b, c }; });
  ok(1, 'loading after the blast keeps the gap open; a save from before it closes the gap again with every boulder back', persist.a.flag === 1 && !persist.a.collider && persist.b.flag !== 1 && persist.b.collider && persist.b.shown === 9 && persist.c.flag === 1 && !persist.c.collider, JSON.stringify(persist));
  // a new game after loading an open gap
  const ng = await g(() => { const G = window.__game; G.load(); G.newGame('standard'); return { flag: G.S.flag(G.s, 'saltGapOpen'), collider: G.world.colliders.includes(G.world.south.rockfall.collider), shown: G.world.south.rockfall.meshes.filter(m => m.visible).length, prompt: !G.world.interactables.find(i => i.id === 'rockfall').hidden }; });
  ok(1, 'a new game after loading an open gap starts with the rockfall back: collider, all nine boulders and the prompt', ng.flag !== 1 && ng.collider && ng.shown === 9 && ng.prompt, JSON.stringify(ng));
  // safe and middle distances, each in a fresh game
  const dist = [];
  for (const d of [9, 20]) {
    await fresh();
    dist.push(await g(d => { const G = window.__game, s = G.s, c = G.world.south.charge; G.coast.buyCharge(s); G.teleport(2, 141); G.interactWith('rockfall'); return new Promise(r => { const t = setInterval(() => { if (!G.player.action) { clearInterval(t); G.teleport(c.x, c.z - d); const h = s.hp; for (let i = 0; i < 86; i++) { for (const e of [...G.enemies.list]) if (!e.external) G.enemies.remove(e); G.step(0.1); } r({ d, dmg: h - s.hp, open: G.S.flag(s, 'saltGapOpen') }); } }, 150); }); }, d));
  }
  ok(1, 'at 9 m the blast does the far damage (15); at 20 m none', dist[0].dmg >= 10 && dist[0].dmg <= 20 && dist[1].dmg === 0 && dist.every(x => x.open === 1), JSON.stringify(dist));

  // ================= 2. The Saltway and Gullhaven =================
  // (this is a fresh game whose charge was bought at Dorran's counter before the quest: Sera's offer now skips ahead)
  const skip = await g(() => { const G = window.__game, s = G.s; G.S.chooseTalk(s, 'offer:sq1'); G.S.updateQuests(s); return { state: s.quests.sq1?.state, stage: s.quests.sq1?.stage }; });
  ok(6, 'a charge bought before The Salt Gap counts: accepting the quest after the blast goes straight to the Saltway', skip.state === 'active' && skip.stage === 2, JSON.stringify(skip));
  await clear(); await hour(11);
  const disc = await g(async () => { const G = window.__game, s = G.s;
    for (const [x, z] of [[20, 202], [40, 230], [62, 252], [68, 300], [76, 338]]) { G.teleport(x, z); G.step(0.3); G.storyTick(); }
    return { gh: s.discovered.includes('place:gullhaven'), tower: s.discovered.includes('place:gulltower'), shrine: s.discovered.includes('place:saltway'), stage: s.quests.sq1?.stage, region: G.world.regionAt(G.player.pos).id, zone: G.player.zone, mood: G.pickMood() }; });
  ok(2, 'down the Saltway: the shrine, the Gull Tower and Gullhaven are discovered; you are in Gullhaven', disc.gh && disc.tower && disc.shrine && disc.region === 'gullhaven' && disc.zone === 'gullhaven', JSON.stringify(disc));
  await g(() => window.__game.teleport(88, 364)); await look(0.25, 0.08); await shot('03-gullhaven-day');
  await g(() => window.__game.openMap()); await wait(400);
  const mp = await g(() => { const t = document.body.innerText; return { sheet: !!document.querySelector('[data-view="coast"]'), title: /Saltway Coast/.test(t), gh: /Gullhaven|GULLHAVEN/.test(t), travel: [...document.querySelectorAll('[data-go], [data-travel], button')].some(b => /Gullhaven|Salt Gap|Gull Tower/.test(b.textContent)) }; });
  await page.screenshot({ path: `${SHOTS}/04-map-coast.png` }); await closeAll();
  ok(2, 'the map has a Saltway Coast sheet with Gullhaven, and coast places to walk to', mp.sheet && mp.title && mp.gh && mp.travel, JSON.stringify(mp));
  const bree = await g(() => { const G = window.__game, s = G.s; G.talkTo('bree'); const b = [...document.querySelectorAll('[data-story]')][0]; b?.click(); G.closeModal(); G.storyTick(); return { sq1: s.quests.sq1.state, sq2: s.quests.sq2?.state, gh: s.factions.gullhaven, board: s.board.filter(c => c.board === 'coast').length }; });
  ok(6, 'Bree Calloway closes The Salt Gap (+10 Gullhaven) and False Lights begins', bree.sq1 === 'done' && bree.sq2 === 'active' && bree.gh >= 10 && bree.board >= 3, JSON.stringify(bree));
  // the notice post and a coast contract paid at the coast post
  await g(() => window.__game.interactWith('notice_coast')); await wait(300);
  const nb = await g(() => { const G = window.__game; const t = document.body.innerText; return { modal: G.modalOpen(), post: /Gullhaven's notice post/.test(t), n: document.querySelectorAll('[data-take]').length }; });
  await closeAll();
  ok(7, 'Gullhaven\'s notice post lists coast work', nb.modal && nb.post && nb.n >= 3, JSON.stringify(nb));

  // ================= 3. The tide =================
  await clear();
  const tide = await g(() => { const G = window.__game, s = G.s, out = []; G.teleport(-10, 352); for (const h of [2, 8, 14, 20, 5]) { s.minutes = Math.floor(s.minutes / 1440) * 1440 + h * 60; G.step(0.1); out.push([h, +G.coast.tideAt(s).toFixed(3), +G.world.south.sea.position.y.toFixed(3)]); } return out; });
  const tideOk = Math.abs(tide[0][1] - 1) < 0.01 && Math.abs(tide[1][1] + 1) < 0.01 && Math.abs(tide[2][1] - 1) < 0.01 && Math.abs(tide[3][1] + 1) < 0.01 && tide[0][2] > tide[1][2] + 0.4;
  ok(3, 'the tide follows cos(2π(h−2)/12): high at 02:00/14:00, low at 08:00/20:00, and the sea surface moves with it', tideOk, JSON.stringify(tide));
  await hour(13); const wr0 = await g(() => { const G = window.__game; G.teleport(-16.6, 388.4); G.interactWith('wreck_log'); return null; }); void wr0; await waitIdle();
  const wr1 = await g(() => { const G = window.__game, s = G.s; return { log: s.inventory.wrenlog, z: G.player.pos.z }; });
  ok(3, 'at high water the wreck cannot be searched (and standing out there, the sea carries you ashore)', wr1.log === 0 && wr1.z < 368, JSON.stringify(wr1));
  await hour(8.2); await g(() => { const G = window.__game; G.teleport(-16.6, 388.4); G.interactWith('wreck_log'); }); await waitIdle();
  const wr2 = await g(() => { const G = window.__game, s = G.s; G.storyTick(); return { log: s.inventory.wrenlog, wreck: s.discovered.includes('place:wreck') }; });
  ok(3, 'at low water you can walk to the wreck and take the Merry Wren\'s log', wr2.log === 1 && wr2.wreck, JSON.stringify(wr2));
  await look(0.6, 0); await shot('05-wreck-low-tide', 'third');
  // the warning, then the carry
  // (one evaluate each: the live frame loop must not see the player out there between the steps)
  const warn = await g(() => { const G = window.__game, s = G.s; s.minutes = (Math.floor(s.minutes / 1440) + 1) * 1440 + 573; G.teleport(-14, 352); G.step(0.1); G.feed.lines.length = 0; const before = G.feed.lines.length; G.teleport(-20, 382); G.step(0.5); const lines = G.feed.lines.filter(l => /tide has turned/i.test(l.text)).length; G.step(0.5); return { warned: lines === 1, once: G.feed.lines.filter(l => /tide has turned/i.test(l.text)).length === 1, flood: G.coast.minutesToFlood(s), before }; });
  const carry = await g(() => { const G = window.__game, s = G.s; G.teleport(-20, 382); s.minutes += 40; s.stamina = 60; const n = s.counters.tideCarried ?? 0; G.GS.tideCarryProbe = 0; G.step(0.1); return { z: G.player.pos.z, st: s.stamina, n: (s.counters.tideCarried ?? 0) - n, log: s.log.slice(-3).some(l => /tide comes back/i.test(l.text)), hp: s.hp > 0 }; });
  ok(3, 'half an hour before the flood you are warned (once); when it comes in you are carried to the shore (−10 stamina), not drowned', warn.warned && warn.once && carry.z < 360 && carry.st < 55 && carry.n === 1 && carry.log && carry.hp, JSON.stringify({ warn, carry }));
  // wading
  const wade = await g(async () => { const G = window.__game, s = G.s, P = G.player; const run = async () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); const z0 = P.pos.z; G.step(1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); return Math.abs(P.pos.z - z0); };
    const at = h => { s.minutes = Math.floor(s.minutes / 1440) * 1440 + h * 60; };
    s.gear.seaboots = false; s.gear.waders = false;
    at(13); G.teleport(-10, 362); P.yaw = Math.PI; G.step(0.1); const wet = G.coastWading, k = G.wadeK; const dWet = await run();
    at(8); G.teleport(-10, 352); P.yaw = Math.PI; G.step(0.1); const dry = G.coastWading; const dDry = await run();
    at(13); s.gear.seaboots = true; G.teleport(-10, 352); P.yaw = Math.PI; G.step(0.1); const kb = G.wadeK; const dBoot = await run(); s.gear.seaboots = false;
    return { wet, k, dry, kb, dWet: +dWet.toFixed(2), dDry: +dDry.toFixed(2), dBoot: +dBoot.toFixed(2) }; });
  ok(3, 'the near flats are waded while the water is on them (×0.65), dry at low water; sea boots wade at full speed', wade.wet && Math.abs(wade.k - 0.65) < 1e-6 && !wade.dry && wade.kb === 1 && wade.dWet < wade.dDry * 0.8 && wade.dBoot > wade.dWet * 1.2, JSON.stringify(wade));

  // ================= 4. Crabs, smugglers, pistoleers =================
  await clear(); await hour(12);
  const crab = await g(() => { const G = window.__game, s = G.s, V = G.THREE_V; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 8 * 60; G.teleport(-10, 352); const e = G.enemies.spawn('crab', new V(-10, 0, 356), 'test', false, true); e.state = 'chase';
    const a = []; const states = new Set(); let minD = 99, maxD = 0; const hurt = window.__hstep(6, i => { const d = Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z); states.add(e.state); if (i > 10) { minD = Math.min(minD, d); maxD = Math.max(maxD, d); } a.push(Math.atan2(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z)); });
    let swing = 0; for (let i = 1; i < a.length; i++) { let d = a[i] - a[i - 1]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; swing += Math.abs(d); }
    const h0 = e.hp; G.enemies.damage(e, 10, G.now, undefined, 'bullet'); const bullet = h0 - e.hp; const h1 = e.hp; G.enemies.damage(e, 10, G.now, undefined, 'frost'); const frost = h1 - e.hp;
    return { states: [...states], swing: +swing.toFixed(2), minD: +minD.toFixed(2), maxD: +maxD.toFixed(2), bullet, frost, hurt }; });
  ok(4, 'shore crabs circle sideways, dart in to pinch and back off; bullets do ×0.6, frost ×1.5', crab.swing > 1.0 && crab.states.includes('windup') && crab.minD < 1.8 && crab.hurt > 0 && crab.bullet === 6 && crab.frost === 15, JSON.stringify(crab));
  await clear();
  const pist = await g(() => { const G = window.__game, s = G.s, V = G.THREE_V; G.teleport(40, 226); const e = G.enemies.spawn('pistoleer', new V(40, 0, 240), 'test', false, true); e.state = 'chase';
    const ds = [], states = []; const hurt = window.__hstep(14, () => { ds.push(Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z)); states.push(e.state); });
    const tail = ds.slice(40); return { minD: +Math.min(...tail).toFixed(1), maxD: +Math.max(...tail).toFixed(1), windups: states.filter((x, i) => x === 'windup' && states[i - 1] !== 'windup').length, recover: states.includes('recover'), hurt }; });
  ok(4, 'pistoleers keep their distance (about 10–16 m), aim, fire, and reload between shots', pist.minD > 8 && pist.maxD < 19 && pist.windups >= 2 && pist.recover && pist.hurt > 0, JSON.stringify(pist));
  await clear();
  const smug = await g(() => { const G = window.__game, s = G.s, V = G.THREE_V; G.teleport(-80, 350); const e = G.enemies.spawn('smuggler', new V(-80, 0, 358), 'test', false, true); e.state = 'chase'; let close = 99; const hurt = window.__hstep(8, () => { close = Math.min(close, Math.hypot(e.pos.x - G.player.pos.x, e.pos.z - G.player.pos.z)); }); return { close: +close.toFixed(2), hurt, def: e.def.hp }; });
  ok(4, 'cove smugglers close in and fight with the cutlass, as raiders do (85 hp)', smug.close < 2.4 && smug.hurt > 0 && smug.def === 85, JSON.stringify(smug));
  const sites = await g(() => { const G = window.__game; G.enemies.list.length; for (const e of [...G.enemies.list]) G.enemies.remove(e); G.s.minutes += 1440; G.step(0.1); const by = {}; for (const e of G.enemies.list) if (e.tag === null) { for (const [k, v] of Object.entries(G.world.sites)) if (e.home.equals(v) && ['saltway', 'gull_tower', 'tidal_flats', 'wreckers_cove'].includes(k)) (by[k] = by[k] || []).push(e.kind); } return by; });
  ok(4, 'each morning the coast sites fill: smugglers on the Saltway, a pistoleer at the Gull Tower, crabs on the flats, both at the cove', sites.saltway?.includes('smuggler') && sites.gull_tower?.includes('pistoleer') && sites.tidal_flats?.filter(k => k === 'crab').length >= 2 && sites.wreckers_cove?.includes('pistoleer'), JSON.stringify(sites));

  // ================= 6. False Lights up to the cave =================
  await clear(); await hour(10);
  const fl = await g(async () => { const G = window.__game, s = G.s, S = G.S; G.talkTo('trewin'); [...document.querySelectorAll('[data-story]')].find(b => /swear the light/i.test(b.textContent))?.click(); G.closeModal(); S.updateQuests(s); return { stage: s.quests.sq2.stage }; });
  await g(() => { const G = window.__game; G.teleport(64, 252); G.interactWith('tower_lantern'); }); await waitIdle();
  await hour(12); await g(() => { const G = window.__game; G.interactWith('customs_desk'); }); await waitIdle();
  const desk1 = await g(() => window.__game.s.inventory.customsledger);
  await hour(20.5); await g(() => { const G = window.__game; G.interactWith('customs_desk'); }); await waitIdle();
  const fl2 = await g(() => { const G = window.__game, s = G.s; G.S.updateQuests(s); return { lantern: s.inventory.signallantern, lanternHidden: !G.world.scene.getObjectByName('signalLantern').visible, ledger: s.inventory.customsledger, stage: s.quests.sq2.stage }; });
  ok(6, 'False Lights: Trewin, the log, the Gull Tower\'s red lantern, Marrow\'s ledger only after hours', fl.stage >= 1 && desk1 === 0 && fl2.lantern === 1 && fl2.lanternHidden && fl2.ledger === 1 && fl2.stage === 4, JSON.stringify({ fl, desk1, fl2 }));
  await hour(22); await clear(); await look(Math.PI / 2); await g(() => window.__game.teleport(140, 384)); await look(-2.3, 0.12); await shot('06-lighthouse-night');

  // ================= 5. The Sea Cave and the Wreck-Mother =================
  await hour(11); await clear();
  await g(() => { const G = window.__game; G.teleport(-112, 378); G.interactWith('cave_mouth'); }); await g(() => window.__game.step(1.6)); /* P1: fade on the game clock */
  const cv = await g(() => { const G = window.__game, s = G.s; return { dungeon: G.world.dungeon, entered: G.S.flag(s, 'caveEntered'), stage: s.quests.sq2.stage }; });
  ok(5, 'the ledger\'s key opens the cave grille; you are inside the Sea Cave', cv.dungeon === 'seacave' && cv.entered === 1 && cv.stage >= 5, JSON.stringify(cv));
  const store = await g(() => { const G = window.__game, O = G.world.seacave.origin; G.teleport(O.x, O.z - 22); G.step(0.3); const g1 = G.enemies.list.filter(e => e.tag === 'seacave' && e.alive).map(e => e.kind); return g1; });
  ok(5, 'the smugglers\' store has its guards: two smugglers and a pistoleer', store.filter(k => k === 'smuggler').length === 2 && store.includes('pistoleer'), JSON.stringify(store));
  await look(0.3, 0); await shot('07-cave-store');
  const crates = await g(() => { const G = window.__game, s = G.s; for (const e of G.enemies.list.filter(e => e.tag === 'seacave')) G.enemies.remove(e); G.step(0.3); const c0 = s.crowns; return { c0 }; });
  await g(() => window.__game.interactWith('cave_crate_1')); await waitIdle(); await g(() => window.__game.interactWith('cave_crate_2')); await waitIdle(); await g(() => window.__game.interactWith('cave_crate_2')); await waitIdle();
  const crates2 = await g(() => window.__game.s.crowns);
  ok(7, 'the Merry Wren\'s cargo and strongbox can be looted once (105 crowns)', crates2 - crates.c0 === 105, JSON.stringify({ crates, crates2 }));
  // a save inside the cave restores into the cave
  const csave = await g(() => { const G = window.__game; G.save(); G.load(); return { dungeon: G.world.dungeon, x: G.player.pos.x }; });
  ok(8, 'a save inside the Sea Cave restores into the cave', csave.dungeon === 'seacave' && csave.x > 430, JSON.stringify(csave));
  // wake her
  const wk = await g(() => { const G = window.__game, M = G.mother, C = G.world.seacave; G.teleport(C.grotto.x, C.grotto.z + 15); window.__hstep(0.2); const a = M.active; window.__hstep(2.6); return { active: a, rising: M.rising <= 0, bar: G.bossBar()?.name }; });
  ok(5, 'the Wreck-Mother climbs out of the pool when you enter the grotto; a boss bar shows', wk.active && wk.rising && wk.bar === 'The Wreck-Mother', JSON.stringify(wk));
  await g(() => { const G = window.__game, e = G.mother.e, P = G.player; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = 0.05; G.world.seacave; }); await shot('08-wreck-mother', 'third');
  const armour = await g(() => { const G = window.__game, M = G.mother, e = M.e; const place = a => { const f = { x: -Math.sin(e.yaw + a), z: -Math.cos(e.yaw + a) }; G.teleport(e.pos.x + f.x * 7, e.pos.z + f.z * 7); M.cd = 99; M.atk = 'none'; M.update(0.0001, G.now, G.player.pos, true); };
    const hit = (a, rear) => { place(a); if (rear) { M.atk = 'rear'; M.t = 0.6; } const h = e.hp; G.enemies.damage(e, 100, G.now, undefined, 'bullet'); const d = h - e.hp; M.atk = 'none'; return Math.round(d); };
    return { front: hit(0, false), side: hit(Math.PI / 2, false), back: hit(Math.PI, false), belly: hit(0, true), hp: Math.round(e.hp) }; });
  ok(5, 'her front is shell (×0.3); the side and back take full hits; while she rears the belly takes ×1.8', armour.front === 30 && armour.side === 100 && armour.back === 100 && armour.belly === 180, JSON.stringify(armour));
  const atks = await g(() => { const G = window.__game, M = G.mother, e = M.e, s = G.s; e.hp = 1250; const seen = new Set(); let slowed = false, hurt = 0;
    const fwd = () => ({ x: -Math.sin(e.yaw), z: -Math.cos(e.yaw) });
    for (const r of [3.2, 3.2, 7.0, 3.2, 7.0, 3.2, 3.2]) { const f = fwd(); G.teleport(e.pos.x + f.x * r, e.pos.z + f.z * r); M.cd = 0; hurt += window.__hstep(3, () => { if (M.atk !== 'none') seen.add(M.atk); if (G.slowed) slowed = true; }); }
    return { seen: [...seen], hurt, slowed }; });
  ok(5, 'she sweeps, rears up and slams, and sprays brine (which slows you); each hurts', ['sweep', 'spray'].every(k => atks.seen.includes(k)) && (atks.seen.includes('rear') || atks.seen.includes('slam')) && atks.hurt > 20 && atks.slowed, JSON.stringify(atks));
  const calls = await g(() => { const G = window.__game, M = G.mother, e = M.e, s = G.s; M.called = [false, false]; for (const x of G.enemies.list.filter(x => x.tag === 'mother_call')) G.enemies.remove(x); e.hp = 1300 * 0.76; const f = { x: -Math.sin(e.yaw + Math.PI / 2), z: -Math.cos(e.yaw + Math.PI / 2) }; G.teleport(e.pos.x + f.x * 8, e.pos.z + f.z * 8); M.update(0.0001, G.now, G.player.pos, true); G.enemies.damage(e, 40, G.now, undefined, 'bullet'); window.__hstep(1.2); const crabs = G.enemies.list.filter(x => x.tag === 'mother_call' && x.alive).length; return { crabs, called: M.called[0] }; });
  ok(5, 'at three-quarters she drums the rock and crabs pour out of the walls', calls.called && calls.crabs >= 3, JSON.stringify(calls));
  const flood = await g(() => { const G = window.__game, M = G.mother, e = M.e, C = G.world.seacave, s = G.s; s.gear.seaboots = false; s.gear.waders = false; for (const x of G.enemies.list.filter(x => x.tag === 'mother_call')) G.enemies.remove(x); e.hp = 1300 * 0.52; const f = { x: -Math.sin(e.yaw + Math.PI / 2), z: -Math.cos(e.yaw + Math.PI / 2) }; G.teleport(e.pos.x + f.x * 8, e.pos.z + f.z * 8); M.update(0.0001, G.now, G.player.pos, true); G.enemies.damage(e, 40, G.now, undefined, 'bullet'); const p2 = M.phase; window.__hstep(3); const mid = C.floodLevel; window.__hstep(3.6); const full = C.floodLevel;
    const pl = C.platforms[2]; let off = null; for (let a = 0; a < 12; a++) { const x = C.grotto.x + Math.cos(a) * 11, z = C.grotto.z + Math.sin(a) * 11; G.teleport(x, z); if (!C.onPlatform(G.player.pos)) { G.step(0.1); off = { wading: G.coastWading, k: G.wadeK }; break; } }
    G.teleport(pl.x, pl.z); G.step(0.1); const on = { wading: G.coastWading };
    return { p2, mid: +mid.toFixed(2), full: +full.toFixed(2), off, on, note: G.bossBar()?.note }; });
  ok(5, 'below half health the grotto floods over about 6 s; off the platforms you wade (×0.65), on them you do not', flood.p2 === 2 && flood.mid > 0.3 && flood.mid < 0.8 && flood.full > 0.97 && flood.off?.wading && Math.abs(flood.off.k - 0.65) < 1e-6 && !flood.on.wading, JSON.stringify(flood));
  await g(() => { const G = window.__game, e = G.mother.e, P = G.player; const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z; P.yaw = Math.atan2(-dx, -dz); P.pitch = 0.05; }); await shot('09-grotto-flooded', 'third');
  // leaving resets her: full health, drained grotto
  await g(() => window.__game.goSeaCave(false)); await g(() => window.__game.step(1.5)); /* P1: fade on the game clock */
  const reset = await g(() => { const G = window.__game, M = G.mother; return { out: G.world.dungeon, hp: M.e.hp, active: M.active, flood: G.world.seacave.floodLevel, crabs: G.enemies.list.filter(e => e.tag === 'mother_call').length }; });
  ok(5, 'leaving the cave mid-fight resets her: full health, the grotto drained, her crabs gone', reset.out === null && reset.hp === 1300 && !reset.active && reset.flood === 0 && reset.crabs === 0, JSON.stringify(reset));
  await g(() => { const G = window.__game; G.teleport(-112, 378); G.interactWith('cave_mouth'); }); await g(() => window.__game.step(1.6)); /* P1: fade on the game clock */
  const kill = await g(() => { const G = window.__game, M = G.mother, C = G.world.seacave, s = G.s; G.teleport(C.grotto.x, C.grotto.z + 15); window.__hstep(3); for (let i = 0; i < 60 && !M.dead; i++) { const f = { x: -Math.sin(M.e.yaw + Math.PI / 2), z: -Math.cos(M.e.yaw + Math.PI / 2) }; G.teleport(M.e.pos.x + f.x * 8, M.e.pos.z + f.z * 8); M.update(0.0001, G.now, G.player.pos, true); G.enemies.damage(M.e, 120, G.now, undefined, 'bullet'); window.__hstep(0.2); } window.__hstep(3.5); G.storyTick(); return { dead: M.dead, flag: G.S.flag(s, 'motherDown'), flood: +C.floodLevel.toFixed(2), stage: s.quests.sq2.stage, bar: G.bossBar() }; });
  ok(5, 'the Wreck-Mother can be killed: the flag is set, the water drains, False Lights moves on to Marrow', kill.dead && kill.flag === 1 && kill.flood < 0.05 && kill.stage === 6 && kill.bar === null, JSON.stringify(kill));
  const calm = await g(() => { const G = window.__game; G.save(); G.load(); const C = G.world.seacave; G.teleport(C.grotto.x, C.grotto.z + 15); G.step(1); return { active: G.mother.active, dead: G.mother.dead, guards: G.enemies.list.filter(e => e.tag === 'seacave').length }; });
  ok(5, 'after the boss the grotto stays calm across save and load', !calm.active && calm.dead && calm.guards === 0, JSON.stringify(calm));
  await g(() => window.__game.goSeaCave(false)); await g(() => window.__game.step(1.5)); /* P1: fade on the game clock */

  // ================= 6. Collector Marrow: three decisions, each restored from a save =================
  await hour(12); await clear();
  await g(() => window.__game.saveTo('2'));
  const fates = [];
  for (const how of [1, 2, 3]) {
    await g(() => window.__game.loadFrom('2'));
    const r = await g(how => { const G = window.__game, s = G.s; const f0 = { ...s.factions }, c0 = s.crowns; G.talkTo('marrow'); const bs = [...document.querySelectorAll('[data-story]')]; bs[how - 1]?.click(); G.closeModal(); G.S.updateQuests(s); G.storyTick();
      const after = { fate: G.S.flag(s, 'collectorFate'), watch: s.factions.watch - f0.watch, tower: s.factions.tower - f0.tower, gull: s.factions.gullhaven - f0.gullhaven, crowns: s.crowns - c0, buttons: bs.length };
      G.save(); G.load(); G.storyTick(); const marrowHere = G.folk.find(f => f.def.id === 'marrow').present; const kept = G.S.flag(G.s, 'collectorFate');
      G.talkTo('bree'); [...document.querySelectorAll('[data-story]')][0]?.click(); G.closeModal(); return { how, ...after, kept, marrowHere, sq2: G.s.quests.sq2.state, cleared: G.S.flag(G.s, 'trewinCleared') }; }, how);
    fates.push(r);
  }
  const [arrest, squeeze, letgo] = fates;
  ok(6, 'Marrow arrested: Watch +10, Tower −10, Gullhaven up; he is gone from the customs house after a reload', arrest.fate === 1 && arrest.kept === 1 && arrest.watch === 10 && arrest.tower <= -9 && arrest.tower >= -10 && arrest.gull >= 10 && !arrest.marrowHere && arrest.sq2 === 'done', JSON.stringify(arrest));
  ok(6, 'Marrow squeezed: +150 crowns, Gullhaven −15; still at his desk after a reload', squeeze.fate === 2 && squeeze.kept === 2 && squeeze.crowns >= 150 && squeeze.gull <= -15 && squeeze.marrowHere && squeeze.sq2 === 'done', JSON.stringify(squeeze));
  ok(6, 'Marrow let go: Tower +10, Gullhaven −20; the choice survives a reload; Trewin is cleared in every ending', letgo.fate === 3 && letgo.kept === 3 && letgo.tower >= 10 && letgo.tower <= 11 && letgo.gull <= -20 && letgo.marrowHere && fates.every(f => f.cleared === 1), JSON.stringify(letgo));

  // ================= 6. The side quests =================
  await g(() => window.__game.loadFrom('2')); await clear();
  const side = await g(async () => { const G = window.__game, s = G.s, S = G.S; s.minutes += 1440; S.updateQuests(s); const out = {};
    G.talkTo('jowan'); [...document.querySelectorAll('[data-story]')].find(b => /good tonight/i.test(b.textContent))?.click(); G.closeModal(); out.sq3a = s.quests.sq3?.state;
    s.inventory.mussels = 6; s.inventory.samphire = 4; G.talkTo('jowan'); [...document.querySelectorAll('[data-story]')].find(b => /as ordered/i.test(b.textContent))?.click(); G.closeModal(); out.sq3 = s.quests.sq3?.state; out.cakes = s.inventory.crabcakes;
    G.talkTo('elowen'); [...document.querySelectorAll('[data-story]')].find(b => /empty hook/i.test(b.textContent))?.click(); G.closeModal(); out.sq4a = s.quests.sq4?.state;
    s.discovered.includes('place:lighthouse') || s.discovered.push('place:lighthouse'); S.updateQuests(s);
    G.talkTo('trewin'); [...document.querySelectorAll('[data-story]')].find(b => /worried/i.test(b.textContent))?.click(); G.closeModal(); out.sq5a = s.quests.sq5?.state; return out; });
  await hour(8); await g(() => { const G = window.__game; G.teleport(-25, 377); G.interactWith('wreck_bell'); }); await waitIdle();
  const bell = await g(async () => { const G = window.__game, s = G.s, P = G.player; const hidden = !G.world.scene.getObjectByName('wreckBell').visible; const block = G.travelBlock(); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); G.step(0.5); const sprint = P.sprinting; window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' })); return { bell: s.inventory.shipsbell, hidden, block, sprint }; });
  await shot('10-carrying-bell', 'third');
  const side2 = await g(() => { const G = window.__game, s = G.s; G.talkTo('elowen'); [...document.querySelectorAll('[data-story]')].find(b => /bell/i.test(b.textContent))?.click(); G.closeModal(); G.storyTick(); const hung = G.world.scene.getObjectByName('wrenBell').visible;
    s.inventory.oil = 2; G.talkTo('trewin'); [...document.querySelectorAll('[data-story]')].find(b => /lamp oil/i.test(b.textContent))?.click(); G.closeModal(); G.storyTick();
    return { sq4: s.quests.sq4?.state, charm: s.inventory.charmShell, hung, sq5: s.quests.sq5?.state, spy: s.gear.spyglass }; });
  ok(6, 'Mussels and Samphire: Jowan takes six and four, pays, and gives two crab cakes', side.sq3a === 'active' && side.sq3 === 'done' && side.cakes >= 2, JSON.stringify(side));
  ok(6, 'The Merry Wren\'s Bell: taken from the bow at low water, carried at a walk (no running, no map), hung at the chapel for the shell charm', bell.bell === 1 && bell.hidden && /bell/.test(bell.block) && !bell.sprint && side2.sq4 === 'done' && side2.charm === 1 && side2.hung, JSON.stringify({ bell, side2 }));
  ok(6, 'The Keeper\'s Oil: two flasks to Trewin for his spyglass', side.sq5a === 'active' && side2.sq5 === 'done' && side2.spy, JSON.stringify({ side, side2 }));

  // ================= 7. Meals, gear, the charm, traders, the inn and the auction =================
  await hour(18); await clear();
  const tr = await g(async () => { const G = window.__game, s = G.s, R = G.R, out = {}; s.crowns = 500;
    for (const [id, re] of [['chandlery', /Pasco/], ['auction', /Morwenna|auction/], ['shipwright', /Tegen|slipway/], ['inn_bar_s', /Anchor|Jowan/]]) { G.interactWith(id); out[id] = G.modalOpen() && re.test(document.body.innerText); G.closeModal(); }
    out.boots = R.buyGear(s, 'seaboots', 'shipwright') && s.gear.seaboots; out.auctionPays = R.sellPriceAt(s, 'fishauction', 'mackerel') > R.sellPriceAt(s, 'chandlery', 'mackerel');
    s.inventory.crabcakes = 1; out.seaLegs = G.GS.eatMeal(s, 'crabcakes') && G.GS.buffActive(s, 'seaLegs');
    s.needs.stress = 50; G.interactWith('sea_chapel'); return out; });
  await waitIdle();
  const tr2 = await g(() => { const G = window.__game, s = G.s; const st = s.needs.stress; G.teleport(80, 342); return { st }; });
  await hour(21); await g(() => window.__game.interactWith('inn_bed_s')); await g(() => window.__game.step(2.8)); /* P1: fade on the game clock */ await waitIdle();
  const inn = await g(() => { const G = window.__game, s = G.s; return { hour: G.GS.hour(s) }; });
  ok(7, 'the chandlery, the fish auction, the slipway and the Anchor and Gull open; sea boots for sale; the auction pays more for fish', tr.chandlery && tr.auction && tr.shipwright && tr.inn_bar_s && tr.boots && tr.auctionPays, JSON.stringify(tr));
  ok(7, 'crab cakes give Sea legs; Sister Elowen\'s blessing clears stress; a bed at the Anchor and Gull sleeps you to morning', tr.seaLegs && tr2.st <= 36 && inn.hour >= 6 && inn.hour < 10, JSON.stringify({ tr2, inn }));
  const fish = await g(() => { const G = window.__game, s = G.s; s.inventory.rod = 1; G.teleport(120, 399.5); G.interactWith('fish_sea'); return { spot: G.fishing?.spot }; });
  await g(() => { const G = window.__game; G.closeModal(); G.strikeFish(); G.player.action = null; });
  ok(7, 'the breakwater is a sea fishing spot', fish.spot === 'sea', JSON.stringify(fish));
  const gath = await g(async () => { const G = window.__game, s = G.s; const m0 = s.inventory.mussels; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 13 * 60; G.teleport(-12, 378); G.interactWith('mussel_4'); const far = G.player.action ? 'started' : 'refused'; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 8 * 60; return { far, m0 }; });
  await waitIdle(); await g(() => window.__game.interactWith('mussel_4')); await waitIdle(); await g(() => window.__game.interactWith('samphire_1')); await waitIdle();
  const gath2 = await g(() => { const G = window.__game, s = G.s; return { mussels: s.inventory.mussels, samphire: s.inventory.samphire, hidden: G.world.interactables.find(i => i.id === 'mussel_4').hidden }; });
  ok(7, 'mussel beds and samphire can be gathered; the far beds only at low water; picked beds wait for tomorrow', gath.far === 'refused' && gath2.mussels > gath.m0 && gath2.samphire > 0 && gath2.hidden, JSON.stringify({ gath, gath2 }));

  // ================= NPC presence and the day/night views =================
  const lowdy = await g(() => { const G = window.__game, s = G.s, at = h => { s.minutes = Math.floor(s.minutes / 1440) * 1440 + h * 60; G.storyTick(); for (let i = 0; i < 4; i++) G.step(0.25); const t = G.folk.find(f => f.def.id === 'lowdy'); return { present: t.present, x: +t.pos.x.toFixed(1), z: +t.pos.z.toFixed(1) }; };
    return { low: at(8), high: at(14), people: G.folk.filter(f => f.def.region === 'coast').length }; });
  ok(6, 'twelve coast townsfolk; Lowdy picks mussels on the flats at low water and works the quay by day', lowdy.people === 12 && lowdy.low.present && lowdy.high.present, JSON.stringify(lowdy));
  await hour(13); await g(() => window.__game.teleport(58, 228)); await look(Math.PI - 0.35, 0.18); await shot('11-gull-tower-day');
  await hour(22.5); await g(() => window.__game.teleport(96, 364)); await look(0.4, 0.06); await shot('12-gullhaven-night');
  await hour(20.2); await g(() => window.__game.teleport(-6, 356)); await look(Math.PI * 0.85, 0); await shot('13-flats-dusk');

  ok(8, 'no page errors', errors.length === 0, errors.slice(0, 4).join(' | '));
  console.log('\ncriteria:', Object.entries(crit).map(([k, v]) => `${k}: ${v.filter(Boolean).length}/${v.length}`).join(' · '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
