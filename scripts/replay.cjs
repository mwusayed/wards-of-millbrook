// P1 deterministic replay harness for Wards of Millbrook.
// Runs in Chromium against a served build, driving the game's own authoritative step (stepSim) with
// rendering off. The page is a browser host, not a separate engine: the same code as play.
//
//   node scripts/replay.cjs record  <url> <out.json> <seed> <scene> <ticks>   write a replay fixture
//   node scripts/replay.cjs play    <url> <fixture.json>                      replay; compare with its hashes
//   node scripts/replay.cjs verify  <url> <fixture.json> [schedules]          replay through frameAt under render schedules
//   node scripts/replay.cjs diverge <url> <fixture.json> <tick>               change one input; report the first differing tick
//   node scripts/replay.cjs digest  <url> <fixture.json>                      a wrong model digest must be rejected
//   node scripts/replay.cjs matrix  <url> <outdir> <ticks>                    3 seeds x 3 scenes, record + 2 schedules + checkpoint
// Scenes: town (Millbrook square, day), combat (five enemies on open ground), tide (the flats as the tide turns).
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');

function m32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** Scripted input: held movement that changes every 15-45 ticks, a slowly turning view, presses now and then.
 *  No 'interact' (it can open a menu, which pauses the game and would stall an unattended replay). */
