// v0.9: the Saltway Coast (docs/gdd/saltway.md). Everything south of the Whisper Stones: the Salt Gap and its
// rockfall, the Saltway with Old Treloar's shrine and the ruined Gull Tower, Gullhaven on its bay (quay, boats,
// inn, customs house, chandlery, auction, net lofts, sea chapel, slipway), the lighthouse on the headland, the
// tidal flats with the wreck of the Merry Wren, and Wreckers' Cove with the sea-cave mouth. The sea rises and
// falls with the tide (sim/south.ts); the flats are covered at high water.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bakeSkinned } from './bake';
import { World, MAT, M } from './world';
import type { Region } from './east';

export interface SouthRefs {
  regions: Region[];
  map: { roads: [number, number][][]; trails: [number, number][][]; water: [number, number, number, number][]; forest: [number, number, number, number][]; fields: [number, number, number, number][]; walls: [number, number, number, number][]; hills: [number, number, number, number][]; flats: [number, number, number, number] };
  rockfall: { meshes: THREE.Object3D[]; collider: { minX: number; maxX: number; minZ: number; maxZ: number; h: number }; open: boolean };
  boats: THREE.Object3D[]; gulls: Gull[]; beam: THREE.Mesh; lampRoom: THREE.Mesh; sea: THREE.Group; seaY: number;
  wreck: THREE.Vector3; tower: THREE.Vector3; cave: THREE.Vector3; charge: THREE.Vector3; town: THREE.Vector3;
  openGap(instant?: boolean): void;
  closeGap(): void;
  /** tide: −1 low water … +1 high water (sim/south.tideLevel). */
  setTide(tide: number): void;
  animate(dt: number, t: number, player: THREE.Vector3, night: number): void;
}
export interface Gull { root: THREE.Group; wings: THREE.Object3D[]; c: THREE.Vector3; r: number; h: number; a: number; sp: number }

export const GAP = { minX: -5, maxX: 9, z0: 136, z1: 178, rock: 147 };
export const FLATS = { minX: -64, maxX: 34, minZ: 348, maxZ: 404, deep: 368 };
export const WRECK = { x: -22, z: 384 };
export const QUAY_Z = 366.5;
export const TOWN = { minX: 36, maxX: 140, minZ: 316, maxZ: 367 };
export const LIGHT = { x: 154, z: 390 };
export const COVE = { x: -98, z: 372 };
export const CAVE = { x: -116, z: 378 };
export const GULL_TOWER = { x: 64, z: 246 };
export const SHRINE = { x: 20, z: 200 };
/** Sea level for a tide value: −0.6 at low water, −0.06 at high water (the flats sand lies at −0.1 to −0.22). */
export const seaLevel = (tide: number) => -0.33 + 0.27 * tide;

