// P1 gate checks for Wards of Millbrook: pause, save/restore mid-delay, collapse lock, bounded catch-up.
// Usage: node scripts/p1-verify.cjs [url]
const { chromium } = require('playwright');
(async () => {
  const url = process.argv[2] || 'http://localhost:5198/';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(300000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.clear(); window.__game.start(); window.__game.sim.setExternalClock(true); });
  let pass = 0, fail = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + x)); c ? pass++ : fail++; };
  // closing a menu asks for pointer lock again; headless Chromium refuses, and the game (as designed) opens its
  // Paused menu a moment later. Let that happen, then close it, before the next check.
  const settle = async () => { await p.waitForTimeout(400); await p.evaluate(() => { let n = 0; while (window.__game.modalOpen() && n++ < 5) window.__game.closeModal(); }); };
  const clean = async () => { await settle(); return p.evaluate(() => { const G = window.__game; for (const e of [...G.enemies.list]) G.enemies.remove(e); for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 40; G.s.hp = 100; G.teleport(-20, 0, 0); G.step(0.2); }); };

  // 1. quick-eat finishes 48 ticks after the press, exactly once
  await clean();
  const e1 = await p.evaluate(() => {
    const G = window.__game, S = G.sim; G.s.inventory.bread = 3; const b0 = G.s.inventory.bread;
    S.press('quickEat'); G.step(1 / 30); const t0 = S.tick; let at = -1;
    for (let i = 0; i < 70; i++) { G.step(1 / 30); if (at < 0 && G.s.inventory.bread < b0) at = S.tick - t0; }
    return { at, eaten: b0 - G.s.inventory.bread, action: G.player.action && G.player.action.clip };
  });
  ok(e1.at === 48 && e1.eaten === 1 && !e1.action, `quick-eat lands 48 ticks after it starts (1.6 s rounded up) and eats one bread`, JSON.stringify(e1));

  // 2. pause during a queued action: an open menu stops the clock, frames and steps alike
  await clean();
  const e2 = await p.evaluate(() => {
    const G = window.__game, S = G.sim; G.s.inventory.bread = 3; const b0 = G.s.inventory.bread;
    S.press('quickEat'); G.step(10 / 30); G.openJournal();
    const t0 = S.tick; G.step(5); let ts = 1000; S.frameAt(ts); for (let i = 0; i < 300; i++) { ts += 16.7; S.frameAt(ts); }
    const paused = { ticks: S.tick - t0, bread: G.s.inventory.bread };
    G.closeModal(); G.step(60 / 30);
    return { paused, b0, after: G.s.inventory.bread };
  });
  ok(e2.paused.ticks === 0 && e2.paused.bread === e2.b0, 'menu open: no ticks pass (steps and 300 frames) and the queued eat waits', JSON.stringify(e2));
  ok(e2.b0 - e2.after === 1, 'after the menu closes the eat lands exactly once', JSON.stringify(e2));

  // 3. save mid-delay to a real slot, then load: the effect lands once, on the same tick
  await clean();
  const e3 = await p.evaluate(() => {
    const G = window.__game, S = G.sim; G.s.inventory.bread = 3;
    S.press('quickEat'); G.step(21 / 30); // 20 ticks into the 48-tick delay
    const pending = S.queue().map(q => [q.kind, q.due - S.tick]); const tSave = S.tick; G.saveTo('3');
    const breadAtSave = G.s.inventory.bread;
    const run = () => { let at = -1; const b0 = G.s.inventory.bread; for (let i = 0; i < 60; i++) { G.step(1 / 30); if (at < 0 && G.s.inventory.bread < b0) at = S.tick; } return { at, eaten: b0 - G.s.inventory.bread }; };
    const a = run();
    const loaded = G.loadFrom('3'); const tLoad = S.tick, breadLoaded = G.s.inventory.bread, pendingLoaded = S.queue().map(q => [q.kind, q.due - S.tick]);
    const c = run();
    return { pending, tSave, tLoad, breadAtSave, breadLoaded, pendingLoaded, a, c, loaded };
  });
  ok(e3.loaded && e3.tLoad === e3.tSave && JSON.stringify(e3.pendingLoaded) === JSON.stringify(e3.pending), 'a slot save keeps the clock and the pending eat (same tick, same delay)', JSON.stringify(e3));
  ok(e3.a.at === e3.c.at && e3.a.eaten === 1 && e3.c.eaten === 1, `continuing and loading both eat once, on the same tick (${e3.a.at})`, JSON.stringify(e3));

  // 4. collapse: movement stays locked for the 1.6 s fade on the game clock, then you wake at home
  await clean();
  const e4 = await p.evaluate(() => {
    const G = window.__game, S = G.sim; G.s.hp = 5; S.hurt(500);
    const locked0 = S.busyCollapse(); const x0 = G.player.pos.x, z0 = G.player.pos.z;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    G.step(30 / 30); const mid = { busy: S.busyCollapse(), moved: Math.hypot(G.player.pos.x - x0, G.player.pos.z - z0) };
    // v0.9.4 behaviour kept: a damage collapse runs the 1.6 s fade (48 ticks), then update() picks up G.collapse's
    // pendingRespawn and runs a second 1.4 s fade (42 ticks). 48 + 42 + 1 = 91 ticks in all.
    let wallBusy = null; return new Promise(r => setTimeout(() => { wallBusy = S.busyCollapse(); G.step(61 / 30); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); r({ locked0, mid, wallBusy, end: S.busyCollapse(), home: [Math.round(G.player.pos.x), Math.round(G.player.pos.z)] }); }, 3000));
  });
  ok(e4.locked0 && e4.mid.busy && e4.mid.moved < 0.01, 'collapse locks movement on the game clock (30 ticks in, still locked, no movement)', JSON.stringify(e4));
  ok(e4.wallBusy === true, '3 s of wall time without ticks does not end the collapse (the clock decides, not the timer)', JSON.stringify(e4));
  ok(e4.end === false, 'the collapse ends after both fades (48 + 42 ticks) and you wake at home', JSON.stringify(e4));

  // 5. bounded catch-up: a 5 s frame (background tab, hitch) runs 4 ticks, not 150
  await clean();
  const e5 = await p.evaluate(() => { const S = window.__game.sim; S.setExternalClock(true); let ts = 1000; S.frameAt(ts); ts += 16.7; S.frameAt(ts); const t0 = S.tick; ts += 5000; S.frameAt(ts); const big = S.tick - t0; const t1 = S.tick; for (let i = 0; i < 60; i++) { ts += 1000 / 60; S.frameAt(ts); } return { big, sixty: S.tick - t1 }; });
  ok(e5.big === 4, 'a 5,000 ms frame runs at most 4 ticks (the game slows rather than jumps)', JSON.stringify(e5));
  ok(e5.sixty >= 29 && e5.sixty <= 31, '60 frames at 60 fps run 30 ticks (one second of game time)', JSON.stringify(e5));

  ok(errs.length === 0, 'no page errors', JSON.stringify(errs.slice(0, 3)));
  console.log(`${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
