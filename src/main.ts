import * as THREE from 'three';
import * as G from './sim/state';
import * as B from './sim/balance';
import { SITES, ENEMY_NAMES, FACTIONS, issuerFaction, type SiteId, type EnemyKind, type FactionId } from './sim/contracts';
import { ACCOUNTS, ACCOUNT_ORDER, type Account } from './sim/ledger';
import { World, collide, rayBoxes, type Interactable, type InteractId } from './render/world';
import { Humanoid, clip, layered, makeRevolver, makeStaff, makeCarbine, makeTool, pistolPose, riflePose, gaitPose, airPose, type ClipName } from './render/rig';
import { EnemyManager, type Enemy } from './render/enemies';
import { NPCS, Townsfolk, alignStops } from './render/npcs';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Viewmodel, type FPAction } from './render/viewmodel';
import { Sfx } from './render/audio';
import { Hud, SPELL_COST, escapeHtml, type Slot } from './ui/hud';
import { PerfMonitor } from './render/perf';
import { loadSettings, saveSettings, DEFAULTS, DEFAULT_BINDINGS, ACTIONS, keyName, type Settings, type Action } from './render/settings';
import { Patriarch } from './render/boss';
import { Feed, EVENTS, type FeedCtx } from './sim/feed';
import { greet, remember, consequence } from './sim/dialogue';
import * as T from './sim/town';
import * as S from './sim/story';
import * as P from './ui/panels';
import { WeatherFx } from './render/weather';
import { Wraith } from './render/wraith';
import { Music, type Mood } from './render/music';
import { setChapelGate } from './render/chapel';
import { isWet, weatherSpellMult, WEATHER_TEXT, EVENT_TEXT } from './sim/days';
import { pickDoorEvent, DOOR_EVENTS } from './sim/events';
import { openMap as showMap, type MapMark } from './ui/map';
import * as R from './sim/reach';
import * as RU from './ui/reach_ui';
import { WardenEngine } from './render/mine';
import * as W from './sim/west';
import * as coast from './sim/south';
import { inFlats, inDeepFlats, FLATS } from './render/south';
import { WreckMother } from './render/seacave';
import { BarrowKing } from './render/barrow';

// ---------------- setup ----------------
const canvas = document.createElement('canvas'); canvas.id = 'game'; document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let cfg: Settings = loadSettings();
renderer.shadowMap.enabled = cfg.shadows !== 'off'; renderer.shadowMap.type = THREE.PCFShadowMap;
// Shadows are drawn once per frame only when something could have changed; the shadow map is not re-rendered for static scenes twice.
renderer.shadowMap.autoUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 400);
const world = new World();
world.scene.add(camera);
const sfx = new Sfx();
const hud = new Hud();
const vm = new Viewmodel(camera);
const perf = new PerfMonitor();
const feed = new Feed();
/** Apply graphics settings without reloading. Only a shadows on/off change recompiles shaders, and we do it once, here. */
let music: Music | null = null;
function applySettings(first = false) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5) * cfg.resScale);
  const wantShadows = cfg.shadows !== 'off';
  if (renderer.shadowMap.enabled !== wantShadows) { renderer.shadowMap.enabled = wantShadows; world.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach(x => (x.needsUpdate = true)); }); }
  const size = cfg.shadows === 'high' ? 2048 : 1024;
  if (world.sun.shadow.mapSize.x !== size) { world.sun.shadow.mapSize.set(size, size); world.sun.shadow.map?.dispose(); (world.sun.shadow as any).map = null; }
  world.sun.castShadow = wantShadows;
  camera.fov = cfg.fov; camera.far = cfg.viewDist; camera.updateProjectionMatrix();
  world.fogFar = Math.min(150, cfg.viewDist * 0.6) * (cfg.effects === 'low' ? 0.8 : 1);
  world.setDetail(cfg.effects === 'high');
  sfx.setVolume(cfg.volume, cfg.sfxVolume); hud.setScale(cfg.hudScale); music?.setVolume(cfg.musicVolume);
  hud.hint = `${keyName(cfg.bindings.view)} view · ${keyName(cfg.bindings.journal)} journal · ${keyName(cfg.bindings.map)} map · ${keyName(cfg.bindings.inventory)} pack · Esc menu`;
  hud.slotKeys([cfg.bindings.slot1, cfg.bindings.slot2, cfg.bindings.slot3, cfg.bindings.slot4, cfg.bindings.slot5, cfg.bindings.slot6].map(keyName));
  if (cfg.showPerf !== perfShown) { perf.toggle(); perfShown = cfg.showPerf; }
  resize();
  if (!first) renderer.compile(world.scene, camera);
}
let perfShown = false;

let s: G.GameState = G.newGame();

// ---------------- player ----------------
const player = {
  pos: world.homeSpawn.clone(), vy: 0, yaw: Math.PI / 2, pitch: 0, onGround: true,
  view: 'first' as 'first' | 'third', slot: 'carbine' as Slot,
  model: new Humanoid({ skin: 0xd9a77a, shirt: 0x6f7f5a, pants: 0x4a3b2c, coat: 0x3d4f63, hair: 0x2b1d14, boots: 0x2a2018 }),
  action: null as null | { clip: ClipName; t: number; dur: number; seat?: THREE.Vector3; facing?: number; upper?: boolean },
  shield: 0, shieldUntil: 0, lastCombat: -99, fireCd: 0, castCd: 0, meleeCd: 0, reloading: 0, hitT: 0,
  stepT: 0, moving: false, sprinting: false, speed: 0, modelYaw: Math.PI / 2,
  camDist: 3.4, viewBlend: 0, // smoothed third-person distance; 0 = first person, 1 = third
  dodgeT: 0, dodgeCd: 0, dodgeX: 0, dodgeZ: 0, lantern: false, indoors: false, wading: false,
  // v0.7 feel: input direction, previous speed and yaw (for lean), footstep phase, camera springs
  inX: 0, inZ: 0, prevSpeed: 0, prevYaw: Math.PI / 2, stepIdx: 0, airT: 0, trauma: 0, dipY: 0, dipV: 0, fovNow: 72,
  zone: 'town' as 'home' | 'town' | 'vale' | 'mill' | 'office' | 'ashford' | 'reach' | 'march' | 'fernhollow' | 'coast' | 'gullhaven',
};
const carbineTP = makeRevolver(); carbineTP.rotation.set(-Math.PI / 2, Math.PI, Math.PI); // barrel forward, grip down, in the two-hand pose
// holstered copies: revolver on the right hip, staff across the back
const holsterGun = makeRevolver(); holsterGun.rotation.set(Math.PI, 0, 0); holsterGun.position.set(0.22, -0.02, 0.02);
const backStaff = makeStaff(); backStaff.rotation.set(0, 0, 0.6); backStaff.position.set(0.0, -0.25, 0.14);
const staffTP = makeStaff();
player.model.handRSlot.add(carbineTP, staffTP);
player.model.j.hips.add(holsterGun); player.model.j.chest.add(backStaff);
// v0.7: the lever carbine, in the hands or slung across the back
// v0.9: one group per long gun (carbine, scattergun, long rifle) in the hands and slung on the back
const LONGS = ['carbine', 'scattergun', 'longrifle'] as const;
const longPair = () => { const g = new THREE.Group(); for (const k of LONGS) { const m = makeCarbine(k); m.name = k; m.visible = k === 'carbine'; g.add(m); } return g; };
const showLong = (g: THREE.Group, k: string) => { for (const c of g.children) c.visible = c.name === k; };
const longTP = longPair(); longTP.rotation.set(-Math.PI / 2, Math.PI, Math.PI); longTP.position.set(0, -0.02, 0.06); longTP.scale.setScalar(0.92);
const backLong = longPair(); backLong.rotation.set(0.15, Math.PI, 0.8); backLong.position.set(-0.02, -0.02, 0.18); backLong.scale.setScalar(0.9);
player.model.handRSlot.add(longTP); player.model.j.chest.add(backLong);
const rodTP = makeTool('rod'); rodTP.rotation.set(0.2, 0, 0); rodTP.visible = false; const pickTP = makeTool('pick'); pickTP.rotation.set(Math.PI / 2, 0, 0); pickTP.visible = false; player.model.handRSlot.add(rodTP, pickTP);
world.scene.add(player.model.root);
const shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), new THREE.MeshBasicMaterial({ color: 0xc9a46a, transparent: true, opacity: 0.18, depthWrite: false }));
shieldMesh.scale.set(0.9, 1.15, 0.9); world.scene.add(shieldMesh);

// ---------------- enemies, npcs ----------------
let now = 0;
const enemies = new EnemyManager(world.scene, world.colliders, {
  hurtPlayer: (amt, src) => hurtPlayer(amt, src),
  killed: (e: Enemy) => { if (e.tag === 'patriarch' || e.tag === 'wraith' || e.tag === 'engine' || e.tag === 'mother' || e.tag === 'orm') return; G.onKill(s, e.kind, e.tag); feed.push(s, 'kill', EVENTS.kill(s, e.kind), 'combat', 2, 1); if (e.kind !== 'hound') sfx.death(); hud.hitmarker(); dropLoot(e); onEnemyDown(e); },
  sound: (n, pan) => { const f = (sfx as any)[n]; if (typeof f === 'function') f.call(sfx, pan); },
  playerShielded: () => player.shield > 0 && absorb(14),
});
Townsfolk.colliders = world.colliders;
// v0.9.1: seats under every seated stop that has none, and facing toward tables and counters (npcs.ts alignStops)
{
  const seatTaken = (x: number, z: number) => world.interactables.some(i => i.seat && Math.hypot(i.seat.x - x, i.seat.z - z) < 0.45)
    || world.colliders.some(b => b.h <= 0.6 && b.h >= 0.3 && x > b.minX - 0.05 && x < b.maxX + 0.05 && z > b.minZ - 0.05 && z < b.maxZ + 0.05);
  const seats = alignStops(NPCS, seatTaken), wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9, flatShading: true });
  const top = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), leg = new THREE.CylinderGeometry(0.025, 0.03, 1, 5);
  const parts: THREE.BufferGeometry[] = [];
  for (const st of seats) {
    parts.push(top.clone().translate(st.x, st.h - 0.025, st.z));
    for (let i = 0; i < 3; i++) { const a = st.face + i * 2.094; parts.push(leg.clone().scale(1, st.h - 0.05, 1).translate(st.x + Math.sin(a) * 0.13, (st.h - 0.05) / 2, st.z + Math.cos(a) * 0.13)); }
  }
  if (parts.length) { const m = new THREE.Mesh(mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g), false)!, wood); m.castShadow = true; m.receiveShadow = true; world.scene.add(m); }
}
const folk = NPCS.map(d => { const t = new Townsfolk(d); world.scene.add(t.root); return t; });
const boss = new Patriarch(world.scene, enemies, world.colliders, world.mill.arena.clone().setZ(world.mill.origin.z - 33), world.millDarkness, {
  hurtPlayer: amt => hurtPlayer(amt, 'shade'),
  drainMana: amt => { s.mana = Math.max(0, s.mana - amt); },
  feed: text => { feed.push(s, 'boss:' + text.slice(0, 12), text, 'combat', 3, 3); },
  sound: (n, pan) => { const f = (sfx as any)[n]; if (typeof f === 'function') f.call(sfx, pan); },
  defeated: () => { G.defeatPatriarch(s); sfx.good(); hud.fade('The Shade Patriarch falls', 1400); save(); },
});
function spawnMill() {
  if (enemies.list.some(e => e.tag === 'mill')) return;
  const O = world.mill.origin;
  enemies.spawn('hound', O.clone().add(new THREE.Vector3(-12, 0, 12)), 'mill');
  enemies.spawn('hound', O.clone().add(new THREE.Vector3(0, 0, -4)), 'mill');
  if (!s.flags.millCleared) {
    enemies.spawn('shade', O.clone().add(new THREE.Vector3(4, 0, -14)), 'mill');
    enemies.spawn('hound', O.clone().add(new THREE.Vector3(-3, 0, -16)), 'mill');
  }
  for (const e of enemies.list) if (e.tag === 'mill') { e.wanderTarget.copy(e.pos); }
}
const wraith = new Wraith(world.scene, enemies, world.colliders, world.chapel.arena.clone(), {
  hurtPlayer: amt => hurtPlayer(amt, 'wraith'),
  feed: text => { feed.push(s, 'wraith:' + text.slice(0, 14), text, 'combat', 3, 2); },
  sound: (n, pan) => { const f = (sfx as any)[n]; if (typeof f === 'function') f.call(sfx, pan); },
  defeated: () => { G.defeatWraith(s); sfx.good(); hud.fade('The Cinder Wraith is at rest', 1500); save(); },
  dodging: () => player.dodgeT > 0.1,
  spawnImps: at => { for (const dx of [-6, 6]) enemies.spawn('imp', at.clone().add(new THREE.Vector3(dx, 0, 3)), 'wraith_call').state = 'chase'; },
});
function spawnChapel() {
  if (enemies.list.some(e => e.tag === 'chapel')) return;
  const O = world.chapel.origin, at = (x: number, z: number) => O.clone().add(new THREE.Vector3(x, 0, z));
  const place = (k: EnemyKind, x: number, z: number) => { const e = enemies.spawn(k, at(x, z), 'chapel'); e.pos.copy(at(x, z)); e.wanderTarget.copy(e.pos); return e; };
  place('drowned', -2.5, 7); place('drowned', 3, 1); place('imp', 11, 3);
  if (!S.flag(s, 'chapelCleared')) { place('drowned', -1, -5); place('imp', -11, 1); place('imp', 10, 0); place('drowned', -11, 4); }
}
const SITE_KIND: Partial<Record<SiteId, EnemyKind>> = { mill_road: 'hound', raider_camp: 'raider', whisper_stones: 'shade', thornwood: 'wolf', toll_tower: 'bandit', hollow_road: 'boar', heath_road: 'wolf', saltway: 'smuggler', gull_tower: 'pistoleer', tidal_flats: 'crab', wreckers_cove: 'smuggler' };
/** v0.9.3: the coast's sites hold mixed groups (saltway.md §3.3): pistoleers with the smugglers, crabs in packs. */
const SITE_GROUP: Partial<Record<SiteId, EnemyKind[]>> = { saltway: ['smuggler', 'smuggler'], gull_tower: ['pistoleer', 'smuggler'], tidal_flats: ['crab', 'crab', 'crab'], wreckers_cove: ['smuggler', 'pistoleer', 'smuggler'] };
let ambientDay = -1;
function spawnAmbient() {
  ambientDay = G.day(s);
  for (const site of Object.keys(world.sites) as SiteId[]) {
    const alive = enemies.list.filter(e => e.alive && e.tag === null && e.home.equals(world.sites[site])).length;
    const k = SITE_KIND[site]; if (!k) continue;
    if (site === 'toll_tower' && S.flag(s, 'tollCleared')) continue;               // the toll is broken for good
    if (site === 'heath_road' && !S.flag(s, 'westGateOpen')) continue;            // nothing comes over a shut gate
    const group = SITE_GROUP[site];
    if (group) { if (!S.flag(s, 'saltGapOpen')) continue; for (let i = alive; i < group.length; i++) enemies.spawn(group[i], world.sites[site], null); continue; }
    const n = k === 'wolf' ? (S.flag(s, 'reachWarded') ? 2 : 3) : 2;
    for (let i = alive; i < n; i++) enemies.spawn(k, world.sites[site], null);
  }
}
function syncContractEnemies() {
  const c = s.active;
  if (!c || c.kind !== 'sweep' || !c.enemy) return;
  const remaining = c.count - c.progress;
  const alive = enemies.list.filter(e => e.alive && e.tag === c.id).length;
  const site = world.sites[c.site];
  if (alive < remaining && player.pos.distanceTo(site) > 30) for (let i = alive; i < remaining; i++) enemies.spawn(c.enemy, site, c.id, !!c.elite);
}

// ---------------- input ----------------
const keys = new Set<string>();
let started = false, paused = true;
const mouse = new THREE.Vector2();
/** Which action a physical key is bound to (settings → controls). */
function actionOf(code: string): Action | null {
  for (const a of ACTIONS) if (cfg.bindings[a.id] === code) return a.id;
  if (code === 'KeyI' && !Object.values(cfg.bindings).includes('KeyI')) return 'inventory';
  if (code === 'ShiftRight' && cfg.bindings.sprint === 'ShiftLeft') return 'sprint';
  return null;
}
const down = (a: Action) => keys.has(cfg.bindings[a]) || (a === 'sprint' && cfg.bindings.sprint === 'ShiftLeft' && keys.has('ShiftRight'));
let rebinding: ((code: string) => void) | null = null;
addEventListener('keydown', e => {
  if (rebinding) { e.preventDefault(); e.stopPropagation(); const f = rebinding; rebinding = null; f(e.code); return; }
  if (!started) return;
  if (e.code === 'Tab') e.preventDefault();
  if (hud.modalOpen) { if (e.code === 'Escape') closeTopModal(); return; }
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'F3') { e.preventDefault(); cfg.showPerf = !cfg.showPerf; saveSettings(cfg); applySettings(); return; }
  if (e.code === 'Escape') { openMenu(); return; }
  switch (actionOf(e.code)) {
    case 'interact': interact(); break;
    case 'view': player.view = player.view === 'first' ? 'third' : 'first'; sfx.ui(); break;
    case 'reload': startReload(); break;
    case 'melee': melee(); break;
    case 'slot1': selectSlot('carbine'); break;
    case 'slot2': selectSlot('firebolt'); break;
    case 'slot3': selectSlot('frost'); break;
    case 'slot4': selectSlot('ward'); break;
    case 'slot5': selectSlot('heal'); break;
    case 'slot6': selectSlot('spark'); break;
    case 'quickEat': quickEat(); break;
    case 'holster': toggleHolster(); break;
    case 'inventory': openInventory(); break;
    case 'journal': openJournal(); break;
    case 'map': openMap(); break;
    case 'lantern': toggleLantern(); break;
    case 'dodge': dodge(); break;
  }
}, true);
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
canvas.addEventListener('mousedown', e => {
  if (!started || hud.modalOpen) return;
  sfx.start();
  if (document.pointerLockElement !== canvas) { lockPointer(); }
  if (e.button === 0) attack();
  if (e.button === 2) melee();
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
// Mouse look. Deltas are accumulated and applied once per frame, so the camera, the body and the
// shot direction all use the same yaw in a frame. Two browser problems are filtered here:
//  - some Chrome builds report one huge movementX right after pointer lock or when the cursor would
//    have hit the screen edge (the "snap-back"); a delta far larger than the recent ones is dropped;
//  - OS mouse acceleration: we ask for raw (unadjusted) movement where supported.
const look = { dx: 0, dy: 0, avg: 8, ignoreUntil: 0, lastX: 0, lastY: 0 };
addEventListener('mousemove', e => {
  if (!started || hud.modalOpen) return;
  const locked = document.pointerLockElement === canvas;
  if (!locked && !(e.buttons & 1)) return;
  if (performance.now() < look.ignoreUntil) return;
  const mx = e.movementX, my = e.movementY, mag = Math.hypot(mx, my);
  if (mag > 400 || (mag > 120 && mag > look.avg * 12)) return; // spike: not a real hand movement
  look.avg = look.avg * 0.9 + Math.max(4, mag) * 0.1;
  look.dx += mx; look.dy += my;
});
function lockPointer() {
  if (document.pointerLockElement === canvas) return;
  look.ignoreUntil = performance.now() + 120; // the first events after locking are unreliable
  const p: any = cfg.rawMouse ? (canvas as any).requestPointerLock?.({ unadjustedMovement: true }) : canvas.requestPointerLock?.();
  p?.catch?.(() => { (canvas.requestPointerLock as any)?.()?.catch?.(() => {}); });
}
function applyLook() {
  let dx = look.dx, dy = look.dy; look.dx = look.dy = 0;
  if (cfg.smoothing > 0) { dx = (dx + look.lastX) * 0.5; dy = (dy + look.lastY) * 0.5; look.lastX = dx; look.lastY = dy; }
  const sens = 0.0022 * cfg.sens;
  player.yaw -= dx * sens; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sens * (cfg.invertY ? -1 : 1)));
  mouse.set(dx, dy);
}
document.addEventListener('pointerlockchange', () => {
  look.dx = look.dy = 0; look.ignoreUntil = performance.now() + 120;
  if (started && document.pointerLockElement !== canvas && !hud.modalOpen && !s.gameover && !introOpen) openMenu();
});
addEventListener('resize', resize);
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
resize();

// ---------------- helpers ----------------
const _fwd = new THREE.Vector3();
const forward = (out = new THREE.Vector3()) => out.set(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
const busy = () => !!player.action;
function selectSlot(sl: Slot) { if (player.slot === sl && !holstered) return; player.slot = sl; holstered = false; vm.setWeapon(sl === 'carbine' ? 'carbine' : 'staff'); sfx.ui(); }
let holstered = false;
function toggleHolster() {
  if (busy()) return;
  holstered = !holstered; player.reloading = 0;
  vm.setWeapon(holstered ? 'none' : player.slot === 'carbine' ? 'carbine' : 'staff'); sfx.ui();
  G.log(s, holstered ? 'You holster your weapons. Townsfolk relax a little.' : player.slot === 'carbine' ? 'You draw the revolver.' : 'You take the staff from your back.', 'info');
}
function absorb(amount: number): boolean { if (player.shield <= 0) return false; player.shield = Math.max(0, player.shield - amount); return true; }
function hurtPlayer(amount: number, src: EnemyKind | string) {
  if (s.gameover || busyCollapse || player.dodgeT > 0.1) return;
  player.lastCombat = now;
  if (player.shield > 0) { const a = Math.min(player.shield, amount); player.shield -= a; amount -= a; sfx.hit(); if (amount <= 0) return; }
  amount = Math.round(amount * G.damageTakenMult(s));
  sfx.hurt(); hud.hurt(amount); player.hitT = 0.3;
  const k = Math.min(1.6, 0.4 + amount / 18);
  player.model.flinch((Math.random() - 0.5) * 0.8, 1, k); vm.hurt(k); player.trauma = Math.min(1, player.trauma + 0.25 + amount / 60);
  const collapsed = G.damage(s, amount, String(src));
  if ((src === 'wight' || src === 'wisp') && W.graveChill(s)) feed.push(s, 'chill', 'Grave-chill: the cold gets into your bones and your legs go heavy. (Heather tea keeps it out.)', 'combat', 2, 25);
  if (collapsed) onCollapse();
}
let busyCollapse = false;
let runLatched = false, runWasDown = false;
async function onCollapse() {
  busyCollapse = true; player.action = null; sfx.death();
  await hud.fade('You collapse…', 1600);
  respawnHome(); busyCollapse = false; save();
}
function respawnHome() {
  boss.reset();
  wraith.reset();
  if (gate.active) { gate.active = false; enemies.clearTag('gate'); S.setFlag(s, 'gateStarted', 0); G.rep(s, 'town', -2, false); G.log(s, 'They carried you back through the gate. The Watch held it without you, barely. Renn wants you again tomorrow night.', 'warn'); }
  if (world.inChapel && S.flag(s, 'chapelCheckpoint')) { player.pos.copy(world.chapel.checkpoint); player.vy = 0; player.yaw = 0; player.pitch = 0; player.shield = 0; G.log(s, 'You wake by the crypt waystone, soaked and aching.', 'warn'); return; }
  if (world.inMine && S.flag(s, 'mineCheckpoint')) { engine.reset(); player.pos.copy(world.mine.checkpoint).add(new THREE.Vector3(-1.2, 0, 0)); player.vy = 0; player.yaw = 0; player.pitch = 0; player.shield = 0; G.log(s, 'You wake by the deep waystone, its copper light on your face.', 'warn'); return; }
  if (world.dungeon === 'barrow') { barrowKing.reset(); world.barrowDark = false; for (const e of [...enemies.list]) if (e.tag === 'barrow' || e.tag === 'orm_call') enemies.remove(e); if (S.flag(s, 'hallLit')) { player.pos.copy(world.barrow.checkpoint); player.vy = 0; player.yaw = 0; player.pitch = 0; player.shield = 0; G.log(s, 'You wake on the cold floor of the Hall of Kings, by the burning braziers. Something carried you there, or let you crawl.', 'warn'); return; } world.setDungeon(null); }
  if (world.dungeon === 'seacave') { leaveSeaCave(); world.setDungeon(null); }
  if (world.inMill && s.flags.millCheckpoint) { player.pos.copy(world.mill.checkpoint); player.vy = 0; player.yaw = 0; player.pitch = 0; player.shield = 0; G.log(s, 'You wake by the mill waystone, aching.', 'warn'); return; }
  world.setMillMode(false);
  engine.reset();
  for (const e of [...enemies.list]) if (e.tag === 'mill' || e.tag === 'patriarch_call' || e.tag === 'chapel' || e.tag === 'wraith_call' || e.tag === 'mine' || e.tag === 'engine_call') enemies.remove(e);
  player.pos.copy(world.homeSpawn); player.vy = 0; player.yaw = Math.PI / 2; player.pitch = 0; player.shield = 0;
  for (const e of enemies.list) if (e.alive && e.state !== 'idle') { e.state = 'return'; }
}
function aimPoint(): THREE.Vector3 {
  const o = camera.getWorldPosition(new THREE.Vector3()), d = forward();
  const wall = rayBoxes(world.colliders, o, d, 80);
  const hit = enemies.raycast(o, d, 80);
  const dist = hit && hit.dist < wall ? hit.dist : Math.min(wall, o.y / Math.max(0.0001, -d.y) > 0 && d.y < 0 ? o.y / -d.y : 80, 80);
  return o.add(d.multiplyScalar(dist));
}
function handWorld(): THREE.Vector3 {
  if (player.view === 'first') return player.slot === 'carbine' ? vm.muzzle() : vm.staffTip();
  return (player.slot === 'carbine' ? carbineTP.getObjectByName('muzzle')! : staffTP.getObjectByName('tip')!).getWorldPosition(new THREE.Vector3());
}
function playTP(c: ClipName, dur: number, upper = true) { player.action = { clip: c, t: 0, dur, upper }; }

// ---------------- combat ----------------
const tracers: { line: THREE.Line; life: number }[] = [];
const puffs: { mesh: THREE.Mesh; life: number }[] = [];
const PUFF_GEO = new THREE.IcosahedronGeometry(0.25, 0);
function puff(at: THREE.Vector3, color: number, size = 0.25) {
  const m = new THREE.Mesh(PUFF_GEO, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.scale.setScalar(size / 0.25); m.position.copy(at); world.scene.add(m); puffs.push({ mesh: m, life: 0.35 });
}
function attack() {
  if (fishing) { strikeFish(); return; }
  if (busy() || s.gameover) return;
  if (holstered) { toggleHolster(); return; }
  if (player.slot === 'carbine') fire(); else cast(player.slot);
}
function fire() {
  if (player.fireCd > 0 || player.reloading > 0) return;
  const shot = G.tryFire(s);
  if (shot === 'empty') { sfx.dry(); startReload(); return; }
  if (shot === 'misfire') { sfx.dry(); player.fireCd = 0.5; feed.push(s, 'misfire', 'Click. The fouled revolver misfires. Clean it: gun oil from your pack, or Dorran for three crowns.', 'combat', 3, 20); return; }
  const gun = G.firearm(s), GD = B.GUNS[gun], rifle = gun !== 'revolver', silver = gun === 'revolver' && G.lastSilver;
  player.fireCd = gun === 'revolver' ? 0.4 : GD.cooldown; player.lastCombat = now;
  sfx.shot(); if (gun === 'scattergun') setTimeout(() => sfx.shot(), 18); if (rifle) setTimeout(() => sfx.reload(), gun === 'longrifle' ? 420 : 260);
  vm.play('shoot', rifle ? (gun === 'longrifle' ? 0.8 : 0.55) : 0.25); if (player.view === 'third') player.action = null; tpOverlay = { clip: 'shoot', t: 0, dur: rifle ? 0.5 : 0.25 };
  const o = camera.getWorldPosition(new THREE.Vector3()), from = handWorld();
  const spread = 0.012 * B.spreadMultiplier(s.needs) * G.aimMult(s) * (player.moving ? (player.sprinting ? 3 : 1.6) : 1);
  // v0.9: a scattergun throws eight pellets in a cone; each is its own ray (hits on one target add up)
  const dmgBy = new Map<Enemy, number>(); let anyHit = false;
  for (let p = 0; p < GD.pellets; p++) {
    const d = forward();
    d.x += (Math.random() - 0.5) * spread * 2; d.y += (Math.random() - 0.5) * spread * 2; d.z += (Math.random() - 0.5) * spread * 2; d.normalize();
    const hit = enemies.raycast(o, d, GD.range);
    const wall = rayBoxes(world.colliders, o, d, GD.range);
    let end: THREE.Vector3;
    if (hit && hit.dist < wall) {
      end = o.clone().add(d.clone().multiplyScalar(hit.dist)); anyHit = true;
      const falloff = gun === 'scattergun' ? Math.max(0.35, 1 - hit.dist / GD.range) : 1;
      dmgBy.set(hit.e, (dmgBy.get(hit.e) ?? 0) + G.revolverDamage(s, hit.e.kind, silver) * G.dealtMult(s) * falloff);
      puff(end, silver && B.UNDEAD.includes(hit.e.kind) ? 0xe8f0ff : 0xaa2222, 0.12);
    } else { const gd = d.y < 0 ? o.y / -d.y : Infinity; const dist = Math.min(wall, gd, GD.range); end = o.clone().add(d.clone().multiplyScalar(dist)); if (p < 3) puff(end, 0xbbaa88, 0.1); }
    if (p < 4) { const g = new THREE.BufferGeometry().setFromPoints([from, end]); const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: silver ? 0xdde8ff : 0xffe0a0, transparent: true, opacity: 0.8 })); world.scene.add(line); tracers.push({ line, life: 0.06 }); }
  }
  for (const [e, dmg] of dmgBy) enemies.damage(e, dmg, now, undefined, 'bullet');
  if (anyHit) { G.shotHit(s); hud.hitmarker(); }
  player.pitch = Math.min(1.45, player.pitch + (gun === 'longrifle' ? 0.05 : gun === 'scattergun' ? 0.045 : rifle ? 0.028 : 0.018));
}
function startReload() {
  if (player.slot !== 'carbine' || player.reloading > 0 || busy()) return;
  const rounds = G.gunRounds(s); if (rounds.mag >= rounds.size) return;
  if (rounds.spare <= 0) { G.log(s, G.firearm(s) === 'revolver' ? 'Out of rounds. Sera sells cartridges at the market stall.' : `Out of ${B.ITEMS[B.GUNS[G.firearm(s)].ammo].name.replace(/ ×\d+$/, '').toLowerCase()}. Hale & Daughter in Ashford sell them.`, 'warn'); sfx.dry(); return; }
  if (holstered) return;
  const rt = G.reloadTime(s); player.reloading = rt; vm.play('reload', rt); tpOverlay = { clip: 'reload', t: 0, dur: rt }; sfx.reload();
}
function cast(slot: Exclude<Slot, 'carbine'>) {
  if (player.castCd > 0) return;
  void SPELL_COST;
  const r = G.castSpell(s, slot);
  if (!r.ok) {
    if (slot === 'spark' && !s.story.sparkLearned) { feed.push(s, 'noSpark', 'You have not learned Spark yet.', 'magic', 1, 5); player.castCd = 0.3; return; }
    if (r.why === 'mana') feed.push(s, 'noMana', EVENTS.castNoMana(s), 'magic', 2, 3);
    else if (r.why === 'cooldown') feed.push(s, 'cd', `${B.SPELLS[slot].name} is not ready (${G.spellReadyIn(s, slot).toFixed(1)} s).`, 'magic', 1, 2);
    sfx.dry(); player.castCd = 0.3; return;
  }
  feed.push(s, 'cast', EVENTS.cast(s, slot), 'magic', 2, 25);
  player.castCd = 0.3; if (slot !== 'heal') player.lastCombat = now;
  vm.spellColor.setHex(slot === 'firebolt' ? 0xff6a1a : slot === 'frost' ? 0x8fe0ff : slot === 'heal' ? 0x9cff9a : slot === 'spark' ? 0xd8e8ff : 0xe0c070);
  vm.play('cast', slot === 'heal' ? 0.9 : 0.45); tpOverlay = { clip: 'cast', t: 0, dur: slot === 'heal' ? 0.9 : 0.45 };
  if (slot === 'heal') {
    sfx.ward(); healGlow = 1.0; hud.heal(r.heal ?? 0);
    for (let i = 0; i < 6; i++) setTimeout(() => puff(player.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.4 + i * 0.25, (Math.random() - 0.5) * 0.8)), 0x9cff9a, 0.12), i * 90);
    if (s.wounds.length) feed.push(s, 'healCap', EVENTS.healCapped(s), 'magic', 2, 60);
    return;
  }
  if (slot === 'ward') { player.shield = 30; player.shieldUntil = now + 12; sfx.ward(); G.log(s, 'Stone Ward: the next 30 damage is absorbed.', 'info'); return; }
  const wx = world.dungeon ? 'clear' : G.today(s).weather, pw = G.spellPower(s);
  if (slot === 'spark') { castSpark(18 * pw * weatherSpellMult(wx, 'spark')); return; }
  const from = handWorld(); const target = aimPoint(); const dir = target.sub(from).normalize();
  enemies.fireProjectile(from.add(dir.clone().multiplyScalar(0.3)), dir, 'player', slot === 'firebolt' ? 'fire' : 'frost', (slot === 'firebolt' ? 22 : 13) * pw * weatherSpellMult(wx, slot === 'firebolt' ? 'fire' : 'frost'));
  slot === 'firebolt' ? sfx.fire() : sfx.frost();
}
/** Spark: lightning from the staff to the enemy you are looking at, then on to up to two more close by. */
function castSpark(dmg: number) {
  sfx.zap();
  const o = camera.getWorldPosition(new THREE.Vector3()), d = forward();
  const live = enemies.list.filter(e => e.alive);
  let first = enemies.raycast(o, d, 26)?.e ?? null;
  if (first && rayBoxes(world.colliders, o, d, 26) < first.center().distanceTo(o) - 0.5) first = null;
  if (!first) { // forgiving aim: the nearest enemy within a narrow cone
    let best = 0.93; for (const e of live) { const to = e.center().sub(o); const dist = to.length(); if (dist > 22) continue; const dot = to.normalize().dot(d); if (dot > best && rayBoxes(world.colliders, o, to, dist) >= dist - 0.5) { best = dot; first = e; } }
  }
  const pts: THREE.Vector3[] = [handWorld()];
  if (!first) { pts.push(o.clone().add(d.multiplyScalar(Math.min(14, rayBoxes(world.colliders, o, d, 14))))); bolt(pts); return; }
  const hitList: Enemy[] = [first];
  for (let i = 0; i < (s.charm === 'charmCopper' ? 3 : 2); i++) { const last = hitList[hitList.length - 1]; const nx = live.filter(e => !hitList.includes(e) && e.pos.distanceTo(last.pos) < 7.5).sort((a, b) => a.pos.distanceTo(last.pos) - b.pos.distanceTo(last.pos))[0]; if (!nx) break; hitList.push(nx); }
  for (const e of hitList) { pts.push(e.center()); enemies.damage(e, dmg * G.dealtMult(s), now, undefined, 'spark'); puff(e.center(), 0xd8e8ff, 0.3); }
  hud.hitmarker(); bolt(pts);
}
/** A jagged bright line through the given points, gone in a blink. */
function bolt(pts: THREE.Vector3[]) {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], n = Math.max(2, Math.round(a.distanceTo(b) / 1.2)); for (let k = 0; k < n; k++) out.push(a.clone().lerp(b, k / n).add(k ? new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5) : new THREE.Vector3())); }
  out.push(pts[pts.length - 1]);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(out), new THREE.LineBasicMaterial({ color: 0xe8f2ff, transparent: true, opacity: 0.8 }));
  world.scene.add(line); tracers.push({ line, life: 0.14 });
}
function melee() {
  if (busy() || player.meleeCd > 0 || s.gameover) return;
  player.meleeCd = 0.7; player.lastCombat = now; vm.play('melee', 0.5); tpOverlay = { clip: 'melee', t: 0, dur: 0.5 }; sfx.swing();
  setTimeout(() => {
    const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
    for (const e of enemies.list) {
      if (!e.alive) continue;
      const to = e.pos.clone().sub(player.pos); to.y = 0; const dl = to.length();
      if (dl < 2.5 && f.dot(to.normalize()) > 0.45) {
        enemies.damage(e, G.meleeDamage(s) * G.dealtMult(s), now, undefined, 'melee'); hud.hitmarker();
        const kb = to.multiplyScalar(s.gear.ironStaff ? 2.4 : 1.6); const [x, z] = collide(world.colliders, e.pos.x + kb.x, e.pos.z + kb.z, e.def.radius); e.pos.set(x, 0, z);
      }
    }
  }, 150);
}
let tpOverlay: { clip: ClipName; t: number; dur: number } | null = null;
let healGlow = 0;

