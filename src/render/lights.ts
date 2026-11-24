// A fixed pool of point lights shared by every lamp, hearth and torch in the world.
// The number of lights in the scene never changes (so shaders never recompile), and each pixel is lit
// by at most POOL lights however many lamps exist. Each pool light serves the anchor nearest the player;
// when it has to move to another anchor it fades out, jumps, and fades back in, out of sight.
import * as THREE from 'three';

export type LightZone = 'out' | 'mill' | 'chapel' | 'mine' | 'barrow' | 'seacave';
export interface LightAnchor {
  pos: THREE.Vector3; color: number; intensity: number; dist: number; decay: number;
  when: 'always' | 'night'; zone: LightZone; flicker: number; on: boolean; follow: boolean; seed: number;
}
interface Slot { l: THREE.PointLight; a: LightAnchor | null; next: LightAnchor | null; cur: number }

export class LightPool {
  anchors: LightAnchor[] = [];
  slots: Slot[] = [];
  private t = 0;
  constructor(scene: THREE.Scene, n = 6) {
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 1.5); l.position.set(0, -50, 0); scene.add(l); this.slots.push({ l, a: null, next: null, cur: 0 }); }
  }
  add(x: number, y: number, z: number, color: number, intensity: number, dist = 14, decay = 1.5, o: Partial<LightAnchor> = {}): LightAnchor {
    const a: LightAnchor = { pos: new THREE.Vector3(x, y, z), color, intensity, dist, decay, when: 'always', zone: 'out', flicker: 0, on: true, follow: false, seed: this.anchors.length * 1.7, ...o };
    this.anchors.push(a); return a;
  }
  private place(s: Slot, a: LightAnchor) { s.a = a; s.next = null; s.l.position.copy(a.pos); s.l.color.setHex(a.color); s.l.distance = a.dist; s.l.decay = a.decay; }
  update(dt: number, p: THREE.Vector3, zone: LightZone, night: number, time: number) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.2;
      const lit = night > 0.35;
      const cand: { a: LightAnchor; d: number }[] = [];
      for (const a of this.anchors) {
        if (!a.on || a.zone !== zone || (a.when === 'night' && !lit)) continue;
        const d = a.follow ? -1 : Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
        if (d < 55) cand.push({ a, d });
      }
      cand.sort((x, y) => x.d - y.d);
      const chosen = cand.slice(0, this.slots.length).map(c => c.a);
      for (const s of this.slots) {
        if (s.next && !chosen.includes(s.next)) s.next = null;
        if (s.a && !chosen.includes(s.a) && !s.next) s.a = null;
      }
      for (const a of chosen) {
        if (this.slots.some(s => s.a === a && !s.next) || this.slots.some(s => s.next === a)) continue;
        const free = this.slots.find(s => !s.a && !s.next) ?? this.slots.find(s => !chosen.includes(s.a!) && !s.next);
        if (free) free.next = a;
      }
    }
    const k = Math.min(1, dt * 9);
    for (const s of this.slots) {
      const a = s.next ? null : s.a;
      let target = 0;
      if (a) {
        const f = a.flicker ? 1 + Math.sin(time * 11 + a.seed) * a.flicker + Math.sin(time * 17.3 + a.seed * 2) * a.flicker * 0.5 : 1;
        target = a.intensity * f * (a.when === 'night' ? Math.min(1, night * 1.2) : 1);
      }
      s.cur += (target - s.cur) * k;
      if (s.next && s.cur < 0.06) { this.place(s, s.next); }
      if (s.a?.follow) s.l.position.copy(s.a.pos);
      s.l.intensity = s.cur;
    }
  }
}
