// Headless rules tests. Run: npm run test:sim
import assert from 'node:assert/strict';
import * as G from '../src/sim/state';
import * as B from '../src/sim/balance';
import { checkPosting, generateShift } from '../src/sim/ledger';
import { walkTop, climbable, mantleTop, STEP_UP, WALK_TOP_MAX } from '../src/sim/climb';

let passed = 0; const t = (name: string, fn: () => void) => { try { fn(); passed++; console.log('ok  ', name); } catch (e) { console.error('FAIL', name, '\n', e); process.exitCode = 1; } };

t('new game starts day 1 at 07:00 with debt 300', () => { const s = G.newGame(); assert.equal(G.day(s), 1); assert.equal(G.clock(s), '07:00'); assert.equal(s.debt, 300); assert.ok(s.board.length >= 3); });
t('needs decay per MM rates over one rest hour', () => { const s = G.newGame(); const c = s.needs.calories; G.advanceMinutes(s, 60, 'rest'); assert.ok(Math.abs((c - s.needs.calories) - 100) < 0.01); });
t('exertion burns three times rest calories', () => { const a = G.newGame(), b = G.newGame(); G.advanceMinutes(a, 60, 'rest'); G.advanceMinutes(b, 60, 'exert'); assert.ok((B.START_NEEDS.calories - b.needs.calories) / (B.START_NEEDS.calories - a.needs.calories) > 2.9); });
t('mana max follows fullness (TAS formula)', () => { const n = { ...B.START_NEEDS, calories: 3000 }; assert.equal(B.manaMax(n), 120); n.calories = 0; assert.equal(B.manaMax(n), 40); });
t('8 hours sleep does not dehydrate from full (VEILWORK bug stays fixed)', () => { const s = G.newGame(); s.needs.hydration = 3000; s.minutes = 1440 + 22 * 60; G.sleep(s); assert.ok(s.needs.hydration > 2500, String(s.needs.hydration)); assert.equal(G.clock(s), '07:00'); });
t('bladder accident at threshold', () => { const s = G.newGame(); s.needs.bladder = 449; G.advanceMinutes(s, 10, 'rest'); assert.equal(s.stats.accidents, 1); assert.ok(s.needs.bladder < 50); });
t('worst-need penalty (MM) applies once', () => { const n = { ...B.START_NEEDS, calories: 100, hydration: 100 }; assert.equal(B.checkChance(n, 'combat').chance, 15); });
t('big hit leaves a wound that caps max HP; bandage removes it', () => { const s = G.newGame(); G.damage(s, 20, 'raider'); assert.equal(s.wounds.length, 1); assert.equal(G.maxHp(s), 88); assert.ok(G.treatWound(s)); assert.equal(G.maxHp(s), 100); });
t('collapse wakes you next morning and charges a fee', () => { const s = G.newGame(); const c = s.crowns; G.damage(s, 200, 'shade'); assert.equal(G.clock(s), '07:00'); assert.equal(G.day(s), 2); assert.ok(s.crowns < c); assert.ok(G.consumeRespawn()); });
t('missing two instalments calls the debt', () => { const s = G.newGame(); G.advanceMinutes(s, 1440 * 15, 'rest'); assert.equal(s.gameover, 'debt'); });
t('paying the instalment avoids the miss', () => { const s = G.newGame(); s.crowns = 200; G.payDebt(s, 60); s.needs.calories = 3000; s.needs.hydration = 3000; G.advanceMinutes(s, 1440 * 7, 'rest'); assert.equal(s.missed, 0); });
t('paying the whole debt wins', () => { const s = G.newGame(); s.crowns = 400; G.payDebt(s, 300); assert.equal(s.gameover, 'won'); });
t('ledger: correct and reversed postings', () => { const [e] = generateShift(3, 1, 1); assert.ok(checkPosting(e, e.debit, e.credit).ok); assert.equal(checkPosting(e, e.credit, e.debit).why, 'Right accounts, wrong sides.'); });
t('ledger shift pays per correct entry and only in hours', () => { const s = G.newGame(); s.minutes = 1440 + 6 * 60; assert.equal(G.startShift(s), null); s.minutes = 1440 + 9 * 60; const sh = G.startShift(s)!; for (const e of sh.entries) G.postEntry(s, e.debit, e.credit); const r = G.endShift(s)!; assert.equal(r.correct, 5); assert.equal(r.pay, 55); assert.equal(G.clock(s), '13:00'); });
t('errors raise Boss Attention (LW +5 each)', () => { const s = G.newGame(); s.minutes = 1440 + 9 * 60; const a = s.job.attention; const sh = G.startShift(s)!; for (const e of sh.entries) G.postEntry(s, e.credit, e.debit); assert.equal(s.job.attention, a + 25); });
t('sweep contract: kills tagged to contract count; turn-in pays', () => { const s = G.newGame(); const c = s.board.find(x => x.kind === 'sweep')!; G.takeContract(s, c.id); for (let i = 0; i < c.count; i++) G.onKill(s, c.enemy!, c.id); const before = s.crowns; assert.ok(G.turnInContract(s)); assert.equal(s.crowns, before + c.pay); });
t('courier contract: deliver then turn in', () => { const s = G.newGame(); const c = s.board.find(x => x.kind === 'courier')!; G.takeContract(s, c.id); assert.ok(s.carryingLetter); assert.ok(G.deliverLetter(s)); assert.ok(G.turnInContract(s)); });
t('reload pulls a box of rounds from inventory', () => { const s = G.newGame(); s.ammo = { mag: 0, reserve: 0 }; assert.ok(G.reload(s)); assert.equal(s.ammo.mag, 6); });
t('save round-trip', () => { const s = G.newGame(); G.advanceMinutes(s, 123, 'active'); const o = G.deserialize(G.serialize(s, { x: 1 }))!; assert.equal(o.s.minutes, s.minutes); assert.equal(o.extra.x, 1); assert.equal(G.deserialize('{"bad":1}'), null); });
t('no NaN after a long mixed run', () => { const s = G.newGame(); for (let i = 0; i < 2000; i++) G.tickReal(s, 0.5, { sprinting: i % 3 === 0, moving: true, inCombat: i % 7 === 0 }); for (const k of B.NEED_KEYS) assert.ok(Number.isFinite(s.needs[k])); assert.ok(Number.isFinite(s.mana) && Number.isFinite(s.stamina) && Number.isFinite(s.hp)); });
// ---- pass 2 ----
t('factions: finishing a notice raises the issuer, prices follow town standing', () => { const s = G.newGame(); const c = s.board.find(x => x.kind === 'sweep')!; G.takeContract(s, c.id); for (let i = 0; i < c.count; i++) G.onKill(s, c.enemy!, c.id); G.turnInContract(s); assert.ok(Object.values(s.factions).some(v => v > 0)); s.factions.town = 100; assert.ok(G.priceOf(s, 'ammo') < B.SHOP.find(x => x.id === 'ammo')!.price); });
t('factions drift back toward neutral when neglected', () => { const s = G.newGame(); s.factions.watch = 20; s.factionTouched.watch = 1; s.crowns = 999; G.payDebt(s, 60); s.needs.calories = 3000; s.needs.hydration = 3000; G.advanceMinutes(s, 1440 * 6, 'rest'); assert.ok(s.factions.watch < 20 && s.factions.watch > 0); });
t('missing an instalment angers the Tower', () => { const s = G.newGame(); G.advanceMinutes(s, 1440 * 7, 'rest'); assert.ok(s.factions.tower <= -20, String(s.factions.tower)); });
t('prep: armour cuts damage, scouting raises pay, supplies stop exertion drain', () => { const s = G.newGame(); s.crowns = 100; const c = s.board[0]; G.takeContract(s, c.id); const base = G.contractPay(s, s.active!); G.buyPrep(s, 'armor'); G.buyPrep(s, 'scouted'); G.buyPrep(s, 'supplies'); assert.equal(G.damageTakenMult(s), 0.75); assert.ok(G.contractPay(s, s.active!) > base); const k = s.needs.calories; G.tickReal(s, 60, { sprinting: true, moving: true, inCombat: true }); assert.ok(k - s.needs.calories < 200); });
t('recovery: pick up at the cairn, then turn in', () => { const s = G.newGame(); const c = s.board.find(x => x.kind === 'recovery')!; G.takeContract(s, c.id); assert.ok(G.pickUpCrate(s)); assert.ok(s.carryingCrate); assert.ok(G.turnInContract(s)); assert.equal(s.carryingCrate, false); });
t('bank: deposits survive a collapse and earn weekly interest', () => { const s = G.newGame(); s.crowns = 200; G.payDebt(s, 60); G.deposit(s, 100); G.damage(s, 500, 'raider'); assert.equal(s.savings, 100); s.needs.calories = 3000; s.needs.hydration = 3000; G.advanceMinutes(s, 1440 * 7, 'rest'); assert.ok(s.savings > 100); });
t('feather bed clears fatigue on a full night', () => { const s = G.newGame(); s.crowns = 100; G.buyUpgrade(s, 'featherBed'); s.needs.fatigue = 90; s.minutes = 1440 + 22 * 60; G.sleep(s); assert.equal(s.needs.fatigue, 0); });
t('v0.1 saves migrate all the way to v3', () => { const s: any = G.newGame(); s.version = 1; delete s.factions; delete s.storage; s.ammo.mag = 8; const o = G.deserialize(JSON.stringify({ s, extra: {} }))!; assert.equal(o.s.version, 5); assert.equal(o.s.storage.ration, 2); assert.equal(o.s.ammo.mag, 6); assert.equal(o.s.factions.town, 0); });

