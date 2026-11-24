// Procedural rigged characters with hand-authored animation clips.
// Facing is -Z. Positive X-rotation swings a hanging limb forward (and tips a face up). Character's right is +X.
//
// v0.7 animation model
// - Clips are pure functions of time (or gait phase) that return a target pose.
// - Humanoid.apply() follows the target exactly while it changes smoothly, so walk cycles keep their full
//   amplitude and timing (the old version low-pass filtered every joint, which made everything floaty).
//   When the clip changes (a new `key`) or a joint jumps, the difference is kept as an offset that decays
//   with a critically damped spring: "inertial blending". Transitions are smooth, steady motion is crisp.
// - Additive layers on top: head look-at, hit flinch, landing dip with leg compensation, and body lean
//   from acceleration and turning (springs).
// - Gait phase is advanced by distance travelled (stride()), so feet do not slide.
import * as THREE from 'three';
import { bakeSkinned } from './bake';

export type Joint =
  | 'hips' | 'spine' | 'chest' | 'neck' | 'head'
  | 'shoulderL' | 'elbowL' | 'handL' | 'shoulderR' | 'elbowR' | 'handR'
  | 'thighL' | 'kneeL' | 'footL' | 'thighR' | 'kneeR' | 'footR';
export const UPPER: Joint[] = ['spine', 'chest', 'neck', 'head', 'shoulderL', 'elbowL', 'handL', 'shoulderR', 'elbowR', 'handR'];
export const LOWER: Joint[] = ['hips', 'thighL', 'kneeL', 'footL', 'thighR', 'kneeR', 'footR'];
const ALL: Joint[] = [...LOWER, ...UPPER];
export type Rot = [number, number, number];
export interface Pose { r: Partial<Record<Joint, Rot>>; hy?: number; hz?: number; hx?: number }

export interface Look {
  skin: number; shirt: number; pants: number; coat?: number; hair?: number; boots: number;
  hat?: 'hood' | 'wide' | 'cap' | 'kerchief' | 'helm' | 'crown' | null; robe?: boolean; scale?: number; glowEyes?: number; bulk?: number;
  beard?: number; apron?: number; cape?: number;
}

const mat = (c: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, flatShading: true, ...opts });

function limb(len: number, r1: number, r2: number, m: THREE.Material, seg = 6): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r2, r1, len, seg);
  g.translate(0, -len / 2, 0);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh;
}
function box(w: number, h: number, d: number, m: THREE.Material, y = 0): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d); g.translate(0, y, 0);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh;
}

// ---------------- small maths ----------------
const S = Math.sin, C = Math.cos, PI = Math.PI, TAU = Math.PI * 2;
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const clamp01 = (v: number) => clamp(v, 0, 1);
export const ease = {
  outCubic: (x: number) => 1 - Math.pow(1 - clamp01(x), 3),
  inCubic: (x: number) => Math.pow(clamp01(x), 3),
  inOut: (x: number) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
  sine: (x: number) => -(C(PI * clamp01(x)) - 1) / 2,
  outBack: (x: number) => { x = clamp01(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  bell: (x: number) => S(PI * clamp01(x)),
  /** 0→1 over [a,b], held after. */
  ramp: (t: number, a: number, b: number) => clamp01((t - a) / (b - a)),
};
const wrapA = (a: number) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
/** Critically damped decay of an offset toward 0 (exact for any dt). Returns [x, v]. */
function decay(x: number, v: number, w: number, dt: number): [number, number] {
  const e = Math.exp(-w * dt), j = (v + w * x) * dt;
  return [(x + j) * e, (v - w * j) * e];
}
/** Spring toward a target with damping ratio z (substepped semi-implicit Euler). */
function springTo(x: number, v: number, target: number, w: number, z: number, dt: number): [number, number] {
  const n = Math.max(1, Math.ceil(dt * w / 0.35)), h = dt / n;
  for (let i = 0; i < n; i++) { v += (-(w * w) * (x - target) - 2 * z * w * v) * h; x += v * h; }
  return [x, v];
}

interface JState { cur: THREE.Vector3; off: THREE.Vector3; offV: THREE.Vector3; prev: THREE.Vector3; seen: boolean }

export class Humanoid {
  root = new THREE.Group();      // world position + yaw
  body = new THREE.Group();      // scaled body; carries lean
  j = {} as Record<Joint, THREE.Group>;
  handRSlot = new THREE.Group();
  handLSlot = new THREE.Group();
  private st = {} as Record<Joint, JState>;
  private hip: JState = { cur: new THREE.Vector3(), off: new THREE.Vector3(), offV: new THREE.Vector3(), prev: new THREE.Vector3(), seen: false };
  private lastKey: string | undefined = undefined;
  baseHipY = 0.95;
  meshes: THREE.Mesh[] = [];
  /** Gait phase in radians, advanced by stride(). */
  phase = Math.random() * TAU;
  /** World-space point to turn the head toward (or null). */
  lookAt: THREE.Vector3 | null = null;
  lookWeight = 1;
  private lk = { yaw: 0, pitch: 0, w: 0 };
  private fl = { x: 0, z: 0, vx: 0, vz: 0 };          // flinch (pitch back, roll)
  private ln = { x: 0, z: 0, vx: 0, vz: 0, tx: 0, tz: 0 }; // body lean
  private dip = { y: 0, v: 0 };                         // landing dip (metres)
  private cape: THREE.Group | null = null; private capeA = 0; private capeV = 0;
  private legLen: number;
  constructor(public look: Look) {
    const s = look.scale ?? 1, b = look.bulk ?? 1;
    this.body.scale.setScalar(s);
    this.root.add(this.body);
    this.legLen = 0.86;
    const skin = mat(look.skin), shirt = mat(look.shirt), pants = mat(look.pants), boots = mat(look.boots);
    const coat = look.coat !== undefined ? mat(look.coat) : shirt;
    const mk = (name: Joint, parent: THREE.Object3D, x: number, y: number, z = 0) => {
      const g = new THREE.Group(); g.position.set(x, y, z); g.name = name; parent.add(g); this.j[name] = g;
      this.st[name] = { cur: new THREE.Vector3(), off: new THREE.Vector3(), offV: new THREE.Vector3(), prev: new THREE.Vector3(), seen: false };
      return g;
    };
    const hips = mk('hips', this.body, 0, this.baseHipY);
    hips.add(box(0.34 * b, 0.18, 0.2 * b, look.robe ? coat : pants, 0.02));
    const belt = box(0.35 * b, 0.04, 0.21 * b, mat(0x2a1f16), 0.1); hips.add(belt);
    const spine = mk('spine', hips, 0, 0.08);
    spine.add(box(0.32 * b, 0.26, 0.19 * b, coat, 0.13));
    if (look.apron !== undefined) { const ap = box(0.3 * b, 0.5, 0.02, mat(look.apron), -0.05); ap.position.z = -0.105 * b; spine.add(ap); }
    const chest = mk('chest', spine, 0, 0.26);
    chest.add(box(0.4 * b, 0.24, 0.22 * b, coat, 0.1));
    if (look.cape !== undefined) {
      this.cape = new THREE.Group(); this.cape.position.set(0, 0.2, 0.12 * b); chest.add(this.cape);
      const cm = new THREE.Mesh(new THREE.PlaneGeometry(0.46 * b, 0.95), mat(look.cape, { side: THREE.DoubleSide })); cm.position.y = -0.47; cm.castShadow = true; this.cape.add(cm);
    }
    const neck = mk('neck', chest, 0, 0.24);
    neck.add(limb(0.08, 0.05, 0.05, skin).translateY(0.08));
    const head = mk('head', neck, 0, 0.08);
    const headMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.115, 1), skin); headMesh.position.y = 0.11; headMesh.scale.set(0.95, 1.1, 1); headMesh.castShadow = true;
    head.add(headMesh);
    // face: eyes and nose give a readable facing direction
    const eyeM = look.glowEyes !== undefined ? new THREE.MeshBasicMaterial({ color: look.glowEyes }) : mat(0x1a1410);
    for (const ex of [-0.04, 0.04]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), eyeM); e.position.set(ex, 0.13, -0.1); head.add(e); }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 4), skin); nose.rotation.x = -Math.PI / 2; nose.position.set(0, 0.1, -0.12); head.add(nose);
    if (look.beard !== undefined) { const bd = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.13, 6), mat(look.beard)); bd.rotation.x = Math.PI; bd.position.set(0, 0.02, -0.08); head.add(bd); }
    if (look.hair !== undefined && look.hat !== 'hood' && look.hat !== 'helm') { const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), mat(look.hair)); h.position.set(0, 0.15, 0.015); h.scale.set(1, 0.75, 1.02); head.add(h); }
    if (look.hat === 'hood') { const h = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.36, 7, 1, true), mat(look.coat ?? look.shirt, { side: THREE.DoubleSide })); h.position.set(0, 0.17, 0.03); h.rotation.x = 0.15; head.add(h); }
    if (look.hat === 'wide') { const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 10), mat(0x3a2a1c)); brim.position.y = 0.2; head.add(brim); const top = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.13, 10), mat(0x3a2a1c)); top.position.y = 0.27; head.add(top); }
    if (look.hat === 'cap') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5a4636)); c.position.y = 0.14; head.add(c); }
    if (look.hat === 'kerchief') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(look.coat ?? 0x9a3a2a)); c.position.y = 0.13; c.scale.set(1.02, 0.9, 1.05); head.add(c); }
    if (look.hat === 'helm') { const c = new THREE.Mesh(new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x6a6e74, { metalness: 0.6, roughness: 0.4 })); c.position.y = 0.12; head.add(c); const r = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 4, 12), mat(0x4a4e54, { metalness: 0.6 })); r.rotation.x = PI / 2; r.position.y = 0.12; head.add(r); }
    if (look.hat === 'crown') { // v0.8: King Orm's crown: a bronze band with points, glowing faintly
      const cm = new THREE.MeshStandardMaterial({ color: 0xb08a3c, metalness: 0.7, roughness: 0.35, emissive: 0x6a4a10, emissiveIntensity: 0.6 }); cm.name = 'crownMat';
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.135, 0.06, 12, 1, true), cm); band.position.y = 0.13; (band.material as THREE.Material).side = THREE.DoubleSide; head.add(band);
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const pt = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 4), cm); pt.position.set(Math.sin(a) * 0.14, 0.2, Math.cos(a) * 0.14); head.add(pt); }
    }
    for (const side of [-1, 1] as const) {
      const L = side < 0 ? 'L' : 'R';
      const sh = mk(`shoulder${L}` as Joint, chest, side * 0.24 * b, 0.2);
      sh.add(limb(0.29, 0.065 * b, 0.055 * b, coat));
      const el = mk(`elbow${L}` as Joint, sh, 0, -0.29);
      el.add(limb(0.26, 0.05, 0.042, look.coat !== undefined ? coat : skin));
      const hd = mk(`hand${L}` as Joint, el, 0, -0.26);
      hd.add(box(0.07, 0.09, 0.05, skin, -0.045));
      hd.add(side < 0 ? this.handLSlot : this.handRSlot);
      (side < 0 ? this.handLSlot : this.handRSlot).position.set(0, -0.07, 0);
      if (!look.robe) {
        const th = mk(`thigh${L}` as Joint, hips, side * 0.1 * b, -0.04);
        th.add(limb(0.44, 0.085 * b, 0.07 * b, pants));
        const kn = mk(`knee${L}` as Joint, th, 0, -0.44);
        kn.add(limb(0.38, 0.065, 0.05, pants));
        const ft = mk(`foot${L}` as Joint, kn, 0, -0.4);
        const foot = box(0.1, 0.07, 0.22, boots, -0.015); foot.position.z = -0.05; ft.add(foot);
      } else {
        const th = mk(`thigh${L}` as Joint, hips, 0, 0); const kn = mk(`knee${L}` as Joint, th, 0, 0); mk(`foot${L}` as Joint, kn, 0, 0);
      }
    }
    if (look.robe) {
      const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 9, 1, true), mat(look.coat ?? look.shirt, { side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
      skirt.position.y = -0.42; skirt.castShadow = true; hips.add(skirt);
    }
    // v0.8 (ADR-017): one skinned mesh per character instead of ~24 parts (draw calls)
    this.meshes = bakeSkinned(this.root, ALL.map(n => this.j[n])).meshes;
  }

  /** Advance the gait phase by distance covered, so the feet keep pace with the ground. */
  stride(dt: number, speed: number, run = false) {
    const len = run ? 2.5 + speed * 0.02 : clamp(1.05 + speed * 0.26, 1.1, 2.25);
    this.phase += dt * TAU * speed / len;
    if (this.phase > 1e4) this.phase -= TAU * 1000;
  }
  /** Body lean from acceleration (m/s²) and turning (rad/s at speed). */
  motion(dt: number, speed: number, yawRate: number, accel: number) {
    this.ln.tx = clamp(-accel * 0.018 - speed * 0.006, -0.16, 0.12);
    this.ln.tz = clamp(yawRate * Math.min(speed, 7) * 0.022, -0.2, 0.2);
  }
  /** A hit from `side` (+1 from the right) and `back` (+1 pushes the chest backward). */
  flinch(side: number, back: number, strength = 1) { this.fl.vx += back * 7 * strength; this.fl.vz += -side * 6 * strength; }
  /** Landing from a fall; strength ~ impact speed in m/s. */
  land(strength: number) { this.dip.v -= clamp(strength, 0, 9) * 0.32; }

  /** Move every joint to the target pose. `key` names the clip(s): a new key blends from the old pose. */
  apply(p: Pose, dt: number, sharp = 14, key?: string) {
    const w = Math.max(5, sharp * 0.8);
    const switching = key !== undefined && key !== this.lastKey;
    if (key !== undefined) this.lastKey = key;
    const jumpThr = Math.max(0.3, 11 * dt);
    const ZERO: Rot = [0, 0, 0];
    const step = (s: JState, tx: number, ty: number, tz: number) => {
      if (!s.seen) { s.seen = true; s.cur.set(tx, ty, tz); s.prev.set(tx, ty, tz); return; }
      // a new clip, or a joint that jumped: keep the output continuous and let the difference decay
      if (switching || Math.abs(tx - s.prev.x) > jumpThr || Math.abs(ty - s.prev.y) > jumpThr || Math.abs(tz - s.prev.z) > jumpThr) {
        s.off.set(s.cur.x - tx, s.cur.y - ty, s.cur.z - tz);
      }
      let a = decay(s.off.x, s.offV.x, w, dt); s.off.x = a[0]; s.offV.x = a[1];
      a = decay(s.off.y, s.offV.y, w, dt); s.off.y = a[0]; s.offV.y = a[1];
      a = decay(s.off.z, s.offV.z, w, dt); s.off.z = a[0]; s.offV.z = a[1];
      s.cur.set(tx + s.off.x, ty + s.off.y, tz + s.off.z); s.prev.set(tx, ty, tz);
    };
    for (const name of ALL) { const t = p.r[name] ?? ZERO; step(this.st[name], t[0], t[1], t[2]); }
    step(this.hip, p.hx ?? 0, p.hy ?? 0, p.hz ?? 0);
    // ---- additive layers ----
    // flinch: an underdamped spring, so a hit rocks the body and settles
    let r = springTo(this.fl.x, this.fl.vx, 0, 15, 0.42, dt); this.fl.x = clamp(r[0], -0.7, 0.7); this.fl.vx = r[1];
    r = springTo(this.fl.z, this.fl.vz, 0, 13, 0.42, dt); this.fl.z = clamp(r[0], -0.6, 0.6); this.fl.vz = r[1];
    // lean
    r = springTo(this.ln.x, this.ln.vx, this.ln.tx, 7, 0.75, dt); this.ln.x = r[0]; this.ln.vx = r[1];
    r = springTo(this.ln.z, this.ln.vz, this.ln.tz, 6, 0.8, dt); this.ln.z = r[0]; this.ln.vz = r[1];
    this.body.rotation.x = this.ln.x; this.body.rotation.z = this.ln.z;
    // landing dip
    r = springTo(this.dip.y, this.dip.v, 0, 12, 0.55, dt); this.dip.y = clamp(r[0], -0.28, 0.05); this.dip.v = r[1];
    // look-at: turn chest, neck and head toward a point, fading out when it is behind us
    let wantYaw = 0, wantPitch = 0, wantW = 0;
    if (this.lookAt && this.lookWeight > 0) {
      const rp = this.root.position, sc = this.look.scale ?? 1;
      const dx = this.lookAt.x - rp.x, dz = this.lookAt.z - rp.z, dy = this.lookAt.y - (rp.y + 1.6 * sc);
      const yaw = wrapA(Math.atan2(-dx, -dz) - this.root.rotation.y);
      if (Math.abs(yaw) < 1.9) { wantYaw = clamp(yaw, -1.15, 1.15); wantPitch = clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.5, 0.45); wantW = this.lookWeight * (Math.abs(yaw) > 1.5 ? (1.9 - Math.abs(yaw)) / 0.4 : 1); }
    }
    const kL = 1 - Math.exp(-dt * 6);
    this.lk.yaw += (wantYaw - this.lk.yaw) * kL; this.lk.pitch += (wantPitch - this.lk.pitch) * kL; this.lk.w += (wantW - this.lk.w) * kL;
    const ly = this.lk.yaw * this.lk.w, lp = this.lk.pitch * this.lk.w;
    // write rotations
    for (const name of ALL) { const c = this.st[name].cur; this.j[name].rotation.set(c.x, c.y, c.z); }
    const J = this.j;
    J.chest.rotation.y += ly * 0.2; J.neck.rotation.y += ly * 0.3; J.head.rotation.y += ly * 0.5; J.head.rotation.x += lp * 0.7; J.neck.rotation.x += lp * 0.3;
    J.spine.rotation.x += this.fl.x * 0.55; J.chest.rotation.x += this.fl.x * 0.35; J.head.rotation.x += this.fl.x * 0.5;
    J.spine.rotation.z += this.fl.z * 0.5; J.head.rotation.z += this.fl.z * 0.4;
    J.shoulderL.rotation.z -= Math.abs(this.fl.x) * 0.5; J.shoulderR.rotation.z += Math.abs(this.fl.x) * 0.5;
    // hip height, with the legs bending to keep the feet planted when the landing dip lowers the hips
    const hc = this.hip.cur;
    J.hips.position.set(hc.x, this.baseHipY + hc.y + this.dip.y, hc.z);
    if (this.dip.y < -0.002) {
      const a = Math.acos(clamp(1 + this.dip.y / this.legLen, 0.3, 1));
      J.thighL.rotation.x += a; J.thighR.rotation.x += a; J.kneeL.rotation.x -= 2 * a; J.kneeR.rotation.x -= 2 * a; J.footL.rotation.x += a; J.footR.rotation.x += a;
      J.spine.rotation.x -= a * 0.25;
    }
    // cape trails behind when moving and leaning
    if (this.cape) { const target = clamp(-this.ln.x * 2.2 + 0.08 + Math.abs(this.ln.z) * 0.5, 0, 0.9); const q = springTo(this.capeA, this.capeV, target, 6, 0.35, dt); this.capeA = q[0]; this.capeV = q[1]; this.cape.rotation.x = this.capeA; }
  }
  setVisible(v: boolean) { this.root.visible = v; }
  tint(color: number, amount: number) {
    for (const m of this.meshes) { const mm = m.material as THREE.MeshStandardMaterial; if (mm.emissive) { mm.emissive.setHex(color); mm.emissiveIntensity = amount; } }
  }
}

