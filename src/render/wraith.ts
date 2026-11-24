// The Cinder Wraith (pass 4): what is left of Brother Aldous, who kept the Censer burning under the water.
// It ADAPTS (Ledger & Ward's adaptive enemies): hit it the same way three times running and it hardens
// against that kind of blow and answers with a counter. Changing how you hit it is the whole fight.
//   bullets → it blinks out of the line of fire and rushes you       (Ash Step)
//   fire    → it drinks the flame, heals a little and sends a wave   (Kindle)
//   frost   → it retreats and throws a volley                        (Backdraft)
//   spark   → it braces and throws the lightning back                (Return Stroke)
//   melee   → it bursts in a ring of cinders around itself           (Cinder Burst)
// Three phases by health; every attack is telegraphed on the floor.
import * as THREE from 'three';
import { Humanoid, clip } from './rig';
import { Enemy, type EnemyManager, type EnemyDef, type DamageKind } from './enemies';
import { rayBoxes, type Box } from './world';

export const WRAITH: EnemyDef = { hp: 820, speed: 3.4, sight: 40, reach: 2.8, windup: 0.8, dmg: 20, recover: 1.0, radius: 0.7, height: 2.8 };
export const KIND_NAME: Record<DamageKind, string> = { bullet: 'bullets', fire: 'fire', frost: 'frost', spark: 'lightning', melee: 'your staff' };
const RESIST = 0.3;          // damage multiplier while hardened
const RESIST_TIME = 14;      // seconds a hardening lasts

type Atk = 'none' | 'bolt' | 'wave' | 'rain' | 'burst' | 'swipe' | 'blink' | 'volley' | 'reflect' | 'kindle' | 'summon';
export interface WraithHooks {
  hurtPlayer(amount: number): void;
  feed(text: string): void;
  sound(n: 'hiss' | 'orb' | 'swing' | 'hit' | 'zap' | 'fire', pan: number): void;
  defeated(): void;
  dodging(): boolean;
  spawnImps(at: THREE.Vector3): void;
}

