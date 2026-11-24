// Browser check for the Sunken Chapel, the Cinder Wraith, the gate defence, the audit and the ending.
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:5198/';
const out = 'shots4'; fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const until = async (fn, ms = 12000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await g(fn)) return true; await wait(200); } return false; };
  const shot = async n => { await g(() => window.__game.step(0.1)); await wait(350); await page.screenshot({ path: `${out}/${n}.png` }); };
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`); };
  await g(() => { localStorage.clear(); }); await page.reload(); await page.waitForFunction(() => window.__game);
  await g(() => window.__game.start('standard')); await wait(400);
  // fast-forward the story to the Sunken Chapel using the same rules the game uses
  await g(() => { const { s, S } = window.__game; const G = window.__game; s.crowns = 400; s.counters.ate = s.counters.drank = s.counters.washed = 1; S.updateQuests(s);
    S.chooseTalk(s, S.talkChoices(s, 'tolan')[0].key); s.contractsDone = 1; s.counters.debtPaid = 60; S.updateQuests(s);
    S.chooseTalk(s, S.talkChoices(s, 'petch').find(c => c.key.includes('mq1')).key); s.flags.millEntered = true; s.flags.millCheckpoint = true; s.flags.millCleared = true; s.inventory.ember = 1; G.boss.dead = true; S.updateQuests(s);
    S.chooseTalk(s, S.talkChoices(s, 'maren').find(c => c.key.includes('mq1')).key); S.chooseTalk(s, S.talkChoices(s, 'lira')[0].key); });
  ok('story at "attune the cairns"', await g(() => window.__game.s.quests.mq2 && window.__game.s.quests.mq2.stage === 1));
  await g(() => { const G = window.__game; G.s.minutes = 2 * 1440 + 10 * 60; G.view('third'); G.interactAt('cairn_mill_road'); }); await wait(900); await shot('20-attune'); await until(() => !window.__game.player.action);
  ok('attuned at a cairn', await g(() => window.__game.S.flag(window.__game.s, 'attune:mill_road') === 1));
  await g(() => { const { s, S } = window.__game; for (const k of ['raider_camp', 'whisper_stones']) S.setFlag(s, 'attune:' + k); S.updateQuests(s); S.chooseTalk(s, S.talkChoices(s, 'lira')[0].key); });
  ok('Spark learned and chapel quest started', await g(() => window.__game.s.story.sparkLearned && !!window.__game.s.quests.mq3));
  // the chapel exterior and entry
  await g(() => { const G = window.__game; for (const e of [...G.enemies.list]) G.enemies.remove(e); G.view('third'); G.teleport(41, 114, Math.PI * 1.2); G.player.pitch = -0.12; G.step(0.8); }); await shot('21-chapel-exterior');
  await g(() => window.__game.interactAt('chapel_door')); await wait(2600);
  ok('entered the Sunken Chapel', await g(() => window.__game.world.inChapel && window.__game.player.pos.x > 100));
  await g(() => { const G = window.__game; G.view('first'); const O = G.world.chapel.origin; G.teleport(O.x, O.z + 11, 0); G.player.pitch = -0.1; G.step(0.6); }); await shot('22-nave-flooded');
  ok('wading slows you in the flooded nave', await g(() => { const G = window.__game; const O = G.world.chapel.origin; G.teleport(O.x, O.z + 6, 0); G.step(0.2); return G.player.wading; }));
  await g(() => { const G = window.__game; for (const e of G.enemies.list) if (e.tag === 'chapel') e.hp = 1; G.view('third'); G.interactAt('chapel_valve_a'); }); await wait(700); await shot('23-valve'); await until(() => !window.__game.player.action);
  await g(() => window.__game.interactAt('chapel_valve_b')); await until(() => window.__game.S.flag(window.__game.s, 'valveB') === 1); await until(() => !window.__game.player.action);
  await g(() => window.__game.step(6)); await wait(300);
  ok('nave drained and the water gate lifted', await g(() => window.__game.world.chapel.flood < 0.05 && !window.__game.world.colliders.includes(window.__game.world.chapel.gate.box)), String(await g(() => window.__game.world.chapel.flood)));
  await g(() => { const G = window.__game; G.view('first'); const O = G.world.chapel.origin; G.teleport(O.x, O.z + 10, 0); G.step(0.4); }); await shot('24-nave-drained');
  await g(() => window.__game.interactAt('chapel_waystone')); await until(() => window.__game.S.flag(window.__game.s, 'chapelCheckpoint') === 1); await until(() => !window.__game.player.action);
  // the Cinder Wraith
  await g(() => { const G = window.__game; const O = G.world.chapel.origin; G.s.hp = 100; G.s.mana = 120; G.teleport(O.x, O.z - 18.5, 0); G.view('third'); G.step(1.2); }); await shot('25-wraith-wakes');
  ok('the Cinder Wraith wakes in the sanctum', await g(() => window.__game.wraith.active));
  const adapt = await g(() => { const G = window.__game, W = G.wraith; const hp0 = W.e.hp; for (let i = 0; i < 3; i++) G.enemies.damage(W.e, 30, 0, undefined, 'bullet'); const afterThree = hp0 - W.e.hp; const h = W.hardened(); const b = W.e.hp; G.enemies.damage(W.e, 30, 0, undefined, 'bullet'); const resisted = b - W.e.hp; const c = W.e.hp; G.enemies.damage(W.e, 30, 0, 'burn', 'fire'); return { afterThree, h, resisted, fire: c - W.e.hp, note: W.note() }; });
  ok('three bullets in a row harden it against bullets; fire still hurts', adapt.h.includes('bullet') && adapt.resisted < 12 && adapt.fire > 30, JSON.stringify(adapt));
  await g(() => { const G = window.__game; G.s.hp = 100; G.step(1.5); }); await shot('26-wraith-fight');
  await g(() => { const G = window.__game, W = G.wraith; const kinds = ['fire', 'frost', 'spark', 'melee', 'bullet']; for (let i = 0; i < 400 && !W.dead; i++) { G.s.hp = 100; G.enemies.damage(W.e, 35, 0, undefined, kinds[i % 5]); G.step(0.1); } G.step(1); });
  ok('Wraith defeated: flag, Censer', await g(() => window.__game.S.flag(window.__game.s, 'chapelCleared') === 1 && window.__game.s.inventory.censer === 1), JSON.stringify(await g(() => ({ hp: window.__game.wraith.e.hp, ph: window.__game.wraith.phase }))));
  await g(() => window.__game.interactAt('chapel_exit')); await wait(2600);
  ok('left the chapel', await g(() => !window.__game.world.dungeon && window.__game.player.pos.z > 100));
  await g(() => { const { s, S } = window.__game; S.updateQuests(s); S.chooseTalk(s, S.talkChoices(s, 'maren').find(c => c.key.includes('mq3')).key); });
  ok('Censer given to the Chapel; Wardbreak Night begins', await g(() => window.__game.s.story.censer === 'chapel' && !!window.__game.s.quests.mq4));
  // gate defence
  await g(() => { const { s, S } = window.__game; S.chooseTalk(s, S.talkChoices(s, 'renn').find(c => c.key.includes('mq4')).key); s.minutes = Math.floor(s.minutes / 1440) * 1440 + 21 * 60; window.__game.storyTick(); });
  await g(() => window.__game.talkTo('renn')); await wait(300); await shot('27-renn-ready');
  await g(() => { const b = [...document.querySelectorAll('[data-story]')].find(x => x.dataset.story.includes('mq4')); b.click(); }); await wait(300);
  ok('gate defence started', await g(() => window.__game.gate.active));
  await g(() => { const G = window.__game; G.s.hp = 100; G.teleport(0, 38, Math.PI); G.view('third'); G.step(7); }); await shot('28-gate-wave1');
  const held = await g(() => { const G = window.__game; for (let i = 0; i < 300 && !G.S.flag(G.s, 'gateHeld'); i++) { G.s.hp = 100; for (const e of G.enemies.list) if (e.alive && e.tag === 'gate') G.enemies.damage(e, 500, 0); G.step(1); } return G.S.flag(G.s, 'gateHeld'); });
  ok('three waves beaten: the gate held', held === 1);
  await g(() => window.__game.storyTick());
  ok('Aldric comes down from the Spire', await g(() => window.__game.folk.find(f => f.def.id === 'aldric').present));
  await g(() => { const G = window.__game; G.s.minutes = Math.floor(G.s.minutes / 1440 + 1) * 1440 + 9 * 60; G.view('third'); G.teleport(-28.5, 25.2, Math.PI / 2); G.step(1); }); await shot('29-aldric');
  const debtBefore = await g(() => window.__game.s.debt);
  await g(() => window.__game.talkTo('aldric')); await wait(300); await g(() => document.querySelector('[data-story]').click()); await wait(300); await shot('30-aldric-verdict'); await g(() => window.__game.closeModal());
  ok('Aldric: wards done, 100 off the debt (both stones to the Chapel)', await g(d => window.__game.s.story.wardsDone && window.__game.s.debt === d - 100, debtBefore), String(await g(() => window.__game.s.debt)));
  // pay the rest → the true ending
  await g(() => { const G = window.__game; G.s.crowns = 500; G.interactAt('clerk'); }); await wait(300);
  await g(() => { const b = [...document.querySelectorAll('[data-pay]')].pop(); b.click(); }); await wait(600);
  await until(() => !!document.querySelector('[data-next],[data-cont]')); await shot('31-ending');
  ok('ending screen shown with title', await g(() => /Warden of Millbrook/.test(document.querySelector('.modal h2').textContent)), await g(() => document.querySelector('.modal h2') && document.querySelector('.modal h2').textContent));
  await g(async () => { for (let i = 0; i < 8; i++) { const n = document.querySelector('[data-next]'); if (!n) break; n.click(); await new Promise(r => setTimeout(r, 50)); } }); await shot('32-ending-last');
  await g(() => document.querySelector('[data-cont]').click()); await wait(300);
  ok('free play after the ending', await g(() => !window.__game.s.gameover && window.__game.s.story.freePlay && !window.__game.modalOpen()));
  // the audit
  await g(() => { const { s, S } = window.__game; s.ledgerCases = 1; S.chooseTalk(s, S.talkChoices(s, 'brannic').find(c => c.key.includes('redink')).key); s.counters.perfectCases = 3; S.updateQuests(s); S.chooseTalk(s, S.talkChoices(s, 'brannic').find(c => c.key.includes('redink')).key); s.minutes = Math.floor(s.minutes / 1440 + 1) * 1440 + 9 * 60; s.job.lastShiftDay = 0; });
  await g(() => window.__game.interactAt('ledger_desk')); await wait(300); await shot('33-desk-audit');
  await g(() => document.querySelector('[data-audit]').click()); await wait(300); await shot('34-audit');
  await g(async () => { const G = window.__game; while (G.s.caseFile && G.s.caseFile.index < G.s.caseFile.c.questions.length) { const q = G.s.caseFile.c.questions[G.s.caseFile.index]; document.querySelector(`[data-o="${q.options.findIndex(o => o.ok)}"]`).click(); await new Promise(r => setTimeout(r, 40)); } document.querySelector('[data-done]').click(); await new Promise(r => setTimeout(r, 1700)); });
  ok('audit solved: working papers in hand', await g(() => window.__game.s.inventory.auditfile === 1));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(2); });