// ---------------- Gait ----------------
export interface GaitOpts { dir?: number; carry?: boolean; tired?: number; aimUpper?: boolean }
/** Walking or running pose at gait phase `phase` (radians). `dir` = movement direction relative to facing
 *  (0 forward, +π/2 to the character's left, ±π backward). */
export function gaitPose(phase: number, speed: number, run: boolean, o: GaitOpts = {}): Pose {
  const dir = o.dir ?? 0, back = Math.abs(dir) > PI * 0.62;
  const ph = back ? -phase : phase;
  const hipYaw = back ? clamp(wrapA(dir - PI), -0.75, 0.75) * 0.8 : clamp(dir, -1.1, 1.1) * 0.78;
  const k = clamp01((speed - 0.6) / 3.6), tired = o.tired ?? 0;
  const A = (run ? 0.84 : 0.2 + 0.4 * k) * (1 - tired * 0.2);
  const Ks = run ? 1.6 : 0.5 + 0.55 * k, Kl = run ? 0.38 : 0.1 + 0.08 * k;
  const leg = (psi: number) => {
    const w = ((psi % TAU) + TAU) % TAU;
    const thigh = A * S(psi) + (run ? 0.16 : 0.03);
    const sw = w < 0.5 * PI ? w + TAU : w;                       // swing window [1.25π, 2.5π]
    const flex = sw >= 1.25 * PI && sw <= 2.5 * PI ? S(PI * (sw - 1.25 * PI) / (1.25 * PI)) : 0;
    const load = w > 0.5 * PI && w < PI ? S((w - 0.5 * PI) * 2) : 0;
    const knee = -(Ks * flex + Kl * load) - 0.04;
    const push = w > 1.15 * PI && w < 1.6 * PI ? S(PI * (w - 1.15 * PI) / (0.45 * PI)) : 0;
    const foot = -(thigh + knee) * 0.85 + 0.22 * Math.max(0, C(psi)) * (1 - flex * 0.5) - 0.5 * push;
    return [thigh, knee, foot];
  };
  const [tL, kL, fL] = leg(ph), [tR, kR, fR] = leg(ph + PI);
  const R = run ? 0.14 : 0.06 + 0.05 * k, P = run ? 0.035 : 0.05, B = run ? 0.065 : 0.022 + 0.022 * k;
  const hipsY = -R * S(ph) + hipYaw, hipsZ = P * C(ph);
  const lean = back ? 0.06 : run ? -0.2 : -0.04 - 0.05 * k;
  const spineY = R * 1.25 * S(ph) - hipYaw * 0.55, spineZ = -hipsZ * 0.6;
  const chestY = R * 0.45 * S(ph) - hipYaw * 0.35;
  const hy = run ? -B * (0.5 + 0.5 * C(2 * ph)) - 0.05 : B * 0.5 * (C(2 * ph) - 1);
  const Aa = run ? 0.95 : 0.18 + 0.4 * k;
  const r: Pose['r'] = {
    hips: [0, hipsY, hipsZ],
    thighL: [tL, 0, -0.02], kneeL: [kL, 0, 0], footL: [fL, 0, 0],
    thighR: [tR, 0, 0.02], kneeR: [kR, 0, 0], footR: [fR, 0, 0],
    spine: [lean - tired * 0.1, spineY, spineZ], chest: [run ? -0.06 : 0, chestY, 0],
    neck: [0, 0, 0],
    head: [-lean * 0.6 + (run ? 0.1 : 0) - tired * 0.25, -(hipsY + spineY + chestY) * 0.85, -(hipsZ + spineZ) * 0.7],
  };
  if (o.carry) {
    r.shoulderL = [0.95, 0, -0.25]; r.shoulderR = [0.95, 0, 0.25]; r.elbowL = [1.0, 0, 0]; r.elbowR = [1.0, 0, 0];
    r.spine = [0.06, spineY * 0.4, spineZ]; r.chest = [0, chestY * 0.3, 0];
  } else {
    r.shoulderL = [-Aa * S(ph) + (run ? 0.15 : 0.02), 0, -(0.07 + (run ? 0.1 : 0))];
    r.shoulderR = [Aa * S(ph) + (run ? 0.15 : 0.02), 0, 0.07 + (run ? 0.1 : 0)];
    r.elbowL = [run ? 1.45 + 0.25 * S(ph) : 0.22 + 0.4 * k * Math.max(0, -S(ph)), 0, 0];
    r.elbowR = [run ? 1.45 - 0.25 * S(ph) : 0.22 + 0.4 * k * Math.max(0, S(ph)), 0, 0];
    r.handL = [0, 0, -0.1]; r.handR = [0, 0, 0.1];
  }
  return { r, hy, hx: (run ? 0.012 : 0.022) * C(ph) };
}
/** In the air: tucked while rising, legs reaching for the ground while falling. */
export function airPose(vy: number, t: number): Pose {
  const k = clamp01((vy + 1) / 5), f = 1 - k, flail = S(t * 9) * 0.08 * f;
  return { r: {
    thighL: [0.35 + 0.65 * k, 0, -0.04], thighR: [0.15 + 0.35 * k, 0, 0.04], kneeL: [-0.35 - 1.0 * k, 0, 0], kneeR: [-0.3 - 0.7 * k, 0, 0], footL: [0.2, 0, 0], footR: [0.25, 0, 0],
    shoulderL: [-0.3 - 0.4 * k, 0, -0.45 - 0.25 * f + flail], shoulderR: [-0.3 - 0.4 * k, 0, 0.45 + 0.25 * f - flail], elbowL: [0.5, 0, 0], elbowR: [0.5, 0, 0],
    spine: [-0.12 * k + 0.05 * f, 0, 0], head: [0.06 * k - 0.1 * f, 0, 0],
  }, hy: 0.02 * k };
}

