// v0.8: the Barrow of King Orm (docs/gdd/westmarch.md §3.4–3.5). Built off the map like the other dungeons.
// Entrance passage → antechamber → the Hall of Kings (three unlit braziers open the inner slab) → the burial
// chamber, where King Orm wakes. His second phase puts the lights out: the fewer braziers burn, the less
// damage he takes, and every 26 s he snuffs the lit one nearest him.
import * as THREE from 'three';
import { World, MAT, M, collide, type Box } from './world';
import { Humanoid, clip, gaitPose, makeTool } from './rig';
import { Enemy, type EnemyDef, type EnemyManager, type DamageKind } from './enemies';
import type { LightAnchor } from './lights';
import { ormShroud, ORM_FIRE_MULT, ORM_SNUFF_EVERY } from '../sim/west';

export const BARROW_ORIGIN = new THREE.Vector3(-180, 0, -330);
export interface Brazier { id: string; pos: THREE.Vector3; fire: THREE.Mesh; light: LightAnchor; lit: boolean; hall: boolean }
export interface BarrowRefs {
  origin: THREE.Vector3; spawn: THREE.Vector3; outside: THREE.Vector3; hallMid: THREE.Vector3; chamber: THREE.Vector3; checkpoint: THREE.Vector3; bier: THREE.Vector3;
  braziers: Brazier[]; slab: { mesh: THREE.Mesh; box: Box; open: boolean; t: number };
  ante: THREE.Vector3[]; coffins: THREE.Vector3[];
  light(id: string, on: boolean): void;
  openSlab(instant?: boolean): void;
  closeSlab(): void;
  animate(dt: number, t: number): void;
  inChamber(p: THREE.Vector3): boolean;
}