// ---- pass 3: magic economy, the five scenarios from the brief ----
const ready = (s: G.GameState) => { s.rt += 100; };
t('magic 1: a fed, watered caster can cast several spells; each costs mana and calories', () => {
  const s = G.newGame(); s.mana = B.manaMax(s.needs); const kc = s.needs.calories, m0 = s.mana;
  let casts = 0; for (let i = 0; i < 6; i++) { ready(s); if (G.castSpell(s, 'firebolt').ok) casts++; }
  assert.ok(casts >= 6); assert.equal(Math.round(m0 - s.mana), 48); assert.equal(Math.round(kc - s.needs.calories), 150);
});
t('magic 2: a hungry caster gets weaker heals and must eat to cast at all', () => {
  const s = G.newGame(); s.needs.calories = 300; s.mana = 200; s.hp = 30; s.wounds = [];
  ready(s); const r = G.castSpell(s, 'heal'); assert.ok(r.ok && r.heal! <= B.HEAL_AMOUNT * B.HEAL_STARVING_MULT + 0.01);
  s.needs.calories = 0; ready(s); const r2 = G.castSpell(s, 'heal'); assert.equal(r2.ok, false);
});
t('magic 2b: heal has a cooldown and never closes wounds', () => {
  const s = G.newGame(); s.mana = 200; s.wounds = [{ severity: 30, label: 'Deep cut' }]; s.hp = 20;
  ready(s); assert.ok(G.castSpell(s, 'heal').ok); assert.equal(G.castSpell(s, 'heal').ok, false);
  for (let i = 0; i < 5; i++) { ready(s); G.castSpell(s, 'heal'); }
  assert.equal(s.wounds.length, 1); assert.ok(s.hp <= G.maxHp(s));
});
t('magic 3: regen drinks water in proportion, slows when thirsty, halts when badly dehydrated', () => {
  const a = G.newGame(); a.mana = 0; a.needs.hydration = 2500; const h0 = a.needs.hydration; G.regenMana(a, 4); const got = a.mana;
  assert.ok(Math.abs((h0 - a.needs.hydration) - got * B.MANA_WATER_ML) < 0.01);
  const b = G.newGame(); b.mana = 0; b.needs.hydration = 300; G.regenMana(b, 4); assert.ok(b.mana < got * 0.3);
  const c = G.newGame(); c.mana = 0; c.needs.hydration = 150; G.regenMana(c, 60); assert.equal(c.mana, 0);
});
t('magic 4: a long boss fight is sustainable only with water and food', () => {
  const s = G.newGame(); s.mana = B.manaMax(s.needs); let casts = 0;
  for (let sec = 0; sec < 300; sec++) { G.tickReal(s, 1, { sprinting: false, moving: true, inCombat: true }); if (sec % 3 === 0 && G.castSpell(s, 'firebolt').ok) casts++; }
  assert.ok(casts >= 35, 'casts ' + casts); assert.ok(s.needs.hydration < B.START_NEEDS.hydration - 500); assert.ok(s.needs.calories < B.START_NEEDS.calories - 1000);
});
t('magic 5: recovering after a fight with food, water, medicine and rest always works', () => {
  const s = G.newGame(); s.needs.calories = 100; s.needs.hydration = 120; s.mana = 0; s.hp = 25; s.wounds = [{ severity: 20, label: 'Bite wound' }];
  s.inventory.bread = 2; G.eat(s, 'bread'); G.drink(s, 'cistern'); G.drink(s, 'cistern'); G.treatWound(s);
  s.minutes = 1440 + 22 * 60; G.sleep(s);
  assert.equal(s.wounds.length, 0); assert.ok(s.mana > 40); assert.ok(s.hp > 60); assert.ok(s.needs.hydration > 200);
});
t('sleep refills mana but pays for it in water', () => { const s = G.newGame(); s.mana = 0; s.needs.hydration = 600; s.minutes = 1440 + 22 * 60; G.sleep(s); assert.ok(s.mana < B.manaMax(s.needs)); assert.ok(s.needs.hydration >= 150); });
// ---- cooking, buffs, carrying, chest ----
t('cooking: stew needs a ration and an onion, gives Hearty for 4 h', () => { const s = G.newGame(); assert.ok(G.cookRecipe(s, 'stew')); assert.equal(s.inventory.stew, 1); assert.ok(G.eatMeal(s, 'stew')); assert.ok(G.buffActive(s, 'hearty')); G.advanceMinutes(s, 241, 'rest'); assert.equal(G.buffActive(s, 'hearty'), false); });
t('buffs: two at most, same meal refreshes, third replaces the one nearest expiry', () => {
  const s = G.newGame(); G.applyBuff(s, 'hearty'); G.advanceMinutes(s, 60, 'rest'); G.applyBuff(s, 'warmBelly'); G.applyBuff(s, 'clearHead');
  assert.equal(G.activeBuffs(s).length, 2); assert.equal(G.buffActive(s, 'hearty'), false);
  const end = s.buffs.warmBelly!; G.advanceMinutes(s, 30, 'rest'); G.applyBuff(s, 'warmBelly'); assert.ok(s.buffs.warmBelly! > end);
});
t('sweet tooth makes spells burn fewer calories', () => { const s = G.newGame(); s.mana = 100; G.applyBuff(s, 'sweetTooth'); const k = s.needs.calories; G.castSpell(s, 'frost'); assert.ok(Math.abs((k - s.needs.calories) - 22.5) < 0.01); });
t('carrying: weight bands slow you gradually and the chest keeps items across saves', () => {
  const s = G.newGame(); assert.equal(G.loadState(s).band, 'light');
  s.inventory.flour = 15; assert.notEqual(G.loadState(s).band, 'light'); assert.ok(G.loadState(s).speedMult < 1);
  assert.equal(G.transfer(s, 'flour', 15, 'store'), 15); assert.equal(G.loadState(s).band, 'light');
  const o = G.deserialize(G.serialize(s, {}))!; assert.equal(o.s.storage.flour, 15);
  o.s.inventory.flour = 0; const took = G.transfer(o.s, 'flour', 15, 'take'); assert.ok(took > 0);
});
// ---- bathroom ----
t('basin is a quick wash, shower is a full one that uses soap', () => { const a = G.newGame(); a.needs.hygiene = 20; G.wash(a); assert.ok(a.needs.hygiene <= 45); assert.equal(a.inventory.soap, 1); const b = G.newGame(); b.needs.hygiene = 10; G.shower(b); assert.ok(b.needs.hygiene >= 90); assert.equal(b.inventory.soap, 0); });
// ---- ledger cases ----
import { makeReconcile, makeInvoice } from '../src/sim/cases';
t('reconciliation: the correct corrections close the gap exactly', () => {
  for (let seed = 1; seed < 30; seed++) { const c = makeReconcile(seed); for (const q of c.questions) assert.equal(q.options.filter(o => o.ok).length, 1); }
});
t('invoice investigation: three-way match decides every answer', () => {
  for (let seed = 1; seed < 30; seed++) { const c = makeInvoice(seed); assert.equal(c.questions.length, 3); for (const q of c.questions) assert.equal(q.options.filter(o => o.ok).length, 1); }
});
t('a perfect case pays well and lowers Boss Attention; errors raise it', () => {
  const s = G.newGame(); s.minutes = 1440 + 9 * 60; s.job.attention = 30; G.startCase(s);
  while (s.caseFile && s.caseFile.index < s.caseFile.c.questions.length) G.answerCase(s, s.caseFile.c.questions[s.caseFile.index].options.findIndex(o => o.ok));
  const r = G.endCase(s)!; assert.ok(r.perfect); assert.ok(s.job.attention < 30); assert.ok(r.pay >= 30);
  const b = G.newGame(); b.minutes = 1440 + 9 * 60; G.startCase(b); G.answerCase(b, b.caseFile!.c.questions[0].options.findIndex(o => !o.ok)); assert.ok(b.job.attention > 10);
});
// ---- boss and world consequences ----
t('Patriarch defeat sets the world flag; the Ember takes 50 off the debt once', () => { const s = G.newGame(); G.defeatPatriarch(s); assert.ok(s.flags.millCleared); assert.equal(s.inventory.ember, 1); assert.ok(G.giveEmber(s)); assert.equal(s.debt, 250); assert.equal(G.giveEmber(s), false); });

