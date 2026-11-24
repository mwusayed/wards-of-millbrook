// Visual coherence bot for Wards of Millbrook.
// Usage: node scripts/visualcheck.cjs <url> <outdir> [--keep-flagged]
// For every landmark (world.sites) it takes third-person shots from four yaw angles and one looking-down shot,
// then measures each frame in the page (objective checks only; judgement stays with a person or a reviewer):
//   magenta  = fallback/missing texture colour (#ff00ff family)
//   black    = large near-black area: missing geometry, or the camera is inside a wall
//   blank    = most 8x8 blocks are flat: untextured or unlit surface
//   lighting = a site's four yaw shots differ in mean brightness by more than 60 levels (incoherent lighting)
// Screenshots of clean frames are deleted at the end. Flagged frames are kept for review.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
(async () => {
  const url = process.argv[2] || 'http://localhost:5198/';
  const out = process.argv[3] || 'visualcheck';
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 540 } }); p.setDefaultTimeout(180000);
  const crashes = []; p.on('crash', () => crashes.push('page crashed'));
  await p.goto(url); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__game.start()); await p.waitForTimeout(800);
  const sites = await p.evaluate(() => Object.entries(window.__game.world.sites || {}).map(([k, v]) => ({ id: k, x: v.x, z: v.z })));
  console.log('sites', sites.length);
  const angles = [['y0', 0, -0.2], ['y90', Math.PI / 2, -0.2], ['y180', Math.PI, -0.2], ['y270', -Math.PI / 2, -0.2], ['down', 0, -1.0]];
  const report = { sites: [], flagged: 0, crashes };
  for (const s of sites) {
    const shots = [];
    for (const [name, yaw, pitch] of angles) {
      await p.evaluate(({ x, z, yaw, pitch }) => { const G = window.__game; for (const k of Object.keys(G.s.needs)) G.s.needs[k] = 50; G.s.hp = G.s.maxHp || 100; if (G.modalOpen()) G.closeModal(); for (const e of [...G.enemies.list]) G.enemies.remove(e); G.view('third'); G.teleport(x + 6, z + 6, yaw); G.player.pitch = pitch; G.step(0.4); }, { x: s.x, z: s.z, yaw, pitch });
      await p.waitForTimeout(250);
      const file = path.join(out, `${s.id}-${name}.png`);
      await p.screenshot({ path: file });
      const m = await p.evaluate(async (dataUrl) => {
        const img = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const c = new OffscreenCanvas(img.width, img.height); const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; const n = c.width * c.height;
        let mag = 0, black = 0, sum = 0;
        for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], bb = d[i + 2]; if (r > 200 && gg < 80 && bb > 200) mag++; const l = 0.3 * r + 0.59 * gg + 0.11 * bb; sum += l; if (l < 8) black++; }
        let flatBlocks = 0, blocks = 0; const B = 8;
        for (let by = 0; by + B <= c.height; by += B) for (let bx = 0; bx + B <= c.width; bx += B) {
          let s1 = 0, s2 = 0; for (let y = 0; y < B; y++) for (let x = 0; x < B; x++) { const i = ((by + y) * c.width + bx + x) * 4; const l = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s1 += l; s2 += l * l; }
          const mean = s1 / (B * B), sd = Math.sqrt(Math.max(0, s2 / (B * B) - mean * mean)); blocks++; if (sd < 2) flatBlocks++;
        }
        return { magentaPct: +(100 * mag / n).toFixed(3), blackPct: +(100 * black / n).toFixed(1), flatPct: +(100 * flatBlocks / blocks).toFixed(1), meanLum: +(sum / n).toFixed(1) };
      }, 'data:image/png;base64,' + (await fs.promises.readFile(file)).toString('base64'));
      const flags = [];
      if (m.magentaPct > 0.2) flags.push('magenta (missing texture?)');
      if (m.blackPct > 25) flags.push('large black area (missing geometry or camera inside a wall?)');
      if (m.flatPct > 70) flags.push('mostly flat colour (untextured surface?)');
      shots.push({ angle: name, file, ...m, flags });
    }
    const lums = shots.map(x => x.meanLum); const med = [...lums].sort((a, b) => a - b)[2];
    const incoherent = lums.filter(l => Math.abs(l - med) > 60).length > 0;
    if (incoherent) shots.forEach(x => { if (Math.abs(x.meanLum - med) > 60) x.flags.push(`lighting differs from the site's other angles (${x.meanLum} vs median ${med})`); });
    const flagged = shots.some(x => x.flags.length);
    report.sites.push({ id: s.id, at: [s.x, s.z], flagged, shots: shots.map(({ file, ...r }) => ({ ...r, file: flagged ? file : undefined })) });
    if (flagged) report.flagged++;
    for (const x of shots) if (!x.flags.length) fs.rmSync(x.file, { force: true });
    console.log(s.id, flagged ? 'FLAGGED' : 'clean', shots.map(x => x.flags.join('; ')).filter(Boolean).join(' | '));
  }
  fs.writeFileSync(path.join(out, 'visual-report.json'), JSON.stringify(report, null, 1));
  console.log('sites', report.sites.length, 'flagged', report.flagged, 'crashes', crashes.length);
  await b.close();
})().catch(e => { console.error('VISUAL BOT FAILED', e); process.exit(1); });