// ---------------- Animation clips ----------------
export type ClipName =
  | 'idle' | 'walk' | 'run' | 'jump' | 'interact' | 'eat' | 'drink' | 'wash' | 'sit' | 'write' | 'sleep'
  | 'aim' | 'shoot' | 'reload' | 'cast' | 'staffIdle' | 'melee' | 'windup' | 'hit' | 'die' | 'float' | 'castOrb' | 'wave'
  | 'kneel' | 'pick' | 'dodge' | 'talk' | 'lunge' | 'hammer'
  // v0.7
  | 'lookAround' | 'stretch' | 'scratch' | 'crossArms' | 'point' | 'sweep' | 'chop' | 'mine' | 'fish' | 'stir'
  | 'lute' | 'guard' | 'sitGround' | 'drinkMug' | 'cheer' | 'bow' | 'carry' | 'bathe' | 'ready' | 'shoveling' | 'crossbow' | 'shootBow' | 'slam' | 'stagger' | 'rifleAim' | 'rifleShoot' | 'rifleReload'
  // v0.8
  | 'rise' | 'sweepBig' | 'snuff' | 'kneelFall' | 'mourn'
  // v0.9
  | 'mendNet' | 'haul' | 'scrub';

const idleBase = (t: number, relax = 1): Pose => {
  // breathing, and a slow weight shift from one leg to the other
  const br = S(t * 1.8), ws = S(t * 0.42 + 0.6), wsL = Math.max(0, ws), wsR = Math.max(0, -ws);
  return { r: {
    hips: [0, 0.03 * ws, 0.045 * ws * relax], spine: [0.01 + br * 0.012, -0.02 * ws, -0.035 * ws * relax], chest: [br * 0.022, 0, 0],
    thighL: [0.04 * wsR, 0, -0.03 - 0.03 * wsL], kneeL: [-0.14 * wsR * relax - 0.03, 0, 0], footL: [0.1 * wsR, 0, 0],
    thighR: [0.04 * wsL, 0, 0.03 + 0.03 * wsR], kneeR: [-0.14 * wsL * relax - 0.03, 0, 0], footR: [0.1 * wsL, 0, 0],
    shoulderL: [0.06 + br * 0.015, 0, -0.08 - br * 0.01], shoulderR: [0.06 + br * 0.015, 0, 0.08 + br * 0.01], elbowL: [0.16, 0, 0], elbowR: [0.16, 0, 0],
    handL: [0, 0, -0.1], handR: [0, 0, 0.1],
    head: [S(t * 0.7) * 0.04, S(t * 0.33) * 0.12, S(t * 0.5) * 0.02],
  }, hy: br * 0.004 - 0.01 * Math.abs(ws) * relax, hx: 0.028 * ws * relax };
};
/** Merge b over a (joints in b replace a's). */
const over = (a: Pose, b: Partial<Record<Joint, Rot>>, extra: Partial<Pose> = {}): Pose => ({ r: { ...a.r, ...b }, hy: extra.hy ?? a.hy, hx: extra.hx ?? a.hx, hz: extra.hz ?? a.hz });

