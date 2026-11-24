// The Shade Patriarch (pass 3). Three phases, every attack telegraphed:
//  1. Bound to the millstone: Grasp (ring on the floor, then a sweep) and Call (summons shades).
//  2. Free: Volley (a fan of five orbs after a long glow) and Darkness (pools appear under you, then burst).
//  3. Guttering: Wail (an expanding ring; hide behind a pillar) and stagger windows.
// Fire builds a stagger meter in every phase; a staggered Patriarch takes double damage.
import * as THREE from 'three';
import { Humanoid, clip } from './rig';
import { Enemy, type EnemyManager, type EnemyDef } from './enemies';
import { rayBoxes, type Box } from './world';

export const PATRIARCH: EnemyDef = { hp: 640, speed: 2.2, sight: 40, reach: 3.2, windup: 0.9, dmg: 22, recover: 1.2, radius: 0.9, height: 3.3 };

type Atk = 'none' | 'grasp' | 'call' | 'volley' | 'dark' | 'wail';
export interface BossHooks {
  hurtPlayer(amount: number): void;
  drainMana(amount: number): void;
  feed(text: string): void;
  sound(n: 'hiss' | 'orb' | 'swing' | 'hit' | 'growl', pan: number): void;
  defeated(): void;
}

export class Patriarch {
  e: Enemy; model: Humanoid; phase = 1; active = false; dead = false;
  atk: Atk = 'none'; t = 0; cd = 2.5; stagger = 0; staggerT = 0; callT = 6; deadT = 0;
  private ring: THREE.Mesh; private ringMat: THREE.MeshBasicMaterial;
  private pools: THREE.Mesh[]; private poolAt: THREE.Vector3[] = [];
  private tmp = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private enemies: EnemyManager, private colliders: Box[], private home: THREE.Vector3, pools: THREE.Mesh[], private hooks: BossHooks) {
    this.e = new Enemy('shade', home, 'patriarch');
    this.e.external = true; this.e.defOverride = PATRIARCH; this.e.hp = PATRIARCH.hp;
    this.scene.remove(this.e.root);
    this.model = new Humanoid({ skin: 0x6f6f98, shirt: 0x140f24, pants: 0x140f24, coat: 0x1d1530, boots: 0x0a0a0a, hat: 'hood', robe: true, glowEyes: 0xd0a0ff, scale: 1.75, bulk: 1.3 });
    this.e.model = this.model; this.e.root = this.model.root;
    this.e.pos.copy(home); this.model.root.position.copy(home);
    this.e.onDamage = (amt, status) => this.onDamage(amt, status);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xb070ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), this.ringMat); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.14; this.scene.add(this.ring);
    this.pools = pools;
    this.model.root.visible = false;
  }
  /** Put the boss into the scene and the enemy list (on entering the arena). */
  wake() {
    if (this.active || this.dead) return;
    this.active = true; this.model.root.visible = true;
    this.scene.add(this.model.root); this.enemies.list.push(this.e);
    this.hooks.feed('Something vast uncurls from the millstone. The Shade Patriarch.'); this.hooks.sound('hiss', 0);
  }
  /** Reset on player death or leaving: full health, back to phase 1 (fair retry from the waystone). */
  reset() {
    if (this.dead) return;
    this.active = false; this.phase = 1; this.e.hp = PATRIARCH.hp; this.e.state = 'idle'; this.atk = 'none'; this.cd = 2.5; this.stagger = 0; this.staggerT = 0;
    this.e.pos.copy(this.home); this.model.root.visible = false; this.scene.remove(this.model.root);
    this.enemies.list = this.enemies.list.filter(x => x !== this.e);
    for (const x of this.enemies.list) if (x.tag === 'patriarch_call') x.hp = 0;
    this.enemies.list.filter(x => x.tag === 'patriarch_call').forEach(x => this.enemies.remove(x));
    this.clearTelegraphs();
  }
  get hpFrac() { return Math.max(0, this.e.hp / PATRIARCH.hp); }
  private onDamage(amt: number, status?: 'burn' | 'slow') {
    let a = amt * (this.staggerT > 0 ? 2 : 1) * (this.phase === 1 ? 0.8 : 1);
    if (status === 'burn') { this.stagger += 34; }
    else if (status === 'slow') { this.stagger += 8; }
    if (this.stagger >= 100 && this.staggerT <= 0) { this.staggerT = this.phase === 3 ? 3.2 : 2.4; this.stagger = 0; this.atk = 'none'; this.clearTelegraphs(); this.hooks.feed('The Patriarch reels from the fire. Strike now!'); }
    this.e.hp -= a;
    const f = this.hpFrac;
    if (this.phase === 1 && f < 0.6) { this.phase = 2; this.atk = 'none'; this.cd = 1.5; this.clearTelegraphs(); this.hooks.feed('The Patriarch tears free of the millstone. The dark thickens: watch the floor.'); }
    if (this.phase === 2 && f < 0.25) { this.phase = 3; this.atk = 'none'; this.cd = 1.2; this.clearTelegraphs(); this.hooks.feed('He gutters like a candle. When he wails, get behind stone.'); }
  }
  private clearTelegraphs() { this.ringMat.opacity = 0; for (const p of this.pools) { p.visible = false; } }
  update(dt: number, now: number, player: THREE.Vector3, alive: boolean) {
    const e = this.e, m = this.model;
    if (this.dead) {
      this.deadT += dt; m.apply(clip('die', this.deadT), dt, 10, 'die'); m.root.position.y = -Math.max(0, this.deadT - 2) * 0.6;
      if (this.deadT > 6) { m.root.visible = false; }
      return;
    }
    if (!this.active) return;
    if (!e.alive) {
      this.dead = true; this.deadT = 0; this.clearTelegraphs();
      this.enemies.list.filter(x => x.tag === 'patriarch_call').forEach(x => this.enemies.damage(x, 999, now));
      this.hooks.defeated(); return;
    }
    const toP = this.tmp.copy(player).sub(e.pos).setY(0); const dist = toP.length();
    const want = Math.atan2(-toP.x, -toP.z);
    let dy = want - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    if (this.staggerT > 0) { this.staggerT -= dt; e.anim += dt; m.apply(clip('hit', Math.min(0.3, e.anim % 0.6)), dt, 10, 'hit'); m.tint(0xff7a2a, 0.4 + Math.sin(now * 20) * 0.2); this.pose(); return; }
    e.yaw += dy * Math.min(1, dt * (this.atk === 'none' ? 3 : 1.2));
    // movement: bound in phase 1; in 2–3 drifts to keep a middle distance
    if (this.phase > 1 && this.atk === 'none') {
      const want = dist > 9 ? 1 : dist < 5 ? -1 : 0;
      if (want) { const step = toP.clone().normalize().multiplyScalar(want * PATRIARCH.speed * dt); e.pos.add(step); const O = this.home; e.pos.x = Math.max(O.x - 9, Math.min(O.x + 9, e.pos.x)); e.pos.z = Math.max(O.z - 9, Math.min(O.z + 9, e.pos.z)); }
    }
    this.t += dt; this.cd -= dt; this.callT -= dt;
    if (!alive) { this.atk = 'none'; this.clearTelegraphs(); }
    if (this.atk === 'none' && this.cd <= 0 && alive) this.choose(dist);
    const pan = Math.max(-1, Math.min(1, toP.x / 15));
    switch (this.atk) {
      case 'grasp': { // ring grows for 0.9 s, then anything inside 3.4 m is hit
        const k = Math.min(1, this.t / 0.9); this.ring.position.set(e.pos.x, 0.14, e.pos.z); this.ring.scale.setScalar(3.4); this.ringMat.opacity = 0.25 + 0.5 * k; this.ringMat.color.setHex(0xb070ff);
        m.apply(clip('windup', this.t), dt, 12, 'windup');
        if (this.t >= 0.9) { this.hooks.sound('swing', pan); if (dist < 3.4 && alive) this.hooks.hurtPlayer(PATRIARCH.dmg); this.end(1.6); }
        break;
      }
      case 'call': {
        m.apply(clip('castOrb', this.t), dt, 10, 'castOrb');
        if (this.t >= 1.1) { const n = this.enemies.list.filter(x => x.alive && x.tag === 'patriarch_call').length; for (let i = n; i < 2; i++) { const s = this.enemies.spawn('shade', this.home.clone().add(new THREE.Vector3((i ? 1 : -1) * 6, 0, 4)), 'patriarch_call'); s.state = 'chase'; } this.hooks.sound('hiss', pan); this.callT = 26; this.end(1.4); }
        break;
      }
      case 'volley': { // glows for 1.0 s, then five orbs in a fan (strafe sideways)
        m.apply(clip('castOrb', this.t), dt, 10, 'castOrb'); m.tint(0xb48cff, Math.min(0.6, this.t * 0.6));
        if (this.t >= 1.0) {
          const hand = e.pos.clone().setY(2.6), base = player.clone().setY(1.1).sub(hand).normalize();
          for (let i = -2; i <= 2; i++) { const d = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.16); this.enemies.fireProjectile(hand.clone().add(d.clone().multiplyScalar(0.8)), d, 'enemy', 'orb', 12); }
          this.hooks.sound('orb', pan); this.end(1.4);
        }
        break;
      }
      case 'dark': { // three pools telegraph for 1.5 s, then burst: damage and a mana drain
        if (!this.poolAt.length) this.aimDark(player);
        m.apply(clip('castOrb', this.t), dt, 10, 'castOrb');
        const k = Math.min(1, this.t / 1.5);
        this.pools.forEach((p, i) => { if (i < this.poolAt.length) { p.visible = true; p.position.set(this.poolAt[i].x, 0.13, this.poolAt[i].z); (p.material as THREE.MeshBasicMaterial).opacity = 0.15 + 0.55 * k; p.scale.setScalar(0.6 + 0.4 * k); } });
        if (this.t >= 1.5) {
          const hit = this.poolAt.some(q => q.distanceTo(this.tmp.copy(player).setY(0)) < 2.2);
          if (hit && alive) { this.hooks.hurtPlayer(16); this.hooks.drainMana(12); this.hooks.feed('The darkness bites and drinks your mana.'); }
          this.clearTelegraphs(); this.end(1.2);
        }
        break;
      }
      case 'wail': { // an expanding ring for 1.6 s; only stone between you and him stops it
        const k = Math.min(1, this.t / 1.6); this.ring.position.set(e.pos.x, 0.14, e.pos.z); this.ring.scale.setScalar(1 + k * 14); this.ringMat.opacity = 0.8 * (1 - k * 0.5); this.ringMat.color.setHex(0xff90c0);
        m.apply(clip('cast', this.t), dt, 10, 'cast');
        if (this.t >= 1.6) {
          const eye = e.pos.clone().setY(2.2), d = player.clone().setY(1.4).sub(eye), len = d.length();
          const covered = rayBoxes(this.colliders, eye, d.normalize(), len) < len - 0.4;
          if (!covered && alive) { this.hooks.hurtPlayer(26); this.hooks.feed('The wail tears through you. Hide behind a pillar next time.'); }
          this.hooks.sound('hiss', pan); this.ringMat.opacity = 0; this.end(1.8);
        }
        break;
      }
      default: m.apply(clip('float', now), dt, 8, 'float'); m.tint(0x000000, 0);
    }
    if (e.flash > 0) m.tint(0xffffff, 0.8);
    this.pose();
  }
  private choose(dist: number) {
    this.t = 0;
    const p = this.phase;
    if (p === 1) this.atk = this.callT <= 0 ? 'call' : dist < 4.5 ? 'grasp' : 'volley';
    else if (p === 2) this.atk = this.callT <= 0 ? 'call' : dist < 3.5 ? 'grasp' : Math.random() < 0.5 ? 'dark' : 'volley';
    else this.atk = Math.random() < 0.45 ? 'wail' : dist < 3.5 ? 'grasp' : Math.random() < 0.5 ? 'dark' : 'volley';
    if (this.atk === 'volley' && p === 1) this.atk = Math.random() < 0.6 ? 'volley' : 'grasp';
    this.poolAt = [];
  }
  /** The game supplies the player position when the dark attack is chosen. */
  aimDark(player: THREE.Vector3) {
    if (this.atk !== 'dark' || this.poolAt.length) return;
    const P = player.clone().setY(0);
    this.poolAt = [P, P.clone().add(new THREE.Vector3(3.2, 0, 1.4)), P.clone().add(new THREE.Vector3(-3.0, 0, -1.8))];
    this.hooks.sound('hiss', 0);
  }
  private end(cd: number) { this.atk = 'none'; this.cd = cd * (this.phase === 3 ? 0.8 : 1); this.t = 0; this.poolAt = []; this.model.tint(0x000000, 0); }
  private pose() { const r = this.model.root; r.position.set(this.e.pos.x, 0, this.e.pos.z); r.rotation.y = this.e.yaw; }
}