// ---------------- loot, dodge, lantern ----------------
const SACK_GEO = new THREE.DodecahedronGeometry(0.16, 0), SACK_MAT = new THREE.MeshStandardMaterial({ color: 0xd8b860, roughness: 0.6, emissive: 0x4a3a10 });
const sackProto = new THREE.Mesh(SACK_GEO, SACK_MAT); sackProto.visible = false; world.scene.add(sackProto);
const pickups: { mesh: THREE.Mesh; loot: T.Loot; t: number }[] = [];
function dropLoot(e: Enemy) {
  const kind: T.LootKind = e.elite ? 'elite' : (e.kind as T.LootKind);
  const loot = T.rollLoot(s, kind); if (!loot) return;
  const m = new THREE.Mesh(SACK_GEO, SACK_MAT); m.position.set(e.pos.x, 0.3, e.pos.z); world.scene.add(m); pickups.push({ mesh: m, loot, t: 0 });
}
function updatePickups(dt: number) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i]; p.t += dt; p.mesh.rotation.y += dt * 2; p.mesh.position.y = 0.3 + Math.sin(p.t * 3) * 0.06;
    const near = Math.hypot(p.mesh.position.x - player.pos.x, p.mesh.position.z - player.pos.z) < 1.5;
    if (near || p.t > 180) {
      if (near) { const what = T.collectLoot(s, p.loot); sfx.pickup(); feed.push(s, 'loot' + i + p.t.toFixed(0), `Picked up ${what}.`, 'explore', 1, 0); const ld = G.loadState(s); if (ld.band !== 'light') feed.push(s, 'lootHeavy', `Your pack is getting heavy (${ld.kg} kg).`, 'survival', 2, 60); }
      world.scene.remove(p.mesh); pickups.splice(i, 1);
    }
  }
}
/** Dodge: a fast low step in the direction you are moving (or backwards), briefly untouchable. Costs stamina. */
function dodge() {
  if (busy() || s.gameover || player.dodgeCd > 0 || !player.onGround) return;
  if (s.stamina < 14 || s.staminaLocked) { feed.push(s, 'noDodge', 'Too winded to dodge.', 'combat', 1, 4); return; }
  let mx = 0, mz = 0; if (down('forward')) mz -= 1; if (down('back')) mz += 1; if (down('left')) mx -= 1; if (down('right')) mx += 1;
  if (!mx && !mz) mz = 1;
  const l = Math.hypot(mx, mz), sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
  player.dodgeX = (mx / l) * cos + (mz / l) * sin; player.dodgeZ = -(mx / l) * sin + (mz / l) * cos;
  player.dodgeT = 0.32; player.dodgeCd = 0.85; s.stamina = Math.max(0, s.stamina - 14); sfx.swing(); G.addXp(s, 'vigor', 1);
}
const lanternAnchor = world.lights.add(0, 1.5, 0, 0xffc880, 5.5, 13, 1.5, { follow: true, on: false, flicker: 0.05 });
const lanternMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xffb84a })); lanternMesh.position.set(-0.2, -0.08, 0.06); lanternMesh.visible = false;
function toggleLantern() {
  if (!s.gear.lantern) { feed.push(s, 'noLantern', 'You do not own a lantern. Dorran Kade sells one at the smithy.', 'explore', 1, 10); return; }
  player.lantern = !player.lantern; sfx.ui();
}

// ---------------- interaction ----------------
function nearestInteractable(): Interactable | null {
  let best: Interactable | null = null, bd = Infinity;
  const f = new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw));
  for (const it of world.interactables) {
    if (it.hidden) continue;
    const d = Math.hypot(it.pos.x - player.pos.x, it.pos.z - player.pos.z);
    if (d > it.radius) continue;
    const to = it.pos.clone().sub(player.pos).setY(0);
    const score = d - (to.lengthSq() > 0.01 ? f.dot(to.normalize()) * 0.5 : 0);
    if (score < bd) { bd = score; best = it; }
  }
  return best;
}
function nearestFolk(): Townsfolk | null {
  let best: Townsfolk | null = null, bd = 2.6;
  for (const t of folk) { if (!t.present) continue; const d = t.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = t; } }
  return best;
}
function promptText(): string | null {
  if (busy() || hud.modalOpen) return null;
  const it = nearestInteractable();
  if (it) {
    if (it.id.startsWith('cairn_')) { const site = it.id.slice(6) as SiteId; if (canAttune(site)) return 'Touch Lira\'s pebble to the waystone'; if (s.active?.kind === 'recovery' && s.active.site === site && !s.carryingCrate && s.active.progress < 1) return 'Take the stolen goods'; return s.active?.kind === 'courier' && s.active.site === site && s.carryingLetter ? 'Leave the sealed letter in the cairn' : 'Waystone cairn'; }
    if (it.id === 'board' && G.contractReady(s) && (s.active!.kind !== 'recovery' || s.carryingCrate)) return 'Collect your pay at the board';
    if (it.id === 'well' && wellReady()) return 'Pour the blessed salt into the well';
    if (it.id === 'chair') return 'Sit by the fire: rest, read, meditate or wait';
    return it.label;
  }
  const t = nearestFolk(); if (t) return `Talk to ${t.def.name}${t.mark.visible ? ' (has something for you)' : ''}`;
  return null;
}
type StationFx = { clip: ClipName; dur: number; fp: FPAction; sound?: () => void; fade?: string; then: () => void };
function station(it: Interactable, fx: StationFx) {
  player.action = { clip: fx.clip, t: 0, dur: fx.dur, seat: it.seat, facing: it.facing, upper: false };
  if (it.facing !== undefined) player.yaw = it.facing;
  vm.play(fx.fp, fx.dur); fx.sound?.();
  const finish = () => { fx.then(); player.action = null; if (it.seat) { player.pos.set(it.pos.x, 0, it.pos.z); } };
  if (fx.fade) { setTimeout(async () => { await hud.fade(fx.fade!, 1300); finish(); save(); }, Math.min(900, fx.dur * 500)); }
  else setTimeout(finish, fx.dur * 1000);
}
function interact() {
  if (busy() || s.gameover) return;
  const it = nearestInteractable();
  if (!it) { const t = nearestFolk(); if (t) { sfx.ui(); openTalk(t); } return; }
  if (southInteract(it) || reachInteract(it) || westInteract(it)) return;
  switch (it.id as InteractId) {
    case 'bed': {
      const h = G.hour(s);
      station(it, { clip: 'sleep', dur: 2.2, fp: 'none', fade: h >= 18 || h < 6 ? 'You sleep until morning…' : 'You nap for two hours…', then: () => { const d0 = G.day(s); G.sleep(s); sfx.ui(); if (G.day(s) !== d0 || G.hour(s) === 7) { const ev = pickDoorEvent(s); if (ev) setTimeout(() => { if (!hud.modalOpen && !s.gameover) { sfx.bell(); P.openDoorEvent(ui, ev); } }, 1700); } } });
      break;
    }
    case 'hearth': openKitchen(it); break;
    case 'cistern': station(it, { clip: 'drink', dur: 1.6, fp: 'drink', sound: () => sfx.water(), then: () => { G.drink(s, 'cistern'); feed.push(s, 'drinkMana', EVENTS.drinkLowMana(s), 'magic', 2, 60); } }); break;
    case 'well': if (wellReady()) { station(it, { clip: 'interact', dur: 1.4, fp: 'interact', sound: () => sfx.water(), then: () => startWellEvent() }); break; }
      station(it, { clip: 'drink', dur: 1.6, fp: 'drink', sound: () => sfx.water(), then: () => { G.drink(s, 'well'); feed.push(s, 'drinkMana', EVENTS.drinkLowMana(s), 'magic', 2, 60); } }); break;
    case 'privy': station(it, { clip: 'sit', dur: 2.0, fp: 'none', fade: '…', then: () => G.privy(s) }); break;
    case 'basin': station(it, { clip: 'wash', dur: 1.8, fp: 'wash', sound: () => sfx.water(), then: () => G.wash(s) }); break;
    case 'shower': world.showerDrops.visible = true; station(it, { clip: 'wash', dur: 3.2, fp: 'wash', sound: () => { sfx.water(); setTimeout(() => sfx.water(), 900); setTimeout(() => sfx.water(), 1800); }, fade: 'You stand under the cold rain-tank…', then: () => { G.shower(s); world.showerDrops.visible = false; } }); break;
    case 'chapel_door': if (!s.quests.mq3) { sfx.ui(); G.log(s, 'Black water, and worn steps going down into it. You have no reason to go down there. Not yet.', 'info'); break; } goChapel(true); break;
    case 'chapel_exit': goChapel(false); break;
    case 'chapel_valve_a': case 'chapel_valve_b': { const k = it.id.endsWith('a') ? 'valveA' : 'valveB';
      station(it, { clip: 'interact', dur: 1.6, fp: 'interact', sound: () => sfx.reload(), then: () => { if (S.flag(s, k)) { G.log(s, 'The valve is open as far as it goes.', 'info'); return; } S.setFlag(s, k); sfx.water(); const both = S.flag(s, 'valveA') && S.flag(s, 'valveB'); G.log(s, both ? 'The second sluice opens. The whole nave groans, and the water begins to fall.' : 'The wheel turns a hand at a time. Somewhere under the floor, water starts to move. One more valve.', 'good'); } }); break; }
    case 'chapel_waystone': station(it, { clip: 'interact', dur: 1.2, fp: 'interact', sound: () => sfx.bell(), then: () => { if (G.touchChapelCheckpoint(s)) { sfx.good(); save(); } else G.log(s, 'The waystone glows steadily. You will wake here if you fall.', 'info'); } }); break;
    case 'chapel_note_1': G.readNote(s, 'c1', 'A wax tablet by the door: "The river rose in a night. We carried the Censer down so the Flame would not drown. Brother Aldous would not leave it. We closed the sluices behind us. Forgive us."'); sfx.ui(); break;
    case 'chapel_note_2': G.readNote(s, 'c2', 'Scratched into the shrine, in rows: "Day 9. Water at the third step. I keep the coals alive. Day 30. I find I do not need to eat. Day —. The fire is in me now. It learns what hurts it. So do I."'); sfx.ui(); break;
    case 'chapel_note_3': G.readNote(s, 'c3', 'Burned into the lintel, each letter a hand high: "IT LEARNS. NEVER THE SAME BLOW THREE TIMES."'); sfx.ui(); break;
    case 'chapel_crate_1': case 'chapel_crate_2': case 'chapel_crate_3': lootCrate(it.id); break;
    case 'mill_door': goMill(true); break;
    case 'mill_exit': goMill(false); break;
    case 'mill_lever': station(it, { clip: 'interact', dur: 1.0, fp: 'interact', then: () => { if (!millGateOpen) { millGateOpen = true; s.flags.notesRead.push('gate'); world.openMillGate(); sfx.reload(); G.log(s, 'Chains grind somewhere north. The flooded corridor gate lifts.', 'good'); } else G.log(s, 'The lever is stuck in the up position now.', 'info'); } }); break;
    case 'mill_waystone': station(it, { clip: 'interact', dur: 1.2, fp: 'interact', then: () => { if (G.touchMillCheckpoint(s)) { sfx.good(); save(); } else G.log(s, 'The waystone glows steadily. You will wake here if you fall.', 'info'); } }); break;
    case 'mill_note_1': G.readNote(s, 'n1', 'Scratched into a crate: "Wheel stopped the night the stones went dark. Miller Hask went down to see. Didn\'t come up." '); sfx.ui(); break;
    case 'mill_note_2': G.readNote(s, 'n2', 'A ledger page: "Flour to the Tower, 40 sacks, unpaid. A. Voss to settle." In the margin, in a shaking hand: "the ember keeps it asleep. do not take the ember."'); sfx.ui(); break;
    case 'mill_note_3': G.readNote(s, 'n3', 'Cut into the arena door: "HE FEARS THE FIRE THAT MADE HIM. STONE STOPS HIS VOICE."'); sfx.ui(); break;
    case 'mill_crate_1': case 'mill_crate_2': case 'mill_crate_3': lootCrate(it.id); break;
    case 'chair': P.openChair(ui, (what, n) => {
      const txt = what === 'sit' ? '' : what === 'read' ? 'You read by the fire…' : what === 'meditate' ? 'You breathe with the fire…' : 'Time passes…';
      station(it, { clip: 'sit', dur: 2.6, fp: 'none', fade: txt || undefined, then: () => { if (what === 'sit') G.sit(s); else if (what === 'read') T.readBook(s); else if (what === 'meditate') T.meditate(s); else T.waitUntil(s, n); } });
    }); break;
    case 'bar': P.openTavern(ui); break;
    case 'dice': P.openDice(ui); break;
    case 'anvil': P.openSmithy(ui); break;
    case 'shrine': case 'flame': if (s.crowns < T.CHAPEL.blessing) { G.log(s, 'An offering of five crowns is customary. You do not have it.', 'warn'); sfx.bad(); } else station(it, { clip: 'kneel', dur: 3.0, fp: 'none', sound: () => sfx.bell(), then: () => { if (T.blessing(s)) sfx.good(); } }); break;
    case 'spire_door': sfx.ui(); G.log(s, S.questDone(s, 'mq4') ? 'The Spire door stands open now. Lira waves from the stair.' : s.story.flags.gateHeld ? 'The door is open. Aldric Voss is waiting outside it.' : 'You knock. Nobody answers; somewhere above, a quill stops scratching, then starts again. Lira Voss is the one who talks to visitors.', 'info'); break;
    case 'pond': station(it, { clip: 'pick', dur: 1.3, fp: 'interact', sound: () => sfx.water(), then: () => {
      if (S.questActive(s, 'lure') && s.inventory.lure === 0 && !S.flag(s, 'lureGiven') && !S.flag(s, 'lureKept')) { s.inventory.lure = 1; sfx.pickup(); G.log(s, 'Brass glints in the reed roots: a spinner on a frayed line. Something growls behind you.', 'good'); for (let i = 0; i < 2; i++) enemies.spawn('hound', it.pos.clone().add(new THREE.Vector3(8 + i * 3, 0, 4 - i * 6)), 'quest').state = 'chase'; }
      else G.log(s, 'Reeds, frogs, and your own reflection looking tired.', 'info'); } }); break;
    case 'cart': station(it, { clip: 'pick', dur: 1.4, fp: 'interact', then: () => {
      if (S.questActive(s, 'cart') && !S.flag(s, 'cartFound')) { S.setFlag(s, 'cartFound'); s.carryingCrate = true; sfx.pickup(); G.log(s, "Sera's strongbox is wedged under the axle. You haul it out. Voices from the trees: you are not the first to find this cart.", 'warn'); for (let i = 0; i < 3; i++) enemies.spawn('raider', it.pos.clone().add(new THREE.Vector3(-9 + i * 3, 0, 7 + i)), 'quest').state = 'chase'; }
      else G.log(s, 'A wrecked cart, picked clean.', 'info'); } }); break;
    case 'offering': station(it, { clip: 'pick', dur: 1.3, fp: 'interact', then: () => {
      if (S.questActive(s, 'ring') && s.inventory.ring === 0) { s.inventory.ring = 1; sfx.pickup(); G.log(s, 'Under forty years of moss: a plain gold band, worn thin. The stone is colder where it lay.', 'good'); if (world.night > 0.5) enemies.spawn('shade', it.pos.clone().add(new THREE.Vector3(-6, 0, 5)), 'quest').state = 'chase'; }
      else G.log(s, 'Old offerings: a button, a child\'s tooth, coins gone green.', 'info'); } }); break;
    case 'medical': station(it, { clip: 'interact', dur: 1.8, fp: 'interact', then: () => { if (G.treatWound(s)) sfx.good(); } }); break;
    case 'chest': openChest(); break;
    case 'board': openBoard(); break;
    case 'market': openShop(); break;
    case 'clerk': openClerk(); break;
    case 'ledger_desk': {
      const c = G.canStartShift(s);
      if (!c.ok) { G.log(s, c.why, 'warn'); sfx.bad(); break; }
      openDeskChoice(it);
      break;
    }
    default:
      if (it.id.startsWith('herb_') || it.id.startsWith('moon_')) {
        const moon = it.id.startsWith('moon_');
        station(it, { clip: 'pick', dur: 1.2, fp: 'interact', then: () => { s.inventory[moon ? 'moonpetal' : 'herbs']++; S.setFlag(s, 'node:' + it.id, G.day(s) * 2 + (G.hour(s) >= 12 ? 1 : 0) + 1); it.hidden = true; sfx.pickup(); G.count(s, 'gathered'); feed.push(s, 'gather' + it.id, moon ? 'A moonpetal, cold and faintly bright. +1' : 'A handful of Vale herbs. +1', 'explore', 1, 0); refreshNodes(); } });
      }
      else if (it.id.startsWith('cairn_')) {
        const site = it.id.slice(6) as SiteId;
        if (canAttune(site)) station(it, { clip: 'interact', dur: 1.5, fp: 'interact', sound: () => sfx.bell(), then: () => { S.setFlag(s, 'attune:' + site); sfx.good(); G.log(s, `The pebble jumps in your hand and tugs north-east. (${['mill_road', 'raider_camp', 'whisper_stones'].filter(k => S.flag(s, 'attune:' + k)).length}/3) Something in the trees turns to look.`, 'good'); enemies.spawn('shade', it.pos.clone().add(new THREE.Vector3(7, 0, -6)), 'quest').state = 'chase'; } });
        else if (s.active?.kind === 'recovery' && s.active.site === site && !s.carryingCrate && s.active.progress < 1) station(it, { clip: 'interact', dur: 1.2, fp: 'interact', then: () => { G.pickUpCrate(s); sfx.good(); } });
        else if (s.active?.kind === 'courier' && s.active.site === site && s.carryingLetter) station(it, { clip: 'interact', dur: 1.2, fp: 'interact', then: () => { G.deliverLetter(s); sfx.good(); } });
        else G.log(s, 'Old stones, stacked by travellers. Someone has left a copper on top.', 'info');
      }
  }
}
function quickEat() {
  if (busy()) return;
  if (s.inventory.bread <= 0) { G.log(s, 'No bread on you.', 'warn'); return; }
  player.action = { clip: 'eat', t: 0, dur: 1.6, upper: true }; vm.play('eat', 1.6); sfx.eat();
  setTimeout(() => { G.eat(s, 'bread'); player.action = null; }, 1600);
}

// ---------------- pass 4: quest hooks in the world ----------------
const canAttune = (site: SiteId) => S.questActive(s, 'mq2') && s.quests.mq2.stage === 1 && !S.flag(s, 'attune:' + site);
const wellReady = () => S.questActive(s, 'well') && s.quests.well.stage === 1 && !!S.flag(s, 'hasSalt') && !S.flag(s, 'wellCleansed') && !S.flag(s, 'wellFight') && (G.hour(s) >= 20 || G.hour(s) < 4);
function startWellEvent() {
  S.setFlag(s, 'wellFight'); sfx.hiss(0);
  G.log(s, 'The salt hits the water and the water screams. Three shapes climb out of the well.', 'bad');
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; enemies.spawn('shade', new THREE.Vector3(Math.cos(a) * 7, 0, Math.sin(a) * 7), 'well').state = 'chase'; }
}
/** Called for every enemy that dies: closes out fights that belong to an event. */
function onEnemyDown(e: Enemy) {
  if (e.tag === 'well' && !enemies.list.some(x => x.alive && x.tag === 'well' && x !== e)) { S.setFlag(s, 'wellCleansed'); S.setFlag(s, 'wellFight', 0); sfx.good(); G.log(s, 'The last of them comes apart over the well mouth. The water goes still, then clear.', 'good'); }
  if (e.tag === 'gate') gateEnemyDown();
  reachEnemyDown(e);
  westEnemyDown(e);
}
/** Herbs come back each morning; moonpetal shows only at night and is cut once a night. */
function refreshNodes() {
  const d = G.day(s), nightNow = world.night > 0.5 && !world.dungeon, half = d * 2 + (G.hour(s) >= 12 ? 1 : 0) + 1;
  for (const n of world.nodes) {
    const picked = S.flag(s, 'node:' + n.id);
    const show = n.kind !== 'moon' ? Math.floor((picked - 1) / 2) !== d || !picked : nightNow && picked !== half && picked !== half - 1;
    n.mesh.visible = show; n.it.hidden = !show;
  }
}
function gateEnemyDown() { if (gate.active && !enemies.list.some(e => e.alive && e.tag === 'gate')) gate.t = Math.max(gate.t, 7); }
// ---------------- map and walking to known places ----------------
const TRAVEL: { id: string; label: string; pos: () => THREE.Vector3; known: () => boolean }[] = [
  { id: 'home', label: 'Home', pos: () => world.homeSpawn, known: () => true },
  { id: 'gate', label: 'South Gate', pos: () => new THREE.Vector3(0, 0, 29), known: () => true },
  ...(['mill_road', 'raider_camp', 'whisper_stones'] as SiteId[]).map(site => ({ id: 'cairn_' + site, label: `Cairn: ${SITES[site].name.replace(/^the /, '')}`, pos: () => world.places['cairn_' + site].clone().add(new THREE.Vector3(1.5, 0, 1.5)), known: () => s.discovered.includes('cairn_' + site) })),
  { id: 'mill_door', label: 'Old Mill hatch', pos: () => world.mill.outside, known: () => s.flags.millEntered },
  { id: 'chapel_door', label: 'Sunken Chapel', pos: () => world.chapel.outside, known: () => S.flag(s, 'chapelEntered') > 0 },
  // v0.7: the Eastern Reach
  { id: 'east_gate', label: 'East Gate', pos: () => new THREE.Vector3(40, 0, 4.5), known: () => true },
  ...([['brookfield', 'Brookfield'], ['thornwood_camp', 'Thornwood clearing'], ['hollow_oak', 'The Hollow Oak'], ['bridge', 'Wend bridge'], ['ashford', 'Ashford'], ['docks', 'Ashford docks'], ['copper_hollow', 'Copper Hollow']] as [string, string][]).map(([id, label]) => ({ id: 'p_' + id, label, pos: () => world.places[id].clone().add(new THREE.Vector3(id === 'ashford' ? 0 : 1.5, 0, id === 'ashford' ? 6 : 1.5)), known: () => s.discovered.includes('place:' + id) })),
  // v0.8: the Westmarch
  { id: 'west_gate', label: 'West Gate', pos: () => new THREE.Vector3(-39.5, 0, 4.5), known: () => S.flag(s, 'westGateOpen') > 0 },
  ...([['fernhollow', 'Fernhollow'], ['smeath', 'The Smeaths\' clamp'], ['vane_dig', 'Vane\'s dig'], ['ring', 'The Ring of Nine'], ['orm_mound', 'King Orm\'s mound'], ['jetty', 'Fernhollow jetty']] as [string, string][]).map(([id, label]) => ({ id: 'p_' + id, label, pos: () => world.places[id].clone().add(new THREE.Vector3(1.2, 0, 1.2)), known: () => s.discovered.includes('place:' + id) })),
  ...(['heath_road', 'barrow_downs', 'reed_marsh'] as SiteId[]).map(site => ({ id: 'cairn_' + site, label: `Cairn: ${SITES[site].name.replace(/^the /, '')}`, pos: () => world.places['cairn_' + site].clone().add(new THREE.Vector3(1.5, 0, 1.5)), known: () => s.discovered.includes('cairn_' + site) })),
  ...(['thornwood', 'toll_tower', 'brookfield', 'hollow_road'] as SiteId[]).map(site => ({ id: 'cairn_' + site, label: `Cairn: ${SITES[site].name.replace(/^the /, '')}`, pos: () => world.places['cairn_' + site].clone().add(new THREE.Vector3(1.5, 0, 1.5)), known: () => s.discovered.includes('cairn_' + site) })),
  // v0.9.3: the Saltway Coast (only once the gap is open and you have walked there)
  { id: 'salt_gap', label: 'The Salt Gap', pos: () => world.places.salt_gap, known: () => S.flag(s, 'saltGapOpen') > 0 },
  ...([['gullhaven', 'Gullhaven'], ['saltway', 'The carter\'s shrine'], ['gulltower', 'The Gull Tower'], ['lighthouse', 'The lighthouse'], ['flats', 'The tidal flats'], ['cove', 'Wreckers\' Cove']] as [string, string][]).map(([id, label]) => ({ id: 'p_' + id, label, pos: () => world.places[id].clone(), known: () => S.flag(s, 'saltGapOpen') > 0 && s.discovered.includes('place:' + id) })),
  ...(['saltway', 'gull_tower', 'tidal_flats', 'wreckers_cove'] as SiteId[]).map(site => ({ id: 'cairn_' + site, label: `Cairn: ${SITES[site].name.replace(/^the /, '')}`, pos: () => world.places['cairn_' + site].clone().add(new THREE.Vector3(1.5, 0, 1.5)), known: () => S.flag(s, 'saltGapOpen') > 0 && s.discovered.includes('cairn_' + site) })),
];
function discoverPlaces() {
  if (world.dungeon) return;
  for (const site of ['mill_road', 'raider_camp', 'whisper_stones'] as SiteId[]) {
    const id = 'cairn_' + site; if (s.discovered.includes(id)) continue;
    if (player.pos.distanceTo(world.places[id]) < 14) { s.discovered.push(id); sfx.pickup(); feed.push(s, 'found' + id, `Found: the cairn at ${SITES[site].name}. You can walk back here from the map (${keyName(cfg.bindings.map)}).`, 'explore', 2, 0); }
  }
}
function travelBlock(): string {
  if (world.dungeon) return 'There is no map of this place.';
  if (gate.active) return 'Not while the gate is under attack.';
  if (s.carryingCrate) return 'Not while carrying a strongbox: walk it in.';
  if (coast.heavyLoad(s)) return coast.heavyLoad(s);
  if (enemies.list.some(e => e.alive && e.state !== 'idle' && e.state !== 'return' && e.pos.distanceTo(player.pos) < 35)) return 'Not with enemies on you.';
  return '';
}
function openMap() {
  if (busy()) return;
  if (world.dungeon) { feed.push(s, 'noMap', 'No map of this place. Find your own way.', 'explore', 1, 5); return; }
  const marks: MapMark[] = [];
  marks.push({ x: world.places.home.x - 6, z: world.places.home.z, label: 'Home', color: '#bfe39e', shape: 'square' });
  for (const site of ['mill_road', 'raider_camp', 'whisper_stones'] as SiteId[]) { const p = world.places['cairn_' + site], k = s.discovered.includes('cairn_' + site); marks.push({ x: p.x, z: p.z, label: k ? SITES[site].name.replace(/^the /, '') : '?', color: k ? '#cfc8b0' : '#77705e', shape: 'tri' }); }
  if (s.flags.millEntered || S.questActive(s, 'mq1')) marks.push({ x: world.millDoorPos.x, z: world.millDoorPos.z, label: 'Old Mill', color: '#b0a0d8', shape: 'square' });
  if (S.flag(s, 'chapelEntered') || s.quests.mq3) marks.push({ x: world.places.chapel_door.x, z: world.places.chapel_door.z, label: 'Sunken Chapel', color: '#7fd0c0', shape: 'square' });
  marks.push({ x: -36, z: 22, label: 'Spire', color: '#8fb0ff', shape: 'dot' }, { x: 0, z: 33.5, label: 'South Gate', color: '#cfc8b0', shape: 'dot' }, { x: 44, z: 4.5, label: 'East Gate', color: '#cfc8b0', shape: 'dot' });
  for (const p of EAST_PLACES) { if (p.id === 'east_gate') continue; const at = world.places[p.id], k = s.discovered.includes('place:' + p.id); if (at && (k || p.id === 'ashford')) marks.push({ x: at.x, z: at.z, label: k ? p.name.replace(/^the /, '') : '?', color: k ? '#cfc8b0' : '#77705e', shape: p.id === 'ashford' || p.id === 'copper_hollow' ? 'square' : 'tri' }); }
  for (const site of ['thornwood', 'toll_tower', 'brookfield', 'hollow_road'] as SiteId[]) { const p = world.places['cairn_' + site]; if (s.discovered.includes('cairn_' + site)) marks.push({ x: p.x, z: p.z, label: '', color: '#cfc8b0', shape: 'tri' }); }
  for (const t of folk) if (t.present && t.mark.visible) marks.push({ x: t.pos.x, z: t.pos.z, label: '', color: '#ffd24a', shape: 'dot' });
  const c = s.active; if (c) { const done = c.progress >= c.count, cp = done ? boardPlace(c) : c.kind !== 'sweep' ? world.places['cairn_' + c.site] : world.sites[c.site]; marks.push({ x: cp.x + 2, z: cp.z + 2, label: done ? 'Collect pay' : 'Notice', color: '#9fd0ff', shape: 'diamond' }); }
  const coastKnown = S.flag(s, 'saltGapOpen') > 0 || player.pos.z > 136;
  if (coastKnown) {
    for (const p of COAST_PLACES) { if (p.id === 'wreck') continue; const at = world.places[p.id], k = s.discovered.includes('place:' + p.id); if (at && (k || p.id === 'gullhaven')) marks.push({ x: at.x, z: at.z, label: k ? p.name.replace(/^the /, '') : '?', color: k ? '#cfc8b0' : '#77705e', shape: p.id === 'gullhaven' || p.id === 'lighthouse' ? 'square' : 'tri' }); }
    for (const site of COAST_SITES_LIST) { const p = world.places['cairn_' + site]; if (s.discovered.includes('cairn_' + site)) marks.push({ x: p.x, z: p.z, label: '', color: '#cfc8b0', shape: 'tri' }); }
    if (s.discovered.includes('place:wreck') || s.discovered.includes('place:flats')) marks.push({ x: world.south.wreck.x, z: world.south.wreck.z, label: 'Merry Wren', color: coast.flatsExposed(s) ? '#e8d8a8' : '#6a8aa8', shape: 'dot' });
  }
  marks.push({ x: world.places.salt_gap.x, z: world.places.salt_gap.z, label: S.flag(s, 'saltGapOpen') ? 'Salt Gap' : 'Salt Gap (blocked)', color: '#cfc8b0', shape: 'dot' });
  const tr = S.tracked(s), qp = resolveWhere(tr?.where ?? null); if (qp && !world.inMillArea(qp) && !world.inChapelArea(qp) && !world.inMineArea(qp) && !world.inBarrowArea(qp) && !world.inSeaCaveArea(qp)) marks.push({ x: qp.x, z: qp.z, label: tr!.title, color: '#ffd24a', shape: 'diamond' });
  const block = travelBlock();
  const travel = block ? [] : TRAVEL.filter(t => t.known() && t.pos().distanceTo(player.pos) > 25).map(t => ({ id: t.id, label: t.label, minutes: Math.max(2, Math.round(t.pos().distanceTo(player.pos) / 4.2)) }));
  const d = G.today(s);
  const reachKnown = s.discovered.some(k => k.startsWith('place:') && !WEST_PLACES.some(w => 'place:' + w.id === k)) || player.pos.x > 42 || S.questActive(s, 'eq1');
  const westKnown = S.flag(s, 'westGateOpen') > 0;
  for (const p of WEST_PLACES) { const at = world.places[p.id], k = s.discovered.includes('place:' + p.id); if (at && (k || p.id === 'fernhollow') && westKnown) marks.push({ x: at.x, z: at.z, label: k ? p.name.replace(/^the /, '') : '?', color: k ? '#cfc8b0' : '#77705e', shape: p.id === 'fernhollow' || p.id === 'orm_mound' ? 'square' : 'tri' }); }
  for (const site of ['heath_road', 'barrow_downs', 'reed_marsh'] as SiteId[]) { const p = world.places['cairn_' + site]; if (s.discovered.includes('cairn_' + site)) marks.push({ x: p.x, z: p.z, label: '', color: '#cfc8b0', shape: 'tri' }); }
  showMap(openModal, { buildings: world.buildings, marks, player: { x: player.pos.x, z: player.pos.z, yaw: player.yaw }, travel, travelNote: block || 'Walking takes the same time it would on foot, and you get as hungry and thirsty as if you had walked. The coach between Millbrook\'s East Gate and Ashford is quicker.', header: `Day ${G.day(s)}, ${G.clock(s)} · ${WEATHER_TEXT[d.weather]} · ${world.regionAt(player.pos).name}`, features: world.east.map, view: player.pos.z > 136 ? 'coast' : player.pos.x > 64 ? 'reach' : player.pos.x < -64 ? 'west' : 'local', reachKnown, west: world.west.map, westKnown, westGateOpen: westKnown, coast: world.south.map, coastKnown, gapOpen: S.flag(s, 'saltGapOpen') > 0, lowTideIn: s.gear.spyglass || S.flag(s, 'tideRead') ? coast.minutesToLowWater(s) : undefined }, id => {
    const t = TRAVEL.find(x => x.id === id)!; const mins = Math.max(2, Math.round(t.pos().distanceTo(player.pos) / 4.2));
    hud.fade(`You walk to ${t.label.toLowerCase().replace('cairn: ', 'the cairn at ')}… (${mins} min)`, 900).then(() => { G.advanceMinutes(s, mins, 'active'); player.pos.copy(t.pos()); player.vy = 0; G.count(s, 'walks'); save(); relock(); });
  }, relock);
}