/** Full-body clips. `t` in seconds; `v` = movement speed for gait clips. */
export function clip(name: ClipName, t: number, v = 0): Pose {
  switch (name) {
    case 'idle': return idleBase(t);
    case 'walk': case 'run': { const run = name === 'run', sp = run ? Math.max(5.5, v) : Math.max(0.8, v); const len = run ? 2.6 : 1.05 + sp * 0.26; return gaitPose(t * TAU * sp / len, sp, run); }
    case 'jump': return airPose(2, t);
    case 'interact': {
      const reach = ease.outCubic(t / 0.32) * (1 - ease.inOut((t - 0.55) / 0.35));
      return over(idleBase(t, 0.4), { shoulderR: [1.25 * reach, 0, 0.05], elbowR: [0.35 * reach + 0.1, 0, 0], handR: [-0.3 * reach, 0, 0], spine: [-0.18 * reach, 0.08 * reach, 0], head: [-0.25 * reach, 0.06, 0] });
    }
    case 'eat': case 'drink': {
      const up = ease.outCubic(t / 0.35), bite = (S(t * 5.5) + 1) / 2;
      const drink = name === 'drink';
      return over(idleBase(t, 0.3), { shoulderR: [(1.15 + bite * 0.2) * up, 0, -0.35 * up], elbowR: [(1.9 + bite * 0.25) * up, 0, 0], head: [drink ? 0.45 * up : -0.05 + bite * 0.08 * up, 0, 0], spine: [drink ? 0.06 * up : -0.04, 0, 0], shoulderL: [0.3, 0, -0.1], elbowL: [0.5, 0, 0] });
    }
    case 'wash': {
      const sc = S(t * 9) * 0.25;
      return { r: { spine: [-0.45, 0, 0], head: [-0.2, 0, 0], shoulderR: [1.3, 0, -0.3 + sc], elbowR: [1.7, 0, 0], shoulderL: [1.3, 0, 0.3 + sc], elbowL: [1.7, 0, 0], thighL: [0.1, 0, 0], thighR: [0.1, 0, 0], kneeL: [-0.15, 0, 0], kneeR: [-0.15, 0, 0] } };
    }
    case 'sit': case 'write': case 'drinkMug': {
      const w = name === 'write' ? S(t * 7) * 0.12 : 0, br = S(t * 1.6) * 0.02, sip = name === 'drinkMug' ? Math.max(0, S(t * 0.8)) ** 3 : 0;
      return {
        r: { thighL: [1.55, 0, -0.07], thighR: [1.55, 0, 0.07], kneeL: [-1.5, 0, 0], kneeR: [-1.55, 0, 0], footL: [0, 0, 0], footR: [0, 0, 0], spine: [(name === 'write' ? -0.3 : 0.05) + br, 0, 0], head: [name === 'write' ? -0.35 : sip * 0.35 + S(t * 0.5) * 0.04, S(t * 0.3) * 0.1 * (name === 'sit' ? 1 : 0), 0],
          shoulderR: name === 'write' ? [0.9, 0, -0.2 + w] : name === 'drinkMug' ? [0.6 + sip * 0.6, 0, -0.15] : [0.35, 0, 0.05], elbowR: name === 'write' ? [0.9, 0, 0] : name === 'drinkMug' ? [1.4 + sip * 0.6, 0, 0] : [0.9, 0, 0], shoulderL: name === 'write' ? [0.8, 0, 0.25] : [0.35, 0, -0.05], elbowL: [0.9, 0, 0] },
        hy: -0.47, hz: 0.06,
      };
    }
    case 'sitGround': {
      const br = S(t * 1.6) * 0.02;
      return { r: { thighL: [1.35, 0, -0.5], thighR: [1.35, 0, 0.5], kneeL: [-2.2, 0, 0], kneeR: [-2.2, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0], spine: [0.12 + br, 0, 0], head: [S(t * 0.4) * 0.06, S(t * 0.25) * 0.2, 0], shoulderL: [0.6, 0, -0.2], shoulderR: [0.6, 0, 0.2], elbowL: [1.0, 0, 0], elbowR: [1.0, 0, 0] }, hy: -0.78 };
    }
    case 'bathe': {
      const br = S(t * 1.2) * 0.02;
      return { r: { thighL: [1.2, 0, -0.1], thighR: [1.2, 0, 0.1], kneeL: [-1.0, 0, 0], kneeR: [-1.0, 0, 0], spine: [0.35 + br, 0, 0], head: [0.25, 0.15, 0], shoulderL: [0.1, 0, -0.9], shoulderR: [0.1, 0, 0.9], elbowL: [0.3, 0, 0], elbowR: [0.3, 0, 0] }, hy: -0.62 };
    }
    case 'sleep':
      return { r: { hips: [Math.PI / 2, 0, 0], head: [0.2 + S(t * 0.9) * 0.02, 0.4, 0], shoulderL: [0, 0, -0.15], shoulderR: [0.2, 0, 0.6], elbowR: [1.6, 0, 0], kneeL: [-0.4, 0, 0], thighL: [0.3, 0, 0], chest: [S(t * 0.9) * 0.02, 0, 0] }, hy: -0.48 };
    case 'aim': case 'shoot': case 'reload': case 'rifleAim': case 'rifleShoot': case 'rifleReload': {
      // long gun at the shoulder (the carbine; also the old v0.1 carbine pose)
      const kick = name === 'shoot' || name === 'rifleShoot' ? Math.max(0, 1 - t * 8) * 0.25 : 0;
      const rl = name === 'reload' || name === 'rifleReload' ? S(Math.min(1, t / 1.4) * Math.PI) : 0;
      return { r: { shoulderR: [1.35 + kick, 0, 0.1], elbowR: [0.6 - kick * 0.5, 0, 0], shoulderL: [1.45 - rl * 0.6, 0, -0.55 + rl * 0.3], elbowL: [0.4 + rl * 0.9, 0, 0], spine: [-0.05 - kick * 0.2 + rl * -0.2, -0.15, 0], head: [0.05 - rl * 0.3, 0.12, 0], chest: [0, -0.1, 0] } };
    }
    case 'staffIdle':
      return over(idleBase(t, 0.6), { shoulderR: [0.35, 0, 0.12], elbowR: [0.9, 0, 0] });
    case 'cast': {
      // a short pull back, then a thrust that overshoots and settles
      const back = ease.bell(t / 0.12) * (t < 0.12 ? 1 : 0), e = ease.outBack(t / 0.18) * (1 - ease.inOut((t - 0.3) / 0.35));
      return { r: { shoulderR: [0.35 + 1.05 * e - 0.3 * back, 0, 0.12], elbowR: [0.9 - 0.75 * e + 0.2 * back, 0, 0], shoulderL: [1.5 * e, 0, -0.2], elbowL: [0.2, 0, 0], handL: [-0.4 * e, 0, 0], spine: [-0.14 * e + 0.06 * back, 0.18 * e, 0], head: [0, -0.05 * e, 0] } };
    }
    case 'castOrb': {
      const k = ease.outCubic(t * 2), tr = S(t * 31) * 0.03 * k;
      return { r: { shoulderR: [1.6 * k, 0, 0.3 + tr], shoulderL: [1.6 * k, 0, -0.3 - tr], elbowR: [0.2, 0, 0], elbowL: [0.2, 0, 0], spine: [0.1 * k, 0, 0], head: [0.15 * k, 0, 0] }, hy: 0.05 * k };
    }
    case 'windup': {
      // anticipation that reads from across a field: coil back, then tremble at the top
      const k = ease.outCubic(t * 3), tr = t > 0.3 ? S(t * 40) * 0.035 : 0;
      return { r: { shoulderR: [-2.4 * k + tr, 0, 0.25], elbowR: [0.6 * k, 0, 0], spine: [0.22 * k, -0.4 * k, 0], chest: [0.05 * k, -0.1 * k, 0], shoulderL: [0.6 * k, 0, -0.35], elbowL: [0.5, 0, 0], thighL: [0.4 * k, 0, 0], kneeL: [-0.35 * k, 0, 0], footL: [0.1 * k, 0, 0], thighR: [-0.25 * k, 0, 0], kneeR: [-0.2 * k, 0, 0], head: [-0.1 * k, 0.2 * k, 0] }, hy: -0.07 * k };
    }
    case 'melee': {
      // fast swing (ease out), follow-through past the target, slow recovery
      const sw = ease.outCubic(t / 0.16), rec = ease.inOut((t - 0.26) / 0.34);
      const e = sw * (1 - rec);
      return { r: { shoulderR: [-2.4 + 3.75 * sw - 1.1 * rec * sw, 0, 0.25 - 0.3 * e], elbowR: [0.6 - 0.55 * sw + 0.3 * rec, 0, 0], spine: [0.22 - 0.62 * e, -0.4 + 0.85 * e, 0], chest: [-0.1 * e, 0.2 * e, 0], shoulderL: [0.6 - 0.8 * e, 0, -0.35], elbowL: [0.5, 0, 0], thighL: [0.45 * e, 0, 0], kneeL: [-0.35 * e, 0, 0], thighR: [-0.35 * e, 0, 0], kneeR: [-0.1 * e, 0, 0], head: [0.05 * e, -0.15 * e, 0] }, hy: -0.09 * e };
    }
    case 'slam': { // two-handed overhead slam (the Warden Engine, a miner's pick)
      const up = ease.outCubic(t / 0.5), down = ease.inCubic((t - 0.5) / 0.15), rec = ease.inOut((t - 0.9) / 0.5);
      const a = up * (1 - down) * (1 - rec);
      return { r: { shoulderL: [-2.6 * a + 1.2 * down * (1 - rec), 0, -0.2], shoulderR: [-2.6 * a + 1.2 * down * (1 - rec), 0, 0.2], elbowL: [0.4 * a, 0, 0], elbowR: [0.4 * a, 0, 0], spine: [0.25 * a - 0.5 * down * (1 - rec), 0, 0], thighL: [0.5 * down * (1 - rec), 0, 0], kneeL: [-0.6 * down * (1 - rec), 0, 0], thighR: [0.3 * down * (1 - rec), 0, 0], kneeR: [-0.6 * down * (1 - rec), 0, 0] }, hy: -0.15 * down * (1 - rec) };
    }
    case 'hit': {
      const e = Math.exp(-t * 7) * (t < 0.04 ? t / 0.04 : 1);
      return over(idleBase(t, 0.2), { spine: [0.4 * e, 0, 0.12 * e], head: [0.45 * e, 0, 0], shoulderL: [-0.4 * e, 0, -0.55 * e], shoulderR: [-0.4 * e, 0, 0.55 * e], thighL: [-0.2 * e, 0, 0], kneeL: [-0.3 * e, 0, 0] }, { hy: -0.05 * e });
    }
    case 'rise': { // v0.8: a barrow wight claws up out of the ground (about 2 s): crouched and reaching, then straightening
      const k = ease.inOut(t / 1.9), c = 1 - k, claw = S(t * 7) * 0.18 * c;
      return { r: { spine: [-0.75 * c, 0, 0.12 * S(t * 3) * c], chest: [-0.2 * c, 0, 0], head: [0.55 * c - 0.1 * k, 0, 0], shoulderL: [2.5 * c + 0.9 * k + claw, 0, -0.25], shoulderR: [2.1 * c + 0.9 * k - claw, 0, 0.25], elbowL: [0.5 * c + 0.2 * k, 0, 0], elbowR: [0.8 * c + 0.2 * k, 0, 0],
        thighL: [1.45 * c, 0, 0], kneeL: [-1.95 * c, 0, 0], footL: [0.5 * c, 0, 0], thighR: [1.1 * c, 0, 0], kneeR: [-1.6 * c, 0, 0], footR: [0.5 * c, 0, 0] }, hy: -0.58 * c };
    }
    case 'sweepBig': { // v0.8: King Orm's two-handed sweep: wind up to the right, then one flat arc across the front
      const w = ease.outCubic(t / 0.75), s = ease.inOut((t - 0.75) / 0.24), r = ease.inOut((t - 1.15) / 0.55), a = 1 - r;
      const yaw = (0.95 * w - 2.0 * s) * a;
      return { r: { spine: [-0.18 * a, yaw * 0.55, -0.1 * yaw], chest: [0, yaw * 0.45, 0], head: [0.05, -yaw * 0.5, 0], shoulderR: [1.25 * a, 0, (0.35 - 0.5 * s) * a], shoulderL: [1.25 * a, 0, (-0.2 - 0.3 * s) * a], elbowR: [0.35 * a, 0, 0], elbowL: [0.6 * a, 0, 0],
        thighL: [(0.35 * s - 0.1 * w) * a, 0, 0], kneeL: [-0.45 * a, 0, 0], thighR: [(-0.25 * w + 0.1 * s) * a, 0, 0], kneeR: [-0.35 * a, 0, 0] }, hy: -0.12 * a, hz: -0.15 * s * a };
    }
    case 'snuff': { // v0.8: King Orm leans over a brazier and breathes it out: arms spread, a long exhale
      const lean = ease.outCubic(t / 0.6) * (1 - ease.inOut((t - 1.6) / 0.6)), br = S(t * 2.2) * 0.04;
      return { r: { spine: [-0.55 * lean + br, 0, 0], chest: [-0.15 * lean, 0, 0], head: [-0.3 * lean, 0, 0], shoulderL: [0.6 * lean, 0, -1.1 * lean], shoulderR: [0.6 * lean, 0, 1.1 * lean], elbowL: [0.3, 0, 0], elbowR: [0.3, 0, 0], thighL: [0.25 * lean, 0, 0], kneeL: [-0.35 * lean, 0, 0], thighR: [0.15 * lean, 0, 0], kneeR: [-0.3 * lean, 0, 0] }, hy: -0.1 * lean };
    }
    case 'kneelFall': { // v0.8: a defeated king goes down on both knees and bows forward, and stays there
      const k = ease.outCubic(t / 0.7), bow = ease.inOut((t - 0.7) / 1.2), sag = S(t * 1.3) * 0.02 * k;
      return { r: { thighL: [1.55 * k, 0, -0.08], kneeL: [-2.1 * k, 0, 0], footL: [0.7 * k, 0, 0], thighR: [1.55 * k, 0, 0.08], kneeR: [-2.1 * k, 0, 0], footR: [0.7 * k, 0, 0],
        spine: [-0.25 * k - 0.45 * bow + sag, 0, 0], head: [-0.4 * bow, 0, 0], shoulderL: [0.3 + 0.4 * bow, 0, -0.15], shoulderR: [0.3 + 0.4 * bow, 0, 0.15], elbowL: [0.4, 0, 0], elbowR: [0.4, 0, 0] }, hy: -0.68 * k };
    }
    case 'mourn': { // v0.8: arms folded tight, head down, a slow sway (Liss Teague before you find the ring)
      const sw = S(t * 0.7);
      return { r: { spine: [-0.08, 0, sw * 0.03], head: [-0.38, sw * 0.08, 0], shoulderL: [0.55, 0, 0.42], shoulderR: [0.55, 0, -0.42], elbowL: [1.9, 0, 0], elbowR: [1.9, 0, 0], thighL: [0, 0, sw * 0.02], thighR: [0, 0, sw * 0.02] } };
    }
    case 'stagger': { // a big hit: rocked back, arms out, a step to catch the weight
      const e = Math.exp(-t * 3) * ease.outCubic(t / 0.08), wob = S(t * 14) * 0.08 * e;
      return { r: { spine: [0.5 * e, wob, 0.15 * e], head: [0.4 * e, 0, 0], shoulderL: [-0.6 * e, 0, -0.9 * e], shoulderR: [-0.6 * e, 0, 0.9 * e], elbowL: [0.4, 0, 0], elbowR: [0.4, 0, 0], thighL: [-0.4 * e, 0, 0], kneeL: [-0.5 * e, 0, 0], thighR: [0.25 * e, 0, 0], kneeR: [-0.2 * e, 0, 0] }, hy: -0.08 * e, hz: 0.12 * e };
    }
    case 'die': {
      // knees buckle, then the body drops (gravity: ease in), hits the ground and settles with a bounce
      const buckle = ease.outCubic(t / 0.25), fall = ease.inCubic((t - 0.15) / 0.5), land = t > 0.65 ? Math.exp(-(t - 0.65) * 9) * S((t - 0.65) * 24) * 0.08 : 0;
      const k = fall + land;
      return { r: {
        hips: [Math.PI / 2 * k, 0, 0.18 * k], spine: [-0.25 * buckle * (1 - fall) + 0.1 * k, 0, 0], head: [0.3 * k - 0.2 * buckle * (1 - fall), 0.5 * k, 0],
        thighL: [0.5 * buckle * (1 - fall) + 0.2 * k, 0, -0.1 * k], kneeL: [-0.9 * buckle * (1 - fall) - 0.4 * k, 0, 0], thighR: [0.35 * buckle * (1 - fall), 0, 0.12 * k], kneeR: [-0.7 * buckle * (1 - fall) - 0.1 * k, 0, 0],
        shoulderL: [-1.2 * k + 0.4 * buckle * (1 - k), 0, -0.9 * k], shoulderR: [-1.0 * k + 0.3 * buckle * (1 - k), 0, 0.8 * k], elbowL: [0.3 * k, 0, 0], elbowR: [0.5 * k, 0, 0],
      }, hy: -0.32 * buckle * (1 - fall) - 0.82 * Math.min(1, k) };
    }
    case 'float': {
      const b = S(t * 2);
      return { r: { shoulderL: [0.3, 0, -0.35 + b * 0.05], shoulderR: [0.3, 0, 0.35 - b * 0.05], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0], head: [0.1, S(t * 0.6) * 0.3, 0], spine: [S(t * 1.3) * 0.04, 0, S(t * 0.9) * 0.03] }, hy: 0.15 + b * 0.06 };
    }
    case 'wave': {
      const up = ease.outBack(t / 0.3);
      return over(idleBase(t, 0.4), { shoulderR: [0.2 * up, 0, 2.5 * up], elbowR: [0, 0, (0.5 + S(t * 8) * 0.4) * up], head: [0.05, -0.2, 0.05] });
    }
    case 'kneel': case 'pick': { // down on the right knee; 'pick' reaches to the ground with the right hand
      const k = ease.outCubic(t * 2.6), reach = name === 'pick' ? Math.max(0, S(Math.min(1, t / 1.1) * Math.PI)) : 0, br = S(t * 1.6) * 0.02;
      return { r: { thighL: [1.5 * k, 0, 0], kneeL: [-1.5 * k, 0, 0], footL: [0, 0, 0], thighR: [0.1 * k, 0, 0], kneeR: [-1.6 * k, 0, 0], footR: [1.2 * k, 0, 0], spine: [(-0.12 - reach * 0.5) * k + br, 0, 0], head: [(name === 'pick' ? -0.3 : 0.38) * k, 0, 0],
        shoulderR: name === 'pick' ? [0.5 + reach * 0.9, 0, 0.05] : [0.95 * k, 0, -0.42 * k], elbowR: name === 'pick' ? [0.3, 0, 0] : [1.65 * k, 0, 0], shoulderL: name === 'pick' ? [0.3, 0, -0.1] : [0.95 * k, 0, 0.42 * k], elbowL: name === 'pick' ? [0.8, 0, 0] : [1.65 * k, 0, 0] }, hy: -0.46 * k };
    }
    case 'dodge': { // a low, fast step: body dips and leans into it, then recovers
      const e = S(Math.min(1, t / 0.35) * Math.PI);
      return { r: { spine: [-0.55 * e, 0, 0.12 * e], head: [0.25 * e, 0, 0], thighL: [0.9 * e, 0, 0], kneeL: [-1.1 * e, 0, 0], footL: [0.2 * e, 0, 0], thighR: [-0.5 * e, 0, 0], kneeR: [-0.6 * e, 0, 0], footR: [-0.3 * e, 0, 0], shoulderL: [-0.7 * e, 0, -0.4], shoulderR: [-0.7 * e, 0, 0.4], elbowL: [0.6, 0, 0], elbowR: [0.6, 0, 0] }, hy: -0.3 * e };
    }
    case 'talk': { // weight on one leg, a hand that helps the words along
      const g = S(t * 2.3), g2 = S(t * 3.7 + 1), emph = Math.max(0, S(t * 1.1)) ** 4;
      return over(idleBase(t, 0.8), { shoulderR: [0.55 + g * 0.18 + emph * 0.3, 0, 0.1 + emph * 0.1], elbowR: [1.1 + g2 * 0.25, 0, 0], handR: [g * 0.2, 0, 0], head: [g2 * 0.05 - emph * 0.06, g * 0.12, g * 0.03], chest: [S(t * 1.8) * 0.03, g * 0.04, 0] });
    }
    case 'lunge': { // two-handed grab forward (the drowned)
      const k = ease.outCubic(t * 5), rec = ease.inOut((t - 0.3) * 3), e = k * (1 - rec);
      return { r: { shoulderL: [1.5 * e + 0.3, 0, -0.15], shoulderR: [1.5 * e + 0.3, 0, 0.15], elbowL: [0.3, 0, 0], elbowR: [0.3, 0, 0], spine: [-0.45 * e, 0, 0], thighL: [0.5 * e, 0, 0], kneeL: [-0.4 * e, 0, 0], head: [0.2 * e, 0, 0] }, hy: -0.08 * e };
    }
    case 'hammer': case 'mine': case 'chop': { // repeated strikes: lift (slow), strike (fast), a beat of rest
      const rate = name === 'hammer' ? 1.6 : name === 'mine' ? 1.1 : 1.0, ph = (t * rate) % 1;
      const up = ph < 0.55 ? ease.sine(ph / 0.55) : ph < 0.68 ? 1 - ease.inCubic((ph - 0.55) / 0.13) : 0;
      const hit = ph >= 0.68 && ph < 0.8 ? 1 - (ph - 0.68) / 0.12 : 0;
      if (name === 'hammer') return over(idleBase(t, 0.3), { shoulderR: [0.4 - 2.2 * up, 0, 0.2], elbowR: [0.9 - 0.4 * up, 0, 0], shoulderL: [0.6, 0, -0.2], elbowL: [0.9, 0, 0], spine: [-0.2 + 0.25 * up - 0.05 * hit, -0.1, 0], head: [-0.15, 0, 0] });
      const two = 0.3 - 2.6 * up;
      return over(idleBase(t, 0.2), { shoulderR: [two, 0, 0.15], shoulderL: [two + 0.1, 0, -0.05], elbowR: [0.5 - 0.2 * up, 0, 0], elbowL: [0.6 - 0.2 * up, 0, 0], spine: [-0.35 + 0.45 * up - 0.08 * hit, name === 'chop' ? -0.35 + 0.2 * up : 0, 0], head: [-0.2 + 0.1 * up, 0, 0], thighL: [0.3, 0, 0], kneeL: [-0.3, 0, 0] }, { hy: -0.06 });
    }
    case 'shoveling': {
      const ph = (t * 0.9) % 1, dig = ph < 0.4 ? ease.sine(ph / 0.4) : 1 - ease.sine((ph - 0.4) / 0.6);
      return over(idleBase(t, 0.2), { shoulderR: [0.6 + 0.6 * dig, 0, 0.1], shoulderL: [0.9 + 0.4 * dig, 0, -0.1], elbowR: [0.8, 0, 0], elbowL: [0.4, 0, 0], spine: [-0.5 * dig, 0.3 * dig, 0], thighL: [0.4 * dig, 0, 0], kneeL: [-0.5 * dig, 0, 0] }, { hy: -0.08 * dig });
    }
    // ---- fidgets and work (townsfolk) ----
    case 'lookAround': {
      const a = S(t * 1.1) * ease.ramp(t, 0, 0.5) * (1 - ease.ramp(t, 2.6, 3.2));
      return over(idleBase(t), { neck: [0, a * 0.4, 0], head: [0.06, a * 0.55, 0], chest: [0, a * 0.12, 0] });
    }
    case 'stretch': {
      const k = ease.inOut(t / 0.8) * (1 - ease.inOut((t - 2.0) / 0.8)), tr = S(t * 23) * 0.02 * k;
      return over(idleBase(t, 0.3), { shoulderL: [2.9 * k, 0, -0.35 * k + tr], shoulderR: [2.9 * k, 0, 0.35 * k - tr], elbowL: [0.2, 0, 0], elbowR: [0.2, 0, 0], spine: [0.18 * k, 0, 0], head: [0.35 * k, 0, 0] }, { hy: 0.02 * k });
    }
    case 'scratch': {
      const k = ease.outCubic(t / 0.45) * (1 - ease.inOut((t - 1.6) / 0.5)), sc = S(t * 18) * 0.08 * k;
      return over(idleBase(t), { shoulderR: [1.9 * k, 0, 0.55 * k], elbowR: [2.1 * k + sc, 0, 0], head: [-0.12 * k, -0.15 * k, 0.12 * k] });
    }
    case 'crossArms': {
      const k = ease.outCubic(t / 0.6), br = S(t * 1.8) * 0.015;
      return over(idleBase(t, 0.7), { shoulderL: [0.75 * k, 0, 0.32 * k - 0.08], shoulderR: [0.75 * k, 0, -0.32 * k + 0.08], elbowL: [1.75 * k, 0, 0], elbowR: [1.75 * k, 0, 0], handL: [0, 0.8 * k, 0], handR: [0, -0.8 * k, 0], chest: [br - 0.04 * k, 0, 0] });
    }
    case 'point': {
      const k = ease.outBack(t / 0.35) * (1 - ease.inOut((t - 1.8) / 0.5));
      return over(idleBase(t, 0.5), { shoulderR: [1.45 * k, 0, 0.35 * k], elbowR: [0.05, 0, 0], head: [0, -0.3 * k, 0], chest: [0, -0.2 * k, 0] });
    }
    case 'sweep': {
      const s2 = S(t * 2.6);
      return over(idleBase(t, 0.2), { shoulderR: [0.75 + s2 * 0.25, 0, 0.1], shoulderL: [1.0 + s2 * 0.2, 0, -0.15], elbowR: [0.6, 0, 0], elbowL: [0.4, 0, 0], spine: [-0.3, s2 * 0.25, 0], head: [-0.25, s2 * 0.1, 0] });
    }
    case 'mendNet': { // v0.9: sat on the quay with a net over the knees, the needle going in and out
      const a = t * 2.6, k = Math.max(0, S(a)), j = Math.max(0, S(a + PI));
      return { r: { thighL: [1.35, 0, -0.45], thighR: [1.35, 0, 0.45], kneeL: [-2.1, 0, 0], kneeR: [-2.1, 0, 0], footL: [0.6, 0, 0], footR: [0.6, 0, 0], spine: [0.32 + S(t * 1.3) * 0.02, 0, 0], head: [0.42, S(t * 0.3) * 0.1, 0],
        shoulderL: [0.75 + j * 0.15, 0, -0.15], elbowL: [1.15 - j * 0.2, 0, 0], shoulderR: [0.8 + k * 0.25, 0, 0.2 - k * 0.15], elbowR: [1.1 - k * 0.35, 0, 0], handR: [k * 0.4, 0, 0] }, hy: -0.62 };
    }
    case 'haul': { // v0.9: hauling a rope hand over hand, leaning back into it
      const a = t * 2.2, k = S(a), lean = 0.22 + Math.max(0, k) * 0.08;
      return over(idleBase(t, 0.2), { spine: [-lean, 0, 0], chest: [-0.05, 0, 0], head: [0.12, 0, 0], thighL: [0.35, 0, -0.05], kneeL: [-0.45, 0, 0], thighR: [-0.15, 0, 0.05], kneeR: [-0.2, 0, 0],
        shoulderL: [1.25 + k * 0.35, 0, -0.1], elbowL: [0.35 + Math.max(0, -k) * 0.9, 0, 0], shoulderR: [1.25 - k * 0.35, 0, 0.1], elbowR: [0.35 + Math.max(0, k) * 0.9, 0, 0] });
    }
    case 'scrub': { // v0.9: on the knees, scrubbing boards with a brush in big circles
      const a = t * 3.4;
      return { r: { thighL: [0.1, 0, -0.1], thighR: [0.1, 0, 0.1], kneeL: [-1.7, 0, 0], kneeR: [-1.7, 0, 0], footL: [0.9, 0, 0], footR: [0.9, 0, 0], spine: [0.75, S(a) * 0.08, 0], head: [-0.2, 0, 0],
        shoulderR: [1.2 + S(a) * 0.25, 0, 0.1 + C(a) * 0.2], elbowR: [0.5, 0, 0], shoulderL: [0.9, 0, -0.35], elbowL: [0.6, 0, 0] }, hy: -0.48 };
    }
    case 'stir': {
      const a = t * 3.2;
      return over(idleBase(t, 0.3), { shoulderR: [0.85 + S(a) * 0.1, 0, 0.15 + C(a) * 0.12], elbowR: [1.0 + C(a) * 0.15, 0, 0], shoulderL: [0.3, 0, -0.1], elbowL: [0.6, 0, 0], spine: [-0.2, 0, 0], head: [-0.35, 0, 0] });
    }
    case 'fish': { // rod held out, small twitches; a cast at the start
      const cast = t < 1.0 ? ease.bell(t / 1.0) : 0, tw = S(t * 1.7) * 0.03 + (S(t * 11) > 0.97 ? 0.05 : 0);
      return over(idleBase(t, 0.3), { shoulderR: [0.95 - 1.6 * cast + tw, 0, 0.1], shoulderL: [0.8 - 0.6 * cast, 0, -0.25], elbowR: [0.7, 0, 0], elbowL: [1.0, 0, 0], spine: [-0.05 + 0.15 * cast, -0.1, 0], head: [-0.15, 0, 0] });
    }
    case 'lute': { // strumming at chest height
      const st2 = S(t * 9), bob = S(t * 4.4);
      return over(idleBase(t, 0.6), { shoulderL: [0.95, 0, 0.45], elbowL: [1.5, 0, 0], handL: [0, 0, 0.3], shoulderR: [0.55 + st2 * 0.12, 0, -0.2], elbowR: [1.35, 0, 0], head: [-0.1 + bob * 0.05, 0.2, bob * 0.06], chest: [0, 0, bob * 0.03] });
    }
    case 'guard': { // at ease: hands behind the back, weight square
      const br = S(t * 1.6) * 0.015;
      return over(idleBase(t, 0.25), { shoulderL: [-0.35, 0, -0.12], shoulderR: [-0.35, 0, 0.12], elbowL: [0.85, 0, 0], elbowR: [0.85, 0, 0], chest: [br - 0.03, 0, 0], head: [0.05, S(t * 0.25) * 0.3, 0] });
    }
    case 'cheer': {
      const up = Math.abs(S(t * 5));
      return over(idleBase(t, 0.2), { shoulderL: [2.6 * up + 0.3, 0, -0.3], shoulderR: [2.6 * up + 0.3, 0, 0.3], elbowL: [0.3, 0, 0], elbowR: [0.3, 0, 0], head: [0.2 * up, 0, 0] }, { hy: 0.04 * up });
    }
    case 'bow': {
      const k = ease.bell(t / 1.4);
      return over(idleBase(t, 0.2), { spine: [-0.55 * k, 0, 0], head: [-0.25 * k, 0, 0], shoulderR: [0.45 * k, 0, 0.1], elbowR: [1.3 * k, 0, 0] });
    }
    case 'carry': return gaitPose(t * TAU * 1.6 / 1.5, 1.6, false, { carry: true });
    case 'ready': { // combat stance for humanoid enemies: knees soft, weapon arm up
      const b = S(t * 2.6);
      return { r: { thighL: [0.35, 0, -0.08], thighR: [-0.12, 0, 0.08], kneeL: [-0.45, 0, 0], kneeR: [-0.25, 0, 0], footL: [0.1, 0, 0], footR: [0.37, 0, 0], spine: [-0.1, 0.25, 0], head: [0.06, -0.2, 0], shoulderR: [0.7 + b * 0.04, 0, 0.3], elbowR: [1.1, 0, 0], shoulderL: [0.55, 0, -0.3], elbowL: [1.2, 0, 0] }, hy: -0.06 + b * 0.008 };
    }
    case 'crossbow': case 'shootBow': {
      const kick = name === 'shootBow' ? Math.exp(-t * 10) : 0;
      return { r: { shoulderR: [1.45 + kick * 0.25, 0, -0.1], elbowR: [0.3, 0, 0], shoulderL: [1.5 + kick * 0.2, 0, 0.35], elbowL: [0.45, 0, 0], spine: [-0.05 + kick * 0.1, -0.2, 0], chest: [0, -0.1, 0], head: [0.06, 0.18, 0], thighL: [0.25, 0, 0], kneeL: [-0.25, 0, 0] } };
    }
  }
}

