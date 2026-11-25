// Enemies and projectiles. AI loop from Tower & Sands (idle → alert → approach → telegraph → strike → recover),
// roles from VEILWORK (melee / ranged), elemental status from Archmage (burn, slow).
import * as THREE from 'three';
import { Humanoid, Hound, clip, gaitPose, layered, makeClub, makeCrossbow, makeTool, type ClipName, type Pose } from './rig';
import { collide, rayBoxes, type Box } from './world';
import { Crab } from './crab';
import type { EnemyKind } from '../sim/contracts';

import { gameplayRng } from '../sim/rng';
export interface EnemyDef { hp: number; speed: number; sight: number; reach: number; windup: number; dmg: number; recover: number; radius: number; height: number }
export const DEFS: Record<EnemyKind, EnemyDef> = {
  hound: { hp: 55, speed: 6.2, sight: 24, reach: 1.7, windup: 0.45, dmg: 12, recover: 0.7, radius: 0.5, height: 0.9 },
  raider: { hp: 80, speed: 4.4, sight: 22, reach: 2.0, windup: 0.6, dmg: 18, recover: 0.8, radius: 0.4, height: 1.7 },
  shade: { hp: 60, speed: 3.0, sight: 28, reach: 13, windup: 0.85, dmg: 14, recover: 1.6, radius: 0.4, height: 1.9 },
  // Sunken Chapel (Ledger & Ward): slow, heavy melee that shrugs off frost; small fast fire-thrower that frost shatters
  drowned: { hp: 120, speed: 2.5, sight: 20, reach: 2.1, windup: 0.75, dmg: 17, recover: 1.1, radius: 0.42, height: 1.8 },
  imp: { hp: 38, speed: 5.0, sight: 26, reach: 12, windup: 0.5, dmg: 9, recover: 0.9, radius: 0.3, height: 1.1 },
  // v0.7, the Eastern Reach: wolves circle and dart in; boars paw the ground and charge in a straight line
  // (step aside); crossbowmen keep their distance and fire bolts you can dodge; the hollowed stand still
  // in the dark of the mine until something living comes near.
  wolf: { hp: 46, speed: 6.9, sight: 26, reach: 1.6, windup: 0.36, dmg: 10, recover: 0.55, radius: 0.45, height: 0.85 },
  boar: { hp: 135, speed: 4.6, sight: 18, reach: 9, windup: 0.95, dmg: 24, recover: 1.3, radius: 0.55, height: 0.85 },
  bandit: { hp: 72, speed: 4.0, sight: 30, reach: 24, windup: 0.95, dmg: 15, recover: 1.7, radius: 0.4, height: 1.75 },
  hollow: { hp: 105, speed: 2.4, sight: 17, reach: 2.3, windup: 0.85, dmg: 20, recover: 1.15, radius: 0.42, height: 1.75 },
  // v0.8, the Westmarch (docs/gdd/westmarch.md): barrow wights rise out of the ground and lurch; grave-lights
  // float, weave toward you, swell and burst (bursting kills them with no reward: shoot them first).
  wight: { hp: 150, speed: 2.7, sight: 20, reach: 2.3, windup: 0.9, dmg: 22, recover: 1.2, radius: 0.42, height: 1.85 },
  wisp: { hp: 26, speed: 3.6, sight: 24, reach: 1.8, windup: 0.7, dmg: 16, recover: 0.5, radius: 0.3, height: 2.2 },
  // v0.9, the Saltway Coast (docs/gdd/saltway.md): shore crabs circle sideways and dart in to pinch (shells turn
  // bullets); cove smugglers fight like raiders; pistoleers keep their distance, aim, fire once and reload.
  crab: { hp: 40, speed: 4.8, sight: 16, reach: 1.3, windup: 0.4, dmg: 9, recover: 0.7, radius: 0.45, height: 0.55 },
  smuggler: { hp: 85, speed: 4.3, sight: 22, reach: 2.0, windup: 0.6, dmg: 17, recover: 0.8, radius: 0.4, height: 1.75 },
  pistoleer: { hp: 60, speed: 4.0, sight: 30, reach: 22, windup: 1.1, dmg: 18, recover: 3.0, radius: 0.4, height: 1.75 },
};
/** Grave-light burst radius (m). */
export const WISP_BURST = 2.6;
/** Damage multipliers by enemy and by how the blow was delivered. Anything not listed is ×1. */
export const RESIST: Partial<Record<EnemyKind, Partial<Record<DamageKind, number>>>> = {
  shade: { fire: 1.2 },
  drowned: { frost: 0.5, fire: 1.25, spark: 1.3 },
  imp: { fire: 0.25, frost: 1.6 },
  wolf: { fire: 1.2 },
  boar: { bullet: 0.85, melee: 0.8, frost: 1.3 },
  bandit: {},
  hollow: { frost: 0.7, bullet: 0.85, spark: 1.6, fire: 1.1 },
  wight: { bullet: 0.75, fire: 1.5, frost: 0.4, melee: 1.1 },
  wisp: { bullet: 0.7, fire: 0.5, frost: 1.3, spark: 2.0, melee: 1.3 },
  crab: { bullet: 0.6, frost: 1.5, melee: 0.8, spark: 1.2 },
  smuggler: {}, pistoleer: {},
};
const RANGED = (k: EnemyKind) => k === 'shade' || k === 'imp' || k === 'bandit' || k === 'pistoleer';
const GUNNER = (k: EnemyKind) => k === 'bandit' || k === 'pistoleer';
type AIState = 'idle' | 'chase' | 'windup' | 'strike' | 'recover' | 'hit' | 'dead' | 'return';