export function buildSouth(w: World): SouthRefs {
  let seed = 9091;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mats = {
    dirt: M(0x8e7c5c), cobble: M(0x8a8478), sand: M(0xcbb98e), wetSand: M(0x9a8a68), shingle: M(0x7a766e), grass: M(0x6a8a4a), dune: M(0xa8a86a),
    wallWhite: M(0xe4ddcc), wallBlue: M(0x9ab4c4), wallOchre: M(0xd8b87a), wallTar: M(0x2e2c2a), slate: M(0x4a5260), slateDark: M(0x3a404a), red: M(0xa8342a),
    sea: M(0x2f5868, { roughness: 0.12, metalness: 0.3 }), shallows: M(0x5a8a90, { roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.72 }),
    foam: M(0xe8eef0), net: M(0x6a7a5a), rope: M(0x9a8a62), hull: M(0x4a3a2c), hullPaint: M(0x2a4a6a), hullRed: M(0x8a3a2a), sail: M(0xd8ccb0), mussel: M(0x1e2230),
    samphire: M(0x6a9a3a), thrift: M(0xd87aa0), gorse: M(0x3f5a2a), gorseFlower: M(0xd8b02a), barnacle: M(0xb8b0a0), weed: M(0x3a4a2a), canvas: M(0xc8bc9a),
    beam: new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    lamp: M(0xfff0c0, { emissive: 0xffe0a0, emissiveIntensity: 0.2 }), glass: M(0xd8e8f0, { roughness: 0.1, metalness: 0.4 }), fish: M(0x8a9aa8, { metalness: 0.3, roughness: 0.4 }),
  };
  // ---------------- ground ----------------
  // walkable land is flat at y = 0; hills rise north of the coast plain and beside the gap; cliffs east and west;
  // the sea floor drops away beyond the shore. The flats sand lies just under the high-water mark.
  const shoreZ = (x: number) => x < FLATS.minX ? 392 : x < FLATS.maxX ? FLATS.maxZ : x < 117.5 ? QUAY_Z + 0.5 : x < 122.5 ? 402 : x < 140 ? 369 : x < 172 ? 398 : 300;
  const height = (x: number, z: number) => {
    const n = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.041 + z * 0.057) * 0.5;
    let hill = 0;
    // the escarpment along the north edge of the coast plain, cut by the Salt Gap; it stands taller than the
    // Westmarch's and the Reach's southern hills, which end inside it
    if (z < GAP.z1) { const outside = x < GAP.minX ? GAP.minX - x : x > GAP.maxX ? x - GAP.maxX : 0; hill = Math.min(26, (GAP.z1 - z) * 2.4 + 4) * Math.min(1, outside / 3); }
    hill = Math.max(hill, (-120 - x) * 2.2, (x - 178) * 1.8);
    if (hill > 0) return Math.min(22, hill) + n * 2.0 * Math.min(1, hill / 5);
    const sz = shoreZ(x);
    if (x > FLATS.minX && x < FLATS.maxX && z > FLATS.minZ && z < FLATS.maxZ) return -0.1 - Math.max(0, (z - FLATS.minZ) / (FLATS.maxZ - FLATS.minZ)) * 0.12 + n * 0.015;
    if (z > sz) return -1.6 - Math.min(2, (z - sz) * 0.1);
    return 0;
  };
  const groundPlane = (X0: number, X1: number, Z0: number, Z1: number, step: number) => {
    const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, Math.round((X1 - X0) / step), Math.round((Z1 - Z0) / step));
    const pos = geo.attributes.position as THREE.BufferAttribute; const col: number[] = []; const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (X0 + X1) / 2, z = -pos.getY(i) + (Z0 + Z1) / 2;
      const n = Math.sin(x * 0.19) * Math.cos(z * 0.15) * 0.5 + Math.sin(x * 0.045 + z * 0.06) * 0.5;
      const y = height(x, z); pos.setZ(i, y);
      const sz = shoreZ(x), toShore = sz - z;
      const flats = x > FLATS.minX && x < FLATS.maxX && z > FLATS.minZ - 2 && z < FLATS.maxZ;
      const town = x > TOWN.minX && x < TOWN.maxX && z > TOWN.minZ && z < TOWN.maxZ;
      if (y < -0.5) c.set(0x4a5a58).multiplyScalar(0.85 + n * 0.08);                                   // sea floor
      else if (y > 0.3) c.setHSL(0.22 - n * 0.02, 0.18, 0.34 + Math.min(0.1, y * 0.004));             // hillside
      else if (flats) c.set(z > FLATS.deep ? 0x8a7c5e : 0xa8966e).multiplyScalar(0.92 + n * 0.08);       // wet sand
      else if (x < FLATS.minX && toShore < 22) c.set(0x7a766e).multiplyScalar(0.9 + n * 0.1);          // the cove's shingle
      else if (toShore < 7 && !town) c.set(0xcbb98e).multiplyScalar(0.92 + n * 0.06);                  // beach
      else if (town) c.setHSL(0.12, 0.08, 0.5 + n * 0.03);                                              // packed earth and cobbles
      else c.setHSL(0.21 + n * 0.02, 0.3, 0.36 + n * 0.04);                                             // coastal grass
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    g.rotation.x = -Math.PI / 2; g.position.set((X0 + X1) / 2, -0.008, (Z0 + Z1) / 2); g.receiveShadow = true; w.scene.add(g);
  };
  groundPlane(-132, 190, 136, 300, 2.5);
  groundPlane(-132, 190, 300, 448, 2.5);
  // ---------------- the sea ----------------
  // only where there is water (never under walkable land, which would shimmer), merged into one mesh
  const sea = new THREE.Group(); w.scene.add(sea);
  {
    const parts = ([[-140, FLATS.minX, 392, 470], [FLATS.minX, FLATS.maxX, FLATS.maxZ, 470], [FLATS.maxX, 117.5, QUAY_Z + 0.3, 470], [117.5, 122.5, 402, 470], [122.5, 140, 369, 470], [140, 172, 398, 470], [172, 200, 300, 470]] as [number, number, number, number][])
      .map(([x0, x1, z0, z1]) => new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0, (z0 + z1) / 2));
    const open = new THREE.Mesh(mergeGeometries(parts, false)!, mats.sea); open.receiveShadow = true; sea.add(open); parts.forEach(g => g.dispose());
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(FLATS.maxX - FLATS.minX, FLATS.maxZ - FLATS.minZ + 1).rotateX(-Math.PI / 2), mats.shallows); sh.position.set((FLATS.minX + FLATS.maxX) / 2, 0, (FLATS.minZ - 1 + FLATS.maxZ) / 2); sea.add(sh);
  }
  // ---------------- edges of the world ----------------
  {
    // Millbrook's old south edge at z = 136 opens only at the Salt Gap
    const i = w.colliders.findIndex(c => c.minZ === 136 && c.maxZ === 138 && c.minX === -64 && c.maxX === 64); if (i >= 0) w.colliders.splice(i, 1);
    w.colliders.push(
      { minX: -64, maxX: GAP.minX, minZ: 136, maxZ: 138, h: 9 }, { minX: GAP.maxX, maxX: 64, minZ: 136, maxZ: 138, h: 9 },
      { minX: -128, maxX: GAP.minX, minZ: 138, maxZ: GAP.z1, h: 9 }, { minX: GAP.maxX, maxX: 186, minZ: 138, maxZ: GAP.z1, h: 9 },     // the gorge walls and the hills
      { minX: -128, maxX: -120, minZ: GAP.z1, maxZ: 460, h: 9 }, { minX: 178, maxX: 186, minZ: GAP.z1, maxZ: 300, h: 9 },             // cliffs west and east
      // the sea: the cove, beyond the sandbar, the harbour, beside the breakwater, off the headland
      { minX: -128, maxX: FLATS.minX, minZ: 392.5, maxZ: 460, h: 9 }, { minX: FLATS.minX, maxX: FLATS.maxX, minZ: FLATS.maxZ, maxZ: 460, h: 9 },
      { minX: FLATS.maxX, maxX: 117.5, minZ: QUAY_Z + 0.6, maxZ: 460, h: 9 }, { minX: 117.5, maxX: 122.5, minZ: 402, maxZ: 460, h: 9 },
      { minX: 122.5, maxX: 140, minZ: 369, maxZ: 460, h: 9 }, { minX: 140, maxX: 186, minZ: 398, maxZ: 460, h: 9 }, { minX: 170, maxX: 186, minZ: 300, maxZ: 398, h: 9 },
    );
    w.bounds = { minX: w.bounds.minX, maxX: w.bounds.maxX, minZ: w.bounds.minZ, maxZ: 440 };
  }
  // ---------------- helpers ----------------
  const pathSeg = (x1: number, z1: number, x2: number, z2: number, wd: number, mat: THREE.Material, y = 0.013) => {
    const len = Math.hypot(x2 - x1, z2 - z1); const p = new THREE.Mesh(new THREE.PlaneGeometry(wd, len + wd * 0.6), mat);
    p.rotation.x = -Math.PI / 2; p.rotation.z = -Math.atan2(x2 - x1, z2 - z1); p.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); p.receiveShadow = true; w.scene.add(p);
  };
  const road = (pts: [number, number][], wd = 3.0, mat: THREE.Material = mats.dirt) => { for (let i = 1; i < pts.length; i++) pathSeg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], wd, mat); };
  const rock = (x: number, z: number, s: number, collide = true, mat: THREE.Material = MAT.rock) => {
    w.put(mat === MAT.rock ? 'sRock' : 'sRockD', () => new THREE.DodecahedronGeometry(1, 0), mat, V(x, s * 0.35, z), new THREE.Euler(rnd() * 3, rnd() * 3, 0), V(s, s * 0.7, s));
    if (collide) w.colliders.push({ minX: x - s * 0.8, maxX: x + s * 0.8, minZ: z - s * 0.8, maxZ: z + s * 0.8, h: s });
  };
  const gorse = (x: number, z: number, s: number) => {
    w.put('sGorse', () => new THREE.IcosahedronGeometry(0.6, 0), mats.gorse, V(x, 0.42 * s, z), new THREE.Euler(0, rnd() * 6, 0), V(s, s * 0.8, s));
    for (let i = 0; i < 3; i++) w.put('sGorseF', () => new THREE.BoxGeometry(0.09, 0.09, 0.09), mats.gorseFlower, V(x + Math.cos(i * 2.1) * 0.45 * s, (0.5 + (i % 2) * 0.25) * s, z + Math.sin(i * 2.1) * 0.45 * s), undefined, undefined, false);
  };
  const tuft = (x: number, z: number, s: number, m: THREE.Material = mats.dune) => w.put(m === mats.dune ? 'sDune' : 'sThrift', () => new THREE.ConeGeometry(0.25, 0.5, 4), m, V(x, 0.2 * s, z), new THREE.Euler(0, rnd() * 6, (rnd() - 0.5) * 0.3), V(s, s, s), false);
  const pine = (x: number, z: number, s: number) => {
    const ry = new THREE.Euler(0, rnd() * 6, 0.12), sc = V(s, s, s);
    w.put('sPineT', () => new THREE.CylinderGeometry(0.15, 0.24, 2.4, 6), MAT.bark, V(x, 1.2 * s, z), ry, sc);
    for (let i = 0; i < 3; i++) w.put('sPine' + i, () => new THREE.ConeGeometry(1.4 - i * 0.36, 2.0, 7), MAT.leafDark, V(x + 0.3 * s, (2.4 + i * 1.0) * s, z), ry, sc);
    w.colliders.push({ minX: x - 0.28 * s, maxX: x + 0.28 * s, minZ: z - 0.28 * s, maxZ: z + 0.28 * s, h: 4 });
    w.cameraBlockers.push({ minX: x - 1 * s, maxX: x + 1 * s, minZ: z - 1 * s, maxZ: z + 1 * s, h: 5 * s });
  };
  /** A whole building: walls with doors, a roof that hides when you walk in, windows that glow at night. */
  const house = (name: string, minX: number, maxX: number, minZ: number, maxZ: number, o: { h?: number; wall?: THREE.Material; roof?: THREE.Material; doors: ['n' | 's' | 'e' | 'w', number, number][]; windows?: boolean; floor?: THREE.Material; chimney?: boolean }) => {
    const h = o.h ?? 3.4;
    w.shell(minX, maxX, minZ, maxZ, h, o.doors, o.wall ?? mats.wallWhite);
    w.roof(minX, maxX, minZ, maxZ, h, o.roof ?? mats.slate, name);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX - 0.3, 0.05, maxZ - minZ - 0.3), o.floor ?? MAT.woodLight); fl.position.set((minX + maxX) / 2, 0.02, (minZ + maxZ) / 2); fl.receiveShadow = true; w.scene.add(fl);
    if (o.windows !== false) {
      for (const [side, along] of [['n', (minX + maxX) / 2], ['s', (minX + maxX) / 2], ['e', (minZ + maxZ) / 2], ['w', (minZ + maxZ) / 2]] as ['n' | 's' | 'e' | 'w', number][]) {
        const offs = side === 'n' || side === 's' ? (maxX - minX > 9 ? [-2.6, 2.6] : [-1.6]) : (maxZ - minZ > 9 ? [-2.4, 2.4] : [1.4]);
        for (const off of offs) {
          const c = along + off; if (o.doors.some(d => d[0] === side && Math.abs(d[1] - c) < d[2] / 2 + 0.7)) continue;
          if (side === 'n') w.window(c, minZ, 1.7, 0, true); else if (side === 's') w.window(c, maxZ, 1.7, 0, true); else if (side === 'e') w.window(maxX, c, 1.7, Math.PI / 2, true); else w.window(minX, c, 1.7, Math.PI / 2, true);
        }
      }
    }
    if (o.chimney) w.block(maxX - 1.1, minZ + 1.1, 0.8, 0.8, h + 2.2, MAT.stoneDark, 0, false);
  };
  const lamp = (x: number, z: number) => w.lantern(x, z, 2.6, true);
  const crate = (x: number, z: number, s = 0.8) => w.block(x, z, s, s, s, MAT.woodLight);
  const barrel = (x: number, z: number) => { const b = w.cyl(x, z, 0.38, 0.95, MAT.wood, 0, 8); b.castShadow = true; };
  const hearth = (x: number, z: number) => {
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), MAT.stoneDark); st.position.set(x + Math.cos(a) * 0.62, 0.12, z + Math.sin(a) * 0.62); w.add(st); }
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 6), MAT.fire.clone()); f.position.set(x, 0.38, z); w.scene.add(f); w.fires.push(f); w.lights.add(x, 1.0, z, 0xff9a40, 13, 12, 1.5, { flicker: 0.12 });
    w.colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7, h: 0.5 });
  };
  const boats: THREE.Object3D[] = [];
  const boat = (x: number, z: number, rot: number, o: { mast?: boolean; paint?: THREE.Material; len?: number } = {}) => {
    const L = o.len ?? 4.2, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; w.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, L), mats.hull); hull.position.y = 0.1; g.add(hull);
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.14, L * 0.98), o.paint ?? mats.hullPaint); band.position.y = 0.3; g.add(band);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.76, 1.3, 4), mats.hull); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.1, -L / 2 - 0.6); bow.scale.set(1, 1, 0.5); g.add(bow);
    for (const zz of [-0.6, 0.6]) { const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.3), MAT.woodLight); seat.position.set(0, 0.36, zz); g.add(seat); }
    if (o.mast) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 5.5, 6), MAT.timber); m.position.set(0, 2.9, -0.5); g.add(m); const sl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.2), mats.sail); sl.position.set(0.05, 3.0, 0.4); sl.rotation.y = Math.PI / 2; (sl.material as THREE.Material).side = THREE.DoubleSide; g.add(sl); }
    w.add(g); boats.push(g); return g;
  };
  const critter: Gull[] = [];
  const gull = (cx: number, cz: number, r: number, h: number) => {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); w.scene.add(root);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), M(0xf0f0ec)); b.scale.set(0.8, 0.8, 1.9); body.add(b);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), M(0xf4f4f0)); head.position.set(0, 0.06, -0.3); body.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.1, 4), M(0xd8a030)); beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.05, -0.42); body.add(beak);
    const wings: THREE.Object3D[] = [];
    for (const sx of [-1, 1]) { const wg = new THREE.Group(); wg.position.set(sx * 0.1, 0.04, 0); body.add(wg); const wm = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.24), M(0xb8bcc4)); wm.position.x = sx * 0.31; wg.add(wm); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.18), M(0x2a2a2a)); tip.position.x = sx * 0.66; wg.add(tip); wings.push(wg); }
    bakeSkinned(root, [body, ...wings], 0.6);
    critter.push({ root, wings, c: V(cx, 0, cz), r, h, a: rnd() * 6.28, sp: (0.25 + rnd() * 0.2) * (rnd() < 0.5 ? 1 : -1) });
  };

  // ---------------- the Salt Gap ----------------
  const rockMeshes: THREE.Object3D[] = [];
  const rockCollider = { minX: GAP.minX, maxX: GAP.maxX, minZ: GAP.rock - 3, maxZ: GAP.rock + 3, h: 4 };
  {
    road([[2, 120], [2, 136], [2, 160], [3, GAP.z1]], 2.6, MAT.path);
    // the gorge: tall broken walls of rock on both sides
    for (let z = 138; z < GAP.z1 + 4; z += 3.2) {
      for (const [x, sx] of [[GAP.minX - 1.6, -1], [GAP.maxX + 1.6, 1]] as [number, number][]) {
        const s = 2.2 + rnd() * 1.6; w.put('sCliff', () => new THREE.DodecahedronGeometry(1, 0), MAT.rock, V(x + sx * rnd() * 1.2, s * 0.8 + rnd() * 2, z + rnd() * 1.5), new THREE.Euler(rnd() * 3, rnd() * 3, 0), V(s, s * 1.6, s));
        const s2 = 1.6 + rnd(); w.put('sCliff', () => new THREE.DodecahedronGeometry(1, 0), MAT.rock, V(x + sx * (2.4 + rnd()), s2 * 2 + 3, z + rnd() * 2), new THREE.Euler(rnd() * 3, rnd() * 3, 0), V(s2, s2 * 1.3, s2));
      }
    }
    // the rockfall: boulders wedged across the gorge (removed when blasted)
    for (let i = 0; i < 9; i++) {
      const s = 1.1 + rnd() * 0.9, x = GAP.minX + 1 + (i % 5) * 2.9 + rnd(), y = s * 0.6 + (i >= 5 ? 1.2 : 0), z = GAP.rock + (rnd() - 0.5) * 3;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MAT.rock); m.position.set(x, y, z); m.rotation.set(rnd() * 3, rnd() * 3, 0); m.scale.set(s, s * 0.8, s); w.add(m); rockMeshes.push(m);
    }
    w.colliders.push(rockCollider);
    w.interact('rockfall', (GAP.minX + GAP.maxX) / 2, GAP.rock - 4, 'Set a blasting charge under the rockfall', 'interact', 2.2, 0);
    w.interact('milestone_s', 6.2, 186, 'Read the milestone', 'interact', 1.3);
    { const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, 0.25), MAT.stone); m.position.set(5.8, 0.55, 186); m.rotation.y = 0.3; w.add(m); w.colliders.push({ minX: 5.5, maxX: 6.1, minZ: 185.8, maxZ: 186.2, h: 1.1 }); }
  }
  // ---------------- the Saltway ----------------
  const SALTWAY: [number, number][] = [[3, GAP.z1], [10, 192], [20, 203], [34, 218], [48, 236], [56, 256], [62, 276], [68, 298], [72, 316], [76, 330], [76, 338]];
  road(SALTWAY, 3.0);
  // Old Treloar's shrine: a stone niche with a cart wheel and a salt-crusted saint
  {
    const S0 = SHRINE; w.block(S0.x - 2.2, S0.z, 1.2, 1.0, 1.6, MAT.stone); w.block(S0.x - 2.2, S0.z, 1.4, 1.2, 0.25, MAT.stoneDark, 1.6, false);
    const saint = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.6, 6), mats.wallWhite); saint.position.set(S0.x - 2.2, 1.9, S0.z + 0.2); w.add(saint);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.06, 4, 12), MAT.timber); wheel.position.set(S0.x - 1.3, 0.62, S0.z + 0.7); wheel.rotation.y = 0.4; w.add(wheel);
    w.interact('shrine_s', S0.x - 1.4, S0.z + 1.2, 'Old Treloar\'s shrine', 'interact', 1.4, Math.PI);
    crate(S0.x + 2.6, S0.z - 1.4, 0.7); w.block(S0.x + 3.6, S0.z - 0.6, 1.8, 3.2, 0.7, MAT.woodLight);    // a salt cart's bed, wheels off
  }
  // rough grass, gorse, thrift, wind-bent pines and rocks over the plain
  for (let i = 0; i < 150; i++) {
    const x = -112 + rnd() * 286, z = 182 + rnd() * 140;
    if (Math.abs(x - 40) < 40 && Math.abs(z - 245) < 70 && SALTWAY.some(([px, pz]) => Math.hypot(px - x, pz - z) < 6)) continue;
    if (x > TOWN.minX - 4 && z > TOWN.minZ - 6) continue;
    if (Math.hypot(x - GULL_TOWER.x, z - GULL_TOWER.z) < 12) continue;
    const r = rnd(); if (r < 0.42) gorse(x, z, 0.7 + rnd() * 0.7); else if (r < 0.72) tuft(x, z, 0.8 + rnd() * 0.6, r < 0.6 ? mats.dune : mats.thrift); else if (r < 0.86) rock(x, z, 0.5 + rnd() * 0.9, rnd() < 0.5); else pine(x, z, 0.85 + rnd() * 0.4);
  }
  for (let i = 0; i < 60; i++) { const x = -60 + rnd() * 100, z = 330 + rnd() * 18; if (x > 36) continue; tuft(x, z, 0.9 + rnd() * 0.5); }    // dune grass behind the flats
  // ---------------- the Gull Tower ----------------
  {
    const T = GULL_TOWER, r = 4;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2; if (a > Math.PI * 0.42 && a < Math.PI * 0.58) continue;       // the doorway, facing south
      const h = 3 + Math.abs(Math.sin(i * 1.7)) * 4.5 + (i < 8 ? 1.5 : 0);
      const x = T.x + Math.cos(a) * r, z = T.z + Math.sin(a) * r;
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.7, h, 0.9), i % 3 ? MAT.stone : MAT.stoneDark); b.position.set(x, h / 2, z); b.rotation.y = -a + Math.PI / 2; w.add(b);
      w.colliders.push({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.8, maxZ: z + 0.8, h });
    }
    for (let i = 0; i < 8; i++) rock(T.x + (rnd() - 0.5) * 5, T.z + (rnd() - 0.5) * 5, 0.4 + rnd() * 0.4, false, MAT.stoneDark);
    // the false light: an iron bracket in a window slit facing the sea, and the lantern on its hook
    w.block(T.x, T.z + r - 1.0, 0.7, 0.4, 1.2, MAT.stoneDark, 0, true);
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 0.3), M(0xa8342a, { emissive: 0x8a2010, emissiveIntensity: 0.6 })); lantern.position.set(T.x, 1.5, T.z + r - 1.0); lantern.name = 'signalLantern'; w.scene.add(lantern);
    w.interact('tower_lantern', T.x, T.z + r - 2.2, 'The lantern on the hook', 'pick', 1.4, 0);
    // the smugglers' camp below it
    const tent = (x: number, z: number, rot: number) => { const t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.0, 4, 1, true), mats.canvas); t.position.set(x, 1.0, z); t.rotation.y = rot; (t.material as THREE.Material).side = THREE.DoubleSide; w.add(t); w.colliders.push({ minX: x - 1.1, maxX: x + 1.1, minZ: z - 1.1, maxZ: z + 1.1, h: 2 }); };
    tent(T.x - 9, T.z + 6, 0.3); tent(T.x + 8, T.z + 8, 1.1); crate(T.x - 6, T.z + 9); crate(T.x - 5.2, T.z + 9.6, 0.6); barrel(T.x + 5, T.z + 10);
  }
  // ---------------- Gullhaven ----------------
  const town = V(84, 0, 340);
  {
    road([[76, 338], [76, QUAY_Z - 0.5]], 3.2, mats.cobble);
    road([[40, 338], [134, 338]], 3.4, mats.cobble);                                // the street
    road([[134, 338], [140, 352], [146, 366], [150, 380], [151, 386]], 2.2, mats.dirt); // to the lighthouse
    road([[44, 338], [40, 346], [30, 350], [12, 352]], 2.0, mats.dirt);              // down to the flats
    road([[12, 352], [-20, 352], [-58, 355], [-86, 362], [-98, 368]], 1.6, mats.wetSand);   // the shore path to the cove
    // the quay: a long stone edge with bollards, steps and the breakwater
    w.block((FLATS.maxX + 117.5) / 2, QUAY_Z, 117.5 - FLATS.maxX, 1.0, 0.14, MAT.stone, -0.12, false);
    for (let x = 40; x < 116; x += 6.5) { const b = w.cyl(x, QUAY_Z - 0.3, 0.16, 0.6, MAT.iron, 0, 6, true); void b; }
    for (let z = QUAY_Z; z < 402; z += 2) w.block(120, z + 1, 5, 2, 0.4, z % 4 ? MAT.stone : MAT.stoneDark, -0.3, false);
    { const bc = w.cyl(120, 401, 0.5, 2.4, mats.red, 0, 8); void bc; w.lantern(118.2, 399.5, 2.6, true); }
    w.interact('fish_sea', 120, 400.2, 'Fish off the end of the breakwater', 'fish', 1.6, Math.PI);
    // houses: whitewash, blue and ochre washes, slate roofs
    house('Harbour office', 54, 62, 352, 360, { doors: [['s', 58, 1.4]], h: 3.2, wall: mats.wallBlue });
    w.block(57.2, 353.3, 2.0, 0.8, 0.9, MAT.woodLight); w.interact('tide_table', 58, 355, 'The harbourmaster\'s tide table', 'interact', 1.3, 0);
    house('The Anchor and Gull', 66, 82, 340, 354, { doors: [['s', 74, 1.8]], h: 3.8, chimney: true });
    { w.block(70, 343.4, 6, 1.0, 1.05, MAT.woodLight); hearth(80, 348); for (const [tx, tz] of [[69, 349.5], [73, 349.8], [76.5, 346.5]]) { w.block(tx, tz, 1.4, 1.0, 0.75, MAT.wood); }
      w.interact('inn_bar_s', 70, 345, 'Lean on the bar at the Anchor and Gull', 'interact', 1.6, 0);
      w.block(80.6, 341.4, 1.3, 2.2, 0.5, MAT.linen); w.interact('inn_bed_s', 79.4, 342, 'Take a bed at the Anchor and Gull', 'sleep', 1.4, Math.PI / 2); }
    { const sg = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.08), MAT.woodLight); sg.position.set(77.6, 3.0, 354.3); w.add(sg); }
    house('Customs House', 88, 98, 342, 352, { doors: [['s', 93, 1.6]], h: 4.2, wall: MAT.stone, roof: mats.slateDark });
    { w.block(91, 344.2, 2.2, 1.0, 0.85, MAT.wood); w.interact('customs_desk', 91, 345.6, 'Collector Marrow\'s desk', 'interact', 1.3, 0); for (let i = 0; i < 3; i++) w.block(96.6, 343 + i * 1.2, 0.6, 1.0, 1.9, MAT.woodLight); }
    house('Chandlery', 102, 110, 344, 352, { doors: [['s', 106, 1.6]], h: 3.2, wall: mats.wallOchre });
    { w.block(106, 346.0, 4, 0.8, 0.95, MAT.woodLight); w.interact('chandlery', 106, 347.4, 'Pasco Hendy\'s chandlery', 'interact', 1.4, 0); for (let i = 0; i < 3; i++) { const c = w.cyl(103 + i * 0.8, 350.8, 0.3, 0.5, mats.rope, 0, 8, false); void c; } }
    house('Net lofts', 114, 124, 336, 346, { doors: [['s', 119, 2.0]], h: 3.6, wall: mats.wallTar, roof: mats.slateDark });
    house('Sea chapel', 42, 50, 324, 334, { doors: [['e', 329, 1.6]], h: 4.6 });
    { const bell = w.cyl(48.4, 325.6, 0.08, 0.3, MAT.iron, 3.4, 6, false); void bell; w.block(44, 329, 1.0, 2.0, 0.9, MAT.wood); w.interact('sea_chapel', 45.4, 329, 'Kneel in the sea chapel', 'interact', 1.4, -Math.PI / 2);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 4, 8), MAT.iron); hook.position.set(50.6, 2.6, 330.9); w.add(hook);
      const shipBell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 0.42, 8, 1, true), M(0x6a8a6a, { metalness: 0.6, roughness: 0.5 })); shipBell.position.set(50.7, 2.2, 330.9); shipBell.name = 'wrenBell'; shipBell.visible = false; w.scene.add(shipBell); }
    house('Cottage', 58, 64, 322, 328, { doors: [['s', 61, 1.2]], h: 3.0, wall: mats.wallWhite });
    house('Cottage', 68, 74, 320, 326, { doors: [['s', 71, 1.2]], h: 3.0, wall: mats.wallOchre });
    house('Cottage', 98, 104, 322, 328, { doors: [['s', 101, 1.2]], h: 3.0, wall: mats.wallBlue });
    house('Cottage', 108, 114, 324, 330, { doors: [['s', 111, 1.2]], h: 3.0 });
    house('Cottage', 126, 132, 328, 334, { doors: [['s', 129, 1.2]], h: 3.0, wall: mats.wallOchre });
    // the fish auction: a roof on posts over the quay, with fish on the tables
    { for (const [px, pz] of [[84.3, 358.3], [97.7, 358.3], [84.3, 364.2], [97.7, 364.2], [91, 358.3], [91, 364.2]]) w.block(px, pz, 0.25, 0.25, 3.0, MAT.timber);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.25, 6.8), mats.slate); rf.position.set(91, 3.1, 361.25); rf.rotation.x = 0.06; w.add(rf);
      for (const tx of [87, 91, 95]) { w.block(tx, 361.2, 2.6, 1.2, 0.85, MAT.woodLight); for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.45), mats.fish); f.position.set(tx - 0.9 + i * 0.6, 0.9, 361.2); f.rotation.y = 0.2 * i; w.add(f); } }
      w.interact('auction', 91, 359.6, 'Morwenna Kitto\'s fish auction', 'interact', 1.6, Math.PI); }
    // the slipway with a half-built boat on it
    { const ramp = new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 14), MAT.wood); ramp.position.set(131, 0.02, 362); ramp.rotation.x = 0.03; w.add(ramp);
      const hullF = boat(131, 360, 0, { len: 6, paint: mats.hullRed }); boats.splice(boats.indexOf(hullF), 1); hullF.position.y = 0.6; w.colliders.push({ minX: 129.8, maxX: 132.2, minZ: 356.4, maxZ: 363.6, h: 1.4 });
      for (const zz of [357, 360, 363]) w.block(131, zz, 2.2, 0.3, 0.45, MAT.timber, 0, false);
      w.interact('shipwright', 127.6, 358, 'Tegen Rowse\'s slipway', 'interact', 1.4, Math.PI / 2); }
    // nets on racks along the quay, lobster pots, crates and barrels
    for (const nx of [102, 108, 113]) { for (const dx of [-1.4, 1.4]) w.block(nx + dx, 362.5, 0.14, 0.14, 2.0, MAT.timber, 0, true); const net = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.6), mats.net); net.position.set(nx, 1.2, 362.5); (net.material as THREE.Material).side = THREE.DoubleSide; w.add(net); }
    for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.5, 6, 1, true), mats.rope); p.position.set(45 + i * 1.1, 0.25, 363.5 + (i % 2) * 0.6); (p.material as THREE.Material).side = THREE.DoubleSide; w.add(p); }
    w.block(81, 364.7, 1.8, 0.45, 0.45, MAT.wood, 0, false);                     // Captain Vosper's bench
    crate(64, 363.6); crate(64.9, 364.1, 0.6); barrel(66.2, 363.2); barrel(110, 359.2); crate(52, 362.4); barrel(126.2, 352.2);
    // market stalls in the square by the inn
    for (const [sx, sz, c] of [[86, 331, MAT.cloth], [92, 331, MAT.clothBlue], [98, 333, MAT.cloth]] as [number, number, THREE.Material][]) {
      w.block(sx, sz, 2.4, 1.2, 0.9, MAT.woodLight); for (const dx of [-1.1, 1.1]) w.block(sx + dx, sz - 0.5, 0.1, 0.1, 2.2, MAT.timber, 0, false);
      const aw = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.06, 1.6), c); aw.position.set(sx, 2.25, sz - 0.3); aw.rotation.x = 0.18; w.add(aw);
    }
    { w.cyl(80, 334.6, 0.35, 1.0, MAT.stone); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.7), MAT.iron); arm.position.set(80, 1.1, 334.2); w.add(arm); w.interact('pump_s', 80, 333.6, 'Drink from the town pump', 'drink', 1.3, 0); }
    { w.block(64, 361.4, 0.18, 0.18, 2.0, MAT.timber); const bd = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.08), MAT.woodLight); bd.position.set(64, 1.7, 361.3); w.add(bd); w.interact('notice_coast', 64, 360.2, 'Gullhaven\'s notice post', 'interact', 1.4, Math.PI); }
    for (const [lx, lz] of [[46, 340], [62, 340], [86, 340], [104, 340], [122, 340], [52, 364.8], [72, 364.8], [100, 364.8], [116, 364.8]] as [number, number][]) lamp(lx, lz);
    // boats in the harbour, and one pulled up on the shingle at the cove
    boat(48, 374, 0.1); boat(58, 378, -0.2, { mast: true, paint: mats.hullRed }); boat(70, 373, 0.05); boat(84, 376, 0.25, { mast: true }); boat(100, 374, -0.1, { paint: mats.hullRed }); boat(110, 381, 0.3);
    for (let i = 0; i < 8; i++) gull(60 + rnd() * 60, 350 + rnd() * 40, 8 + rnd() * 14, 8 + rnd() * 8);
  }
  // ---------------- the lighthouse on the headland ----------------
  let beam: THREE.Mesh, lampRoom: THREE.Mesh;
  {
    const L = LIGHT;
    for (let i = 0; i < 5; i++) { const h = 3, r0 = 2.5 - i * 0.16, r1 = 2.5 - (i + 1) * 0.16; const ring = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 12), i % 2 ? mats.red : mats.wallWhite); ring.position.set(L.x, i * h + h / 2, L.z); w.add(ring); }
    w.colliders.push({ minX: L.x - 2.5, maxX: L.x + 2.5, minZ: L.z - 2.5, maxZ: L.z + 2.5, h: 15 });
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.25, 12), MAT.iron); gallery.position.set(L.x, 15.1, L.z); w.add(gallery);
    lampRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 1.8, 10), mats.lamp); lampRoom.position.set(L.x, 16.2, L.z); w.scene.add(lampRoom);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 10), mats.red); cap.position.set(L.x, 17.8, L.z); w.add(cap);
    beam = new THREE.Mesh(new THREE.ConeGeometry(5, 46, 12, 1, true), mats.beam); beam.geometry.translate(0, -23, 0); beam.geometry.rotateX(Math.PI / 2); beam.position.set(L.x, 16.2, L.z); beam.renderOrder = 5; w.scene.add(beam);
    w.lights.add(L.x, 15.5, L.z, 0xffe8b0, 18, 30, 1.2, { when: 'night' });
    house('Keeper\'s cottage', 140, 148, 374, 382, { doors: [['n', 144, 1.3]], h: 3.0 });
    { hearth(146, 380); w.block(141.6, 376.2, 1.2, 2.0, 0.5, MAT.linen); w.interact('keeper_log', 142.6, 378.8, 'The keeper\'s log book', 'interact', 1.2, -Math.PI / 2); }
    for (let i = 0; i < 12; i++) rock(156 + rnd() * 12, 380 + rnd() * 16, 0.6 + rnd() * 0.8, true);
  }
  // ---------------- the tidal flats and the wreck of the Merry Wren ----------------
  {
    // the sandbar: a line of rocks and weed where the flats meet the sea
    for (let x = FLATS.minX + 2; x < FLATS.maxX; x += 3.4) { rock(x + rnd(), FLATS.maxZ - 0.6 + rnd() * 0.8, 0.5 + rnd() * 0.6, false, MAT.stoneDark); w.put('sFoam', () => new THREE.BoxGeometry(2.2, 0.05, 0.5), mats.foam, V(x + 1, -0.06, FLATS.maxZ + 0.6), new THREE.Euler(0, rnd() - 0.5, 0), undefined, false); }
    for (let i = 0; i < 26; i++) { const x = FLATS.minX + 4 + rnd() * (FLATS.maxX - FLATS.minX - 8), z = FLATS.minZ + 6 + rnd() * 42; w.put('sWeed', () => new THREE.CylinderGeometry(0.6, 0.8, 0.06, 6), mats.weed, V(x, -0.1, z), new THREE.Euler(0, rnd() * 6, 0), V(0.6 + rnd(), 1, 0.6 + rnd()), false); }
    // the wreck: a broken hull on its side, ribs, a mast stump
    const W0 = WRECK, g = new THREE.Group(); g.position.set(W0.x, -0.25, W0.z); g.rotation.set(0, 0.6, 0.32); w.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 13), mats.hull); hull.position.y = 0.6; g.add(hull);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.15, 10), MAT.wood); deck.position.set(0, 1.7, 0.6); g.add(deck);
    const bowW = new THREE.Mesh(new THREE.ConeGeometry(2.1, 3.2, 4), mats.hull); bowW.rotation.x = -Math.PI / 2; bowW.rotation.y = Math.PI / 4; bowW.position.set(0, 0.6, -8); bowW.scale.set(1, 1, 0.55); g.add(bowW);
    for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.12, 4, 8, Math.PI), MAT.timber); rib.position.set(0, 0.6, 5.2 + i * 0.9); rib.rotation.z = Math.PI; g.add(rib); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 4.5, 6), MAT.timber); mast.position.set(0, 3.8, -1.5); mast.rotation.z = 0.35; g.add(mast);
    for (let i = 0; i < 18; i++) { const b = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 5), mats.barnacle); b.position.set(2.12, -0.2 + rnd() * 1.4, -5 + rnd() * 10); b.rotation.z = -Math.PI / 2; g.add(b); }
    w.add(g);
    w.colliders.push({ minX: W0.x - 4.6, maxX: W0.x + 4.6, minZ: W0.z - 5.2, maxZ: W0.z + 5.2, h: 2.4 });
    w.interact('wreck_log', W0.x + 5.4, W0.z + 4.4, 'Search the captain\'s cabin', 'pick', 1.6, Math.PI / 2);
    w.interact('wreck_bell', W0.x - 3.0, W0.z - 6.0, 'The ship\'s bell on the foredeck', 'pick', 1.6, 0);
  }
  // mussel beds and samphire (gatherable; regrow each morning)
  const node = (kind: 'mussel' | 'samphire', x: number, z: number, n: number) => {
    const g = new THREE.Group();
    if (kind === 'mussel') for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 3), mats.mussel); m.scale.set(1.4, 0.5, 0.8); m.position.set(Math.cos(i * 1.9) * (0.15 + (i % 3) * 0.12), -0.07, Math.sin(i * 1.9) * (0.15 + (i % 3) * 0.12)); m.rotation.y = i; g.add(m); }
    else for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 4), mats.samphire); b.position.set(Math.cos(i * 1.4) * 0.22, 0.1, Math.sin(i * 1.4) * 0.22); b.rotation.z = (i % 3 - 1) * 0.25; g.add(b); }
    g.position.set(x, 0, z); w.scene.add(g);
    const it = w.interact(`${kind}_${n}`, x, z, kind === 'mussel' ? 'Prise mussels off the bed' : 'Pick samphire', 'pick', 1.3);
    w.nodes.push({ id: it.id, kind, mesh: g, it });
  };
  [[-6, 358], [-30, 362], [8, 364], [-44, 372], [-12, 378], [6, 388], [-36, 392], [-50, 384]].forEach(([x, z], i) => node('mussel', x, z, i));
  [[-48, 351], [-26, 350.4], [-4, 350.6], [18, 351.6], [26, 349.8]].forEach(([x, z], i) => node('samphire', x, z, i));
  // ---------------- Wreckers' Cove ----------------
  {
    const C0 = COVE;
    for (let i = 0; i < 22; i++) rock(-120 + rnd() * 6, 340 + rnd() * 52, 1.2 + rnd() * 1.6, false, MAT.stoneDark);          // the cliff foot
    const tent = (x: number, z: number, rot: number) => { const t = new THREE.Mesh(new THREE.ConeGeometry(1.7, 2.1, 4, 1, true), mats.canvas); t.position.set(x, 1.05, z); t.rotation.y = rot; (t.material as THREE.Material).side = THREE.DoubleSide; w.add(t); w.colliders.push({ minX: x - 1.2, maxX: x + 1.2, minZ: z - 1.2, maxZ: z + 1.2, h: 2 }); };
    tent(C0.x + 4, C0.z - 8, 0.4); tent(C0.x - 6, C0.z - 10, 1.2); hearth(C0.x, C0.z - 5);
    for (let i = 0; i < 5; i++) crate(C0.x + 6 + (i % 3) * 0.9, C0.z - 2 + Math.floor(i / 3) * 0.9, 0.8);
    barrel(C0.x + 9, C0.z - 3); barrel(C0.x + 9.5, C0.z - 4); const rb = boat(C0.x + 3, C0.z + 6, 1.2, { len: 3.4 }); boats.splice(boats.indexOf(rb), 1); rb.position.y = 0.05; rb.rotation.z = 0.25; w.colliders.push({ minX: C0.x + 0.6, maxX: C0.x + 5.4, minZ: C0.z + 4.6, maxZ: C0.z + 7.4, h: 1 });
    // the sea-cave mouth in the cliff: a dark arch behind a grille of old ship's timbers
    const A = CAVE;
    const dark = new THREE.Mesh(new THREE.CircleGeometry(2.4, 12, 0, Math.PI), M(0x050505)); dark.position.set(A.x - 1.2, 0.02, A.z); dark.rotation.y = Math.PI / 2; w.add(dark);
    for (const dz of [-2.6, 2.6]) rock(A.x - 0.6, A.z + dz, 1.8, true, MAT.stoneDark);
    const lintel = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MAT.stoneDark); lintel.position.set(A.x - 0.8, 3.0, A.z); lintel.scale.set(1.6, 1.0, 3.4); w.add(lintel);
    for (let i = 0; i < 5; i++) w.block(A.x - 0.2, A.z - 1.8 + i * 0.9, 0.18, 0.2, 2.6, MAT.timber, 0, false);
    for (const y of [0.7, 1.9]) w.block(A.x - 0.1, A.z, 0.14, 4.0, 0.18, MAT.timber, y, false);
    w.colliders.push({ minX: A.x - 1.6, maxX: A.x + 0.2, minZ: A.z - 2.2, maxZ: A.z + 2.2, h: 3 });
    w.interact('cave_mouth', A.x + 1.4, A.z, 'The timber grille over the sea cave', 'interact', 1.8, -Math.PI / 2);
    lamp(C0.x + 7, C0.z - 6);
  }
  // ---------------- places, regions and the map ----------------
  Object.assign(w.places, {
    salt_gap: V(2, 0, GAP.rock - 5), saltway: V(20, 0, 204), gulltower: V(GULL_TOWER.x, 0, GULL_TOWER.z + 6), gullhaven: V(76, 0, 340), lighthouse: V(LIGHT.x - 6, 0, LIGHT.z - 6),
    flats: V(-12, 0, 356), wreck: V(WRECK.x + 5.4, 0, WRECK.z + 4.4), cove: V(COVE.x + 2, 0, COVE.z - 4), cave_mouth: V(CAVE.x + 1.6, 0, CAVE.z),
    harbour_office: V(58, 0, 361), inn_anchor: V(74, 0, 356), customs: V(93, 0, 353.5), chandlery: V(106, 0, 353.5), auction: V(91, 0, 358), net_lofts: V(119, 0, 347.5),
    sea_chapel: V(51.5, 0, 329), slipway_s: V(127, 0, 356), breakwater: V(120, 0, 398), notice_coast: V(64, 0, 359.6), shrine_s: V(SHRINE.x - 1, 0, SHRINE.z + 2),
  });
  const regions: Region[] = [
    { id: 'saltgap', name: 'the Salt Gap', minX: GAP.minX, maxX: GAP.maxX, minZ: 136, maxZ: GAP.z1 },
    { id: 'gullhaven', name: 'Gullhaven', minX: TOWN.minX, maxX: TOWN.maxX, minZ: TOWN.minZ, maxZ: 404 },
    { id: 'lighthouse', name: 'the lighthouse', minX: 140, maxX: 180, minZ: 360, maxZ: 404 },
    { id: 'flats', name: 'the tidal flats', minX: FLATS.minX, maxX: TOWN.minX, minZ: 342, maxZ: 410 },
    { id: 'cove', name: 'Wreckers\' Cove', minX: -124, maxX: FLATS.minX, minZ: 336, maxZ: 400 },
    { id: 'gulltower', name: 'the Gull Tower', minX: GULL_TOWER.x - 16, maxX: GULL_TOWER.x + 16, minZ: GULL_TOWER.z - 14, maxZ: GULL_TOWER.z + 16 },
    { id: 'saltway', name: 'the Saltway', minX: -124, maxX: 184, minZ: GAP.z1, maxZ: 342 },
  ];
  const map: SouthRefs['map'] = {
    roads: [[[2, 120], ...SALTWAY], [[40, 338], [134, 338]]], trails: [[[134, 338], [140, 352], [146, 366], [151, 386]], [[44, 338], [30, 350], [12, 352], [-20, 352], [-58, 355], [-98, 368]], [[56, 256], [62, 252]]],
    water: [[-128, 392, FLATS.minX, 440], [FLATS.minX, FLATS.maxZ, FLATS.maxX, 440], [FLATS.maxX, QUAY_Z + 0.5, 186, 440]], forest: [], fields: [], walls: [[TOWN.minX, TOWN.minZ, TOWN.maxX, QUAY_Z]],
    hills: [[-128, 136, GAP.minX, 186], [GAP.maxX, 136, 186, 186]], flats: [FLATS.minX, FLATS.minZ, FLATS.maxX, FLATS.maxZ],
  };
  const refs: SouthRefs = {
    regions, map, boats, gulls: critter, beam: beam!, lampRoom: lampRoom!, sea, seaY: seaLevel(0),
    rockfall: { meshes: rockMeshes, collider: rockCollider, open: false },
    wreck: V(WRECK.x, 0, WRECK.z), tower: V(GULL_TOWER.x, 0, GULL_TOWER.z), cave: V(CAVE.x, 0, CAVE.z), charge: V(2, 0, GAP.rock - 4), town,
    openGap(instant = false) {
      if (refs.rockfall.open) return;
      refs.rockfall.open = true; void instant;
      const i = w.colliders.indexOf(rockCollider); if (i >= 0) w.colliders.splice(i, 1);
      // the boulders are gone; a few broken pieces lie against the gorge walls
      rockMeshes.forEach((m, k) => { if (k % 3) m.visible = false; else { m.position.x = k % 2 ? GAP.minX + 0.6 : GAP.maxX - 0.6; m.position.y = 0.35; m.scale.multiplyScalar(0.55); } });
      const it = w.interactables.find(x => x.id === 'rockfall'); if (it) it.hidden = true;
    },
    closeGap() {
      if (!refs.rockfall.open) return;
      refs.rockfall.open = false; if (!w.colliders.includes(rockCollider)) w.colliders.push(rockCollider);
      const it = w.interactables.find(x => x.id === 'rockfall'); if (it) it.hidden = false;
    },
    setTide(tide: number) { refs.seaY = seaLevel(tide); sea.position.y = refs.seaY; },
    animate(dt: number, t: number, player: THREE.Vector3, night: number) {
      if (player.z < 150) return;              // nothing on the coast to animate from the Vale or further north
      sea.position.y = refs.seaY + Math.sin(t * 0.7) * 0.02;
      boats.forEach((b, i) => { b.position.y = refs.seaY + 0.12 + Math.sin(t * 1.1 + i * 2) * 0.06; b.rotation.z = Math.sin(t * 0.8 + i) * 0.04; b.rotation.x = Math.sin(t * 0.6 + i * 1.7) * 0.02; });
      for (const g of critter) {
        if (Math.abs(player.x - g.c.x) > 90 || Math.abs(player.z - g.c.z) > 90) { g.root.visible = false; continue; }
        g.root.visible = true; g.a += dt * g.sp; const x = g.c.x + Math.cos(g.a) * g.r, z = g.c.z + Math.sin(g.a) * g.r;
        g.root.position.set(x, g.h + Math.sin(t * 0.7 + g.r) * 1.2, z); g.root.rotation.y = -g.a + (g.sp > 0 ? Math.PI : 0); g.root.rotation.z = (g.sp > 0 ? -1 : 1) * 0.25;
        const flap = Math.sin(t * 7 + g.r * 3) > 0.2 ? Math.sin(t * 14 + g.r) * 0.6 : 0.05;
        g.wings[0].rotation.z = -flap; g.wings[1].rotation.z = flap;
      }
      // the lighthouse: the beam sweeps the bay from dusk to dawn
      const on = night > 0.45;
      (beam.material as THREE.MeshBasicMaterial).opacity = on ? 0.09 * Math.min(1, (night - 0.45) * 4) : 0;
      beam.visible = on; beam.rotation.y = t * 0.5;
      (lampRoom.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 1.6 : 0.2;
    },
  };
  return refs;
}

/** On the flats (the wet sand between the dunes and the sandbar). */
export function inFlats(p: THREE.Vector3): boolean { return p.x > FLATS.minX && p.x < FLATS.maxX && p.z > FLATS.minZ + 2 && p.z < FLATS.maxZ; }
/** Out on the far flats, where the tide comes in first and deepest. */
export function inDeepFlats(p: THREE.Vector3): boolean { return inFlats(p) && p.z > FLATS.deep; }
