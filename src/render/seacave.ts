// v0.9: the Sea Cave under Wreckers' Cove (docs/gdd/saltway.md §3.4–3.5), off-map at x ≥ 430 (ADR-015): a tunnel
// from the cove, the smugglers' store with the Merry Wren's own cargo, and the grotto where the sea comes in,
// with three rock platforms, a pool, and the Wreck-Mother. In her second phase the tide floods the grotto floor
// (wading everywhere but the platforms).
import * as THREE from 'three';
import { World, MAT, M, collide, type Box } from './world';
import { Crab } from './crab';
import { Enemy, type EnemyDef, type EnemyManager, type DamageKind } from './enemies';
import { motherArmour, MOTHER_PHASE2, MOTHER_CALLS } from '../sim/south';

import { gameplayRng } from '../sim/rng';
export const SEA_O = { x: 520, z: -300 };
export interface SeaCaveRefs {
  origin: THREE.Vector3; spawn: THREE.Vector3; grotto: THREE.Vector3; pool: THREE.Vector3;
  platforms: { x: number; z: number; r: number }[];
  flood: THREE.Mesh; floodLevel: number;
  setFlood(k: number): void;
  inStore(p: THREE.Vector3): boolean; inGrotto(p: THREE.Vector3): boolean; onPlatform(p: THREE.Vector3): boolean;
  animate(dt: number, t: number): void;
}

