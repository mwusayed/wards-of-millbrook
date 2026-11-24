// First-person arms and held weapon, parented to the camera.
// v0.7: everything is driven by springs and eased curves instead of linear offsets. The weapon lags behind
// the view and overshoots a little (inertia), bobs in a figure-eight in step with the feet, dips when you
// land, drops into a run carry when sprinting, and every action has anticipation and follow-through.
import * as THREE from 'three';
import { makeRevolver, makeStaff, makeLoaf, makeCarbine, makeTool, ease } from './rig';

export type FPAction = 'none' | 'shoot' | 'reload' | 'cast' | 'melee' | 'interact' | 'eat' | 'drink' | 'wash' | 'write' | 'fish' | 'reel' | 'mine' | 'inspect';
export type Firearm = 'revolver' | 'carbine' | 'scattergun' | 'longrifle';
const skinM = new THREE.MeshStandardMaterial({ color: 0xd9a77a, roughness: 0.8, flatShading: true });
const sleeveM = new THREE.MeshStandardMaterial({ color: 0x3d4f63, roughness: 0.9, flatShading: true });
const brassM = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.7, roughness: 0.3 });

function arm(): THREE.Group {
  const g = new THREE.Group();
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 7), sleeveM); sleeve.rotation.x = Math.PI / 2; sleeve.position.z = 0.21; g.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.053, 0.053, 0.04, 7), new THREE.MeshStandardMaterial({ color: 0x2a3644, roughness: 0.9, flatShading: true })); cuff.rotation.x = Math.PI / 2; cuff.position.z = 0.02; g.add(cuff);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.1), skinM); hand.position.z = -0.02; g.add(hand);
  const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.06), skinM); thumb.position.set(-0.045, 0.02, -0.03); g.add(thumb);
  return g;
}
/** A damped spring on one number. */
class Sp { x = 0; v = 0; constructor(public w = 12, public z = 0.6) {}
  step(target: number, dt: number) { const n = Math.max(1, Math.ceil(dt * this.w / 0.3)), h = dt / n; for (let i = 0; i < n; i++) { this.v += (-(this.w * this.w) * (this.x - target) - 2 * this.z * this.w * this.v) * h; this.x += this.v * h; } return this.x; }
  kick(v: number) { this.v += v; } }