/** Layer: lower body from `legs`, upper body from `arms`. */
export function layered(legs: Pose, arms: Pose): Pose {
  const r: Pose['r'] = {};
  for (const j of LOWER) if (legs.r[j]) r[j] = legs.r[j];
  for (const j of UPPER) if (arms.r[j]) r[j] = arms.r[j];
  // keep gait lean and counter-rotation on the spine, add the arm clip's own twist
  if (legs.r.spine && arms.r.spine) r.spine = [legs.r.spine[0] + arms.r.spine[0], legs.r.spine[1] * 0.5 + arms.r.spine[1], legs.r.spine[2] + arms.r.spine[2]];
  else if (legs.r.spine) r.spine = legs.r.spine;
  if (legs.r.chest && arms.r.chest) r.chest = [legs.r.chest[0] + arms.r.chest[0], legs.r.chest[1] * 0.4 + arms.r.chest[1], arms.r.chest[2]];
  if (legs.r.head && arms.r.head) r.head = [legs.r.head[0] * 0.5 + arms.r.head[0], legs.r.head[1] * 0.6 + arms.r.head[1], legs.r.head[2] + arms.r.head[2]];
  return { r, hy: legs.hy, hz: legs.hz, hx: legs.hx };
}

// ---------------- Quadrupeds (Hollow Hound, wolf, boar) ----------------
export type BeastKind = 'hound' | 'wolf' | 'boar';
export type BeastState = 'idle' | 'walk' | 'run' | 'windup' | 'bite' | 'charge' | 'hit' | 'die';
export class Hound {
  root = new THREE.Group();
  body = new THREE.Group();     // whole animal (pitch/roll/height)
  front = new THREE.Group();    // shoulders: front legs, neck
  rear = new THREE.Group();     // hips: back legs, tail
  legs: THREE.Group[] = []; knees: THREE.Group[] = [];
  neck = new THREE.Group(); jaw = new THREE.Group(); tail = new THREE.Group(); ears: THREE.Object3D[] = [];
  meshes: THREE.Mesh[] = [];
  private bodyMat: THREE.MeshStandardMaterial;
  private ph = Math.random() * TAU; private sniffT = 4 + Math.random() * 6; private lastState: BeastState = 'idle'; private st = 0;
  private bodyY: number;
  constructor(color = 0x3b3a44, public kind: BeastKind = 'hound') {
    this.bodyMat = mat(color);
    const boar = kind === 'boar', wolf = kind === 'wolf';
    const dark = mat(boar ? 0x2a1d14 : 0x1d1c22), eye = new THREE.MeshBasicMaterial({ color: boar ? 0xffb070 : wolf ? 0xf0d070 : 0xc8f04a });
    this.bodyY = boar ? 0.5 : 0.62;
    this.root.add(this.body); this.body.position.y = this.bodyY;
    this.front.position.z = -0.25; this.rear.position.z = 0.25; this.body.add(this.front, this.rear);
    const bw = boar ? 0.56 : wolf ? 0.38 : 0.42, bh = boar ? 0.5 : 0.36;
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.55), this.bodyMat); t1.position.z = -0.03; this.front.add(t1);
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(bw * 0.92, bh * 0.9, 0.55), this.bodyMat); t2.position.z = 0.03; this.rear.add(t2);
    const ribs = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.08, bh * 1.1, 0.4), this.bodyMat); ribs.position.set(0, 0.04, -0.06); this.front.add(ribs);
    if (kind === 'hound') for (let i = 0; i < 5; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), dark); sp.position.set(0, 0.25, -0.35 + i * 0.17); sp.rotation.x = 0.4; (i < 3 ? this.front : this.rear).add(sp); sp.position.z += i < 3 ? 0.25 : -0.25; }
    if (boar) for (let i = 0; i < 7; i++) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.1), dark); br.position.set(0, bh / 2 + 0.04, -0.3 + i * 0.1); (i < 4 ? this.front : this.rear).add(br); br.position.z += i < 4 ? 0.25 : -0.25; }
    if (wolf) { const ruff = new THREE.Mesh(new THREE.BoxGeometry(bw * 1.2, bh * 1.2, 0.22), mat(0x5a5248)); ruff.position.set(0, 0.04, -0.22); this.front.add(ruff); }
    this.neck.position.set(0, boar ? 0.02 : 0.12, -0.3); this.front.add(this.neck);
    const hd = boar ? [0.34, 0.32, 0.36] : [0.26, 0.24, 0.34];
    const head = new THREE.Mesh(new THREE.BoxGeometry(hd[0], hd[1], hd[2]), this.bodyMat); head.position.set(0, 0.06, -0.2); this.neck.add(head);
    const snout = new THREE.Mesh(new THREE.BoxGeometry(boar ? 0.22 : 0.18, boar ? 0.18 : 0.12, boar ? 0.22 : 0.22), boar ? mat(0x6a4a3a) : this.bodyMat); snout.position.set(0, boar ? -0.02 : 0.02, -0.45); this.neck.add(snout);
    if (boar) for (const tx of [-0.09, 0.09]) { const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.16, 4), mat(0xeee6cc)); tusk.position.set(tx, 0.02, -0.5); tusk.rotation.x = -0.6; this.neck.add(tusk); }
    this.jaw.position.set(0, -0.05, -0.32); this.neck.add(this.jaw);
    const jawM = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.24), dark); jawM.position.z = -0.1; this.jaw.add(jawM);
    for (const ex of [-0.08, 0.08]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eye); e.position.set(ex, 0.12, -0.36); this.neck.add(e); }
    for (const ex of [-0.09, 0.09]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, boar ? 0.1 : 0.16, 4), dark); ear.position.set(ex, 0.22, -0.12); this.neck.add(ear); this.ears.push(ear); }
    this.tail.position.set(0, 0.1, 0.27); this.rear.add(this.tail);
    const tm = limb(boar ? 0.18 : 0.45, boar ? 0.025 : 0.04, 0.015, wolf ? mat(0x6a6258) : this.bodyMat); tm.rotation.x = -2.2; this.tail.add(tm);
    const ll = boar ? [0.22, 0.2] : [0.3, 0.26];
    for (const [x, z, fr] of [[-0.15, -0.12, true], [0.15, -0.12, true], [-0.15, 0.14, false], [0.15, 0.14, false]] as [number, number, boolean][]) {
      const hip = new THREE.Group(); hip.position.set(x * (boar ? 1.3 : 1), -0.1, z); (fr ? this.front : this.rear).add(hip);
      hip.add(limb(ll[0], boar ? 0.09 : 0.07, 0.055, this.bodyMat));
      const knee = new THREE.Group(); knee.position.y = -ll[0]; hip.add(knee);
      knee.add(limb(ll[1], 0.045, 0.035, dark));
      this.legs.push(hip); this.knees.push(knee);
    }
    this.root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    this.meshes = bakeSkinned(this.root, [this.body, this.front, this.rear, this.neck, this.jaw, this.tail, ...this.legs, ...this.knees, ...this.ears]).meshes;
  }
  /** `t` = time in this state; `dt` and `speed` drive the gallop so paws keep pace with the ground. */
  animate(state: BeastState | 'run', t: number, dt = 1 / 60, speed = 0) {
    if (state !== this.lastState) { this.lastState = state; this.st = 0; } this.st += dt;
    const boar = this.kind === 'boar';
    const moving = state === 'run' || state === 'walk' || state === 'charge';
    const gallop = state === 'run' || state === 'charge';
    if (moving) this.ph += dt * TAU * Math.max(speed, 1.2) / (gallop ? (boar ? 1.5 : 1.9) : 1.0);
    const ph = this.ph;
    const a = gallop ? (boar ? 0.55 : 0.75) : 0.35;
    // rotary gallop: front pair and rear pair, each pair slightly out of step
    const off = gallop ? [0, 0.35, PI + 0.2, PI + 0.55] : [0, PI, PI, 0];
    const sv = (i: number) => S(ph + off[i]);
    this.body.rotation.set(0, 0, 0); this.front.rotation.set(0, 0, 0); this.rear.rotation.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0); this.jaw.rotation.x = 0; this.body.position.set(0, this.bodyY, 0);
    if (moving) {
      this.legs.forEach((l, i) => { l.rotation.x = sv(i) * a; this.knees[i].rotation.x = (i < 2 ? -1 : 1) * Math.max(0, S(ph + off[i] + (i < 2 ? -1.2 : 1.2))) * a * 1.1; });
      if (gallop) {
        // the spine flexes: shoulders and hips pitch against each other; the body rises in the flight phase
        this.front.rotation.x = S(ph) * 0.12; this.rear.rotation.x = -S(ph) * 0.14;
        this.body.position.y = this.bodyY + Math.max(0, S(ph * 1 - 0.4)) * 0.09;
        this.body.rotation.x = S(ph + 0.6) * 0.06; this.neck.rotation.x = -S(ph) * 0.18 + (state === 'charge' ? 0.35 : 0);
      } else { this.body.position.y = this.bodyY + Math.abs(S(ph)) * 0.025; this.neck.rotation.x = S(ph * 2) * 0.05 + 0.08; this.body.rotation.z = S(ph) * 0.03; }
      this.tail.rotation.y = S(ph * (gallop ? 1 : 0.5)) * 0.35; this.tail.rotation.x = gallop ? 0.3 : 0;
    } else {
      this.legs.forEach((l, i) => { l.rotation.x = 0; this.knees[i].rotation.x = 0; });
      const br = S(t * 2.2);
      this.front.rotation.x = br * 0.015; this.body.position.y = this.bodyY + br * 0.008;
      this.tail.rotation.y = S(t * 3) * 0.3; this.tail.rotation.x = 0;
    }
    if (state === 'idle') {
      // sniff the ground now and then, ears twitch
      this.sniffT -= dt;
      const sniff = this.sniffT < 1.6 && this.sniffT > 0 ? ease.bell(1 - this.sniffT / 1.6) : 0;
      if (this.sniffT <= -0.5) this.sniffT = 5 + Math.random() * 7;
      this.neck.rotation.x = 0.5 * sniff + S(t * 0.6) * 0.05; this.neck.rotation.y = S(t * 0.4) * 0.35 * (1 - sniff); this.jaw.rotation.x = sniff > 0 ? Math.max(0, S(t * 16)) * 0.08 : 0;
      this.ears.forEach((e, i) => { e.rotation.z = S(t * 9 + i) > 0.96 ? 0.4 : 0; });
    }
    if (state === 'windup') {
      const k = ease.outCubic(this.st * 3), tr = S(this.st * 35) * 0.02 * k;
      this.body.rotation.x = 0.18 * k; this.body.position.y = this.bodyY - 0.12 * k + tr; this.neck.rotation.x = -0.25 * k; this.jaw.rotation.x = 0.5 * k;
      this.rear.rotation.x = -0.15 * k; this.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -0.25 * k : 0.35 * k; this.knees[i].rotation.x = (i < 2 ? -0.3 : 0.5) * k; });
      this.tail.rotation.x = -0.4 * k;
    }
    if (state === 'bite') {
      const k = ease.outCubic(this.st * 7), rec = ease.inOut((this.st - 0.18) * 4);
      const e = k * (1 - rec);
      this.body.rotation.x = -0.25 * e; this.body.position.y = this.bodyY + 0.06 * e; this.body.position.z = -0.25 * e; this.neck.rotation.x = 0.25 * e; this.jaw.rotation.x = k < 0.6 ? 0.75 : 0.05 + 0.2 * rec;
      this.legs[0].rotation.x = 0.9 * e; this.legs[1].rotation.x = 0.8 * e; this.legs[2].rotation.x = -0.7 * e; this.legs[3].rotation.x = -0.6 * e;
    }
    if (state === 'hit') { const e = Math.exp(-this.st * 8); this.body.rotation.z = 0.32 * e * S(this.st * 20 + 1); this.body.position.z = 0.15 * e; this.neck.rotation.x = -0.3 * e; this.jaw.rotation.x = 0.4 * e; }
    if (state === 'die') {
      const fall = ease.inCubic(this.st / 0.45), kick = this.st > 0.45 && this.st < 1.6 ? S(this.st * 19) * Math.exp(-(this.st - 0.45) * 3) * 0.4 : 0;
      this.body.rotation.z = (PI / 2) * fall; this.body.position.y = this.bodyY - (this.bodyY - 0.22) * fall; this.neck.rotation.x = 0.4 * fall; this.jaw.rotation.x = 0.3 * fall;
      this.legs.forEach((l, i) => { l.rotation.x = 0.3 * fall + kick * (i % 2 ? 1 : -1); this.knees[i].rotation.x = 0; });
      this.tail.rotation.y = 0;
    }
  }
  tint(color: number, amount: number) { for (const m of this.meshes) { const mm = m.material as THREE.MeshStandardMaterial; if (mm.emissive) { mm.emissive.setHex(color); mm.emissiveIntensity = amount; } } }
}