export function buildBarrow(w: World): BarrowRefs {
  const O = BARROW_ORIGIN, x0 = O.x, z0 = O.z, H = 3.6;
  const stoneM = M(0x55524a), stoneD = M(0x3e3c36), floorM = M(0x34322c), earth = M(0x3a3226), bronze = M(0x8a6a30, { metalness: 0.6, roughness: 0.45 }), bone = M(0xd8d0b8), gold = M(0xc8a040, { metalness: 0.7, roughness: 0.3 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 0.1, 100), floorM); floor.position.set(x0, 0.05, z0 - 10); floor.receiveShadow = true; w.scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(40, 0.3, 100), M(0x1a1814)); ceil.position.set(x0, H + 0.9, z0 - 10); w.scene.add(ceil);
  const L = (x: number, z: number, c: number, i: number, d: number, o: Partial<LightAnchor> = {}) => w.lights.add(x, 2.4, z, c, i, d, 1.5, { zone: 'barrow', ...o });
  // ---------- entrance passage ----------
  w.shell(x0 - 1.8, x0 + 1.8, z0 + 18, z0 + 34, H - 0.6, [['n', x0, 2.2]], stoneD, false);
  for (let z = z0 + 20; z < z0 + 34; z += 3) { const lin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.4, 0.5), stoneM); lin.position.set(x0, H - 0.8, z); w.add(lin); }
  for (let i = 0; i < 8; i++) { const root = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.4, 4), earth); root.position.set(x0 + (i % 2 ? 1.6 : -1.6), 2.2, z0 + 20 + i * 1.7); root.rotation.z = (i % 2 ? 0.6 : -0.6); w.add(root); }
  w.interact('barrow_exit', x0, z0 + 32.4, 'Climb back out into the air', 'interact', 1.6);
  L(x0, z0 + 31, 0xb8c8d8, 2.4, 10, { flicker: 0.02 });
  // ---------- antechamber ----------
  w.shell(x0 - 7, x0 + 7, z0 + 6, z0 + 18, H, [['s', x0, 2.2], ['n', x0, 2.2]], stoneM, false);
  const ante: THREE.Vector3[] = [new THREE.Vector3(x0 - 5, 0, z0 + 14), new THREE.Vector3(x0 + 5, 0, z0 + 11)];
  for (const [px, pz] of [[-6.5, 14], [6.5, 11], [-6.5, 9], [6.5, 15]] as [number, number][]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.0, 2.2), M(0x161412)); n.position.set(x0 + px, 1.2, z0 + pz); w.add(n); }
  for (let i = 0; i < 9; i++) { const u = w.cyl(x0 - 5.8 + (i % 3) * 0.7, z0 + 7.2 + Math.floor(i / 3) * 0.9 + (i > 5 ? 8 : 0), 0.22 + (i % 2) * 0.06, 0.5 + (i % 3) * 0.12, M(0x7a5a3a), 0, 7); void u; }
  w.block(x0 - 5.5, z0 + 8.4, 1.1, 0.8, 0.7, stoneD); w.interact('barrow_crate_1', x0 - 4.6, z0 + 8.4, 'Search the grave goods', 'pick', 1.2);
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 4), bone); b.position.set(x0 + 4 + i * 0.3, 0.08, z0 + 8 + (i % 2) * 0.4); b.rotation.set(Math.PI / 2, i, 0); w.add(b); }
  L(x0 + 4, z0 + 12, 0x9fc8ff, 2.8, 11, { flicker: 0.08 });
  // a guttering rushlight someone left in a niche, long ago, that has never quite gone out
  { const rx = x0 - 6.6, rz = z0 + 16.6; const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.12, 6), bronze); cup.position.set(rx, 1.3, rz); w.add(cup); const fl = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 5), MAT.fire.clone()); fl.position.set(rx, 1.45, rz); w.scene.add(fl); w.fires.push(fl); L(rx + 0.3, rz, 0xffa860, 5.5, 10, { flicker: 0.2 }); }
  // ---------- passage to the hall ----------
  w.shell(x0 - 1.6, x0 + 1.6, z0, z0 + 6, H - 0.4, [['s', x0, 2.2], ['n', x0, 2.2]], stoneD, false);
  // ---------- the Hall of Kings ----------
  w.shell(x0 - 8, x0 + 8, z0 - 26, z0, H + 0.4, [['s', x0, 2.2], ['n', x0, 2.4]], stoneM, false);
  const coffins: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const cz of [-5, -12.5, -20]) {
    const cx = x0 + sx * 4.2, czz = z0 + cz; coffins.push(new THREE.Vector3(cx - sx * 1.6, 0, czz));
    w.block(cx, czz, 1.3, 2.5, 0.85, stoneD); const lid = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.18, 2.6), stoneM); lid.position.set(cx + (cz === -12.5 ? sx * 0.4 : 0), 0.94, czz); lid.rotation.y = cz === -12.5 ? sx * 0.2 : 0; w.add(lid);
    const eff = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 1.7), stoneM); eff.position.set(cx, 1.08, czz); w.add(eff);
  }
  for (const sx of [-1, 1]) for (let z = -3; z > -26; z -= 6) w.block(x0 + sx * 6.6, z0 + z, 0.9, 0.9, H + 0.4, stoneD);
  const braziers: Brazier[] = [];
  const fireM = MAT.fire;
  const brazier = (id: string, x: number, z: number, hall: boolean, lit: boolean) => {
    w.block(x, z, 0.7, 0.7, 0.8, stoneD); w.colliders.push({ minX: x - 0.5, maxX: x + 0.5, minZ: z - 0.5, maxZ: z + 0.5, h: 1.7 });   // tall enough to catch a Firebolt aimed at the bowl
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.32, 0.35, 10), bronze); bowl.position.set(x, 0.98, z); w.add(bowl);
    const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10), M(0x2a2018)); coals.position.set(x, 1.13, z); w.add(coals);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.9, 7), fireM.clone()); fire.position.set(x, 1.55, z); w.scene.add(fire); fire.visible = lit;
    const light = w.lights.add(x, 2.0, z, 0xffa050, 14, 16, 1.4, { zone: 'barrow', flicker: 0.12 }); light.on = lit;
    const b: Brazier = { id, pos: new THREE.Vector3(x, 0, z), fire, light, lit, hall }; braziers.push(b);
    w.interact(id, x + (x > x0 ? -1.0 : 1.0), z, 'Light the brazier', 'interact', 1.3, x > x0 ? -Math.PI / 2 : Math.PI / 2);
  };
  brazier('hall_brazier_1', x0 - 7.2, z0 - 8, true, false); brazier('hall_brazier_2', x0 + 7.2, z0 - 15, true, false); brazier('hall_brazier_3', x0 - 7.2, z0 - 22, true, false);
  // the inner slab: sinks into the floor when all three burn
  const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.4, 0.5), stoneD); slabMesh.position.set(x0, 1.7, z0 - 26); w.scene.add(slabMesh);
  for (let i = 0; i < 3; i++) { const rn = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.04), MAT.rune.clone()); rn.position.set(x0 - 0.7 + i * 0.7, 2.2, z0 - 25.7); slabMesh.attach(rn); }
  const slabBox: Box = { minX: x0 - 1.3, maxX: x0 + 1.3, minZ: z0 - 26.35, maxZ: z0 - 25.65, h: 3.4 }; w.colliders.push(slabBox);
  L(x0, z0 - 2, 0x8fb8e8, 2.2, 10, { flicker: 0.05 });
  // a cold glow of grave-fungus on the hall walls, so the coffins read before the braziers are lit
  for (const [gx, gz] of [[-6.2, -11], [6.2, -19]] as [number, number][]) { w.lights.add(x0 + gx, 0.6, z0 + gz, 0x7fd8c0, 2.0, 8, 1.6, { zone: 'barrow', flicker: 0.03 }); for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.06 + (i % 3) * 0.03, 5, 4), M(0x7fd8c0, { emissive: 0x5fc8a8, emissiveIntensity: 1.4 })); f.position.set(x0 + gx * 1.27 + (gx < 0 ? 0.05 : -0.05), 0.2 + (i % 3) * 0.35, z0 + gz - 1 + i * 0.4); w.add(f); } }
  // ---------- passage and the burial chamber ----------
  w.shell(x0 - 1.6, x0 + 1.6, z0 - 32, z0 - 26, H - 0.4, [['s', x0, 2.4], ['n', x0, 2.4]], stoneD, false);
  w.shell(x0 - 12, x0 + 12, z0 - 58, z0 - 32, H + 1.6, [['s', x0, 2.4]], stoneM, false);
  // a ring of standing slabs inside the square room makes it read as round
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; if (Math.abs(Math.sin(a)) > 0.92 && Math.cos(a) > 0) continue; const x = x0 + Math.sin(a) * 11, z = z0 - 45 + Math.cos(a) * 11.5; if (z > z0 - 34 && Math.abs(x - x0) < 3) continue; w.block(x, z, 1.0, 0.6, H + 1.0, i % 2 ? stoneD : stoneM); }
  // the bier, the throne and the grave goods
  w.block(x0, z0 - 50, 3, 5, 0.9, stoneD); const pall = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 4.4), M(0x4a2a3a)); pall.position.set(x0, 0.95, z0 - 50); w.add(pall);
  w.block(x0, z0 - 55.6, 2.4, 1.2, 3.2, stoneM);
  const shields = [-1, 1].map(sx => { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.08, 12), bronze); s.rotation.x = Math.PI / 2; s.position.set(x0 + sx * 2.2, 2.2, z0 - 57.8); w.add(s); return s; }); void shields;
  for (let i = 0; i < 10; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.03, 8), gold); c.position.set(x0 + 6.5 + (i % 4) * 0.25, 0.08 + Math.floor(i / 4) * 0.03, z0 - 54 + (i % 3) * 0.2); w.add(c); }
  w.block(x0 + 8.4, z0 - 54, 1.2, 0.8, 0.7, stoneD); w.interact('barrow_crate_2', x0 + 7.5, z0 - 54, 'Search King Orm\'s hoard', 'pick', 1.2);
  w.interact('orm_bier', x0, z0 - 47.2, 'The Crown of Orm, on the bier', 'interact', 1.5, 0);
  brazier('orm_brazier_1', x0 - 7.5, z0 - 38, false, true); brazier('orm_brazier_2', x0 + 7.5, z0 - 38, false, true);
  brazier('orm_brazier_3', x0 - 7.5, z0 - 52, false, true); brazier('orm_brazier_4', x0 + 7.5, z0 - 52, false, true);
  Object.assign(w.places, { hall: new THREE.Vector3(x0, 0, z0 - 13), bier: new THREE.Vector3(x0, 0, z0 - 47) });
  const refs: BarrowRefs = {
    origin: O.clone(), spawn: new THREE.Vector3(x0, 0, z0 + 30), outside: new THREE.Vector3(-200, 0, -88.6), hallMid: new THREE.Vector3(x0, 0, z0 - 12), chamber: new THREE.Vector3(x0, 0, z0 - 45), checkpoint: new THREE.Vector3(x0, 0, z0 - 2), bier: new THREE.Vector3(x0, 0, z0 - 50),
    braziers, slab: { mesh: slabMesh, box: slabBox, open: false, t: 0 }, ante, coffins,
    light(id: string, on: boolean) { const b = braziers.find(x => x.id === id); if (!b) return; b.lit = on; b.fire.visible = on; b.light.on = on; const it = w.interactables.find(i => i.id === id); if (it) it.label = on ? 'The brazier burns' : 'Light the brazier'; },
    closeSlab() { if (!refs.slab.open) return; refs.slab.open = false; refs.slab.t = 0; slabMesh.position.y = 1.7; if (!w.colliders.includes(slabBox)) w.colliders.push(slabBox); },
    openSlab(instant = false) { if (refs.slab.open) return; refs.slab.open = true; refs.slab.t = instant ? 1 : 0; const i = w.colliders.indexOf(slabBox); if (i >= 0) w.colliders.splice(i, 1); if (instant) slabMesh.position.y = -1.8; },
    animate(dt: number, t: number) {
      if (refs.slab.open && refs.slab.t < 1) { refs.slab.t = Math.min(1, refs.slab.t + dt / 2.2); slabMesh.position.y = 1.7 - 3.5 * (1 - Math.pow(1 - refs.slab.t, 2)) + Math.sin(t * 40) * 0.01 * (1 - refs.slab.t); }
      for (const b of braziers) if (b.lit) b.fire.scale.set(1 + Math.sin(t * 11 + b.pos.x) * 0.1, 1 + Math.sin(t * 15 + b.pos.z) * 0.18, 1);
    },
    inChamber(p: THREE.Vector3) { return p.z < z0 - 33 && p.z > z0 - 58 && Math.abs(p.x - x0) < 12; },
  };
  return refs;
}

