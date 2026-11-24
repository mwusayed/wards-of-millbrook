const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); p.on('pageerror', e => console.log('ERR', e.message));
 await p.goto(process.argv[2]); await p.waitForTimeout(1500); await p.evaluate(() => window.__game.start()); await p.waitForTimeout(800);
 const r = {};
 for (const [name, x, z] of [['town', 0, 8], ['vale', -30, 60], ['vale-fight', -32, 80]]) {
   r[name] = await p.evaluate(([x, z]) => { const G = window.__game; G.teleport(x, z, 0); G.view('third'); G.bench(60); return G.bench(400); }, [x, z]);
 }
 console.log(JSON.stringify(r)); await b.close(); })();
