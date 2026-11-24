// CPU cost per frame (update + scene work, measured by the game's own bench hook) in old and new places.
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => console.log('ERR', e.message));
 await p.goto(process.argv[2] || 'http://127.0.0.1:5198/'); await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
 await p.evaluate(() => window.__game.start()); await p.waitForTimeout(800);
 const r = {};
 for (const [name, x, z] of [['millbrook', 0, 8], ['vale', -30, 60], ['brookfield', 100, 8], ['thornwood', 160, -50], ['ashford', 262, 16], ['docks', 220, 30]]) {
   r[name] = await p.evaluate(([x, z]) => { const G = window.__game; G.teleport(x, z, 0); G.view('third'); G.bench(40); const out = G.bench(200); out.calls = G.renderer.info.render.calls; return out; }, [x, z]);
 }
 console.log(JSON.stringify(r, null, 1)); await b.close(); })();