import { Feed, EVENTS } from '../src/sim/feed';
import { greet, remember } from '../src/sim/dialogue';
t('feed: real state picks the line, cooldowns stop repeats', () => {
  const s = G.newGame(); const f = new Feed(); const c = { holstered: true, place: 'town' as const, nearNpc: null, inBoss: false };
  s.needs.hydration = 200; const a = f.tick(s, c)!; assert.match(a.text, /dry|dehydrat/i);
  G.advanceMinutes(s, 10, 'rest'); s.needs.hydration = 200; const b = f.tick(s, c); assert.ok(!b || !/dehydrat/i.test(b.text));
  const g = f.tick(s, { ...c, holstered: false, nearNpc: 'sera' }); G.advanceMinutes(s, 10, 'rest'); const g2 = f.tick(s, { ...c, holstered: false, nearNpc: 'sera' });
  assert.ok([g, g2].some(x => x && /revolver/.test(x.text)));
});
t('dialogue: NPCs react to a drawn gun, wounds and the mill, and remember', () => {
  const s = G.newGame(); const c = { s, npc: 'sera', faction: 'town' as const, holstered: false, place: 'town' as const };
  const first = greet(c, ['x']); assert.equal(first.reason, 'firstMeet'); remember(c, first.reason, first.text);
  s.minutes += 1440; assert.equal(greet(c, ['x']).reason, 'gunOut');
  c.holstered = true; s.wounds.push({ severity: 15, label: 'Deep cut' }); assert.equal(greet(c, ['x']).reason, 'bleeding');
  s.wounds = []; G.defeatPatriarch(s); const m = greet(c, ['x']); assert.equal(m.reason, 'millCleared_new'); remember(c, m.reason, m.text);
  assert.notEqual(greet(c, ['x']).reason, 'millCleared_new');
});
// ---- pass 4: progression ----
import * as T from '../src/sim/town';
import * as S from '../src/sim/story';
import { levelOf, xpFor } from '../src/sim/skills';
import { dayInfo } from '../src/sim/days';
t('skills grow by doing and change the numbers', () => {
  const s = G.newGame(); assert.equal(G.level(s, 'marksman'), 0); const d0 = G.revolverDamage(s), a0 = G.aimMult(s);
  for (let i = 0; i < 40; i++) G.shotHit(s);
  assert.ok(G.level(s, 'marksman') >= 2); assert.ok(G.revolverDamage(s) > d0); assert.ok(G.aimMult(s) < a0);
  assert.equal(levelOf(xpFor(10) + 999), 10);
  const c0 = G.manaCost(s, 'firebolt'); s.skills.spellcraft = xpFor(5); assert.ok(G.manaCost(s, 'firebolt') < c0);
});
t('traits: collapses can scar you, milestones harden you, the chapel can cure a trauma', () => {
  const s = G.newGame(); s.crowns = 200;
  for (let i = 0; i < 12; i++) { s.hp = 1; G.damage(s, 50, 'hound'); G.consumeRespawn(); }
  assert.ok(G.hasTrait(s, 'stare')); const bad = s.traits.filter(x => ['badKnee', 'jumpy', 'scarred', 'shakyHands'].includes(x)); assert.ok(bad.length >= 1, 'no trauma after 12 collapses');
  assert.ok(T.cureTrait(s, bad[0])); assert.equal(G.hasTrait(s, bad[0]), false);
  s.stats.kills = 29; G.onKill(s, 'hound', null); assert.ok(G.hasTrait(s, 'hardened')); assert.ok(G.damageTakenMult(s) < 1);
});
t('difficulty scales needs and damage', () => {
  const a = G.newGame(1, 'gentle'), b = G.newGame(1, 'harsh'); G.advanceMinutes(a, 240, 'active'); G.advanceMinutes(b, 240, 'active');
  assert.ok(a.needs.calories > b.needs.calories); assert.ok(G.damageTakenMult(a) < G.damageTakenMult(b));
});
t('loot is deterministic per kill; pelts sell, tags pay a Watch bounty', () => {
  const s = G.newGame(7); let pelts = 0;
  for (let i = 0; i < 20; i++) { s.stats.kills = i; const a = T.rollLoot(s, 'hound'), b = T.rollLoot(s, 'hound'); assert.deepEqual(a, b); if (a) { T.collectLoot(s, a); pelts++; } }
  assert.ok(pelts >= 5 && s.inventory.pelt === pelts); const c0 = s.crowns; assert.ok(T.sell(s, 'pelt', 2) > 0); assert.ok(s.crowns > c0);
  s.inventory.tags = 3; const w0 = s.factions.watch; assert.equal(T.claimBounty(s), 18); assert.ok(s.factions.watch > w0);
});
t('gear: smith upgrades change damage, reload, carry and armour; the coat needs pelts', () => {
  const s = G.newGame(); s.crowns = 500;
  assert.equal(T.canBuyGear(s, 'coat').ok, false); s.inventory.pelt = 3; assert.ok(T.buyGear(s, 'coat')); assert.equal(s.inventory.pelt, 0);
  const cap = G.carryCap(s); for (const g of ['rifled', 'loader', 'ironStaff', 'satchel', 'lantern'] as const) assert.ok(T.buyGear(s, g));
  assert.ok(G.revolverDamage(s) >= 38); assert.equal(G.reloadTime(s), B.RELOAD_TIME_LOADER); assert.equal(G.meleeDamage(s), B.MELEE_DAMAGE_IRON); assert.equal(G.carryCap(s), cap + 6);
});
t('revolver fouls with use, misfires when filthy, and cleaning restores it', () => {
  const s = G.newGame(); s.ammo.mag = 6; assert.equal(G.tryFire(s), 'ok'); assert.ok(s.revolverCond < 100);
  s.revolverCond = 10; let mis = 0; for (let i = 0; i < 60; i++) { s.ammo.mag = 6; s.rt += 0.37; if (G.tryFire(s) === 'misfire') mis++; } assert.ok(mis > 0 && mis < 30, 'misfires ' + mis);
  s.inventory.oil = 1; assert.ok(T.cleanRevolver(s, 'oil')); assert.equal(s.revolverCond, 100); s.ammo.mag = 0; assert.equal(G.tryFire(s), 'empty');
});
t('tavern and chapel services use real state', () => {
  const s = G.newGame(); s.crowns = 100; s.needs.calories = 800; s.needs.stress = 60;
  assert.ok(T.tavernMeal(s)); assert.ok(s.needs.calories > 1500); assert.ok(T.tavernAle(s)); assert.ok(s.needs.stress < 55);
  s.wounds.push({ severity: 20, label: 'Deep cut' }); assert.ok(T.chapelHeal(s)); assert.equal(s.wounds.length, 0);
  assert.ok(T.blessing(s)); const st = s.needs.stress; G.advanceMinutes(s, 120, 'active'); const blessed = s.needs.stress - st;
  const u = G.newGame(); u.needs.stress = st; G.advanceMinutes(u, 120, 'active'); assert.ok(blessed < u.needs.stress - st);
  const g = T.diceStart(s, 5)!; assert.ok(g && g.dice[0] >= 1 && g.dice[0] <= 6); const c = s.crowns; T.diceReroll(s, g, 0); T.diceStand(s, g); assert.ok(Math.abs(s.crowns - c) === 5);
});
t('home: reading and meditating', () => {
  const s = G.newGame(); s.inventory.book = 1; const x = s.skills.spellcraft + s.skills.ledger; assert.ok(T.readBook(s)); assert.ok(s.skills.spellcraft + s.skills.ledger > x);
  s.mana = 0; T.meditate(s); assert.ok(s.mana > 30); const h = G.hour(s); T.waitUntil(s, (h + 3) % 24); assert.equal(G.hour(s), (h + 3) % 24);
});
t('weather and day events are fixed per day and seed', () => {
  assert.deepEqual(dayInfo(5, 9), dayInfo(5, 9)); assert.equal(dayInfo(1, 9).weather, 'clear'); assert.equal(dayInfo(3, 1).event, 'market');
  const s = G.newGame(1); const p1 = G.priceOf(s, 'bread'); s.minutes = 3 * 1440 + 600; assert.ok(G.priceOf(s, 'bread') <= p1);
});
// ---- story ----
t('quests: the tutorial advances on real actions and conversations', () => {
  const s = G.newGame(); S.updateQuests(s); assert.equal(s.quests.mq0.stage, 0);
  G.eat(s, 'bread'); G.drink(s, 'cistern'); S.updateQuests(s); assert.equal(s.quests.mq0.stage, 1);
  G.wash(s); S.updateQuests(s); assert.equal(s.quests.mq0.stage, 2);
  const ch = S.talkChoices(s, 'tolan'); assert.equal(ch.length, 1); assert.match(S.chooseTalk(s, ch[0].key), /Sixty/); assert.equal(s.quests.mq0.stage, 3);
  s.contractsDone = 1; s.crowns = 100; G.payDebt(s, 60); S.updateQuests(s); assert.equal(s.quests.mq0.state, 'done'); assert.ok(s.quests.mq1, 'mq1 should start');
  assert.equal(S.tracked(s)!.id, 'mq1');
});
t('the Ember can go to the Tower, the Chapel or your own staff, once', () => {
  for (const fate of ['tower', 'chapel', 'kept'] as const) {
    const s = G.newGame(); G.defeatPatriarch(s); const d = s.debt; assert.ok(S.decideStone(s, 'ember', fate)); assert.equal(S.decideStone(s, 'ember', fate), false);
    if (fate === 'tower') assert.equal(s.debt, d - 50); if (fate === 'chapel') assert.ok(s.factions.chapel >= 15); if (fate === 'kept') assert.ok(G.hasTrait(s, 'wardTouched') && G.spellPower(s) > 1.1);
  }
});
t('main chain can be played through to an ending', () => {
  const s = G.newGame(); s.crowns = 500; S.updateQuests(s);
  G.eat(s, 'bread'); G.drink(s, 'cistern'); G.wash(s); S.updateQuests(s); S.chooseTalk(s, S.talkChoices(s, 'tolan')[0].key); s.contractsDone = 1; G.payDebt(s, 60); S.updateQuests(s);
  S.chooseTalk(s, S.talkChoices(s, 'petch').find(c => c.key.includes('mq1'))!.key); G.enterMill(s); G.touchMillCheckpoint(s); G.defeatPatriarch(s); S.updateQuests(s);
  assert.equal(s.quests.mq1.stage, 4); S.chooseTalk(s, S.talkChoices(s, 'maren').find(c => c.key.includes('mq1'))!.key); assert.equal(s.story.ember, 'chapel'); assert.equal(s.quests.mq1.state, 'done');
  S.chooseTalk(s, S.talkChoices(s, 'lira')[0].key); for (const k of ['mill_road', 'raider_camp', 'whisper_stones']) S.setFlag(s, 'attune:' + k); S.updateQuests(s);
  S.chooseTalk(s, S.talkChoices(s, 'lira')[0].key); assert.ok(s.story.sparkLearned); assert.equal(s.quests.mq2.state, 'done');
  for (const k of ['chapelEntered', 'valveA', 'valveB', 'chapelCheckpoint', 'chapelCleared']) S.setFlag(s, k); s.inventory.censer = 1; S.updateQuests(s);
  S.chooseTalk(s, S.talkChoices(s, 'maren').find(c => c.key.includes('mq3'))!.key); assert.equal(s.quests.mq3.state, 'done');
  S.chooseTalk(s, S.talkChoices(s, 'renn')[0].key); s.minutes = G.day(s) * 1440 + 21 * 60; S.chooseTalk(s, S.talkChoices(s, 'renn')[0].key); assert.ok(S.flag(s, 'gateStarted'));
  S.setFlag(s, 'gateHeld'); S.updateQuests(s); const d = s.debt; S.chooseTalk(s, S.talkChoices(s, 'aldric')[0].key);
  assert.ok(s.story.wardsDone); assert.equal(s.debt, Math.max(0, d - 100)); assert.equal(s.quests.mq4.state, 'done');
  const e = S.ending(s); assert.equal(e.title, 'Warden of Millbrook'); assert.ok(e.slides.length >= 4);
});
t('Red Ink: three clean files open the audit; solving it cuts the debt to the true balance', () => {
  const s = G.newGame(); s.ledgerCases = 1; S.chooseTalk(s, S.talkChoices(s, 'brannic')[0].key); s.counters.perfectCases = 3; S.updateQuests(s);
  S.chooseTalk(s, S.talkChoices(s, 'brannic')[0].key); assert.ok(S.flag(s, 'auditOpen'));
  s.minutes = 1440 * 2 + 9 * 60; G.startAudit(s); while (s.caseFile!.index < s.caseFile!.c.questions.length) G.answerCase(s, s.caseFile!.c.questions[s.caseFile!.index].options.findIndex(o => o.ok));
  assert.ok(G.endCase(s)!.perfect); assert.equal(s.inventory.auditfile, 1); S.updateQuests(s);
  const d = s.debt; S.chooseTalk(s, S.talkChoices(s, 'renn').find(c => c.key.includes('redink'))!.key); assert.equal(s.debt, d - 120); assert.ok(S.tolanGone(s)); assert.equal(s.quests.redink.state, 'done');
});
t('v0.3 saves load into v4 with skills, story and gear', () => {
  const s: any = G.newGame(); s.version = 3; for (const k of ['difficulty', 'skills', 'traits', 'gear', 'quests', 'story', 'counters', 'discovered', 'revolverCond']) delete s[k]; s.upgrades = { featherBed: true }; s.flags.emberGiven = true;
  const o = G.deserialize(JSON.stringify({ s, extra: {} }))!; assert.equal(o.s.version, 5); assert.equal(o.s.story.ember, 'tower'); assert.ok(o.s.upgrades.featherBed && o.s.upgrades.herbBox === false); assert.equal(G.level(o.s, 'vigor'), 0);
});
// ---------------- v0.7: the Eastern Reach ----------------
import * as R from '../src/sim/reach';
import * as S7 from '../src/sim/story';
import { generateLodgeBoard, EAST_SITES } from '../src/sim/contracts';
t('v0.6 (v4) saves load into v5 with the carbine, charm and Ashford standing', () => {
  const s: any = G.newGame(); s.version = 4; delete s.firearm; delete s.rifle; delete s.charm; delete s.factions.ashford; delete s.gear.carbine;
  const o = G.deserialize(JSON.stringify({ s, extra: {} }))!; assert.equal(o.s.version, 5); assert.equal(o.s.firearm, 'revolver'); assert.deepEqual(o.s.rifle, { mag: 0, reserve: 0 }); assert.equal(o.s.charm, ''); assert.equal(o.s.factions.ashford, 0); assert.equal(o.s.gear.carbine, false);
});
t('the Lodge posts east notices every morning, with a bounty every third day', () => {
  for (const d of [1, 2, 3, 4]) { const b = generateLodgeBoard(d, 7); assert.ok(b.length >= 4); assert.ok(b.every(c => c.board === 'lodge' && EAST_SITES.includes(c.site))); assert.equal(b.some(c => c.elite), d % 3 === 1); }
  const s = G.newGame(); assert.ok(s.board.some(c => c.board === 'lodge') && s.board.some(c => !c.board));
});
t('the carbine: bought from Corwin, its own tube and reload, harder hits, steadier aim', () => {
  const s = G.newGame(); s.crowns = 500; assert.ok(R.buyGear(s, 'carbine', 'gunsmith')); assert.equal(s.rifle.mag, 8);
  const rev = G.revolverDamage(s), aim = G.aimMult(s); assert.ok(R.switchFirearm(s)); assert.equal(G.firearm(s), 'carbine');
  assert.ok(G.revolverDamage(s) > rev && G.aimMult(s) < aim && G.reloadTime(s) === B.CARBINE_RELOAD);
  for (let i = 0; i < 8; i++) assert.equal(G.tryFire(s), 'ok'); assert.equal(G.tryFire(s), 'empty');
  assert.ok(G.reload(s)); assert.equal(s.rifle.mag, 8); assert.equal(s.ammo.mag, 6);
  assert.deepEqual(G.gunRounds(s).size, 8);
});
t('traders: standing lowers prices, wanted goods pay a quarter more, charms are worn one at a time', () => {
  const s = G.newGame(); s.crowns = 300; const p0 = R.shopPrice(s, 'curio', 'charmHare'); s.factions.ashford = 80; assert.ok(R.shopPrice(s, 'curio', 'charmHare') < p0);
  s.inventory.tusk = 2; assert.ok(R.sellPriceAt(s, 'curio', 'tusk') > R.sellPriceAt(s, 'fishmonger', 'tusk'));
  assert.ok(R.buyFrom(s, 'curio', 'charmHare') && R.buyFrom(s, 'curio', 'charmIron'));
  const m = G.moveMult(s); R.wearCharm(s, 'charmHare'); assert.ok(G.moveMult(s) > m); R.wearCharm(s, 'charmIron'); assert.equal(s.charm, 'charmIron'); assert.equal(G.moveMult(s), m);
});
t('the iron-nail charm softens the undead, not wolves', () => {
  const a = G.newGame(), b = G.newGame(); b.inventory.charmIron = 1; R.wearCharm(b, 'charmIron');
  G.damage(a, 20, 'hollow'); G.damage(b, 20, 'hollow'); assert.ok(b.hp > a.hp);
  const c = G.newGame(), d = G.newGame(); d.charm = 'charmIron'; G.damage(c, 10, 'wolf'); G.damage(d, 10, 'wolf'); assert.equal(c.hp, d.hp);
});
t('fishing: a strike on the bite lands a fish, a miss lands nothing; dawn brings them quicker', () => {
  const s = G.newGame(); const before = s.inventory.trout + s.inventory.eel + s.inventory.saltfish;
  R.landFish(s, 'river', true); assert.ok(s.inventory.trout + s.inventory.eel + s.inventory.saltfish > before);
  const n = s.inventory.trout + s.inventory.eel; R.landFish(s, 'pond', false); assert.equal(s.inventory.trout + s.inventory.eel, n);
  let dawn = 0, noon = 0; for (let i = 0; i < 40; i++) { s.minutes = 1440 * 3 + 6 * 60; dawn += R.fishTiming(s).wait; s.minutes = 1440 * 3 + 13 * 60; noon += R.fishTiming(s).wait; } assert.ok(dawn < noon);
});
t('mining needs a pick; the deep seams sometimes give ward-copper', () => {
  const s = G.newGame(); assert.equal(R.mine(s, false), ''); s.inventory.pickaxe = 1; R.mine(s, false); assert.ok(s.inventory.copper >= 1);
  let ward = 0; for (let i = 0; i < 40; i++) { R.mine(s, true); ward = s.inventory.wardcopper; } assert.ok(ward > 0);
});
t('new meals give their buffs: roast boar makes you stout', () => {
  const s = G.newGame(); s.inventory.boarmeat = 1; assert.ok(G.cookRecipe(s, 'roastboar')); const m = G.damageTakenMult(s); assert.ok(G.eatMeal(s, 'roastboar')); assert.ok(G.damageTakenMult(s) < m);
  s.inventory.apple = 2; assert.ok(G.isEdible('apple') && G.eatMeal(s, 'apple'));
});
t('Ashford services: the bath, a bed at the Lantern, the coach', () => {
  const s = G.newGame(); s.crowns = 50; s.needs.hygiene = 10; assert.ok(R.bathe(s)); assert.equal(s.needs.hygiene, 100); assert.ok(G.buffActive(s, 'steamed'));
  s.minutes = 1440 * 2 + 22 * 60; const d = G.day(s); assert.ok(R.innSleep(s) !== false); assert.equal(G.day(s), d + 1);
  const c = s.crowns; assert.ok(R.takeCoach(s, 'ashford')); assert.equal(s.crowns, c - B.COACH_COST);
});
t('the Eastern Reach arc plays through: dispatch, Tam, the Hollow, the Engine, the seam', () => {
  const s = G.newGame(); s.quests.mq1 = { stage: 9, state: 'done', startDay: 1, doneDay: 1 };
  S7.chooseTalk(s, 'offer:eq1'); assert.equal(s.inventory.dispatch, 1);
  s.discovered.push('place:ashford'); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'garrow')[0].key); assert.equal(s.quests.eq1.state, 'done'); assert.equal(s.quests.eq2.state, 'active');
  S7.chooseTalk(s, S7.talkChoices(s, 'ilse')[0].key); assert.equal(S7.talkChoices(s, 'tam').length, 1); s.inventory.eelpie = 1; S7.chooseTalk(s, S7.talkChoices(s, 'tam')[0].key); assert.equal(s.inventory.liftkey, 1);
  S7.setFlag(s, 'mineEntered'); s.inventory.journal = 1; S7.updateQuests(s); assert.equal(s.quests.eq3.state, 'active');
  assert.equal(S7.decideSeam(s, 3), false); S7.setFlag(s, 'engineDown'); s.inventory.wardcore = 1; S7.updateQuests(s);
  const debt = s.debt; assert.ok(S7.decideSeam(s, 3)); assert.equal(s.debt, debt - 80); assert.equal(S7.decideSeam(s, 1), false);
  S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'garrow')[0].key); assert.equal(s.quests.eq2.state, 'done');
  S7.chooseTalk(s, S7.talkChoices(s, 'sela')[0].key); assert.equal(s.quests.eq3.state, 'done'); assert.equal(s.inventory.charmSalt, 1);
});