// ---------------- pass 3: kitchen, chest, Old Mill, ledger cases ----------------
let millGateOpen = false;
const looted = new Set<string>();
function goMill(enter: boolean) {
  if (busy()) return;
  sfx.ui();
  hud.fade(enter ? 'You climb down into the dark…' : 'You climb back up into the air…', 900).then(() => {
    if (enter) {
      player.pos.copy(world.mill.spawn); player.yaw = 0; world.setMillMode(true); spawnMill();
      const warn = G.enterMill(s); if (warn.length) feed.push(s, 'millWarn', `Unprepared: ${warn.join(', ')}. Turn back or be careful.`, 'explore', 3, 1);
    } else {
      player.pos.copy(world.mill.outside); player.yaw = -Math.PI / 2; world.setMillMode(false); boss.reset();
      for (const e of [...enemies.list]) if (e.tag === 'mill' || e.tag === 'patriarch_call') enemies.remove(e);
    }
    player.vy = 0; save();
  });
}
function goChapel(enter: boolean) {
  if (busy()) return;
  sfx.water();
  hud.fade(enter ? 'You wade down into the dark…' : 'You climb back into the air…', 900).then(() => {
    if (enter) {
      player.pos.copy(world.chapel.spawn); player.yaw = 0; world.setDungeon('chapel'); spawnChapel();
      const warn = G.enterChapel(s); if (warn.length) feed.push(s, 'chapelWarn', `Unprepared: ${warn.join(', ')}. Turn back or be careful.`, 'explore', 3, 1);
    } else {
      player.pos.copy(world.chapel.outside); player.yaw = Math.PI; world.setDungeon(null); wraith.reset();
      for (const e of [...enemies.list]) if (e.tag === 'chapel' || e.tag === 'wraith_call') enemies.remove(e);
    }
    player.vy = 0; save();
  });
}
// ---------------- Wardbreak Night: the defence of the South Gate ----------------
const GATE_POS = new THREE.Vector3(0, 0, 37);
const GATE_WAVES: [EnemyKind, number, boolean][][] = [
  [['hound', 4, false], ['raider', 2, false]],
  [['raider', 3, false], ['shade', 3, false], ['hound', 2, false]],
  [['shade', 3, false], ['hound', 3, false], ['raider', 2, true]],
];
function startGate() {
  gate.active = true; gate.wave = 0; gate.t = 5; gate.shotT = 3; S.setFlag(s, 'gateWave', 1); sfx.horn();
  G.log(s, 'Renn\'s horn. The gate bars drop behind you. Out past the tree line, the dark starts to move.', 'bad');
  feed.push(s, 'gateStart', 'Hold the South Gate. Three waves. The Watch will shoot from the towers.', 'combat', 3, 0);
}
function updateGate(dt: number) {
  if (!gate.active) return;
  gate.t -= dt; gate.shotT -= dt;
  const alive = enemies.list.filter(e => e.alive && e.tag === 'gate');
  if (alive.length === 0 && gate.t <= 0) {
    if (gate.wave >= GATE_WAVES.length) {
      gate.active = false; S.setFlag(s, 'gateHeld'); sfx.horn(); setTimeout(() => sfx.quest(), 900);
      G.log(s, 'Nothing else comes out of the trees. Along the palisade somebody starts to laugh, and cannot stop. The gate held.', 'good');
      hud.fade('The gate held', 1500); storyTick(); save(); return;
    }
    const w = GATE_WAVES[gate.wave]; gate.wave++; S.setFlag(s, 'gateWave', gate.wave); sfx.horn();
    feed.push(s, 'gateWave' + gate.wave, gate.wave === 1 ? 'First wave: hounds, with raiders behind them.' : gate.wave === 2 ? 'Second wave: shades in the tree line. Keep moving.' : 'Last wave. Two big ones at the back: put fire and lightning into them.', 'combat', 3, 0);
    for (const [kind, n, elite] of w) for (let i = 0; i < n; i++) {
      const e = enemies.spawn(kind, GATE_POS, 'gate', elite); e.pos.set((Math.random() - 0.5) * 26, 0, 58 + Math.random() * 10); e.state = 'chase'; e.los = true;
    }
    gate.t = 8;
  } else if (alive.length === 0 && gate.t > 6.9 && gate.wave > 0 && gate.wave < GATE_WAVES.length) feed.push(s, 'gateClear' + gate.wave, 'Wave broken. Reload, drink, bind what needs binding.', 'combat', 3, 0);
  // the Watch shoots from the gate towers
  if (gate.shotT <= 0 && alive.length) {
    gate.shotT = 2.4; const near = alive.filter(e => e.pos.distanceTo(GATE_POS) < 26);
    if (near.length) { const e = near[Math.floor(Math.random() * near.length)], from = new THREE.Vector3(Math.random() < 0.5 ? -4.6 : 4.6, 6.2, 32.5);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, e.center()]), new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8 })); world.scene.add(line); tracers.push({ line, life: 0.07 });
      sfx.shot(); enemies.damage(e, 10, now, undefined, 'bullet'); }
  }
}
const LOOT: Record<string, { items: Partial<Record<B.ItemId, number>>; crowns: number; text: string }> = {
  mill_crate_1: { items: { flour: 2, honey: 1 }, crowns: 6, text: "The miller's crate: flour that stayed dry, a jar of honey, six crowns in a twist of cloth." },
  mill_crate_2: { items: { bandage: 2, ammo: 2, medkit: 1 }, crowns: 0, text: 'A Watch supply crate, sealed: two bandages, two boxes of rounds and a physician\'s kit.' },
  mill_crate_3: { items: { saltfish: 2, herbs: 2, tonic: 1 }, crowns: 25, text: 'Old offerings heaped around the millstone: coin, salt fish, herbs, a calming tonic.' },
  chapel_crate_1: { items: { draught: 1, ammo: 2, bandage: 1 }, crowns: 8, text: "The sexton's chest, swollen shut until you kick it: a healing draught, two boxes of rounds, linen, and the collection money." },
  chapel_crate_2: { items: { manadraught: 2, honey: 1 }, crowns: 0, text: 'The reliquary box holds no relics. Two mana draughts and a jar of altar honey, forty years sealed.' },
  chapel_crate_3: { items: { cinder: 2, draught: 1 }, crowns: 30, text: 'Behind the altar: the plate, two coals that will never cool, and a draught somebody left for the last brother.' },
};
// ---------------- v0.7: the Eastern Reach ----------------
// Copper Hollow (the mine), its Warden Engine, and everything you can do out east: the coach, the inn,
// the bathhouse, the Lodge, fishing, mining, gathering, Bluebell the ewe, the toll, the wolves at the fold.
const engine = new WardenEngine(world.scene, enemies, world.colliders, world.mine.arena.clone().add(new THREE.Vector3(0, 0, -2)), {
  hurtPlayer: amt => hurtPlayer(amt, 'engine'),
  feed: text => { feed.push(s, 'engine:' + text.slice(0, 14), text, 'combat', 3, 2); },
  sound: (n, pan) => { const f = (sfx as any)[n]; if (typeof f === 'function') f.call(sfx, pan); },
  defeated: () => { S.setFlag(s, 'engineDown'); s.inventory.wardcore++; G.addXp(s, 'marksman', 40); G.addXp(s, 'spellcraft', 40); sfx.good(); hud.fade('The Warden Engine falls silent', 1500); G.log(s, 'The Engine kneels, and the light goes out of its eyes. Its heart, still warm, comes away in your hands. Behind it, the seam glows.', 'good'); save(); },
  spawnHollow: at => { const e = enemies.spawn('hollow', at, 'engine_call'); e.state = 'chase'; },
  playerOnGround: () => player.onGround && player.pos.y < 0.15,
  shake: k => { player.trauma = Math.min(1, player.trauma + k); },
  push: (dx, dz) => { const [x, z] = collide(world.colliders, player.pos.x + dx, player.pos.z + dz, 0.35, player.pos.y); player.pos.x = x; player.pos.z = z; player.vy = 3; player.onGround = false; },
});
function spawnMine() {
  if (enemies.list.some(e => e.tag === 'mine')) return;
  const O = world.mine.origin, at = (x: number, z: number) => O.clone().add(new THREE.Vector3(x, 0, z));
  const place = (x: number, z: number) => { const e = enemies.spawn('hollow', at(x, z), 'mine'); e.pos.copy(at(x, z)); e.wanderTarget.copy(e.pos); e.yaw = Math.random() * 6; return e; };
  place(-6, 4); place(5, 10);
  if (!S.flag(s, 'engineDown')) { place(7, -2); place(-2, -18); place(2, -26); place(-1.5, -14); }
}
function goMine(enter: boolean) {
  if (busy()) return;
  sfx.ui();
  hud.fade(enter ? 'You duck under the timbers into the dark…' : 'You walk back up toward the daylight…', 900).then(() => {
    if (enter) {
      player.pos.copy(world.mine.spawn); player.yaw = 0; world.setDungeon('mine'); spawnMine();
      if (!S.flag(s, 'mineEntered')) { S.setFlag(s, 'mineEntered'); G.log(s, 'Copper Hollow. The air tastes of metal and old smoke. Somewhere deep below, very slowly, something goes bang, bang, bang.', 'warn'); }
      if (!(s.gear.lantern)) feed.push(s, 'mineDark', 'It is dark down here. A hand lantern would help (Dorran sells them).', 'explore', 2, 1);
    } else {
      player.pos.copy(world.mine.outside); player.yaw = Math.PI; world.setDungeon(null); engine.reset();
      for (const e of [...enemies.list]) if (e.tag === 'mine' || e.tag === 'engine_call') enemies.remove(e);
    }
    player.vy = 0; S.updateQuests(s); save();
  });
}
// ---- fishing: cast, wait for the bite, strike in time ----
let fishing: null | { spot: R.FishSpot; t: number; wait: number; window: number; phase: 'wait' | 'bite' } = null;
function startFishing(it: Interactable) {
  if (s.inventory.rod <= 0) { G.log(s, it.pos.z > 300 ? 'You need a fishing rod. Pasco Hendy and Tegen Rowse sell them on Gullhaven quay.' : it.pos.x < -200 ? 'You need a fishing rod. Marra Quill and Ebba Rook sell them in Fernhollow.' : 'You need a fishing rod. Oskar Penn sells them on the Ashford docks.', 'warn'); sfx.bad(); return; }
  const spot: R.FishSpot = it.id === 'fish_pond' ? 'pond' : it.id === 'fish_lake' ? 'lake' : it.id === 'fish_marsh' ? 'marsh' : it.id === 'fish_sea' ? 'sea' : 'river';
  const tm = R.fishTiming(s, spot);
  fishing = { spot, t: 0, wait: tm.wait, window: tm.window, phase: 'wait' };
  player.action = { clip: 'fish', t: 0, dur: 9999, facing: it.facing, upper: false }; if (it.facing !== undefined) player.yaw = it.facing;
  vm.play('fish', 9999); sfx.ui();
  feed.push(s, 'fishWait', 'You cast and wait. Click the moment something bites. (Move to stop.)', 'explore', 2, 0);
}
function endFishing() { fishing = null; if (player.action?.clip === 'fish') player.action = null; vm.play('none', 0); }
function strikeFish() {
  if (!fishing) return;
  const ok = fishing.phase === 'bite';
  vm.play('reel', 1.0); const spot = fishing.spot; fishing = null; if (player.action?.clip === 'fish') player.action = null;
  const text = R.landFish(s, spot, ok); feed.push(s, 'fish' + Math.random(), text, 'explore', 2, 0); if (ok) sfx.pickup(); else sfx.ui();
}
function updateFishing(dt: number) {
  if (!fishing) return;
  if (player.moving || player.action?.clip !== 'fish') { endFishing(); return; }
  fishing.t += dt;
  if (fishing.phase === 'wait' && fishing.t >= fishing.wait) { fishing.phase = 'bite'; fishing.t = 0; sfx.water(); hud.hitmarker(); feed.push(s, 'bite', 'The float plunges! Click!', 'explore', 3, 0); vm.play('fish', 9999); }
  else if (fishing.phase === 'bite' && fishing.t > fishing.window) { const spot = fishing.spot; endFishing(); feed.push(s, 'missFish', R.landFish(s, spot, false), 'explore', 2, 0); }
}
// ---- Bluebell, Nell's ewe ----
const EWE_HOME = new THREE.Vector3(154.5, 0, -79);
const ewe = (() => {
  const g = new THREE.Group(), wool = new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 1, flatShading: true }), dark = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 1, flatShading: true });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.9), wool); b.position.y = 0.65; g.add(b);
  const hd = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.34), dark); hd.position.set(0, 0.85, -0.55); g.add(hd);
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ color: 0xffcc33 })); tag.position.set(0.15, 0.98, -0.5); g.add(tag);
  const legs: THREE.Mesh[] = []; for (const [x, z] of [[-0.18, -0.3], [0.18, -0.3], [-0.18, 0.3], [0.18, 0.3]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 4), dark); l.position.set(x, 0.23, z); g.add(l); legs.push(l); }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  g.position.copy(EWE_HOME); world.scene.add(g);
  const it = world.interact('ewe', EWE_HOME.x, EWE_HOME.z + 0.9, 'Loop your belt round Bluebell\'s neck', 'pick', 1.6);
  world.places.ewe = EWE_HOME.clone();
  return { g, legs, it, ph: 0 };
})();
function updateEwe(dt: number) {
  const st = s.quests.eq5; const following = st?.state === 'active' && st.stage === 1;
  const waiting = st?.state === 'active' && st.stage === 0;
  ewe.g.visible = waiting || following; ewe.it.hidden = !waiting;
  if (!ewe.g.visible) return;
  if (waiting) { ewe.g.position.copy(EWE_HOME); ewe.g.rotation.y = Math.sin(now * 0.3) * 0.5; return; }
  const d = new THREE.Vector3(player.pos.x - ewe.g.position.x, 0, player.pos.z - ewe.g.position.z), dist = d.length();
  if (dist > 25) { ewe.g.position.copy(player.pos).add(new THREE.Vector3(1.5, 0, 1.5)); return; }
  if (dist > 1.8) { const step = Math.min(dist - 1.8, (dist > 5 ? 4.2 : 2.5) * dt); ewe.g.position.addScaledVector(d.normalize(), step); ewe.g.rotation.y = Math.atan2(-d.x, -d.z); ewe.ph += step * 9; ewe.legs.forEach((l, i) => { l.rotation.x = Math.sin(ewe.ph + (i % 2 ? Math.PI : 0)) * 0.4; }); }
}
// ---- the wolves at the fold, and the toll garrison ----
const FOLD = new THREE.Vector3(112, 0, -4), TOLL = new THREE.Vector3(176, 0, 36);
function reachEvents() {
  const h = G.hour(s), night = h >= 20 || h < 4;
  const fold = s.quests.eq4;
  if (fold?.state === 'active' && fold.stage === 0 && !S.flag(s, 'foldDone') && night && player.pos.distanceTo(FOLD) < 28 && !enemies.list.some(e => e.tag === 'fold')) {
    for (let i = 0; i < 4; i++) { const e = enemies.spawn('wolf', new THREE.Vector3(138 + i * 1.5, 0, -18 - i), 'fold'); e.state = 'chase'; }
    feed.push(s, 'foldWolves', 'Eyes at the edge of Thornwood, low to the ground. Four of them. The sheep start to scream.', 'combat', 3, 0); sfx.growl(0);
  }
  const toll = s.quests.eq6;
  if (toll?.state === 'active' && toll.stage === 0 && !S.flag(s, 'tollCleared') && player.pos.distanceTo(TOLL) < 70 && !enemies.list.some(e => e.tag === 'toll')) {
    for (const [dx, dz] of [[-4, 2], [4, 0], [0, 8], [-6, 9], [6, 6]]) enemies.spawn('bandit', TOLL.clone().add(new THREE.Vector3(dx, 0, dz)), 'toll');
  }
}
function reachEnemyDown(e: Enemy) {
  if (e.tag === 'fold' && !enemies.list.some(x => x.alive && x.tag === 'fold' && x !== e)) { S.setFlag(s, 'foldDone'); sfx.good(); G.log(s, 'The last wolf limps back into Thornwood. Behind you, Hobb\'s sheep go quiet, one by one.', 'good'); }
  if (e.tag === 'toll' && !enemies.list.some(x => x.alive && x.tag === 'toll' && x !== e)) {
    S.setFlag(s, 'tollCleared'); sfx.good(); G.log(s, 'The last of the toll gang drops his crossbow and runs for the hills. The road east is open.', 'good');
    for (const x of [...enemies.list]) if (x.alive && x.tag === null && x.kind === 'bandit') { x.state = 'return'; x.hp = 0; x.state = 'dead'; x.deadT = 6; }
  }
}
// ---- interactions out east ----
function reachInteract(it: Interactable): boolean {
  const id = it.id, once = (flag: string) => { if (S.flag(s, flag)) return false; S.setFlag(s, flag); return true; };
  if (id === 'coach_mb' || id === 'coach_ash') {
    const to = id === 'coach_mb' ? 'ashford' : 'millbrook';
    if (to === 'ashford' && !s.discovered.includes('place:ashford') && !S.questActive(s, 'eq1')) { G.log(s, 'The coach post is empty. A chalked board says: "ASHFORD COACH, 7 TO 20. ASK JOSS." Nobody has asked Joss to come this far yet.', 'info'); }
    RU.openCoach(ui, to, () => { if (!R.takeCoach(s, to)) return; sfx.coin(); hud.fade(to === 'ashford' ? 'The coach rattles east…' : 'The coach rattles west…', 1200).then(() => { player.pos.copy(to === 'ashford' ? world.places.coach_ash : world.places.coach_mb); player.yaw = to === 'ashford' ? -Math.PI / 2 : Math.PI / 2; player.vy = 0; S.updateQuests(s); save(); relock(); }); });
    return true;
  }
  if (id === 'inn_bed') {
    if (s.crowns < B.INN_ROOM_COST) { G.log(s, `Wenna's beds are ${B.INN_ROOM_COST} crowns. You do not have it.`, 'warn'); sfx.bad(); return true; }
    const hh = G.hour(s);
    station(it, { clip: 'sleep', dur: 2.2, fp: 'none', fade: hh >= 18 || hh < 6 ? 'You sleep in a borrowed bed until morning…' : 'You nap in the back room…', then: () => { if (R.innSleep(s) !== false) sfx.ui(); } });
    return true;
  }
  if (id === 'inn_bar') { RU.openInn(ui); return true; }
  if (id === 'bath') {
    if (s.crowns < B.BATH_COST) { G.log(s, `The bath is ${B.BATH_COST} crowns.`, 'warn'); sfx.bad(); return true; }
    station(it, { clip: 'bathe', dur: 3.0, fp: 'none', fade: 'You sink into the hot water up to the chin…', sound: () => sfx.water(), then: () => { if (R.bathe(s)) sfx.good(); } });
    return true;
  }
  if (id === 'lodge_board') { openBoard(true); return true; }
  if (id === 'lodge_stores') { RU.openTrader(ui, 'lodge', 'The Lodge quartermaster unlocks the stores.'); return true; }
  if (id === 'fountain' || id === 'farm_well') { station(it, { clip: 'drink', dur: 1.6, fp: 'drink', sound: () => sfx.water(), then: () => { G.drink(s, 'well'); } }); return true; }
  if (id === 'farm_hearth') { station(it, { clip: 'kneel', dur: 2.4, fp: 'none', then: () => { feed.push(s, 'hearthFarm', R.warmAtHearth(s), 'explore', 2, 0); sfx.good(); } }); return true; }
  if (id === 'orchard') {
    if (S.flag(s, 'orchardDay') === G.day(s)) { G.log(s, 'You have had today\'s windfalls. The rest are wasps\' business.', 'info'); return true; }
    station(it, { clip: 'pick', dur: 1.4, fp: 'interact', then: () => { S.setFlag(s, 'orchardDay', G.day(s)); feed.push(s, 'apples', R.gather(s, 'apple'), 'explore', 1, 0); sfx.pickup(); } });
    return true;
  }
  if (id === 'hollow_oak') {
    station(it, { clip: 'interact', dur: 1.6, fp: 'interact', then: () => {
      if (once('oakSeen')) { s.inventory.charmOwl++; G.addXp(s, 'survival', 20); sfx.ward(); G.log(s, 'Inside the Hollow Oak, someone long ago carved a ring of runes into the heartwood, and someone less long ago left a gift on the root: an owl feather bound in copper wire. A charm. It is warm.', 'good'); }
      else G.log(s, 'The runes inside the Hollow Oak glow faintly. The wardwrights were here before the town was.', 'info');
    } });
    return true;
  }
  if (id === 'toll_chest') {
    if (enemies.list.some(e => e.alive && e.kind === 'bandit' && e.pos.distanceTo(it.pos) < 25)) { G.log(s, 'Not with crossbows trained on you.', 'warn'); return true; }
    station(it, { clip: 'pick', dur: 1.4, fp: 'interact', then: () => {
      if (once('tollChest')) { s.crowns += 30; s.inventory.carbineammo++; if (S.questActive(s, 'eq6')) s.inventory.ledgerpage++; sfx.coin(); G.log(s, `The toll chest: 30 crowns of other people's money, a box of carbine rounds${S.questActive(s, 'eq6') ? ', and a page of ledger in some kind of code' : ''}.`, 'good'); S.updateQuests(s); }
      else G.log(s, 'Empty, except for a dead spider.', 'info');
    } });
    return true;
  }
  if (id === 'gun_bench') { station(it, { clip: 'interact', dur: 1.6, fp: 'interact', sound: () => sfx.reload(), then: () => { s.revolverCond = 100; G.advanceMinutes(s, 10, 'rest'); G.log(s, 'Corwin lets you use the bench. Rods, rags, a drop of oil: the revolver is like new.', 'good'); } }); return true; }
  if (id.startsWith('fish_')) { startFishing(it); return true; }
  if (id.startsWith('ore_') || id.startsWith('mine_ore_')) {
    if (s.inventory.pickaxe <= 0) { G.log(s, 'Green-veined rock. You would need a miner\'s pick (Mags the pedlar, or the Lodge stores).', 'warn'); sfx.bad(); return true; }
    if (S.flag(s, 'node:' + id) === G.day(s) + 1) { G.log(s, 'You have worked this seam out for today.', 'info'); return true; }
    station(it, { clip: 'mine', dur: 3.2, fp: 'mine', sound: () => { sfx.hit(); setTimeout(() => sfx.hit(), 900); setTimeout(() => sfx.hit(), 1800); }, then: () => { S.setFlag(s, 'node:' + id, G.day(s) + 1); feed.push(s, 'mine' + id, R.mine(s, id.startsWith('mine_ore_')), 'explore', 2, 0); sfx.pickup(); } });
    return true;
  }
  if (id.startsWith('shroom_') || id.startsWith('berry_')) {
    const kind = id.startsWith('shroom_') ? 'shroom' : 'berry';
    station(it, { clip: 'pick', dur: 1.2, fp: 'interact', then: () => { S.setFlag(s, 'node:' + id, G.day(s) * 2 + 2); it.hidden = true; feed.push(s, 'g' + id, R.gather(s, kind), 'explore', 1, 0); sfx.pickup(); G.count(s, 'gathered'); refreshNodes(); } });
    return true;
  }
  if (id === 'mine_door') {
    if (!s.discovered.includes('place:ashford') && !S.flag(s, 'mineEntered')) { G.log(s, 'Planks are nailed across the mine mouth: BY ORDER OF THE REEVE OF ASHFORD. Ask in Ashford before you break them.', 'info'); return true; }
    goMine(true); return true;
  }
  if (id === 'mine_exit') { goMine(false); return true; }
  if (id === 'mine_lift') {
    if (s.inventory.liftkey <= 0 && !S.flag(s, 'liftOpen')) { G.log(s, 'The lift cage is chained shut. The padlock is new, and wants a key. Brask\'s key, probably.', 'warn'); sfx.bad(); return true; }
    S.setFlag(s, 'liftOpen'); sfx.reload();
    hud.fade('The cage drops into the dark, rattling on its chains…', 1100).then(() => { player.pos.copy(world.mine.deep); player.yaw = 0; player.vy = 0; relock(); });
    return true;
  }
  if (id === 'mine_lift_up') { sfx.reload(); hud.fade('The cage grinds back up…', 900).then(() => { player.pos.copy(world.places.mine_lift).add(new THREE.Vector3(-1.5, 0, 0)); player.yaw = Math.PI / 2; player.vy = 0; relock(); }); return true; }
  if (id === 'mine_waystone') { if (!S.flag(s, 'mineCheckpoint')) { S.setFlag(s, 'mineCheckpoint'); sfx.ward(); G.log(s, 'You light the old waystone. Copper light runs along the veins in the walls. If you fall below, you will wake here.', 'good'); save(); } else G.log(s, 'The waystone burns steady.', 'info'); return true; }
  if (id.startsWith('mine_note_')) {
    const notes: Record<string, string> = {
      mine_note_1: 'The shift board, in chalk: "DAY 1: broke into old gallery. DAY 2: found worked stone, very old. DAY 3: BRASK SAYS NOBODY PAST THE VAULT DOOR. DAY 4: …" The rest is wiped away by a hand.',
      mine_note_2: 'A journal, under a fallen prop: Foreman Brask\'s. The last page: "It is not a machine. It is a guard. We woke it by cutting into what it guards. Front is stone a hand thick. The light is in its back. Tell Sela I am sorry about the noise I make coming in late."',
      mine_note_3: 'Carved over the vault door, in the old ward-script, and under it in common: "HERE THE STONES WERE CUT. HERE THE CUTTING STOPS. LEAVE THE SEAM SLEEPING, OR LEAVE IT WATCHED." Below, smaller, a maker\'s mark: a tower, and the letter V.',
    };
    station(it, { clip: 'interact', dur: 1.3, fp: 'interact', then: () => { G.log(s, notes[id] ?? '', 'info'); if (id === 'mine_note_2' && once('journalFound')) { s.inventory.journal++; S.setFlag(s, 'journalRead'); sfx.quest(); } S.updateQuests(s); } });
    return true;
  }
  if (id.startsWith('mine_crate_')) {
    station(it, { clip: 'pick', dur: 1.3, fp: 'interact', then: () => {
      if (!once('crate:' + id)) { G.log(s, 'Empty.', 'info'); return; }
      if (id === 'mine_crate_1') { s.inventory.ration += 2; s.inventory.bandage++; if (s.inventory.pickaxe <= 0) s.inventory.pickaxe++; G.log(s, 'Miners\' stores: two rations, a bandage and a pick nobody will be coming back for.', 'good'); }
      if (id === 'mine_crate_2') { s.inventory.draught++; s.inventory.carbineammo++; s.inventory.ammo++; G.log(s, 'Brask\'s emergency box: a healing draught and rounds for two kinds of gun.', 'good'); }
      if (id === 'mine_crate_3') { s.inventory.wardcopper += 2; s.inventory.charmCopper++; s.crowns += 40; G.log(s, 'The wardwrights\' chest: two bars of ward-copper, a coil charm of the same, and old coins that Corwin will take by weight (40 crowns).', 'good'); }
      sfx.pickup();
    } });
    return true;
  }
  if (id === 'vault_seam') {
    if (!S.flag(s, 'engineDown')) { G.log(s, 'The seam hums behind the Engine. Not while it stands.', 'warn'); return true; }
    if (S.flag(s, 'seamFate')) { G.log(s, S.flag(s, 'seamFate') === 1 ? 'The sealed seam glows steady, and the Engine sleeps before it.' : S.flag(s, 'seamFate') === 2 ? 'A chalked guild mark on the rock. The miners will be back within the week.' : 'An empty socket in the rock where the heart sat. The Tower\'s men will come for the rest.', 'info'); return true; }
    RU.openSeam(ui, fate => { if (S.decideSeam(s, fate)) { sfx.ward(); S.updateQuests(s); save(); } relock(); });
    return true;
  }
  if (id === 'lift_house') { G.log(s, 'The winding gear is seized solid; someone has jammed it with a pick handle and run. The cage inside the mine will have to be worked by its own hand-winch.', 'info'); return true; }
  if (id === 'miner_camp') {
    station(it, { clip: 'pick', dur: 1.4, fp: 'interact', then: () => { if (once('minerCamp')) { s.inventory.ration++; if (s.inventory.pickaxe <= 0) s.inventory.pickaxe++; G.log(s, 'Cold fires, half-eaten bread, boots left by the tents as if their owners meant to come back for them. You take a ration and a spare pick. A note in a child\'s hand is pinned to a tent pole: "TAM COME HOME."', 'warn'); sfx.pickup(); } else G.log(s, 'Nothing else here but the quiet.', 'info'); } });
    return true;
  }
  if (id === 'ewe') {
    if (S.questActive(s, 'eq5') && s.quests.eq5.stage === 0) station(it, { clip: 'pick', dur: 1.2, fp: 'interact', then: () => { S.setFlag(s, 'eweFound'); s.carryingCrate = true; sfx.good(); G.log(s, 'Bluebell! Muddy, indignant, one ear tagged. She lets you loop your belt round her neck and then sets a pace of her own. (She will not be hurried: no running, no map.)', 'good'); S.updateQuests(s); } });
    return true;
  }
  return false;
}
// ---------------- v0.8: the Westmarch ----------------
// The West Gate, the heath, the Smeaths' camp, the Barrow Downs and what walks there at night, Fernhollow,
// the reed marsh, and the Barrow of King Orm with its braziers and its king (docs/gdd/westmarch.md).
const barrowKing = new BarrowKing(world.scene, enemies, world.colliders, world.barrow.bier.clone().add(new THREE.Vector3(0, 0, 4.5)), world.barrow, {
  hurtPlayer: amt => hurtPlayer(amt, 'orm'),
  feed: text => { feed.push(s, 'orm:' + text.slice(0, 14), text, 'combat', 3, 2); },
  sound: (n, pan) => { const f = (sfx as any)[n]; if (typeof f === 'function') f.call(sfx, pan); },
  defeated: () => {
    S.setFlag(s, 'ormDown'); s.inventory.ormcrown = 1; G.addXp(s, 'marksman', 40); G.addXp(s, 'spellcraft', 40); sfx.good(); hud.fade('King Orm kneels, and is still', 1500);
    G.log(s, 'The Barrow-King goes down on both knees and bows his head, and the bronze and bone of him settle like a fire falling in. His crown rolls onto the bier. The braziers flare up white.', 'good');
    const bier = world.interactables.find(x => x.id === 'orm_bier'); if (bier) bier.hidden = false; S.updateQuests(s); save();
  },
  spawnWight: at => { const e = enemies.spawn('wight', at, 'orm_call', false, true); e.state = 'chase'; },
  shake: k => { player.trauma = Math.min(1, player.trauma + k); },
  darkness: on => { world.barrowDark = on; },
});
let barrowWoke = { ante: false, hall: false };
function syncBarrow() {
  for (const i of [1, 2, 3]) world.barrow.light('hall_brazier_' + i, S.flag(s, 'hallBrazier' + i) > 0);
  if (S.flag(s, 'hallLit')) world.barrow.openSlab(true); else world.barrow.closeSlab();
  for (const b of world.barrow.braziers) if (!b.hall) world.barrow.light(b.id, true);
  const bier = world.interactables.find(x => x.id === 'orm_bier'); if (bier) bier.hidden = !S.flag(s, 'ormDown');
  if (S.flag(s, 'westGateOpen')) world.west.openGate(true); else world.west.closeGate();
}
function goBarrow(enter: boolean) {
  if (busy()) return;
  if (enter && !W.enterBarrow(s)) { G.log(s, W.barrowBlock(s), 'warn'); sfx.bad(); return; }
  sfx.ui();
  hud.fade(enter ? 'You put your shoulder to the stone and it gives. Cold breathes out of the hill…' : 'You climb back out into the air…', 1000).then(() => {
    if (enter) {
      player.pos.copy(world.barrow.spawn); player.yaw = 0; world.setDungeon('barrow'); barrowWoke = { ante: false, hall: false }; syncBarrow();
      if (!s.gear.lantern) feed.push(s, 'barrowDark', 'It is very dark under the hill. A hand lantern would help, and would light the old braziers (Tobin Crake sells them).', 'explore', 2, 1);
    } else {
      player.pos.copy(world.barrow.outside); player.yaw = Math.PI; world.setDungeon(null); barrowKing.reset(); world.barrowDark = false;
      for (const e of [...enemies.list]) if (e.tag === 'barrow' || e.tag === 'orm_call') enemies.remove(e);
    }
    player.vy = 0; S.updateQuests(s); save();
  });
}
function barrowTick(dt: number) {
  const B0 = world.barrow, p = player.pos;
  if (!S.flag(s, 'ormDown')) {
    if (!barrowWoke.ante && p.z < B0.origin.z + 17) {
      barrowWoke.ante = true;
      for (const a of B0.ante) { const e = enemies.spawn('wight', a, 'barrow', false, true); e.pos.copy(a); e.wanderTarget.copy(a); e.yaw = a.x < B0.origin.x ? -Math.PI / 2 : Math.PI / 2; }
      feed.push(s, 'anteRise', 'Something in the niches moves. Earth pours off it as it stands up.', 'combat', 3, 0); sfx.growl(0);
    }
    if (!barrowWoke.hall && p.z < B0.hallMid.z + 3 && !S.flag(s, 'hallLit')) {
      barrowWoke.hall = true;
      B0.coffins.filter((_, i) => i % 2 === 0).forEach(c => { const e = enemies.spawn('wight', c, 'barrow', false, true); e.pos.copy(c); e.wanderTarget.copy(c); e.state = 'chase'; });
      feed.push(s, 'hallRise', 'Stone grates on stone. Three of the coffin lids slide aside, and the kings of the hill sit up.', 'combat', 3, 0); sfx.growl(0); player.trauma = Math.min(1, player.trauma + 0.25);
    }
    if (!barrowKing.dead && !barrowKing.active && S.flag(s, 'hallLit') && B0.inChamber(p)) barrowKing.wake();
  }
  barrowKing.update(dt, now, p, !busyCollapse);
}
function lightBrazier(id: string, how: 'lantern' | 'fire'): boolean {
  const b = world.barrow.braziers.find(x => x.id === id); if (!b || b.lit) return false;
  world.barrow.light(id, true); sfx.ward(); puff(b.pos.clone().setY(1.4), 0xffa050, 0.5);
  if (b.hall) {
    const opened = W.lightHallBrazier(s, Number(id.slice(-1)) as 1 | 2 | 3);
    G.log(s, `The old charcoal catches${how === 'fire' ? ' from your Firebolt' : ''} and burns up blue, then gold. (${W.hallLitCount(s)}/3)`, 'info');
    if (opened) { world.barrow.openSlab(); player.trauma = Math.min(1, player.trauma + 0.3); sfx.quest(); G.log(s, 'With the third fire lit, the slab at the end of the hall shudders and sinks into the floor. Cold air breathes out of the dark beyond it.', 'good'); }
    S.updateQuests(s); save();
  } else feed.push(s, 'relit' + id, barrowKing.active && !barrowKing.dead ? `The brazier roars back to life and King Orm turns from it. (${barrowKing.lit}/4 lit)` : 'The brazier burns again.', 'combat', 3, 0);
  return true;
}
// what walks at night: the Downs (wights and grave-lights) and the marsh (the drowned), until dawn
let westNight = -1, gorseSpawned = false;
function westEvents() {
  if (world.dungeon || !S.flag(s, 'westGateOpen')) return;
  const h = G.hour(s), night = W.isNightHour(h), p = player.pos, ring = world.west.ring;
  const nightId = G.day(s) - (h < 5 ? 1 : 0);
  if (night && westNight !== nightId && p.x < -56) {
    westNight = nightId;
    const n = W.nightSpawns(s), near = (v: THREE.Vector3) => v.distanceTo(p) < 45;
    const spots = [new THREE.Vector3(ring.x - 10, 0, ring.z + 8), new THREE.Vector3(ring.x + 14, 0, ring.z + 22), new THREE.Vector3(-176, 0, -48)];
    for (let i = 0; i < n.wights; i++) enemies.spawn('wight', spots[i % spots.length], 'night', false, near(spots[i % spots.length]));
    for (let i = 0; i < n.wisps; i++) { const v = new THREE.Vector3(ring.x - 8 + i * 7, 0, ring.z - 6 + (i % 2) * 12); enemies.spawn('wisp', v, 'night', false, near(v)); }
    for (let i = 0; i < n.drowned; i++) enemies.spawn('drowned', world.sites.reed_marsh.clone().add(new THREE.Vector3(i * 7 - 3, 0, i * 5)), 'night');
    if (p.distanceTo(ring) < 80 && n.wights + n.wisps > 0) feed.push(s, 'nightDowns', 'Out on the Downs, lights rise from the barrows, one after another, and drift toward the stones.', 'combat', 2, 0);
  }
  if (!night) for (const e of enemies.list) if (e.tag === 'night' && e.alive && e.sinkT === 0) enemies.sink(e);
  // Smoke on the Heath: three lights circle Gorse at the Ring of Nine after dark
  const g = s.quests.wq3;
  if (g?.state === 'active' && g.stage === 0 && !S.flag(s, 'gorseFreed') && night && p.distanceTo(ring) < 26 && !gorseSpawned) {
    gorseSpawned = true;
    for (let i = 0; i < 3; i++) { const a = i * 2.1; enemies.spawn('wisp', new THREE.Vector3(ring.x + Math.cos(a) * 4, 0, ring.z + 1.8 + Math.sin(a) * 4), 'gorse', false, true); }
    feed.push(s, 'gorseLights', 'Three lights come down off the barrows and circle Gorse, low and slow. He smiles up at them like a child.', 'combat', 3, 0); sfx.hiss(0);
  }
  if (gorseSpawned && !S.flag(s, 'gorseFreed') && !enemies.list.some(e => e.tag === 'gorse' && e.alive)) {
    S.setFlag(s, 'gorseFreed'); gorseSpawned = false; sfx.good(); S.updateQuests(s); save();
    G.log(s, 'The last light goes out. Gorse Smeath blinks, looks at his hands, and says, quite clearly, "I\'m cold." Then he gets up and starts walking home.', 'good');
  }
}
function westEnemyDown(e: Enemy) { void e; }
// ---------------- v0.9.3: the Saltway Coast ----------------
// The Salt Gap and Dorran's charge, the tide over the flats, Gullhaven's services, the Gull Tower, the customs
// house, Wreckers' Cove, and the Sea Cave with the Wreck-Mother (docs/gdd/saltway.md). Rules live in sim/south.ts.
let fuseRemaining = B.BLAST.fuse as number, fuseSpark = 0, tideWarned = -1, coastWading = false, coastWadeK = 1, slowUntil = 0;
let caveGuards = false, floodTarget = 0, wadeK = 0.62;
const mother = new WreckMother(world.scene, enemies, world.colliders, world.seacave.grotto.clone(), world.seacave, {
  hurtPlayer: amt => hurtPlayer(amt, 'mother'),
  slowPlayer: secs => { slowUntil = Math.max(slowUntil, now + secs); },
  feed: text => { feed.push(s, 'mother:' + text.slice(0, 14), text, 'combat', 3, 2); },
  sound: (n, pan) => { const f = (sfx as any)[n]; if (typeof f === 'function') f.call(sfx, pan); },
  defeated: () => { coast.motherDown(s); G.addXp(s, 'marksman', 40); G.addXp(s, 'spellcraft', 40); sfx.good(); hud.fade('The Wreck-Mother sinks into the pool', 1500); S.updateQuests(s); save(); },
  spawnCrab: at => { const e = enemies.spawn('crab', at, 'mother_call', false, true); e.state = 'chase'; },
  shake: k => { player.trauma = Math.min(1, player.trauma + k); },
  flood: on => { floodTarget = on ? 1 : 0; },
});
const caveTags = new Set(['seacave', 'mother_call']);
world.places.grotto = world.seacave.grotto.clone();                 // sq2's last stage points here (the cave mouth from outside)
/** Show the quest items that are still in the world, hide the ones you have taken. */
const coastProps: Record<string, THREE.Object3D | undefined> = {};
for (const n of ['wreckBell', 'wreckBellYoke', 'signalLantern', 'wrenBell']) coastProps[n] = world.scene.getObjectByName(n);
function syncCoastProps() {
  const show = (n: string, v: boolean) => { const o = coastProps[n]; if (o && o.visible !== v) o.visible = v; };
  show('wreckBell', !S.flag(s, 'bellTaken')); show('signalLantern', !S.flag(s, 'lanternFound')); show('wrenBell', S.flag(s, 'bellRung') > 0);
  const bell = world.interactables.find(i => i.id === 'wreck_bell'); if (bell) bell.hidden = S.flag(s, 'bellTaken') > 0;
  const lan = world.interactables.find(i => i.id === 'tower_lantern'); if (lan) lan.hidden = S.flag(s, 'lanternFound') > 0;
  if (S.flag(s, 'saltGapOpen')) world.south.openGap(true); else world.south.closeGap();
}
function goSeaCave(enter: boolean) {
  if (busy()) return;
  if (enter && !coast.enterCave(s)) { G.log(s, coast.caveBlock(s), 'warn'); sfx.bad(); return; }
  sfx.ui();
  hud.fade(enter ? 'The grille swings in on its chain. Salt water drips from the roof as you go under the cliff…' : 'You walk back out toward the grey light and the gulls…', 1000).then(() => {
    if (enter) { player.pos.copy(world.seacave.spawn); player.yaw = 0; world.setDungeon('seacave'); caveGuards = false; }
    else { player.pos.copy(world.places.cave_mouth); player.yaw = -Math.PI / 2; world.setDungeon(null); leaveSeaCave(); }
    player.vy = 0; S.updateQuests(s); save();
  });
}
/** Leaving (or dying in) the cave: the boss heals, the grotto drains and the guards go back to their posts. */
function leaveSeaCave() {
  mother.reset(); floodTarget = 0; world.seacave.setFlood(0); caveGuards = false;
  for (const e of [...enemies.list]) if (e.tag && caveTags.has(e.tag)) enemies.remove(e);
}
function seaCaveTick(dt: number) {
  const C = world.seacave, p = player.pos;
  if (!caveGuards && C.inStore(p) && !S.flag(s, 'motherDown')) {
    caveGuards = true; const O = C.origin;
    const at = (x: number, z: number) => O.clone().add(new THREE.Vector3(x, 0, z));
    for (const [k, x, z] of [['smuggler', -6, -24], ['smuggler', 5, -28], ['pistoleer', 0, -32]] as [EnemyKind, number, number][]) { const e = enemies.spawn(k, at(x, z), 'seacave', false, true); e.pos.copy(at(x, z)); e.wanderTarget.copy(e.pos); e.state = 'chase'; }
    feed.push(s, 'caveStore', 'Lamplight, crates and voices. "Who left the grille open?" Three of them, and one has a pistol.', 'combat', 3, 0); sfx.shout(0);
  }
  if (!mother.dead && !mother.active && C.inGrotto(p) && !S.flag(s, 'motherDown')) mother.wake();
  mother.update(dt, now, p, !busyCollapse);
  if (C.floodLevel !== floodTarget) { const rate = floodTarget > C.floodLevel ? 1 / 6 : 1 / 3; C.setFlood(C.floodLevel + Math.sign(floodTarget - C.floodLevel) * Math.min(Math.abs(floodTarget - C.floodLevel), dt * rate)); }
  C.animate(dt, now);
  if (C.floodLevel > 0.3 && C.inGrotto(p) && !C.onPlatform(p)) { coastWading = true; coastWadeK = coast.wadeMult(s); }
}
function blowTheGap() {
  const dist = player.pos.distanceTo(world.south.charge);
  const damage = coast.blowGap(s, dist);
  world.south.openGap(); sfx.thunder(); player.trauma = Math.min(1, player.trauma + (dist < 40 ? 1 - dist / 50 : 0.1));
  for (let i = 0; i < 14; i++) puff(world.south.charge.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0.4 + Math.random() * 4, (Math.random() - 0.5) * 6)), i % 2 ? 0xb8a890 : 0x8a8070, 0.6 + Math.random() * 0.8);
  if (damage) hurtPlayer(damage, 'rockfall');
  S.updateQuests(s); save();
}
function updateCoast(dt: number) {
  coastWading = false;
  if (S.flag(s, 'chargeSet')) {
    fuseRemaining -= dt; fuseSpark -= dt;
    if (fuseSpark <= 0) { fuseSpark = 0.18; puff(world.south.charge.clone().setY(0.35 + Math.random() * 0.2), 0xffc060, 0.08); }
    if (fuseRemaining <= 4 && fuseRemaining + dt > 4) feed.push(s, 'fuseHalf', 'The fuse fizzes down into the rocks. Four seconds.', 'combat', 3, 0);
    if (fuseRemaining <= 0) blowTheGap();
  }
  if (world.dungeon === 'seacave') { seaCaveTick(dt); return; }
  if (player.pos.z < 136 || world.dungeon) return;
  world.south.setTide(coast.tideAt(s));
  world.south.animate(dt, now, player.pos, world.night);
  // the tide over the flats (saltway.md §4): wade on the near flats while the water is on them, a warning half an
  // hour before it comes back, and on the far flats the returning water carries you to the shore
  if (inFlats(player.pos)) {
    const lw = coast.lowWaterId(s);
    if (coast.floodWarning(s) && tideWarned !== lw && inDeepFlats(player.pos)) { tideWarned = lw; feed.push(s, 'tideWarn', `The tide has turned. The water will be back over the far flats in about ${coast.minutesToFlood(s)} minutes. Head for the shore.`, 'survival', 3, 0); sfx.bell(); hud.fade('The tide is turning', 900); }
    if (inDeepFlats(player.pos) && !coast.flatsExposed(s) && !busyCollapse) {
      const [x, z] = collide(world.colliders, player.pos.x, FLATS.minZ + 3, 0.35, 0);
      player.pos.set(x, 0, z); player.vy = 0; player.yaw = 0; coast.tideCarry(s); sfx.water(); hud.fade('The sea takes your feet…', 900); save();
    } else if (coast.wadingOnFlats(s)) { coastWading = true; coastWadeK = coast.wadeMult(s); }
  }
}
const COAST_PLACES: { id: string; name: string; text: string; r: number }[] = [
  { id: 'saltway', name: 'the carter\'s shrine', text: 'The Saltway, and Old Treloar\'s shrine to a saint nobody else has heard of. The road runs on down to the sea.', r: 16 },
  { id: 'gulltower', name: 'the Gull Tower', text: 'The Gull Tower: a ruined watchtower above the Saltway, with fresh boot-prints on the stair.', r: 18 },
  { id: 'gullhaven', name: 'Gullhaven', text: 'Gullhaven: a fishing port on a curved bay. The quay, the Anchor and Gull, the customs house, the fish auction, and gulls on every roof.', r: 30 },
  { id: 'lighthouse', name: 'the lighthouse', text: 'The lighthouse on the headland, and the keeper\'s cottage beside it.', r: 18 },
  { id: 'flats', name: 'the tidal flats', text: 'The tidal flats: wet sand, mussel beds and samphire, and far out, the broken hull of the Merry Wren.', r: 20 },
  { id: 'wreck', name: 'the wreck of the Merry Wren', text: 'The wreck of the Merry Wren, on her side in the sand. Her bell still hangs at the bow.', r: 12 },
  { id: 'cove', name: 'Wreckers\' Cove', text: 'Wreckers\' Cove: tents on the shingle, a cold fire, and a timber grille over a cave mouth in the cliff.', r: 18 },
];
const COAST_SITES_LIST: SiteId[] = ['saltway', 'gull_tower', 'tidal_flats', 'wreckers_cove'];
function discoverCoast() {
  if (world.dungeon || player.pos.z < 136) return;
  for (const p of COAST_PLACES) {
    const key = 'place:' + p.id; if (s.discovered.includes(key)) continue;
    const at = world.places[p.id]; if (!at) continue;
    if (player.pos.distanceTo(at) < p.r) { s.discovered.push(key); sfx.pickup(); feed.push(s, 'found' + p.id, `${p.text} (You can walk back here from the map.)`, 'explore', 3, 0); G.addXp(s, 'survival', 8); S.updateQuests(s); }
  }
  for (const site of COAST_SITES_LIST) {
    const id = 'cairn_' + site; if (s.discovered.includes(id)) continue;
    if (player.pos.distanceTo(world.places[id]) < 14) { s.discovered.push(id); feed.push(s, 'found' + id, `Found: the cairn at ${SITES[site].name}.`, 'explore', 2, 0); }
  }
}
function southInteract(it: Interactable): boolean {
  const id = it.id, once = (flag: string) => { if (S.flag(s, flag)) return false; S.setFlag(s, flag); return true; };
  const after = () => { S.updateQuests(s); syncCoastProps(); save(); };
  switch (id) {
    case 'rockfall':
      if (S.flag(s, 'chargeSet') || S.flag(s, 'saltGapOpen')) return true;
      if (s.inventory.blastcharge <= 0) { coast.setCharge(s); sfx.bad(); return true; }
      station(it, { clip: 'kneel', dur: 1.6, fp: 'interact', sound: () => sfx.reload(), then: () => { if (coast.setCharge(s)) { fuseRemaining = B.BLAST.fuse; sfx.hiss(0); hud.fade(`The fuse is lit · ${B.BLAST.fuse} seconds · get more than ${B.BLAST.far} m away`, 900); S.updateQuests(s); save(); } } });
      return true;
    case 'milestone_s': G.log(s, 'A salt-white milestone, its letters scoured by the wind: MILLBROOK II · GULLHAVEN VI. Somebody has chalked a gull on the top.', 'info'); return true;
    case 'shrine_s': station(it, { clip: 'kneel', dur: 2.0, fp: 'none', then: () => { s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 3); G.log(s, 'A wooden saint with a cartwheel in his hands, painted and repainted until he has no face. Pebbles of rock salt on the ledge. You leave one. The road feels a little shorter.', 'info'); } }); return true;
    case 'wreck_log': station(it, { clip: 'pick', dur: 1.4, fp: 'interact', then: () => { const had = S.flag(s, 'logFound'); G.log(s, coast.searchWreck(s), 'info'); if (!had && S.flag(s, 'logFound')) sfx.quest(); after(); } }); return true;
    case 'wreck_bell': station(it, { clip: 'pick', dur: 1.8, fp: 'interact', then: () => { const had = S.flag(s, 'bellTaken'); G.log(s, coast.takeBell(s), 'info'); if (!had && S.flag(s, 'bellTaken')) sfx.bell(); after(); } }); return true;
    case 'tower_lantern': station(it, { clip: 'pick', dur: 1.2, fp: 'interact', then: () => { const had = S.flag(s, 'lanternFound'); G.log(s, coast.takeLantern(s), 'info'); if (!had) sfx.quest(); after(); } }); return true;
    case 'customs_desk': station(it, { clip: 'interact', dur: 1.4, fp: 'interact', then: () => { const had = S.flag(s, 'ledgerFound'); G.log(s, coast.takeLedger(s), coast.marrowAtDesk(s) && !had ? 'warn' : 'info'); if (!had && S.flag(s, 'ledgerFound')) sfx.quest(); after(); } }); return true;
    case 'tide_table': S.setFlag(s, 'tideRead'); G.log(s, `Chalked on the harbour office board: ${coast.tideWord(s)}. Low water at 08:00 and 20:00; the flats are out about two hours either side. ${coast.flatsExposed(s) ? `The water is due back in about ${coast.minutesToFlood(s)} minutes.` : `Next low water in about ${Math.round(coast.minutesToLowWater(s) / 6) / 10} hours.`}`, 'info'); sfx.ui(); return true;
    case 'keeper_log': G.log(s, S.flag(s, 'trewinCleared') ? 'The keeper\'s log, in a careful hand: "Lamp lit 18:40. Wind SW, fresh. All well." On the last page someone has written in a different hand: "And so it was. B.C."' : 'The keeper\'s log, in a careful hand. On the night the Merry Wren struck: "Lamp lit 18:40. Wind NW, fresh. Lamp burning bright at 02:00. Saw a light at the Gull Tower, red, where no light should be."', 'info'); sfx.ui(); return true;
    case 'pump_s': station(it, { clip: 'drink', dur: 1.6, fp: 'drink', sound: () => sfx.water(), then: () => { G.drink(s, 'well'); } }); return true;
    case 'cave_mouth': goSeaCave(true); return true;
    case 'cave_exit': goSeaCave(false); return true;
    case 'cave_crate_1': case 'cave_crate_2':
      station(it, { clip: 'pick', dur: 1.3, fp: 'interact', then: () => {
        if (!once('crate:' + id)) { G.log(s, 'Empty now.', 'info'); return; }
        const l = coast.CAVE_LOOT[id]; for (const [k, n] of Object.entries(l.items)) s.inventory[k as B.ItemId] += n as number; s.crowns += l.crowns; G.count(s, 'crownsEarned', l.crowns); G.log(s, `${l.text} +${l.crowns} crowns.`, 'good'); sfx.coin(); save();
      } });
      return true;
    case 'inn_bar_s': RU.openTrader(ui, 'anchor', 'Jowan Penhale wipes the bar with the cloth off his shoulder. "Broth, cakes, salad, mackerel. Or a bed upstairs."'); return true;
    case 'inn_bed_s': {
      const cost = R.innCost(s, 'gullhaven');
      if (s.crowns < cost) { G.log(s, `A bed at the Anchor and Gull is ${cost} crowns. You do not have it.`, 'warn'); sfx.bad(); return true; }
      const hh = G.hour(s);
      station(it, { clip: 'sleep', dur: 2.2, fp: 'none', fade: hh >= 18 || hh < 6 ? 'You sleep to the sound of the sea on the harbour wall…' : 'You nap upstairs while the gulls argue on the roof…', then: () => { if (R.innSleep(s, 'gullhaven') !== false) sfx.ui(); } });
      return true;
    }
    case 'chandlery': RU.openTrader(ui, 'chandlery', 'Pasco Hendy, among coils of rope. "Oil, rope, rations, rounds. And a spyglass, if you have the coin."'); return true;
    case 'auction': RU.openTrader(ui, 'fishauction', 'Morwenna Kitto, over the slap of fish on the slab. "I pay best on the coast. Ask anyone. Ask the fish."'); return true;
    case 'shipwright': RU.openTrader(ui, 'shipwright', 'Tegen Rowse does not stop caulking. "Sea boots. Tarred to the thigh. You\'ll thank me on the flats."'); return true;
    case 'sea_chapel': station(it, { clip: 'kneel', dur: 2.6, fp: 'none', sound: () => sfx.bell(), then: () => { if (coast.blessing(s)) sfx.good(); } }); return true;
    case 'notice_coast': openBoard('coast'); return true;
    case 'fish_sea': startFishing(it); return true;
    default:
      if (id.startsWith('mussel_') || id.startsWith('samphire_')) {
        const kind = id.startsWith('mussel_') ? 'mussel' : 'samphire';
        const far = kind === 'mussel' && it.pos.z > FLATS.deep - 2;
        if (far && !coast.flatsExposed(s)) { G.log(s, 'The far beds are under the sea at this hour. The flats are out about 06:00 to 10:00 and 18:00 to 22:00.', 'warn'); sfx.bad(); return true; }
        station(it, { clip: 'pick', dur: 1.3, fp: 'interact', then: () => { S.setFlag(s, 'node:' + id, G.day(s) * 2 + 2); it.hidden = true; feed.push(s, 'g' + id, R.gather(s, kind), 'explore', 1, 0); sfx.pickup(); G.count(s, 'gathered'); refreshNodes(); S.updateQuests(s); } });
        return true;
      }
      return false;
  }
}

