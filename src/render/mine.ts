// v0.7: Copper Hollow. The mine north of Ashford; like the mill and the chapel, its inside lives far off
// the map. Adit → the old workings (props, rails, copper seams) → the lift cage → the deep gallery,
// lit by veins of ward-copper (waystone) → the Wardwrights' Vault, where the Warden Engine waits.
//
// The Warden Engine: a stone-and-copper ward construct, built to guard the seam the old ward-stones were
// cut from. Its front is armoured (a quarter damage); the rune-core in its back is not (×1.6). It slams
// (an expanding ring: jump it or be far away), charges in a straight line (step aside: if it hits a pillar
// or a wall it is stunned and every side is open) and pushes back anyone who hugs it. Spark stuns it.
import * as THREE from 'three';
import { MAT, M, collide, type World, type Box } from './world';
import { Humanoid, clip, gaitPose } from './rig';
import { Enemy, type EnemyManager, type EnemyDef, type DamageKind } from './enemies';

import { gameplayRng } from '../sim/rng';
export interface MineRefs {
  origin: THREE.Vector3; spawn: THREE.Vector3; deep: THREE.Vector3; checkpoint: THREE.Vector3; arena: THREE.Vector3; outside: THREE.Vector3;
  upper: { minX: number; maxX: number; minZ: number; maxZ: number }; vault: { minX: number; maxX: number; minZ: number; maxZ: number };
  pillars: THREE.Vector3[]; veins: THREE.Mesh[];
}
export const MINE_ORIGIN = new THREE.Vector3(330, 0, -330);