/** How a blow was delivered (the Cinder Wraith adapts to this). */
export type DamageKind = 'bullet' | 'fire' | 'frost' | 'spark' | 'melee';
export class Enemy {
  pos = new THREE.Vector3(); yaw = 0;
  hp: number; state: AIState = 'idle'; t = 0; anim = 0;
  model: Humanoid | Hound | Wisp | Crab; root: THREE.Group;
  /** v0.8: seconds left of rising out of the ground; time spent sinking back (0 = not sinking); a grave-light that burst. */
  rise = 0; sinkT = 0; burst = false;
  slowUntil = 0; burnUntil = 0; burnTick = 0; flash = 0; deadT = 0; strafe = gameplayRng.next() < 0.5 ? 1 : -1;
  /** P1: stable id, in spawn order (reset with the world), for hashing and replays. */
  id = 0;
  /** P1: position at the start of the last simulation tick, for render interpolation. */
  prevX = 0; prevZ = 0;
  wanderTarget = new THREE.Vector3(); voiceT = Math.random() * 5; los = false; losT = 0;
  /** Measured ground speed and movement direction relative to facing (for the gait). */
  lastX = 0; lastZ = 0; spd = 0; moveDir = 0; lastHitBig = false;
  /** Driven by another controller (the boss): skipped by the normal AI loop. */
  external = false; defOverride: EnemyDef | null = null; onDamage: ((amt: number, status?: 'burn' | 'slow', kind?: DamageKind) => void) | null = null;
  chargeDir = new THREE.Vector3(); chargeHit = false;
  constructor(public kind: EnemyKind, public home: THREE.Vector3, public tag: string | null, public elite = false) {
    if (tag?.startsWith('elite')) this.elite = true;
    this.hp = DEFS[kind].hp;
    if (kind === 'hound') { this.model = new Hound(0x34333d); }
    else if (kind === 'wolf') { this.model = new Hound(0x6e665c, 'wolf'); }
    else if (kind === 'boar') { this.model = new Hound(0x4a3426, 'boar'); }
    else if (kind === 'bandit') {
      const h = new Humanoid({ skin: 0xc8946a, shirt: 0x4a4a3a, pants: 0x3a3228, coat: 0x6a5238, boots: 0x221a12, hair: 0x2a1a10, hat: 'kerchief', bulk: 1.05 });
      const cb = makeCrossbow(); cb.rotation.set(-Math.PI / 2, 0, 0); cb.position.set(0, 0, -0.05); h.handRSlot.add(cb); this.model = h;
    } else if (kind === 'hollow') {
      const h = new Humanoid({ skin: 0x8a8070, shirt: 0x4a3a2a, pants: 0x3a3024, coat: 0x5a4a34, boots: 0x1a1410, hat: 'helm', glowEyes: 0xffb060, bulk: 1.1 });
      const pk = makeTool('pick'); pk.rotation.x = Math.PI / 2; h.handRSlot.add(pk); this.model = h;
    }
    else if (kind === 'wight') {
      const h = new Humanoid({ skin: 0x8a9488, shirt: 0x3a3e36, pants: 0x2e322c, coat: 0x4a4a3e, boots: 0x1a1c18, hat: 'helm', robe: true, glowEyes: 0xbfe8ff, bulk: 1.12, scale: 1.04 });
      const bl = makeTool('blade'); bl.rotation.x = Math.PI / 2; h.handRSlot.add(bl); this.model = h;
    } else if (kind === 'wisp') { this.model = new Wisp(); }
    else if (kind === 'crab') { this.model = new Crab(elite ? 0x8a3a2a : 0xa8503a, elite ? 1.35 : 1); }
    else if (kind === 'smuggler') {
      const h = new Humanoid({ skin: 0xc8946a, shirt: 0xd8d0c0, pants: 0x2a3448, coat: 0x2a3a52, boots: 0x1a1410, hair: 0x1a120c, hat: 'kerchief', bulk: 1.08, beard: Math.random() < 0.5 ? 0x2a1a10 : undefined });
      const bl = makeTool('cutlass'); bl.rotation.x = Math.PI / 2; h.handRSlot.add(bl); this.model = h;
    } else if (kind === 'pistoleer') {
      const h = new Humanoid({ skin: 0xb98058, shirt: 0x8a2a2a, pants: 0x2a2a2a, coat: 0x3a3028, boots: 0x1a1410, hair: 0x2a1a10, hat: 'wide' });
      const pistol = makeTool('pistol'); pistol.rotation.set(Math.PI / 2, 0, 0); h.handRSlot.add(pistol); this.model = h;
    }
    else if (kind === 'raider') {
      const h = new Humanoid({ skin: 0xc08a62, shirt: 0x7a3b2b, pants: 0x3b3328, coat: 0x5b3a26, boots: 0x221a12, hair: 0x1a120c, hat: 'cap', bulk: 1.15, scale: 1.02 });
      h.handRSlot.add(makeClub()); this.model = h;
    } else if (kind === 'drowned') {
      this.model = new Humanoid({ skin: 0x6f9a94, shirt: 0x1f3a38, pants: 0x1f3a38, coat: 0x24403e, boots: 0x0c1414, hair: 0x1a2a28, robe: true, glowEyes: 0x7fffe0, bulk: 1.18, scale: 1.02 });
    } else if (kind === 'imp') {
      this.model = new Humanoid({ skin: 0xd8502a, shirt: 0x7a1a0a, pants: 0x4a1208, boots: 0x2a0a04, glowEyes: 0xffd070, scale: 0.58 });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff8a2a })); orb.name = 'orb';
      (this.model as Humanoid).handRSlot.add(orb);
    } else {
      this.model = new Humanoid({ skin: 0x8f8fb0, shirt: 0x231d38, pants: 0x231d38, coat: 0x231d38, boots: 0x111111, hat: 'hood', robe: true, glowEyes: 0xb48cff, scale: 1.08 });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb48cff })); orb.name = 'orb';
      (this.model as Humanoid).handRSlot.add(orb);
    }
    this.root = this.model.root;
    if (this.elite) { const d = DEFS[kind]; this.defOverride = { ...d, hp: Math.round(d.hp * 2.2), dmg: Math.round(d.dmg * 1.3), sight: d.sight + 6 }; this.hp = this.defOverride.hp; this.root.scale.setScalar(1.22); }
    this.pos.copy(home).add(new THREE.Vector3((gameplayRng.next() - 0.5) * 8, 0, (gameplayRng.next() - 0.5) * 8));
    this.wanderTarget.copy(this.pos);
    this.root.position.copy(this.pos);
  }
  get def() { return this.defOverride ?? DEFS[this.kind]; }
  get alive() { return this.state !== 'dead'; }
  center(): THREE.Vector3 { return this.model instanceof Wisp ? this.pos.clone().setY(this.model.y) : this.pos.clone().setY(this.def.height * (this.kind === 'crab' ? 0.5 : 0.6)); }
}