// ---- v0.8: the Westmarch (docs/gdd/westmarch.md §8) ----
import * as W from '../src/sim/west';
import { generateWestBoard, MARCH_SITES } from '../src/sim/contracts';
const westStart = () => { const s = G.newGame(); s.quests.mq1 = { stage: 9, state: 'done', startDay: 1, doneDay: 1 }; return s; };
t('wq1: the West Gate needs Renn\'s key, opens once, and the notice post appears', () => {
  const s = westStart(); assert.ok(S7.talkChoices(s, 'petch').some(c => c.key === 'offer:wq1')); S7.chooseTalk(s, 'offer:wq1');
  assert.equal(W.openWestGate(s), false); assert.equal(s.board.some(c => c.board === 'west'), false);
  S7.chooseTalk(s, S7.talkChoices(s, 'renn').find(c => c.key.startsWith('stage:wq1'))!.key); assert.equal(s.inventory.westkey, 1);
  assert.ok(W.openWestGate(s)); assert.equal(W.openWestGate(s), false); assert.ok(s.board.some(c => c.board === 'west'));
  const o = G.deserialize(G.serialize(s, {}))!; assert.equal(o.s.story.flags.westGateOpen, 1);
  S7.updateQuests(s); assert.equal(s.quests.wq1.stage, 2); s.discovered.push('place:fernhollow'); S7.updateQuests(s);
  S7.chooseTalk(s, S7.talkChoices(s, 'hesk')[0].key); assert.equal(s.quests.wq1.state, 'done'); assert.equal(s.quests.wq2.state, 'active'); assert.ok(s.factions.fernhollow >= 8);
});
t('wq2: Vane\'s key: buy, persuade, threaten', () => {
  const buy = westStart(); buy.crowns = 10; assert.equal(W.vaneKey(buy, 1), false); buy.crowns = 100; assert.ok(W.vaneKey(buy, 1)); assert.equal(buy.crowns, 100 - B.VANE_KEY_PRICE); assert.equal(buy.inventory.barrowkey, 1); assert.equal(W.vaneKey(buy, 3), false);
  const talk = westStart(); talk.factions.tower = -10; assert.equal(W.vaneCanPersuade(talk), false); assert.equal(W.vaneKey(talk, 2), false); talk.story.flags.audit = 2; assert.ok(W.vaneKey(talk, 2));
  const lean = westStart(); const tw = lean.factions.tower; assert.ok(W.vaneKey(lean, 3)); assert.ok(lean.factions.tower < tw); assert.equal(lean.story.flags.vaneScared, 1);
});
t('wq2: Gammer Thrush\'s ward needs three heather; the barrow door needs key and ward', () => {
  const s = westStart(); s.inventory.heather = 2; assert.equal(W.thrushWard(s), false); assert.ok(W.barrowBlock(s).includes('key'));
  s.inventory.heather = 4; assert.ok(W.thrushWard(s)); assert.equal(s.inventory.heather, 1); assert.equal(s.inventory.rowanward, 1); assert.equal(s.inventory.charmRowan, 1);
  assert.ok(W.barrowBlock(s).includes('key')); s.inventory.barrowkey = 1; assert.equal(W.barrowBlock(s), ''); assert.ok(W.enterBarrow(s)); assert.equal(s.inventory.rowanward, 0); assert.equal(W.barrowBlock(s), '');
});
t('the Hall of Kings opens when all three braziers are lit', () => {
  const s = westStart(); assert.equal(W.lightHallBrazier(s, 1), false); assert.equal(W.lightHallBrazier(s, 1), false); assert.equal(W.lightHallBrazier(s, 3), false); assert.equal(W.hallLitCount(s), 2); assert.ok(W.lightHallBrazier(s, 2)); assert.equal(s.story.flags.hallLit, 1);
});
t('Orm\'s shroud follows the lit braziers', () => {
  assert.equal(W.ormShroud(4), 1); assert.ok(Math.abs(W.ormShroud(0) - 0.35) < 1e-9); assert.ok(W.ormShroud(2) > W.ormShroud(1)); assert.equal(W.ormShroud(9), 1);
});
t('decideCrown: return, sell or keep, once, and only after Orm falls', () => {
  const a = westStart(); assert.equal(S7.decideCrown(a, 1), false); a.story.flags.ormDown = 1; a.inventory.ormcrown = 1; const f = a.factions.fernhollow; assert.ok(S7.decideCrown(a, 1)); assert.ok(a.factions.fernhollow > f); assert.equal(a.inventory.ormcrown, 0); assert.equal(S7.decideCrown(a, 2), false);
  const b = westStart(); b.story.flags.ormDown = 1; b.inventory.ormcrown = 1; const c = b.crowns; assert.ok(S7.decideCrown(b, 2)); assert.equal(b.crowns, c + B.CROWN_SALE);
  const k = westStart(); k.story.flags.ormDown = 1; k.inventory.ormcrown = 1; assert.ok(S7.decideCrown(k, 3)); assert.equal(k.inventory.charmOrm, 1);
});
t('night spawns on the Downs follow the crown\'s fate', () => {
  const s = westStart(); assert.deepEqual(W.nightSpawns(s), { wights: 2, wisps: 3, drowned: 2 });
  s.story.flags.crownFate = 1; assert.deepEqual(W.nightSpawns(s), { wights: 0, wisps: 1, drowned: 0 }); s.story.flags.crownFate = 3; assert.equal(W.nightSpawns(s).wights, 1);
  assert.ok(W.isNightHour(22) && W.isNightHour(3) && !W.isNightHour(12));
});
t('grave-chill drains stamina and comfort unless grounded; heather tea grounds you', () => {
  const s = westStart(); s.stamina = 100; const c = s.needs.comfort; assert.ok(W.graveChill(s)); assert.equal(s.stamina, 100 - B.GRAVE_CHILL.stamina); assert.ok(s.needs.comfort < c);
  s.inventory.heather = 1; assert.ok(G.cookRecipe(s, 'heathertea')); assert.ok(G.eatMeal(s, 'heathertea')); assert.ok(G.buffActive(s, 'grounded')); const st = s.stamina; assert.equal(W.graveChill(s), false); assert.equal(s.stamina, st);
});
t('Westmarch meals: pike pie makes you stout, bilberry cake gives night eyes, bilberries are edible raw', () => {
  const s = westStart(); s.inventory.pike = 1; s.inventory.flour = 2; s.inventory.bilberries = 3; const m = G.damageTakenMult(s);
  assert.ok(G.cookRecipe(s, 'pikepie') && G.eatMeal(s, 'pikepie')); assert.ok(G.damageTakenMult(s) < m);
  assert.ok(G.cookRecipe(s, 'bilberrycake') && G.eatMeal(s, 'bilberrycake')); assert.ok(G.buffActive(s, 'nightEyes')); assert.ok(G.isEdible('bilberries') && G.eatMeal(s, 'bilberries'));
});
t('Westmarch charms: rowan softens the dead, the hag stone calms the night, the circlet bites at night', () => {
  const a = westStart(), b = westStart(); a.charm = 'charmRowan'; G.damage(a, 10, 'wight'); G.damage(b, 10, 'wight'); assert.ok(a.hp > b.hp);
  const h = westStart(), n = westStart(); for (const s of [h, n]) { s.minutes = 1440 * 2 + 21 * 60; s.needs.stress = 30; } h.charm = 'charmHag'; G.advanceMinutes(h, 60, 'exert'); G.advanceMinutes(n, 60, 'exert'); assert.ok(h.needs.stress < n.needs.stress);
  const o = westStart(); o.charm = 'charmOrm'; o.minutes = 1440 * 2 + 22 * 60; assert.equal(G.dealtMult(o), 1.2); o.minutes = 1440 * 2 + 12 * 60; assert.equal(G.dealtMult(o), 1);
});
t('lake fishing: perch, eels and the odd pike; Osric\'s spinners shorten the wait', () => {
  const s = westStart(); let pike = 0; for (let i = 0; i < 200; i++) { s.minutes = 1440 * 3 + 6 * 60 + i; R.landFish(s, 'lake', true); } pike = s.inventory.pike; assert.ok(s.inventory.perch > 0 && pike > 0 && s.inventory.perch > pike);
  let a = 0, b = 0; for (let i = 0; i < 40; i++) { a += R.fishTiming(s, 'lake').wait; } s.story.flags.osricSpinners = 1; for (let i = 0; i < 40; i++) { b += R.fishTiming(s, 'lake').wait; } assert.ok(b < a);
  R.landFish(s, 'marsh', true); assert.ok(s.inventory.eel + s.inventory.perch > 0);
});
t('Westmarch gathering, traders and the inn: heather, bilberries, Vane pays most for barrow gold, Liss\'s free bed', () => {
  const s = westStart(); R.gather(s, 'heather'); R.gather(s, 'bilberry'); assert.ok(s.inventory.heather >= 2 && s.inventory.bilberries >= 3);
  s.inventory.barrowgold = 2; assert.ok(R.sellPriceAt(s, 'antiquarian', 'barrowgold') > R.sellPriceAt(s, 'smokehouse', 'barrowgold')); const f = s.factions.fernhollow; R.sellAt(s, 'antiquarian', 'barrowgold', 1); assert.ok(s.factions.fernhollow < f);
  s.crowns = 0; assert.equal(R.innSleep(s, 'fernhollow'), false); s.story.flags.lissFriend = 1; assert.equal(R.innCost(s, 'fernhollow'), 0); s.minutes = 1440 * 4 + 22 * 60; assert.ok(R.innSleep(s, 'fernhollow') !== false);
  s.crowns = 100; assert.ok(R.buyGear(s, 'waders', 'boatwright')); assert.ok(s.gear.waders);
});
t('the notice post posts Westmarch work, with a bounty every third day', () => {
  for (const d of [1, 2, 3, 5]) { const b = generateWestBoard(d, 7); assert.ok(b.length >= 4); assert.ok(b.every(c => c.board === 'west' && MARCH_SITES.includes(c.site))); assert.equal(b.some(c => c.elite), d % 3 === 2); }
});
t('side tasks: Gorse, Old Grandmother and the drowned road', () => {
  const s = westStart(); s.discovered.push('place:smeath', 'place:fernhollow'); s.minutes += 1440;
  S7.chooseTalk(s, 'offer:wq3'); S7.setFlag(s, 'gorseFreed'); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'nettle')[0].key); assert.equal(s.quests.wq3.state, 'done'); assert.equal(s.inventory.charmHag, 1);
  S7.chooseTalk(s, 'offer:wq4'); s.inventory.pike = 1; S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'osric')[0].key); assert.equal(s.quests.wq4.state, 'done'); assert.equal(s.story.flags.osricSpinners, 1);
  S7.chooseTalk(s, 'offer:wq5'); s.inventory.reedring = 1; S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'liss')[0].key); assert.equal(s.quests.wq5.state, 'done'); assert.equal(R.innCost(s, 'fernhollow'), 0);
});
t('the Westmarch arc plays through to the crown', () => {
  const s = westStart(); s.crowns = 200; S7.chooseTalk(s, 'offer:wq1'); s.inventory.westkey = 1; W.openWestGate(s); s.discovered.push('place:fernhollow'); S7.updateQuests(s);
  S7.chooseTalk(s, S7.talkChoices(s, 'renn').find(c => c.key.startsWith('stage:wq1'))?.key ?? 'none:x'); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'hesk')[0].key);
  S7.chooseTalk(s, S7.talkChoices(s, 'cadoc')[0].key); const buy = S7.talkChoices(s, 'vane').find(c => c.label.startsWith('Buy'))!; S7.chooseTalk(s, buy.key); assert.equal(s.inventory.barrowkey, 1);
  assert.equal(S7.talkChoices(s, 'thrush').length, 0); s.inventory.heather = 3; S7.chooseTalk(s, S7.talkChoices(s, 'thrush')[0].key); assert.equal(s.quests.wq2.stage, 3);
  W.enterBarrow(s); W.lightHallBrazier(s, 1); W.lightHallBrazier(s, 2); W.lightHallBrazier(s, 3); S7.setFlag(s, 'ormDown'); s.inventory.ormcrown = 1; S7.updateQuests(s); assert.equal(s.quests.wq2.stage, 6);
  assert.ok(S7.decideCrown(s, 1)); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'hesk')[0].key); assert.equal(s.quests.wq2.state, 'done'); assert.equal(s.story.flags.westDone, 1);
});
t('v0.7 saves load into v0.8 with Fernhollow standing, waders and the new items', () => {
  const s: any = G.newGame(); delete s.factions.fernhollow; delete s.gear.waders; delete s.inventory.pike; delete s.inventory.charmRowan;
  const o = G.deserialize(JSON.stringify({ s, extra: {} }))!; assert.equal(o.s.factions.fernhollow, 0); assert.equal(o.s.gear.waders, false); assert.equal(o.s.inventory.pike, 0); assert.equal(o.s.inventory.charmRowan, 0);
});

