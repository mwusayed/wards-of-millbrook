// Automated playthrough. Usage: node scripts/playtest.cjs <url> <outdir>
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const url = process.argv[2] || 'http://localhost:5199/'; const out = process.argv[3] || 'shots'; fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  const results = []; const ok = (name, cond, info = '') => { results.push([cond ? 'PASS' : 'FAIL', name, info]); };
  const g = (fn, ...a) => p.evaluate(fn, ...a);
  const shot = async n => p.screenshot({ path: `${out}/${n}.png` });
  const wait = ms => p.waitForTimeout(ms);
  await p.goto(url); await wait(1500); await shot('00-intro');
  await g(() => window.__game.start()); await wait(800);
  ok('game started, day 1', await g(() => window.__game.s.minutes >= 1440));
  await g(() => { const G = window.__game; G.teleport(-26, -9, Math.PI / 2 + 0.6); G.player.pitch = -0.15; }); await wait(400); await shot('01-home-fp');
  await g(() => window.__game.view('third')); await wait(500); await shot('02-home-tp');
  // stations
  const kc = await g(() => window.__game.s.needs.calories);
  await g(() => window.__game.interactAt('hearth')); await wait(400); await shot('03-cook-tp'); await g(() => document.querySelector('[data-eat="ration"]').click()); await wait(200); await g(() => window.__game.closeModal()); await wait(200);
  ok('cooking adds calories', await g(() => window.__game.s.needs.calories) > kc);
  await g(() => window.__game.interactAt('basin')); await wait(1100); await shot('04-wash-tp'); await wait(1600);
  await g(() => window.__game.interactAt('privy')); await wait(700); await shot('05-privy-tp'); await wait(2500);
  ok('privy empties bladder', await g(() => window.__game.s.needs.bladder) < 30);
  await g(() => window.__game.interactAt('chair')); await wait(1200); await shot('06-sit-tp'); await wait(1700);
  // town
  await g(() => { const G = window.__game; G.teleport(-2, 9, Math.PI * 0.95); G.player.pitch = -0.05; }); await wait(600); await shot('07-square-tp');
  await g(() => window.__game.view('first')); await wait(300); await shot('08-square-fp');
  await g(() => window.__game.interactAt('board')); await wait(600); await shot('09-board');
  const took = await g(() => { const b = document.querySelector('[data-take]'); if (b) b.click(); return !!window.__game.s.active; }); ok('took a contract', took);
  await g(() => { const b = document.querySelector('[data-prep="armor"]'); if (b) b.click(); });
  ok('bought armour prep', await g(() => !!(window.__game.s.active.prep && window.__game.s.active.prep.armor)));
  await shot('09b-board-prep'); await g(() => window.__game.closeModal());
  await wait(300);
  await g(() => window.__game.interactAt('market')); await wait(400);
  await g(() => { const btn = document.querySelector('[data-buy="ammo"]'); btn && btn.click(); }); await shot('10-shop');
  await g(() => window.__game.closeModal()); await wait(200);
  // ledger shift at 09:00+
  await g(() => { const s = window.__game.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 9 * 60; });
  await g(() => window.__game.interactAt('ledger_desk')); await wait(300); await g(() => document.querySelector('[data-shift]').click()); await wait(500); await shot('11-ledger');
  const shiftOk = await g(async () => { for (let i = 0; i < 5; i++) { const e = window.__game.s.shift.entries[window.__game.s.shift.index]; document.querySelector('#dr').value = e.debit; document.querySelector('#cr').value = e.credit; document.querySelector('[data-post]').click(); await new Promise(r => setTimeout(r, 50)); } document.querySelector('[data-done]').click(); await new Promise(r => setTimeout(r, 1800)); return window.__game.s.job.shifts; });
  ok('ledger shift completed and paid', shiftOk === 1, `crowns=${await g(() => window.__game.s.crowns)}`);
  await g(() => { window.__game.view('third'); window.__game.teleport(11, -8.2, 0); }); await wait(400); await shot('12-countinghouse-tp');
  // Vale combat
  const site = await g(() => { const G = window.__game; const c = G.s.active; const p = G.world.sites[c.site]; G.teleport(p.x, p.z + 16, 0); return c.site; });
  await wait(1500);
  await g(() => window.__game.view('first')); await g(() => window.__game.faceNearestEnemy()); await wait(300); await shot('13-vale-fp');
  let fired = 0;
  for (let i = 0; i < 14; i++) { await g(() => { window.__game.faceNearestEnemy(); window.__game.attack(); window.__game.step(0.4); }); fired++; if (i === 1) { await wait(50); await shot('14-firing-fp'); } }
  await g(() => window.__game.slot('firebolt')); for (let i = 0; i < 4; i++) { await g(() => { window.__game.faceNearestEnemy(); window.__game.attack(); window.__game.step(0.15); }); if (i === 0) await shot('15-cast-fp'); await g(() => window.__game.step(0.6)); }
  await g(() => window.__game.view('third')); await g(() => window.__game.faceNearestEnemy()); await wait(200); await g(() => window.__game.attack()); await wait(150); await shot('16-cast-tp');
  await g(() => window.__game.slot('carbine'));
  for (let i = 0; i < 16; i++) { await g(() => { window.__game.faceNearestEnemy(); window.__game.attack(); window.__game.step(0.4); }); }
  await g(() => window.__game.faceNearestEnemy());
  await shot('17-fight-tp');
  const st = await g(() => ({ kills: window.__game.s.stats.kills, hp: window.__game.s.hp, prog: window.__game.s.active && window.__game.s.active.progress, log: window.__game.s.log.slice(-5).map(l => l.text) }));
  ok('combat kills registered', st.kills > 0, JSON.stringify(st));
  // walk test
  await g(() => window.__game.teleport(0, 20, 0)); await g(() => { dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' })); window.__game.step(1.2); dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' })); });
  ok('walking moves the player', await g(() => window.__game.player.pos.z) < 18, String(await g(() => window.__game.player.pos.z)));
  // sleep
  await g(() => { const s = window.__game.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 22 * 60; });
  await g(() => window.__game.interactAt('bed')); await wait(900); await shot('18-sleep-tp'); await wait(3200);
  const sl = await g(() => ({ m: window.__game.s.minutes % 1440, a: !!window.__game.player.action, modal: window.__game.modalOpen() }));
  ok('slept to morning', sl.m >= 7 * 60 && sl.m < 7 * 60 + 5, JSON.stringify(sl));
  // ---- v0.2 checks ----
  ok('revolver holds 6', await g(() => window.__game.s.ammo.mag <= 6));
  await g(() => { window.__game.toggleHolster(); window.__game.step(0.2); }); await g(() => window.__game.view('third')); await wait(300); await shot('19-holstered-tp');
  ok('holster hides the weapon', await g(() => window.__game.holstered() && window.__game.vm.weapon === 'none'));
  await g(() => { window.__game.attack(); window.__game.step(0.2); });
  ok('attacking draws the weapon again', await g(() => !window.__game.holstered()));
  await g(() => { const G = window.__game; G.teleport(-3, 10, Math.PI * 0.95); G.player.pitch = 0; G.step(0.3); }); await wait(300); await shot('20-revolver-tp');
  await g(() => window.__game.view('first')); await wait(300); await shot('21-revolver-fp');
  const before = await g(() => { window.__game.saveTo('2'); return window.__game.s.minutes; });
  ok('save to slot 2', await g(() => !!window.__game.slotMeta('2')));
  await g(() => window.__game.newGame());
  ok('new game keeps slot 2', await g(() => !!window.__game.slotMeta('2')));
  const lm = await g(() => window.__game.loadFrom('2') ? window.__game.s.minutes : -1);
  ok('load slot 2 restores the moment', lm >= before && lm < before + 3, `saved ${before}, loaded ${lm}`);
  await g(() => window.__game.saveTo('2')); ok('overwrite slot 2', await g(() => !!window.__game.slotMeta('2')));
  await g(() => window.__game.openSlots('load')); await wait(300); await shot('22-load-slots'); await g(() => window.__game.closeModal());
  const calls = await g(() => { const r = window.__game.renderer; r.info.autoReset = true; window.__game.teleport(0, 60, 0); window.__game.step(0.1); return new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => res(r.info.render.calls)))); });
  ok('draw calls in the Vale stay low', calls < 600, `calls=${calls}`);
  // ---- v0.3 / pass 3 checks ----
  const until = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await g(fn)) return true; await wait(250); } return false; };
  const idle = () => until(() => !window.__game.player.action && !window.__game.modalOpen());
  await g(() => { const G = window.__game; G.s.inventory.soap = 2; G.s.needs.hygiene = 10; G.view('third'); G.interactAt('shower'); }); await wait(900); await shot('23-shower-tp'); await wait(3500);
  ok('shower in the bathroom washes you', await g(() => window.__game.s.needs.hygiene > 80), String(await g(() => window.__game.s.needs.hygiene)));
  await idle(); await g(() => { const G = window.__game; G.s.needs.hygiene = 10; G.interactAt('basin'); });
  ok('basin is a quick wash', await until(() => { const h = window.__game.s.needs.hygiene; return h > 20 && h < 45; }));
  await g(() => { const G = window.__game; G.view('first'); G.teleport(-24.0, -9.6, 0); G.player.pitch = -0.1; G.step(0.2); }); await wait(300); await shot('24-bathroom-fp');
  await g(() => { const G = window.__game; G.s.mana = 100; G.s.hp = 40; G.s.wounds = [{ severity: 10, label: 'Deep cut' }]; G.slot('heal'); G.attack(); G.step(0.3); });
  ok('Mend heals but keeps the wound', await g(() => window.__game.s.hp > 60 && window.__game.s.wounds.length === 1));
  await g(() => window.__game.interactAt('hearth')); await wait(300); await shot('25-kitchen');
  await g(() => { window.__game.s.inventory.ration += 1; window.__game.s.inventory.onion += 1; window.__game.closeModal(); window.__game.interactAt('hearth'); }); await wait(200);
  await g(() => { const b = document.querySelector('[data-cook="stew"]'); b && b.click(); }); await wait(200);
  await g(() => { const b = document.querySelector('[data-eat="stew"]'); b && b.click(); }); await wait(200);
  ok('cook and eat stew gives Hearty', await g(() => (window.__game.s.buffs.hearty || 0) > window.__game.s.minutes)); await g(() => window.__game.closeModal());
  await g(() => { window.__game.s.inventory.flour = 20; window.__game.interactAt('chest'); }); await wait(300); await shot('26-chest');
  await g(() => { const b = document.querySelector('[data-sort]'); b && b.click(); }); await wait(200); await g(() => window.__game.closeModal());
  ok('chest stores ingredients', await g(() => window.__game.s.storage.flour >= 20 && window.__game.s.inventory.flour === 0));
  // ledger case
  await g(() => { const s = window.__game.s; s.minutes = (Math.floor(s.minutes / 1440) + 1) * 1440 + 9 * 60; s.job.firedUntilDay = 0; });
  await g(() => window.__game.interactAt('ledger_desk')); await wait(300); await g(() => document.querySelector('[data-case]').click()); await wait(400); await shot('27-case');
  const caseOk = await g(async () => { const G = window.__game; while (G.s.caseFile && G.s.caseFile.index < G.s.caseFile.c.questions.length) { const q = G.s.caseFile.c.questions[G.s.caseFile.index]; const i = q.options.findIndex(o => o.ok); document.querySelector(`[data-o="${i}"]`).click(); await new Promise(r => setTimeout(r, 40)); } document.querySelector('[data-done]').click(); await new Promise(r => setTimeout(r, 1600)); return G.s.ledgerCases; });
  ok('case file solved and paid', caseOk === 1);
  // the Old Mill and the Patriarch
  await g(() => { const G = window.__game; G.s.minutes = Math.floor(G.s.minutes / 1440) * 1440 + 11 * 60; G.s.needs.hydration = 3000; G.s.needs.calories = 2500; G.interactAt('mill_door'); }); await wait(2600);
  ok('entered the Old Mill', await g(() => window.__game.player.pos.z < -270 && window.__game.world.inMill));
  await g(() => { const G = window.__game; G.view('first'); G.player.pitch = 0; G.step(0.3); }); await wait(300); await shot('28-mill-entry-fp');
  await idle(); await g(() => window.__game.interactAt('mill_lever')); await until(() => window.__game.s.flags.notesRead.includes('gate')); await idle();
  await g(() => window.__game.interactAt('mill_waystone')); await until(() => window.__game.s.flags.millCheckpoint);
  ok('gate opened and checkpoint lit', await g(() => window.__game.s.flags.millCheckpoint && window.__game.s.flags.notesRead.includes('gate')));
  await g(() => { const G = window.__game; for (const e of G.enemies.list) if (e.tag === 'mill') e.hp = 1; const O = G.world.mill.origin; G.teleport(O.x, O.z - 24, 0); G.view('third'); G.step(1.0); }); await wait(400); await shot('29-patriarch-tp');
  ok('the Patriarch wakes in the arena', await g(() => window.__game.boss.active));
  await g(() => { const G = window.__game; G.s.hp = 100; G.s.mana = 120; G.slot('firebolt'); for (let i = 0; i < 6; i++) { G.faceBoss(); G.attack(); G.step(0.9); G.s.hp = 100; G.s.mana = 120; } });
  await shot('30-patriarch-fight');
  await g(() => { const G = window.__game; for (let i = 0; i < 200 && !G.boss.dead; i++) { G.s.hp = 100; G.s.mana = 120; G.enemies.damage(G.boss.e, 40, 0, i % 3 === 0 ? 'burn' : undefined); G.step(0.1); } G.step(1); });
  ok('Patriarch defeated: world flag, ember, attention down', await g(() => window.__game.s.flags.millCleared && window.__game.s.inventory.ember === 1), JSON.stringify(await g(() => ({ hp: window.__game.boss.e.hp, phase: window.__game.boss.phase }))));
  await g(() => window.__game.interactAt('mill_exit')); await wait(2600);
  ok('left the mill', await g(() => !window.__game.world.inMill && window.__game.player.pos.z > 0));
  const feedCount = await g(() => window.__game.feed.lines.length);
  await g(() => { window.__game.saveTo('3'); window.__game.newGame(); window.__game.loadFrom('3'); });
  ok('save keeps chest, mill flags and ember', await g(() => window.__game.s.storage.flour >= 20 && window.__game.s.flags.millCleared && window.__game.s.inventory.ember === 1));
  await g(() => window.__game.openSettings()); await wait(300); await shot('31-settings');
  await g(() => { const sel = document.querySelector('select[data-k="shadows"]'); sel.value = 'off'; sel.dispatchEvent(new Event('change')); }); await wait(300);
  ok('settings: shadows off applies', await g(() => !window.__game.renderer.shadowMap.enabled));
  await g(() => { const sel = document.querySelector('select[data-k="shadows"]'); sel.value = 'low'; sel.dispatchEvent(new Event('change')); }); await g(() => window.__game.closeModal());
  ok('feed has produced lines', feedCount > 0, JSON.stringify(await g(() => window.__game.feed.lines.slice(-3).map(l => l.text))));
  const nans = await g(() => { const s = window.__game.s; return Object.values(s.needs).concat([s.hp, s.mana, s.stamina]).filter(v => !Number.isFinite(v)).length; });
  ok('no NaN in state', nans === 0);
  ok('no page errors', errs.length === 0, errs.slice(0, 5).join(' | '));
  for (const r of results) console.log(r.join('  '));
  fs.writeFileSync(`${out}/report.json`, JSON.stringify({ results, errs }, null, 2));
  await b.close();
  process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
})();