function westInteract(it: Interactable): boolean {
  const id = it.id, once = (flag: string) => { if (S.flag(s, flag)) return false; S.setFlag(s, flag); return true; };
  if (id === 'west_gate') {
    if (S.flag(s, 'westGateOpen')) return true;
    station(it, { clip: 'interact', dur: 1.6, fp: 'interact', sound: () => sfx.reload(), then: () => { if (W.openWestGate(s)) { world.west.openGate(); sfx.good(); player.trauma = Math.min(1, player.trauma + 0.15); S.updateQuests(s); save(); } else sfx.bad(); } });
    return true;
  }
  if (id === 'milestone') { G.log(s, 'The milestone lies where it fell, years ago. Cut into it, under the moss: MILLBROOK IV · FERNHOLLOW XIX. Someone has scratched beneath: "and the dead in between".', 'info'); return true; }
  if (id === 'burner_fire') { station(it, { clip: 'kneel', dur: 2.4, fp: 'none', then: () => { feed.push(s, 'hearthBurners', R.warmAtHearth(s, 'burners'), 'explore', 2, 0); sfx.good(); } }); return true; }
  if (id === 'burner_trade') { RU.openTrader(ui, 'burners', 'Nettle Smeath sells what the camp can spare, and buys pelts for the hut walls.'); return true; }
  if (id === 'vane_finds') {
    station(it, { clip: 'interact', dur: 1.4, fp: 'interact', then: () => G.log(s, S.flag(s, 'crownFate') === 2 ? 'Vane\'s table is bare. A note pinned under a stone: "Gone to the Spire with the find of the century. Sully: fill in the trench. Or don\'t." ' : 'Vane\'s finds, labelled in a tidy hand: brooches, a bronze pin, a child\'s bead necklace. His notebook lies open: "Key from Barrow I matches the hand-lock on the great mound. The Society will want the king. A.V. will want what the king guards." A.V.: Aldric Voss.', 'info') });
    return true;
  }
  if (id === 'barrow_door') { goBarrow(true); return true; }
  if (id === 'barrow_exit') { goBarrow(false); return true; }
  if (id === 'barrow_crate_1' || id === 'barrow_crate_2') {
    if (id === 'barrow_crate_2' && !S.flag(s, 'ormDown')) { G.log(s, 'Not while the king stands over it.', 'warn'); return true; }
    station(it, { clip: 'pick', dur: 1.3, fp: 'interact', then: () => {
      if (!once('crate:' + id)) { G.log(s, 'Empty now.', 'info'); return; }
      const l = W.BARROW_LOOT[id]; for (const [k, n] of Object.entries(l.items)) s.inventory[k as B.ItemId] += n as number; s.crowns += l.crowns; G.log(s, l.text, 'good'); sfx.coin();
    } });
    return true;
  }
  if (id.startsWith('hall_brazier_') || id.startsWith('orm_brazier_')) {
    const b = world.barrow.braziers.find(x => x.id === id)!;
    if (b.lit) { G.log(s, 'It burns steady.', 'info'); return true; }
    if (!s.gear.lantern) { G.log(s, 'Old charcoal, dry as bone. You need a flame: a lantern (Tobin Crake sells them), or a Firebolt.', 'warn'); sfx.bad(); return true; }
    station(it, { clip: 'interact', dur: 0.9, fp: 'interact', then: () => { lightBrazier(id, 'lantern'); } });
    return true;
  }
  if (id === 'orm_bier') {
    if (!S.flag(s, 'ormDown')) return true;
    if (S.flag(s, 'crownFate')) { G.log(s, S.flag(s, 'crownFate') === 1 ? 'The crown sits on the dust of the king\'s brow. The braziers burn low and steady.' : 'An empty bier. The braziers are going out one by one.', 'info'); return true; }
    RU.openCrown(ui, fate => { if (S.decideCrown(s, fate)) { sfx.ward(); S.updateQuests(s); save(); } relock(); });
    return true;
  }
  if (id.startsWith('heather_') || id.startsWith('bilberry_')) {
    const kind = id.startsWith('heather_') ? 'heather' : 'bilberry';
    station(it, { clip: 'pick', dur: 1.2, fp: 'interact', then: () => { S.setFlag(s, 'node:' + id, G.day(s) * 2 + 2); it.hidden = true; feed.push(s, 'g' + id, R.gather(s, kind), 'explore', 1, 0); sfx.pickup(); G.count(s, 'gathered'); refreshNodes(); S.updateQuests(s); } });
    return true;
  }
  if (id === 'inn_bar_w') { RU.openWestInn(ui); return true; }
  if (id === 'inn_bed_w') {
    const cost = R.innCost(s, 'fernhollow');
    if (s.crowns < cost) { G.log(s, `A bed at the Heron and Reed is ${cost} crowns. You do not have it.`, 'warn'); sfx.bad(); return true; }
    const hh = G.hour(s);
    station(it, { clip: 'sleep', dur: 2.2, fp: 'none', fade: hh >= 18 || hh < 6 ? 'You sleep to the sound of the lake on the jetty piles…' : 'You nap upstairs while the bar argues below…', then: () => { if (R.innSleep(s, 'fernhollow') !== false) sfx.ui(); } });
    return true;
  }
  if (id === 'hesk_table') { G.log(s, 'Orla Hesk\'s tally of the village: boats out, boats in, nets mended, eels to the smokehouse. The columns for the last month are nearly empty. At the bottom, underlined twice: "Ask Millbrook."', 'info'); return true; }
  if (id === 'smithy_west') { RU.openTrader(ui, 'smithyWest', 'Tobin Crake wipes his hands and looks at your purse before your face.'); return true; }
  if (id === 'smithy_bench') { station(it, { clip: 'interact', dur: 1.6, fp: 'interact', sound: () => sfx.reload(), then: () => { s.revolverCond = 100; G.advanceMinutes(s, 10, 'rest'); G.log(s, 'Tobin lends you his bench and his oil and watches as if the revolver might bite. It comes out clean.', 'good'); } }); return true; }
  if (id === 'smokehouse') { RU.openTrader(ui, 'smokehouse', 'Ebba Rook, through a wall of alder smoke.'); return true; }
  if (id === 'slipway') { RU.openTrader(ui, 'boatwright', 'Marra Quill does not stop caulking.'); return true; }
  if (id === 'thrush') { RU.openTrader(ui, 'wisewoman', 'Gammer Thrush squints at you over a jar of something green.'); return true; }
  if (id === 'cadoc_hut') { G.log(s, 'Cadoc\'s hut: a bog-oak staff by the door, bundles of rowan in the rafters, and a map of the Downs drawn on calfskin with every barrow named. The great mound is marked with a hand, two fingers raised, and one word: SLEEPING.', 'info'); return true; }
  if (id === 'well_west') { station(it, { clip: 'drink', dur: 1.6, fp: 'drink', sound: () => sfx.water(), then: () => { G.drink(s, 'well'); } }); return true; }
  if (id === 'notice_west') { openBoard('west'); return true; }
  if (id === 'marsh_post') {
    station(it, { clip: 'pick', dur: 1.4, fp: 'interact', then: () => {
      if (S.questActive(s, 'wq5') && !S.flag(s, 'ringGiven') && s.inventory.reedring <= 0) { s.inventory.reedring = 1; sfx.quest(); G.log(s, 'Tied among the faded ribbons on the old post, newer than the rest: a ring of plaited reed with silver wire through it. Aled got this far.', 'good'); S.updateQuests(s); }
      else G.log(s, 'Faded ribbons on an old post, and the marsh breathing all round you.', 'info');
    } });
    return true;
  }
  return false;
}
const WEST_PLACES: { id: string; name: string; text: string }[] = [
  { id: 'heath', name: 'the Heath Road', text: 'The Heath Road: purple heather to the sky, gorse, thorn trees bent by the wind, and the road west to the lake.' },
  { id: 'smeath', name: 'the Smeaths\' clamp', text: 'The Smeaths\' clamp: three smoking earth mounds in a birch copse, two turf huts and a fire.' },
  { id: 'vane_dig', name: 'Vane\'s dig', text: 'An opened barrow with a trench cut into it, a tent, and a table of labelled finds. A scholar from the Spire.' },
  { id: 'ring', name: 'the Ring of Nine', text: 'The Ring of Nine: standing stones on the Downs, one fallen. The grass inside is pale, as if something sits there often.' },
  { id: 'orm_mound', name: 'King Orm\'s mound', text: 'The great mound at the north end of the Downs, with a facade of standing slabs and a stone door with a bronze hand on it.' },
  { id: 'fernhollow', name: 'Fernhollow', text: 'Fernhollow: a lake village on the shore of Lake Hallow. The Heron and Reed, the longhouse, boats, nets, and mist.' },
  { id: 'jetty', name: 'the Fernhollow jetty', text: 'The Fernhollow jetty, out over the grey water of Lake Hallow. Old Osric fishes here, and so can you.' },
  { id: 'marsh_post', name: 'the old causeway post', text: 'The end of the old causeway across the reed marsh: a post hung with faded ribbons.' },
];
function discoverWest() {
  if (world.dungeon || player.pos.x > -40) return;
  for (const p of WEST_PLACES) {
    const key = 'place:' + p.id; if (s.discovered.includes(key)) continue;
    const at = world.places[p.id]; if (!at) continue;
    if (player.pos.distanceTo(at) < (p.id === 'fernhollow' ? 24 : p.id === 'heath' ? 30 : 16)) { s.discovered.push(key); sfx.pickup(); feed.push(s, 'found' + p.id, `${p.text} (You can walk back here from the map.)`, 'explore', 3, 0); G.addXp(s, 'survival', 8); S.updateQuests(s); }
  }
  for (const site of ['heath_road', 'barrow_downs', 'reed_marsh'] as SiteId[]) {
    const id = 'cairn_' + site; if (s.discovered.includes(id)) continue;
    if (player.pos.distanceTo(world.places[id]) < 14) { s.discovered.push(id); feed.push(s, 'found' + id, `Found: the cairn at ${SITES[site].name}.`, 'explore', 2, 0); }
  }
}
// ---- places out east: discovery, the map and walking ----
const EAST_PLACES: { id: string; name: string; text: string }[] = [
  { id: 'east_gate', name: 'Millbrook\'s East Gate', text: 'The new East Gate. The road beyond runs to Brookfield, Thornwood and Ashford.' },
  { id: 'brookfield', name: 'Brookfield', text: 'Brookfield: the Varley farm. Fields, an orchard, sheep, and a farmer who looks like he has not slept.' },
  { id: 'thornwood_camp', name: 'Thornwood clearing', text: 'The woodcutters\' clearing in Thornwood. Log piles, a fire, and the sense of being watched by the trees.' },
  { id: 'hollow_oak', name: 'the Hollow Oak', text: 'The Hollow Oak: older than anything around it, and hollow enough to stand in.' },
  { id: 'toll', name: 'the toll tower', text: 'The old toll tower on the Ash Road, and the smoke of the gang that holds it.' },
  { id: 'bridge', name: 'the Wend bridge', text: 'The stone bridge over the River Wend. Ashford\'s walls are just beyond.' },
  { id: 'ashford', name: 'Ashford', text: 'Ashford: the river-market town. The Drowned Lantern, the Wardens\' Lodge, the Reeve\'s Hall and a market that never quite closes.' },
  { id: 'docks', name: 'the Ashford docks', text: 'The Ashford docks: barges, eels, and men who do not look at you.' },
  { id: 'copper_hollow', name: 'Copper Hollow', text: 'Copper Hollow: the mine mouth in the cliff, an abandoned camp, and a silence you can feel in your teeth.' },
];
let lastRegion = '';
function discoverEast() {
  if (world.dungeon) return;
  for (const p of EAST_PLACES) {
    const key = 'place:' + p.id; if (s.discovered.includes(key)) continue;
    const at = world.places[p.id]; if (!at) continue;
    if (player.pos.distanceTo(at) < (p.id === 'ashford' ? 26 : 16)) { s.discovered.push(key); sfx.pickup(); feed.push(s, 'found' + p.id, `${p.text} (You can walk back here from the map.)`, 'explore', 3, 0); G.addXp(s, 'survival', 8); }
  }
  for (const site of ['thornwood', 'toll_tower', 'brookfield', 'hollow_road'] as SiteId[]) {
    const id = 'cairn_' + site; if (s.discovered.includes(id)) continue;
    if (player.pos.distanceTo(world.places[id]) < 14) { s.discovered.push(id); feed.push(s, 'found' + id, `Found: the cairn at ${SITES[site].name}.`, 'explore', 2, 0); }
  }
  const r = world.regionAt(player.pos);
  if (r.id !== lastRegion) { if (lastRegion && r.id !== 'reach' && r.id !== 'millbrook') feed.push(s, 'region' + r.id, `— ${r.name[0].toUpperCase() + r.name.slice(1)} —`, 'explore', 1, 30); lastRegion = r.id; }
}

