// v0.9: the crab rig (docs/gdd/saltway.md §3.3, §3.5): a shell on six legs and two claws. Shore crabs and the
// Wreck-Mother share it at different scales. Legs move in two alternating tripods; crabs travel sideways, so the
// legs on the leading side reach and the trailing side pushes. Built from parts, then baked into one skinned
// mesh (ADR-017).
import * as THREE from 'three';
import { bakeSkinned } from './bake';

const TAU = Math.PI * 2, S = Math.sin, C = Math.cos;
const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
const mat = (c: number) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.05, flatShading: true });
const seg = (len: number, r1: number, r2: number, m: THREE.Material, axis: 'x' | 'y' = 'x') => {
  const g = new THREE.CylinderGeometry(r2, r1, len, 5); g.translate(0, len / 2, 0);
  if (axis === 'x') g.rotateZ(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh;
};

export type CrabState = 'idle' | 'walk' | 'windup' | 'strike' | 'hit' | 'die' | 'rear' | 'slam' | 'sweep' | 'spray' | 'charge' | 'call';
interface Leg { hip: THREE.Group; knee: THREE.Group; side: number; i: number; tripod: number }
interface Claw { arm: THREE.Group; fore: THREE.Group; jaw: THREE.Group; side: number }

export class Crab {
  root = new THREE.Group();
  body = new THREE.Group();
  meshes: THREE.Mesh[] = [];
  legs: Leg[] = []; claws: Claw[] = []; stalks: THREE.Group[] = [];
  private ph = Math.random() * TAU; private st = 0; private lastState: CrabState = 'idle'; private snap = 0;
  readonly baseY: number;
  constructor(color = 0xa8503a, public size = 1, under = 0xd8b894) {
    const shell = mat(color), belly = mat(under), dark = mat(0x2a1a14), tip = mat(0x3a2a22);
    const s = size;
    this.baseY = 0.3 * s;
    this.root.add(this.body); this.body.position.y = this.baseY;
    // the shell: a wide, flat dome with a ridge and a frill of points at the front; the belly plate underneath
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.36 * s, 10, 6, 0, TAU, 0, Math.PI / 2), shell); top.scale.set(1.15, 0.5, 0.82); top.castShadow = true; this.body.add(top);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * s, 0.3 * s, 0.08 * s, 10), belly); plate.scale.set(1.15, 1, 0.82); plate.position.y = -0.03 * s; plate.castShadow = true; this.body.add(plate);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.05 * s, 0.4 * s), shell); ridge.position.set(0, 0.17 * s, 0.02 * s); this.body.add(ridge);
    for (let i = -2; i <= 2; i++) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s, 0.09 * s, 4), shell); p.rotation.x = -Math.PI / 2; p.position.set(i * 0.09 * s, 0.05 * s, -0.3 * s); this.body.add(p); }
    if (s > 2) for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.18 + (i % 4) * 0.04; const b = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.05 * s, 5), mat(0xb8b0a0)); b.position.set(Math.cos(a) * r * s, 0.14 * s - r * 0.12 * s, Math.sin(a) * r * 0.7 * s); this.body.add(b); }  // barnacles on the old one
    // eyes on stalks
    for (const sx of [-1, 1]) {
      const st = new THREE.Group(); st.position.set(sx * 0.07 * s, 0.1 * s, -0.27 * s); this.body.add(st); this.stalks.push(st);
      st.add(seg(0.1 * s, 0.014 * s, 0.012 * s, shell, 'y'));
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026 * s, 6, 4), dark); eye.position.y = 0.11 * s; st.add(eye);
    }
    // six legs, three a side: hip (raise and swing) and knee (bend down to the ground)
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
      const hip = new THREE.Group(); hip.position.set(side * 0.3 * s, -0.01 * s, (-0.1 + i * 0.13) * s); hip.rotation.y = side * (-0.35 + i * 0.35) * -1; this.body.add(hip);
      const up = seg(0.3 * s, 0.035 * s, 0.03 * s, shell); if (side < 0) up.rotation.y = Math.PI; hip.add(up);
      const knee = new THREE.Group(); knee.position.set(side * 0.3 * s, 0, 0); hip.add(knee);
      const low = seg(0.46 * s, 0.028 * s, 0.012 * s, tip, 'y'); low.rotation.z = Math.PI; knee.add(low);   // points down
      this.legs.push({ hip, knee, side, i, tripod: (i + (side > 0 ? 1 : 0)) % 2 });
    }
    // two claws at the front: arm (shoulder), forearm (elbow), and the moving jaw of the pincer
    for (const side of [-1, 1]) {
      const big = side > 0 ? 1.15 : 0.95;            // one claw bigger than the other, as with real crabs
      const arm = new THREE.Group(); arm.position.set(side * 0.24 * s, 0.02 * s, -0.24 * s); this.body.add(arm);
      const a1 = seg(0.2 * s, 0.045 * s, 0.04 * s, shell); a1.rotation.y = side > 0 ? 0.9 : Math.PI - 0.9; arm.add(a1);
      const fore = new THREE.Group(); fore.position.set(side * 0.12 * s, 0.02 * s, -0.16 * s); arm.add(fore);
      const palm = new THREE.Mesh(new THREE.BoxGeometry(0.13 * s * big, 0.1 * s * big, 0.2 * s * big), shell); palm.position.set(0, 0, -0.1 * s * big); palm.castShadow = true; fore.add(palm);
      const finger = new THREE.Mesh(new THREE.ConeGeometry(0.04 * s * big, 0.2 * s * big, 4), tip); finger.rotation.x = -Math.PI / 2; finger.position.set(side * 0.02 * s, -0.02 * s * big, -0.28 * s * big); fore.add(finger);
      const jaw = new THREE.Group(); jaw.position.set(-side * 0.02 * s, 0.035 * s * big, -0.19 * s * big); fore.add(jaw);
      const jm = new THREE.Mesh(new THREE.ConeGeometry(0.035 * s * big, 0.2 * s * big, 4), tip); jm.rotation.x = -Math.PI / 2; jm.position.z = -0.09 * s * big; jaw.add(jm);
      this.claws.push({ arm, fore, jaw, side });
    }
    this.root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    const joints: THREE.Object3D[] = [this.body, ...this.stalks, ...this.legs.flatMap(l => [l.hip, l.knee]), ...this.claws.flatMap(c => [c.arm, c.fore, c.jaw])];
    this.meshes = bakeSkinned(this.root, joints, 0.25 * s).meshes;
  }

  /** `t` = time in this state; `speed` m/s along `moveDir` (radians from facing: ±π/2 is sideways). */
  animate(state: CrabState, t: number, dt: number, speed: number, moveDir = Math.PI / 2) {
    if (state !== this.lastState) { this.lastState = state; this.st = 0; } this.st += dt;
    const s = this.size, moving = speed > 0.15 && (state === 'walk' || state === 'charge' || state === 'idle');
    // gait: phase follows distance, the stride shrinks as the crab grows
    this.ph += dt * (moving ? 2 + speed * 3.4 / Math.sqrt(s) : 0.6);
    const side = Math.sin(moveDir), fwd = Math.cos(moveDir);
    let bodyY = this.baseY, pitch = 0, roll = 0, yawW = 0;
    const lift = (tri: number) => Math.max(0, S(this.ph + tri * Math.PI));
    for (const L of this.legs) {
      const ph = this.ph + L.tripod * Math.PI, up = moving ? Math.max(0, S(ph)) : 0, sw = moving ? C(ph) : 0;
      // the leading side reaches out and lifts; the trailing side bends and pushes
      const lead = side * L.side;
      L.hip.rotation.z = L.side * (0.42 + up * 0.45 + lead * sw * 0.18);
      L.hip.rotation.x = sw * fwd * 0.35;
      L.knee.rotation.z = L.side * (-0.1 + up * 0.3 - lead * sw * 0.15);
    }
    if (moving) { bodyY += (lift(0) + lift(1)) * 0.012 * s; roll = side * 0.05 + S(this.ph * 2) * 0.03; pitch = fwd * 0.04; }
    // claws: idle they fold in front of the face and twitch open; in combat they come up
    let armUp = 0.15, armOut = 0.25, foreIn = 0.9, open = 0.15 + Math.max(0, S(this.ph * 1.7 + 1)) * 0.2;
    const k = clamp01;
    switch (state) {
      case 'windup': armUp = 0.15 + k(t / 0.3) * 0.5; armOut = 0.6; foreIn = 0.5; open = 0.9; pitch += k(t / 0.3) * 0.12; break;
      case 'strike': { const e = k(t / 0.12); armUp = 0.65 - e * 0.7; armOut = 0.6 - e * 0.5; foreIn = 0.5 - e * 0.4; open = 0.9 * (1 - k(t / 0.06)); pitch -= e * 0.15; this.snap = 1; break; }
      case 'hit': pitch += 0.2 * Math.max(0, 1 - t * 4); roll += 0.15 * Math.max(0, 1 - t * 4); armUp = 0.5; open = 0.5; break;
      case 'rear': { const e = k(t / 0.5); pitch = 0.95 * e; bodyY += 0.35 * s * e; armUp = 0.3 + 1.0 * e; armOut = 0.7; foreIn = 0.2; open = 1; roll += S(t * 30) * 0.02 * e; break; }
      case 'slam': { const e = k(t / 0.14); pitch = 0.95 * (1 - e) - 0.28 * e; bodyY += 0.35 * s * (1 - e) - 0.05 * s * e; armUp = 1.3 - e * 1.6; armOut = 0.5; foreIn = 0.15; open = 0.2; break; }
      case 'sweep': { const e = k(t / 0.35); armUp = 0.35; armOut = 1.2 - e * 2.6; foreIn = 0.3; open = 0.8 * (1 - e); yawW = 0.3 - e * 0.6; break; }
      case 'spray': pitch = -0.18; bodyY -= 0.06 * s; armUp = 0.6; armOut = 0.9; foreIn = 0.2; open = 0.3; roll += S(t * 40) * 0.015; break;
      case 'call': armUp = 1.0 + S(t * 9) * 0.25; armOut = 0.9; open = 0.6 + S(t * 14) * 0.4; pitch = 0.25; break;
      case 'die': { const e = k(t / 0.8); roll = e * 0.4; bodyY = this.baseY * (1 - e * 0.6); armUp = -0.2 * e; open = 0; for (const L of this.legs) { L.hip.rotation.z = L.side * (0.42 - e * 0.6); L.knee.rotation.z = L.side * (-0.1 - e * 1.2); } break; }
    }
    this.snap = Math.max(0, this.snap - dt * 4);
    for (const c of this.claws) {
      c.arm.rotation.set(armUp, -c.side * armOut * 0.6, 0);
      c.fore.rotation.set(0.1, c.side * foreIn * (state === 'sweep' && c.side > 0 ? 0.3 : 1), 0);
      c.jaw.rotation.x = open * 0.7;
    }
    if (state === 'sweep') { const sweepClaw = this.claws[1]; sweepClaw.arm.rotation.y = -1.0 + k(t / 0.35) * 2.4; }
    this.body.position.y = bodyY; this.body.rotation.set(pitch, yawW, roll);
    for (const st of this.stalks) st.rotation.set(-0.15 + S(this.ph * 0.9 + st.position.x * 40) * 0.12, 0, st.position.x > 0 ? -0.15 : 0.15);
  }
  tint(color: number, amount: number) { for (const m of this.meshes) { const mm = m.material as THREE.MeshStandardMaterial; if (mm.emissive) { mm.emissive.setHex(color); mm.emissiveIntensity = amount; } } }
}