// ---------------- Held props ----------------
export function makeCarbine(kind: 'carbine' | 'scattergun' | 'longrifle' = 'carbine'): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x6b4426), metal = mat(0x2c2f33, { metalness: 0.6, roughness: 0.4 }), brass = mat(0xb08a3c, { metalness: 0.7, roughness: 0.35 });
  if (kind !== 'carbine') {
    // v0.9: the Breaker scattergun (two short fat barrels side by side) and the Spire long rifle (long barrel, scope, bolt)
    const sg = kind === 'scattergun', dark = mat(sg ? 0x4a2e1a : 0x3a2a1a);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, sg ? 0.12 : 0.1, 0.32), sg ? dark : wood); stock.position.set(0, -0.02, 0.2); g.add(stock);
    const body = new THREE.Mesh(new THREE.BoxGeometry(sg ? 0.08 : 0.06, 0.08, sg ? 0.2 : 0.36), metal); body.position.set(0, 0, sg ? -0.04 : -0.1); g.add(body);
    if (sg) {
      // the barrels and forend hinge down at the breech for loading (group 'barrels', pivot at the hinge pin)
      const bg = new THREE.Group(); bg.name = 'barrels'; bg.position.set(0, -0.03, -0.12); g.add(bg);
      for (const x of [-0.021, 0.021]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.021, 0.46, 8), metal); b.rotation.x = Math.PI / 2; b.position.set(x, 0.05, -0.25); bg.add(b); }
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.22), dark); fore.position.set(0, 0.01, -0.12); bg.add(fore);
      const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.09, 6), brass); hinge.rotation.z = Math.PI / 2; hinge.position.set(0, -0.03, -0.12); hinge.name = 'lever'; g.add(hinge);
    } else {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.78, 8), metal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.022, -0.62); g.add(barrel);
      const fore = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.42), wood); fore.position.set(0, -0.01, -0.42); g.add(fore);
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.3, 8), metal); scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.085, -0.1); g.add(scope);
      for (const z of [-0.24, 0.04]) { const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 8), brass); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.085, z); g.add(lens); }
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.016, 6, 4), brass); bolt.position.set(0.05, 0.02, 0.02); bolt.name = 'lever'; g.add(bolt);
    }
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), metal); mag.position.set(0, -0.08, -0.08); mag.name = 'mag'; mag.visible = false; g.add(mag);
    const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle';
    if (sg) { muzzle.position.set(0, 0.05, -0.5); g.getObjectByName('barrels')!.add(muzzle); } else { muzzle.position.set(0, 0.022, -1.02); g.add(muzzle); }
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    return g;
  }
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.3), wood); stock.position.set(0, -0.02, 0.2); g.add(stock);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.32), metal); body.position.set(0, 0, -0.08); g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.5, 8), metal); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.025, -0.48); g.add(barrel);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.3), wood); guard.position.set(0, -0.015, -0.34); g.add(guard);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 4, 10), brass); band.position.set(0, 0.015, -0.42); g.add(band);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.02), brass); sight.position.set(0, 0.06, -0.68); g.add(sight);
  const lever = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 8, Math.PI * 1.3), metal); lever.position.set(0, -0.07, -0.02); lever.rotation.y = Math.PI / 2; lever.name = 'lever'; g.add(lever);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.06), metal); mag.position.set(0, -0.08, -0.08); mag.name = 'mag'; mag.visible = false; g.add(mag);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.025, -0.74); muzzle.name = 'muzzle'; g.add(muzzle);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}