function lootCrate(id: string) {
  if (id === 'mill_crate_3' && !s.flags.millCleared) { G.log(s, 'The hoard is under the Patriarch\'s gaze. Not while he stands.', 'warn'); return; }
  if (id === 'chapel_crate_3' && !S.flag(s, 'chapelCleared')) { G.log(s, 'Not while that thing stands between you and the altar.', 'warn'); return; }
  if (looted.has(id) || s.flags.notesRead.includes('loot:' + id)) { G.log(s, 'Empty now.', 'info'); return; }
  const l = LOOT[id]; looted.add(id); s.flags.notesRead.push('loot:' + id);
  for (const [k, n] of Object.entries(l.items)) s.inventory[k as B.ItemId] += n as number;
  s.crowns += l.crowns; G.log(s, l.text, 'good'); sfx.coin();
  const ld = G.loadState(s); if (ld.band !== 'light') feed.push(s, 'lootHeavy', `Your pack is getting heavy (${ld.kg} kg).`, 'survival', 2, 30);
}
function openKitchen(it: Interactable) {
  const render = (root: HTMLElement, close: () => void) => {
    const inv = s.inventory;
    const has = (k: B.ItemId) => `${B.ITEMS[k].name} (${inv[k]})`;
    root.innerHTML = `<h2>Hearth</h2><p class="sub">Cook meals now and eat them when you need them. Each meal gives one effect; you can have <b>two</b> at once. Eating the same meal again refreshes it; a third replaces whichever is closest to running out.</p>` +
      B.RECIPES.map(r => { const ok = G.canCook(s, r.id); const need = Object.entries(r.needs).map(([k, n]) => `${n} × ${has(k as B.ItemId)}`).join(' + ');
        return `<div class="row2"><div><b>${B.ITEMS[r.id].name}</b> <span style="color:var(--muted)">(${r.minutes} min · you have ${inv[r.id]})</span><br><small style="color:var(--muted)">${B.ITEMS[r.id].desc}</small><br><small>Needs ${need}</small></div><div><button class="btn" data-cook="${r.id}" ${ok ? '' : 'disabled'}>Cook</button><button class="btn" data-eat="${r.id}" ${inv[r.id] ? '' : 'disabled'}>Eat</button></div></div>`; }).join('') +
      `<div class="row2"><div><b>Eat a ration cold</b> (${inv.ration})<br><small style="color:var(--muted)">+900 kcal, no effect</small></div><button class="btn" data-eat="ration" ${inv.ration ? '' : 'disabled'}>Eat</button></div>
       <div class="row2"><div><b>Eat a loaf</b> (${inv.bread})<br><small style="color:var(--muted)">+700 kcal</small></div><button class="btn" data-bread ${inv.bread ? '' : 'disabled'}>Eat</button></div>
       <p style="color:var(--muted)">Active: ${G.activeBuffs(s).map(b => `${B.BUFFS[b.id].name} (${Math.round(b.left)} min)`).join(', ') || 'none'} · Ingredients are sold at the market stall.</p>
       <p><button class="btn primary" data-close>Done</button></p>`;
    root.querySelectorAll('[data-cook]').forEach(b => b.addEventListener('click', () => { if (G.cookRecipe(s, (b as HTMLElement).dataset.cook!)) { sfx.eat(); } render(root, close); }));
    root.querySelectorAll('[data-eat]').forEach(b => b.addEventListener('click', () => { if (G.eatMeal(s, (b as HTMLElement).dataset.eat as B.ItemId)) sfx.eat(); render(root, close); }));
    root.querySelector('[data-bread]')?.addEventListener('click', () => { G.eat(s, 'bread'); sfx.eat(); render(root, close); });
  };
  player.yaw = it.facing ?? player.yaw;
  openModal('', render, () => { player.action = null; relock(); });
}
function openChest() {
  const render = (root: HTMLElement, close: () => void) => {
    const ld = G.loadState(s);
    const rows = B.ITEM_IDS.filter(k => s.inventory[k] || s.storage[k]).map(k => `<div class="row2"><div><b>${B.ITEMS[k].name}</b> <small style="color:var(--muted)">${B.ITEMS[k].weight} kg each</small></div>
      <div style="white-space:nowrap"><span style="display:inline-block;width:64px;text-align:right">pack ${s.inventory[k]}</span>
      <button class="btn" data-t="${k}:store:1" ${s.inventory[k] ? '' : 'disabled'}>→</button><button class="btn" data-t="${k}:store:99" ${s.inventory[k] ? '' : 'disabled'}>→ all</button>
      <button class="btn" data-t="${k}:take:99" ${s.storage[k] ? '' : 'disabled'}>all ←</button><button class="btn" data-t="${k}:take:1" ${s.storage[k] ? '' : 'disabled'}>←</button>
      <span style="display:inline-block;width:64px">chest ${s.storage[k]}</span></div></div>`).join('');
    root.innerHTML = `<h2>Your chest</h2><p class="sub">Pack ${ld.kg} / ${ld.cap} kg (${ld.band}). Above ${Math.round(B.LOAD_HEAVY * 100)}% stamina recovers slower; above ${Math.round(B.LOAD_OVER * 100)}% you cannot run; above ${Math.round(B.LOAD_CRUSHING * 100)}% you can't pick up more. The chest has no limit and is kept in your saves.</p>${rows || '<p>Nothing to move.</p>'}<p><button class="btn" data-sort>Store all ingredients</button> <button class="btn primary" data-close>Close</button></p>`;
    root.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { const [k, dir, n] = (b as HTMLElement).dataset.t!.split(':'); if (G.transfer(s, k as B.ItemId, Number(n), dir as 'store' | 'take')) sfx.ui(); render(root, close); }));
    root.querySelector('[data-sort]')!.addEventListener('click', () => { for (const k of B.ITEM_IDS) if (B.ITEMS[k].kind === 'ingredient') G.transfer(s, k, 99, 'store'); sfx.ui(); render(root, close); });
  };
  sfx.ui(); openModal('', render, () => { save(); relock(); });
}
function openDeskChoice(it: Interactable) {
  openModal(`<h2>Brannic's desk</h2><p class="sub">One piece of work a day. Boss Attention ${s.job.attention}/100.</p>
    <div class="card"><h3>Ledger shift · 4 hours</h3><p style="color:var(--muted)">Post ${B.SHIFT_ENTRIES} source documents to the town ledger. ${B.PAY_PER_CORRECT} crowns per correct entry.</p><button class="btn primary" data-shift>Take a shift</button></div>
    <div class="card"><h3>Case file · 3 hours</h3><p style="color:var(--muted)">A reconciliation or an invoice investigation. 9 crowns per correct finding, +12 for a clean file; a clean file lowers Boss Attention and raises your standing. Mistakes raise Boss Attention.</p><button class="btn" data-case>Open a case file</button></div>
    ${S.questActive(s, 'redink') && S.flag(s, 'auditOpen') && !S.flag(s, 'auditSolved') ? `<div class="card" style="border-color:var(--accent)"><h3>The Voss debt book · 3 hours</h3><p style="color:var(--muted)">Tolan is out until two. Five findings, starting with your aunt's page. One slip and you start again tomorrow.</p><button class="btn primary" data-audit>Open the Tower's book</button></div>` : ''}
    <p><button class="btn" data-close>Not today</button></p>`, (root, close) => {
    const sit = () => { player.action = { clip: 'write', t: 0, dur: 9999, seat: it.seat, facing: it.facing, upper: false }; player.yaw = it.facing ?? 0; vm.play('write', 9999); };
    root.querySelector('[data-shift]')!.addEventListener('click', () => { close(); sit(); openLedger(it); });
    root.querySelector('[data-case]')!.addEventListener('click', () => { close(); if (!G.startCase(s)) { sfx.bad(); relock(); return; } sit(); openCase(); });
    root.querySelector('[data-audit]')?.addEventListener('click', () => { close(); if (!G.startAudit(s)) { sfx.bad(); relock(); return; } sit(); openCase(); });
  }, relock);
}
function openCase() {
  sfx.scribble();
  const render = (root: HTMLElement, close: () => void) => {
    const f = s.caseFile!; const c = f.c;
    const docs = c.docs.map(d => `<div class="doc" style="font-size:14px"><b>${escapeHtml(d.title)}</b><table style="width:100%;border-collapse:collapse;margin-top:4px">${d.rows.map(r => `<tr>${r.map((x, i) => `<td style="padding:2px 6px;border-bottom:1px solid #d8c9a6;${i ? 'text-align:right' : ''}">${escapeHtml(x)}</td>`).join('')}</tr>`).join('')}</table></div>`).join('');
    if (f.index >= c.questions.length) {
      root.innerHTML = `<h2>${escapeHtml(c.title)}</h2><p class="sub">${f.correct} of ${c.questions.length} findings correct.</p>${f.last ? `<p class="${f.last.ok ? 'res-ok' : 'res-bad'}">${escapeHtml(f.last.why)}</p>` : ''}<button class="btn primary" data-done>Hand the file to Brannic</button>`;
      root.querySelector('[data-done]')!.addEventListener('click', () => close()); return;
    }
    const q = c.questions[f.index];
    root.innerHTML = `<h2>${escapeHtml(c.title)}</h2><p class="sub">${escapeHtml(c.brief)} · Finding ${f.index + 1} of ${c.questions.length} · Boss Attention ${s.job.attention}/100</p>
      ${f.last ? `<p class="${f.last.ok ? 'res-ok' : 'res-bad'}">${f.last.ok ? 'Correct. ' : 'Wrong. '}${escapeHtml(f.last.why)}</p>` : ''}${docs}
      <p><b>${escapeHtml(q.prompt)}</b></p>${q.options.map((o, i) => `<p><button class="btn" style="text-align:left;width:100%" data-o="${i}">${escapeHtml(o.label)}</button></p>`).join('')}`;
    root.querySelectorAll('[data-o]').forEach(b => b.addEventListener('click', () => { const r = G.answerCase(s, Number((b as HTMLElement).dataset.o)); r?.ok ? sfx.good() : sfx.bad(); sfx.scribble(); render(root, close); }));
  };
  openModal('', render, async () => {
    if (s.caseFile) { while (s.caseFile.index < s.caseFile.c.questions.length) { s.caseFile.errors++; s.caseFile.index++; s.job.attention += B.ATTENTION_PER_ERROR; } }
    const audit = s.caseFile?.c.kind === 'audit';
    if (audit && s.caseFile) s.job.attention = Math.max(0, s.job.attention - s.caseFile.errors * B.ATTENTION_PER_ERROR); // Brannic is on your side for this one
    const r = G.endCase(s); player.action = null; vm.play('none', 0);
    if (r) { await hud.fade(audit ? (r.perfect ? 'Three hours later… it casts' : 'Three hours later… not good enough') : `Three hours later… +${r.pay} crowns`, 1100); r.perfect ? sfx.coin() : sfx.ui(); }
    storyTick(); save(); relock();
  });
}
function openSettings(back?: () => void) {
  let bindingNow: Action | null = null;
  const render = (root: HTMLElement, close: () => void) => {
    const sel = (k: keyof Settings, opts: [string, string][]) => `<select data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(cfg[k]) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const st = perf.stats();
    root.innerHTML = `<h2>Settings</h2><p class="sub">Applied immediately and stored in this browser. Current: ${st.fps ? `${st.fps.toFixed(0)} fps, 1% low ${st.low1.toFixed(0)}` : 'open F3 to measure'}.</p>
      <div class="card settings"><h3>Graphics</h3>
      <div class="row2"><span>Resolution scale</span>${sel('resScale', [['0.5', '50%'], ['0.67', '67%'], ['0.8', '80%'], ['1', '100%'], ['1.25', '125%']])}</div>
      <div class="row2"><span>Shadows</span>${sel('shadows', [['off', 'Off (fastest)'], ['low', 'Low · 1024'], ['high', 'High · 2048']])}</div>
      <div class="row2"><span>Effects and clutter (grass, particles)</span>${sel('effects', [['low', 'Low'], ['high', 'High']])}</div>
      <div class="row2"><span>View distance</span>${sel('viewDist', [['120', 'Short'], ['200', 'Medium'], ['260', 'Far'], ['400', 'Maximum']])}</div>
      <div class="row2"><span>Field of view</span>${sel('fov', [['60', '60°'], ['72', '72°'], ['80', '80°'], ['90', '90°']])}</div>
      <div class="row2"><span>Frame cap (steadier frame pacing on slow machines)</span>${sel('fpsCap', [['0', 'Display refresh'], ['60', '60'], ['30', '30']])}</div>
      <div class="row2"><span>Performance overlay (F3)</span>${sel('showPerf', [['false', 'Off'], ['true', 'On']])}</div></div>
      <div class="card settings"><h3>Mouse</h3>
      <div class="row2"><span>Sensitivity</span>${sel('sens', [['0.5', '0.5×'], ['0.75', '0.75×'], ['1', '1×'], ['1.25', '1.25×'], ['1.5', '1.5×'], ['2', '2×']])}</div>
      <div class="row2"><span>Invert look up/down</span>${sel('invertY', [['false', 'No'], ['true', 'Yes']])}</div>
      <div class="row2"><span>Raw mouse input (no OS acceleration)</span>${sel('rawMouse', [['true', 'On'], ['false', 'Off']])}</div>
      <div class="row2"><span>Look smoothing</span>${sel('smoothing', [['0', 'Off (lowest latency)'], ['1', 'Light']])}</div></div>
      <div class="card settings"><h3>Sound and screen</h3>
      <div class="row2"><span>Master volume</span>${sel('volume', [['0', 'Off'], ['0.25', '25%'], ['0.5', '50%'], ['0.7', '70%'], ['1', '100%']])}</div>
      <div class="row2"><span>Sound effects</span>${sel('sfxVolume', [['0', 'Off'], ['0.5', '50%'], ['0.75', '75%'], ['1', '100%']])}</div>
      <div class="row2"><span>Music and ambience</span>${sel('musicVolume', [['0', 'Off'], ['0.3', '30%'], ['0.6', '60%'], ['1', '100%']])}</div>
      <div class="row2"><span>HUD size</span>${sel('hudScale', [['0.85', 'Small'], ['1', 'Normal'], ['1.15', 'Large'], ['1.3', 'Very large']])}</div>
      <div class="row2"><span>Camera motion (head bob, shake, recoil kick)</span>${sel('camMotion', [['1', 'Full'], ['0.5', 'Reduced'], ['0', 'None']])}</div>
      <div class="row2"><span>Run</span>${sel('runToggle', [['false', 'Hold the run key'], ['true', 'Press to toggle']])}</div></div>
      <div class="card settings"><h3>Keys</h3><p style="color:var(--muted)">Click a key, then press the new one. Esc cancels. If the key is in use, the two actions swap.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 18px">${ACTIONS.map(a => `<div class="row2" style="padding:3px 0"><span>${a.label}</span><button class="btn" style="min-width:92px" data-bind="${a.id}">${bindingNow === a.id ? 'Press a key…' : keyName(cfg.bindings[a.id])}</button></div>`).join('')}</div>
      <p><button class="btn" data-keys>Reset keys</button></p></div>
      <p><button class="btn" data-reset>Restore all defaults</button> <button class="btn primary" data-close>Done</button></p>`;
    root.querySelectorAll('[data-bind]').forEach(b => b.addEventListener('click', () => {
      const act = (b as HTMLElement).dataset.bind as Action; bindingNow = act; render(root, close);
      rebinding = code => {
        bindingNow = null;
        if (code !== 'Escape') { const other = ACTIONS.find(x => x.id !== act && cfg.bindings[x.id] === code); if (other) cfg.bindings[other.id] = cfg.bindings[act]; cfg.bindings[act] = code; saveSettings(cfg); applySettings(); sfx.ui(); }
        render(root, close);
      };
    }));
    root.querySelector('[data-keys]')!.addEventListener('click', () => { cfg.bindings = { ...DEFAULT_BINDINGS }; saveSettings(cfg); applySettings(); render(root, close); });
    root.querySelectorAll('select[data-k]').forEach(el => el.addEventListener('change', () => {
      const k = (el as HTMLSelectElement).dataset.k as keyof Settings, v = (el as HTMLSelectElement).value;
      (cfg as any)[k] = v === 'true' ? true : v === 'false' ? false : isNaN(Number(v)) ? v : Number(v);
      saveSettings(cfg); applySettings(); sfx.ui();
    }));
    root.querySelector('[data-reset]')!.addEventListener('click', () => { cfg = { ...DEFAULTS, bindings: { ...DEFAULT_BINDINGS } }; saveSettings(cfg); applySettings(); render(root, close); });
  };
  openModal('', render, () => { rebinding = null; back ? back() : relock(); });
}

// ---------------- dialogs ----------------
let introOpen = true;
const modalClosers: (() => void)[] = [];
function openModal(html: string, mount?: (root: HTMLElement, close: () => void) => void, onClose?: () => void) {
  document.exitPointerLock?.();
  let closeFn: () => void = () => {};
  closeFn = hud.modal(html, (root, close) => {
    const c = () => { close(); const i = modalClosers.indexOf(closeFn); if (i >= 0) modalClosers.splice(i, 1); onClose?.(); };
    closeFn = c; root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx.ui(); c(); }));
    mount?.(root, c);
    const wrap = root.parentElement; wrap?.addEventListener('mousedown', e => { if (e.target === wrap && root.querySelector('[data-close]')) c(); });
  });
  modalClosers.push(closeFn);
}
function closeTopModal() { const c = modalClosers[modalClosers.length - 1]; if (c) c(); }
function relock() { if (started && !hud.modalOpen) lockPointer(); }
const npcDef = (id: string) => NPCS.find(n => n.id === id);
const npcFaction = (id: string): FactionId => (npcDef(id)?.faction as FactionId) ?? NPC_FACTION[id] ?? 'town';
/** What the pass-4 panels (ui/panels.ts) need from the game. */
const ui: P.Ctx = {
  s: () => s, openModal, relock, save: () => save(),
  sound: n => (sfx as any)[n]?.(),
  npcName: id => npcDef(id)?.name ?? id, npcFaction,
  act: (c, sec) => { playTP(c as ClipName, sec, true); setTimeout(() => { if (player.action?.clip === c) player.action = null; }, sec * 1000); },
};

function openShop() {
  if (!holstered) { feed.push(s, 'shopGun', EVENTS.shopGun('sera'), 'npc', 3, 30); G.rep(s, 'town', -1, false); }
  const render = (root: HTMLElement, close: () => void) => {
    const t = s.factions.town;
    root.innerHTML = `<h2>Market stall</h2><p class="sub">Bram's bread and Sera's sundries. You have <b>${s.crowns}</b> crowns.${G.today(s).event === 'market' ? ' <b>Market day: 15% off.</b>' : ''}${t !== 0 ? ` Millbrook folk find you <b>${G.standing(t).toLowerCase()}</b>, so prices are ${t > 0 ? 'lower' : 'higher'}.` : ''}</p>` +
      B.SHOP.map(x => { const pr = G.priceOf(s, x.id); return `<div class="row2"><div><b>${B.ITEMS[x.id].name}</b> <span style="color:var(--muted)">(you have ${s.inventory[x.id]})</span><br><small style="color:var(--muted)">${B.ITEMS[x.id].desc}</small></div><button class="btn" data-buy="${x.id}" ${s.crowns < pr ? 'disabled' : ''}>Buy · ${pr}</button></div>`; }).join('') +
      `<div class="card"><h3>Sell</h3>${P.sellRows(s)}</div>` +
      (G.today(s).event === 'tinker' ? `<div class="card"><h3>The tinker by the well</h3><div class="row2"><div>Clean and oil your revolver <small style="color:var(--muted)">(${Math.round(s.revolverCond)}%: ${T.condText(s.revolverCond)})</small></div><button class="btn" data-tinker ${s.revolverCond >= 99 || s.crowns < 2 ? 'disabled' : ''}>2 crowns</button></div></div>` : '') +
      `<p style="margin-top:12px"><button class="btn primary" data-close>Done</button></p>`;
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx.ui(); close(); }));
    root.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => { const [k, n] = (b as HTMLElement).dataset.sell!.split(':'); if (T.sell(s, k as B.ItemId, Number(n))) sfx.coin(); render(root, close); }));
    root.querySelector('[data-tinker]')?.addEventListener('click', () => { if (T.cleanRevolver(s, 'tinker')) sfx.good(); render(root, close); });
    root.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.buy as B.ItemId;
      if (seraDiscount) { const pr = G.priceOf(s, id), off = Math.max(1, Math.round(pr * 0.1)); if (s.crowns >= pr - off) { s.crowns += off; if (G.buy(s, id)) { seraDiscount = false; sfx.coin(); G.log(s, `Sera knocks ${off} off, as promised.`, 'good'); } else s.crowns -= off; } render(root, close); return; }
      if (G.buy(s, id)) sfx.coin(); render(root, close);
    }));
  };
  openModal('', render, relock);
}
function noticeWhere(c: { kind: string; enemy?: EnemyKind; site: SiteId }) {
  return c.kind === 'sweep' ? `${(c as any).elite ? 'An elite ' + ENEMY_NAMES[c.enemy!].toLowerCase() : ENEMY_NAMES[c.enemy!]} at ${SITES[c.site].name}` : c.kind === 'recovery' ? `Cairn at ${SITES[c.site].name}, guarded by ${ENEMY_NAMES[c.enemy!]}s` : `Waystone at ${SITES[c.site].name}`;
}
/** Where a notice is paid: the board it came from (v0.9.3: the west and coast posts, not the Lodge). */
function boardPlace(c: { board?: string }): THREE.Vector3 { return c.board === 'west' ? world.places.notice_west : c.board === 'coast' ? world.places.notice_coast : c.board ? world.places.lodge : world.places.board; }
function openBoard(which: boolean | 'west' | 'coast' = false) {
  const lodge = which === true, west = which === 'west', coastB = which === 'coast', bk = (c: { board?: string }) => c.board ?? 'mb', mineKey = coastB ? 'coast' : west ? 'west' : lodge ? 'lodge' : 'mb';
  if (G.contractReady(s) && (s.active!.kind !== 'recovery' || s.carryingCrate) && bk(s.active!) === mineKey) { const pay = G.contractPay(s, s.active!); G.turnInContract(s); sfx.coin(); hud.fade(`+${pay} crowns`, 700); save(); return; }
  const render = (root: HTMLElement, close: () => void) => {
    const a = s.active;
    const prep = a ? (Object.keys(G.PREP) as G.PrepId[]).map(p => { const d = G.PREP[p], done = a.prep?.[p]; return `<div class="row2"><div><b>${d.name}</b>${d.cost ? ` · ${d.cost} crowns` : ''}${d.hours ? ` · ${d.hours} hour` : ''}<br><small style="color:var(--muted)">${d.desc}</small></div><button class="btn" data-prep="${p}" ${done || s.crowns < d.cost ? 'disabled' : ''}>${done ? 'Done' : 'Prepare'}</button></div>`; }).join('') : '';
    const mine = s.board.filter(c => bk(c) === mineKey);
    root.innerHTML = (coastB ? `<h2>Gullhaven's notice post</h2><p class="sub">Work on the coast, pinned up by the harbourmaster and whoever on the quay is angry enough to pay. New notices every morning.</p>` : west ? `<h2>Fernhollow's notice post</h2><p class="sub">Work in the Westmarch, pinned up by the headwoman, the barrow-warden and whoever else is desperate. New notices every morning.</p>` : lodge ? `<h2>The Wardens' Lodge</h2><p class="sub">Harder work in the Eastern Reach, posted by Dace Morrow and the people who pay the Lodge. New notices every morning.</p>` : `<h2>Contract board</h2><p class="sub">Notices nailed up by Millbrook folk. New ones every morning. Pay rises with the issuer's opinion of you.</p>`) +
      (a && bk(a) !== mineKey ? `<p style="color:var(--muted)">Your current notice is from the ${a.board === 'coast' ? 'notice post on Gullhaven quay' : a.board === 'west' ? 'notice post in Fernhollow' : a.board ? 'Lodge in Ashford' : 'Millbrook board'}; you are paid there.</p>` : '') +
      (a ? `<div class="card"><h3>Your notice: ${escapeHtml(a.title)}</h3><p>${escapeHtml(a.brief)}</p><p style="color:var(--muted)">Progress ${a.progress}/${a.count} · pay ${G.contractPay(s, a)} · from ${escapeHtml(a.issuer)}</p><h3 style="margin-top:10px">Prepare (Mercenary Maintenance prep)</h3>${prep}<p><button class="btn" data-abandon>Abandon notice</button></p></div>` : '') +
      mine.map(c => `<div class="card"><h3>${escapeHtml(c.title)} <span style="color:var(--accent)">· ${G.contractPay(s, c)} crowns</span></h3><p>${escapeHtml(c.brief)}</p><p style="color:var(--muted);font-size:12.5px">From ${escapeHtml(c.issuer)} (${FACTIONS[issuerFaction(c.issuer)].name}: ${G.standing(s.factions[issuerFaction(c.issuer)]).toLowerCase()}) · ${noticeWhere(c)} · expires end of day ${c.expiresDay}</p><button class="btn primary" data-take="${c.id}" ${a ? 'disabled' : ''}>Take notice</button></div>`).join('') +
      `<p><button class="btn" data-close>Close</button></p>`;
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx.ui(); close(); }));
    root.querySelectorAll('[data-take]').forEach(b => b.addEventListener('click', () => {
      const c = G.takeContract(s, (b as HTMLElement).dataset.take!);
      if (c) { sfx.good(); const site = world.sites[c.site];
        if (c.kind === 'sweep') for (let i = 0; i < c.count; i++) enemies.spawn(c.enemy!, site, c.id, !!c.elite);
        if (c.kind === 'recovery') { const cp = world.interactables.find(i => i.id === `cairn_${c.site}`)!.pos; for (let i = 0; i < 2; i++) enemies.spawn(c.enemy!, cp, c.id); } }
      render(root, close); }));
    root.querySelectorAll('[data-prep]').forEach(b => b.addEventListener('click', () => { if (G.buyPrep(s, (b as HTMLElement).dataset.prep as G.PrepId)) sfx.coin(); render(root, close); }));
    root.querySelector('[data-abandon]')?.addEventListener('click', () => { if (s.active) enemies.clearTag(s.active.id); G.abandonContract(s); render(root, close); });
  };
  openModal('', render, relock);
}
function openClerk() {
  const render = (root: HTMLElement, close: () => void) => {
    const left = Math.max(0, B.INSTALMENT - s.paidThisCycle);
    root.innerHTML = `<h2>The Counting House counter</h2><p class="sub">${S.tolanGone(s) ? (S.flag(s, 'audit') === 3 ? 'Lira Voss keeps the Tower\'s debt book now, beside the Millbrook Trust\'s savings ledger.' : 'A Watch clerk minds the Tower\'s debt book while Tolan answers questions.') : 'Tolan keeps Aldric\'s debt book and the Millbrook Trust\'s savings ledger side by side.'}</p>
      <div class="card"><h3>Aldric Voss's debt book</h3>
      <div class="row2"><span>Owed to the Tower</span><b>${s.debt} crowns</b></div>
      <div class="row2"><span>This week's instalment (due end of day ${s.nextDueDay})</span><b>${left > 0 ? `${left} still to pay` : 'paid'}</b></div>
      <div class="row2"><span>Missed instalments</span><b>${s.missed} of ${B.MISSES_TO_GAMEOVER} allowed</b></div>
      <p><button class="btn primary" data-pay="${Math.min(left || 10, s.crowns)}" ${s.crowns <= 0 ? 'disabled' : ''}>Pay ${Math.min(left || 10, s.crowns)}</button>
      <button class="btn" data-pay="10" ${s.crowns < 10 ? 'disabled' : ''}>Pay 10</button>
      <button class="btn" data-pay="${s.crowns}" ${s.crowns <= 0 ? 'disabled' : ''}>Pay everything (${s.crowns})</button></p></div>
      <div class="card"><h3>Millbrook Trust savings</h3><p style="color:var(--muted)">Saved coin earns ${Math.round(B.SAVINGS_INTEREST * 100)}% a week and is safe if you collapse in the Vale. Purse: ${s.crowns} · savings: ${s.savings}</p>
      <p><button class="btn" data-dep="10" ${s.crowns < 10 ? 'disabled' : ''}>Deposit 10</button><button class="btn" data-dep="${s.crowns}" ${s.crowns <= 0 ? 'disabled' : ''}>Deposit all</button><button class="btn" data-wd="10" ${s.savings < 10 ? 'disabled' : ''}>Withdraw 10</button><button class="btn" data-wd="${s.savings}" ${s.savings <= 0 ? 'disabled' : ''}>Withdraw all</button></p></div>
      <div class="card"><h3>Home improvements</h3>${(Object.keys(B.HOME_UP) as B.HomeUpId[]).map(u => `<div class="row2"><div><b>${B.HOME_UP[u].name}</b> · ${B.HOME_UP[u].cost} crowns<br><small style="color:var(--muted)">${B.HOME_UP[u].desc}</small></div><button class="btn" data-up="${u}" ${s.upgrades[u] || s.crowns < B.HOME_UP[u].cost ? 'disabled' : ''}>${s.upgrades[u] ? 'Owned' : 'Order'}</button></div>`).join('')}</div>
      <p><button class="btn" data-close>Leave</button></p>`;
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx.ui(); close(); }));
    root.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => { if (G.payDebt(s, Number((b as HTMLElement).dataset.pay))) sfx.coin(); save(); if (s.gameover) { close(); showGameover(); } else render(root, close); }));
    root.querySelectorAll('[data-dep]').forEach(b => b.addEventListener('click', () => { if (G.deposit(s, Number((b as HTMLElement).dataset.dep))) sfx.coin(); render(root, close); }));
    root.querySelectorAll('[data-wd]').forEach(b => b.addEventListener('click', () => { if (G.withdraw(s, Number((b as HTMLElement).dataset.wd))) sfx.coin(); render(root, close); }));
    root.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => { if (G.buyUpgrade(s, (b as HTMLElement).dataset.up as B.HomeUpId)) sfx.good(); render(root, close); }));
  };
  openModal('', render, relock);
}
let seraDiscount = false;
const NPC_FACTION: Record<string, FactionId> = { bram: 'town', sera: 'town', brannic: 'tower', tolan: 'tower', vole: 'watch', petch: 'chapel' };
const NPC_ABOUT: Record<string, { vale: string; tip: string }> = {
  bram: { vale: '"The mill road used to bring me flour. Now it brings me hounds."', tip: '"Eat before you go out. A loaf is four crowns. A funeral is more."' },
  sera: { vale: '"Raiders camp by the ford. They buy from me too, which I don\'t mention to the Watch."', tip: '"Boiled leather from my back room turns a cut into a bruise. Ask at the board before you go."' },
  brannic: { vale: '"The Vale is a column of losses in my ledger."', tip: '"Debit what you receive, credit where it came from. Write slowly and you will be paid."' },
  tolan: { vale: '"Master Voss says the stones are older than the town. He also says pay on time."', tip: '"Coin in the Trust earns a little every week, and nobody can take it from you in a ditch."' },
  vole: { vale: '"Hounds by the mill, raiders by the ford, shades at the stones. Night makes all three bolder."', tip: '"Holster that piece in the square. People talk."' },
  petch: { vale: '"The Whisper Stones used to be a ward. Something left the door open."', tip: '"The Chapel remembers who helps the pilgrims."' },
};
function openTalk(t: Townsfolk) {
  const id = t.def.id, f = npcFaction(id), short = t.def.name.split(',')[0];
  const ctx = { s, npc: id, faction: f, holstered, place: player.zone };
  const g = greet(ctx, t.def.lines.map(l => l));
  remember(ctx, g.reason, g.text);
  const first = G.talkedTo(s, id, f);
  const conseq = consequence(g.reason, id);
  if (conseq === 'discount') { seraDiscount = true; G.log(s, 'Sera will knock ten percent off your next purchase.', 'good'); }
  if (conseq === 'calm') { s.needs.stress = Math.max(0, s.needs.stress - 5); }
  if (g.reason === 'gunOut') G.rep(s, f, -1, false);
  t.talkT = 6;
  let line = `${short}: ${g.text}`;
  const services: [string, string, () => void][] = [];
  if (id === 'tomlin') services.push(['food', 'Food and drink', () => P.openTavern(ui)], ['dice', 'Play dice', () => P.openDice(ui)]);
  if (id === 'maren') services.push(['chapel', 'Healing, blessing and draughts', () => P.openChapel(ui)]);
  // v0.9.3: one charge, one way to buy it at a time. While The Salt Gap offers its own line to Dorran, that line is
  // the purchase; otherwise (before Sera asks, or short of coin) his counter sells it.
  const chargeTalk = S.talkChoices(s, 'dorran').some(q => /blasting charge/i.test(q.label));
  if (id === 'dorran' && coast.canBuyCharge(s) && !chargeTalk) services.push(['charge', `Buy a blasting charge for the Salt Gap · ${B.CHARGE_PRICE} crowns`, () => { if (coast.buyCharge(s)) { sfx.coin(); S.updateQuests(s); save(); } else sfx.bad(); }]);
  if (id === 'dorran') services.push(['forge', 'Gear and repairs', () => P.openSmithy(ui)]);
  if (id === 'sera' || id === 'bram') services.push(['shop', 'Buy and sell', () => openShop()]);
  if (id === 'noname') services.push(['fence', 'Trade quietly', () => P.openNoName(ui)]);
  if (id === 'vole' || id === 'renn') services.push(['bounty', `Hand in raider tags (${s.inventory.tags})`, () => { if (T.claimBounty(s)) sfx.coin(); else { G.log(s, `${short}: "No tags, no bounty. Raiders wear them on a cord."`, 'info'); } }]);
  if (id === 'tolan' || (id === 'lira' && S.flag(s, 'audit') === 3)) services.push(['debt', 'The debt book and the Trust', () => openClerk()]);
  // v0.7: the Eastern Reach
  const SHOP_OF: Record<string, R.ShopId> = { hobb: 'farm', ilse: 'apothecary', corwin: 'gunsmith', oskar: 'fishmonger', tamsin: 'curio', mags: 'pedlar' };
  if (SHOP_OF[id]) services.push(['trade', 'Buy and sell', () => RU.openTrader(ui, SHOP_OF[id])]);
  if (id === 'wenna') services.push(['inn', 'Food, drink and a bed', () => RU.openInn(ui)]);
  if (id === 'dace') services.push(['lodge', 'Lodge notices', () => openBoard(true)], ['stores', 'Lodge stores', () => RU.openTrader(ui, 'lodge', 'Lodge kit at Lodge prices.')]);
  if (id === 'aldous') services.push(['chapel', 'Healing and blessing', () => P.openChapel(ui)]);
  if (id === 'joss') services.push(['coach', 'The coach to Millbrook', () => RU.openCoach(ui, 'millbrook', () => { if (!R.takeCoach(s, 'millbrook')) return; sfx.coin(); hud.fade('The coach rattles west…', 1200).then(() => { player.pos.copy(world.places.coach_mb); player.yaw = Math.PI / 2; player.vy = 0; save(); relock(); }); })]);
  if (id === 'merrin') services.push(['song', 'Ask for a song', () => RU.openBard(ui)]);
  // v0.9.3: Gullhaven
  const COAST_SHOP: Record<string, [R.ShopId, string]> = { jowan: ['anchor', 'Food and drink'], pasco: ['chandlery', 'Buy and sell'], morwenna: ['fishauction', 'Sell fish (she pays ×1.3)'], tegen: ['shipwright', 'Sea boots and tackle'] };
  if (COAST_SHOP[id]) services.push(['trade', COAST_SHOP[id][1], () => RU.openTrader(ui, COAST_SHOP[id][0])]);
  if (id === 'elowen') services.push(['bless', 'Ask for the fishermen\'s blessing', () => { if (coast.blessing(s)) sfx.good(); }]);
  if (id === 'bree' && S.flag(s, 'saltGapOpen')) services.push(['notices', 'Harbour notices', () => openBoard('coast')]);
  if (id === 'edda' || id === 'pell') services.push(['bounty', `Hand in Ash Road tags (${s.inventory.tags})`, () => { if (T.claimBounty(s)) sfx.coin(); else { G.log(s, `${short}: "No tags, no bounty."`, 'info'); } }]);
  const render = (root: HTMLElement, close: () => void) => {
    const theirs = s.board.filter(c => issuerFaction(c.issuer) === f), about = t.def.about ?? NPC_ABOUT[id];
    const quests = S.talkChoices(s, id);
    root.innerHTML = `<h2>${escapeHtml(t.def.name)}</h2><p class="sub">${FACTIONS[f].name}: <b>${G.standing(s.factions[f])}</b> (${s.factions[f]})${first ? ' · glad you stopped to talk' : ''}</p>
      <div class="doc" style="font-size:15px">${escapeHtml(line)}</div>
      ${quests.map(q => `<p><button class="btn primary" style="width:100%;text-align:left" data-story="${q.key}">◆ ${escapeHtml(q.label)}</button></p>`).join('')}
      ${services.length ? `<p>${services.map(([k, l]) => `<button class="btn" data-svc="${k}">${escapeHtml(l)}</button>`).join('')}</p>` : ''}
      <p><button class="btn" data-q="chat">Chat</button><button class="btn" data-q="vale">${(npcDef(id) as any)?.region === 'east' || (npcDef(id) as any)?.region === 'march' ? 'Ask about these parts' : 'Ask about the Vale'}</button><button class="btn" data-q="tip">Ask for advice</button><button class="btn" data-q="work">Ask about work</button><button class="btn" data-close>Goodbye</button></p>`;
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx.ui(); close(); }));
    root.querySelectorAll('[data-story]').forEach(b => b.addEventListener('click', () => {
      const before = s.debt; const reply = S.chooseTalk(s, (b as HTMLElement).dataset.story!);
      line = `${short}: ${reply}`; sfx.quest(); t.talkT = 8; save();
      if (s.gameover) { close(); return; }
      if (s.debt < before) sfx.coin();
      if (S.flag(s, 'gateStarted') && !S.flag(s, 'gateHeld') && !gate.active) { close(); startGate(); return; }
      render(root, close);
    }));
    root.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', () => { const sv = services.find(x => x[0] === (b as HTMLElement).dataset.svc)!; if (sv[0] === 'bounty') { sv[2](); render(root, close); } else { close(); sv[2](); } }));
    root.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
      const q = (b as HTMLElement).dataset.q;
      line = q === 'chat' ? `${short}: ${t.def.lines[(G.day(s) + (s.npcMemory[id]?.met ?? 0) + Math.floor(Math.random() * 9)) % t.def.lines.length]}` : q === 'vale' ? `${short}: ${about?.vale ?? '"Stay out of the Vale after dark."'}` : q === 'tip' ? `${short}: ${about?.tip ?? '"Keep your head down."'}`
        : theirs.length ? `${short}: "There's a notice of ours on the board: ${theirs[0].title}. ${G.contractPay(s, theirs[0])} crowns."` : `${short}: "Nothing from us on the board today."`;
      sfx.ui(); t.talkT = 5; render(root, close);
    }));
  };
  openModal('', render, relock);
}
function openLedger(it: Interactable) {
  const shift = G.startShift(s);
  if (!shift) { player.action = null; vm.play('none', 0); return; }
  sfx.scribble();
  const opts = ACCOUNT_ORDER.map(a => `<option value="${a}">${ACCOUNTS[a].code} · ${ACCOUNTS[a].name}</option>`).join('');
  const render = (root: HTMLElement, close: () => void) => {
    const sh = s.shift!;
    if (sh.index >= sh.entries.length) {
      root.innerHTML = `<h2>End of shift</h2><p class="sub">${sh.correct} of ${sh.entries.length} entries posted correctly.</p><p>Brannic will pay ${B.PAY_PER_CORRECT} crowns per correct entry, less if you are too tired or hungry to work quickly. Boss Attention: ${s.job.attention}/100.</p><button class="btn primary" data-done>Collect pay and leave</button>`;
      root.querySelector('[data-done]')!.addEventListener('click', async () => { close(); });
      return;
    }
    const e = sh.entries[sh.index];
    const focus = B.checkChance(s.needs, 'focus');
    root.innerHTML = `<h2>The town ledger</h2><p class="sub">Entry ${sh.index + 1} of ${sh.entries.length} · Boss Attention ${s.job.attention}/100${focus.reason ? ` · <span style="color:var(--warn)">${escapeHtml(focus.reason)}</span>` : ''}</p>
      ${sh.lastResult ? `<p class="${sh.lastResult.ok ? 'res-ok' : 'res-bad'}">Last entry: ${escapeHtml(sh.lastResult.why)}</p>` : ''}
      <div class="doc">${escapeHtml(e.doc)}<br><br><b>Amount: ${e.amount} crowns</b></div>
      ${G.level(s, 'ledger') >= 3 ? `<p style="color:var(--muted)">Your bookkeeper's instinct (level ${G.level(s, 'ledger')}): ${escapeHtml(e.hint)} The debit is ${/^[aeiou]/.test(ACCOUNTS[e.debit].kind) ? 'an' : 'a'} <b>${ACCOUNTS[e.debit].kind}</b> account.</p>` : ''}
      <div class="accts"><div><label for="dr">Debit (left side)</label><select id="dr">${opts}</select></div><div><label for="cr">Credit (right side)</label><select id="cr">${opts}</select></div></div>
      <p style="margin-top:14px"><button class="btn primary" data-post>Post entry</button> <small style="color:var(--muted)">Debit what the business gains or spends on; credit where the value came from.</small></p>`;
    (root.querySelector('#cr') as HTMLSelectElement).value = 'sales';
    root.querySelector('[data-post]')!.addEventListener('click', () => {
      const r = G.postEntry(s, (root.querySelector('#dr') as HTMLSelectElement).value as Account, (root.querySelector('#cr') as HTMLSelectElement).value as Account);
      r?.ok ? sfx.good() : sfx.bad(); sfx.scribble(); render(root, close);
    });
  };
  openModal('', render, async () => {
    if (s.shift) { // finish (or walk out early: unposted entries count as errors)
      while (s.shift.index < s.shift.entries.length) { s.shift.errors++; s.shift.index++; s.job.attention += B.ATTENTION_PER_ERROR; }
      await hud.fade('Four hours later…', 1200);
      const res = G.endShift(s); if (res && res.pay) sfx.coin();
    }
    player.action = null; vm.play('none', 0); player.pos.set(it.pos.x, 0, it.pos.z); save(); relock();
  });
}
// ---- v0.9: the grid pack ----
type InvCat = 'arms' | 'food' | 'medicine' | 'materials' | 'quest';
let invSel: B.ItemId | null = null, invFilter: 'all' | InvCat = 'all';
function invCat(k: B.ItemId): InvCat {
  const kind = B.ITEMS[k].kind;
  if (kind === 'ammo' || k === 'oil') return 'arms';
  if (kind === 'quest') return 'quest';
  if (k === 'bandage' || k === 'medkit' || k === 'tonic' || k === 'draught' || k === 'manadraught' || k === 'salve' || k === 'salts') return 'medicine';
  if (kind === 'meal' || kind === 'food' || G.isEdible(k) || k === 'ration') return 'food';
  return 'materials';
}
/** Tile size (columns × rows) by what the thing is. */
function invSize(k: B.ItemId): [number, number] {
  const big: Partial<Record<B.ItemId, [number, number]>> = { shipsbell: [2, 2], medkit: [2, 1], rod: [1, 3], pickaxe: [1, 3], wolfpelt: [2, 2], pelt: [2, 1], boarmeat: [2, 1], pike: [2, 1], eel: [2, 1], blastcharge: [2, 1], signallantern: [1, 2], ormcrown: [2, 1], customsledger: [1, 2], wrenlog: [1, 2], flour: [1, 2], stew: [1, 2], pikepie: [2, 1], fishsupper: [2, 1] };
  return big[k] ?? ([1, 1] as [number, number]);
}
const INV_ICON: Record<string, string> = { arms: '🧰', food: '🍞', medicine: '🩹', materials: '🪨', quest: '📜', revolver: '🔫', carbine: '🎯', scattergun: '💥', longrifle: '🔭',
  ammo: '🔸', silverammo: '⚪', carbineammo: '🟤', shells: '🔴', riflerounds: '🟡', oil: '🛢️', bread: '🍞', ration: '🥫', tonic: '🧪', draught: '❤️', manadraught: '💧', bandage: '🩹', medkit: '⛑️', salve: '🫙', salts: '🧂', soap: '🧼',
  herbs: '🌿', moonpetal: '🌸', dust: '✨', cinder: '🔥', pelt: '🦊', wolfpelt: '🐺', tusk: '🦷', copper: '🟠', wardcopper: '🟧', tags: '🏷️', rod: '🎣', pickaxe: '⛏️', eggs: '🥚', milk: '🥛', apple: '🍎', cheese: '🧀',
  trout: '🐟', eel: '🐍', perch: '🐟', pike: '🐟', mackerel: '🐟', saltfish: '🐟', smokedfish: '🐟', mushrooms: '🍄', berries: '🫐', bilberries: '🫐', heather: '💜', honey: '🍯', flour: '🌾', onion: '🧅', boarmeat: '🥩', crabmeat: '🦀', mussels: '🐚', samphire: '🌱',
  tea: '🍵', heathertea: '🍵', stew: '🍲', mushroomstew: '🍲', musselbroth: '🍲', honeycake: '🍰', berrytart: '🥧', bilberrycake: '🍰', omelette: '🍳', roastboar: '🍖', fishsupper: '🍽️', eelpie: '🥧', pikepie: '🥧', grilledtrout: '🐟', friedperch: '🐟', crabcakes: '🦀', samphiresalad: '🥗', grilledmackerel: '🐟',
  ember: '🔥', censer: '🕯️', barrowgold: '🪙', ormcrown: '👑', shipsbell: '🔔', blastcharge: '🧨', signallantern: '🏮', customsledger: '📒', wrenlog: '📓', reedring: '💍', westkey: '🗝️', barrowkey: '🗝️', rowanward: '🪬' };
for (const k of B.ITEM_IDS) if (B.ITEMS[k].kind === 'charm' && !INV_ICON[k]) INV_ICON[k] = '🧿';
function openInventory() {
  let confirmKeep = '';
  const render = (root: HTMLElement, close: () => void) => {
    const inv = s.inventory, ld = G.loadState(s);
    const useBtn = (k: B.ItemId): string => {
      const kind = B.ITEMS[k].kind, b = (label: string, on = true) => `<button class="btn" data-use="${k}" ${on ? '' : 'disabled'}>${label}</button>`;
      if (k === 'bread' || kind === 'meal' || k === 'ration') return b('Eat');
      if (k === 'tonic' || k === 'draught' || k === 'manadraught') return b('Drink', k !== 'draught' || s.hp < G.maxHp(s));
      if (k === 'bandage') return b('Bind a wound', s.wounds.length > 0);
      if (k === 'medkit') return b('Stitch', s.wounds.length > 0);
      if (k === 'oil') return b('Clean revolver', s.revolverCond < 99);
      if (B.ITEMS[k].kind === 'charm') return b(s.charm === k ? 'Take off' : 'Wear', true);
      if (k === 'salve' || k === 'salts') return b('Use', true);
      if (G.isEdible(k)) return b('Eat', true);
      if ((k === 'ember' || k === 'censer') && s.story[k] === '') return b(confirmKeep === k ? 'Sure? It cannot be undone' : 'Bind it into your staff (keep)');
      return '';
    };
    // v0.9 (docs/gdd/arms.md): a grid pack. Each kind of item is one tile sized by what it is; weight is still the limit.
    const ITEMS = (Object.keys(inv) as B.ItemId[]).filter(k => inv[k] > 0 && (invFilter === 'all' || invCat(k) === invFilter));
    const rows = 6 + (s.gear.satchel ? 2 : 0), cols = 10, grid: (B.ItemId | null)[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
    const placed: { k: B.ItemId; x: number; y: number; w: number; h: number }[] = [];
    for (const k of ITEMS.slice().sort((a, b) => invSize(b)[0] * invSize(b)[1] - invSize(a)[0] * invSize(a)[1] || invCat(a).localeCompare(invCat(b)))) {
      const [w, h] = invSize(k); let done = false;
      for (let y = 0; !done; y++) {
        if (y + h > grid.length) grid.push(Array(cols).fill(null));       // more than the frame holds: it spills below the line
        for (let x = 0; x + w <= cols && !done; x++) {
          let free = true; for (let yy = y; yy < y + h && free; yy++) for (let xx = x; xx < x + w; xx++) if (grid[yy]?.[xx]) { free = false; break; }
          if (!free) continue;
          while (grid.length < y + h) grid.push(Array(cols).fill(null));
          for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) grid[yy][xx] = k;
          placed.push({ k, x, y, w, h }); done = true;
        }
      }
    }
    if (invSel && inv[invSel] <= 0) invSel = null;
    const pct = Math.min(100, ld.kg / ld.cap * 100), barC = ld.band === 'light' ? 'var(--good,#7fb069)' : ld.band === 'heavy' ? '#d8b04a' : '#d85a4a';
    const gunCard = (g: B.FirearmId) => { const GD = B.GUNS[g], own = G.ownedGuns(s).includes(g), on = s.firearm === g;
      const r = g === 'revolver' ? `${s.ammo.mag}/${GD.mag}${s.silverIn > 0 ? ` (${s.silverIn} silver)` : ''} · ${s.ammo.reserve + inv.ammo * 6} lead${inv.silverammo ? ` · ${inv.silverammo * 6} silver` : ''}` : g === 'carbine' ? `${s.rifle.mag}/${GD.mag} · ${s.rifle.reserve + inv.carbineammo * 8} spare` : `${s.guns[g].mag}/${GD.mag} · ${s.guns[g].reserve + inv[GD.ammo] * GD.perBox} spare`;
      return own ? `<div class="gun ${on ? 'on' : ''}"><div class="gi">${INV_ICON[g]}</div><div><b>${GD.name}</b><br><small>${GD.pellets > 1 ? `${GD.pellets}×${GD.damage}` : GD.damage} dmg · ${r}</small></div>${on ? '<span class="tag">in hand</span>' : `<button class="btn" data-gun="${g}">Take up</button>`}</div>` : ''; };
    root.innerHTML = `<h2>Pack</h2><p class="sub">${s.crowns} crowns${s.charm ? ` · wearing the ${B.ITEMS[s.charm].name.toLowerCase()}` : ''} · revolver ${T.condText(s.revolverCond)}</p>
      <div class="invwrap">
        <div class="invcol">
          <h3>Arms</h3>${B.FIREARM_IDS.map(gunCard).join('')}
          ${inv.silverammo > 0 || s.silverIn > 0 ? `<label class="chk"><input type="checkbox" data-silver ${s.loadSilver ? 'checked' : ''}> Load silvered rounds first</label>` : ''}
          <h3>Worn and carried</h3><p class="chips">${(Object.keys(s.gear) as B.GearId[]).filter(g => s.gear[g] && !(B.FIREARM_IDS as string[]).includes(g)).map(g => `<span class="chip" title="${B.GEAR[g].desc.replace(/"/g, '&quot;')}">${B.GEAR[g].name}</span>`).join('') || '<small style="color:var(--muted)">Nothing yet</small>'}${s.charm ? `<span class="chip charm">${B.ITEMS[s.charm].name}</span>` : ''}</p>
        </div>
        <div class="invmid">
          <div class="wbar"><div style="width:${pct}%;background:${barC}"></div><span>${ld.kg} / ${ld.cap.toFixed(1)} kg · ${ld.band}${ld.band === 'heavy' ? ': stamina recovers slower' : ld.band === 'over' ? ': no running' : ld.band === 'crushing' ? ': barely moving' : ''}</span></div>
          <p class="tabs">${(['all', 'arms', 'food', 'medicine', 'materials', 'quest'] as const).map(f => `<button class="btn ${invFilter === f ? 'primary' : ''}" data-filter="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</p>
          <div class="igrid" style="grid-template-columns:repeat(${cols},1fr);grid-template-rows:repeat(${grid.length},46px)">
            ${Array.from({ length: grid.length * cols }, (_, i) => `<div class="cell ${Math.floor(i / cols) >= rows ? 'over' : ''}" style="grid-column:${i % cols + 1};grid-row:${Math.floor(i / cols) + 1}"></div>`).join('')}
            ${placed.map(p => `<button class="tile c-${invCat(p.k)} ${invSel === p.k ? 'sel' : ''}" data-sel="${p.k}" title="${B.ITEMS[p.k].name}" style="grid-column:${p.x + 1}/span ${p.w};grid-row:${p.y + 1}/span ${p.h}"><span class="ic">${INV_ICON[p.k] ?? INV_ICON[invCat(p.k)]}</span><span class="n">${inv[p.k]}</span></button>`).join('')}
          </div>
          ${grid.length > rows ? '<p class="sub" style="color:#d8a04a">Your pack is overfull: the tiles below the line are strapped on the outside.</p>' : ''}
        </div>
        <div class="invcol detail">${invSel ? `<div class="big">${INV_ICON[invSel] ?? INV_ICON[invCat(invSel)]}</div><h3>${B.ITEMS[invSel].name}</h3><p>${B.ITEMS[invSel].desc}</p><p class="sub">× ${inv[invSel]} · ${(B.ITEMS[invSel].weight * inv[invSel]).toFixed(1)} kg · ${invCat(invSel)}</p><p>${useBtn(invSel)}</p>` : '<p style="color:var(--muted)">Pick something in the pack to see it and use it.</p>'}</div>
      </div>
      <div class="card"><h3>Wounds</h3>${s.wounds.length ? s.wounds.map(w => `<p>${w.label}: max health −${w.severity}</p>`).join('') : '<p style="color:var(--muted)">None. Keep it that way.</p>'}</div>
       ${G.activeBuffs(s).length || (s.story.flags.blessedUntil ?? 0) > s.minutes ? `<div class="card"><h3>Effects</h3>${G.activeBuffs(s).map(b => `<p>${B.BUFFS[b.id].name}: ${B.BUFFS[b.id].desc} · ${Math.round(b.left)} min left</p>`).join('')}${(s.story.flags.blessedUntil ?? 0) > s.minutes ? `<p>Quiet Flame: stress builds half as fast · ${Math.round((s.story.flags.blessedUntil - s.minutes) / 60)} h left</p>` : ''}</div>` : ''}
       <div class="card"><h3>Magic and your body</h3><p style="color:var(--muted)">Each spell burns calories as well as mana. Mana refills by itself, but every point uses ${B.MANA_WATER_ML} ml of water; thirsty, it refills slowly, and badly dehydrated it stops. Mend restores health but cannot close wounds. Now: mana refill ×${B.manaRegenFactor(s.needs.hydration).toFixed(2)}.</p></div>
       <p><button class="btn primary" data-close>Close</button> <button class="btn" data-journal>Journal: quests, skills, people</button></p>`;
    root.querySelectorAll('[data-sel]').forEach(b => b.addEventListener('click', () => { invSel = (b as HTMLElement).dataset.sel as B.ItemId; sfx.ui(); render(root, close); }));
    root.querySelectorAll('[data-filter]').forEach(b => b.addEventListener('click', () => { invFilter = (b as HTMLElement).dataset.filter as typeof invFilter; render(root, close); }));
    root.querySelectorAll('[data-gun]').forEach(b => b.addEventListener('click', () => { if (G.setFirearm(s, (b as HTMLElement).dataset.gun as B.FirearmId)) { sfx.reload(); player.reloading = 0; selectSlot('carbine'); } render(root, close); }));
    root.querySelector('[data-silver]')?.addEventListener('change', e => { s.loadSilver = (e.target as HTMLInputElement).checked; sfx.ui(); render(root, close); });
    root.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { sfx.ui(); close(); }));
    root.querySelector('[data-journal]')!.addEventListener('click', () => { close(); P.openJournal(ui, 'character'); });
    root.querySelector('[data-firearm]')?.addEventListener('click', () => { if (R.switchFirearm(s)) { sfx.reload(); player.reloading = 0; selectSlot('carbine'); } render(root, close); });
    root.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => {
      const k = (b as HTMLElement).dataset.use as B.ItemId;
      if (k === 'bread') { G.eat(s, 'bread'); sfx.eat(); }
      else if (k === 'medkit') { if (G.useMedkit(s)) sfx.good(); }
      else if (B.ITEMS[k].kind === 'charm') { if (R.wearCharm(s, k)) sfx.ui(); }
      else if (k === 'salve' || k === 'salts') { const msg = R.useItem(s, k); if (msg) { G.log(s, msg, 'good'); sfx.good(); if (k === 'salve') hud.heal(20); } }
      else if (B.ITEMS[k].kind === 'meal' || G.isEdible(k)) { if (G.eatMeal(s, k)) sfx.eat(); }
      else if (k === 'tonic') { G.useTonic(s); sfx.water(); }
      else if (k === 'draught' || k === 'manadraught') { if (T.useDraught(s, k)) { sfx.water(); if (k === 'draught') hud.heal(35); } }
      else if (k === 'bandage') { G.treatWound(s); G.advanceMinutes(s, 10, 'rest'); }
      else if (k === 'oil') { if (T.cleanRevolver(s, 'oil')) sfx.reload(); }
      else if (k === 'ember' || k === 'censer') { if (confirmKeep !== k) confirmKeep = k; else { S.decideStone(s, k, 'kept'); S.updateQuests(s); sfx.ward(); confirmKeep = ''; save(); } }
      render(root, close);
    }));
  };
  openModal('', render, relock);
}
function openJournal() { P.openJournal(ui, 'quests'); }
const K = (a: Action) => keyName(cfg.bindings[a]);
const controlsHtml = () => `<div class="controls"><b>Mouse</b><span>Look (click the game to capture the mouse)</span><b>${K('forward')} ${K('left')} ${K('back')} ${K('right')}</b><span>Move · ${K('sprint')} to run · ${K('jump')} to jump · ${K('dodge')} to dodge</span><b>Left click</b><span>Fire the revolver or cast the selected spell</span><b>Right click / ${K('melee')}</b><span>Melee strike</span><b>${K('slot1')} ${K('slot2')} ${K('slot3')} ${K('slot4')} ${K('slot5')} ${K('slot6')}</b><span>Revolver · Firebolt · Frost Shard · Stone Ward · Mend · Spark (once learned)</span><b>${K('holster')}</b><span>Holster or draw your weapon</span><b>${K('reload')}</b><span>Reload</span><b>${K('interact')}</b><span>Use, talk, take</span><b>${K('view')}</b><span>First / third person</span><b>${K('lantern')}</b><span>Lantern, once you own one</span><b>${K('quickEat')}</b><span>Eat a loaf from your pack</span><b>${K('inventory')}</b><span>Pack, wounds, record</span><b>${K('journal')} · ${K('map')}</b><span>Journal and quests · map</span><b>F3</b><span>Performance overlay</span><b>Esc</b><span>Menu, save, settings and key bindings</span></div>`;
function openMenu() {
  if (hud.modalOpen || !started) return;
  openModal(`<h2>Paused</h2><p class="sub">Day ${G.day(s)}, ${G.clock(s)} · ${s.crowns} crowns · debt ${s.debt}</p>
    <p><button class="btn primary" data-close>Resume</button> <button class="btn" data-save>Save game</button> <button class="btn" data-load>Load game</button> <button class="btn" data-new>New game</button> <button class="btn" data-settings>Settings</button></p>
    <div class="card"><h3>Controls</h3>${controlsHtml()}</div>`, (root, close) => {
    root.querySelector('[data-save]')!.addEventListener('click', () => { close(); openSlots('save'); });
    root.querySelector('[data-load]')!.addEventListener('click', () => { close(); openSlots('load'); });
    root.querySelector('[data-settings]')!.addEventListener('click', () => { close(); openSettings(); });
    const nb = root.querySelector('[data-new]') as HTMLButtonElement;
    nb.addEventListener('click', () => { close(); chooseDifficulty(d => { newGame(d); relock(); }, () => openMenu()); });
  }, relock);
}
/** Save or load picker: three manual slots plus the autosave. Overwriting asks once, in the page. */
function openSlots(mode: 'save' | 'load', onDone?: (loaded: boolean) => void) {
  const render = (root: HTMLElement, close: () => void) => {
    const rows = (mode === 'load' ? (['auto', '1', '2', '3'] as SlotId[]) : (['1', '2', '3'] as SlotId[])).map(id => {
      const m = slotMeta(id);
      const label = id === 'auto' ? 'Autosave' : `Slot ${id}`;
      const desc = m ? `Day ${m.day}, ${m.time} · ${m.crowns} crowns · debt ${m.debt} · ${m.where}<br><small style="color:var(--muted)">Saved ${m.saved}</small>` : '<span style="color:var(--muted)">Empty</span>';
      const btn = mode === 'save' ? `<button class="btn ${m ? '' : 'primary'}" data-slot="${id}">${m ? 'Overwrite' : 'Save here'}</button>` : `<button class="btn primary" data-slot="${id}" ${m ? '' : 'disabled'}>Load</button>`;
      return `<div class="row2"><div><b>${label}</b><br>${desc}</div>${btn}${mode === 'save' && m ? '' : ''}</div>`;
    }).join('');
    root.innerHTML = `<h2>${mode === 'save' ? 'Save game' : 'Load game'}</h2><p class="sub">${mode === 'save' ? 'Pick a slot. Slots stay until you overwrite them, even if you start a new game.' : 'Go back to any saved point. The game also autosaves every in-game hour, after sleeping and after shifts.'}</p>${rows}<p id="slotmsg" style="color:var(--muted)"></p><p><button class="btn" data-back>Back</button></p>`;
    root.querySelector('[data-back]')!.addEventListener('click', () => { sfx.ui(); close(); onDone ? onDone(false) : (started && openMenu()); });
    root.querySelectorAll('[data-slot]').forEach(b => b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.slot as SlotId, el = b as HTMLButtonElement;
      if (mode === 'save') {
        if (slotMeta(id) && !el.dataset.confirm) { el.dataset.confirm = '1'; el.textContent = 'Click again to overwrite'; return; }
        if (saveTo(id)) { sfx.coin(); render(root, close); (root.querySelector('#slotmsg') as HTMLElement).textContent = `Saved to slot ${id}.`; }
        else (root.querySelector('#slotmsg') as HTMLElement).textContent = 'This browser is blocking storage, so the game cannot be saved here.';
      } else if (loadFrom(id)) { sfx.good(); close(); if (onDone) onDone(true); }
    }));
  };
  openModal('', render, started ? relock : undefined);
}
function showGameover() {
  const fail = s.gameover === 'debt';
  if (!fail) S.setFlag(s, 'endingShown', s.story.wardsDone ? 2 : 1);
  fail ? sfx.bad() : sfx.quest();
  P.openEnding(ui, () => { s.gameover = null; s.story.freePlay = true; gameoverShown = false; G.log(s, 'Life goes on in Millbrook.', 'info'); save(); relock(); }, () => chooseDifficulty(d => { newGame(d); relock(); }, () => { gameoverShown = false; }));
}
/** Pick how hard the body and the Vale are, then start. */
function chooseDifficulty(start: (d: B.Difficulty) => void, cancel?: () => void) {
  openModal(`<h2>A new life in Millbrook</h2><p class="sub">Your save slots are kept. You can change nothing about this later, so choose what sounds like fun.</p>
    ${(Object.keys(B.DIFFICULTY) as B.Difficulty[]).map(d => `<div class="row2"><div><b>${B.DIFFICULTY[d].name}</b><br><small style="color:var(--muted)">${B.DIFFICULTY[d].desc}</small></div><button class="btn ${d === 'standard' ? 'primary' : ''}" data-d="${d}">Begin</button></div>`).join('')}
    ${cancel ? '<p><button class="btn" data-back>Back</button></p>' : ''}`, (root, close) => {
    root.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => { close(); start((b as HTMLElement).dataset.d as B.Difficulty); }));
    root.querySelector('[data-back]')?.addEventListener('click', () => { close(); cancel!(); });
  });
}