export function buildSeaCave(w: World): SeaCaveRefs {
  let seed = 7717;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const x0 = SEA_O.x, z0 = SEA_O.z;
  const mats = { floor: M(0x2e3236), wet: M(0x23282c), rock: M(0x3a3e42), rockDark: M(0x26292c), weed: M(0x2a3a2a), pool: M(0x10303a, { roughness: 0.08, metalness: 0.4 }), flood: M(0x1e4a54, { roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.8 }), shaft: new THREE.MeshBasicMaterial({ color: 0x9fc8d8, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), bone: M(0xd8d0b8), canvas: M(0xa89a7a) };
  const add = (m: THREE.Object3D) => { w.add(m); return m; };
  const wallRock = (x: number, z: number, s: number) => w.put('cvRock', () => new THREE.DodecahedronGeometry(1, 0), mats.rock, V(x, s * 0.9, z), new THREE.Euler(rnd() * 3, rnd() * 3, 0), V(s, s * 1.8, s));
  const box = (minX: number, maxX: number, minZ: number, maxZ: number) => w.colliders.push({ minX, maxX, minZ, maxZ, h: 6 });
  const wallLine = (xa: number, za: number, xb: number, zb: number) => { const n = Math.max(1, Math.round(Math.hypot(xb - xa, zb - za) / 2.2)); for (let i = 0; i <= n; i++) { const t = i / n; wallRock(xa + (xb - xa) * t + (rnd() - 0.5), za + (zb - za) * t + (rnd() - 0.5), 1.4 + rnd() * 0.9); } };
  // floor and ceiling over the whole cave
  { const f = new THREE.Mesh(new THREE.PlaneGeometry(48, 84), mats.floor); f.rotation.x = -Math.PI / 2; f.position.set(x0, 0, z0 - 40); f.receiveShadow = true; w.scene.add(f);
    const c = new THREE.Mesh(new THREE.PlaneGeometry(48, 84), mats.rockDark); c.rotation.x = Math.PI / 2; c.position.set(x0, 6.2, z0 - 40); w.scene.add(c); }
  // the tunnel in from the cove (x0 ± 3, z0 → z0 − 18)
  box(x0 - 10, x0 + 10, z0 + 1, z0 + 3); box(x0 - 10, x0 - 3, z0 - 20, z0 + 1); box(x0 + 3, x0 + 10, z0 - 20, z0 + 1);
  wallLine(x0 - 3.8, z0 + 1, x0 - 3.8, z0 - 18); wallLine(x0 + 3.8, z0 + 1, x0 + 3.8, z0 - 18); wallLine(x0 - 3, z0 + 2, x0 + 3, z0 + 2);
  const spawn = V(x0, 0, z0 - 3);
  w.interact('cave_exit', x0, z0 - 1.2, 'Back out to the cove', 'interact', 1.8, 0);
  // the smugglers' store (x0 ± 12, z0 − 18 → z0 − 34)
  box(x0 - 20, x0 - 12, z0 - 36, z0 - 16); box(x0 + 12, x0 + 20, z0 - 36, z0 - 16);
  box(x0 - 12, x0 - 3, z0 - 20, z0 - 18); box(x0 + 3, x0 + 12, z0 - 20, z0 - 18);
  box(x0 - 12, x0 - 3, z0 - 36, z0 - 34); box(x0 + 3, x0 + 12, z0 - 36, z0 - 34);
  wallLine(x0 - 12.8, z0 - 18, x0 - 12.8, z0 - 34); wallLine(x0 + 12.8, z0 - 18, x0 + 12.8, z0 - 34);
  wallLine(x0 - 12, z0 - 19, x0 - 4, z0 - 19); wallLine(x0 + 4, z0 - 19, x0 + 12, z0 - 19); wallLine(x0 - 12, z0 - 35, x0 - 4, z0 - 35); wallLine(x0 + 4, z0 - 35, x0 + 12, z0 - 35);
  {
    const crate = (x: number, z: number, s = 0.9) => w.block(x, z, s, s, s, MAT.woodLight);
    for (let i = 0; i < 6; i++) crate(x0 - 10 + (i % 3) * 1.0, z0 - 21.5 - Math.floor(i / 3) * 1.0);
    for (let i = 0; i < 4; i++) crate(x0 + 8 + (i % 2) * 1.0, z0 - 30 - Math.floor(i / 2) * 1.0);
    for (const [bx, bz] of [[x0 + 10.5, z0 - 21], [x0 + 10, z0 - 22.2], [x0 - 10.6, z0 - 31]]) { const b = w.cyl(bx, bz, 0.4, 1.0, MAT.wood, 0, 8); b.castShadow = true; }
    w.block(x0 - 4, z0 - 27, 2.6, 1.2, 0.85, MAT.wood);                                    // the smugglers' table
    const stencil = (x: number, z: number) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.25), M(0x1a1a1a)); p.position.set(x, 0.55, z); add(p); };
    stencil(x0 - 10, z0 - 21.04); stencil(x0 + 8, z0 - 29.54);
    w.interact('cave_crate_1', x0 - 9, z0 - 23.2, 'Crates stencilled MERRY WREN', 'pick', 1.4, 0);
    w.interact('cave_crate_2', x0 + 7.2, z0 - 31.5, 'A ship\'s strongbox', 'pick', 1.3, Math.PI / 2);
    for (const [lx, lz] of [[x0 - 4, z0 - 26.6], [x0 + 6, z0 - 20.5]]) { const lt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.32, 0.25), w.lampGlass); lt.position.set(lx, 1.0, lz); w.scene.add(lt); w.lights.add(lx, 1.4, lz, 0xffb060, 9, 12, 1.6, { flicker: 0.06, zone: 'seacave' }); }
  }
  // the passage to the grotto (x0 ± 3, z0 − 34 → z0 − 40)
  box(x0 - 12, x0 - 3, z0 - 42, z0 - 34); box(x0 + 3, x0 + 12, z0 - 42, z0 - 34);
  wallLine(x0 - 3.8, z0 - 35, x0 - 3.8, z0 - 41); wallLine(x0 + 3.8, z0 - 35, x0 + 3.8, z0 - 41);
  // the grotto: a round sea cave, radius 17, centred 58 m in; the pool where the sea comes in at the far side
  const G0 = V(x0, 0, z0 - 58), R = 17;
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < 0.2) continue;          // the passage comes in from the south
    const x = G0.x + Math.cos(a) * (R + 1.4), z = G0.z + Math.sin(a) * (R + 1.4);
    w.colliders.push({ minX: x - 2.2, maxX: x + 2.2, minZ: z - 2.2, maxZ: z + 2.2, h: 6 }); wallRock(x, z, 2 + rnd() * 1.2);
  }
  const platforms = [{ x: G0.x - 9, z: G0.z + 5, r: 3.2 }, { x: G0.x + 9, z: G0.z + 5, r: 3.2 }, { x: G0.x, z: G0.z - 7, r: 3.2 }];
  for (const p of platforms) {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r + 0.3, 0.06, 10), mats.rock); top.position.set(p.x, 0.02, p.z); w.add(top);
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; w.put('cvEdge', () => new THREE.DodecahedronGeometry(0.4, 0), mats.rockDark, V(p.x + Math.cos(a) * (p.r + 0.2), 0.12, p.z + Math.sin(a) * (p.r + 0.2)), new THREE.Euler(rnd(), rnd(), 0), V(1, 0.5, 1), false); }
  }
  const pool = V(G0.x, 0, G0.z - 13);
  { const pm = new THREE.Mesh(new THREE.CircleGeometry(4.5, 16), mats.pool); pm.rotation.x = -Math.PI / 2; pm.position.set(pool.x, 0.015, pool.z); w.add(pm);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 3.2, 6.2, 10, 1, true), mats.shaft); shaft.position.set(pool.x, 3.1, pool.z); shaft.renderOrder = 4; w.scene.add(shaft);
    w.lights.add(pool.x, 4.5, pool.z, 0x9fd0e0, 10, 18, 1.4, { zone: 'seacave' });
    for (let i = 0; i < 14; i++) { const a = rnd() * 6.28, d = 6 + rnd() * 9; const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.2 + rnd(), 4), mats.bone); b.position.set(G0.x + Math.cos(a) * d, 0.06, G0.z + Math.sin(a) * d); b.rotation.set(Math.PI / 2, rnd() * 3, 0); add(b); }   // bones of boats
    for (let i = 0; i < 3; i++) { const k = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.1, 4, 8, Math.PI), MAT.timber); k.position.set(G0.x - 12 + i * 11, 0.1, G0.z - 9 + (i % 2) * 14); k.rotation.set(Math.PI / 2 - 0.3, rnd() * 3, 0); add(k); }   // ribs of a wreck
    for (const [lx, lz] of [[G0.x - 14, G0.z + 2], [G0.x + 14, G0.z + 2]]) w.lights.add(lx, 1.2, lz, 0x7ab8a8, 6, 12, 1.6, { flicker: 0.03, zone: 'seacave' });
    w.lights.add(G0.x, 5.2, G0.z - 2, 0xb8d8e0, 9, 24, 1.3, { zone: 'seacave' });   // v0.9.3: daylight off the water over the floor, so she can be seen
  }
  // the flood: a sheet of water over the grotto floor with holes where the platforms stand dry
  const shape = new THREE.Shape(); shape.absarc(0, 0, R + 1, 0, Math.PI * 2, false);
  for (const p of platforms) { const h = new THREE.Path(); h.absarc(p.x - G0.x, -(p.z - G0.z), p.r - 0.1, 0, Math.PI * 2, true); shape.holes.push(h); }
  const flood = new THREE.Mesh(new THREE.ShapeGeometry(shape, 20).rotateX(-Math.PI / 2), mats.flood); flood.position.set(G0.x, -0.3, G0.z); flood.visible = false; flood.renderOrder = 3; w.scene.add(flood);
  const refs: SeaCaveRefs = {
    origin: V(x0, 0, z0), spawn, grotto: G0, pool, platforms, flood, floodLevel: 0,
    setFlood(k: number) { refs.floodLevel = k; flood.visible = k > 0.01; flood.position.y = -0.3 + 0.45 * k; },
    inStore(p) { return p.z < z0 - 18 && p.z > z0 - 34 && Math.abs(p.x - x0) < 12; },
    inGrotto(p) { return p.z < z0 - 40 && Math.hypot(p.x - G0.x, p.z - G0.z) < R + 2; },
    onPlatform(p) { return platforms.some(q => Math.hypot(p.x - q.x, p.z - q.z) < q.r); },
    animate(dt: number, t: number) { void dt; if (flood.visible) flood.position.y = -0.3 + 0.45 * refs.floodLevel + Math.sin(t * 1.3) * 0.015; },
  };
  return refs;
}

