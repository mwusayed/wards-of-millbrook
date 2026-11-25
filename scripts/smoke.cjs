// Fast browser check for pass-4 content. Usage: node scripts/smoke.cjs [url] [only]
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:5199/';
const out = 'shots4'; fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // P1: gameplay delays run on the game clock, so waiting means advancing it (0.2 s of game time per check)
  const until = async (fn, ms = 10000) => { for (let i = 0; i * 200 < Math.max(ms, 30000); i++) { if (await g(fn)) return true; await g(() => window.__game.step(0.2)); } return false; }; // bounded by game time, not wall time
  const shot = async n => { await g(() => window.__game.step(0.1)); await wait(350); await page.screenshot({ path: `${out}/${n}.png` }); };
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`); };
  await g(() => { localStorage.clear(); }); await page.reload(); await page.waitForFunction(() => window.__game);
  await g(() => window.__game.start('standard')); await wait(500);
  ok('new game starts on standard difficulty with the tutorial quest', await g(() => window.__game.s.difficulty === 'standard' && !!window.__game.s.quests.mq0));
  await g(() => { const G = window.__game; G.view('first'); G.step(0.6); }); await shot('01-start-hud');
  // tutorial quest by real actions
  await g(() => window.__game.interactAt('cistern')); await until(() => !window.__game.player.action);
  await g(() => { window.__game.interactAt('hearth'); }); await wait(200); await g(() => document.querySelector('[data-bread]').click()); await g(() => window.__game.closeModal());
  await g(() => window.__game.interactAt('basin')); await until(() => !window.__game.player.action); await g(() => window.__game.storyTick());
  ok('tutorial advanced to "ask Tolan"', await g(() => window.__game.s.quests.mq0.stage === 2), String(await g(() => window.__game.s.quests.mq0.stage)));
  await g(() => window.__game.talkTo('tolan')); await wait(300); await shot('02-talk-tolan');
  await g(() => document.querySelector('[data-story]').click()); await wait(200); await g(() => window.__game.closeModal());
  ok('talking to Tolan advances the quest', await g(() => window.__game.s.quests.mq0.stage === 3));
  // interiors
  await g(() => { const G = window.__game; G.s.minutes = 1440 + 12 * 60; G.view('first'); G.teleport(-16, 9.2, Math.PI); G.player.pitch = -0.05; G.step(1.0); }); await shot('03-tavern');
  await g(() => { const G = window.__game; G.teleport(-14.5, -16.9, 0); G.step(1.0); }); await shot('04-chapel');
  await g(() => { const G = window.__game; G.teleport(22.9, 16, -Math.PI / 2); G.step(1.0); }); await shot('05-smithy');
  await g(() => { const G = window.__game; G.view('third'); G.teleport(-29.5, 22.5, Math.PI / 2); G.step(1.0); }); await shot('06-spire-lira');
  // services
  await g(() => { const G = window.__game; G.s.crowns = 300; G.s.inventory.pelt = 3; G.interactAt('anvil'); }); await wait(250); await shot('07-forge-menu');
  await g(() => { for (const k of ['lantern', 'loader', 'coat']) document.querySelector(`[data-g="${k}"]`).click(); }); await g(() => window.__game.closeModal());
  ok('bought lantern, loader and coat', await g(() => { const s = window.__game.s; return s.gear.lantern && s.gear.loader && s.gear.coat; }));
  await g(() => window.__game.interactAt('bar')); await wait(250); await g(() => document.querySelector('[data-a="meal"]').click()); await g(() => document.querySelector('[data-a="rumour"]').click()); await wait(100); await shot('08-tavern-menu'); await g(() => window.__game.closeModal());
  await g(() => window.__game.interactAt('dice')); await wait(200); await g(() => document.querySelector('[data-roll]').click()); await wait(100); await g(() => document.querySelector('[data-stand]').click()); await wait(100); await shot('09-dice'); await g(() => window.__game.closeModal());
  ok('dice round resolved', await g(() => window.__game.s.counters['today:dice'] === 1));
  await g(() => { const G = window.__game; G.s.needs.stress = 60; G.view('third'); G.interactAt('flame'); }); await wait(1200); await shot('10-kneel'); await until(() => !window.__game.player.action);
  ok('kneeling at the flame blesses', await g(() => (window.__game.s.story.flags.blessedUntil || 0) > window.__game.s.minutes));
  await g(() => window.__game.talkTo('maren')); await wait(250); await shot('11-talk-maren'); await g(() => document.querySelector('[data-svc="chapel"]').click()); await wait(200); await shot('12-chapel-menu'); await g(() => window.__game.closeModal());
  // journal
  await g(() => window.__game.openJournal()); await wait(200); await shot('13-journal-quests');
  for (const [i, t] of ['character', 'people', 'today'].entries()) { await g(t => document.querySelector(`[data-tab="${t}"]`).click(), t); await wait(120); await shot(`1${4 + i}-journal-${t}`); }
  await g(() => window.__game.closeModal());
  // combat additions: loot, spark, dodge, lantern
  await g(() => { const G = window.__game; G.s.minutes = 2 * 1440 + 11 * 60; G.teleport(-32, 60, 0); G.step(0.5); G.s.story.sparkLearned = true; G.s.mana = 100; });
  const killed = await g(() => { const G = window.__game; let n = 0; for (let i = 0; i < 40 && n < 4; i++) { const e = G.faceNearestEnemy(); if (!e) break; G.teleport(e.pos.x + 4, e.pos.z + 4); G.faceNearestEnemy(); G.s.ammo.mag = 6; G.s.hp = 100; const k = G.s.stats.kills; for (let j = 0; j < 8 && G.s.stats.kills === k; j++) { G.faceNearestEnemy(); G.attack(); G.step(0.5); } if (G.s.stats.kills > k) n++; } return n; });
  ok('killed enemies with skill-scaled revolver', killed >= 2, String(killed));
  ok('marksmanship gained XP', await g(() => window.__game.s.skills.marksman > 0));
  await g(() => { const G = window.__game; G.s.stats.kills = 100; for (const p of G.pickups) G.teleport(p.mesh.position.x, p.mesh.position.z); G.step(0.3); });
  await g(() => { const G = window.__game; const p = G.pickups[0]; if (p) { G.teleport(p.mesh.position.x, p.mesh.position.z); G.step(0.2); } });
  await g(() => { const G = window.__game; G.slot('spark'); G.s.mana = 100; const e = G.faceNearestEnemy(); if (e) { G.teleport(e.pos.x + 5, e.pos.z + 5); G.faceNearestEnemy(); G.view('third'); G.attack(); } }); await shot('16-spark');
  ok('spark cast spent mana', await g(() => window.__game.s.mana < 100));
  const dz = await g(() => { const G = window.__game; G.s.stamina = 100; const z = G.player.pos.z, x = G.player.pos.x; G.dodge(); G.step(0.4); return Math.hypot(G.player.pos.x - x, G.player.pos.z - z); });
  ok('dodge moves you and costs stamina', dz > 2 && await g(() => window.__game.s.stamina < 100), String(dz));
  await g(() => { const G = window.__game; G.s.minutes = 2 * 1440 + 23 * 60; G.view('third'); G.toggleLantern(); G.step(1.2); }); await shot('17-lantern-night');
  ok('lantern lit', await g(() => window.__game.player.lantern));
  // gathering at night
  const moon = await g(() => { const G = window.__game; G.storyTick(); const n = G.world.nodes.find(n => n.kind === 'moon' && !n.it.hidden); if (!n) return false; G.interactAt(n.id); return true; });
  await until(() => !window.__game.player.action);
  ok('moonpetal can be cut at night', moon && await g(() => window.__game.s.inventory.moonpetal === 1));
  // save/load keeps v4 data
  await g(() => { window.__game.saveTo('2'); window.__game.newGame(); window.__game.loadFrom('2'); });
  ok('save keeps gear, skills, quests', await g(() => { const s = window.__game.s; return s.gear.lantern && s.skills.marksman > 0 && s.quests.mq0.stage === 3; }));
  // settings: keys
  await g(() => window.__game.openSettings()); await wait(250); await shot('18-settings-keys'); await g(() => window.__game.closeModal());
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(2); });
