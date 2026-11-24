// v0.9.1: a portrait of every NPC at each seated or counter stop, from the front, so poses can be reviewed.
const { chromium } = require('playwright');
const url = process.argv[2] || 'http://127.0.0.1:5198/', out = process.argv[3] || 'shots9/seats', only = process.argv[4];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 560, height: 420 } });
  await p.goto(url); await p.waitForFunction(() => window.__game, null, { timeout: 240000 });
  await p.evaluate(() => window.__game.start()); await p.waitForTimeout(1500);
  await p.addStyleTag({ content: '.hud,#feed,#log,#prompt,#mode,#warn,#buffs{display:none!important}' }); await p.evaluate(() => { window.__game.vm.root.visible = false; });
  const list = await p.evaluate(only => window.__game.folk.flatMap(t => t.def.stops.map((s, i) => ({ id: t.def.id, i, clip: s.clip, x: s.x, z: s.z, h: (s.from + s.to) / 2 % 24 })))
    .filter(s => ['sit', 'write', 'drinkMug', 'mendNet', 'stir'].includes(s.clip) && (!only || only.split(',').includes(s.id))), only);
  const fs = require('fs'); fs.mkdirSync(out, { recursive: true });
  for (const st of list) {
    await p.evaluate(st => { const G = window.__game; G.s.minutes = 1440 + Math.round(st.h * 60); const t = G.folk.find(f => f.def.id === st.id);
      t.present = true; t.pos.set(st.x, 0, st.z); t.curStop = t.def.stops[st.i]; t.viaQ = []; const s = t.def.stops[st.i]; const f = s.face ?? 0; t.yaw = f;
      G.teleport(st.x - Math.sin(f) * 1.4, st.z - Math.cos(f) * 1.4, f + Math.PI); G.view('third'); G.player.pitch = -0.25;
      window.__camHook = (cam, pl) => { pl.model.root.visible = false; t.pos.set(st.x, 0, st.z); t.viaQ = []; }; }, st);
    await p.waitForTimeout(2200);
    await p.screenshot({ path: `${out}/${st.id}-${st.i}-${st.clip}.png`, timeout: 90000 });
  }
  console.log(list.length, 'portraits'); await b.close();
})();
