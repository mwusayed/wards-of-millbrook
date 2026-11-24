// v0.8 look-around: scripted screenshots of the Westmarch for review against docs/ART_BIBLE.md.
// Each shot stands at (x, z) and looks at (tx, tz). Usage: node scripts/look8.cjs <url> [outDir]
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(process.argv[2] || 'http://127.0.0.1:5198/');
  await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
  await p.evaluate(() => { const G = window.__game; G.start(); G.s.story.flags.westGateOpen = 1; G.syncBarrow(); G.s.gear.lantern = true; });
  await p.waitForTimeout(800);
  const out = process.argv[3] || 'shots8'; require('fs').mkdirSync(out, { recursive: true });
  const shot = async (name, x, z, tx, tz, hour = 13, view = 'third', pitch = -0.08, pre = null) => {
    const yaw = Math.atan2(-(tx - x), -(tz - z));
    await p.evaluate(([x, z, yaw, hour, view, pitch, pre]) => { const G = window.__game; G.s.minutes = Math.floor(G.s.minutes / 1440) * 1440 + hour * 60; G.teleport(x, z, yaw); G.view(view); G.player.pitch = pitch; if (pre) (0, eval)(pre); }, [x, z, yaw, hour, view, pitch, pre]);
    await p.waitForTimeout(1000);
    await p.screenshot({ path: `${out}/${name}.png` });
  };
  const near = await p.evaluate(() => { const G = window.__game, THREE = G.THREE_V; const out = []; G.world.scene.traverse(o => { if (!o.isMesh || o.isInstancedMesh) return; const v = new THREE(); o.getWorldPosition(v); if (Math.hypot(v.x + 36.5, v.z - 5) < 2.5 && v.y < 2) out.push(`${o.name || o.geometry.type} @ ${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`); }); return out.slice(0, 12); });
  await shot('01-west-gate', -34, 4.5, -60, 4.5, 11);
  await shot('02-heath-road', -76, 6, -140, 8, 10);
  await shot('03-fernhollow', -244, 12, -290, 12, 12);
  await shot('04-fernhollow-green', -262, 20, -282, 4, 16);
  await shot('05-jetty', -297, 4, -330, 0, 18.5);
  await shot('06-smeath-camp', -96, -16, -104, -32, 9);
  await shot('07-ring-of-nine', -172, -54, -186, -66, 15);
  await shot('08-orm-mound', -200, -76, -200, -100, 14);
  await shot('09-vane-dig', -150, -20, -166, -32, 11);
  await shot('10-marsh', -262, 62, -290, 110, 17);
  await shot('11-fernhollow-night', -244, 12, -290, 12, 22);
  await shot('12-heron-inside', -258, -3.5, -258, -12, 20, 'first', -0.05);
  // the barrow: entrance, hall with braziers, chamber
  await p.evaluate(() => { const G = window.__game; G.world.setDungeon('barrow'); });
  await shot('13-barrow-ante', -180, -312, -180, -322, 12, 'third', -0.05);
  await shot('14-hall-of-kings', -180, -331, -180, -352, 12, 'third', -0.05, "window.__game.lightBrazier('hall_brazier_1','lantern'); window.__game.lightBrazier('hall_brazier_2','lantern')");
  await shot('15-burial-chamber', -180, -363, -180, -380, 12, 'third', -0.02);
  console.log(JSON.stringify({ errors, near }, null, 1));
  await b.close();
})();