// ---------------- save / load ----------------
type SlotId = 'auto' | '1' | '2' | '3';
const slotKey = (id: SlotId) => id === 'auto' ? G.SAVE_KEY : `wards-of-millbrook-slot-${id}`;
function slotMeta(id: SlotId): { day: number; time: string; crowns: number; debt: number; where: string; saved: string } | null {
  let raw: string | null = null; try { raw = localStorage.getItem(slotKey(id)); } catch { return null; }
  const o = raw ? G.deserialize(raw) : null; if (!o) return null;
  return { day: G.day(o.s), time: G.clock(o.s), crowns: o.s.crowns, debt: o.s.debt, where: o.extra?.where ?? 'Millbrook', saved: o.extra?.savedAt ? new Date(o.extra.savedAt).toLocaleString() : '' };
}
function hasSave() { return (['auto', '1', '2', '3'] as SlotId[]).some(id => slotMeta(id)); }
function saveTo(id: SlotId): boolean {
  if (s.gameover) return false;
  const where = world.inChapelArea(player.pos) ? 'the Sunken Chapel' : world.inMillArea(player.pos) ? 'the Old Mill' : world.inMineArea(player.pos) ? 'Copper Hollow' : world.insideBuilding(player.pos) ?? (player.pos.x > 42 ? world.regionAt(player.pos).name : player.pos.z > 32 ? 'the Whispering Vale' : 'Millbrook');
  try { localStorage.setItem(slotKey(id), G.serialize(s, { pos: [player.pos.x, player.pos.z], yaw: player.yaw, view: player.view, slot: player.slot, holstered, where, savedAt: Date.now(), feed: feed.save() })); return true; } catch { return false; }
}
function save() { saveTo('auto'); }
function loadFrom(id: SlotId): boolean {
  let raw: string | null = null; try { raw = localStorage.getItem(slotKey(id)); } catch { return false; }
  const o = raw ? G.deserialize(raw) : null; if (!o) return false;
  s = o.s; resetWorldState();
  if (o.extra?.feed) feed.load(o.extra.feed);
  if (o.extra?.pos) { player.pos.set(o.extra.pos[0], 0, o.extra.pos[1]); if (world.inMillArea(player.pos)) { world.setMillMode(true); spawnMill(); } else if (world.inChapelArea(player.pos)) { world.setDungeon('chapel'); spawnChapel(); } else if (world.inMineArea(player.pos)) { world.setDungeon('mine'); spawnMine(); } else if (world.inBarrowArea(player.pos)) { world.setDungeon('barrow'); barrowWoke = { ante: false, hall: false }; } else if (world.inSeaCaveArea(player.pos)) { world.setDungeon('seacave'); caveGuards = false; } else world.setDungeon(null); player.yaw = o.extra.yaw ?? 0; player.view = o.extra.view ?? 'first'; selectSlot(o.extra.slot ?? 'carbine'); if (o.extra.holstered) toggleHolster(); }
  gameoverShown = false;
  G.log(s, `Loaded ${id === 'auto' ? 'the autosave' : `slot ${id}`}.`, 'info');
  return true;
}
function load(): boolean { return loadFrom('auto'); }
/** New game never touches the save slots; the autosave starts fresh. */
function newGame(d: B.Difficulty = 'standard') { s = G.newGame(Math.floor(Math.random() * 1e6), d); resetWorldState(); S.updateQuests(s); player.pos.copy(world.homeSpawn); player.yaw = Math.PI / 2; player.pitch = 0; gameoverShown = false; save(); }
function resetWorldState() {
  for (const e of [...enemies.list]) enemies.remove(e);
  ambientDay = -1; player.action = null; player.shield = 0; player.reloading = 0;
  boss.reset(); if (s.flags.millCleared) { boss.dead = true; }
  wraith.dead = false; wraith.reset(); if (S.flag(s, 'chapelCleared')) wraith.dead = true;
  { const drained = !!(S.flag(s, 'valveA') && S.flag(s, 'valveB')); world.chapel.flood = drained ? 0 : 1; world.chapel.water.position.y = 0.06 + world.chapel.flood * 0.5; world.chapel.water.visible = !drained; setChapelGate(world, drained); }
  millGateOpen = s.flags.notesRead.includes('gate'); millGateOpen ? world.openMillGate() : world.closeMillGate();
  looted.clear(); world.setMillMode(false); feed.lines.length = 0;
  for (const p of pickups) world.scene.remove(p.mesh); pickups.length = 0; player.lantern = false; player.dodgeT = 0; lastDayNoted = -1; gate.active = false;
  // v0.9.3: the coast. A charge set when the game was saved burns again from the start; the gap, the bell and the
  // lantern follow the story flags; the Wreck-Mother is back in her pool unless she is dead.
  fuseRemaining = B.BLAST.fuse; tideWarned = -1; slowUntil = 0; caveGuards = false; floodTarget = 0; world.seacave.setFlood(0);
  mother.dead = false; mother.reset(); if (S.flag(s, 'motherDown')) mother.dead = true;
  syncCoastProps();
  barrowKing.dead = false; barrowKing.reset(); if (S.flag(s, 'ormDown')) barrowKing.dead = true; world.barrowDark = false; westNight = -1; gorseSpawned = false; syncBarrow();
  refreshNodes(); storyTick(true);
}
let lastSaveHour = -1;

