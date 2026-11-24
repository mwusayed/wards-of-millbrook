// Rain you can see: a box of falling streaks that follows the camera (one draw call).
import * as THREE from 'three';
import type { Weather } from '../sim/days';

export class WeatherFx {
  rain: THREE.LineSegments;
  private n = 700; private pos: Float32Array; private speed: Float32Array;
  constructor(scene: THREE.Scene) {
    this.pos = new Float32Array(this.n * 6); this.speed = new Float32Array(this.n);
    for (let i = 0; i < this.n; i++) { this.seed(i, Math.random() * 14); this.speed[i] = 15 + Math.random() * 7; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xa8bfd0, transparent: true, opacity: 0.42, depthWrite: false }));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
  }
  private seed(i: number, y: number) {
    const x = (Math.random() - 0.5) * 34, z = (Math.random() - 0.5) * 34, o = i * 6;
    this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.pos[o + 3] = x + 0.06; this.pos[o + 4] = y + 0.5; this.pos[o + 5] = z;
  }
  /** `on`: raining and the player can see the sky. */
  update(dt: number, cam: THREE.Vector3, weather: Weather, on: boolean) {
    const show = on && (weather === 'rain' || weather === 'storm');
    this.rain.visible = show; if (!show) return;
    this.rain.position.set(cam.x, 0, cam.z);
    const k = weather === 'storm' ? 1.4 : 1;
    for (let i = 0; i < this.n; i++) {
      const o = i * 6, d = this.speed[i] * k * dt;
      this.pos[o + 1] -= d; this.pos[o + 4] -= d;
      if (this.pos[o + 1] < 0) this.seed(i, 12 + Math.random() * 3);
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}