// ---------------- King Orm, the Barrow-King ----------------
export const ORM: EnemyDef = { hp: 1100, speed: 2.2, sight: 40, reach: 3.6, windup: 0.8, dmg: 24, recover: 1.2, radius: 0.9, height: 2.8 };
export const ORM_ATK = { sweepDmg: 24, sweepArc: 100, sweepReach: 3.8, cleaveDmg: 32, cleaveWidth: 1.6, cleaveReach: 5.0 };
type Atk = 'none' | 'sweep' | 'cleave' | 'snuff' | 'call';
export interface OrmHooks {
  hurtPlayer(amount: number): void; feed(text: string): void; defeated(): void;
  sound(n: 'hiss' | 'orb' | 'swing' | 'hit' | 'growl', pan: number): void;
  spawnWight(at: THREE.Vector3): void; shake(k: number): void; darkness(on: boolean): void;
}
export class BarrowKing {
  e: Enemy; model: Humanoid; active = false; dead = false; phase = 1; rising = 0;
  atk: Atk = 'none'; t = 0; cd = 2.6; deadT = 0; snuffT = ORM_SNUFF_EVERY; called = { a: false, b: false };
  note = ''; private target: Brazier | null = null; private hitDone = false;
  private crownMat: THREE.MeshStandardMaterial | null = null;
  private arc: THREE.Mesh; private arcMat: THREE.MeshBasicMaterial; private lane: THREE.Mesh; private laneMat: THREE.MeshBasicMaterial;
  constructor(private scene: THREE.Scene, private enemies: EnemyManager, private colliders: Box[], private home: THREE.Vector3, private refs: BarrowRefs, private hooks: OrmHooks) {
    this.e = new Enemy('wight', home, 'orm');
    this.e.external = true; this.e.defOverride = ORM; this.e.hp = ORM.hp;
    this.scene.remove(this.e.root);
    this.model = new Humanoid({ skin: 0x8a9086, shirt: 0x4a4436, pants: 0x3a3428, coat: 0x6a5a34, boots: 0x2a241c, hat: 'crown', glowEyes: 0xcff0ff, scale: 1.45, bulk: 1.35, beard: 0x9a9a90, cape: 0x3a2a3a });
    const gs = makeTool('greatsword'); gs.rotation.x = Math.PI / 2; this.model.handRSlot.add(gs);
    this.model.root.traverse(o => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.name === 'crownMat') this.crownMat = m; });
    this.e.model = this.model; this.e.root = this.model.root;
    this.e.pos.copy(home); this.model.root.position.copy(home); this.e.yaw = 0;
    this.e.onDamage = (amt, status, kind) => this.onDamage(amt, status, kind);
    this.arcMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.arc = new THREE.Mesh(new THREE.RingGeometry(0.6, ORM_ATK.sweepReach, 24, 1, -ORM_ATK.sweepArc / 2 * Math.PI / 180, ORM_ATK.sweepArc * Math.PI / 180), this.arcMat); this.arc.rotation.x = -Math.PI / 2; this.arc.position.y = 0.12; this.scene.add(this.arc);
    this.laneMat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(ORM_ATK.cleaveWidth, ORM_ATK.cleaveReach), this.laneMat); this.lane.rotation.x = -Math.PI / 2; this.lane.position.y = 0.11; this.scene.add(this.lane);
    this.model.root.visible = false;
  }
  get hpFrac() { return Math.max(0, this.e.hp / ORM.hp); }
  get lit() { return this.refs.braziers.filter(b => !b.hall && b.lit).length; }
  /** How much of a blow reaches him: full in phase 1; in the dark, by the braziers that burn. */
  get shroud() { return this.phase === 1 ? 1 : ormShroud(this.lit); }
  wake() {
    if (this.active || this.dead) return;
    this.active = true; this.rising = 2.6; this.model.root.visible = true; this.scene.add(this.model.root); this.enemies.list.push(this.e);
    this.hooks.feed('On the bier, the dead king sits up. Then he stands, and keeps standing, taller than any living man. King Orm.'); this.hooks.sound('growl', 0); this.hooks.shake(0.5);
  }
  reset() {
    if (this.dead) return;
    this.active = false; this.phase = 1; this.e.hp = ORM.hp; this.e.state = 'idle'; this.atk = 'none'; this.cd = 2.6; this.snuffT = ORM_SNUFF_EVERY; this.called = { a: false, b: false };
    this.e.pos.copy(this.home); this.e.yaw = 0; this.model.root.visible = false; this.scene.remove(this.model.root);
    this.enemies.list = this.enemies.list.filter(x => x !== this.e);
    this.enemies.list.filter(x => x.tag === 'orm_call').forEach(x => this.enemies.remove(x));
    for (const b of this.refs.braziers) if (!b.hall) this.refs.light(b.id, true);
    this.hooks.darkness(false); this.clear();
  }
  private onDamage(amt: number, _status?: 'burn' | 'slow', kind?: DamageKind) {
    if (this.rising > 0) return;
    const mult = this.shroud * (kind === 'fire' ? ORM_FIRE_MULT : 1);
    this.e.hp -= amt * mult;
    this.note = this.phase === 2 ? (mult < 0.6 ? 'Shrouded: light the braziers' : mult < 0.95 ? `Half-shrouded (${this.lit}/4 lit)` : 'He burns in the light!') : '';
    if (!this.called.a && this.hpFrac < 0.7) { this.called.a = true; this.call(); }
    if (this.phase === 1 && this.hpFrac < 0.5) {
      this.phase = 2; this.cd = 1.6; this.snuffT = 6;
      for (const b of this.refs.braziers) if (!b.hall) this.refs.light(b.id, false);
      this.hooks.darkness(true); this.hooks.shake(0.7); this.hooks.sound('hiss', 0);
      this.hooks.feed('King Orm raises a hand and every fire in the chamber dies. Only his crown and his eyes burn. In the dark he is hard to hurt: light the braziers again.');
    }
    if (!this.called.b && this.hpFrac < 0.4) { this.called.b = true; this.call(); }
    if (this.e.hp <= 0) this.e.hp = 0;
  }
  private call() { this.atk = 'call'; this.t = 0; }
  private clear() { this.arcMat.opacity = 0; this.laneMat.opacity = 0; }
  update(dt: number, now: number, player: THREE.Vector3, alive: boolean) {
    const e = this.e, m = this.model;
    if (this.crownMat) this.crownMat.emissiveIntensity = 0.6 + (this.phase === 2 ? 1.4 : 0) + Math.sin(now * 3) * 0.2;
    if (this.dead) { this.deadT += dt; m.apply(clip('kneelFall', this.deadT), dt, 8, 'fall'); if (this.deadT > 3.2) { const k = Math.min(1, (this.deadT - 3.2) / 2.5); m.root.position.y = -k * 0.5; m.tint(0x8a8a80, k * 0.8); } if (this.deadT > 6) m.root.visible = false; return; }
    if (!this.active) return;
    if (e.hp <= 0) {
      this.dead = true; e.state = 'dead'; this.clear();
      this.enemies.list.filter(x => x.tag === 'orm_call').forEach(x => { x.hp = 0; x.state = 'dead'; });
      for (const b of this.refs.braziers) if (!b.hall) this.refs.light(b.id, true);
      this.hooks.darkness(false); this.hooks.defeated(); return;
    }
    const toP = new THREE.Vector3(player.x - e.pos.x, 0, player.z - e.pos.z), dist = toP.length();
    const face = (rate: number, to = toP) => { const want = Math.atan2(-to.x, -to.z); let d = want - e.yaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; e.yaw += Math.max(-rate * dt, Math.min(rate * dt, d)); };
    const walk = (to: THREE.Vector3, sp: number) => { const l = to.length(); if (l < 0.01) return; const st = Math.min(l, sp * dt); const [x, z] = collide(this.colliders, e.pos.x + to.x / l * st, e.pos.z + to.z / l * st, ORM.radius); e.pos.set(x, 0, z); m.stride(dt, sp); m.apply(gaitPose(m.phase, sp, false, { tired: 0.5 }), dt, 12, 'walk'); };
    if (this.rising > 0) { this.rising -= dt; m.apply(clip('rise', Math.max(0, 2.2 - this.rising * 0.85)), dt, 10, 'rise'); this.pose(); return; }
    const speedMul = this.phase === 2 ? 1.2 : 1;
    if (this.phase === 2 && this.atk === 'none') { this.snuffT -= dt; if (this.snuffT <= 0) { const lit = this.refs.braziers.filter(b => !b.hall && b.lit); if (lit.length) { this.target = lit.sort((a, b) => a.pos.distanceTo(e.pos) - b.pos.distanceTo(e.pos))[0]; this.atk = 'snuff'; this.t = 0; } else this.snuffT = 4; } }
    if (this.atk === 'none') {
      this.cd -= dt;
      if (this.cd <= 0 && alive && dist < 6.5) { this.atk = dist > 3.4 || Math.random() < 0.4 ? 'cleave' : 'sweep'; this.t = 0; this.hitDone = false; this.hooks.sound('growl', 0); }
      else { face(1.8 * speedMul); if (dist > 2.8) walk(toP, ORM.speed * speedMul); else m.apply(clip('ready', now), dt, 10, 'ready'); }
    }
    if (this.atk === 'sweep') {
      this.t += dt; const tele = this.phase === 2 ? 0.62 : 0.75;
      if (this.t < tele) { face(2.2); this.arc.position.set(e.pos.x, 0.12, e.pos.z); this.arc.rotation.z = e.yaw + Math.PI / 2; this.arcMat.opacity = 0.18 + 0.4 * (this.t / tele); }
      m.apply(clip('sweepBig', this.t * 0.75 / tele), dt, 26, 'sweep');
      if (!this.hitDone && this.t >= tele + 0.12) {
        this.hitDone = true; this.hooks.sound('swing', 0); this.arcMat.opacity = 0.6;
        const fwd = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw)), cos = fwd.dot(toP.clone().normalize());
        if (alive && dist < ORM_ATK.sweepReach + 0.3 && cos > Math.cos(ORM_ATK.sweepArc / 2 * Math.PI / 180)) { this.hooks.hurtPlayer(ORM_ATK.sweepDmg); this.hooks.shake(0.4); }
      }
      if (this.t > tele + 0.2) this.arcMat.opacity = Math.max(0, this.arcMat.opacity - dt * 3);
      if (this.t > tele + 0.9) { this.atk = 'none'; this.cd = this.phase === 2 ? 1.3 : 1.9; this.clear(); }
    }
    if (this.atk === 'cleave') {
      this.t += dt; const tele = this.phase === 2 ? 0.8 : 1.0;
      const fwd = new THREE.Vector3(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
      if (this.t < tele) { face(2.6); this.lane.position.set(e.pos.x + fwd.x * ORM_ATK.cleaveReach / 2, 0.11, e.pos.z + fwd.z * ORM_ATK.cleaveReach / 2); this.lane.rotation.z = e.yaw; this.laneMat.opacity = 0.15 + 0.4 * (this.t / tele); }
      m.apply(clip('slam', this.t < tele ? this.t * 0.5 / tele : 0.5 + (this.t - tele)), dt, this.t < tele ? 12 : 30, 'cleave');
      if (!this.hitDone && this.t >= tele + 0.1) {
        this.hitDone = true; this.hooks.sound('hit', 0); this.hooks.shake(0.6); this.laneMat.opacity = 0.7;
        const along = toP.dot(fwd), side = Math.abs(toP.x * fwd.z - toP.z * fwd.x);
        if (alive && along > -0.5 && along < ORM_ATK.cleaveReach + 0.3 && side < ORM_ATK.cleaveWidth / 2 + 0.35) this.hooks.hurtPlayer(ORM_ATK.cleaveDmg);
      }
      if (this.t > tele + 0.2) this.laneMat.opacity = Math.max(0, this.laneMat.opacity - dt * 2.5);
      if (this.t > tele + 1.1) { this.atk = 'none'; this.cd = this.phase === 2 ? 1.5 : 2.1; this.clear(); }
    }
    if (this.atk === 'snuff' && this.target) {
      const to = new THREE.Vector3(this.target.pos.x - e.pos.x, 0, this.target.pos.z - e.pos.z);
      if (to.length() > 2.0 && this.t === 0) { face(3, to); walk(to, ORM.speed * 1.5); }
      else {
        this.t += dt; face(3, to); m.apply(clip('snuff', this.t), dt, 10, 'snuff');
        if (this.t > 1.2 && this.target.lit) { this.refs.light(this.target.id, false); this.hooks.sound('hiss', 0); this.hooks.feed('King Orm breathes on a brazier and it goes out.'); }
        if (this.t > 2.0) { this.atk = 'none'; this.cd = 0.8; this.snuffT = ORM_SNUFF_EVERY; this.target = null; }
      }
    }
    if (this.atk === 'call') {
      this.t += dt; m.apply(clip('cheer', this.t), dt, 10, 'call');
      if (this.t > 0.6 && this.t - dt <= 0.6) { const c = this.refs.chamber; for (const sx of [-6, 6]) this.hooks.spawnWight(new THREE.Vector3(c.x + sx, 0, c.z + 4)); this.hooks.feed('"RISE," says the king, and the floor of the chamber answers.'); this.hooks.shake(0.4); }
      if (this.t > 1.4) { this.atk = 'none'; this.cd = 1.2; }
    }
    this.pose();
  }
  private pose() { const m = this.model; m.root.position.set(this.e.pos.x, 0, this.e.pos.z); m.root.rotation.y = this.e.yaw; }
}