// ---------------- intro ----------------
function intro() {
  // v0.9: the title screen. The live world is drawn behind it: the camera circles Millbrook at golden hour
  // (see the frame loop), and the menu sits on a dark band on the left.
  const d = document.createElement('div'); d.id = 'intro';
  const auto = slotMeta('auto');
  d.innerHTML = `<div class="tside">
      <div class="crest"><svg viewBox="0 0 64 72" width="58" height="66" aria-hidden="true"><path d="M32 3 L59 13 V36 C59 53 46 63 32 69 C18 63 5 53 5 36 V13 Z" fill="#1a140c" stroke="#d8b26a" stroke-width="3"/><path d="M32 16 L44 22 V36 C44 45 38 51 32 54 C26 51 20 45 20 36 V22 Z" fill="none" stroke="#d8b26a" stroke-width="2"/><circle cx="32" cy="35" r="5" fill="#d8b26a"/></svg></div>
      <p class="kicker">A survival life-sim of debts, wards and gunpowder</p>
      <h1><span>Wards</span><small>of</small><span>Millbrook</span></h1>
      <nav class="tmenu">
        ${auto ? `<button class="tbtn primary" id="go">Continue<small>Day ${auto.day}, ${auto.time}</small></button>` : '<button class="tbtn primary" id="go">New game<small>Aunt Ysolde\'s house is waiting</small></button>'}
        ${auto ? '<button class="tbtn" id="fresh">New game</button>' : ''}
        <button class="tbtn" id="loadslot" ${hasSave() ? '' : 'disabled'}>Load game</button>
        <button class="tbtn" id="tsettings">Settings</button>
        <button class="tbtn" id="thow">How to play</button>
        <button class="tbtn" id="tcred">Credits</button>
      </nav>
      <p class="tver">v0.9.3 · The Saltway Coast · saves stay in this browser</p>
    </div>
    <div class="tnews"><h3>New: the Saltway Coast</h3><p>Blast the Salt Gap south of the Whisper Stones and walk the Saltway down to Gullhaven. Wade the tidal flats at low water, find out who showed the false light that wrecked the Merry Wren, and go under the cliffs to the Wreck-Mother. Five quests, twelve people, crabs, smugglers and the tide.</p></div>`;
  document.body.appendChild(d); document.body.classList.add('titling');
  const enter = () => { d.remove(); document.body.classList.remove('titling'); introOpen = false; started = true; paused = false; vm.root.visible = true; lockPointer(); };
  const begin = (fresh: boolean) => { sfx.start(); sfx.setVolume(cfg.volume, cfg.sfxVolume); if (!fresh && auto && load()) { enter(); return; } chooseDifficulty(dd => { newGame(dd); enter(); }); };
  d.querySelector('#go')!.addEventListener('click', () => begin(false));
  d.querySelector('#fresh')?.addEventListener('click', () => begin(true));
  d.querySelector('#loadslot')!.addEventListener('click', () => { sfx.start(); sfx.setVolume(cfg.volume, cfg.sfxVolume); openSlots('load', loaded => { if (loaded) enter(); }); });
  d.querySelector('#tsettings')!.addEventListener('click', () => { sfx.ui(); openSettings(); });
  d.querySelector('#thow')!.addEventListener('click', () => { sfx.ui(); openModal(`<h2>How to play</h2><p class="sub">Aunt Ysolde left you a stone house at the edge of Millbrook, a revolver, a staff, and the three hundred crowns she still owed Aldric Voss. Your body needs feeding, watering, washing and sleep. Work the town ledger for honest pay, or take notices from the board and go into the Vale, where the old wards are failing. Sixty crowns are due every seven days.</p><div class="card">${controlsHtml()}</div><p><button class="btn primary" data-close>Back</button></p>`, (root, close) => root.querySelector('[data-close]')!.addEventListener('click', () => close())); });
  d.querySelector('#tcred')!.addEventListener('click', () => { sfx.ui(); openModal(`<h2>Credits</h2><p>Designed for and with Waiz (Mir Waiz Usayed). Built by Claude in TypeScript and three.js.</p><p class="sub">It joins four earlier games: Mercenary Maintenance's body and economy, VEILWORK's first-person combat, Ledger &amp; Ward's Millbrook, and Home Office Tycoon's bookkeeping. Every model, sound and line is made in code; nothing is licensed from anyone else.</p><p><button class="btn primary" data-close>Back</button></p>`, (root, close) => root.querySelector('[data-close]')!.addEventListener('click', () => close())); });
  vm.root.visible = false;
}
// Pre-compile every shader the game can need, including things that are normally hidden (shower water,
// boss telegraphs, tracers, puffs, the boss): compiling one mid-fight is a visible hitch.
function prewarm() {
  const hidden: THREE.Object3D[] = [];
  world.scene.traverse(o => { if (!o.visible && !(o as THREE.Light).isLight) { hidden.push(o); o.visible = true; } });
  const tl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 1, 0)]), new THREE.LineBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0.8 }));
  const pm = new THREE.Mesh(PUFF_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
  // v0.8: every enemy kind, the later bosses and the spell projectiles are compiled too, and one real frame is
  // drawn so the shadow-pass (depth) programs exist before play; lights are never made visible here.
  const temps: THREE.Object3D[] = [engine.model.root, barrowKing.model.root];
  for (const k of ['hound', 'raider', 'shade', 'drowned', 'imp', 'wolf', 'boar', 'bandit', 'hollow', 'wight', 'wisp', 'crab', 'smuggler', 'pistoleer'] as EnemyKind[]) { const e = enemies.spawn(k, camera.position.clone().add(new THREE.Vector3(0, 0, -6)), 'prewarm'); temps.push(e.root); }
  for (const k of ['fire', 'frost', 'orb', 'bolt', 'shot'] as const) enemies.fireProjectile(camera.position.clone().add(new THREE.Vector3(0, 1, -4)), new THREE.Vector3(0, 0, -1), 'enemy', k, 0);
  // an instanced caster at the shadow box's centre, so the instanced shadow-depth program is compiled too
  // (found by the v0.8 bench: the one program still compiled during play, at Copper Hollow)
  // three.js keeps one shared depth material and only picks a new program when instancing or skinning changes, so
  // the variant depends on draw order: each instanced caster material is drawn right after a plain caster here.
  const casters = world.instMeshes.filter(m => m.castShadow), front = casters.find(m => (m.material as THREE.Material).side === THREE.FrontSide);
  const instTmp: THREE.Mesh[] = [];
  for (const c of new Map(casters.map(m => [m.material, m] as const)).values()) {
    const plain = new THREE.Mesh(c.geometry, front ? front.material : c.material), t = new THREE.InstancedMesh(c.geometry, c.material, 1);
    for (const m of [plain, t]) { m.castShadow = true; m.frustumCulled = false; m.position.copy(world.sun.target.position); world.scene.add(m); instTmp.push(m); }
    t.setMatrixAt(0, new THREE.Matrix4());
  }
  world.scene.add(tl, pm, boss.model.root, wraith.model.root, engine.model.root, barrowKing.model.root, mother.model.root);
  const bossVis = [boss.model.root.visible, wraith.model.root.visible]; for (const r of [boss.model.root, wraith.model.root, engine.model.root, barrowKing.model.root, mother.model.root]) r.visible = true;
  applySettings(true);
  renderer.compile(world.scene, camera);
  renderer.render(world.scene, camera);
  world.scene.remove(tl, pm, boss.model.root, wraith.model.root, engine.model.root, barrowKing.model.root, mother.model.root); tl.geometry.dispose();
  for (const t of instTmp) { world.scene.remove(t); if ((t as THREE.InstancedMesh).isInstancedMesh) (t as THREE.InstancedMesh).dispose(); }
  boss.model.root.visible = bossVis[0]; wraith.model.root.visible = bossVis[1]; engine.model.root.visible = false; barrowKing.model.root.visible = false; mother.model.root.visible = mother.active;
  enemies.clearTag('prewarm'); for (const p of [...enemies.projectiles]) world.scene.remove(p.mesh); enemies.projectiles.length = 0; void temps;
  for (const o of hidden) o.visible = false;
}
prewarm();
intro();

// ---------------- loop ----------------
// One loop only (guarded). dt comes from the rAF timestamp, which is aligned to the display's vsync,
// instead of a separate clock sampled at an arbitrary point in the frame. Long stalls are clamped to
// 0.1 s so a hitch cannot teleport you, but ordinary 30–60 fps frames are never slowed down.
let hudT = 0, footT = 0, feedT = 0, gameoverShown = false, lastTs = -1, loopStarted = false, capAcc = 0;
function frame(ts: number) {
  requestAnimationFrame(frame);
  if (lastTs < 0) { lastTs = ts; return; }
  let raw = ts - lastTs;
  if (cfg.fpsCap) { capAcc += raw; const need = 1000 / cfg.fpsCap - 1.5; if (capAcc < need) { lastTs = ts; return; } raw = capAcc; capAcc = 0; }
  lastTs = ts;
  perf.frame(raw);
  const dt = Math.min(0.1, raw / 1000);
  now += dt;
  applyLook();
  const live = started && !hud.modalOpen && !s.gameover && !busyCollapse;
  if (live) update(dt);
  else if (started && !gameoverShown && s.gameover && !hud.modalOpen) { gameoverShown = true; showGameover(); }
  if (!s.gameover) gameoverShown = false;
  // visuals always animate
  const h = introOpen ? 17.3 : (s.minutes % 1440) / 60;
  world.setTime(h, player.pos); if (world.dungeon) world.dungeonAtmosphere(); world.updateLights(dt, player.pos, now); world.animate(now);
  // Night eyes (bilberry cake): the dark is less dark: more ambient light and fog pushed back, outdoors at night
  if (!world.dungeon && world.night > 0.3 && G.buffActive(s, 'nightEyes')) { const k = (world.night - 0.3) / 0.7; world.hemi.intensity += 0.35 * k; const fog = world.scene.fog as THREE.Fog; fog.far *= 1 + 0.35 * k; }
  world.updateRegions(player.pos); world.east.animate(dt, now, player.pos); world.west.animate(dt, now, player.pos); if (world.dungeon === 'barrow') world.barrow.animate(dt, now); updateEwe(dt);
  world.updateRoofs(player.pos, player.view === 'third');
  for (const t of folk) t.update(dt, h, player.pos);
  updatePlayerVisual(dt);
  // weather, lantern, compass
  const outdoors = !world.dungeon && !player.indoors;
  weatherFx.update(dt, camera.position, world.weather, outdoors);
  lanternAnchor.on = player.lantern && s.gear.lantern; lanternAnchor.zone = world.dungeon ?? 'out';
  if (lanternAnchor.on) lanternAnchor.pos.set(player.pos.x - Math.sin(player.yaw) * 0.5, player.pos.y + 1.5, player.pos.z - Math.cos(player.yaw) * 0.5);
  lanternMesh.visible = lanternAnchor.on; bellCarry.visible = coast.carryingBell(s);
  if (started) { let hd = (-player.yaw * 180 / Math.PI) % 360; if (hd < 0) hd += 360; hud.compass(hd, compassMarks()); }
  for (const tr of [...tracers]) { tr.life -= dt; if (tr.life <= 0) { world.scene.remove(tr.line); tr.line.geometry.dispose(); (tr.line.material as THREE.Material).dispose(); tracers.splice(tracers.indexOf(tr), 1); } }
  for (const p of [...puffs]) { p.life -= dt; p.mesh.scale.multiplyScalar(1 + dt * 4); (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life * 2.5); if (p.life <= 0) { world.scene.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); puffs.splice(puffs.indexOf(p), 1); } }
  healGlow = Math.max(0, healGlow - dt);
  if (world.showerDrops.visible) { const a = world.showerDrops.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) { let y = a.getY(i) - dt * 5; if (y < 0) y += 2.1; a.setY(i, y); } a.needsUpdate = true; }
  hudT -= dt; feedT -= dt;
  if (hudT <= 0 && started) { hudT = 0.1; updateHud(); }
  if (feedT <= 0 && started && !s.gameover) { feedT = 1; feed.tick(s, feedCtx()); hud.feed(feed.lines, s.minutes); }
  storyT -= dt; if (storyT <= 0 && started) { storyT = 0.5; storyTick(); }
  const ch = (window as any).__camHook; if (ch) ch(camera, player);
  if (introOpen) { // the title screen: a slow circle over Millbrook's square
    const a = now * 0.04; camera.position.set(Math.cos(a) * 58, 24 + Math.sin(now * 0.11) * 2, -4 + Math.sin(a) * 58); camera.lookAt(0, 2, -4);
  }
  renderer.render(world.scene, camera);
}
// ---------------- story, markers, weather (pass 4) ----------------
const weatherFx = new WeatherFx(world.scene);
player.model.j.hips.add(lanternMesh);
// v0.9.3: the Merry Wren's bell, held against the chest while you carry it (sq4)
const bellCarry = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 0.26, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x6a8a6a, metalness: 0.6, roughness: 0.5, flatShading: true, side: THREE.DoubleSide }));
bellCarry.position.set(0, 1.18, -0.42); bellCarry.visible = false; player.model.root.add(bellCarry);   // on the root: baked joint meshes are hidden, and so would their children be
const gate = { active: false, wave: 0, t: 0, shotT: 0 };
let storyT = 0, lastDayNoted = -1, thunderT = 12;

