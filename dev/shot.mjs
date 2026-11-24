import { chromium } from 'playwright';
const [,, url, out, w = 1600, h = 900] = process.argv;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(url); await p.waitForFunction('window.done === true', null, { timeout: 30000 }).catch(() => errs.push('timeout'));
await p.screenshot({ path: out }); console.log('errors:', errs); await b.close();
