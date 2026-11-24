// Bug-hunting playtest bot for Wards of Millbrook.
// Usage: node scripts/bugwalk.cjs <url> <outdir> [gridStep=6] [--max=N] [--quick]
//  1. static audit: collider sanity, scene meshes (NaN, missing material/texture, stray huge meshes)
//  2. measured jump height on open ground (real Space key + physics step)
//  3. ground sweep with real W/A/S/D input over a grid of free ground; candidates are confirmed in isolation
//     (fresh teleport, same key); only repeat failures are reported, clustered by 20 m cell
//  4. climb test: walk at each ledge (0.3-1.2 m) from the open side and record the height reached
//  5. platform reachability: boxes taller than the measured jump and the climb limit are not standable
// The sweep runs in chunks. A renderer crash is recorded with the position where it happened (it is a bug).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const url = process.argv[2] || 'http://localhost:5198/';
  const out = process.argv[3] || 'bugwalk';
  const STEP = +(process.argv[4] || 6);
  const quick = process.argv.includes('--quick');
  const maxArg = process.argv.find(a => a.startsWith('--max='));
  const MAX = maxArg ? +maxArg.split('=')[1] : (quick ? 400 : 1500);
  const CHUNK = 60;
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const consoleErrs = [], crashes = [];
  let p;
  const open = async () => {
    p = await b.newPage({ viewport: { width: 960, height: 540 } });
    p.setDefaultTimeout(120000);
    p.on('pageerror', e => consoleErrs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) consoleErrs.push('console: ' + m.text()); });
    await p.goto(url); await p.waitForTimeout(1500);
    await p.evaluate(() => window.__game.start()); await p.waitForTimeout(800);
  };
  await open();

  // 1. static audit
  const audit = await p.evaluate(() => {
    const G = window.__game, W = G.world, out = { colliders: [], scene: [], extent: null, counts: {} };
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    W.colliders.forEach((b, i) => {
      if ([b.minX, b.maxX, b.minZ, b.maxZ, b.h].some(v => !Number.isFinite(v))) { out.colliders.push({ i, issue: 'non-finite bounds' }); return; }
      if (b.maxX < b.minX || b.maxZ < b.minZ) out.colliders.push({ i, issue: 'inverted box', b });
      if (b.h <= 0) out.colliders.push({ i, issue: 'zero/negative height', b });
      if (b.maxX - b.minX > 300 || b.maxZ - b.minZ > 300) out.colliders.push({ i, issue: 'very large collider (>300 m)', b });
      minX = Math.min(minX, b.minX); maxX = Math.max(maxX, b.maxX); minZ = Math.min(minZ, b.minZ); maxZ = Math.max(maxZ, b.maxZ);
    });
    out.extent = { minX, maxX, minZ, maxZ };
    let meshes = 0, noMat = 0, nanGeo = 0, badTex = 0, huge = 0;
    W.scene.traverse(o => {
      if (!o.isMesh) return; meshes++;
      const g = o.geometry, pos = g && g.attributes.position;
      if (!pos) { out.scene.push({ name: o.name, issue: 'mesh without positions' }); nanGeo++; return; }
      let nan = false; for (let k = 0; k < pos.array.length; k++) if (!Number.isFinite(pos.array[k])) { nan = true; break; }
      if (nan) { nanGeo++; out.scene.push({ name: o.name, issue: 'NaN vertices' }); }
      if (!o.material) { noMat++; out.scene.push({ name: o.name, issue: 'no material' }); }
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { if (!m) return; for (const key of ['map', 'normalMap', 'emissiveMap']) { const t = m[key]; if (t && (!t.image || (t.image.width === 0 && !t.image.data))) { badTex++; out.scene.push({ name: o.name, issue: 'texture not loaded: ' + key }); } } });
      if (!g.boundingBox) g.computeBoundingBox();
      const sx = g.boundingBox.max.x - g.boundingBox.min.x, sz = g.boundingBox.max.z - g.boundingBox.min.z;
      if (sx > 400 || sz > 400) { huge++; out.scene.push({ name: o.name, issue: `very large mesh ${sx.toFixed(0)}x${sz.toFixed(0)} m`, at: o.getWorldPosition(o.position.clone()).toArray().map(v => +v.toFixed(1)) }); }
    });
    out.counts = { colliders: W.colliders.length, meshes, noMat, nanGeo, badTex, huge };
    return out;
  });
  fs.writeFileSync(`${out}/audit.json`, JSON.stringify(audit, null, 1));
  console.log('audit', JSON.stringify(audit.counts), 'collider issues', audit.colliders.length, 'scene issues', audit.scene.length);

  // 2. measured jump height
  const jumpMax = await p.evaluate(() => {
    const G = window.__game, P = G.player;
    G.teleport(-20, 0, 0); G.step(0.2);
    dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); G.step(0.05); dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    let m = 0; for (let i = 0; i < 30; i++) { G.step(0.05); m = Math.max(m, P.pos.y); } return m;
  });

  // sample points (computed here so they are reproducible)
  const { minX, maxX, minZ, maxZ } = audit.extent;
  const pts = []; for (let x = minX + 2; x <= maxX - 2; x += STEP) for (let z = minZ + 2; z <= maxZ - 2; z += STEP) pts.push([x, z]);
  const sample = pts.length > MAX ? pts.filter((_, i) => i % Math.ceil(pts.length / MAX) === 0) : pts;

  // 3. ground sweep in chunks; a crash reopens the page and records where it happened
  const stuck = [], fell = []; let tested = 0, moves = 0;
  const sweepChunk = (chunk) => p.evaluate((chunk) => {
    const G = window.__game, P = G.player, cols = G.world.colliders;
    const press = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c }));
    const blocked = (x, z, m = 0) => cols.some(b => b.h > 1.2 && x >= b.minX - m && x <= b.maxX + m && z >= b.minZ - m && z <= b.maxZ + m);
    const dirs = [['KeyW', 0, -1], ['KeyS', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0]];
    const res = { stuck: [], fell: [], tested: 0, moves: 0 };
    for (const [x, z] of chunk) {
      if (blocked(x, z, 0.5)) continue;
      if ([[1.2, 0], [-1.2, 0], [0, 1.2], [0, -1.2]].some(([dx, dz]) => blocked(x + dx, z + dz, 0.4))) continue;
      res.tested++;
      if (G.modalOpen()) G.closeModal();
      G.s.hp = G.s.maxHp || 100; G.s.gameover = false;
      for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50; // a collapse freezes a synchronous sweep (busyCollapse waits on a timer)
      for (const e of [...G.enemies.list]) G.enemies.remove(e);
      for (const [code, dx, dz] of dirs) {
        if (![1.5, 2.5, 3.5].every(d => !blocked(x + dx * d, z + dz * d, 0.4))) continue;
        G.teleport(x, z, 0); G.step(0.05);
        const x0 = P.pos.x, z0 = P.pos.z;
        press(code, true); G.step(0.5); press(code, false);
        res.moves++;
        const moved = Math.hypot(P.pos.x - x0, P.pos.z - z0);
        if (moved < 0.8) res.stuck.push({ x: +x.toFixed(1), z: +z.toFixed(1), dir: code, zone: P.zone, y: +P.pos.y.toFixed(2) });
        if (P.pos.y < -2) res.fell.push({ x, z, dir: code });
      }
    }
    return res;
  }, chunk);

  for (let i = 0; i < sample.length; i += CHUNK) {
    const chunk = sample.slice(i, i + CHUNK);
    try {
      const r = await sweepChunk(chunk);
      tested += r.tested; moves += r.moves; stuck.push(...r.stuck); fell.push(...r.fell);
    } catch (e) {
      if (!/crashed|closed/i.test(e.message)) throw e;
      const at = chunk[0];
      crashes.push({ chunkStart: at, note: 'renderer crashed during sweep; page reopened and the chunk skipped' });
      console.log('CRASH during sweep at', at.map(v => Math.round(v)));
      try { await p.close(); } catch {}
      await open();
    }
  }

  // confirm candidates in isolation (fresh teleport, same key)
  const confirmed = [], flaky = [];
  if (stuck.length) {
    const cand = stuck.slice(0, 400);
    const retry = await p.evaluate((cand) => {
      const G = window.__game, P = G.player; const out = [];
      const press = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c }));
      for (const st of cand) {
        for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50; G.s.hp = G.s.maxHp || 100;
        G.teleport(st.x, st.z, 0); G.step(0.05);
        const x0 = P.pos.x, z0 = P.pos.z;
        press(st.dir, true); G.step(0.5); press(st.dir, false);
        out.push(Math.hypot(P.pos.x - x0, P.pos.z - z0));
      }
      return out;
    }, cand);
    cand.forEach((st, i) => (retry[i] < 0.8 ? confirmed : flaky).push({ ...st, retryMoved: +retry[i].toFixed(2) }));
  }

  // 4. climb test
  const climb = await p.evaluate(() => {
    const G = window.__game, P = G.player, cols = G.world.colliders;
    const ledges = cols.filter(b => b.h > 0.3 && b.h <= 1.2 && (b.maxX - b.minX) >= 1.5 && (b.maxZ - b.minZ) >= 1.5).slice(0, 60);
    const press = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c }));
    const out = { tested: 0, climbed: 0, failed: [] };
    for (const b of ledges) {
      for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50; G.s.hp = G.s.maxHp || 100;
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const sides = [[cx, b.minZ - 0.6, Math.PI], [cx, b.maxZ + 0.6, 0], [b.minX - 0.6, cz, -Math.PI / 2], [b.maxX + 0.6, cz, Math.PI / 2]];
      let ok = false, peak = 0, tried = false;
      for (const [sx, sz, yaw] of sides) {
        if (cols.some(c => c.h > 1.2 && sx >= c.minX && sx <= c.maxX && sz >= c.minZ && sz <= c.maxZ)) continue;
        tried = true;
        G.teleport(sx, sz, yaw); G.step(0.1);
        // walk in, jump at the edge (a mantle when the top is above the step height), keep walking
        press('KeyW', true); G.step(0.25); press('Space', true); G.step(0.05); press('Space', false);
        for (let i = 0; i < 20; i++) { G.step(0.05); peak = Math.max(peak, P.pos.y); if (peak >= b.h - 0.05) break; } // peak during the climb, not at the end
        press('KeyW', false);
        if (peak >= b.h - 0.05) { ok = true; break; }
      }
      if (!tried) continue;
      out.tested++;
      if (ok) out.climbed++; else out.failed.push({ box: [b.minX, b.maxX, b.minZ, b.maxZ].map(v => +v.toFixed(1)), h: +b.h.toFixed(2), reachedY: +peak.toFixed(2) });
    }
    return out;
  });

  // 5. platform reachability (taller than jump and climb limit)
  const tall = await p.evaluate(() => {
    const cols = window.__game.world.colliders;
    return cols.filter(b => b.h > 1.2 && (b.maxX - b.minX) >= 0.5 && (b.maxZ - b.minZ) >= 0.5).length;
  });

  // clusters
  const cells = {};
  for (const s of confirmed) { const k = `${Math.floor(s.x / 20) * 20},${Math.floor(s.z / 20) * 20}`; (cells[k] ||= []).push(s); }
  const clusters = Object.entries(cells).map(([k, v]) => ({ cell: k, count: v.length, sample: v[0] })).sort((a, b) => b.count - a.count);
  const report = {
    measuredJumpHeight: +jumpMax.toFixed(2), pointsTested: tested, moveAttempts: moves,
    stuckCandidates: stuck.length, stuckConfirmed: confirmed.length, stuckFlaky: flaky.length, stuckClusters: clusters,
    fellOut: fell.length, crashes, climb: { tested: climb.tested, climbed: climb.climbed, failed: climb.failed },
    tallWallsOrPlatformsAboveJump: tall, consoleErrors: consoleErrs.length, audit,
  };
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  fs.writeFileSync(`${out}/console-errors.json`, JSON.stringify(consoleErrs, null, 1));
  console.log('jump', report.measuredJumpHeight, 'tested', tested, 'stuckConfirmed', confirmed.length, 'flaky', flaky.length, 'fell', fell.length, 'crashes', crashes.length, 'climb', climb.climbed + '/' + climb.tested, 'consoleErrors', consoleErrs.length);
  await b.close();
})().catch(e => { console.error('BOT FAILED', e); process.exit(1); });