export function makeStaff(): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, 1.5, 7), mat(0x5a3b22)); shaft.position.y = 0.2; g.add(shaft);
  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.18, 7), mat(0x8a2e2e)); wrap.position.y = 0.05; g.add(wrap);
  const prong = mat(0x9a8a5a, { metalness: 0.6 });
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.16, 4), prong); const a = i * 2.094; p.position.set(Math.cos(a) * 0.04, 0.98, Math.sin(a) * 0.04); p.rotation.z = Math.cos(a) * 0.3; p.rotation.x = -Math.sin(a) * 0.3; g.add(p); }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.06), new THREE.MeshStandardMaterial({ color: 0x7fe0ff, emissive: 0x3fa8ff, emissiveIntensity: 1.4, flatShading: true }));
  crystal.position.y = 1.02; crystal.name = 'crystal'; g.add(crystal);
  const tip = new THREE.Object3D(); tip.position.y = 1.05; tip.name = 'tip'; g.add(tip);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}
export function makeClub(): THREE.Group {
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.75, 6), mat(0x4e3622)); h.position.y = -0.3; g.add(h);
  for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.07, 4), mat(0x777777, { metalness: 0.5 })); n.position.set(Math.cos(i * 1.57) * 0.06, -0.58, Math.sin(i * 1.57) * 0.06); n.rotation.z = Math.cos(i * 1.57) * 1.5; n.rotation.x = -Math.sin(i * 1.57) * 1.5; g.add(n); }
  g.rotation.x = Math.PI; return g;
}
export function makeLoaf(): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.08, 3, 6), mat(0xc9904a)); m.rotation.z = Math.PI / 2; return m;
}
/** Tools held in the right hand: handle runs down -Y from the grip. */
export function makeTool(kind: 'pick' | 'axe' | 'broom' | 'rod' | 'mug' | 'lute' | 'spoon' | 'shovel' | 'hammer' | 'blade' | 'greatsword' | 'rake' | 'staff' | 'pistol' | 'cutlass' | 'netneedle' | 'rope'): THREE.Group {
  const g = new THREE.Group(), wood = mat(0x6b4a2c), iron = mat(0x55595e, { metalness: 0.6, roughness: 0.45 });
  const handle = (len: number) => { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, len, 6), wood); h.position.y = len * 0.35; g.add(h); return len; };
  if (kind === 'pick') { const L = handle(0.8); const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.05), iron); head.position.y = L * 0.82; g.add(head); for (const sx of [-1, 1]) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), iron); tip.rotation.z = -sx * Math.PI / 2; tip.position.set(sx * 0.29, L * 0.82, 0); g.add(tip); } }
  if (kind === 'axe') { const L = handle(0.75); const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.2), iron); head.position.set(0, L * 0.8, -0.06); g.add(head); }
  if (kind === 'blade' || kind === 'greatsword') { // v0.8: a leaf-shaped bronze sword (wights), King Orm's greatsword
    const big = kind === 'greatsword', bronze = mat(big ? 0x9a7a3a : 0x7a6a3a, { metalness: 0.55, roughness: 0.5 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, big ? 0.34 : 0.14, 6), mat(0x3a2a1a)); grip.position.y = big ? -0.05 : 0.02; g.add(grip);
    const guard = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.3 : 0.16, 0.035, 0.05), bronze); guard.position.y = big ? 0.13 : 0.1; g.add(guard);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.09 : 0.06, big ? 1.25 : 0.62, 0.014), bronze); bl.position.y = big ? 0.78 : 0.42; bl.scale.x = 1; g.add(bl);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(big ? 0.045 : 0.03, big ? 0.18 : 0.1, 4), bronze); tip.position.y = big ? 1.49 : 0.78; tip.scale.z = 0.3; g.add(tip);
  }
  if (kind === 'pistol') { // v0.9: a pistoleer's flintlock, held out at arm's length (barrel along +Y like the other tools)
    const steel = mat(0x3a3a3e, { metalness: 0.7, roughness: 0.35 });
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.05), wood); grip.position.set(0, 0.0, 0.03); grip.rotation.x = 0.5; g.add(grip);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 6), steel); barrel.position.y = 0.17; g.add(barrel);
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.04), steel); lock.position.set(0.02, 0.06, 0.0); g.add(lock);
  }
  if (kind === 'cutlass') { // v0.9: a smuggler's cutlass: curved steel and a basket guard
    const steel = mat(0x8a8e94, { metalness: 0.7, roughness: 0.35 });
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.13, 6), wood); grip.position.y = 0.02; g.add(grip);
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.008, 4, 8, Math.PI), steel); guard.position.set(0, 0.06, -0.02); guard.rotation.y = Math.PI / 2; g.add(guard);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05 - i * 0.008, 0.22, 0.01), steel); b.position.set(-i * 0.018, 0.2 + i * 0.2, 0); b.rotation.z = i * 0.12; g.add(b); }
  }
  if (kind === 'netneedle') { const n = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 0.008), wood); n.position.y = 0.06; g.add(n); }
  if (kind === 'rope') { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.6, 5), mat(0x9a8a62)); r.rotation.x = Math.PI / 2; r.position.set(0, 0, -0.7); g.add(r); }
  if (kind === 'rake') { const L = handle(1.4); const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.05), iron); head.position.y = -0.18; g.add(head); for (let i = 0; i < 6; i++) { const tn = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.1, 0.015), iron); tn.position.set(-0.18 + i * 0.072, -0.24, 0); g.add(tn); } void L; }
  if (kind === 'staff') { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 1.6, 6), mat(0x2a2018)); s.position.y = 0.3; g.add(s); const knot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), mat(0x2a2018)); knot.position.y = 1.1; g.add(knot); }
  if (kind === 'hammer') { const L = handle(0.4); const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.07), iron); head.position.y = L * 0.82; g.add(head); }
  if (kind === 'shovel') { const L = handle(1.0); const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.02), iron); blade.position.y = -0.15; g.add(blade); void L; }
  if (kind === 'broom') { const L = handle(1.2); const b = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), mat(0xc9a85a)); b.position.y = -0.2; b.rotation.x = Math.PI; g.add(b); void L; }
  if (kind === 'rod') { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.016, 1.7, 5), wood); r.position.set(0, 0.55, -0.45); r.rotation.x = -0.9; g.add(r); const line = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 1.4, 3), mat(0xdddddd)); line.position.set(0, 0.6, -1.35); line.rotation.x = 0.25; line.name = 'line'; g.add(line); }
  if (kind === 'mug') { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.09, 8), mat(0x8a6a4a)); m.position.y = 0.01; g.add(m); const foam = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.012, 8), mat(0xf0e8d0)); foam.position.y = 0.06; g.add(foam); }
  if (kind === 'spoon') { const L = handle(0.45); void L; }
  if (kind === 'lute') { const b = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), mat(0x9a6a3a)); b.scale.set(1, 1.2, 0.45); b.position.set(0.05, 0.1, -0.12); g.add(b); const neck = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.4), mat(0x5a3a1a)); neck.position.set(-0.12, 0.12, -0.12); neck.rotation.y = -1.2; g.add(neck); }
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}
/** A bandit's crossbow: held like a carbine (stock at the shoulder, -Z forward). */
export function makeCrossbow(): THREE.Group {
  const g = new THREE.Group(), wood = mat(0x5a3a22), iron = mat(0x4a4e54, { metalness: 0.6 });
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.6), wood); stock.position.z = -0.15; g.add(stock);
  const bow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.04), iron); bow.position.z = -0.42; g.add(bow);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), mat(0x8a7a5a)); bolt.rotation.x = Math.PI / 2; bolt.position.set(0, 0.04, -0.3); bolt.name = 'bolt'; g.add(bolt);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  return g;
}