const PGEO = { ball: new THREE.IcosahedronGeometry(0.16, 1), frost: new THREE.OctahedronGeometry(0.14), bolt: new THREE.BoxGeometry(0.03, 0.03, 0.5), shot: new THREE.SphereGeometry(0.05, 6, 4) };
const PMAT = { fire: new THREE.MeshBasicMaterial({ color: 0xff7a2a }), frost: new THREE.MeshBasicMaterial({ color: 0x8fe0ff }), orb: new THREE.MeshBasicMaterial({ color: 0xb48cff }), bolt: new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.8 }), shot: new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.4, metalness: 0.6 }) };
function glowTex(): THREE.Texture { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.35)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); }
const GT = typeof document !== 'undefined' ? glowTex() : null;
const PGLOW: Record<string, THREE.SpriteMaterial> = { fire: new THREE.SpriteMaterial({ map: GT, color: 0xff7a2a, blending: THREE.AdditiveBlending, depthWrite: false }), frost: new THREE.SpriteMaterial({ map: GT, color: 0x8fe0ff, blending: THREE.AdditiveBlending, depthWrite: false }), orb: new THREE.SpriteMaterial({ map: GT, color: 0xb48cff, blending: THREE.AdditiveBlending, depthWrite: false }) };
export interface Projectile { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; owner: 'player' | 'enemy'; dmg: number; kind: 'fire' | 'frost' | 'orb' | 'bolt' | 'shot'; light?: THREE.PointLight; src?: EnemyKind | string }

/** v0.8: a grave-light: a cold core, a halo and three motes that orbit it. Not a body: it bobs, weaves and swells. */
export class Wisp {
  root = new THREE.Group(); y = 1.35;
  private core: THREE.Mesh; private halo: THREE.Sprite; private motes: THREE.Mesh[] = []; private coreMat: THREE.MeshBasicMaterial; private haloMat: THREE.SpriteMaterial; private ph = Math.random() * 6;
  constructor(color = 0x9fe8ff) {
    this.coreMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff });
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), this.coreMat); this.root.add(this.core);
    this.haloMat = new THREE.SpriteMaterial({ map: GT, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
    this.halo = new THREE.Sprite(this.haloMat); this.halo.scale.setScalar(1.9); this.root.add(this.halo);
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.035, 5, 4), this.coreMat); this.root.add(m); this.motes.push(m); }
  }
  animate(state: 'idle' | 'chase' | 'windup' | 'strike' | 'hit' | 'dead', t: number, dt: number, speed: number) {
    this.ph += dt * (state === 'chase' ? 2.6 : 1.4);
    const bob = Math.sin(this.ph * 1.7) * 0.14 + Math.sin(this.ph * 0.6) * 0.06;
    this.y = 1.35 + bob; const sw = state === 'windup' ? 1 + t * 1.6 : state === 'dead' ? Math.max(0, 1 + t * 5) : 1;
    const fade = state === 'dead' ? Math.max(0, 1 - t * 2.2) : 1;
    this.core.position.set(0, this.y, 0); this.core.scale.setScalar(state === 'dead' ? fade : sw * (1 + Math.sin(this.ph * 9) * 0.06));
    this.halo.position.set(0, this.y, 0); this.halo.scale.setScalar(1.9 * sw * (1 + Math.sin(this.ph * 3.1) * 0.12) * (state === 'dead' ? 1 + t * 3 : 1));
    this.haloMat.opacity = 0.85 * fade * (state === 'windup' ? 1 : 0.75 + Math.sin(this.ph * 2.3) * 0.15);
    this.motes.forEach((m, i) => { const a = this.ph * (2.2 + speed * 0.3) + i * 2.09, r = 0.32 + Math.sin(this.ph + i) * 0.06; m.position.set(Math.cos(a) * r, this.y + Math.sin(a * 1.3 + i) * 0.18, Math.sin(a) * r); m.visible = fade > 0.05; });
    // lean into the direction of travel a little
    this.root.rotation.x = -Math.min(0.3, speed * 0.05);
  }
  tint(c: number, a: number) { this.coreMat.color.setHex(a > 0.5 ? 0xffffff : 0xe8fbff); if (a > 0.5) this.haloMat.color.setHex(0xffffff); else this.haloMat.color.setHex(0x9fe8ff); void c; }
}