function genInputs(seed, scene, n) {
  const r = m32(seed * 7919 + scene.length * 31), frames = []; let hold = [], left = 0, yaw = 0, pitch = -0.05;
  const moves = [['KeyW'], ['KeyW', 'ShiftLeft'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyS'], ['KeyA'], ['KeyD'], [], ['KeyW', 'Space']];
  const presses = scene === 'combat' ? ['attack', 'attack', 'melee', 'dodge', 'reload', 'slot2', 'slot1'] : ['attack', 'melee', 'dodge', 'holster', 'lantern', 'view'];
  for (let i = 0; i < n; i++) {
    if (left-- <= 0) { hold = moves[Math.floor(r() * moves.length)]; left = 15 + Math.floor(r() * 30); }
    yaw += (r() - 0.5) * 0.08; pitch = Math.max(-0.4, Math.min(0.3, pitch + (r() - 0.5) * 0.02));
    const p = r() < (scene === 'combat' ? 0.06 : 0.01) ? [presses[Math.floor(r() * presses.length)]] : [];
    frames.push({ k: [...hold].sort(), yaw: +yaw.toFixed(6), pitch: +pitch.toFixed(6), p });
  }
  return frames;
}
const SCENES = {
  town: { at: [-2, 9], minutes: 9 * 60 + 10 },
  combat: { at: [-20, 0], minutes: 13 * 60, enemies: [['raider', 0, -7], ['raider', 5, -6], ['hound', -6, -8], ['hound', 7, 2], ['shade', 0, -14]] },
  tide: { at: [-12, 360], minutes: 9 * 60 + 40 },
};
async function openPage(browser, url) {
  const p = await browser.newPage({ viewport: { width: 640, height: 360 } }); p.setDefaultTimeout(600000);
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.__errs = errs;
  await p.goto(url); await p.waitForTimeout(1200);
  await p.evaluate(() => { window.__game.start(); window.__game.sim.setExternalClock(true); });
  return p;
}
/** Build the start state for a seed and scene (in the page) and return the snapshot string. */
async function makeStart(p, seed, scene) {
  return p.evaluate(({ seed, sc }) => {
    const G = window.__game; G.newGame(); G.s.seed = seed; G.s.minutes = 24 * 60 + sc.minutes; for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 40;
    G.s.debt = 0; // fixtures run 10,000 ticks: without this, repeated collapses reach the day-7 debt deadline and end the game
    G.teleport(sc.at[0], sc.at[1], 0); G.step(1 / 30);
    return G.sim.snapshot();
  }, { seed, sc: SCENES[scene] });
}
/** Begin a fixture in the page: load its start, then place the scene's enemies (part of the fixture, not input). */
const BEGIN = ({ fx, sc }) => {
  const G = window.__game; G.sim.setExternalClock(true); const h0 = G.sim.begin(fx.start);
  for (const [k, dx, dz] of (sc.enemies || [])) { const e = G.enemies.spawn(k, G.player.pos.clone().add({ x: dx, y: 0, z: dz }), 'replay'); e.pos.set(G.player.pos.x + dx, 0, G.player.pos.z + dz); e.prevX = e.pos.x; e.prevZ = e.pos.z; }
  return { h0, begin: G.sim.hash() };
};
async function runDirect(p, fx) {
  const b = await p.evaluate(BEGIN, { fx, sc: SCENES[fx.header.scene] });
  const r = await p.evaluate(frames => window.__game.sim.run(frames), fx.frames);
  return { begin: b.begin, ...r, errors: p.__errs.slice() };
}
/** Replay through the real frame loop (frameAt) with a render schedule: a list of frame intervals in ms. */
async function runSchedule(p, fx, schedule) {
  const b = await p.evaluate(BEGIN, { fx, sc: SCENES[fx.header.scene] });
  const r = await p.evaluate(({ frames, schedule }) => {
    const G = window.__game, S = G.sim, light = [], full = [];
    S.onTick(() => { light.push(S.hash(false)); if (S.tick % 30 === 0) full.push([S.tick, S.hash(true)]); });
    S.logDecisions(true); S.play(frames);
    let ts = 1000, i = 0, frameCount = 0; S.frameAt(ts);
    const cap = frames.length * 60 + 1000;
    while (S.playing() > 0 && frameCount < cap) { ts += schedule[i++ % schedule.length]; S.frameAt(ts); frameCount++; }
    const decisions = S.logDecisions(false); S.onTick(null);
    return { light, full, decisions, end: S.hash(true), tick: S.tick, frames: frameCount, stalled: S.playing() > 0 };
  }, { frames: fx.frames, schedule });
  return { begin: b.begin, ...r, errors: p.__errs.slice() };
}
function firstDiff(a, b) { const n = Math.max(a.length, b.length); for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i; return -1; }
function compare(ref, run) {
  const li = firstDiff(ref.light, run.light);
  const fi = firstDiff(ref.full.map(x => x.join(':')), run.full.map(x => x.join(':')));
  const di = firstDiff(ref.decisions.map(x => JSON.stringify(x)), run.decisions.map(x => JSON.stringify(x)));
  return { same: li === -1 && fi === -1 && di === -1 && ref.end === run.end && ref.begin === run.begin, firstLightTick: li === -1 ? null : li + 1, firstFullCheckpoint: fi === -1 ? null : (ref.full[fi] || run.full[fi])[0], firstDecision: di === -1 ? null : (ref.decisions[di] || run.decisions[di]), beginMatch: ref.begin === run.begin, endMatch: ref.end === run.end };
}
function checkHeader(fx, here) {
  const bad = [];
  for (const k of ['format', 'tickHz', 'rules', 'schema', 'modelDigest']) if (JSON.stringify(fx.header[k]) !== JSON.stringify(here[k])) bad.push(`${k}: replay has ${JSON.stringify(fx.header[k])}, this build has ${JSON.stringify(here[k])}`);
  return bad;
}
const SCHEDULES = {
  '30fps': [1000 / 30], '60fps': [1000 / 60], '144fps': [1000 / 144],
  irregular: [16.7, 7, 33, 16.7, 50, 9, 16.7, 120, 16.7, 25, 5, 16.7, 300, 16.7, 40], // hitches exercise bounded catch-up
};
async function record(browser, url, seed, scene, ticks) {
  const p = await openPage(browser, url);
  const start = await makeStart(p, seed, scene); const here = await p.evaluate(() => window.__game.sim.header());
  const fx = { header: { ...here, seed, scene, ticks, build: 'v0.9.4+p1', createdBy: 'scripts/replay.cjs' }, start, frames: genInputs(seed, scene, ticks) };
  const r = await runDirect(p, fx); await p.close();
  fx.expect = { begin: r.begin, end: r.end, full: r.full, lightEvery100: r.light.filter((_, i) => i % 100 === 99), decisions: r.decisions.length, stalled: r.stalled, finalTick: r.tick };
  return { fx, r };
}
(async () => {
  const [cmd, url, a1, a2, a3, a4] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (cmd === 'record') {
      const { fx, r } = await record(browser, url, +a2, a3, +a4); fs.writeFileSync(a1, JSON.stringify(fx));
      console.log(JSON.stringify({ wrote: a1, ticks: fx.frames.length, end: r.end, stalled: r.stalled, decisions: r.decisions.length, errors: r.errors }));
    } else if (cmd === 'play' || cmd === 'digest') {
      const fx = JSON.parse(fs.readFileSync(a1, 'utf8'));
      if (cmd === 'digest') fx.header.modelDigest = 'sha256:0000-not-this-model';
      const p = await openPage(browser, url); const here = await p.evaluate(() => window.__game.sim.header());
      const bad = checkHeader(fx, here);
      if (bad.length) { console.log(JSON.stringify({ rejected: true, reasons: bad })); process.exitCode = cmd === 'digest' ? 0 : 2; return; }
      if (cmd === 'digest') { console.log(JSON.stringify({ rejected: false, error: 'a wrong digest was accepted' })); process.exitCode = 1; return; }
      const r = await runDirect(p, fx);
      const ok = r.begin === fx.expect.begin && r.end === fx.expect.end && JSON.stringify(r.full) === JSON.stringify(fx.expect.full);
      const fi = r.full.findIndex((x, i) => JSON.stringify(x) !== JSON.stringify(fx.expect.full[i]));
      console.log(JSON.stringify({ match: ok, beginMatch: r.begin === fx.expect.begin, endMatch: r.end === fx.expect.end, fullCheckpoints: [r.full.length, fx.expect.full.length], firstFullMismatch: fi < 0 ? null : [r.full[fi], fx.expect.full[fi]], errors: r.errors })); process.exitCode = ok ? 0 : 1;
    } else if (cmd === 'diverge') {
      const fx = JSON.parse(fs.readFileSync(a1, 'utf8')); const at = +a2;
      const p = await openPage(browser, url); const ref = await runDirect(p, fx);
      const alt = JSON.parse(JSON.stringify(fx)); const f = alt.frames[at - 1]; f.k = f.k.includes('KeyD') ? f.k.filter(k => k !== 'KeyD') : [...f.k, 'KeyD'].sort();
      const p2 = await openPage(browser, url); const run = await runDirect(p2, alt);
      const c = compare(ref, run);
      console.log(JSON.stringify({ changedInputTick: at, firstDifferingTick: c.firstLightTick, firstDifferingFullCheckpoint: c.firstFullCheckpoint, found: c.firstLightTick === at }));
      process.exitCode = c.firstLightTick === at ? 0 : 1;
    } else if (cmd === 'verify') {
      const fx = JSON.parse(fs.readFileSync(a1, 'utf8')); const names = (a2 || '30fps,60fps,144fps,irregular').split(',');
      const p = await openPage(browser, url); const ref = await runDirect(p, fx); await p.close();
      const out = { fixture: path.basename(a1), refEnd: ref.end, expectedEnd: fx.expect.end, schedules: {} };
      for (const n of names) { const q = await openPage(browser, url); const r = await runSchedule(q, fx, SCHEDULES[n]); await q.close(); out.schedules[n] = { frames: r.frames, ...compare(ref, r), stalled: r.stalled, errors: r.errors.length }; }
      out.allSame = ref.end === fx.expect.end && Object.values(out.schedules).every(x => x.same);
      console.log(JSON.stringify(out)); process.exitCode = out.allSame ? 0 : 1;
    } else if (cmd === 'matrix') {
      const outdir = a1, ticks = +a2; fs.mkdirSync(outdir, { recursive: true }); const rows = [];
      for (const seed of [11, 4242, 90001]) for (const scene of ['town', 'combat', 'tide']) {
        const t0 = Date.now();
        let rec; for (let a = 1; ; a++) { try { rec = await record(browser, url, seed, scene, ticks); break; } catch (e) { if (a >= 2 || !/crash|closed/i.test(e.message)) throw e; console.error(`  ${scene}-${seed} record crashed, retrying`); } }
        const { fx, r } = rec;
        const file = path.join(outdir, `${scene}-${seed}.json`); fs.writeFileSync(file, JSON.stringify(fx));
        // each stage in its own tab; a renderer crash is retried once in a fresh tab and recorded
        const crashes = [];
        const stage = async (name, fn) => { for (let attempt = 1; ; attempt++) { const pg = await openPage(browser, url); try { const v = await fn(pg); await pg.close(); console.error(`  ${scene}-${seed} ${name} ok`); return v; } catch (e) { try { await pg.close(); } catch {} if (attempt >= 2 || !/crash|closed/i.test(e.message)) throw e; crashes.push(name); console.error(`  ${scene}-${seed} ${name} crashed, retrying`); } } };
        const again = await stage('repeat', pg => runDirect(pg, fx));
        const s60 = await stage('60fps', pg => runSchedule(pg, fx, SCHEDULES['60fps']));
        const sir = await stage('irregular', pg => runSchedule(pg, fx, SCHEDULES.irregular));
        // checkpoint-restored: a fresh page rebuilds tick N/2 from the start state plus the first half of the inputs
        // (the seed + input reconstruction the P1 brief allows), then plays the rest; must equal the uninterrupted run.
        const half = Math.floor(fx.frames.length / 2);
        const tail = await stage('checkpoint', async pg => { await pg.evaluate(BEGIN, { fx, sc: SCENES[scene] }); await pg.evaluate(fr => { window.__game.sim.run(fr); }, fx.frames.slice(0, half)); return pg.evaluate(fr => window.__game.sim.run(fr), fx.frames.slice(half)); });
        const row = { scene, seed, ticks: fx.frames.length, stalledAtTick: r.stalled ? r.tick : null, decisions: r.decisions.length,
          repeat: compare(r, again).same, sched60: compare(r, s60).same, schedIrregular: compare(r, sir).same,
          checkpointRestored: tail.end === r.end && JSON.stringify(tail.light) === JSON.stringify(r.light.slice(half)),
          firstDiff: { repeat: compare(r, again).firstLightTick, s60: compare(r, s60).firstLightTick, irregular: compare(r, sir).firstLightTick },
          framesIrregular: sir.frames, renderCrashesRetried: crashes, pageErrors: r.errors.length + again.errors.length + s60.errors.length + sir.errors.length, seconds: Math.round((Date.now() - t0) / 1000) };
        rows.push(row); console.log(JSON.stringify(row));
        fs.writeFileSync(path.join(outdir, 'matrix.json'), JSON.stringify(rows, null, 1));
      }
      const all = rows.every(x => x.repeat && x.sched60 && x.schedIrregular && x.checkpointRestored && x.pageErrors === 0);
      console.log(JSON.stringify({ rows: rows.length, allSame: all })); process.exitCode = all ? 0 : 1;
    } else { console.log('commands: record play verify diverge digest matrix'); process.exitCode = 2; }
  } finally { await browser.close(); }
})().catch(e => { console.error('REPLAY FAILED', e); process.exit(1); });