export class Wraith {
  e: Enemy; model: Humanoid; active = false; dead = false; phase = 1; deadT = 0;
  atk: Atk = 'none'; t = 0; cd = 2.2;
  /** What it last felt, and how many times in a row. */
  lastKind: DamageKind | null = null; streak = 0;
  resist: Partial<Record<DamageKind, number>> = {};   // kind → time (boss clock) the hardening ends
  clock = 0; summoned = false; queued: Atk | null = null;
  private ring: THREE.Mesh; private ringMat: THREE.MeshBasicMaterial;
  private strip: THREE.Mesh; private stripMat: THREE.MeshBasicMaterial; private stripDir = new THREE.Vector3();
  private spots: THREE.Mesh[] = []; private spotAt: THREE.Vector3[] = [];
  private tmp = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private enemies: EnemyManager, private colliders: Box[], private home: THREE.Vector3, private hooks: WraithHooks) {
    this.e = new Enemy('shade', home, 'wraith');
    this.e.external = true; this.e.defOverride = WRAITH; this.e.hp = WRAITH.hp;
    this.model = new Humanoid({ skin: 0x2a1a14, shirt: 0x1a0f0a, pants: 0x1a0f0a, coat: 0x24120a, boots: 0x0a0604, hat: 'hood', robe: true, glowEyes: 0xffb040, scale: 1.5, bulk: 1.15 });
    this.e.model = this.model; this.e.root = this.model.root; this.e.pos.copy(home); this.model.root.position.copy(home);
    this.e.onDamage = (amt, status, kind) => this.onDamage(amt, kind ?? 'bullet');
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.0, 40), this.ringMat); this.ring.rotation.x = -Math.PI / 2; this.ring.position.y = 0.14; scene.add(this.ring);
    this.stripMat = new THREE.MeshBasicMaterial({ color: 0xff5a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    this.strip = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 16), this.stripMat); this.strip.rotation.x = -Math.PI / 2; this.strip.position.y = 0.14; this.strip.visible = false; scene.add(this.strip);
    const sm = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, depthWrite: false });
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(1.7, 18), sm.clone()); d.rotation.x = -Math.PI / 2; d.position.y = 0.13; d.visible = false; scene.add(d); this.spots.push(d); }
    this.model.root.visible = false;
  }
  wake() {
    if (this.active || this.dead) return;
    this.active = true; this.model.root.visible = true; this.scene.add(this.model.root); this.enemies.list.push(this.e);
    this.hooks.feed('The coals on the altar stand up. The Cinder Wraith turns what used to be a face toward you.'); this.hooks.sound('hiss', 0);
  }
  reset() {
    if (this.dead) return;
    this.active = false; this.phase = 1; this.e.hp = WRAITH.hp; this.e.state = 'idle'; this.atk = 'none'; this.cd = 2.2; this.streak = 0; this.lastKind = null; this.resist = {}; this.summoned = false; this.queued = null;
    this.e.pos.copy(this.home); this.model.root.visible = false; this.scene.remove(this.model.root);
    this.enemies.list = this.enemies.list.filter(x => x !== this.e);
    this.enemies.list.filter(x => x.tag === 'wraith_call').forEach(x => this.enemies.remove(x));
    this.clear();
  }
  get hpFrac() { return Math.max(0, this.e.hp / WRAITH.hp); }
  hardened(): DamageKind[] { return (Object.keys(this.resist) as DamageKind[]).filter(k => (this.resist[k] ?? 0) > this.clock); }
  /** One-line state for the boss bar. */
  note(): string {
    const h = this.hardened();
    if (h.length) return `Hardened against ${h.map(k => KIND_NAME[k]).join(' and ')}: hit it another way`;
    if (this.streak >= 2 && this.lastKind) return `It is learning ${KIND_NAME[this.lastKind]} (${this.streak}/${this.need()}): change your attack`;
    return this.phase === 1 ? 'It learns. Never the same blow three times' : this.phase === 2 ? 'It learns faster now' : 'Guttering: finish it';
  }
  private need() { return this.phase >= 2 ? 2 : 3; }
  private onDamage(amt: number, kind: DamageKind) {
    const hard = (this.resist[kind] ?? 0) > this.clock;
    let a = amt * (hard ? RESIST : 1);
    if (!hard && this.lastKind && kind !== this.lastKind) a *= 1.15;       // variety is rewarded
    if (kind === this.lastKind) this.streak++; else { this.lastKind = kind; this.streak = 1; }
    this.e.hp -= a;
    if (hard) { this.model.tint(0x888888, 0.6); }
    if (!hard && this.streak >= this.need()) {
      this.resist[kind] = this.clock + RESIST_TIME; this.streak = 0;
      this.hooks.feed(`The Wraith has learned ${KIND_NAME[kind]}. It hardens against ${kind === 'melee' ? 'it' : 'them'}: change how you hit it.`);
      this.queued = kind === 'bullet' ? 'blink' : kind === 'fire' ? 'kindle' : kind === 'frost' ? 'volley' : kind === 'spark' ? 'reflect' : 'burst';
      if (kind === 'fire') this.e.hp = Math.min(WRAITH.hp, this.e.hp + 30);
    }
    const f = this.hpFrac;
    if (this.phase === 1 && f < 0.55) { this.phase = 2; this.hooks.feed('The Wraith burns whiter. It learns after two blows now, and the ceiling begins to rain embers.'); this.hooks.sound('hiss', 0); }
    if (this.phase === 2 && f < 0.2) { this.phase = 3; this.hooks.feed('Its robe is mostly light now. One more push.'); }
  }
  private clear() { this.ringMat.opacity = 0; this.stripMat.opacity = 0; this.strip.visible = false; for (const s of this.spots) s.visible = false; }
  private end(cd: number) { this.atk = 'none'; this.t = 0; this.cd = cd * (this.phase === 3 ? 0.7 : this.phase === 2 ? 0.85 : 1); this.clear(); this.model.tint(0, 0); }
  update(dt: number, now: number, player: THREE.Vector3, alive: boolean) {
    const e = this.e, m = this.model;
    if (this.dead) { this.deadT += dt; m.apply(clip('die', this.deadT), dt, 10, 'die'); m.root.position.y = -Math.max(0, this.deadT - 2) * 0.6; if (this.deadT > 6) m.root.visible = false; return; }
    if (!this.active) return;
    if (!e.alive) { this.dead = true; this.deadT = 0; this.clear(); this.enemies.list.filter(x => x.tag === 'wraith_call').forEach(x => this.enemies.damage(x, 999, now)); this.hooks.defeated(); return; }
    this.clock += dt; this.t += dt; this.cd -= dt;
    const toP = this.tmp.copy(player).sub(e.pos).setY(0), dist = toP.length();
    const want = Math.atan2(-toP.x, -toP.z); let dy = want - e.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
    e.yaw += dy * Math.min(1, dt * (this.atk === 'none' ? 4 : 1.5));
    const pan = Math.max(-1, Math.min(1, toP.x / 15));
    const clampArena = () => { e.pos.x = Math.max(this.home.x - 8.5, Math.min(this.home.x + 8.5, e.pos.x)); e.pos.z = Math.max(this.home.z - 8.5, Math.min(this.home.z + 8.5, e.pos.z)); };
    if (!alive) { if (this.atk !== 'none') this.end(1); }
    if (this.atk === 'none') {
      // drift: close in when far, back off when crowded
      const dir = dist > 8 ? 1 : dist < 3.5 ? -0.6 : 0;
      if (dir) { e.pos.addScaledVector(toP.normalize(), dir * WRAITH.speed * dt); clampArena(); }
      if (this.cd <= 0 && alive) this.choose(dist, player);
    }
    switch (this.atk) {
      case 'bolt': { // glow, then a fast cinder at where you stand
        m.apply(clip('castOrb', this.t), dt, 10, 'castOrb'); m.tint(0xff8a2a, Math.min(0.6, this.t));
        if (this.t >= 0.6) { const hand = e.pos.clone().setY(2.3), d = player.clone().setY(1.1).sub(hand).normalize(); this.enemies.fireProjectile(hand.add(d.clone().multiplyScalar(0.8)), d, 'enemy', 'fire', 15, 'wraith'); this.hooks.sound('fire', pan); this.end(0.9); }
        break;
      }
      case 'volley': { // Backdraft: retreats, then three cinders in a fan
        m.apply(clip('castOrb', this.t), dt, 10, 'castOrb'); m.tint(0xffc070, Math.min(0.7, this.t));
        if (this.t < 0.7) { e.pos.addScaledVector(toP.normalize(), -6 * dt); clampArena(); }
        if (this.t >= 1.0) { const hand = e.pos.clone().setY(2.3), base = player.clone().setY(1.1).sub(hand).normalize(); for (let i = -1; i <= 1; i++) { const d = base.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.2); this.enemies.fireProjectile(hand.clone().add(d.clone().multiplyScalar(0.8)), d, 'enemy', 'fire', 13, 'wraith'); } this.hooks.sound('fire', pan); this.end(1.3); }
        break;
      }
      case 'wave': case 'kindle': { // a strip of floor glows for a second, then burns
        const dur = this.atk === 'kindle' ? 0.9 : 1.1, k = Math.min(1, this.t / dur);
        if (this.t < 0.05 || !this.strip.visible) { this.stripDir.copy(toP).normalize(); this.strip.visible = true; this.strip.position.set(e.pos.x + this.stripDir.x * 8, 0.14, e.pos.z + this.stripDir.z * 8); this.strip.rotation.z = Math.atan2(this.stripDir.x, this.stripDir.z); this.strip.scale.x = this.atk === 'kindle' ? 1.6 : 1; }
        this.stripMat.opacity = 0.15 + 0.5 * k; m.apply(clip('cast', this.t), dt, 10, 'cast');
        if (this.t >= dur) {
          const rel = player.clone().sub(e.pos).setY(0), along = rel.dot(this.stripDir), side = Math.abs(rel.x * this.stripDir.z - rel.z * this.stripDir.x), half = 1.2 * this.strip.scale.x;
          if (alive && along > 0 && along < 16 && side < half && !this.hooks.dodging()) this.hooks.hurtPlayer(this.atk === 'kindle' ? 24 : 20);
          this.hooks.sound('fire', pan); this.end(1.2);
        }
        break;
      }
      case 'rain': { // ember rain: circles appear around you, then fall
        m.apply(clip('castOrb', this.t), dt, 10, 'castOrb');
        if (!this.spotAt.length) { const P = player.clone().setY(0); this.spotAt = [P.clone()]; for (let i = 0; i < (this.phase === 3 ? 5 : 4); i++) { const a = Math.random() * 6.28, r = 2.5 + Math.random() * 3.5; this.spotAt.push(P.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r))); } }
        const k = Math.min(1, this.t / 1.3);
        this.spots.forEach((s, i) => { if (i < this.spotAt.length) { s.visible = true; s.position.set(this.spotAt[i].x, 0.13, this.spotAt[i].z); (s.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.5 * k; s.scale.setScalar(0.5 + 0.5 * k); } });
        if (this.t >= 1.3) { const pp = this.tmp.copy(player).setY(0); if (alive && !this.hooks.dodging() && this.spotAt.some(q => q.distanceTo(pp) < 1.7)) this.hooks.hurtPlayer(18); this.hooks.sound('fire', pan); this.spotAt = []; this.end(1.1); }
        break;
      }
      case 'burst': { // Cinder Burst: a ring around itself
        const k = Math.min(1, this.t / 0.8); this.ring.position.set(e.pos.x, 0.14, e.pos.z); this.ring.scale.setScalar(4.2); this.ringMat.opacity = 0.2 + 0.6 * k; this.ringMat.color.setHex(0xff7a2a);
        m.apply(clip('windup', this.t), dt, 12, 'windup');
        if (this.t >= 0.8) { if (alive && dist < 4.2 && !this.hooks.dodging()) this.hooks.hurtPlayer(22); this.hooks.sound('fire', pan); this.end(1.3); }
        break;
      }
      case 'swipe': {
        const k = Math.min(1, this.t / 0.7); this.ring.position.set(e.pos.x, 0.14, e.pos.z); this.ring.scale.setScalar(3.0); this.ringMat.opacity = 0.2 + 0.5 * k; this.ringMat.color.setHex(0xffb060);
        m.apply(clip(this.t < 0.7 ? 'windup' : 'melee', this.t), dt, 14, this.t < 0.7 ? 'windup' : 'melee');
        if (this.t >= 0.7) { if (alive && dist < 3.0 && !this.hooks.dodging()) this.hooks.hurtPlayer(WRAITH.dmg); this.hooks.sound('swing', pan); this.end(1.1); }
        break;
      }
      case 'blink': { // Ash Step: vanishes, reappears beside you, then swipes
        m.apply(clip('float', now), dt, 8, 'float');
        if (this.t < 0.5) { m.root.visible = Math.floor(this.t * 30) % 2 === 0; }
        else if (this.t < 0.55) { const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(Math.random() < 0.5 ? 2.6 : -2.6); e.pos.copy(player).setY(0).add(side); clampArena(); m.root.visible = true; this.hooks.sound('hiss', pan); }
        else { m.root.visible = true; this.atk = 'swipe'; this.t = 0.25; }
        break;
      }
      case 'reflect': { // Return Stroke: braces for 0.7 s, then lightning comes back along the line between you
        m.apply(clip('windup', this.t), dt, 12, 'windup'); m.tint(0xd8e8ff, 0.3 + Math.min(0.5, this.t));
        this.ring.position.set(player.x, 0.14, player.z); this.ring.scale.setScalar(1.6); this.ringMat.opacity = 0.3 + 0.5 * Math.min(1, this.t / 0.7); this.ringMat.color.setHex(0xd8e8ff);
        if (this.t >= 0.7) {
          const eye = e.pos.clone().setY(2.2), d = player.clone().setY(1.3).sub(eye), len = d.length();
          const covered = rayBoxes(this.colliders, eye, d.normalize(), len) < len - 0.4;
          if (alive && !covered && !this.hooks.dodging()) this.hooks.hurtPlayer(16);
          this.hooks.sound('zap', pan); this.end(1.2);
        }
        break;
      }
      case 'summon': {
        m.apply(clip('cast', this.t), dt, 10, 'cast');
        if (this.t >= 1.0) { this.hooks.spawnImps(this.home); this.hooks.sound('hiss', pan); this.end(1.5); }
        break;
      }
      default: m.apply(clip('float', now), dt, 8, 'float'); if (this.hardened().length) m.tint(0x777777, 0.35); else m.tint(0xff6a1a, 0.12 + Math.sin(now * 5) * 0.06);
    }
    if (e.flash > 0) m.tint(0xffffff, 0.8);
    m.root.position.set(e.pos.x, 0.25 + Math.sin(now * 2.2) * 0.08, e.pos.z); m.root.rotation.y = e.yaw;
  }
  private choose(dist: number, player: THREE.Vector3) {
    this.t = 0; this.spotAt = []; void player;
    if (this.queued) { this.atk = this.queued; this.queued = null; return; }
    if (this.phase >= 2 && !this.summoned) { this.summoned = true; this.atk = 'summon'; return; }
    const r = Math.random();
    if (dist < 3.4) this.atk = r < 0.6 ? 'swipe' : 'burst';
    else if (this.phase === 1) this.atk = r < 0.55 ? 'bolt' : 'wave';
    else this.atk = r < 0.3 ? 'bolt' : r < 0.6 ? 'wave' : 'rain';
  }
}