// ---- v0.9: the Saltway Coast (docs/gdd/saltway.md §8) ----
import * as SO from '../src/sim/south';
import { generateCoastBoard, COAST_SITES } from '../src/sim/contracts';
import { PRIORITY, REACTIONS } from '../src/sim/dialogue';
B.FEATURES.coast = true;   // the coast's rules are tested ahead of its release
const coastStart = () => { const s = westStart(); s.crowns = 300; return s; };
const atHour = (s: G.GameState, h: number) => { s.minutes = Math.floor(s.minutes / 1440) * 1440 + 1440 + Math.round(h * 60); };
t('the tide: high at 02:00 and 14:00, low at 08:00 and 20:00, flats out about 06–10 and 18–22', () => {
  assert.ok(Math.abs(SO.tideLevel(2) - 1) < 1e-9 && Math.abs(SO.tideLevel(14) - 1) < 1e-9); assert.ok(Math.abs(SO.tideLevel(8) + 1) < 1e-9 && Math.abs(SO.tideLevel(20) + 1) < 1e-9);
  const s = coastStart();
  for (const [h, out] of [[5.5, false], [6.5, true], [8, true], [9.9, true], [10.5, false], [14, false], [18.5, true], [21.5, true], [22.5, false]] as [number, boolean][]) { atHour(s, h); assert.equal(SO.flatsExposed(s), out, `hour ${h}`); }
  atHour(s, 12); const m = SO.minutesToLowWater(s); assert.ok(m > 300 && m <= 365, String(m)); atHour(s, 8); assert.equal(SO.minutesToLowWater(s), 0); assert.ok(SO.minutesToFlood(s) > 90 && SO.minutesToFlood(s) <= 125);
});
t('wading: sea boots or waders wade at full speed, sea legs halve the slow', () => {
  const s = coastStart(); assert.equal(SO.wadeMult(s), B.WADE_MULT); G.applyBuff(s, 'seaLegs'); assert.ok(Math.abs(SO.wadeMult(s) - (1 + B.WADE_MULT) / 2) < 1e-9);
  s.gear.seaboots = true; assert.equal(SO.wadeMult(s), 1); const st = s.stamina; SO.tideCarry(s); assert.equal(s.stamina, Math.max(0, st - 10));
});
t('sq1: the Salt Gap needs Dorran\'s charge; the blast hurts up close and opens the gap for good', () => {
  const s = coastStart(); assert.equal(SO.setCharge(s), false); assert.equal(s.story.flags.saltGapOpen ?? 0, 0);
  S7.chooseTalk(s, 'offer:sq1'); assert.equal(s.quests.sq1.state, 'active'); const c0 = s.crowns;
  S7.chooseTalk(s, S7.talkChoices(s, 'dorran').find(c => c.key.startsWith('stage:sq1'))!.key); assert.equal(s.inventory.blastcharge, 1); assert.equal(s.crowns, c0 - B.CHARGE_PRICE);
  assert.equal(SO.buyCharge(s), false); S7.updateQuests(s); assert.equal(s.quests.sq1.stage, 1);
  assert.ok(SO.setCharge(s)); assert.equal(s.inventory.blastcharge, 0); assert.equal(SO.setCharge(s), false);
  assert.equal(SO.blastDamage(3), B.BLAST.dmgNear); assert.equal(SO.blastDamage(9), B.BLAST.dmgFar); assert.equal(SO.blastDamage(20), 0);
  assert.equal(SO.blowGap(s, 20), 0); assert.equal(s.story.flags.saltGapOpen, 1); assert.ok(s.board.some(c => c.board === 'coast')); assert.equal(SO.blowGap(s, 1), 0);
  S7.updateQuests(s); assert.equal(s.quests.sq1.stage, 2); s.discovered.push('place:gullhaven'); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'bree')[0].key);
  assert.equal(s.quests.sq1.state, 'done'); assert.equal(s.factions.gullhaven, 10); assert.equal(s.quests.sq2.state, 'active');
  const o = G.deserialize(G.serialize(s, {}))!; assert.equal(o.s.story.flags.saltGapOpen, 1);
});
t('the wreck, the tower and the desk: low water for the wreck, night for Marrow\'s ledger, the ledger\'s key for the cave', () => {
  const s = coastStart(); atHour(s, 13); assert.ok(SO.searchWreck(s).includes('under the sea')); assert.equal(s.inventory.wrenlog, 0); assert.ok(SO.takeBell(s).includes('under the sea'));
  atHour(s, 19); SO.searchWreck(s); assert.equal(s.inventory.wrenlog, 1); SO.takeBell(s); assert.ok(SO.carryingBell(s));
  SO.takeLantern(s); assert.equal(s.inventory.signallantern, 1);
  assert.ok(SO.caveBlock(s).length > 0); assert.equal(SO.enterCave(s), false);
  atHour(s, 11); assert.ok(SO.takeLedger(s).includes('at his desk')); assert.equal(s.inventory.customsledger, 0);
  atHour(s, 21); SO.takeLedger(s); assert.equal(s.inventory.customsledger, 1); assert.equal(SO.caveBlock(s), ''); assert.ok(SO.enterCave(s)); assert.equal(s.story.flags.caveEntered, 1);
});
t('the Wreck-Mother: her front is shell, her belly is open while she rears', () => {
  assert.equal(SO.motherArmour(0, false), 0.3); assert.equal(SO.motherArmour(0.9, false), 0.3); assert.equal(SO.motherArmour(-1.2, false), 1); assert.equal(SO.motherArmour(Math.PI, false), 1);
  assert.equal(SO.motherArmour(0, true), 1.8); assert.equal(SO.motherArmour(2, true), 1.8);
  const s = coastStart(); s.charm = 'charmShell'; const h = s.hp; G.damage(s, 10, 'crab'); assert.equal(h - s.hp, 8);
});
t('False Lights plays through; Marrow can be arrested, squeezed or let go', () => {
  for (const how of [1, 2, 3] as const) {
    const s = coastStart(); S7.chooseTalk(s, 'offer:sq1'); s.inventory.blastcharge = 1; SO.setCharge(s); SO.blowGap(s, 30); s.discovered.push('place:gullhaven'); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'bree')[0].key);
    S7.chooseTalk(s, S7.talkChoices(s, 'trewin').find(c => c.key.startsWith('stage:sq2'))!.key); assert.equal(s.quests.sq2.stage, 1);
    atHour(s, 8); SO.searchWreck(s); SO.takeLantern(s); atHour(s, 22); SO.takeLedger(s); SO.enterCave(s); S7.updateQuests(s); assert.equal(s.quests.sq2.stage, 5);
    assert.equal(SO.decideCollector(s, how), false); SO.motherDown(s); S7.updateQuests(s); assert.equal(s.quests.sq2.stage, 6);
    const f0 = { ...s.factions }, c0 = s.crowns;
    S7.chooseTalk(s, S7.talkChoices(s, 'marrow')[how - 1].key); assert.equal(s.story.flags.collectorFate, how); assert.equal(s.inventory.customsledger, 0);
    if (how === 1) { assert.equal(s.factions.watch, f0.watch + 10); assert.equal(s.factions.tower, f0.tower - 10); }
    if (how === 2) assert.equal(s.crowns, c0 + B.SQUEEZE);
    if (how === 3) assert.equal(s.factions.gullhaven, f0.gullhaven - 20);
    S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'bree')[0].key); assert.equal(s.quests.sq2.state, 'done'); assert.equal(s.story.flags.trewinCleared, 1);
  }
});
t('coast side tasks: mussels and samphire, the Merry Wren\'s bell, the keeper\'s oil', () => {
  const s = coastStart(); s.discovered.push('place:gullhaven', 'place:lighthouse'); s.minutes += 1440 * 2;
  S7.chooseTalk(s, 'offer:sq3'); assert.equal(S7.talkChoices(s, 'jowan').filter(c => c.key.startsWith('stage:sq3')).length, 0);
  R.gather(s, 'mussel'); R.gather(s, 'mussel'); R.gather(s, 'samphire'); R.gather(s, 'samphire'); assert.ok(s.inventory.mussels >= 6 && s.inventory.samphire >= 4);
  S7.chooseTalk(s, S7.talkChoices(s, 'jowan').find(c => c.key.startsWith('stage:sq3'))!.key); assert.equal(s.quests.sq3.state, 'done'); assert.ok(s.inventory.crabcakes >= 2);
  S7.chooseTalk(s, 'offer:sq4'); atHour(s, 7); SO.takeBell(s); S7.updateQuests(s); S7.chooseTalk(s, S7.talkChoices(s, 'elowen').find(c => c.key.startsWith('stage:sq4'))!.key);
  assert.equal(s.quests.sq4.state, 'done'); assert.equal(s.inventory.charmShell, 1); assert.equal(s.inventory.shipsbell, 0);
  S7.chooseTalk(s, 'offer:sq5'); s.inventory.oil = 2; S7.chooseTalk(s, S7.talkChoices(s, 'trewin').find(c => c.key.startsWith('stage:sq5'))!.key); assert.equal(s.quests.sq5.state, 'done'); assert.equal(s.gear.spyglass, true); assert.equal(s.inventory.oil, 0);
});
t('coast meals, sea fishing, the auction, the inn and the chapel', () => {
  const s = coastStart(); s.inventory.mussels = 3; s.inventory.crabmeat = 1; s.inventory.flour = 1; s.inventory.samphire = 2; s.inventory.mackerel = 1;
  for (const id of ['musselbroth', 'crabcakes', 'samphiresalad', 'grilledmackerel'] as const) { assert.ok(B.RECIPES.some(r => r.id === id)); assert.ok(G.isEdible(id)); }
  s.inventory.crabcakes = 1; assert.ok(G.eatMeal(s, 'crabcakes')); assert.ok(G.buffActive(s, 'seaLegs'));
  let sea = 0; for (let i = 0; i < 20; i++) { const before = s.inventory.mackerel + s.inventory.crabmeat + s.inventory.saltfish; R.landFish(s, 'sea', true); sea += s.inventory.mackerel + s.inventory.crabmeat + s.inventory.saltfish - before; } assert.ok(sea >= 20);
  s.inventory.mackerel = 2; assert.ok(R.sellPriceAt(s, 'fishauction', 'mackerel') > R.sellPriceAt(s, 'chandlery', 'mackerel'));
  s.crowns = 0; assert.equal(R.innSleep(s, 'gullhaven'), false); s.crowns = 50; atHour(s, 22); assert.ok(R.innSleep(s, 'gullhaven') !== false); assert.equal(s.crowns, 50 - B.GULL_INN_COST);
  s.needs.stress = 60; assert.ok(SO.blessing(s)); assert.equal(s.needs.stress, 60 - B.BLESSING_STRESS); assert.equal(SO.blessing(s), false);
  s.crowns = 100; assert.ok(R.buyGear(s, 'seaboots', 'shipwright')); assert.ok(s.gear.seaboots);
});
t('Gullhaven\'s notice post: coast work, a bounty every third day, only once the gap is open', () => {
  for (const d of [1, 2, 3, 4]) { const b = generateCoastBoard(d, 3); assert.ok(b.length >= 4); assert.ok(b.every(c => c.board === 'coast' && COAST_SITES.includes(c.site))); assert.equal(b.some(c => c.elite), d % 3 === 1); }
  const s = coastStart(); s.boardDay = 0; G.refreshBoard(s); assert.ok(!s.board.some(c => c.board === 'coast')); s.story.flags.saltGapOpen = 1; s.boardDay = 0; G.refreshBoard(s); assert.ok(s.board.some(c => c.board === 'coast'));
});
t('every conversation reaction is in the priority order (v0.7/v0.8 lines were silent)', () => {
  const missing = REACTIONS().filter(k => !(PRIORITY as string[]).includes(k)); assert.deepEqual(missing, []);
});
t('v0.8 saves load into v0.9 with Gullhaven standing, sea boots and the coast items', () => {
  const s: any = G.newGame(); delete s.factions.gullhaven; delete s.gear.seaboots; delete s.gear.spyglass; delete s.inventory.mussels; delete s.inventory.charmShell;
  const o = G.deserialize(JSON.stringify({ s, extra: {} }))!; assert.equal(o.s.factions.gullhaven, 0); assert.equal(o.s.gear.seaboots, false); assert.equal(o.s.gear.spyglass, false); assert.equal(o.s.inventory.mussels, 0); assert.equal(o.s.inventory.charmShell, 0);
});

