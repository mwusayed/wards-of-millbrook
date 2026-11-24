// v0.7 browser checks: the Eastern Reach (travel, quests, mine, Warden Engine, fishing, mining, traders,
// carbine, coach, inn, bath, Lodge, ewe, toll, fold) and the new animation layer.
const { chromium } = require('playwright');
const fs = require('fs');
const url = process.argv[2] || 'http://127.0.0.1:5198/';
fs.mkdirSync('shots7', { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(String(e.stack || e))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url); await page.waitForFunction(() => window.__game, null, { timeout: 240000 });
  const g = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${cond ? '' : extra}`); };
  const waitIdle = async (ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await g(() => !window.__game.player.action)) return true; await wait(300); } return false; };
  const closeAll = () => g(() => { const G = window.__game; for (let i = 0; i < 5 && G.modalOpen(); i++) G.closeModal(); });
  const shot = async n => { await g(() => window.__game.step(0.1)); await wait(350); await page.screenshot({ path: `shots7/${n}.png` }); };
  await g(() => { localStorage.clear(); window.__game.start('standard'); }); await wait(500);
  const clear = () => g(() => { const G = window.__game; for (const e of [...G.enemies.list]) G.enemies.remove(e); });
  // --- walking out of the East Gate (collision must let you through) ---
  await clear(); await g(() => { const G = window.__game; G.teleport(37, 4.5); G.player.yaw = -Math.PI / 2; G.player.pitch = 0; });
  await page.keyboard.down('KeyW'); await g(() => window.__game.step(2.5)); await page.keyboard.up('KeyW');
  const ex = await g(() => window.__game.player.pos.x);
  ok('walk east through the new East Gate', ex > 44, 'x=' + ex.toFixed(1));
  // --- the gait: feet keep pace, phase advances with distance, joints are finite ---
  const anim = await g(() => { const G = window.__game, m = G.player.model; const p0 = m.phase; G.teleport(60, 5); G.player.yaw = -Math.PI / 2; return { p0 }; });
  await page.keyboard.down('KeyW'); await g(() => window.__game.step(1.0)); const mid = await g(() => { const m = window.__game.player.model; return { phase: m.phase, thigh: m.j.thighL.rotation.x, knee: m.j.kneeL.rotation.x, foot: m.j.footL.rotation.x }; }); await page.keyboard.up('KeyW');
  ok('gait phase advances with distance and limbs move', Math.abs(mid.phase - anim.p0) > 3 && Number.isFinite(mid.thigh + mid.knee + mid.foot), JSON.stringify(mid));
  await g(() => { window.__game.view('third'); }); await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft'); await g(() => window.__game.step(0.6)); await shot('20-run-third'); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  await page.keyboard.down('KeyA'); await g(() => window.__game.step(0.5)); await shot('21-strafe-left'); await page.keyboard.up('KeyA');
  // --- The Road East: Vole's dispatch to Ashford ---
  const q1 = await g(() => { const G = window.__game, s = G.s; s.quests.mq1 = { stage: 9, state: 'done', startDay: 1, doneDay: 1 }; const r = G.S.chooseTalk(s, 'offer:eq1'); return { reply: r.slice(0, 40), dispatch: s.inventory.dispatch, active: G.S.questActive(s, 'eq1') }; });
  ok('Vole offers The Road East and hands over the dispatch', q1.active && q1.dispatch === 1, JSON.stringify(q1));
  await clear(); await g(() => { const G = window.__game; G.teleport(262, 14); G.step(0.3); G.storyTick(); G.storyTick(); });
  const q1b = await g(() => { const G = window.__game, s = G.s; return { disc: s.discovered.includes('place:ashford'), stage: s.quests.eq1.stage, choices: G.S.talkChoices(s, 'garrow').map(c => c.key) }; });
  ok('arriving in Ashford is discovered and moves the quest on', q1b.disc && q1b.stage === 1 && q1b.choices.length > 0, JSON.stringify(q1b));
  await g(() => { const G = window.__game, s = G.s; G.S.chooseTalk(s, G.S.talkChoices(s, 'garrow')[0].key); G.storyTick(); });
  const q2 = await g(() => { const s = window.__game.s; return { eq1: s.quests.eq1?.state, eq2: s.quests.eq2?.state, crowns: s.crowns }; });
  ok('the Reeve takes the dispatch; Copper and Silence begins', q2.eq1 === 'done' && q2.eq2 === 'active', JSON.stringify(q2));
  // --- eq2: Ilse, then Tam (needs eel pie) ---
  const q3 = await g(() => { const G = window.__game, s = G.s, S = G.S; S.chooseTalk(s, S.talkChoices(s, 'ilse')[0].key); const noPie = S.talkChoices(s, 'tam').map(c => c.label); s.inventory.eelpie = 1; const withPie = S.talkChoices(s, 'tam'); S.chooseTalk(s, withPie[0].key); return { noPie, key: s.inventory.liftkey, stage: s.quests.eq2.stage }; });
  ok('Tam only talks for an eel pie, then gives the lift key', q3.key === 1 && q3.stage === 2 && q3.noPie.length === 1, JSON.stringify(q3));
  // --- Copper Hollow ---
  await clear(); await g(() => { const G = window.__game; G.teleport(262, -116); G.goMine(true); }); await wait(1600); await g(() => window.__game.step(0.5));
  const m1 = await g(() => { const G = window.__game, s = G.s; G.storyTick(); return { d: G.world.dungeon, entered: G.S.flag(s, 'mineEntered'), stage: s.quests.eq2.stage, hollow: G.enemies.list.filter(e => e.tag === 'mine').length }; });
  ok('entering Copper Hollow: dungeon, flag, hollowed miners, quest stage', m1.d === 'mine' && m1.entered === 1 && m1.hollow >= 4 && m1.stage === 3, JSON.stringify(m1));
  await shot('22-mine-workings');
  await g(() => { const G = window.__game; G.interactWith('mine_lift'); }); await wait(2600); await g(() => window.__game.step(0.4));
  const m2 = await g(() => { const G = window.__game, p = G.player.pos, d = G.world.mine.deep; return { dist: p.distanceTo(d) }; });
  ok('the lift cage takes you to the deep gallery (with the key)', m2.dist < 3, JSON.stringify(m2));
  await g(() => { const G = window.__game; for (const e of [...G.enemies.list]) if (e.tag === 'mine') G.enemies.remove(e); G.interactWith('mine_waystone'); G.step(0.5); G.interactWith('mine_note_2'); G.step(0.3); }); await waitIdle(); await g(() => { const G = window.__game; G.step(0.2); G.storyTick(); });
  const m3 = await g(() => { const G = window.__game, s = G.s; return { cp: G.S.flag(s, 'mineCheckpoint'), journal: s.inventory.journal, stage: s.quests.eq2.stage, eq3: s.quests.eq3?.state }; });
  ok('deep gallery: waystone lit, Brask\'s journal found, his widow\'s task opens', m3.cp === 1 && m3.journal === 1 && m3.stage === 4 && m3.eq3 === 'active', JSON.stringify(m3));
  await shot('23-deep-gallery');
  // --- the Warden Engine ---
  await g(() => { const G = window.__game, v = G.world.mine.vault; G.teleport((v.minX + v.maxX) / 2, v.maxZ - 6); G.player.yaw = 0; G.step(0.5); });
  const e1 = await g(() => ({ active: window.__game.engine.active }));
  ok('the Warden Engine wakes when you enter the vault', e1.active, JSON.stringify(e1));
  await shot('24-engine');
  const e2 = await g(() => { const G = window.__game, E = G.engine, e = E.e; E.cd = 99; E.atk = 'none';
    const hp0 = e.hp; const fwd = { x: -Math.sin(e.yaw), z: -Math.cos(e.yaw) };
    G.teleport(e.pos.x + fwd.x * 6, e.pos.z + fwd.z * 6); E.update(0.016, 1, G.player.pos, true); e.onDamage(100, undefined, 'bullet'); const front = hp0 - e.hp;
    const hp1 = e.hp; G.teleport(e.pos.x - fwd.x * 6, e.pos.z - fwd.z * 6); E.lastPlayer?.copy?.(G.player.pos); E.update(0.016, 1, G.player.pos, true); e.yaw = Math.atan2(-(e.pos.x - G.player.pos.x), -(e.pos.z - G.player.pos.z)); e.onDamage(100, undefined, 'bullet'); const back = hp1 - e.hp;
    return { front: Math.round(front), back: Math.round(back) }; });
  ok('the Engine\'s front is armoured and its back core is not', e2.front <= 30 && e2.back >= 150, JSON.stringify(e2));
  const e3 = await g(() => { const G = window.__game, E = G.engine; E.atk = 'charge'; E.t = 2; E.chargeDir.set(1, 0, 0); for (let i = 0; i < 120 && E.stunT <= 0; i++) E.update(1 / 30, 2 + i / 30, G.player.pos.clone().add(new G.THREE_V(0, 0, 30)), true); return { stun: E.stunT }; }).catch(e => ({ err: String(e) }));
  ok('a charge into the wall stuns it', (e3.stun ?? 0) > 0, JSON.stringify(e3));
  const e4 = await g(() => { const G = window.__game, E = G.engine; E.e.hp = 5; E.stunT = 1; E.e.onDamage(50, undefined, 'bullet'); E.update(0.016, 3, G.player.pos, true); G.storyTick(); const s = G.s; return { dead: E.dead, flag: G.S.flag(s, 'engineDown'), core: s.inventory.wardcore, stage: s.quests.eq2.stage }; });
  ok('the Engine falls: flag, heart in your pack, quest moves to the seam', e4.dead && e4.flag === 1 && e4.core === 1 && e4.stage === 5, JSON.stringify(e4));
  const e5 = await g(() => { const G = window.__game, s = G.s; const c0 = s.crowns; G.S.decideSeam(s, 2); G.storyTick(); const r = G.S.talkChoices(s, 'garrow'); G.S.chooseTalk(s, r[0].key); G.storyTick(); return { gained: s.crowns - c0, eq2: s.quests.eq2.state, core: s.inventory.wardcore }; });
  ok('open the seam to the guild (+150) and report: the arc is complete', e5.gained >= 150 && e5.eq2 === 'done' && e5.core === 0, JSON.stringify(e5));
  await g(() => window.__game.goMine(false)); await wait(1500); await g(() => window.__game.step(0.3));
  ok('back out of the mine', await g(() => !window.__game.world.dungeon));
  // --- fishing ---
  await clear(); const f1 = await g(() => { const G = window.__game, s = G.s; window.__modalBefore = document.querySelector('.modal')?.textContent?.slice(0, 80); s.inventory.rod = 1; const it = G.world.interactables.find(i => i.id === 'fish_bridge'); G.teleport(it.pos.x, it.pos.z); G.startFishing(it); return { fishing: !!G.fishing, modal: window.__modalBefore }; });
  ok('casting a line from the bridge jetty', f1.fishing, JSON.stringify(f1));
  await g(() => { const G = window.__game; G.fishing.wait = 0.2; G.fishing.window = 60; G.step(0.5); }); await page.screenshot({ path: 'shots7/25-fishing-bite.png' });
  const f2 = await g(() => { const G = window.__game, s = G.s; window.__fs = JSON.stringify(G.fishing); const before = s.inventory.trout + s.inventory.eel + s.inventory.saltfish; const phase = G.fishing?.phase; G.strikeFish(); return { st: window.__fs, act: G.player.action?.clip, phase, got: s.inventory.trout + s.inventory.eel + s.inventory.saltfish - before }; });
  ok('striking on the bite lands a fish', f2.phase === 'bite' && f2.got >= 1, JSON.stringify(f2));
  // --- mining and gathering ---
  await g(() => { const G = window.__game, s = G.s; s.inventory.pickaxe = 1; window.__c0 = s.inventory.copper; G.interactWith('ore_0'); G.step(0.3); }); await waitIdle(); const mi = await g(() => ({ got: window.__game.s.inventory.copper - window.__c0, modal: document.querySelector('.modal')?.textContent?.slice(0, 120), log: window.__game.s.log.slice(-3).map(l => l.text.slice(0, 60)) }));
  ok('a pick works the copper seam outside the Hollow', mi.got >= 1, JSON.stringify(mi));
  await g(() => { const G = window.__game, s = G.s; window.__m0 = s.inventory.mushrooms; G.interactWith('shroom_0'); G.step(0.3); }); await waitIdle(); const ga = await g(() => ({ got: window.__game.s.inventory.mushrooms - window.__m0 }));
  ok('picking Thornwood mushrooms', ga.got >= 2, JSON.stringify(ga));
  // --- traders, the carbine ---
  const tr = await g(() => { const G = window.__game, s = G.s; s.crowns = 400; const ok1 = G.R.buyGear(s, 'carbine', 'gunsmith'); const ok2 = G.R.buyFrom(s, 'gunsmith', 'carbineammo'); const ok3 = G.R.switchFirearm(s); return { ok1, ok2, ok3, fire: s.firearm, mag: s.rifle.mag }; });
  ok('buy the Hale carbine and switch to it', tr.ok1 && tr.ok2 && tr.ok3 && tr.fire === 'carbine' && tr.mag === 8, JSON.stringify(tr));
  await clear(); await g(() => { const G = window.__game; G.teleport(262, 14); G.view('first'); G.player.yaw = 0; G.selectSlot?.('carbine'); if (G.holstered()) G.toggleHolster(); G.step(0.6); });
  const fr = await g(() => { const G = window.__game, s = G.s; const m0 = s.rifle.mag; G.fire(); G.step(0.2); return { used: m0 - s.rifle.mag, vm: G.vm.firearm }; });
  ok('the carbine fires from its own tube, in first person', fr.used === 1 && fr.vm === 'carbine', JSON.stringify(fr));
  await shot('26-carbine-fp');
  await g(() => { window.__game.view('third'); window.__game.step(0.6); }); await shot('27-carbine-tp');
  const sell = await g(() => { const G = window.__game, s = G.s; s.inventory.copper += 2; const p = G.R.sellPriceAt(s, 'gunsmith', 'copper'), base = G.T.sellPrice(s, 'copper'); const got = G.R.sellAt(s, 'gunsmith', 'copper', 2); return { p, base, got }; });
  ok('traders pay more for what they want', sell.p > sell.base && sell.got === sell.p * 2, JSON.stringify(sell));
  const ch = await g(() => { const G = window.__game, s = G.s; G.R.buyFrom(s, 'curio', 'charmHare'); const m0 = G.S && window.__game.G ? 0 : 0; G.R.wearCharm(s, 'charmHare'); return { charm: s.charm }; });
  ok('buy and wear a charm', ch.charm === 'charmHare', JSON.stringify(ch));
  // --- coach, inn, bath ---
  const co = await g(() => { const G = window.__game, s = G.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 10 * 60; return { ok: G.R.takeCoach(s, 'millbrook') }; });
  ok('the coach runs between the towns', co.ok);
  const ba = await g(() => { const G = window.__game, s = G.s; s.needs.hygiene = 20; const ok1 = G.R.bathe(s); return { ok1, hyg: s.needs.hygiene, buff: G.S && G.s.buffs.steamed > s.minutes }; });
  ok('the bathhouse leaves you clean and steamed', ba.ok1 && ba.hyg === 100 && ba.buff, JSON.stringify(ba));
  const inn = await g(() => { const G = window.__game, s = G.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 22 * 60; const d0 = Math.floor(s.minutes / 1440); const r = G.R.innSleep(s); return { r: r !== false, morning: Math.floor(s.minutes / 1440) > d0 }; });
  ok('renting a bed at the Drowned Lantern sleeps you to morning', inn.r && inn.morning, JSON.stringify(inn));
  // --- the Lodge ---
  await clear(); const lo = await g(() => { const G = window.__game, s = G.s; s.active = null; G.openBoard(true); const html = document.querySelector('.modal')?.textContent ?? ''; const take = document.querySelector('.modal [data-take]'); take?.click(); G.closeModal(); return { lodge: /Wardens' Lodge/.test(html), took: !!s.active && s.active.board === 'lodge', spawned: G.enemies.list.filter(e => s.active && e.tag === s.active.id).length }; });
  ok('the Lodge board offers east notices and spawns them', lo.lodge && lo.took && lo.spawned > 0, JSON.stringify(lo));
  await g(() => { const G = window.__game, s = G.s; if (s.active) { G.enemies.clearTag(s.active.id); s.active = null; } });
  // --- wolves at the fold, the toll, Bluebell ---
  await closeAll(); await clear(); const fo = await g(() => { const G = window.__game, s = G.s; G.S.chooseTalk(s, 'offer:eq4'); s.minutes = Math.floor(s.minutes / 1440) * 1440 + 21 * 60; G.teleport(112, 4); G.step(0.5); const wolves = G.enemies.list.filter(e => e.tag === 'fold'); return { n: wolves.length, modal: G.modalOpen() ? (document.querySelector('.modal')?.textContent ?? '').slice(0, 160) : '' }; });
  ok('night at the fold brings four wolves', fo.n === 4, JSON.stringify(fo));
  await shot('28-wolves');
  const fo2 = await g(() => { const G = window.__game, s = G.s; for (const e of G.enemies.list.filter(e => e.tag === 'fold')) G.enemies.damage(e, 999, 1, undefined, 'bullet'); G.step(0.2); G.storyTick(); return { done: G.S.flag(s, 'foldDone'), stage: s.quests.eq4.stage }; });
  ok('driving them off completes the fold', fo2.done === 1 && fo2.stage === 1, JSON.stringify(fo2));
  await g(() => { const G = window.__game, s = G.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 11 * 60; G.S.chooseTalk(s, 'offer:eq5'); G.step(0.2); G.interactWith('ewe'); G.step(0.2); }); await waitIdle();
  const ew = await g(() => { const G = window.__game, s = G.s; G.step(0.2); G.storyTick(); const following = s.quests.eq5.stage === 1 && s.carryingCrate; G.teleport(115, -2); G.step(1.0); const near = G.ewe.g.position.distanceTo(G.player.pos); return { following, near, stage: s.quests.eq5.stage }; });
  ok('Bluebell found, follows you home', ew.following && ew.near < 4, JSON.stringify(ew));
  await shot('29-bluebell');
  await closeAll();
  // --- NPCs and townsfolk animation ---
  const np = await g(() => { const G = window.__game; G.teleport(262, 14); G.step(1.0); const east = G.folk.filter(f => f.def.region === 'east'); const vis = east.filter(f => f.root.visible).length; const bad = east.filter(f => !Number.isFinite(f.h.j.head.rotation.y)).length; return { n: east.length, vis, bad }; });
  ok('22 people of the Reach, Ashford folk visible and animating', np.n >= 22 && np.vis >= 8 && np.bad === 0, JSON.stringify(np));
  // --- the map ---
  const mp = await g(() => { const G = window.__game; G.openMap(); const t = document.querySelector('.modal')?.textContent ?? ''; const has = !!document.querySelector('[data-view="reach"]'); return { has, ash: /Ashford/.test(t) }; });
  await shot('30-map-reach');
  ok('the map has an Eastern Reach sheet', mp.has, JSON.stringify(mp));
  await g(() => window.__game.closeModal());
  // --- save/load v5 ---
  const sv = await g(() => { const G = window.__game; G.save(); const raw = localStorage.getItem('wards-of-millbrook-save-v1'); const o = JSON.parse(raw); return { v: o.s.version, fire: o.s.firearm, charm: o.s.charm }; });
  ok('saves are version 5 and keep the carbine and charm', sv.v === 5 && sv.fire === 'carbine' && sv.charm === 'charmHare', JSON.stringify(sv));
  ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SMOKE ERROR', e); process.exit(2); });