/** Six-shot revolver. Barrel along -Z, grip down along -Y, origin at the grip top (where the hand holds). */
export function makeRevolver(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0x3a3d42, { metalness: 0.7, roughness: 0.35 }), wood = mat(0x6b4426), brass = mat(0xb08a3c, { metalness: 0.7, roughness: 0.35 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.12), steel); frame.position.set(0, 0.03, -0.03); g.add(frame);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.06, 6), steel); cyl.rotation.x = Math.PI / 2; cyl.position.set(0, 0.035, -0.06); cyl.name = 'cylinder'; g.add(cyl);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.17, 8), steel); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.048, -0.17); g.add(barrel);
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.16), steel); rib.position.set(0, 0.062, -0.16); g.add(rib);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.014, 0.01), brass); sight.position.set(0, 0.07, -0.245); g.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.045), wood); grip.position.set(0, -0.03, 0.025); grip.rotation.x = -0.35; g.add(grip);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 4, 8, Math.PI), steel); guard.position.set(0, -0.005, -0.02); guard.rotation.set(0, Math.PI / 2, Math.PI); g.add(guard);
  const hammer = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.025, 0.015), steel); hammer.position.set(0, 0.07, 0.03); hammer.rotation.x = -0.5; hammer.name = 'hammer'; g.add(hammer);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.048, -0.26); muzzle.name = 'muzzle'; g.add(muzzle);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
  g.scale.setScalar(1.25);
  return g;
}

/** Two-handed revolver poses: both arms converge in front of the chest (Weaver-style grip). */
export function pistolPose(kind: 'aim' | 'shoot' | 'reload' | 'low' | 'draw', t: number, pitch = 0): Pose {
  const kick = kind === 'shoot' ? Math.exp(-t * 14) * Math.min(1, t * 60) : 0;
  const rl = kind === 'reload' ? ease.bell(Math.min(1, t / 1.8)) : 0;
  const low = kind === 'low' ? 1 : kind === 'draw' ? 1 - ease.outBack(t / 0.3) : 0;
  const up = 1.48 + pitch * 0.85 - low * 0.75 - rl * 0.55 + kick * 0.32;
  return { r: {
    shoulderR: [up, 0, -0.42 + low * 0.15], elbowR: [0.12 + rl * 0.5 + kick * 0.1, 0, 0], handR: [-kick * 0.35, 0, 0],
    shoulderL: [up - 0.04 + rl * 0.1, 0, 0.52 - low * 0.15 - rl * 0.1], elbowL: [0.28 + rl * 0.9, 0, 0], handL: [0, 0, -0.4],
    chest: [-kick * 0.04, -0.06, 0], spine: [-0.04 - kick * 0.08, 0, 0], head: [-0.05 + pitch * 0.4 - rl * 0.35, 0.04, 0],
  } };
}
/** Carbine at the shoulder, following the look pitch. */
export function riflePose(kind: 'aim' | 'shoot' | 'reload' | 'low', t: number, pitch = 0): Pose {
  const kick = kind === 'shoot' ? Math.exp(-t * 11) * Math.min(1, t * 60) : 0, lever = kind === 'shoot' && t > 0.18 ? ease.bell((t - 0.18) / 0.3) : 0;
  const rl = kind === 'reload' ? ease.bell(Math.min(1, t / 2.4)) : 0, low = kind === 'low' ? 1 : 0;
  return { r: {
    shoulderR: [1.25 + pitch * 0.8 - low * 0.6 + kick * 0.2, 0, 0.12], elbowR: [0.55 - kick * 0.3 + lever * 0.3, 0, 0],
    shoulderL: [1.45 + pitch * 0.8 - low * 0.6 - rl * 0.5, 0, -0.5 + rl * 0.25], elbowL: [0.4 + rl * 0.9, 0, 0],
    spine: [-0.05 - kick * 0.15 + low * 0.05, -0.18, 0], chest: [0, -0.12, 0], head: [0.05 + pitch * 0.35 - rl * 0.3, 0.15, 0],
  } };
}