// ───────────── v0.9.3: the coast in the live game ─────────────
t('v0.9.3: the coast is switched on; The Salt Gap is offered after the mill or from day 4', () => {
  assert.equal(B.FEATURES.coast, true);
  const s = G.newGame(); assert.ok(!S7.talkChoices(s, 'sera').some(c => c.key === 'offer:sq1'));
  s.minutes += 1440 * 3; S7.updateQuests(s); assert.ok(S7.talkChoices(s, 'sera').some(c => c.key === 'offer:sq1'));
});
t('v0.9.3: Dorran\'s counter and the quest line sell the same single charge (bought early, the stage is already done)', () => {
  const s = coastStart(); assert.ok(SO.canBuyCharge(s)); assert.ok(SO.buyCharge(s)); assert.equal(s.inventory.blastcharge, 1);
  assert.equal(SO.canBuyCharge(s), false); assert.equal(SO.buyCharge(s), false); assert.equal(s.inventory.blastcharge, 1);
  S7.chooseTalk(s, 'offer:sq1'); S7.updateQuests(s); assert.equal(s.quests.sq1.stage, 1);
  assert.ok(!S7.talkChoices(s, 'dorran').some(c => /blasting charge/i.test(c.label)), 'no second purchase line once a charge is held');
  SO.setCharge(s); assert.equal(SO.canBuyCharge(s), false); SO.blowGap(s, 30); assert.equal(SO.canBuyCharge(s), false);
  const poor = coastStart(); poor.crowns = 10; assert.equal(SO.buyCharge(poor), false); assert.equal(poor.crowns, 10); assert.equal(poor.inventory.blastcharge, 0);
});
t('v0.9.3: the tide warning comes in the last half hour of low water, once per low water', () => {
  const s = coastStart(), base = Math.floor(s.minutes / 1440) * 1440 + 1440, at = (h: number) => { s.minutes = base + Math.round(h * 60); };
  at(9); assert.equal(SO.floodWarning(s), false); const id = SO.lowWaterId(s);
  at(9.6); assert.equal(SO.floodWarning(s), true); assert.equal(SO.lowWaterId(s), id);
  at(6.2); assert.equal(SO.lowWaterId(s), id);
  at(10.5); assert.equal(SO.floodWarning(s), false);
  at(21.7); assert.equal(SO.floodWarning(s), true); assert.notEqual(SO.lowWaterId(s), id);
  at(13); assert.equal(SO.wadingOnFlats(s), true); at(8); assert.equal(SO.wadingOnFlats(s), false);
  assert.equal(SO.lowdyOnFlats(s), true); at(13); assert.equal(SO.lowdyOnFlats(s), false);
});
t('v0.9.3: the Merry Wren\'s bell is carried like a strongbox: no map walking until it is hung', () => {
  const s = coastStart(); assert.equal(SO.heavyLoad(s), ''); atHour(s, 8); SO.takeBell(s); assert.ok(SO.heavyLoad(s).includes('bell'));
  s.inventory.shipsbell = 0; assert.equal(SO.heavyLoad(s), '');
});
t('v0.9.3: coast kills leave loot: crab meat from crabs, coin from smugglers and pistoleers, fixed by the seed', () => {
  const s = coastStart(); let meat = 0, coin = 0;
  for (let i = 0; i < 40; i++) { s.stats.kills = i; const l = T.rollLoot(s, 'crab'); if (l?.item === 'crabmeat') meat++; const m = T.rollLoot(s, i % 2 ? 'smuggler' : 'pistoleer'); if (m?.crowns) coin++; }
  assert.ok(meat > 15 && meat < 40, String(meat)); assert.ok(coin > 15, String(coin));
  s.stats.kills = 7; assert.deepEqual(T.rollLoot(s, 'crab'), T.rollLoot(s, 'crab'));
});

