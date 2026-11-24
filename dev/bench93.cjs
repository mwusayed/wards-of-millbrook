// v0.9.3: bench8 plus the Saltway Coast (eight headings at each coast place, Gullhaven by night) and the Sea Cave
// (the store, and the grotto with the Wreck-Mother up and the floor flooded).
// Budget check (docs/TDD.md §9): CPU per frame and draw calls at the main places, 8 headings each, plus the
// shader program count before and after visiting everything. Writes JSON to stdout (and to argv[3] if given).
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(process.argv[2] || 'http://127.0.0.1:5198/');
  await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
  await p.evaluate(() => window.__game.start()); await p.waitForTimeout(1200);
  const programs0 = await p.evaluate(() => window.__game.renderer.info.programs.length);
  const spots = JSON.parse(process.env.SPOTS || 'null') || [
    ['millbrook', 0, 8], ['vale', -30, 60], ['brookfield', 100, 8], ['thornwood', 160, -50], ['toll', 186, 12],
    ['ashford', 262, 16], ['docks', 220, 30], ['hollow', 300, -60],
    ['heath', -120, 8], ['smeath', -101, -6], ['downs', -184, -52], ['fernhollow', -262, 16], ['marsh', -280, 96],
    ['saltgap', 2, 150], ['shrine_s', 20, 206], ['gulltower', 64, 236], ['gullhaven', 76, 340], ['quay', 92, 362], ['lighthouse', 146, 382], ['flats', -12, 360], ['wreck', -16, 390], ['cove', -96, 366],
  ];
  const out = { spots: {}, dungeons: {} };
  const measure = async (name, x, z, target) => {
    const calls = [];
    for (let k = 0; k < 8; k++) {
      await p.evaluate(([x, z, yaw]) => { const G = window.__game; G.teleport(x, z, yaw); G.view('third'); }, [x, z, k * Math.PI / 4]);
      await p.waitForTimeout(140);
      calls.push(await p.evaluate(() => window.__game.renderer.info.render.calls));
    }
    const cpu = await p.evaluate(([x, z]) => { const G = window.__game; G.teleport(x, z, 0); G.bench(40); return G.bench(200); }, [x, z]);
    target[name] = { ...cpu, callsMax: Math.max(...calls), callsMin: Math.min(...calls) };
  };
  await p.evaluate(() => { const G = window.__game; G.s.story.flags.saltGapOpen = 1; G.syncCoastProps(); });
  for (const [name, x, z] of spots) await measure(name, x, z, out.spots);
  // Gullhaven and the flats by night: lamps, the lighthouse beam
  await p.evaluate(() => { const s = window.__game.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 22 * 60; });
  for (const [name, x, z] of [['gullhaven_night', 76, 340], ['lighthouse_night', 146, 382], ['flats_night', -12, 360]]) await measure(name, x, z, out.spots);
  await p.evaluate(() => { const s = window.__game.s; s.minutes = Math.floor(s.minutes / 1440) * 1440 + 12 * 60; });
  // the mine (entered the normal way), then back out
  await p.evaluate(() => { const G = window.__game; G.goMine(true); });
  await p.waitForTimeout(400);
  const mp = await p.evaluate(() => { const v = window.__game.player.pos; return [v.x, v.z]; });
  await measure('mine', mp[0], mp[1], out.dungeons);
  await p.evaluate(() => window.__game.goMine(false)); await p.waitForTimeout(1500);
  // the Barrow of King Orm (the hall, with its braziers lit)
  await p.evaluate(() => { const G = window.__game; G.s.story.flags.westGateOpen = 1; G.s.story.flags.barrowEntered = 1; G.syncBarrow(); G.world.setDungeon('barrow'); });
  await measure('barrow', -180, -340, out.dungeons);
  await p.evaluate(() => { const G = window.__game; G.world.setDungeon(null); });
  // the Sea Cave: the store, then the grotto with the Wreck-Mother awake and the floor flooded
  await p.evaluate(() => { const G = window.__game; G.s.story.flags.ledgerFound = 1; G.s.inventory.customsledger = 1; G.teleport(-112, 378); G.goSeaCave(true); });
  await p.waitForFunction(() => window.__game.world.dungeon === 'seacave', null, { timeout: 60000 }); await p.waitForTimeout(500);
  await p.evaluate(() => { const G = window.__game, O = G.world.seacave.origin; G.teleport(O.x, O.z - 24); G.step(0.3); for (const e of [...G.enemies.list]) if (e.tag === 'seacave') G.enemies.remove(e); });
  { const o = await p.evaluate(() => { const O = window.__game.world.seacave.origin; return [O.x, O.z - 26]; }); await measure('seacave_store', o[0], o[1], out.dungeons); }
  await p.evaluate(() => { const G = window.__game, C = G.world.seacave; G.teleport(C.grotto.x, C.grotto.z + 14); G.step(3); const M = G.mother; M.e.hp = 660; G.enemies.damage(M.e, 60, 0, undefined, 'fire'); G.step(6.5); M.cd = 1e9; M.chargeT = 1e9; G.s.wounds.length = 0; G.s.hp = G.GS.maxHp(G.s); });   // she stays up but holds her attacks, so the player is not carried home mid-measure
  { const o = await p.evaluate(() => { const C = window.__game.world.seacave; return [C.grotto.x, C.grotto.z + 12]; }); await measure('seacave_grotto', o[0], o[1], out.dungeons); }
  await p.evaluate(() => window.__game.goSeaCave(false)); await p.waitForFunction(() => window.__game.world.dungeon === null, null, { timeout: 60000 });
  // first person once, so its materials are counted too
  await p.evaluate(() => window.__game.view('first')); await p.waitForTimeout(300);
  out.programsAtLoad = programs0;
  out.programsAfter = await p.evaluate(() => window.__game.renderer.info.programs.length);
  out.pageErrors = errors;
  const txt = JSON.stringify(out, null, 1); console.log(txt); if (process.argv[3]) fs.writeFileSync(process.argv[3], txt);
  await b.close();
})();