export function buildMine(w: World): MineRefs {
  const O = MINE_ORIGIN, x0 = O.x, z0 = O.z, H = 4.0;
  const rockM = M(0x4a443c), floorM = M(0x3e382f), timber = MAT.timber, vein = M(0x5fe0c8, { emissive: 0x3fd0b0, emissiveIntensity: 1.2 }), copper = M(0x4f8a6a, { metalness: 0.4, roughness: 0.5 });
  const veins: THREE.Mesh[] = [];
  const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.1, 110), floorM); floor.position.set(x0, 0.05, z0 - 20); floor.receiveShadow = true; w.scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 110), M(0x1c1a16)); ceil.position.set(x0, H + 1.4, z0 - 20); w.scene.add(ceil);
  const prop = (x: number, z: number) => { w.block(x, z, 0.35, 0.35, H, timber); };
  const beam = (x1: number, x2: number, z: number) => w.block((x1 + x2) / 2, z, Math.abs(x2 - x1), 0.35, 0.35, timber, H - 0.35, false);
  // ---------- adit: entrance tunnel ----------
  w.shell(x0 - 2.6, x0 + 2.6, z0 + 14, z0 + 30, H, [['n', x0, 3.0]], rockM, false);
  for (let z = z0 + 16; z < z0 + 30; z += 4) { prop(x0 - 2.2, z); prop(x0 + 2.2, z); beam(x0 - 2.2, x0 + 2.2, z); }
  w.interact('mine_exit', x0, z0 + 27.5, 'Walk back out into daylight', 'interact', 1.6);
  w.lights.add(x0, 3, z0 + 25, 0xffd8a0, 4, 12, 1.5, { zone: 'mine' });
  // ---------- the old workings ----------
  const ux0 = x0 - 12, ux1 = x0 + 12, uz0 = z0 - 6, uz1 = z0 + 14;
  w.shell(ux0, ux1, uz0, uz1, H, [['s', x0, 3.0]], rockM, false);
  for (const [px, pz] of [[-6, 8], [6, 8], [-6, 1], [6, 1], [0, 4.5]] as [number, number][]) { prop(x0 + px, z0 + pz); }
  for (let i = 0; i < 9; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.25), timber); sl.position.set(x0 - 3, 0.12, z0 + 12 - i * 1.6); w.scene.add(sl); }
  { const cart = w.block(x0 - 3, z0 + 3, 1.0, 1.5, 1.0, MAT.iron); void cart; const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), copper); ore.position.set(x0 - 3, 1.15, z0 + 3); w.scene.add(ore); }
  let oi = 0;
  for (const [px, pz, wall] of [[-11.6, 10, 'w'], [11.6, 5, 'e'], [-11.6, -2, 'w'], [8, -5.6, 'n']] as [number, number, string][]) {
    const sx = x0 + px, sz = z0 + pz;
    const seam = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), copper); seam.position.set(sx, 1.2, sz); w.scene.add(seam);
    const off = wall === 'w' ? [1.2, 0] : wall === 'e' ? [-1.2, 0] : [0, 1.2];
    w.interact(`mine_ore_${oi++}`, sx + off[0], sz + off[1], 'Work the copper seam', 'mine', 1.3);
  }
  w.block(x0 + 9, z0 + 11, 1.4, 0.8, 0.9, MAT.wood); w.interact('mine_note_1', x0 + 9, z0 + 10.2, 'Read the shift board', 'interact', 1.2);
  w.block(x0 - 9, z0 + 12.4, 0.9, 0.9, 0.9, MAT.woodLight); w.interact('mine_crate_1', x0 - 9, z0 + 11.4, 'Search the crate', 'pick', 1.2);
  // the lift cage down to the deep workings
  { const lx = x0 + 9.5, lz = z0 - 3; for (const [dx, dz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) w.block(lx + dx, lz + dz, 0.15, 0.15, H, MAT.iron, 0, false);
    const fl2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.15, 2.4), MAT.iron); fl2.position.set(lx, 0.12, lz); w.scene.add(fl2);
    w.interact('mine_lift', lx - 1.8, lz, 'The lift cage', 'interact', 1.3); }
  for (const [lx, lz] of [[x0 - 7, z0 + 6], [x0 + 7, z0 + 9], [x0 + 2, z0 - 3]] as [number, number][]) w.lights.add(lx, 2.8, lz, 0xffc070, 3.2, 10, 1.5, { zone: 'mine', flicker: 0.12 });
  // ---------- the deep gallery (reached by the lift) ----------
  const dz0 = z0 - 32, dz1 = z0 - 12;
  w.shell(x0 - 4, x0 + 4, dz0, dz1, H, [['n', x0, 3.4]], rockM, false);
  for (let z = dz0 + 2; z < dz1; z += 3.5) { prop(x0 - 3.6, z); prop(x0 + 3.6, z); }
  for (let i = 0; i < 8; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6 + (i % 3) * 0.4, 1.6), vein); v.position.set(i % 2 ? x0 + 3.83 : x0 - 3.83, 1.0 + (i % 3) * 0.6, dz1 - 2 - i * 2.2); v.rotation.x = (i % 2 ? 0.4 : -0.3); w.scene.add(v); veins.push(v); }
  w.interact('mine_lift_up', x0, dz1 - 1.2, 'Ride the lift back up', 'interact', 1.3);
  w.block(x0 + 2.8, dz0 + 9, 0.8, 0.8, 1.4, MAT.stone); w.interact('mine_waystone', x0 + 1.9, dz0 + 9, 'Light the old waystone', 'interact', 1.4);
  w.block(x0 - 3, dz0 + 6, 1.0, 0.6, 0.8, MAT.wood); w.interact('mine_note_2', x0 - 2.2, dz0 + 6, "Read Brask's last pages", 'interact', 1.2);
  w.block(x0 - 3, dz0 + 14, 0.9, 0.9, 0.9, MAT.woodLight); w.interact('mine_crate_2', x0 - 2.1, dz0 + 14, 'Search the crate', 'pick', 1.2);
  w.lights.add(x0, 2.6, dz0 + 10, 0x5fe0c8, 5, 14, 1.4, { zone: 'mine', flicker: 0.06 });
  // ---------- the Wardwrights' Vault ----------
  const vz0 = z0 - 60, vz1 = z0 - 32, vx0 = x0 - 13, vx1 = x0 + 13;
  w.shell(vx0, vx1, vz0, vz1, H + 1.4, [['s', x0, 3.4]], M(0x58554c), false);
  const pillars: THREE.Vector3[] = [];
  for (const [px, pz] of [[-6.5, -40], [6.5, -40], [-6.5, -52], [6.5, -52]] as [number, number][]) {
    const p = new THREE.Vector3(x0 + px, 0, z0 + pz); pillars.push(p);
    w.block(p.x, p.z, 1.6, 1.6, H + 1.4, MAT.stone);
    const rn = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.5), MAT.rune.clone()); rn.position.set(p.x + (px < 0 ? 0.82 : -0.82), 2.0, p.z); w.scene.add(rn); w.crystalRunes.push(rn);
  }
  // the seam itself, behind where the Engine stands
  for (let i = 0; i < 7; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.6 + (i % 3) * 0.3, 0.3, 0.1), vein); v.position.set(x0 - 4 + i * 1.3, 0.8 + (i % 4) * 0.8, vz0 + 0.2); w.scene.add(v); veins.push(v); }
  w.interact('vault_seam', x0, vz0 + 1.6, 'The ward-copper seam', 'interact', 1.6);
  w.block(x0 + 10, vz0 + 2, 0.9, 0.9, 0.9, MAT.woodLight); w.interact('mine_crate_3', x0 + 9.2, vz0 + 2.6, 'Search the wardwrights\' chest', 'pick', 1.2);
  w.block(x0 - 10, vz0 + 2, 1.2, 0.6, 1.0, MAT.stone); w.interact('mine_note_3', x0 - 10, vz0 + 2.9, 'Read the carved lintel', 'interact', 1.2);
  for (const [lx, lz] of [[x0 - 9, z0 - 44], [x0 + 9, z0 - 44], [x0, z0 - 56], [x0, z0 - 36]] as [number, number][]) w.lights.add(lx, 3.8, lz, 0x8ff0d8, 8, 20, 1.3, { zone: 'mine', flicker: 0.05 });
  Object.assign(w.places, { mine_lift: new THREE.Vector3(x0 + 7.7, 0, z0 - 3), mine_waystone: new THREE.Vector3(x0 + 1.9, 0, dz0 + 9), vault: new THREE.Vector3(x0, 0, z0 - 46) });
  return {
    origin: O.clone(), spawn: new THREE.Vector3(x0, 0, z0 + 24), deep: new THREE.Vector3(x0, 0, dz1 - 3), checkpoint: new THREE.Vector3(x0, 0, dz0 + 9), arena: new THREE.Vector3(x0, 0, z0 - 54), outside: new THREE.Vector3(262, 0, -114.5),
    upper: { minX: ux0, maxX: ux1, minZ: uz0, maxZ: z0 + 30 }, vault: { minX: vx0, maxX: vx1, minZ: vz0, maxZ: vz1 }, pillars, veins,
  };
}