t('v0.9.4 ledges: a step up to 0.6 m is climbable, a taller box is a wall', () => {
  const crate = { minX: 0, maxX: 2, minZ: 0, maxZ: 2, h: 0.6 }, wall = { minX: 0, maxX: 2, minZ: 0, maxZ: 2, h: 3 };
  assert.ok(climbable(crate, 0)); assert.ok(!climbable(wall, 0)); assert.ok(!climbable(wall, 2.5));
  assert.equal(walkTop([crate], 1, 1, 0.6), 0.6); assert.equal(walkTop([crate], 1, 1, 0.1), 0);
});
t('v0.9.4 walkTop picks the highest walkable top under a point and ignores walls', () => {
  const low = { minX: 0, maxX: 4, minZ: 0, maxZ: 4, h: 0.5 }, high = { minX: 1, maxX: 2, minZ: 1, maxZ: 2, h: 1.0 }, wall = { minX: 0, maxX: 4, minZ: 0, maxZ: 4, h: 3 };
  assert.equal(walkTop([low, high, wall], 1.5, 1.5, 2), 1.0); assert.equal(walkTop([low, high, wall], 3.5, 3.5, 2), 0.5);
  assert.equal(walkTop([wall], 1, 1, 9), 0); assert.equal(WALK_TOP_MAX, 1.2); assert.equal(STEP_UP, 0.6);
});

t('v0.9.4 mantle: a walkable top 0.8 m away within reach is a mantle target; a wall is not', () => {
  const ledge = { minX: 0.5, maxX: 3, minZ: -1, maxZ: 1, h: 1.1 }, wall = { minX: -5, maxX: -3, minZ: -5, maxZ: 5, h: 3 };
  assert.equal(mantleTop([ledge], 0.1, 0, 0), 1.1); assert.equal(mantleTop([wall], 0.1, 0, 0), 0);
  assert.equal(mantleTop([ledge], -2, 0, 0), 0); assert.equal(mantleTop([{ ...ledge, h: 1.5 }], 0.1, 0, 0), 0);
});

console.log(`\n${passed} passed`);