export class Viewmodel {
  root = new THREE.Group();
  right = arm(); left = arm();
  carbine = makeRevolver(); staff = makeStaff(); loaf = makeLoaf();
  long = new THREE.Group(); private longs = { carbine: makeCarbine('carbine'), scattergun: makeCarbine('scattergun'), longrifle: makeCarbine('longrifle') }; rod = makeTool('rod'); pick = makeTool('pick');
  firearm: Firearm = 'revolver';
  weapon: 'carbine' | 'staff' | 'none' = 'carbine';
  action: FPAction = 'none'; t = 0; dur = 0;
  bobT = 0; sway = new THREE.Vector2(); spellColor = new THREE.Color(0xff7a2a);
  /** Visual camera kick (radians of pitch, roll) from recoil and hits; main adds it to the camera. */
  kickPitch = 0; kickRoll = 0;
  private flash: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>; private flashLight: THREE.PointLight;
  private flash2: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  // feel state
  private swX = new Sp(11, 0.5); private swY = new Sp(11, 0.5); private swR = new Sp(9, 0.55);
  private rcZ = new Sp(20, 0.55); private rcP = new Sp(18, 0.5); private rcR = new Sp(16, 0.45);
  private camP = new Sp(16, 0.7); private camR = new Sp(14, 0.6);
  private landY = new Sp(13, 0.5); private hurtX = new Sp(16, 0.4); private hurtY = new Sp(16, 0.4);
  private sprintK = 0; private bobA = 0; private phase = 0; private onGround = true; private strafe = 0; private moveFwd = 0;
  private raise = 1; private raiseTarget = 1; private shownWeapon: 'carbine' | 'staff' | 'none' = 'carbine'; private pendingWeapon: 'carbine' | 'staff' | 'none' | null = null;
  private idleT = 0; private shells: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = []; private shellPool: THREE.Mesh[] = [];
  private ejected = false; private loaded = 0;
  /** v0.9.1: a cartridge held in the left hand while loading. */
  private round = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6), brassM);
  constructor(camera: THREE.Camera) {
    camera.add(this.root);
    this.root.add(this.right, this.left);
    this.right.add(this.carbine); this.carbine.position.set(0, 0.03, -0.05); this.carbine.scale.setScalar(1.15);
    this.right.add(this.long); this.long.position.set(0, 0.02, 0.12); this.long.scale.setScalar(0.95); this.long.visible = false;
    this.right.add(this.staff); this.staff.position.set(0, -0.02, 0); this.staff.rotation.x = -1.25;
    this.right.add(this.rod); this.rod.rotation.set(0.2, 0, 0); this.rod.visible = false;
    this.right.add(this.pick); this.pick.rotation.set(-0.3, 0, 0); this.pick.position.set(0, -0.05, 0); this.pick.visible = false;
    this.left.add(this.round); this.round.rotation.x = Math.PI / 2; this.round.position.set(0.0, 0.03, -0.07); this.round.visible = false;
    this.left.add(this.loaf); this.loaf.position.set(0, 0.04, -0.08); this.loaf.visible = false;
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthWrite: false }));
    this.flash2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0, depthWrite: false }));
    const muzzle = this.carbine.getObjectByName('muzzle')!; muzzle.add(this.flash);
    for (const m of Object.values(this.longs)) { this.long.add(m); m.visible = false; } this.longs.carbine.visible = true;
    this.longs.carbine.getObjectByName('muzzle')!.add(this.flash2); this.flash2.scale.setScalar(1.5);
    // The muzzle light hangs off the camera, not the viewmodel: hiding the viewmodel (third person, sitting) must not
    // change the number of lights in the scene, or every lit shader recompiles (v0.8 fix, see docs/ADR.md ADR-004).
    this.flashLight = new THREE.PointLight(0xffb060, 0, 6, 2); camera.add(this.flashLight); this.flashLight.position.set(0.05, -0.1, -0.7);
    for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.03, 5), brassM); m.visible = false; this.root.add(m); this.shellPool.push(m); }
    this.root.traverse(o => { (o as THREE.Mesh).castShadow = false; o.renderOrder = 10; });
    this.setWeapon('carbine', true);
  }
  setFirearm(f: Firearm) {
    this.firearm = f;
    if (f !== 'revolver') { for (const [k, m] of Object.entries(this.longs)) m.visible = k === f; this.longModel().getObjectByName('muzzle')!.add(this.flash2); }
    this.applyVisible();
  }
  /** v0.9: the long gun in hand (carbine, scattergun or long rifle). */
  private longModel(): THREE.Group { return this.longs[this.firearm === 'revolver' ? 'carbine' : this.firearm]; }
  private get isLong() { return this.firearm !== 'revolver'; }
  /** Switch what is in hand; the old item is lowered out of view and the new one raised. */
  setWeapon(w: 'carbine' | 'staff' | 'none', instant = false) {
    this.weapon = w;
    if (instant) { this.shownWeapon = w; this.raise = w === 'none' ? 0 : 1; this.raiseTarget = this.raise; this.pendingWeapon = null; this.applyVisible(); return; }
    if (w === this.shownWeapon && this.raiseTarget === 1) return;
    if (this.shownWeapon === 'none' || this.raise < 0.05) { this.shownWeapon = w; this.raise = 0; this.raiseTarget = w === 'none' ? 0 : 1; this.pendingWeapon = null; }
    else { this.pendingWeapon = w; this.raiseTarget = 0; }
    this.applyVisible();
  }
  private applyVisible() {
    const w = this.shownWeapon;
    this.carbine.visible = w === 'carbine' && this.firearm === 'revolver'; this.long.visible = w === 'carbine' && this.isLong; this.staff.visible = w === 'staff';
  }
  play(a: FPAction, dur: number) {
    this.action = a; this.t = 0; this.dur = dur; this.idleT = 0; this.ejected = false; this.loaded = 0;
    if (a === 'shoot') { const big = this.isLong; this.rcZ.kick(big ? 1.6 : 1.1); this.rcP.kick(big ? 9 : 7); this.rcR.kick((Math.random() - 0.5) * 3); this.camP.kick(big ? 1.6 : 1.0); this.camR.kick((Math.random() - 0.5) * 0.6); }
    if (a === 'melee') this.camR.kick(-0.5);
  }
  busy() { return this.action !== 'none' && this.t < this.dur; }
  staffTip(): THREE.Vector3 { return this.staff.getObjectByName('tip')!.getWorldPosition(new THREE.Vector3()); }
  muzzle(): THREE.Vector3 { return (this.isLong ? this.longModel() : this.carbine).getObjectByName('muzzle')!.getWorldPosition(new THREE.Vector3()); }
  /** Feed the walk: gait phase (radians), on the ground or not, sprinting, sideways and forward input (-1..1). */
  feel(phase: number, onGround: boolean, sprint: boolean, strafe: number, fwd: number) { this.phase = phase; this.onGround = onGround; this.sprintK += ((sprint ? 1 : 0) - this.sprintK) * 0.12; this.strafe = strafe; this.moveFwd = fwd; }
  land(speed: number) { this.landY.kick(-Math.min(9, speed) * 0.09); this.camP.kick(-Math.min(9, speed) * 0.05); }
  hurt(k = 1) { this.hurtX.kick((Math.random() - 0.5) * 2.4 * k); this.hurtY.kick(-1.6 * k); this.camP.kick(-1.2 * k); this.camR.kick((Math.random() - 0.5) * 2.2 * k); }
  private ejectShells(at: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) { const m = this.shellPool.find(x => !x.visible); if (!m) break; m.visible = true; m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02)); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); this.shells.push({ m, v: new THREE.Vector3(0.15 + Math.random() * 0.3, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2), life: 0.9 }); }
  }
  update(dt: number, speed: number, look: THREE.Vector2) {
    this.t += dt;
    if (this.action !== 'none' && this.t >= this.dur) this.action = 'none';
    this.idleT = this.action === 'none' && speed < 0.1 ? this.idleT + dt : 0;
    if (this.idleT > 14 && this.weapon !== 'none') { this.play('inspect', 2.6); }
    // raise / lower when switching
    this.raise += Math.sign(this.raiseTarget - this.raise) * Math.min(Math.abs(this.raiseTarget - this.raise), dt * (this.raiseTarget > this.raise ? 3.2 : 4.5));
    if (this.raise <= 0.001 && this.pendingWeapon !== null) { this.shownWeapon = this.pendingWeapon; this.pendingWeapon = null; this.raiseTarget = this.shownWeapon === 'none' ? 0 : 1; this.applyVisible(); }
    const rz = ease.outBack(this.raise);
    // bob in step with the feet: sideways once per step pair, down twice
    this.bobA += ((speed > 0.1 && this.onGround ? Math.min(1.2, speed / 4.5) : 0) - this.bobA) * Math.min(1, dt * 6);
    this.bobT += dt;
    const ph = this.phase, breathe = Math.sin(this.bobT * 1.7) * 0.004;
    const bx = Math.sin(ph) * 0.014 * this.bobA, by = -Math.abs(Math.cos(ph)) * 0.016 * this.bobA + breathe;
    // inertia: the weapon trails the view and overshoots a little
    const sx = this.swX.step(-look.x * 0.0011 - this.strafe * 0.012, dt), sy = this.swY.step(look.y * 0.0011 - this.moveFwd * 0.006, dt), sr = this.swR.step(-look.x * 0.0016 + this.strafe * 0.06, dt);
    const rz2 = this.rcZ.step(0, dt), rp = this.rcP.step(0, dt), rr = this.rcR.step(0, dt);
    this.kickPitch = this.camP.step(0, dt) * 0.02; this.kickRoll = this.camR.step(0, dt) * 0.02;
    const ly = this.landY.step(0, dt), hx = this.hurtX.step(0, dt) * 0.03, hy = this.hurtY.step(0, dt) * 0.03;
    const sk = this.sprintK, low = (1 - rz) * 0.35;
    const R = this.right, L = this.left;
    const ox = bx + sx + hx, oy = by + sy + ly * 0.1 + hy - low;
    // base holds
    if (this.shownWeapon === 'carbine' && this.firearm === 'revolver') { // two-handed revolver grip: right hand on the grip, left hand cupping it
      R.position.set(0.07 + ox - sk * 0.05, -0.17 + oy - sk * 0.07, -0.42 + rz2 * 0.05 + sk * 0.04); R.rotation.set(0.02 + rp * 0.04 - sk * 0.75, 0.06 + sk * 0.5, sr + rr * 0.03);
      L.position.set(0.0 + ox - sk * 0.08, -0.2 + oy - sk * 0.09, -0.38 + rz2 * 0.05); L.rotation.set(0.25 - sk * 0.6, -0.5, 0.75 + sr);
    } else if (this.shownWeapon === 'carbine') { // carbine at the shoulder: right hand on the wrist of the stock, left on the forend
      R.position.set(0.11 + ox - sk * 0.03, -0.16 + oy - sk * 0.05, -0.22 + rz2 * 0.08 + sk * 0.03); R.rotation.set(0.0 + rp * 0.035 - sk * 0.55, 0.02 + sk * 0.6, sr + rr * 0.03);
      L.position.set(0.05 + ox - sk * 0.06, -0.19 + oy - sk * 0.06, -0.55 + rz2 * 0.08 + sk * 0.12); L.rotation.set(0.35 - sk * 0.4, -0.2, 0.6 + sr);
    } else if (this.shownWeapon === 'none') { R.position.set(0.3 + ox, -0.42 + oy, -0.3); R.rotation.set(0.6, 0, sr); L.position.set(-0.3 + ox, -0.42 + oy, -0.3); L.rotation.set(0.6, 0, sr); }
    else { R.position.set(0.24 + ox - sk * 0.04, -0.24 + oy - sk * 0.05, -0.4); R.rotation.set(0.15 - sk * 0.3, sk * 0.3, 0.05 + sr); L.position.set(-0.24 + ox, -0.3 + oy - sk * 0.06, -0.45); L.rotation.set(0.1, 0.2, -0.1 + sr); }
    this.loaf.visible = false; this.rod.visible = false; this.pick.visible = false;
    const k = this.dur > 0 ? Math.min(1, this.t / this.dur) : 1;
    const bell = Math.sin(k * Math.PI);
    this.flash.material.opacity = 0; this.flash2.material.opacity = 0; this.flashLight.intensity = 0;
    const cy = this.carbine.getObjectByName('cylinder')!, hammer = this.carbine.getObjectByName('hammer')!, lever = this.longModel().getObjectByName('lever')!;
    cy.position.x = 0; hammer.rotation.x = -0.5; lever.rotation.x = 0; this.round.visible = false;
    { const bar = this.longModel().getObjectByName('barrels'); if (bar) bar.rotation.x = 0; if (this.firearm === 'longrifle') lever.position.set(0.05, 0.02, 0.02); }
    switch (this.action) {
      case 'shoot': {
        const f = this.isLong ? this.flash2 : this.flash;
        f.material.opacity = this.t < 0.045 ? 1 : 0; this.flashLight.intensity = this.t < 0.06 ? 7 : 0; f.scale.setScalar((this.firearm === 'scattergun' ? 2.2 : this.isLong ? 1.5 : 1) * (0.8 + Math.random() * 0.9));
        hammer.rotation.x = this.t < 0.04 ? 0.2 : -0.5 + Math.min(1, this.t * 5) * 0;
        if (this.isLong && this.t > 0.16) { const lv = ease.bell((this.t - 0.16) / 0.32); lever.rotation.x = lv * 0.9; R.position.y -= lv * 0.03; R.rotation.x += lv * 0.12; if (!this.ejected && this.t > 0.26) { this.ejected = true; this.ejectShells(R.position.clone().add(new THREE.Vector3(0.03, 0.04, -0.15)), 1); } }
        break;
      }
      case 'reload': {
        if (this.firearm === 'revolver') {
          // tip the gun up and left, swing the cylinder out, flick the empties, thumb in six rounds, snap it shut
          const tip = ease.outCubic(k / 0.15) * (1 - ease.inOut((k - 0.86) / 0.14));
          const open = ease.outCubic((k - 0.12) / 0.1) * (1 - ease.outBack((k - 0.8) / 0.08));
          const flick = ease.bell((k - 0.22) / 0.1);
          R.rotation.z += tip * 0.95 + flick * 0.2; R.rotation.x += tip * 0.55 + flick * 0.5; R.position.y -= tip * 0.03 - flick * 0.03; R.position.x -= tip * 0.06;
          cy.position.x = open * 0.035;
          if (!this.ejected && k > 0.25) { this.ejected = true; this.ejectShells(R.position.clone().add(new THREE.Vector3(0.02, 0.02, -0.05)), 6); }
          const loadK = (k - 0.32) / 0.46, rounds = Math.floor(clamp01(loadK) * 6);
          const hand = loadK > 0 && loadK < 1 ? Math.abs(Math.sin(clamp01(loadK) * Math.PI * 6)) : 0;
          if (k > 0.3 && k < 0.82) { L.position.set(R.position.x - 0.05, R.position.y - 0.1 + hand * 0.07, R.position.z + 0.03); L.rotation.set(0.6, 0, 0.3 + hand * 0.2); }
          else if (k >= 0.82) { const back = ease.inOut((k - 0.82) / 0.18); L.position.lerp(new THREE.Vector3(R.position.x - 0.06, R.position.y - 0.04, R.position.z + 0.04), 1 - back); }
          cy.rotation.z = rounds * (Math.PI / 3) + (k > 0.8 ? ease.outCubic((k - 0.8) / 0.1) * Math.PI * 2 : 0);
          if (rounds > this.loaded) this.loaded = rounds;
        } else {
          // v0.9.1: every long gun comes down off the shoulder into view, both hands stay on it, and the left hand
          // carries a visible round to the gun for each one loaded. Carbine: loading gate on the right, then the
          // lever. Scattergun: break the barrels down, shells out and two in, snap shut. Long rifle: bolt up and
          // back, rounds pressed down from above, bolt home.
          const down = ease.outCubic(k / 0.14) * (1 - ease.inOut((k - 0.86) / 0.14));
          // the gun lowered and brought in toward the middle of the view, muzzle a little left and up
          R.position.x -= down * 0.06; R.position.y -= down * 0.03; R.position.z += down * 0.04; R.rotation.y += down * 0.35; R.rotation.x += down * 0.12;
          const fg = this.firearm, n = fg === 'scattergun' ? 2 : fg === 'longrifle' ? 5 : 8;
          const loadA = fg === 'scattergun' ? 0.36 : 0.22, loadB = fg === 'scattergun' ? 0.74 : 0.78;
          const loadK = (k - loadA) / (loadB - loadA), cyc = loadK > 0 && loadK < 1 ? (clamp01(loadK) * n) % 1 : 0;
          const reach = loadK > 0 && loadK < 1 ? Math.sin(cyc * Math.PI) : 0;     // 0 at the gate, 1 at the belt
          // where the round goes in, in the right hand's space
          const gate = fg === 'carbine' ? new THREE.Vector3(0.05, -0.02, -0.06) : fg === 'longrifle' ? new THREE.Vector3(0.0, 0.06, -0.02) : new THREE.Vector3(0.0, 0.05, -0.12);
          const gw = gate.clone().applyEuler(R.rotation).add(R.position);
          const fore = new THREE.Vector3(0.05 + ox, -0.19 + oy, -0.55).lerp(new THREE.Vector3(R.position.x - 0.06, R.position.y - 0.05, R.position.z - 0.28), down);
          if (fg === 'carbine') {
            R.rotation.z -= down * 0.45;                                            // roll the gate up toward you
            const lv = ease.bell((k - 0.8) / 0.12); lever.rotation.x = lv * 0.9; R.position.y -= lv * 0.02;
          } else if (fg === 'scattergun') {
            // held out in front, muzzle tipped down, so the open breech faces you
            R.position.y += down * 0.07; R.position.z -= down * 0.08; R.rotation.x += down * 0.3; R.rotation.y -= down * 0.2; R.rotation.z -= down * 0.4;
            const brk = ease.outBack((k - 0.14) / 0.12) * (1 - ease.inCubic((k - 0.78) / 0.06));
            const bar = this.longModel().getObjectByName('barrels')!; bar.rotation.x = -brk * 0.75;
            if (!this.ejected && k > 0.28) { this.ejected = true; this.ejectShells(gw.clone().add(new THREE.Vector3(0, 0.05, 0.05)), 2); }
            if (k > 0.78 && k < 0.84) R.rotation.x += 0.15;                         // the flick that snaps it shut
          } else {
            const bolt = lever; const open = ease.outCubic((k - 0.12) / 0.08) * (1 - ease.inOut((k - 0.8) / 0.08));
            bolt.position.z = 0.02 + open * 0.07; bolt.position.y = 0.02 + open * 0.02;
            if (!this.ejected && k > 0.18) { this.ejected = true; this.ejectShells(gw.clone(), 1); }
          }
          if (loadK > 0 && loadK < 1) {
            // the left hand fetches a round from the belt and pushes it home
            const belt = new THREE.Vector3(R.position.x - 0.12, R.position.y - 0.2, R.position.z + 0.12);
            const at = gw.clone().add(new THREE.Vector3(-0.04, -0.03, 0.02)).lerp(belt, reach);
            L.position.copy(at); L.rotation.set(0.9 - reach * 0.4, 0.3, 0.5); this.round.visible = reach < 0.85;
            if (fg === 'scattergun') this.round.scale.set(1.5, 1.2, 1.5); else this.round.scale.set(1, 1, 1);
          } else { L.position.copy(fore); L.rotation.set(0.35, -0.2, 0.6); this.round.visible = false; }
        }
        break;
      }
      case 'cast': {
        // pull back, then thrust and overshoot; the free hand opens toward the target
        const back = k < 0.15 ? ease.bell(k / 0.3) : 0, thrust = ease.outBack((k - 0.12) / 0.3) * (1 - ease.inOut((k - 0.65) / 0.35));
        R.position.z += back * 0.06 - thrust * 0.14; R.position.x -= thrust * 0.08; R.rotation.x += back * 0.2 - thrust * 0.45;
        L.position.set(-0.12, -0.14 + thrust * 0.04, -0.46 - thrust * 0.14); L.rotation.set(1.3 * thrust, 0, -0.2 * thrust);
        const cr = this.staff.getObjectByName('crystal') as THREE.Mesh; (cr.material as THREE.MeshStandardMaterial).emissive.copy(this.spellColor); (cr.material as THREE.MeshStandardMaterial).emissiveIntensity = 1 + (thrust + back) * 4;
        break;
      }
      case 'melee': {
        // coil back to the right, a fast arc across, follow-through, recover
        const coil = ease.outCubic(k / 0.2) * (1 - ease.inCubic((k - 0.2) / 0.12)), sw = ease.outCubic((k - 0.2) / 0.22), rec = ease.inOut((k - 0.55) / 0.45);
        const arc = sw * (1 - rec);
        R.position.x += 0.1 * coil - arc * 0.36; R.position.y += 0.06 * coil + 0.1 * arc; R.position.z -= 0.16 * arc; R.rotation.z += -0.4 * coil + 1.25 * arc; R.rotation.y += -0.3 * coil + 0.95 * arc;
        break;
      }
      case 'interact': case 'write': {
        const s = this.action === 'write' ? Math.sin(this.t * 9) * 0.02 : 0, reach = this.action === 'write' ? 1 : ease.outCubic(k / 0.35) * (1 - ease.inOut((k - 0.6) / 0.4));
        R.position.set(0.12 + s, -0.18 - reach * 0.05, -0.38 - reach * 0.25); R.rotation.set(-0.4 * reach, 0, 0);
        this.carbine.visible = this.staff.visible = this.long.visible = false;
        break;
      }
      case 'eat': case 'drink': {
        const up = ease.outCubic(k / 0.3) * (1 - ease.inOut((k - 0.75) / 0.25)), chew = Math.sin(this.t * 11) * 0.01 * up;
        L.position.set(-0.05, -0.22 + up * 0.14 + chew, -0.4 + up * 0.15); L.rotation.set(-0.5 + up * 0.4, 0.3, 0);
        this.loaf.visible = this.action === 'eat';
        break;
      }
      case 'wash': {
        const sc = Math.sin(this.t * 10) * 0.04;
        R.position.set(0.1 + sc, -0.12, -0.3); R.rotation.set(0.6, 0, 0.3); L.position.set(-0.1 - sc, -0.12, -0.3); L.rotation.set(0.6, 0, -0.3);
        this.carbine.visible = this.staff.visible = this.long.visible = false;
        break;
      }
      case 'fish': case 'reel': {
        this.carbine.visible = this.staff.visible = this.long.visible = false; this.rod.visible = true;
        const cast = this.action === 'fish' && this.t < 1.1 ? ease.bell(this.t / 1.1) : 0, reel = this.action === 'reel' ? Math.sin(this.t * 14) * 0.02 : 0, pull = this.action === 'reel' ? ease.bell(k) : 0;
        R.position.set(0.16, -0.24 + cast * 0.12 + pull * 0.05, -0.32 - cast * 0.05); R.rotation.set(-0.2 - cast * 1.4 + pull * 0.5, 0, 0.05);
        L.position.set(0.1 + reel, -0.3, -0.2); L.rotation.set(0.6, 0, 0.4);
        break;
      }
      case 'mine': {
        this.carbine.visible = this.staff.visible = this.long.visible = false; this.pick.visible = true;
        const ph = (this.t * 1.1) % 1, up = ph < 0.55 ? ease.sine(ph / 0.55) : ph < 0.68 ? 1 - ease.inCubic((ph - 0.55) / 0.13) : 0, hit = ph >= 0.68 && ph < 0.75 ? 1 : 0;
        R.position.set(0.15, -0.25 + up * 0.18 - hit * 0.02, -0.4 + up * 0.1); R.rotation.set(-0.6 + up * 1.3 + hit * 0.1, 0, 0.2);
        L.position.set(0.05, -0.3 + up * 0.15, -0.3 + up * 0.08); L.rotation.set(0.3 + up * 0.8, 0, 0.5);
        break;
      }
      case 'inspect': {
        // idle fidget: turn the gun over and spin the cylinder, or check the staff's crystal
        const tilt = ease.inOut(k / 0.25) * (1 - ease.inOut((k - 0.75) / 0.25));
        if (this.shownWeapon === 'carbine') { R.rotation.z += tilt * 1.1; R.rotation.y -= tilt * 0.5; R.position.x -= tilt * 0.08; R.position.y += tilt * 0.03; if (this.firearm === 'revolver') cy.rotation.z += dt * 18 * ease.bell((k - 0.35) / 0.3); }
        else if (this.shownWeapon === 'staff') { R.rotation.x -= tilt * 0.5; R.position.x -= tilt * 0.12; R.position.y += tilt * 0.05; R.rotation.y += Math.sin(this.t * 2.5) * 0.2 * tilt; }
        if (speed > 0.1) this.action = 'none';
        break;
      }
    }
    if (this.action !== 'interact' && this.action !== 'write' && this.action !== 'wash' && this.action !== 'fish' && this.action !== 'reel' && this.action !== 'mine') this.applyVisible();
    if (this.action !== 'cast') { const cr = this.staff.getObjectByName('crystal') as THREE.Mesh; const m = cr.material as THREE.MeshStandardMaterial; m.emissive.setHex(0x3fa8ff); m.emissiveIntensity = 1.2 + Math.sin(this.bobT * 2) * 0.3; }
    // spent brass falls out of view
    for (const s of [...this.shells]) { s.life -= dt; s.v.y -= 2.4 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 14; s.m.rotation.z += dt * 9; if (s.life <= 0) { s.m.visible = false; this.shells.splice(this.shells.indexOf(s), 1); } }
  }
}
const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x;