// ---------------- the Wreck-Mother ----------------
export const MOTHER: EnemyDef = { hp: 1300, speed: 2.6, sight: 40, reach: 4.2, windup: 0.7, dmg: 22, recover: 1.0, radius: 1.8, height: 2.0 };
export const MOTHER_ATK = { sweepDmg: 22, sweepArc: 120, sweepReach: 4.4, slamDmg: 34, slamR: 2.6, slamAhead: 2.6, rearT: 1.1, sprayDmg: 10, sprayRange: 8.5, sprayHalf: 25, chargeDmg: 26, chargeSpeed: 7.5 };
type Atk = 'none' | 'sweep' | 'rear' | 'slam' | 'spray' | 'charge' | 'call';
export interface MotherHooks {
  hurtPlayer(amount: number): void; slowPlayer(seconds: number): void; feed(text: string): void; defeated(): void;
  sound(n: 'hiss' | 'orb' | 'swing' | 'hit' | 'growl', pan: number): void;
  spawnCrab(at: THREE.Vector3): void; shake(k: number): void; flood(on: boolean): void;
}
export class WreckMother {
  e: Enemy; model: Crab; active = false; dead = false; phase = 1; rising = 0;
  atk: Atk = 'none'; t = 0; cd = 2.4; deadT = 0; called = [false, false]; note = '';
  private hitDone = false; private chargeTo: THREE.Vector3 | null = null; private chargeT = 7;
  private arc: THREE.Mesh; private arcMat: THREE.MeshBasicMaterial; private ring: THREE.Mesh; private ringMat: THREE.MeshBasicMaterial; private cone: THREE.Mesh; private coneMat: THREE.MeshBasicMaterial;
  constructor(private scene: THREE.Scene, private enemies: EnemyManager, private colliders: Box[], private home: THREE.Vector3, private refs: SeaCaveRefs, private hooks: MotherHooks) {
    this.e = new Enemy('crab', home, 'mother');
    this.e.external = true; this.e.defOverride = MOTHER; this.e.hp = MOTHER.hp;
    this.model = new Crab(0x7a3a2e, 3.4, 0xe0c8a0);
    this.e.model = this.model; this.e.root = this.model.root;
    this.e.pos.copy(home); this.model.root.position.copy(home); this.e.yaw = 0;
    this.e.onDamage = (amt, status, kind) => this.onDamage(amt, status, kind);
    const decal = (geo: THREE.BufferGeometry) => { const m = new THREE.MeshBasicMaterial({ color: 0x9fe0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }); const mesh = new THREE.Mesh(geo, m); mesh.rotation.x = -Math.PI / 2; mesh.position.y = 0.16; mesh.renderOrder = 6; this.scene.add(mesh); return [mesh, m] as const; };
    [this.arc, this.arcMat] = decal(new THREE.RingGeometry(1.2, MOTHER_ATK.sweepReach, 24, 1, -MOTHER_ATK.sweepArc / 2 * Math.PI / 180, MOTHER_ATK.sweepArc * Math.PI / 180));
    [this.ring, this.ringMat] = decal(new THREE.CircleGeometry(MOTHER_ATK.slamR, 20));
    [this.cone, this.coneMat] = decal(new THREE.RingGeometry(1.0, MOTHER_ATK.sprayRange, 16, 1, -MOTHER_ATK.sprayHalf * Math.PI / 180, MOTHER_ATK.sprayHalf * 2 * Math.PI / 180));
    this.model.root.visible = false;
  }
  get hpFrac() { return Math.max(0, this.e.hp / MOTHER.hp); }
  /** Her belly is open while she rears up to slam. */
  get rearing() { return this.atk === 'rear' && this.t > 0.3; }
  wake() {
    if (this.active || this.dead) return;
    this.active = true; this.rising = 2.4; this.model.root.visible = true; this.scene.add(this.model.root); this.enemies.list.push(this.e);
    this.hooks.feed('The pool heaves. Something the size of a cart climbs out of it, shell first, barnacled like a hull: the Wreck-Mother. Her front is all armour; hit her from the side, or when she rears.');
    this.hooks.sound('growl', 0); this.hooks.shake(0.5);
  }
  reset() {
    if (this.dead) return;
    this.active = false; this.phase = 1; this.e.hp = MOTHER.hp; this.e.state = 'idle'; this.atk = 'none'; this.cd = 2.4; this.called = [false, false]; this.chargeT = 7;
    this.e.pos.copy(this.home); this.e.yaw = 0; this.model.root.visible = false; this.scene.remove(this.model.root);
    this.enemies.list = this.enemies.list.filter(x => x !== this.e);
    this.enemies.list.filter(x => x.tag === 'mother_call').forEach(x => this.enemies.remove(x));
    this.hooks.flood(false); this.clear();
  }
  private onDamage(amt: number, _status?: 'burn' | 'slow', kind?: DamageKind) {
    if (this.rising > 0 || this.dead) return;
    void kind;
    const player = this.lastPlayer, e = this.e;
    const toP = Math.atan2(-(player.x - e.pos.x), -(player.z - e.pos.z));
    let ang = toP - e.yaw; while (ang > Math.PI) ang -= 2 * Math.PI; while (ang < -Math.PI) ang += 2 * Math.PI;
    const mult = motherArmour(ang, this.rearing);
    e.hp -= amt * mult;
    this.note = mult > 1.5 ? 'Her belly is open!' : mult < 0.5 ? 'The shell turns it: hit her from the side' : '';
    if (!this.called[0] && this.hpFrac < MOTHER_CALLS[0]) { this.called[0] = true; this.atk = 'call'; this.t = 0; this.clear(); }
    if (this.phase === 1 && this.hpFrac < MOTHER_PHASE2) {
      this.phase = 2; this.cd = 1.2; this.chargeT = 3;
      this.hooks.flood(true); this.hooks.shake(0.6); this.hooks.sound('hiss', 0);
      this.hooks.feed('The Wreck-Mother slams both claws on the rock and the sea answers: water pours in through every crack and the grotto floods. Get onto the rock platforms.');
    }
    if (!this.called[1] && this.hpFrac < MOTHER_CALLS[1]) { this.called[1] = true; this.atk = 'call'; this.t = 0; this.clear(); }
    if (e.hp <= 0) e.hp = 0;
  }
  private lastPlayer = new THREE.Vector3();
  private clear() { this.arcMat.opacity = 0; this.ringMat.opacity = 0; this.coneMat.opacity = 0; }
  update(dt: number, now: number, player: THREE.Vector3, alive: boolean) {
    const e = this.e, m = this.model; this.lastPlayer.copy(player);
    if (this.dead) { this.deadT += dt; m.animate('die', this.deadT, dt, 0); if (this.deadT > 2.5) m.root.position.y = -Math.min(1.6, (this.deadT - 2.5) * 0.4); return; }
    if (!this.active) return;
    if (e.hp <= 0) {
      this.dead = true; e.state = 'dead'; this.clear(); this.deadT = 0;
      this.enemies.list.filter(x => x.tag === 'mother_call').forEach(x => { x.hp = 0; x.state = 'dead'; });
      this.hooks.flood(false); this.hooks.defeated(); return;
    }
    const toP = new THREE.Vector3(player.x - e.pos.x, 0, player.z - e.pos.z), dist = toP.length();
    const fwd = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
    const face = (rate: number, to = toP) => { const want = Math.atan2(-to.x, -to.z); let d = want - e.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; e.yaw += Math.max(-rate * dt, Math.min(rate * dt, d)); };
    let spd = 0, dir = Math.PI / 2;
    const walk = (to: THREE.Vector3, sp: number) => { const l = to.length(); if (l < 0.01) return; const st = Math.min(l, sp * dt); const [x, z] = collide(this.colliders, e.pos.x + to.x / l * st, e.pos.z + to.z / l * st, MOTHER.radius); e.pos.set(x, 0, z); spd = sp; let md = Math.atan2(-to.x, -to.z) - e.yaw; while (md > Math.PI) md -= 2 * Math.PI; while (md < -Math.PI) md += 2 * Math.PI; dir = md; };
    const pose = (st: Parameters<Crab['animate']>[0], t: number) => { m.animate(st, t, dt, spd, dir); m.root.position.set(e.pos.x, this.rising > 0 ? -2.6 * (this.rising / 2.4) : 0, e.pos.z); m.root.rotation.y = e.yaw; e.flash = Math.max(0, e.flash - dt); m.tint(e.flash > 0 ? 0xffffff : 0, e.flash > 0 ? 0.6 : 0); };
    if (this.rising > 0) { this.rising -= dt; pose('call', 2.4 - this.rising); return; }
    const fast = this.phase === 2 ? 1.25 : 1;
    if (this.atk === 'none') {
      this.cd -= dt; if (this.phase === 2) this.chargeT -= dt;
      if (this.phase === 2 && this.chargeT <= 0 && alive) {
        // charge across the grotto toward the platform nearest you
        const tgt = this.refs.platforms.slice().sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z))[0];
        this.chargeTo = new THREE.Vector3(tgt.x, 0, tgt.z); this.atk = 'charge'; this.t = 0; this.hitDone = false; this.hooks.sound('growl', 0);
      } else if (this.cd <= 0 && alive && dist < 4.8) { this.atk = gameplayRng.next() < 0.5 ? 'sweep' : 'rear'; this.t = 0; this.hitDone = false; this.hooks.sound('growl', 0); }
      else if (this.cd <= 0 && alive && dist < 9.5) { this.atk = 'spray'; this.t = 0; this.hitDone = false; this.hooks.sound('hiss', 0); }
      else { face(1.3 * fast); if (dist > 3.8) walk(toP, MOTHER.speed * fast); pose(spd > 0 ? 'walk' : 'idle', now); return; }
    }
    if (this.atk === 'sweep') {
      this.t += dt; const tele = this.phase === 2 ? 0.6 : 0.72;
      if (this.t < tele) { face(1.6); this.arc.position.set(e.pos.x, 0.16, e.pos.z); this.arc.rotation.z = e.yaw + Math.PI / 2; this.arcMat.opacity = 0.15 + 0.4 * (this.t / tele); pose('windup', this.t); }
      else pose('sweep', this.t - tele);
      if (!this.hitDone && this.t >= tele + 0.12) {
        this.hitDone = true; this.hooks.sound('swing', 0); this.arcMat.opacity = 0.6;
        const cos = fwd.dot(toP.clone().normalize());
        if (alive && dist < MOTHER_ATK.sweepReach + 0.4 && cos > Math.cos(MOTHER_ATK.sweepArc / 2 * Math.PI / 180)) { this.hooks.hurtPlayer(MOTHER_ATK.sweepDmg); this.hooks.shake(0.4); }
      }
      if (this.t > tele + 0.2) this.arcMat.opacity = Math.max(0, this.arcMat.opacity - dt * 3);
      if (this.t > tele + 0.8) { this.atk = 'none'; this.cd = this.phase === 2 ? 1.2 : 1.7; this.clear(); }
      return;
    }
    if (this.atk === 'rear') {
      // up on her back legs, claws high: the belly is open until she comes down
      this.t += dt; if (this.t < 0.5) face(1.2);
      const at = e.pos.clone().addScaledVector(fwd, MOTHER_ATK.slamAhead);
      this.ring.position.set(at.x, 0.16, at.z); this.ringMat.opacity = 0.12 + 0.45 * Math.min(1, this.t / MOTHER_ATK.rearT);
      pose('rear', this.t);
      if (this.t >= MOTHER_ATK.rearT) { this.atk = 'slam'; this.t = 0; this.hitDone = false; }
      return;
    }
    if (this.atk === 'slam') {
      this.t += dt; pose('slam', this.t);
      if (!this.hitDone && this.t > 0.12) {
        this.hitDone = true; this.hooks.sound('hit', 0); this.hooks.shake(0.8); this.ringMat.opacity = 0.75;
        const at = e.pos.clone().addScaledVector(fwd, MOTHER_ATK.slamAhead);
        if (alive && Math.hypot(player.x - at.x, player.z - at.z) < MOTHER_ATK.slamR + 0.3) this.hooks.hurtPlayer(MOTHER_ATK.slamDmg);
      }
      if (this.t > 0.25) this.ringMat.opacity = Math.max(0, this.ringMat.opacity - dt * 2.5);
      if (this.t > 1.0) { this.atk = 'none'; this.cd = this.phase === 2 ? 1.4 : 2.0; this.clear(); }
      return;
    }
    if (this.atk === 'spray') {
      this.t += dt; const tele = 0.8;
      if (this.t < tele) { face(1.8); this.cone.position.set(e.pos.x, 0.16, e.pos.z); this.cone.rotation.z = e.yaw + Math.PI / 2; this.coneMat.opacity = 0.12 + 0.35 * (this.t / tele); pose('windup', this.t * 0.5); }
      else {
        pose('spray', this.t - tele);
        const cos = fwd.dot(toP.clone().normalize());
        if (!this.hitDone && alive && dist < MOTHER_ATK.sprayRange && cos > Math.cos(MOTHER_ATK.sprayHalf * Math.PI / 180)) { this.hitDone = true; this.hooks.hurtPlayer(MOTHER_ATK.sprayDmg); this.hooks.slowPlayer(2); this.hooks.sound('hiss', 0); }
        this.coneMat.opacity = Math.max(0, 0.5 - (this.t - tele) * 0.8);
      }
      if (this.t > tele + 0.7) { this.atk = 'none'; this.cd = 1.6; this.clear(); }
      return;
    }
    if (this.atk === 'charge' && this.chargeTo) {
      this.t += dt; const to = this.chargeTo.clone().sub(e.pos); to.y = 0;
      if (this.t < 0.6) { face(3, to); pose('windup', this.t); return; }
      walk(to, MOTHER_ATK.chargeSpeed); pose('walk', this.t);
      if (!this.hitDone && alive && Math.hypot(player.x - e.pos.x, player.z - e.pos.z) < MOTHER.radius + 0.9) { this.hitDone = true; this.hooks.hurtPlayer(MOTHER_ATK.chargeDmg); this.hooks.shake(0.7); }
      if (to.length() < 1.2 || this.t > 4) { this.atk = 'none'; this.cd = 1.0; this.chargeT = 7 + gameplayRng.next() * 3; this.chargeTo = null; }
      return;
    }
    if (this.atk === 'call') {
      this.t += dt; pose('call', this.t);
      if (this.t > 0.6 && this.t - dt <= 0.6) {
        const G0 = this.refs.grotto; for (const a of [0.4, 2.2, 3.6]) this.hooks.spawnCrab(new THREE.Vector3(G0.x + Math.cos(a) * 14, 0, G0.z + Math.sin(a) * 14));
        this.hooks.feed('She drums her claws on the rock, and crabs come pouring out of the cracks in the walls.'); this.hooks.sound('hiss', 0);
      }
      if (this.t > 1.6) { this.atk = 'none'; this.cd = 1.0; }
      return;
    }
  }
}