/** The mood of the music follows where you are and whether anything is trying to kill you. */
function pickMood(): Mood {
  if (!started || cfg.musicVolume <= 0) return 'off';
  if ((boss.active && !boss.dead) || (wraith.active && !wraith.dead) || (engine.active && !engine.dead) || (barrowKing.active && !barrowKing.dead) || (mother.active && !mother.dead) || gate.active) return 'boss';
  if (now - player.lastCombat < 7 || enemies.list.some(e => e.alive && (e.state === 'chase' || e.state === 'windup') && e.pos.distanceTo(player.pos) < 22)) return 'combat';
  if (world.dungeon) return 'dungeon';
  const b = world.insideBuilding(player.pos);
  if (b === 'Your house') return 'home'; if (b === 'The Gilded Tankard' || b === 'The Drowned Lantern' || b === 'The Heron and Reed' || b === 'The Anchor and Gull') return 'tavern'; if (b === 'Chapel of the Quiet Flame' || b === 'Shrine of the Quiet Flame') return 'chapel';
  if (player.zone === 'reach' || player.zone === 'march') return world.night > 0.5 ? 'night' : 'vale';
  if (player.zone === 'fernhollow' || player.zone === 'gullhaven') return world.night > 0.6 ? 'night' : 'town';
  if (player.zone === 'coast') return world.night > 0.5 ? 'night' : 'vale';
  if (player.zone === 'ashford') return world.night > 0.6 ? 'night' : 'town';
  if (player.zone === 'vale') return world.night > 0.5 ? 'night' : 'vale';
  return world.night > 0.6 ? 'home' : 'town';
}
const presentNow = (id: string) => id === 'aldric' ? S.flag(s, 'gateHeld') > 0 : id === 'tolan' ? !S.tolanGone(s) : id === 'garth' ? S.flag(s, 'westGateOpen') > 0 : id === 'gorse_lost' ? !S.flag(s, 'gorseFreed') : id === 'gorse' ? S.flag(s, 'gorseFreed') > 0 : id === 'vane' || id === 'sully' ? S.flag(s, 'crownFate') !== 2 : id === 'lowdy' ? (coast.lowdyOnFlats(s) || G.hour(s) >= 10 && G.hour(s) < 18 || G.hour(s) >= 22 || G.hour(s) < 6) : id === 'marrow' ? S.flag(s, 'collectorFate') !== 1 : true;
const markTargets: { pos: THREE.Vector3; kind: string; label: string }[] = [];
const marksOut: { bearing: number; kind: string; label: string }[] = [];
function resolveWhere(w: string | null): THREE.Vector3 | null {
  if (!w) return null;
  if (w.startsWith('npc:')) { const t = folk.find(f => f.def.id === w.slice(4)); return t && t.present ? t.pos : null; }
  const p = world.places[w] ?? world.interactables.find(i => i.id === w)?.pos ?? null;
  // a place inside a dungeon: while you are outside it, point at its door instead (v0.8)
  if (p && p.z < -270 && !world.dungeon) {
    if (world.inBarrowArea(p)) return world.west.door;
    if (world.inSeaCaveArea(p)) return world.places.cave_mouth;
    if (world.inMineArea(p)) return world.places.copper_hollow ?? p;
    if (world.inChapelArea(p)) return world.places.chapel_door ?? p;
    if (world.inMillArea(p)) return world.millDoorPos;
  }
  return p;
}
/** Twice a second: move quests along, show who wants a word, refresh markers, weather and gathering nodes. */
function storyTick(quiet = false) {
  const n0 = s.log.length;
  const changed = S.updateQuests(s);
  if (changed && !quiet) { sfx.quest(); for (const l of s.log.slice(n0)) if (/^(New|Quest|Task)/.test(l.text) || l.text.includes(': ')) { feed.push(s, 'q' + l.text.slice(0, 18), l.text.length > 150 ? l.text.slice(0, 147) + '…' : l.text, 'explore', 3, 0); break; } save(); }
  for (const t of folk) { t.present = presentNow(t.def.id); t.mark.visible = t.present && S.hasBusiness(s, t.def.id); }
  const tr = S.tracked(s); hud.quest(tr ? { title: tr.title, lines: tr.lines } : null);
  markTargets.length = 0;
  if (!world.dungeon) {
    const qp = resolveWhere(tr?.where ?? null); if (qp) markTargets.push({ pos: qp, kind: 'quest', label: 'quest' });
    const c = s.active; if (c) { const done = c.progress >= c.count; const cp = done ? boardPlace(c) : c.kind !== 'sweep' ? world.places['cairn_' + c.site] : world.sites[c.site]; markTargets.push({ pos: cp, kind: 'job', label: done ? 'board' : 'notice' }); }
    if (player.zone === 'vale') { markTargets.push({ pos: world.places.gate, kind: 'home', label: 'gate' }); }
    else if (player.zone !== 'home' && player.pos.distanceTo(world.places.home) > 30) markTargets.push({ pos: world.places.home, kind: 'home', label: 'home' });
  }
  // the day's weather and events
  world.weather = world.dungeon ? 'clear' : G.today(s).weather;
  if (G.day(s) !== lastDayNoted && started) {
    lastDayNoted = G.day(s); const d = G.today(s);
    if (!quiet) { G.log(s, WEATHER_TEXT[d.weather], 'info'); if (d.event !== 'none') { G.log(s, EVENT_TEXT[d.event], 'good'); feed.push(s, 'dayEvent', EVENT_TEXT[d.event], 'reputation', 2, 0); } }
  }
  const wet = isWet(world.weather) && !world.dungeon;
  sfx.rain(wet ? (player.indoors ? 0.3 : world.weather === 'storm' ? 1.3 : 1) : 0);
  if (world.weather === 'storm' && !world.dungeon) { thunderT -= 0.5; if (thunderT <= 0) { thunderT = 7 + Math.random() * 14; world.flash = 1; setTimeout(() => sfx.thunder(), 600 + Math.random() * 1200); } }
  refreshNodes(); discoverPlaces(); discoverEast(); discoverWest(); discoverCoast(); syncCoastProps();
  if (!music && sfx.ctx) { music = new Music(sfx.ctx, sfx.out); music.setVolume(cfg.musicVolume); }
  music?.setMood(pickMood());
  // the true ending: debt cleared and the wards settled
  if (s.story.wardsDone && s.story.debtCleared && S.flag(s, 'endingShown') < 2 && !s.gameover && !hud.modalOpen) s.gameover = 'won';
}
function compassMarks() {
  marksOut.length = 0;
  for (const m of markTargets) { const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z; marksOut.push({ bearing: Math.atan2(dx, -dz) * 180 / Math.PI, kind: m.kind, label: `${m.label} ${Math.max(5, Math.round(Math.hypot(dx, dz) / 5) * 5)} m` }); }
  return marksOut;
}
function zoneOf(p: THREE.Vector3): typeof player.zone {
  if (world.inMillArea(p) || world.inChapelArea(p) || world.inMineArea(p) || world.inBarrowArea(p) || world.inSeaCaveArea(p)) return 'mill';
  if (p.z > 136 && world.regionAt(p).id !== 'vale') { const r = world.regionAt(p).id; return r === 'gullhaven' || r === 'lighthouse' ? 'gullhaven' : 'coast'; }
  if (p.x < -42.4) { const r = world.regionAt(p).id; return r === 'fernhollow' ? 'fernhollow' : 'march'; }
  if (p.x > 42.4) { const r = world.regionAt(p).id; return r === 'ashford' || r === 'docks' ? 'ashford' : 'reach'; }
  const b = world.insideBuilding(p);
  if (b === 'Your house') return 'home'; if (b === 'Counting House') return 'office';
  return p.z > 32 ? 'vale' : 'town';
}
function feedCtx(): FeedCtx {
  let near: string | null = null, bd = 6;
  for (const t of folk) { const d = t.pos.distanceTo(player.pos); if (d < bd) { bd = d; near = t.def.id; } }
  return { holstered, place: player.zone, nearNpc: near, inBoss: boss.active && !boss.dead };
}
function update(dt: number) {
  player.zone = zoneOf(player.pos); player.indoors = !!world.insideBuilding(player.pos);
  if (!player.indoors && !world.dungeon) G.wetTick(s, dt);
  updatePickups(dt);
  // movement
  const act = player.action;
  const locked = !!act && !act.upper;
  let mx = 0, mz = 0;
  if (!locked) {
    if (down('forward')) mz -= 1; if (down('back')) mz += 1; if (down('left')) mx -= 1; if (down('right')) mx += 1;
    if (keys.has('ArrowLeft')) player.yaw += dt * 2; if (keys.has('ArrowRight')) player.yaw -= dt * 2;
    if (keys.has('ArrowUp')) player.pitch = Math.min(1.45, player.pitch + dt * 1.5); if (keys.has('ArrowDown')) player.pitch = Math.max(-1.45, player.pitch - dt * 1.5);
  }
  player.moving = mx !== 0 || mz !== 0; player.inX = mx; player.inZ = mz;
  const runHeld = down('sprint'); if (cfg.runToggle) { if (runHeld && !runWasDown) runLatched = !runLatched; if (!player.moving) runLatched = false; } runWasDown = runHeld;
  const wantSprint = cfg.runToggle ? runLatched : runHeld;
  const load = G.loadState(s);
  player.sprinting = player.moving && wantSprint && !s.staminaLocked && mz < 0 && !s.carryingCrate && !coast.carryingBell(s) && load.canSprint;
  let speed = (player.sprinting ? 7.2 : 4.2) * load.speedMult * G.moveMult(s);
  if (s.needs.fatigue > B.T.exhausted) speed *= 0.8;
  if (s.needs.calories < B.T.starving) speed *= 0.85;
  if (s.needs.bladder > 375) speed *= 0.9;
  if (player.wading) speed *= wadeK;
  if (now < slowUntil) speed *= 0.6;                                    // the Wreck-Mother's brine spray
  if (player.moving) {
    const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const dx = (mx * cos + mz * sin) * speed * dt, dz = (-mx * sin + mz * cos) * speed * dt;
    const [x, z] = collide(world.colliders, player.pos.x + dx, player.pos.z + dz, 0.35, player.pos.y);
    player.pos.x = x; player.pos.z = z;
  }
  player.dodgeCd = Math.max(0, player.dodgeCd - dt);
  if (player.dodgeT > 0) {
    player.dodgeT -= dt;
    const [x, z] = collide(world.colliders, player.pos.x + player.dodgeX * 11 * dt, player.pos.z + player.dodgeZ * 11 * dt, 0.35, player.pos.y);
    player.pos.x = x; player.pos.z = z;
  }
  player.speed = player.moving ? speed : 0;
  if (down('jump') && player.onGround && !locked) { player.vy = 5.4; player.onGround = false; }
  player.vy -= 15 * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) {
    if (!player.onGround) { const impact = -player.vy; if (impact > 4) sfx.land(); if (impact > 2) { player.model.land(impact); vm.land(impact); player.dipV -= impact * 0.06; } }
    player.pos.y = 0; player.vy = 0; player.onGround = true;
  }
  // footsteps land on the gait: one per half cycle of the stride
  if (player.moving && player.onGround) { const idx = Math.floor(player.model.phase / Math.PI); if (idx !== player.stepIdx) { player.stepIdx = idx; sfx.step(player.sprinting); } }
  void footT;
  // timers
  player.fireCd = Math.max(0, player.fireCd - dt); player.castCd = Math.max(0, player.castCd - dt); player.meleeCd = Math.max(0, player.meleeCd - dt); player.hitT = Math.max(0, player.hitT - dt);
  if (player.reloading > 0) { player.reloading -= dt; if (player.reloading <= 0) { player.reloading = 0; G.reload(s); } }
  if (player.shield > 0 && now > player.shieldUntil) { player.shield = 0; G.log(s, 'The ward crumbles.', 'info'); }
  // sim
  const inCombat = now - player.lastCombat < 4;
  if (!act || act.upper) G.tickReal(s, dt, { sprinting: player.sprinting, moving: player.moving, inCombat });
  if (G.consumeRespawn()) { if (!busyCollapse) { busyCollapse = true; hud.fade('You collapse…', 1400).then(() => { respawnHome(); busyCollapse = false; save(); }); } }
  // enemies
  if (ambientDay !== G.day(s)) spawnAmbient();
  if (world.inMill) spawnMill();
  syncContractEnemies();
  enemies.update(dt, now, player.pos, !busyCollapse, (p, e, at) => {
    puff(at, p.kind === 'fire' ? 0xff7a2a : 0x9fe8ff, 0.35);
    if (e) { enemies.damage(e, p.dmg * G.dealtMult(s), now, p.kind === 'fire' ? 'burn' : 'slow', p.kind === 'fire' ? 'fire' : 'frost'); hud.hitmarker(); }
    if (p.kind === 'fire' && world.dungeon === 'barrow') { const b = world.barrow.braziers.find(x => !x.lit && Math.hypot(x.pos.x - at.x, x.pos.z - at.z) < 1.6); if (b) lightBrazier(b.id, 'fire'); }
  });
  // v0.9.3: enemies beyond the fog are not drawn (the coast's site groups were adding draw calls and shadows to
  // every view facing south, and the whole roster to every dungeon)
  { const far = (world.scene.fog as THREE.Fog).far + 8; for (const e of enemies.list) if (!e.external) e.root.visible = Math.abs(e.pos.x - player.pos.x) < far && Math.abs(e.pos.z - player.pos.z) < far && e.pos.distanceTo(player.pos) < far; }
  // the Old Mill
  if (world.inMill) {
    G.millTick(s, dt);
    if (!boss.dead && !boss.active && world.inArena(player.pos)) { boss.wake(); feed.push(s, 'arena', EVENTS.bossPhase(1) ?? 'The air in here is wrong.', 'combat', 3, 1); }
    boss.update(dt, now, player.pos, !busyCollapse);
  }
  // the Sunken Chapel
  if (world.inChapel) {
    const C = world.chapel, nv = C.nave, wading = C.flood > 0.3 && player.pos.x > nv.minX && player.pos.x < nv.maxX && player.pos.z > nv.minZ && player.pos.z < nv.maxZ;
    G.chapelTick(s, dt, wading); player.wading = wading;
    { const target = S.flag(s, 'valveA') && S.flag(s, 'valveB') ? 0 : 1; if (C.flood !== target) { C.flood += Math.sign(target - C.flood) * Math.min(Math.abs(target - C.flood), dt * 0.22); C.water.position.y = 0.06 + C.flood * 0.5; C.water.visible = C.flood > 0.02; setChapelGate(world, C.flood < 0.2); } }
    spawnChapel();
    if (!wraith.dead && !wraith.active && world.inChapelArena(player.pos)) wraith.wake();
    wraith.update(dt, now, player.pos, !busyCollapse);
  } else player.wading = false;
  // Copper Hollow
  if (world.inMine) {
    spawnMine();
    if (!engine.dead && !engine.active && world.inMineVault(player.pos)) engine.wake();
    engine.update(dt, now, player.pos, !busyCollapse);
  }
  // the Barrow of King Orm
  updateCoast(dt);
  if (world.dungeon === 'barrow') barrowTick(dt);
  updateFishing(dt); reachEvents(); westEvents();
  const fordWade = !world.dungeon && !s.gear.waders && !s.gear.seaboots && (world.inFord(player.pos) || world.inMarsh(player.pos));
  player.wading = player.wading || fordWade || coastWading;
  wadeK = coastWading && !fordWade && world.dungeon !== 'chapel' ? coastWadeK : 0.62;
  if (world.dungeon !== 'seacave' && mother.active && !mother.dead) leaveSeaCave();
  updateGate(dt);
  // autosave every game hour
  const hr = Math.floor(s.minutes / 60); if (hr !== lastSaveHour) { lastSaveHour = hr; save(); }
}
function updatePlayerVisual(dt: number) {
  const m = player.model, act = player.action;
  // which way the body faces: weapon drawn → toward the aim (and strafe); holstered → toward where you walk
  const movingWorldYaw = (() => { const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw); const dx = player.inX * cos + player.inZ * sin, dz = -player.inX * sin + player.inZ * cos; return Math.atan2(-dx, -dz); })();
  const freeLook = holstered && player.moving && !act && player.dodgeT <= 0;
  if (act?.seat && !act.upper) { m.root.position.copy(act.seat); m.root.rotation.y = act.facing ?? player.yaw; }
  else {
    m.root.position.copy(player.pos);
    const want = freeLook ? movingWorldYaw : player.yaw;
    let dy = want - player.modelYaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    player.modelYaw += dy * Math.min(1, dt * (freeLook ? 9 : 14)); m.root.rotation.y = player.modelYaw;
  }
  if (act) act.t += dt;
  if (tpOverlay) { tpOverlay.t += dt; if (tpOverlay.t > tpOverlay.dur) tpOverlay = null; }
  // lean into acceleration and turns
  let yr = player.modelYaw - player.prevYaw; while (yr > Math.PI) yr -= 2 * Math.PI; while (yr < -Math.PI) yr += 2 * Math.PI; yr /= Math.max(dt, 1e-3); player.prevYaw = player.modelYaw;
  const accel = (player.speed - player.prevSpeed) / Math.max(dt, 1e-3); player.prevSpeed = player.speed;
  m.motion(dt, player.onGround ? player.speed : 0, yr, Math.max(-30, Math.min(30, accel)));
  // legs: distance-synced gait, strafing and backpedalling, a shuffle when turning on the spot, air poses
  const localDir = freeLook ? 0 : Math.atan2(-player.inX, -player.inZ);
  const turning = !player.moving && player.onGround && Math.abs(yr) > 1.6 && !act;
  if (player.moving && player.onGround) m.stride(dt, player.speed, player.sprinting);
  else if (turning) m.phase += dt * Math.min(9, Math.abs(yr) * 2.2);
  player.airT = player.onGround ? 0 : player.airT + dt;
  const gaitKey = !player.onGround ? 'air' : player.dodgeT > 0 ? 'dodge' : player.sprinting ? 'run' : player.moving ? 'walk' : turning ? 'turn' : 'idle';
  let pose, key: string;
  if (act && !act.upper) { pose = clip(act.clip, act.t); key = 'a:' + act.clip; }
  else {
    const tired = s.needs.fatigue > B.T.exhausted ? 1 : s.needs.fatigue > 60 ? 0.5 : 0;
    const legs = player.dodgeT > 0 ? clip('dodge', 0.32 - player.dodgeT) : !player.onGround ? airPose(player.vy, player.airT)
      : player.moving ? gaitPose(m.phase, player.speed, player.sprinting, { dir: localDir, tired, carry: s.carryingCrate || coast.carryingBell(s) }) : turning ? gaitPose(m.phase, 1.0, false, { dir: yr > 0 ? Math.PI / 2 : -Math.PI / 2 }) : clip('idle', now);
    const holdClip: ClipName = player.dodgeT > 0 ? 'dodge' : player.hitT > 0 ? 'hit' : act?.upper ? act.clip : tpOverlay ? tpOverlay.clip : holstered ? 'idle' : player.slot === 'carbine' ? 'aim' : 'staffIdle';
    const t = act?.upper ? act.t : tpOverlay ? tpOverlay.t : now;
    const gunUp = player.slot === 'carbine' && !holstered && (holdClip === 'aim' || holdClip === 'shoot' || holdClip === 'reload');
    const rifle = G.firearm(s) !== 'revolver';
    // firearm: a grip that follows where you look; lowered while sprinting
    const gk = holdClip === 'shoot' ? 'shoot' : holdClip === 'reload' ? 'reload' : player.sprinting ? 'low' : 'aim';
    const upper = gunUp ? (rifle ? riflePose(gk, t, player.pitch) : pistolPose(gk, t, player.pitch)) : holstered && player.moving ? legs : clip(holdClip, t);
    pose = s.carryingCrate || coast.carryingBell(s) ? legs : layered(legs, upper);
    pose.r.head = [(pose.r.head?.[0] ?? 0) + player.pitch * 0.5, pose.r.head?.[1] ?? 0, pose.r.head?.[2] ?? 0];
    key = gaitKey + '|' + (gunUp ? (rifle ? 'r:' : 'p:') + gk : holdClip);
  }
  m.apply(pose, dt, tpOverlay?.clip === 'melee' ? 30 : 16, key);
  const holding = !act || act.upper;
  const rifleOut = G.firearm(s) !== 'revolver';
  if (rifleOut && longTP.userData.k !== G.firearm(s)) { longTP.userData.k = G.firearm(s); showLong(longTP, G.firearm(s)); }
  { const slung = G.ownedGuns(s).filter(g => g !== 'revolver' && g !== G.firearm(s))[0]; if (backLong.userData.k !== slung) { backLong.userData.k = slung; if (slung) showLong(backLong, slung); } }
  carbineTP.visible = !!(holding && !holstered && player.slot === 'carbine' && !rifleOut && act?.clip !== 'eat');
  longTP.visible = !!(holding && !holstered && player.slot === 'carbine' && rifleOut && act?.clip !== 'eat');
  staffTP.visible = !!(holding && !holstered && player.slot !== 'carbine');
  holsterGun.visible = !carbineTP.visible; backStaff.visible = !staffTP.visible; backLong.visible = !!backLong.userData.k;
  rodTP.visible = act?.clip === 'fish'; pickTP.visible = act?.clip === 'mine';
  const fp = player.view === 'first';
  if (vm.firearm !== G.firearm(s)) vm.setFirearm(G.firearm(s));
  vm.feel(m.phase, player.onGround, player.sprinting, player.inX, -player.inZ);
  vm.update(dt, player.speed, mouse); mouse.multiplyScalar(0.5);
  // camera springs: landing dip, hurt shake (trauma²), sprint FOV
  { const w = 12, z = 0.5; player.dipV += (-(w * w) * player.dipY - 2 * z * w * player.dipV) * dt; player.dipY += player.dipV * dt; if (player.dipY < -0.25) player.dipY = -0.25; }
  player.trauma = Math.max(0, player.trauma - dt * 1.4);
  const fovWant = cfg.fov + (player.sprinting && player.speed > 5 ? 6 : 0) - (player.wading ? 2 : 0);
  if (Math.abs(player.fovNow - fovWant) > 0.05) { player.fovNow += (fovWant - player.fovNow) * Math.min(1, dt * 5); camera.fov = player.fovNow; camera.updateProjectionMatrix(); }
  shieldMesh.visible = player.shield > 0; shieldMesh.position.copy(player.pos).setY(1.0); (shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.08 + 0.08 * Math.sin(now * 6) + (fp ? 0 : 0.06);
  // camera. Both views are computed from the same head point, and V blends between them over ~0.2 s
  // instead of jumping. The third-person boom shortens instantly when a wall gets in the way (so the
  // camera never shows the inside of a wall) but grows back smoothly (no pumping in and out).
  player.viewBlend += ((fp ? 0 : 1) - player.viewBlend) * Math.min(1, dt * 14);
  if (Math.abs(player.viewBlend - (fp ? 0 : 1)) < 0.002) player.viewBlend = fp ? 0 : 1;
  const vb = player.viewBlend;
  camLook.set(player.pitch, player.yaw, 0, 'YXZ');
  // first-person eye
  const eye = camEye.copy(player.pos); eye.y += 1.62;
  if (act && !act.upper && act.seat) { if (act.clip === 'sleep') eye.copy(act.seat).add(SLEEP_EYE); else eye.copy(act.seat).setY(1.12); }
  // head bob on the stride: down at each footfall, a little sway between feet
  if (player.onGround && player.moving) { const ph = m.phase, A = (player.sprinting ? 0.05 : 0.026) * Math.min(1, player.speed / 4) * (1 - vb) * cfg.camMotion; eye.y += (0.5 - Math.abs(Math.cos(ph))) * A; eye.x += Math.cos(player.yaw) * Math.sin(ph) * A * 0.45; eye.z -= Math.sin(player.yaw) * Math.sin(ph) * A * 0.45; }
  eye.y += player.dipY * (1 - vb) * (0.3 + 0.7 * cfg.camMotion);
  if (vb <= 0) {
    camera.position.copy(eye);
    if (act && !act.upper && act.clip === 'sleep') camera.rotation.set(-0.9, player.yaw, 0, 'YXZ'); else camera.rotation.copy(camLook);
    camera.rotateX(vm.kickPitch * cfg.camMotion); camera.rotateZ((vm.kickRoll + Math.sin(player.model.phase) * 0.004 * (player.moving ? 1 : 0)) * cfg.camMotion);
  } else {
    const head = camHead.copy(player.pos); head.y += 1.55;
    if (act?.seat && !act.upper) head.copy(act.seat).setY(act.clip === 'sleep' ? 1.0 : 1.2);
    const f = forward(_fwd); camRight.set(Math.cos(player.yaw), 0, -Math.sin(player.yaw));
    const want = camWant.copy(head).addScaledVector(camRight, 0.55).addScaledVector(f, -3.4); want.y += 0.25;
    const dir = camDir.copy(want).sub(head); const len = dir.length(); dir.multiplyScalar(1 / len);
    const hit = Math.min(rayBoxes(world.colliders, head, dir, len), rayBoxes(world.cameraBlockers, head, dir, len));
    const target = Math.max(0.4, Math.min(len, hit - 0.25));
    player.camDist = target < player.camDist ? target : player.camDist + (target - player.camDist) * Math.min(1, dt * 5);
    const dist = player.camDist * vb;
    camera.position.copy(head).addScaledVector(dir, dist);
    const squeeze = Math.max(0, (len - player.camDist) / len) * vb;
    camera.position.y += squeeze * 0.8;
    if (vb < 1) camera.position.lerp(eye, 1 - vb);
    if (camera.position.y < 0.3) camera.position.y = 0.3;
    camera.rotation.copy(camLook);
    if (squeeze > 0) camera.rotateX(-squeeze * 0.35);
  }
  if (player.trauma > 0.01 && cfg.camMotion > 0) { const tr = player.trauma * player.trauma * cfg.camMotion; camera.rotateX(Math.sin(now * 37) * 0.025 * tr); camera.rotateY(Math.sin(now * 29 + 1.3) * 0.025 * tr); camera.rotateZ(Math.sin(now * 23 + 2.1) * 0.03 * tr); }
  m.root.visible = vb > 0.35;
  vm.root.visible = vb < 0.5 && !(act && !act.upper && (act.clip === 'sleep' || act.clip === 'sit'));
}
const camLook = new THREE.Euler(), camEye = new THREE.Vector3(), camHead = new THREE.Vector3(), camRight = new THREE.Vector3(), camWant = new THREE.Vector3(), camDir = new THREE.Vector3(), SLEEP_EYE = new THREE.Vector3(0, 0.75, -0.9);
const compass = (dx: number, dz: number) => { const a = (Math.atan2(dx, -dz) * 180) / Math.PI; const dirs = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west']; return dirs[Math.round(((a + 360) % 360) / 45) % 8]; };
function updateHud() {
  const c = s.active; let extra: any = { shield: player.shield };
  if (c) { const p = c.kind !== 'sweep' ? world.interactables.find(i => i.id === `cairn_${c.site}`)!.pos : world.sites[c.site]; extra = { ...extra, site: SITES[c.site].name, siteDist: p.distanceTo(player.pos), siteDir: compass(p.x - player.pos.x, p.z - player.pos.z) }; }
  hud.update(s, player.slot, player.view, promptText(), extra);
  // boss bar, or the health of whatever is under the crosshair
  const bossInfo = bossBar();
  hud.boss(bossInfo);
  if (bossInfo || holstered) hud.target(null);
  else { const o = camera.getWorldPosition(camEye), hit = enemies.raycast(o, forward(_fwd), 45); hud.target(hit && !hit.e.external ? { name: hit.e.elite ? 'Elite ' + ENEMY_NAMES[hit.e.kind].toLowerCase() : ENEMY_NAMES[hit.e.kind], hp: hit.e.hp / hit.e.def.hp } : null); }
}
function bossBar(): { name: string; hp: number; stagger?: number; note?: string } | null {
  if (boss.active && !boss.dead) return { name: 'The Shade Patriarch', hp: boss.hpFrac, stagger: boss.staggerT > 0 ? 1 : boss.stagger / 100, note: boss.staggerT > 0 ? 'Staggered: double damage' : boss.phase === 1 ? 'Bound to the millstone · fire staggers him' : boss.phase === 2 ? 'Free · watch the floor' : 'Guttering · hide from the wail behind a pillar' };
  if (wraith.active && !wraith.dead) return { name: 'The Cinder Wraith', hp: wraith.hpFrac, stagger: wraith.lastKind ? wraith.streak / (wraith.phase >= 2 ? 2 : 3) : 0, note: wraith.note() };
  if (barrowKing.active && !barrowKing.dead) return { name: 'King Orm, the Barrow-King', hp: barrowKing.hpFrac, stagger: barrowKing.phase === 2 ? barrowKing.lit / 4 : 0, note: barrowKing.note || (barrowKing.phase === 1 ? 'Step back from the sweep · step aside from the cleave' : `In the dark he is hard to hurt · ${barrowKing.lit}/4 braziers lit`) };
  if (mother.active && !mother.dead) return { name: 'The Wreck-Mother', hp: mother.hpFrac, stagger: mother.rearing ? 1 : 0, note: mother.note || (mother.phase === 1 ? 'Shell in front · hit her side, or her belly when she rears' : 'The grotto floods · fight from the rock platforms · she charges between them') };
  if (engine.active && !engine.dead) return { name: 'The Warden Engine', hp: engine.hpFrac, stagger: engine.stunT > 0 ? 1 : 0, note: engine.note || (engine.phase === 1 ? 'Front armoured · the core is in its back · jump the slam' : 'Cracked open · faster · watch the side galleries') };
  if (gate.active) { const left = enemies.list.filter(e => e.alive && e.tag === 'gate').length; return { name: `Wardbreak Night · wave ${Math.max(1, gate.wave)} of 3`, hp: gate.wave === 0 ? 1 : Math.min(1, left / 8), note: left ? `${left} still coming` : 'A breath between waves' }; }
  return null;
}
if (!loopStarted) { loopStarted = true; requestAnimationFrame(frame); }

// ---------------- test hooks (used by scripts/playtest) ----------------
(window as any).__game = {
  get s() { return s; }, player, world, enemies, camera,
  openPack: () => openInventory(), armoury: () => RU.openArmoury(ui, 'gunsmith'), reloadNow: () => startReload(), setGun: (g: B.FirearmId) => G.setFirearm(s, g),
  start: (d = 'standard') => { (document.querySelector('#go') as HTMLElement)?.click(); (document.querySelector(`[data-d="${d}"]`) as HTMLElement)?.click(); },
  S, T, P, ui, folk, pickups, storyTick, dodge, toggleLantern, openJournal, openInventory, cfg: () => cfg, openMap, pickMood, DOOR_EVENTS, get music() { return music; },
  W, barrowKing, goBarrow, lightBrazier, westInteract, discoverWest, syncBarrow, get westNight() { return westNight; },
  R, RU, engine, goMine, startFishing, strikeFish, THREE_V: THREE.Vector3, fire: () => fire(), selectSlot: (sl: Slot) => selectSlot(sl), get fishing() { return fishing; }, reachInteract, ewe, discoverEast, interactWith: (id: string) => { const it = world.interactables.find(i => i.id === id); if (!it) return false; player.pos.set(it.pos.x, 0, it.pos.z); if (!southInteract(it) && !reachInteract(it) && !westInteract(it)) { (window as any).__lastInteract = id; } return true; },
  GS: G, get now() { return now; }, bossBar, travelBlock, mother, goSeaCave, southInteract, coast, discoverCoast, syncCoastProps,  get coastWading() { return coastWading; }, get wadeK() { return wadeK; }, get fuseRemaining() { return fuseRemaining; }, get slowed() { return now < slowUntil; },
  talkTo: (id: string) => { const t = folk.find(f => f.def.id === id)!; player.pos.set(t.pos.x + 1, 0, t.pos.z + 0.5); openTalk(t); },
  key: (code: string, ms = 300) => new Promise<void>(r => { keys.add(code); setTimeout(() => { keys.delete(code); r(); }, ms); }),
  press: (code: string) => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); },
  teleport: (x: number, z: number, yaw?: number) => { player.pos.set(x, 0, z); if (yaw !== undefined) player.yaw = yaw; },
  interactAt: (id: string) => { const it = world.interactables.find(i => i.id === id)!; player.pos.set(it.pos.x, 0, it.pos.z); player.yaw = it.facing ?? player.yaw; interact(); },
  attack: () => attack(), melee: () => melee(), slot: (sl: Slot) => selectSlot(sl), view: (v: 'first' | 'third') => { player.view = v; },
  faceNearestEnemy: () => { const e = enemies.list.filter(x => x.alive).sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos))[0]; if (!e) return null; const d = e.center().sub(player.pos.clone().setY(1.62)); player.yaw = Math.atan2(-d.x, -d.z); player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); return e; },
  closeModal: () => closeTopModal(), modalOpen: () => hud.modalOpen, save, load,
  saveTo, loadFrom, slotMeta, newGame, openSlots, boss, wraith, gate, feed, openSettings,
  faceBoss: () => { const d = boss.e.pos.clone().setY(2).sub(player.pos.clone().setY(1.62)); player.yaw = Math.atan2(-d.x, -d.z); player.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z)); }, toggleHolster, holstered: () => holstered, vm, renderer, openBoard,
  /** Run the simulation at full speed without rendering (tests on slow machines). */
  /** CPU cost of one game frame without the GPU (update + visuals + HUD), for before/after measurement. */
  bench: (frames = 300) => { const t: number[] = []; for (let i = 0; i < frames; i++) { const a = performance.now(); now += 1 / 60; player.yaw += 0.05; update(1 / 60); updatePlayerVisual(1 / 60); { const hh = (s.minutes % 1440) / 60; for (const f of folk) f.update(1 / 60, hh, player.pos); world.updateRegions(player.pos); world.east.animate(1 / 60, now, player.pos); world.updateLights(1 / 60, player.pos, now); } if (i % 6 === 0) updateHud(); t.push(performance.now() - a); } t.sort((x, y) => x - y); const avg = t.reduce((x, y) => x + y, 0) / t.length; return { avg: +avg.toFixed(3), p50: +t[Math.floor(t.length / 2)].toFixed(3), p99: +t[Math.floor(t.length * 0.99)].toFixed(3), worst: +t[t.length - 1].toFixed(3) }; },
  step: (seconds: number) => { const n = Math.round(seconds * 30); for (let i = 0; i < n; i++) { now += 1 / 30; if (!hud.modalOpen && !s.gameover && !busyCollapse) update(1 / 30); updatePlayerVisual(1 / 30); const hh = (s.minutes % 1440) / 60; for (const f of folk) f.update(1 / 30, hh, player.pos); updateEwe(1 / 30); if (i % 30 === 0) feed.tick(s, feedCtx()); } },
};