// ---------------- the Warden Engine ----------------
export const ENGINE: EnemyDef = { hp: 1250, speed: 2.4, sight: 40, reach: 3.4, windup: 1.0, dmg: 26, recover: 1.4, radius: 1.1, height: 3.6 };
type Atk = 'none' | 'slam' | 'charge' | 'pulse' | 'summon';
export interface EngineHooks {
  hurtPlayer(amount: number): void; feed(text: string): void; defeated(): void;
  sound(n: 'hiss' | 'orb' | 'swing' | 'hit' | 'growl', pan: number): void;
  spawnHollow(at: THREE.Vector3): void; playerOnGround(): boolean; shake(k: number): void; push(dx: number, dz: number): void;
}
export class WardenEngine {
  e: Enemy; model: Humanoid; active = false; dead = false; phase = 1;
  atk: Atk = 'none'; t = 0; cd = 2.4; stunT = 0; deadT = 0; summonT = 14; hugT = 0;
  note = '';
  private core: THREE.Mesh; private coreMat: THREE.MeshStandardMaterial;
  private ring: THREE.Mesh; private ringMat: THREE.MeshBasicMaterial; private ringR = 0;
  private lane: THREE.Mesh; private laneMat: THREE.MeshBasicMaterial;
  private chargeDir = new THREE.Vector3(); private chargeHit = false;
  private lastPlayer = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private enemies: EnemyManager, private colliders: Box[], private home: THREE.Vector3, private hooks: EngineHooks) {
    this.e = new Enemy('hollow', home, 'engine');
    this.e.external = true; this.e.defOverride = ENGINE; this.e.hp = ENGINE.hp;
    this.scene.remove(this.e.root);
    this.model = new Humanoid({ skin: 0x6f7a6c, shirt: 0x5a6258, pants: 0x4a5048, coat: 0x56604f, boots: 0x2e322c, hat: 'helm', glowEyes: 0x7ff0d8, scale: 1.9, bulk: 1.7 });
    this.model.tint(0x000000, 0);
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x7ff0d8, emissive: 0x3fd0b0, emissiveIntensity: 1.6, flatShading: true });
    this.core = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), this.coreMat); this.core.position.set(0, 0.12, 0.14); this.model.j.chest.add(this.core);
    for (const sx of [-1, 1]) { const plate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.06), M(0x4f8a6a, { metalness: 0.5, roughness: 0.4 })); plate.position.set(sx * 0.1, 0.1, -0.13); this.model.j.chest.add(plate); }
    this.e.model = this.model; this.e.root = this.model.root;
    this.e.pos.copy(home); this.model.root.position.copy(home); this.e.yaw = 0;
    this.e.onDamage = (amt, status, kind) => this.onDamage(amt, status, kind);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0x7ff0d8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 48), this.ringMat); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.12; this.scene.add(this.ring);
    this.laneMat = new THREE.MeshBasicMaterial({ color: 0xff9a5a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1), this.laneMat); this.lane.rotation.x = -Math.PI / 2; this.lane.position.y = 0.11; this.scene.add(this.lane);
    this.model.root.visible = false;
  }
  wake() {
    if (this.active || this.dead) return;
    this.active = true; this.model.root.visible = true; this.scene.add(this.model.root); this.enemies.list.push(this.e);
    this.hooks.feed('Stone grinds on stone. Runes wake along its arms: the Warden Engine. Its front is armoured; the glowing core is in its back.'); this.hooks.sound('growl', 0); this.hooks.shake(0.5);
  }
  reset() {
    if (this.dead) return;
    this.active = false; this.phase = 1; this.e.hp = ENGINE.hp; this.e.state = 'idle'; this.atk = 'none'; this.cd = 2.4; this.stunT = 0; this.summonT = 14;
    this.e.pos.copy(this.home); this.e.yaw = 0; this.model.root.visible = false; this.scene.remove(this.model.root);
    this.enemies.list = this.enemies.list.filter(x => x !== this.e);
    this.enemies.list.filter(x => x.tag === 'engine_call').forEach(x => this.enemies.remove(x));
    this.clear();
  }
  get hpFrac() { return Math.max(0, this.e.hp / ENGINE.hp); }
  /** How exposed the core is to the player right now (1 = from behind). */
  private behind(): number {
    const fx = -Math.sin(this.e.yaw), fz = -Math.cos(this.e.yaw), dx = this.lastPlayer.x - this.e.pos.x, dz = this.lastPlayer.z - this.e.pos.z, l = Math.hypot(dx, dz) || 1;
    return -(fx * dx + fz * dz) / l; // +1 behind, -1 in front
  }
  private onDamage(amt: number, _status?: 'burn' | 'slow', kind?: DamageKind) {
    const b = this.behind();
    let mult = this.stunT > 0 ? 1.5 : b > 0.35 ? 1.6 : b > -0.2 ? 0.6 : 0.25;
    if (kind === 'spark') { mult = Math.max(mult, 1); if (this.stunT <= 0 && this.atk !== 'charge') { this.stunT = 1.2; this.atk = 'none'; this.clear(); this.note = 'Spark locks its joints'; } }
    this.e.hp -= amt * mult;
    this.note = this.stunT > 0 ? 'STUNNED: core open' : mult >= 1.6 ? 'Core hit!' : mult <= 0.25 ? 'Armour: get behind it' : '';
    if (this.phase === 1 && this.hpFrac < 0.5) { this.phase = 2; this.cd = 1.2; this.hooks.feed('The Engine\'s plates split and glow. It moves faster, and the hollowed answer its call.'); this.hooks.shake(0.6); }
    if (this.e.hp <= 0) { this.e.hp = 0; }
  }
  private clear() { this.ringMat.opacity = 0; this.laneMat.opacity = 0; this.ringR = 0; }
  update(dt: number, now: number, player: THREE.Vector3, alive: boolean) {
    const e = this.e, m = this.model;
    this.lastPlayer.copy(player);
    if (this.dead) { this.deadT += dt; m.apply(clip('die', this.deadT * 0.7), dt, 8, 'die'); this.coreMat.emissiveIntensity = Math.max(0, 1.6 - this.deadT); if (this.deadT > 5) m.root.position.y = -(this.deadT - 5) * 0.4; if (this.deadT > 9) m.root.visible = false; return; }
    if (!this.active) return;
    if (e.hp <= 0) { this.dead = true; e.state = 'dead'; this.clear(); this.enemies.list.filter(x => x.tag === 'engine_call').forEach(x => { x.hp = 0; x.state = 'dead'; }); this.hooks.defeated(); return; }
    const toP = new THREE.Vector3(player.x - e.pos.x, 0, player.z - e.pos.z), dist = toP.length();
    const face = (rate: number) => { const want = Math.atan2(-toP.x, -toP.z); let d = want - e.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; e.yaw += Math.max(-rate * dt, Math.min(rate * dt, d)); };
    const speedMul = this.phase === 2 ? 1.3 : 1;
    this.coreMat.emissiveIntensity = 1.2 + Math.sin(now * 4) * 0.4 + (this.stunT > 0 ? 1.5 : 0);
    if (this.stunT > 0) {
      this.stunT -= dt; m.apply(clip('stagger', 0.3 + (1.2 - Math.min(1.2, this.stunT)) * 0.2), dt, 10, 'stun'); m.tint(0x7ff0d8, 0.25 + Math.sin(now * 20) * 0.1);
      this.pose(); return;
    }
    m.tint(0x000000, 0);
    // summons in phase 2
    if (this.phase === 2) { this.summonT -= dt; if (this.summonT <= 0 && this.atk === 'none') { this.summonT = 22; for (const sx of [-8, 8]) this.hooks.spawnHollow(new THREE.Vector3(this.home.x + sx, 0, this.home.z + 6)); this.hooks.feed('Hollowed miners shamble out of the side galleries.'); } }
    // pushback if you hug it
    this.hugT = dist < 3.2 && alive ? this.hugT + dt : Math.max(0, this.hugT - dt);
    if (this.atk === 'none') {
      this.cd -= dt;
      if (this.hugT > 2.2) { this.atk = 'pulse'; this.t = 0; }
      else if (this.cd <= 0 && alive) { this.atk = dist > 9 ? 'charge' : gameplayRng.next() < 0.55 ? 'slam' : 'charge'; this.t = 0; if (this.atk === 'charge') this.hooks.sound('growl', 0); }
      else {
        // lumber toward you, turning slowly
        face(1.4 * speedMul);
        if (dist > 4) { const st = Math.min(dist - 4, ENGINE.speed * speedMul * dt); const nx = e.pos.x + toP.x / dist * st, nz = e.pos.z + toP.z / dist * st; const [x, z] = collide(this.colliders, nx, nz, ENGINE.radius); e.pos.set(x, 0, z); m.stride(dt, ENGINE.speed * speedMul); m.apply(gaitPose(m.phase, 1.6, false, { tired: 0.6 }), dt, 10, 'walk'); }
        else m.apply(clip('ready', now), dt, 10, 'ready');
      }
    }
    if (this.atk === 'slam') {
      this.t += dt; const tele = this.phase === 2 ? 0.8 : 1.0;
      if (this.t < tele) { face(2); m.apply(clip('slam', this.t * 0.5 / tele), dt, 12, 'slam'); this.ring.position.set(e.pos.x, 0.12, e.pos.z); this.ringMat.opacity = 0.25 + 0.35 * (this.t / tele); this.ring.scale.setScalar(2.5); this.ringMat.color.setHex(0xff9a5a); }
      else {
        if (this.ringR === 0) { this.hooks.sound('hit', 0); this.hooks.shake(0.6); this.ringR = 0.01; this.ringMat.color.setHex(0x7ff0d8); }
        const prev = this.ringR; this.ringR += dt * 12; this.ring.scale.setScalar(this.ringR); this.ringMat.opacity = Math.max(0, 0.9 - this.ringR / 11);
        m.apply(clip('slam', 0.5 + (this.t - tele)), dt, 30, 'slam');
        // the wave hits if it passes under you while your feet are on the ground
        if (alive && dist > prev - 0.6 && dist <= this.ringR + 0.6 && this.hooks.playerOnGround() && !this.chargeHit) { this.chargeHit = true; this.hooks.hurtPlayer(ENGINE.dmg * 0.8); }
        if (this.ringR > 11) { this.atk = 'none'; this.cd = (this.phase === 2 ? 1.4 : 2.2); this.clear(); this.chargeHit = false; }
      }
    }
    if (this.atk === 'charge') {
      this.t += dt; const tele = this.phase === 2 ? 0.75 : 0.95;
      if (this.t < tele) {
        face(3.5); m.apply(clip('windup', this.t), dt, 12, 'cwind');
        this.chargeDir.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
        this.lane.position.set(e.pos.x + this.chargeDir.x * 8, 0.11, e.pos.z + this.chargeDir.z * 8); this.lane.rotation.z = Math.atan2(this.chargeDir.x, this.chargeDir.z); this.lane.scale.set(1, 16, 1); this.laneMat.opacity = 0.15 + 0.3 * (this.t / tele);
        this.chargeHit = false;
      } else {
        this.laneMat.opacity = 0.1;
        const sp = 13 * speedMul * dt, nx = e.pos.x + this.chargeDir.x * sp, nz = e.pos.z + this.chargeDir.z * sp;
        const [x, z] = collide(this.colliders, nx, nz, ENGINE.radius);
        const blocked = Math.hypot(x - nx, z - nz) > 0.05;
        e.pos.set(x, 0, z); m.stride(dt, 9); m.apply(gaitPose(m.phase, 7, true), dt, 14, 'charge');
        if (!this.chargeHit && alive && dist < 2.2) { this.chargeHit = true; this.hooks.hurtPlayer(ENGINE.dmg); this.hooks.push(this.chargeDir.x * 4, this.chargeDir.z * 4); }
        if (blocked) { this.atk = 'none'; this.stunT = this.phase === 2 ? 2.6 : 3.2; this.clear(); this.hooks.sound('hit', 0); this.hooks.shake(0.8); this.hooks.feed('The Engine slams into stone and staggers. Its core is open!'); this.cd = 1.5; }
        else if (this.t > tele + 1.5) { this.atk = 'none'; this.cd = 1.8; this.clear(); }
      }
    }
    if (this.atk === 'pulse') {
      this.t += dt; m.apply(clip('castOrb', this.t), dt, 12, 'pulse'); this.ring.position.set(e.pos.x, 0.12, e.pos.z); this.ring.scale.setScalar(1 + this.t * 6); this.ringMat.opacity = Math.max(0, 0.6 - this.t * 0.6); this.ringMat.color.setHex(0xd8fff4);
      if (this.t > 0.5 && this.hugT > 0) { this.hugT = 0; if (dist < 4.5 && alive) { this.hooks.hurtPlayer(10); this.hooks.push(toP.x / (dist || 1) * 6, toP.z / (dist || 1) * 6); } this.hooks.sound('orb', 0); }
      if (this.t > 1.0) { this.atk = 'none'; this.cd = 1.2; this.clear(); }
    }
    this.pose();
  }
  private pose() { const m = this.model; m.root.position.set(this.e.pos.x, 0, this.e.pos.z); m.root.rotation.y = this.e.yaw; }
}