export interface CombatHooks {
  hurtPlayer(amount: number, source: EnemyKind | string): void;
  killed(e: Enemy): void;
  sound(name: 'growl' | 'shout' | 'hiss' | 'orb' | 'swing' | 'hit', pan: number): void;
  playerShielded(): boolean;
}

export class EnemyManager {
  list: Enemy[] = [];
  projectiles: Projectile[] = [];
  constructor(private scene: THREE.Scene, private colliders: Box[], private hooks: CombatHooks) {}

  spawn(kind: EnemyKind, home: THREE.Vector3, tag: string | null, elite = false, rise = false): Enemy {
    const e = new Enemy(kind, home, tag, elite);
    if (rise) { e.rise = kind === 'wisp' ? 1.2 : 2.0; }
    const [x, z] = collide(this.colliders, e.pos.x, e.pos.z, e.def.radius); e.pos.set(x, 0, z);
    e.id = ++this.nextId; e.prevX = e.pos.x; e.prevZ = e.pos.z;
    this.scene.add(e.root); this.list.push(e); return e;
  }
  nextId = 0;
  remove(e: Enemy) { this.scene.remove(e.root); this.list = this.list.filter(x => x !== e); }
  /** v0.8: the night's dead go back into the ground at dawn (no reward). */
  sink(e: Enemy) { if (e.alive && e.sinkT === 0) { e.sinkT = 0.001; e.state = 'idle'; } }
  clearTag(tag: string) { for (const e of [...this.list]) if (e.tag === tag) this.remove(e); }

  damage(e: Enemy, amount: number, now: number, status?: 'burn' | 'slow', kind?: DamageKind) {
    if (!e.alive) return;
    if (e.external) { e.onDamage?.(amount, status, kind); e.flash = 0.15; if (e.hp <= 0) { e.state = 'dead'; e.anim = 0; e.deadT = 0; this.hooks.killed(e); } else this.hooks.sound('hit', 0); return; }
    amount *= (kind && RESIST[e.kind]?.[kind]) || 1;
    if (e.kind === 'imp' && status === 'burn') status = undefined;
    e.hp -= amount; e.flash = 0.15;
    if (status === 'burn') e.burnUntil = now + 3;
    if (status === 'slow') e.slowUntil = now + 3;
    if (e.hp <= 0) { e.state = 'dead'; e.anim = 0; e.deadT = 0; this.hooks.killed(e); return; }
    if (e.state === 'idle' || e.state === 'return') e.state = 'chase';
    if (e.model instanceof Humanoid) e.model.flinch((Math.random() - 0.5) * 0.6, 1, Math.min(1.6, amount / 22));
    const big = amount >= e.def.hp * 0.3;
    if (e.state !== 'windup' && e.state !== 'strike' && amount >= 15) { e.state = 'hit'; e.t = big ? -0.35 : 0; e.anim = 0; e.lastHitBig = big; }
    this.hooks.sound('hit', 0);
  }

