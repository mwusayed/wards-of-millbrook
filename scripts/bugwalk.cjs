// Bug-hunting playtest bot for Wards of Millbrook.
// Usage: node scripts/bugwalk.cjs <url> <outdir> [gridStep=6] [--quick]
// Stages:
//  1. static audit: collider sanity, scene meshes (NaN, missing material/texture, stray huge meshes)
//  2. measured jump height on open ground (real Space key + physics step)
//  3. ground sweep with real key input (W/A/S/D) over a grid of free ground:
//     "stuck" = open ground 3 m ahead but no movement. Clustered by 20 m cell.
//  4. platform reachability: every collider taller than the measured jump height is not standable
//  5. screenshots of the worst stuck clusters (third person) for visual confirmation
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const url = process.argv[2] || 'http://localhost:5198/';
  const out = process.argv[3] || 'bugwalk';
  const STEP = +(process.argv[4] || 6);
  const quick = process.argv.includes('--quick');
  const shots = process.argv.includes('--shots');
  const maxArg = process.argv.find(a => a.startsWith('--max='));
  const MAX = maxArg ? +maxArg.split('=')[1] : (quick ? 400 : 1e9);
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } });
  p.setDefaultTimeout(120000);
  const consoleErrs = [];
  p.on('pageerror', e => consoleErrs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) consoleErrs.push('console: ' + m.text()); });
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__game.start()); await p.waitForTimeout(800);

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

  // 2–4. physics + sweep, all in-page with real key events
  const res = await p.evaluate(({ STEP, quick, ext, MAX }) => {
    const G = window.__game, W = G.world, P = G.player, cols = W.colliders;
    const press = (c, on) => dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: c }));
    const blocked = (x, z, m = 0) => cols.some(b => b.h > 0.6 && x >= b.minX - m && x <= b.maxX + m && z >= b.minZ - m && z <= b.maxZ + m);
    // 2. measured jump height
    G.teleport(-20, 0, 0); G.step(0.2);
    press('Space', true); G.step(0.05); press('Space', false);
    let jumpMax = 0; for (let i = 0; i < 30; i++) { G.step(0.05); jumpMax = Math.max(jumpMax, P.pos.y); }
    // 3. sweep
    const dirs = [['KeyW', 0, -1], ['KeyS', 0, 1], ['KeyA', -1, 0], ['KeyD', 1, 0]];
    const stuck = [], fell = []; let tested = 0, moves = 0, noGround = 0;
    const { minX, maxX, minZ, maxZ } = ext;
    const pts = []; for (let x = minX + 2; x <= maxX - 2; x += STEP) for (let z = minZ + 2; z <= maxZ - 2; z += STEP) pts.push([x, z]);
    const sample = pts.length > MAX ? pts.filter((_, i) => i % Math.ceil(pts.length / MAX) === 0) : pts;
    for (const [x, z] of sample) {
      if (blocked(x, z, 0.5)) continue;
      // require the start point to be clear all round (player radius 0.35 m + margin), not just ahead
      if ([[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]].some(([dx,dz]) => blocked(x + dx, z + dz, 0.4))) continue;
      tested++;
      // keep the bot alive and un-modalled so a fight or death can't freeze the walk
      if (G.modalOpen()) G.closeModal();
      G.s.hp = G.s.maxHp || 100; G.s.gameover = false;
      // needs at a neutral 50: a collapse freezes the synchronous sweep (busyCollapse waits on a timer that never fires)
      for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50;
      for (const e of [...G.enemies.list]) G.enemies.remove(e);
      for (const [code, dx, dz] of dirs) {
        if (![1.5, 2.5, 3.5].every(d => !blocked(x + dx * d, z + dz * d, 0.4))) continue;
        G.teleport(x, z, 0); G.step(0.05);
        const x0 = P.pos.x, z0 = P.pos.z;
        press(code, true); G.step(0.5); press(code, false);
        const moved = Math.hypot(P.pos.x - x0, P.pos.z - z0);
        moves++;
        if (moved < 0.8) stuck.push({ x: +x.toFixed(1), z: +z.toFixed(1), dir: code, modal: G.modalOpen(), hp: G.s.hp, zone: P.zone, dungeon: W.dungeon, inside: W.insideBuilding(P.pos), y: +P.pos.y.toFixed(2), vy: +P.vy.toFixed(2), onGround: P.onGround, action: !!P.action, dodgeT: P.dodgeT });
        if (P.pos.y < -2) fell.push({ x, z, dir: code });
      }
    }
    // confirm each candidate in isolation (fresh teleport, same key); keep only repeat failures
    const confirmed = [], flaky = [];
    for (const st of stuck) {
      const dd = { KeyW: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyD: [1, 0] }[st.dir];
      G.teleport(st.x, st.z, 0); G.step(0.05);
      const x0 = P.pos.x, z0 = P.pos.z;
      press(st.dir, true); G.step(0.5); press(st.dir, false);
      const mv = Math.hypot(P.pos.x - x0, P.pos.z - z0);
      (mv < 0.8 ? confirmed : flaky).push({ ...st, retryMoved: +mv.toFixed(2) });
    }
    // 4. platforms higher than the jump can reach
    const tall = cols.filter(b => b.h > jumpMax + 0.05 && (b.maxX - b.minX) >= 0.5 && (b.maxZ - b.minZ) >= 0.5);
    return { jumpMax: +jumpMax.toFixed(2), tested, moves, stuck: confirmed, flakyCandidates: flaky.length, fell, tallCount: tall.length, tallSample: tall.slice(0, 30).map(b => ({ box: [b.minX, b.maxX, b.minZ, b.maxZ].map(v => +v.toFixed(1)), h: +b.h.toFixed(2) })) };
  }, { STEP, quick, ext: audit.extent, MAX });

  // cluster stuck points into 20 m cells
  const cells = {};
  for (const s of res.stuck) { const k = `${Math.floor(s.x / 20) * 20},${Math.floor(s.z / 20) * 20}`; (cells[k] ||= []).push(s); }
  const clusters = Object.entries(cells).map(([k, v]) => ({ cell: k, count: v.length, sample: v[0] })).sort((a, b) => b.count - a.count);
  fs.writeFileSync(`${out}/stuck-all.json`, JSON.stringify(res.stuck));
  const report = { measuredJumpHeight: res.jumpMax, pointsTested: res.tested, moveAttempts: res.moves, stuckAttempts: res.stuck.length, fellOut: res.fell.length, stuckClusters: clusters, tallColliderCount: res.tallCount, tallColliderSample: res.tallSample, audit };
  fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  fs.writeFileSync(`${out}/console-errors.json`, JSON.stringify(consoleErrs, null, 1));
  console.log('jump', res.jumpMax, 'tested', res.tested, 'stuck', res.stuck.length, 'clusters', clusters.length, 'tall', res.tallCount, 'fell', res.fell.length, 'consoleErrors', consoleErrs.length);

  // 5. screenshots of top clusters
  if (shots) for (const c of clusters.slice(0, 3)) {
    await p.evaluate(({ x, z }) => { const G = window.__game; G.view('third'); G.teleport(x, z, 0); G.step(0.3); }, { x: c.sample.x, z: c.sample.z });
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}/stuck-${c.cell.replace(',', '_')}.png` });
  }
  await b.close();
})().catch(e => { console.error('BOT FAILED', e); process.exit(1); });
