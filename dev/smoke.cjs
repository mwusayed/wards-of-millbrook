const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
 const p = await b.newPage({ viewport: { width: 1280, height: 720 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
 await p.goto(process.argv[2]); await p.waitForTimeout(1500); await p.click('#go'); await p.waitForTimeout(1500);
 const ok = await p.evaluate(() => !!window.__game && window.__game.s.minutes > 0);
 await p.evaluate(() => { const G = window.__game; G.view('third'); G.teleport(-3, 12, Math.PI * 0.92); G.player.pitch = -0.08; G.step(0.2); });
 await p.waitForTimeout(1200); await p.screenshot({ path: process.argv[3] }); console.log('started', ok, 'errors', errs); await b.close(); })();