  /** Ray from o in direction d: closest living enemy hit within range, ignoring those behind walls. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, range: number): { e: Enemy; dist: number } | null {
    const wall = rayBoxes(this.colliders, o, d, range);
    let best: { e: Enemy; dist: number } | null = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.kind === 'wisp') { const c = e.center(), oc = c.clone().sub(o), tca = oc.dot(d); if (tca > 0 && tca < range && tca < wall && oc.lengthSq() - tca * tca < 0.4 * 0.4 && (!best || tca < best.dist)) best = { e, dist: tca }; continue; }
      const quad = e.kind === 'hound' || e.kind === 'wolf' || e.kind === 'boar' || e.kind === 'crab'; const sc = e.def.height / 1.9, c = e.center(), r = e.kind === 'crab' ? e.def.radius + 0.18 : e.kind === 'boar' ? 0.7 : quad ? 0.55 : 0.5;
      const oc = c.clone().sub(o), tca = oc.dot(d); if (tca < 0) continue;
      const d2 = oc.lengthSq() - tca * tca; const rr = (quad ? r : 0.42 * Math.max(1, sc)) ** 2;
      // humanoids: test a vertical capsule approximated by two spheres
      let hit = d2 < rr;
      if (!hit && !quad) { const c2 = e.pos.clone().setY(e.def.height * 0.9); const oc2 = c2.clone().sub(o), t2 = oc2.dot(d); if (t2 > 0 && oc2.lengthSq() - t2 * t2 < 0.3 * 0.3) hit = true; const c3 = e.pos.clone().setY(e.def.height * 0.3); const oc3 = c3.clone().sub(o), t3 = oc3.dot(d); if (t3 > 0 && oc3.lengthSq() - t3 * t3 < 0.38 * 0.38) hit = true; }
      if (hit && tca < range && tca < wall && (!best || tca < best.dist)) best = { e, dist: tca };
    }
    return best;
  }

  fireProjectile(from: THREE.Vector3, dir: THREE.Vector3, owner: 'player' | 'enemy', kind: Projectile['kind'], dmg: number, src?: EnemyKind | string) {
    const color = kind === 'fire' ? 0xff7a2a : kind === 'frost' ? 0x8fe0ff : 0xb48cff;
    // Shared geometry and material, and no per-projectile light: adding lights forces every shader to recompile (stutter).
    const mesh = new THREE.Mesh(kind === 'frost' ? PGEO.frost : kind === 'bolt' ? PGEO.bolt : kind === 'shot' ? PGEO.shot : PGEO.ball, PMAT[kind]);
    mesh.position.copy(from); this.scene.add(mesh);
    if (kind === 'bolt') mesh.lookAt(from.clone().add(dir));
    else if (kind === 'shot') { /* a lead ball: no glow */ }
    else { const glow = new THREE.Sprite(PGLOW[kind]); glow.scale.setScalar(0.9); mesh.add(glow); }
    void color; const light = undefined;
    const speed = kind === 'orb' ? 13 : kind === 'frost' ? 34 : kind === 'bolt' ? 30 : kind === 'shot' ? 42 : owner === 'enemy' ? 16 : 28;
    this.projectiles.push({ mesh, vel: dir.clone().normalize().multiplyScalar(speed), life: 3, owner, dmg, kind, light, src });
  }

  update(dt: number, now: number, player: THREE.Vector3, playerAlive: boolean, onPlayerProjectileHit: (p: Projectile, e: Enemy | null, at: THREE.Vector3) => void) {
    // ---- enemies ----
    for (const e of [...this.list]) {
      if (e.external) continue;
      const D = e.def; e.t += dt; e.anim += dt;
      if (e.state === 'dead') {
        e.deadT += dt;
        if (e.kind === 'wisp') { this.pose(e, dt); if (e.deadT > 0.6) this.remove(e); continue; }
        if (e.deadT > 4) e.root.position.y = -(e.deadT - 4) * 0.4;
        if (e.deadT > 7) this.remove(e);
        this.pose(e, dt);
        continue;
      }
      if (e.sinkT > 0) { e.sinkT += dt; this.pose(e, dt); if (e.sinkT > 2.4) this.remove(e); continue; }
      if (e.rise > 0) { e.rise -= dt; this.pose(e, dt); continue; }
      if (now < e.burnUntil) { e.burnTick += dt; if (e.burnTick > 0.5) { e.burnTick = 0; this.damage(e, 3, now); if (!e.alive) continue; } }
      const slow = now < e.slowUntil ? 0.5 : 1;
      const toP = player.clone().sub(e.pos); toP.y = 0; const dist = toP.length();
      const eye = e.pos.clone().setY(D.height * 0.9), dirP = player.clone().setY(1.4).sub(eye);
      // Line of sight is re-tested five times a second per enemy, not every frame.
      e.losT -= dt;
      if (e.losT <= 0) { e.losT = 0.2 + gameplayRng.next() * 0.05; e.los = dist < D.sight && rayBoxes(this.colliders, eye, dirP.clone().normalize(), dirP.length()) >= dirP.length() - 0.3; }
      const los = e.los && dist < D.sight;
      const fromHome = e.pos.distanceTo(e.home);
      const face = (target: THREE.Vector3, rate = 8) => { const want = Math.atan2(-(target.x - e.pos.x), -(target.z - e.pos.z)); let dlt = want - e.yaw; while (dlt > Math.PI) dlt -= Math.PI * 2; while (dlt < -Math.PI) dlt += Math.PI * 2; e.yaw += dlt * Math.min(1, dt * rate); };
      const move = (dir: THREE.Vector3, speed: number) => {
        if (dir.lengthSq() < 1e-6) return;
        dir.normalize().multiplyScalar(speed * slow * dt);
        // separation
        for (const o of this.list) if (o !== e && o.alive) { const s = e.pos.clone().sub(o.pos); const l = s.length(); if (l < 1.2 && l > 0.01) dir.add(s.multiplyScalar((1.2 - l) * 0.08)); }
        const [x, z] = collide(this.colliders, e.pos.x + dir.x, e.pos.z + dir.z, D.radius);
        let md = Math.atan2(-dir.x, -dir.z) - e.yaw; while (md > Math.PI) md -= Math.PI * 2; while (md < -Math.PI) md += Math.PI * 2; e.moveDir = md;
        e.pos.set(x, 0, z);
      };
      e.voiceT -= dt;
      const pan = Math.max(-1, Math.min(1, toP.x / 20));
      switch (e.state) {
        case 'idle': {
          if (playerAlive && los) { e.state = 'chase'; e.t = 0; this.hooks.sound(e.kind === 'hound' || e.kind === 'wolf' || e.kind === 'boar' ? 'growl' : e.kind === 'raider' || e.kind === 'bandit' || e.kind === 'smuggler' || e.kind === 'pistoleer' ? 'shout' : 'hiss', pan); break; }
          if (e.kind === 'drowned' || e.kind === 'hollow' || e.kind === 'wight') break; // the drowned, the hollowed and the barrow dead stand where they are until something living comes near
          if (e.pos.distanceTo(e.wanderTarget) < 0.6 || e.t > 6) { e.t = 0; e.wanderTarget.copy(e.home).add(new THREE.Vector3((gameplayRng.next() - 0.5) * 12, 0, (gameplayRng.next() - 0.5) * 12)); }
          const w = e.wanderTarget.clone().sub(e.pos); if (w.length() > 0.6) { face(e.wanderTarget, 4); move(w, D.speed * 0.3); }
          break;
        }
        case 'return': {
          const w = e.home.clone().sub(e.pos); face(e.home); move(w, D.speed * 0.8);
          if (w.length() < 2) { e.state = 'idle'; e.t = 0; e.hp = Math.min(D.hp, e.hp + 20); }
          if (los && fromHome < 30 && playerAlive) e.state = 'chase';
          break;
        }
        case 'chase': {
          if (!playerAlive || (fromHome > 48 && e.tag !== 'gate')) { e.state = 'return'; break; }
          if (e.voiceT < 0) { e.voiceT = 4 + Math.random() * 4; this.hooks.sound(e.kind === 'hound' || e.kind === 'wolf' || e.kind === 'boar' ? 'growl' : e.kind === 'raider' || e.kind === 'bandit' || e.kind === 'smuggler' || e.kind === 'pistoleer' ? 'shout' : 'hiss', pan); }
          face(player);
          if (RANGED(e.kind)) {
            // keep distance, strafe, cast when in range with line of sight
            const want = e.kind === 'imp' ? (dist < 5 ? -1 : dist > 10 ? 1 : 0) : e.kind === 'bandit' ? (dist < 9 ? -1 : dist > 18 ? 1 : 0) : e.kind === 'pistoleer' ? (dist < 10 ? -1 : dist > 16 ? 1 : 0) : dist < 8 ? -1 : dist > 13 ? 1 : 0;
            const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(e.strafe * 0.7);
            move(toP.clone().normalize().multiplyScalar(want).add(side), D.speed);
            if (gameplayRng.next() < dt * 0.3) e.strafe *= -1;
            if (los && dist < D.reach && e.t > (e.kind === 'imp' ? 0.8 : e.kind === 'bandit' ? 1.6 : 1.2)) { e.state = 'windup'; e.t = 0; e.anim = 0; if (e.kind === 'pistoleer') this.hooks.sound('shout', pan); }
          } else if (e.kind === 'boar') {
            // close to charging distance, then paw the ground and go
            if (dist > 8.5 || !los) move(toP.clone(), D.speed);
            else if (e.t > 0.5) { e.state = 'windup'; e.t = 0; e.anim = 0; this.hooks.sound('growl', pan); }
          } else if (e.kind === 'wisp') {
            // weave in: a sideways drift that swings back and forth, closing all the time
            const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.sin(e.anim * 2.4 + e.strafe) * 0.9);
            if (dist > D.reach * 0.8) move(toP.clone().normalize().add(side), D.speed);
            else if (e.t > 0.15) { e.state = 'windup'; e.t = 0; e.anim = 0; this.hooks.sound('hiss', pan); }
          } else if (e.kind === 'crab' && dist > 1.6 && dist < 6 && e.t < 1.1 + (e.strafe > 0 ? 0.5 : 0)) {
            // sidle round you at about three metres, facing you, then dart in
            const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(e.strafe);
            move(side.add(toP.clone().normalize().multiplyScalar(dist > 3.4 ? 0.5 : dist < 2.6 ? -0.5 : 0)), D.speed * 0.75);
          } else if (e.kind === 'wolf' && dist > 2.0 && dist < 7 && e.t < 1.4 + (e.strafe > 0 ? 0.3 : 0)) {
            // circle at the edge of reach, then dart in
            const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(e.strafe);
            move(side.add(toP.clone().normalize().multiplyScalar(dist > 4.5 ? 0.6 : -0.2)), D.speed * 0.8);
          } else {
            if (dist > D.reach * 0.85) move(toP.clone(), D.speed);
            else if (e.t > 0.2) { e.state = 'windup'; e.t = 0; e.anim = 0; }
          }
          break;
        }
        case 'windup': {
          face(player, 5);
          if (e.kind === 'wisp') {
            if (dist > 0.9) move(toP.clone(), D.speed * 0.35);
            if (e.t >= D.windup) {
              // it bursts: everything close gets the cold; the light is gone, with nothing to show for it
              if (playerAlive && dist < WISP_BURST) this.hooks.hurtPlayer(D.dmg * (dist < WISP_BURST * 0.5 ? 1 : 0.6), 'wisp');
              this.hooks.sound('orb', pan); e.burst = true; e.hp = 0; e.state = 'dead'; e.anim = 0; e.deadT = 0;
            }
            break;
          }
          if (e.t >= D.windup) {
            e.state = 'strike'; e.t = 0; e.anim = 0;
            if (RANGED(e.kind)) {
              const hand = e.pos.clone().setY(e.kind === 'imp' ? 1.0 : GUNNER(e.kind) ? 1.45 : 1.6); const dir = player.clone().setY(1.2).sub(hand).normalize();
              if (GUNNER(e.kind)) { dir.x += (gameplayRng.next() - 0.5) * 0.05; dir.y += (gameplayRng.next() - 0.5) * 0.03; dir.normalize(); }
              this.fireProjectile(hand.add(dir.clone().multiplyScalar(0.5)), dir, 'enemy', e.kind === 'imp' ? 'fire' : e.kind === 'bandit' ? 'bolt' : e.kind === 'pistoleer' ? 'shot' : 'orb', D.dmg, e.kind); this.hooks.sound(e.kind === 'bandit' ? 'swing' : e.kind === 'pistoleer' ? 'hit' : 'orb', pan);
            } else if (e.kind === 'boar') {
              e.chargeHit = false; e.chargeDir.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)); this.hooks.sound('growl', pan);
            } else {
              this.hooks.sound('swing', pan);
              if (e.kind === 'hound' || e.kind === 'wolf') { const lunge = toP.clone().normalize().multiplyScalar(1.4); const [x, z] = collide(this.colliders, e.pos.x + lunge.x, e.pos.z + lunge.z, D.radius); e.pos.set(x, 0, z); }
              const d2 = player.clone().setY(0).distanceTo(e.pos);
              const fwd = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
              if (d2 < D.reach + 0.4 && fwd.dot(toP.clone().normalize()) > 0.3 && playerAlive) this.hooks.hurtPlayer(D.dmg, e.kind);
            }
          }
          break;
        }
        case 'strike': {
          if (e.kind === 'boar') {
            // a straight charge: it cannot turn; hitting a wall stuns it
            const sp = 11.5 * slow * dt, nx = e.pos.x + e.chargeDir.x * sp, nz = e.pos.z + e.chargeDir.z * sp;
            const [x, z] = collide(this.colliders, nx, nz, D.radius);
            const blocked = Math.hypot(x - nx, z - nz) > 0.05;
            e.pos.set(x, 0, z);
            if (!e.chargeHit && playerAlive && player.clone().setY(0).distanceTo(e.pos) < 1.5) { e.chargeHit = true; this.hooks.hurtPlayer(D.dmg, e.kind); }
            if (blocked || e.t > 0.75) { e.state = 'recover'; e.t = blocked ? -1.4 : 0; if (blocked) this.hooks.sound('hit', pan); }
            break;
          }
          if (e.t > 0.3) { e.state = 'recover'; e.t = 0; } break;
        }
        case 'recover': if (e.kind === 'crab' && e.t < 0.45) move(toP.clone().negate(), D.speed * 0.6); if (e.t > D.recover) { e.state = 'chase'; e.t = 0; } break;
        case 'hit': if (e.t > 0.35) { e.state = 'chase'; e.t = 0; } break;
      }
      this.pose(e, dt);
    }
    // ---- projectiles ----
    for (const p of [...this.projectiles]) {
      p.life -= dt;
      const step = p.vel.clone().multiplyScalar(dt), len = step.length(), dir = step.clone().normalize();
      const wall = rayBoxes(this.colliders, p.mesh.position, dir, len);
      let done = p.life <= 0 || p.mesh.position.y < 0.05 || wall < len;
      if (!done && p.owner === 'player') {
        const h = this.raycast(p.mesh.position, dir, len + 0.3);
        if (h) { onPlayerProjectileHit(p, h.e, p.mesh.position.clone()); done = true; }
      }
      if (!done && p.owner === 'enemy') {
        const pp = player.clone().setY(1.1);
        if (p.mesh.position.distanceTo(pp) < 0.7) { if (!this.hooks.playerShielded()) this.hooks.hurtPlayer(p.dmg, p.src ?? 'shade'); else this.hooks.sound('hit', 0); done = true; }
      }
      if (done) {
        if (p.owner === 'player' && wall < len) onPlayerProjectileHit(p, null, p.mesh.position.clone().add(dir.multiplyScalar(wall)));
        else if (p.owner === 'player' && p.mesh.position.y < 0.05) onPlayerProjectileHit(p, null, p.mesh.position.clone());   // into the floor
        this.scene.remove(p.mesh); this.projectiles = this.projectiles.filter(x => x !== p); continue;
      }
      p.mesh.position.add(step); if (p.kind !== 'bolt') { p.mesh.rotation.x += dt * 8; p.mesh.rotation.y += dt * 6; }
    }
  }

  private pose(e: Enemy, dt: number) {
    // measured ground speed drives the gait, so feet keep pace with the ground
    const moved = Math.hypot(e.pos.x - e.lastX, e.pos.z - e.lastZ) / Math.max(dt, 1e-4); e.lastX = e.pos.x; e.lastZ = e.pos.z;
    e.spd += (Math.min(moved, 12) - e.spd) * Math.min(1, dt * 10);
    e.root.position.x = e.pos.x; e.root.position.z = e.pos.z; if (e.state !== 'dead') e.root.position.y = 0;
    if (e.model instanceof Wisp) {
      const st = e.state === 'dead' ? 'dead' : e.state === 'windup' ? 'windup' : e.state === 'chase' ? 'chase' : e.state === 'hit' ? 'hit' : 'idle';
      e.root.rotation.y = e.yaw; e.model.animate(st, e.state === 'dead' ? e.deadT : e.anim, dt, e.spd); e.model.tint(0, e.flash > 0 ? 0.9 : 0);
      if (e.rise > 0) e.root.position.y = -1.5 * (e.rise / 1.2); if (e.sinkT > 0) e.root.position.y = -e.sinkT * 0.9;
      e.flash = Math.max(0, e.flash - dt); return;
    }
    e.root.rotation.y = e.yaw;
    e.flash = Math.max(0, e.flash - dt);
    const burning = performance.now() / 1000 < e.burnUntil;
    const tintC = e.flash > 0 ? 0xffffff : burning ? 0xff5500 : performance.now() / 1000 < e.slowUntil ? 0x55aaff : 0x000000;
    const tintA = e.flash > 0 ? 0.9 : burning || tintC !== 0 ? 0.35 : 0;
    if (e.model instanceof Crab) {
      const st = e.state === 'windup' ? 'windup' : e.state === 'strike' ? 'strike' : e.state === 'hit' ? 'hit' : e.state === 'dead' ? 'die' : e.spd > 0.3 ? 'walk' : 'idle';
      e.model.animate(st, e.state === 'dead' ? e.deadT : e.anim, dt, e.spd, e.spd > 0.3 ? e.moveDir : Math.PI / 2);
      e.model.tint(tintC, tintA);
      return;
    }
    if (e.model instanceof Hound) {
      const moving = e.spd > 0.4;
      const st = e.state === 'windup' ? 'windup' : e.state === 'strike' ? (e.kind === 'boar' ? 'charge' : 'bite') : e.state === 'hit' ? 'hit' : e.state === 'dead' ? 'die' : moving ? (e.spd > 3.2 ? 'run' : 'walk') : 'idle';
      e.model.animate(st, e.anim, dt, e.spd);
      e.model.tint(tintC, tintA);
      return;
    }
    const h = e.model as Humanoid;
    let pose: Pose, key: string, sharp = 14;
    const moving = e.spd > 0.35;
    if (RANGED(e.kind)) {
      const c: ClipName = e.state === 'windup' ? (GUNNER(e.kind) ? 'crossbow' : 'castOrb') : e.state === 'strike' && GUNNER(e.kind) ? 'shootBow' : e.state === 'dead' ? 'die' : e.state === 'hit' ? 'hit' : GUNNER(e.kind) ? 'ready' : 'float';
      if (GUNNER(e.kind) && moving && (c === 'ready')) { h.stride(dt, e.spd, e.spd > 3.5); pose = layered(gaitPose(h.phase, e.spd, e.spd > 3.5, { dir: e.moveDir }), clip('crossbow', e.anim)); key = 'move'; }
      else { pose = clip(c, e.anim); key = c; }
    } else {
      let c: ClipName;
      switch (e.state) {
        case 'windup': c = e.kind === 'hollow' || e.kind === 'wight' ? 'slam' : 'windup'; break;
        case 'strike': c = e.kind === 'drowned' ? 'lunge' : e.kind === 'hollow' || e.kind === 'wight' ? 'slam' : 'melee'; sharp = 30; break;
        case 'recover': c = 'ready'; break;
        case 'hit': c = e.lastHitBig ? 'stagger' : 'hit'; break;
        case 'dead': c = 'die'; break;
        default: c = moving ? 'walk' : e.state === 'chase' ? 'ready' : 'idle';
      }
      if (e.rise > 0 || e.sinkT > 0) { c = 'rise'; }
      if (c === 'rise') { pose = clip('rise', e.rise > 0 ? Math.max(0, 1.9 - e.rise) : Math.max(0, 1.9 - e.sinkT * 0.9)); key = 'rise'; }
      else if (c === 'walk') {
        const slowDead = e.kind === 'drowned' || e.kind === 'hollow' || e.kind === 'wight';
        const run = e.spd > 3.4 && !slowDead;
        h.stride(dt, e.spd, run);
        pose = gaitPose(h.phase, e.spd, run, { dir: e.moveDir, tired: slowDead ? (e.kind === 'wight' ? 1 : 0.8) : 0 });
        if (slowDead) { pose.r.shoulderL = [0.9, 0, -0.1]; pose.r.shoulderR = [0.9, 0, 0.1]; pose.r.elbowL = [0.2, 0, 0]; pose.r.elbowR = [0.2, 0, 0]; }
        if (e.kind === 'wight') {
          // the lurch: the left leg drags, so the body drops and rolls on every left step, and the blade arm hangs
          const ph = h.phase, drag = Math.max(0, Math.sin(ph)), roll = Math.sin(ph) * 0.12 + Math.sin(ph * 2) * 0.05;
          pose.r.spine = [-0.22 - drag * 0.1, Math.sin(ph) * 0.1, roll]; pose.r.head = [0.18, -Math.sin(ph) * 0.12, -roll * 0.6];
          pose.r.thighL = [(pose.r.thighL?.[0] ?? 0) * 0.55, 0, -0.06]; pose.r.kneeL = [(pose.r.kneeL?.[0] ?? 0) * 0.4, 0, 0]; pose.r.footL = [0.25, 0, 0.1];
          pose.r.shoulderR = [0.45 + Math.sin(ph) * 0.1, 0, 0.12]; pose.r.elbowR = [0.35, 0, 0];
          pose.hy = (pose.hy ?? 0) - drag * 0.07;
        }
        key = run ? 'run' : 'walk';
      } else if (c === 'slam' && e.state === 'strike') { pose = clip('slam', 0.5 + e.anim); key = 'slam'; }
      else { pose = clip(c, e.anim); key = c; }
    }
    h.apply(pose, dt, sharp, key);
    h.tint(tintC, tintA);
    if (e.rise > 0) e.root.position.y = -1.7 * Math.pow(Math.max(0, e.rise) / 2, 1.6);
    if (e.sinkT > 0) e.root.position.y = -1.9 * Math.min(1, Math.pow(e.sinkT / 2.2, 1.4));
    const orb = h.handRSlot.getObjectByName('orb'); if (orb) orb.scale.setScalar(e.state === 'windup' ? 1 + e.t * 2.5 : 1);
  }
}
