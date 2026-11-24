// v0.7: the Eastern Reach. Everything east of Millbrook's new East Gate:
// the East Road, Brookfield farm, Thornwood, the bandit toll tower, the River Wend (bridge and ford),
// Ashford (a walled river-market town with docks) and the hill road to the Copper Hollow mine.
// Built with the same helpers as the rest of the world; shared meshes are instanced under "E" keys so
// they cull as one region.
import * as THREE from 'three';
import { bakeSkinned } from './bake';
import { World, MAT, M } from './world';

export interface Region { id: string; name: string; minX: number; maxX: number; minZ: number; maxZ: number }
export interface Critter { root: THREE.Group; head: THREE.Object3D; home: THREE.Vector3; r: number; target: THREE.Vector3; t: number; kind: 'sheep' | 'hen' | 'cow'; legs: THREE.Object3D[]; ph: number }
export interface EastRefs {
  river: { minX: number; maxX: number }; bridge: { minZ: number; maxZ: number }; ford: { minZ: number; maxZ: number };
  ashford: THREE.Vector3; mineOutside: THREE.Vector3;
  regions: Region[];
  map: { roads: [number, number][][]; trails: [number, number][][]; water: [number, number, number, number][]; forest: [number, number, number, number][]; fields: [number, number, number, number][]; walls: [number, number, number, number][]; hills: [number, number, number, number][] };
  critters: Critter[]; boats: THREE.Object3D[]; steam: THREE.Points | null;
  animate(dt: number, t: number, player: THREE.Vector3): void;
}

const EAST_GATE_Z = 4.5;
export const RIVER = { minX: 204, maxX: 214 };
export const BRIDGE = { minZ: 8.5, maxZ: 16.5 };
export const FORD = { minZ: 110, maxZ: 118 };
const TOWN = { minX: 228, maxX: 304, minZ: -30, maxZ: 54 };

export function buildEast(w: World): EastRefs {
  let seed = 911;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mats = {
    dirt: M(0x8f7c5a), cobble: M(0x8a8478), field: M(0x6a5a3a), wheat: M(0xc8a858), cabbage: M(0x5f8a3a), hedge: M(0x3f5f2a),
    redRoof: M(0x8a2f22), wall: M(0xc9bc9c), stoneWall: M(0x9a9282), darkStone: M(0x4e4a44), cliff: M(0x5d5850), water: M(0x35647f, { roughness: 0.15, metalness: 0.15 }),
    shallow: M(0x4f8096, { roughness: 0.2, transparent: true, opacity: 0.85 }), sand: M(0xb5a77f), apple: M(0xb8322a), wool: M(0xe8e2d4), hide: M(0x6a4a32), hen: M(0xd8c8a0),
    birch: M(0xd8d4c8), oakLeaf: M(0x4f7a34), pineLeaf: M(0x2c4f2a), boat: M(0x6a4a2c), sail: M(0xd8ccb0), copper: M(0x4f8a6a, { metalness: 0.4, roughness: 0.5 }), steam: new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.35, depthWrite: false }),
    banner: M(0x2f5a7d), bannerRed: M(0x7d2f2f), glowWin: M(0xffcf7a, { emissive: 0xffa040, emissiveIntensity: 0.0 }),
  };
  // ---------------- ground ----------------
  {
    const X0 = 80, X1 = 330, Z0 = -160, Z1 = 170, sx = 2.5, sz = 2.5;
    const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, Math.round((X1 - X0) / sx), Math.round((Z1 - Z0) / sz));
    const pos = geo.attributes.position as THREE.BufferAttribute; const col: number[] = []; const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (X0 + X1) / 2, z = -pos.getY(i) + (Z0 + Z1) / 2;
      const n = Math.sin(x * 0.19) * Math.cos(z * 0.15) * 0.5 + Math.sin(x * 0.045 + z * 0.06) * 0.5;
      let y = 0;
      // the river channel, with sloping banks (except where the ford is)
      const dr = Math.max(RIVER.minX - x, x - RIVER.maxX, 0), inRiver = x > RIVER.minX - 2.5 && x < RIVER.maxX + 2.5;
      if (inRiver) { const depth = z > FORD.minZ - 1 && z < FORD.maxZ + 1 ? 0.1 : 0.9; y = -depth * (dr <= 0 ? 1 : Math.max(0, 1 - dr / 2.5)); }
      // hills beyond the edges of the walkable land, and the cliff above the mine
      const north = -126 - z, east = x - 310, south = z - 150;
      const hill = Math.max(north, east, south);
      if (hill > 0) y += Math.min(16, hill * 0.9) + n * 2.2 * Math.min(1, hill / 6);
      if (z < -120 && z > -140 && x > 222 && x < 302) y += Math.max(0, Math.min(14, (-120 - z) * 2.2));
      pos.setZ(i, y);
      // colour: forest floor, farmland, town dirt, river sand, hill grass
      const forest = x > 134 && x < 202 && z > -114 && z < -12, town = x > TOWN.minX && x < TOWN.maxX && z > TOWN.minZ && z < TOWN.maxZ;
      if (inRiver && y < -0.05) c.set(0x7a7058).multiplyScalar(0.9 + n * 0.05);
      else if (z < -119 && x > 222 && x < 302 && y > 0.4) c.set(0x5d564c).multiplyScalar(0.85 + n * 0.12 + Math.min(0.15, y * 0.01));
      else if (hill > 0 || (z < -120 && x > 222 && x < 302)) c.setHSL(0.22 - n * 0.02, 0.18, 0.34 + Math.min(0.12, Math.max(0, y) * 0.006));
      else if (forest) c.setHSL(0.24, 0.3, 0.24 + n * 0.03);
      else if (town) c.setHSL(0.11, 0.2, 0.46 + n * 0.03);
      else c.setHSL(0.235 - n * 0.02, 0.33, 0.34 + n * 0.04);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    g.rotation.x = -Math.PI / 2; g.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2); g.receiveShadow = true; w.scene.add(g);
  }
  // ---------------- edges of the world ----------------
  {
    // the old west edge collider at x = 64 is removed; the Reach continues east from there
    const i = w.colliders.findIndex(c => c.minX === 64 && c.maxX === 66); if (i >= 0) w.colliders.splice(i, 1);
    w.colliders.push(
      { minX: 62, maxX: 64, minZ: -128, maxZ: -30, h: 9 }, { minX: 62, maxX: 64, minZ: 136, maxZ: 152, h: 9 },
      { minX: 308, maxX: 312, minZ: -130, maxZ: 154, h: 9 },
    );
    // v0.9.4: the north and south edges were invisible 9 m colliders; now visible 3 m drystone walls on the same line
    w.block(188, -128, 248, 4, 3, MAT.stoneDark); w.block(188, 152, 248, 4, 3, MAT.stoneDark);
    w.bounds = { minX: -64, maxX: 308, minZ: -126, maxZ: 150 };
  }
  // ---------------- helpers ----------------
  const pathSeg = (x1: number, z1: number, x2: number, z2: number, wd: number, mat: THREE.Material, y = 0.013) => {
    const len = Math.hypot(x2 - x1, z2 - z1); const p = new THREE.Mesh(new THREE.PlaneGeometry(wd, len + wd * 0.6), mat);
    p.rotation.x = -Math.PI / 2; p.rotation.z = -Math.atan2(x2 - x1, z2 - z1); p.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); p.receiveShadow = true; w.scene.add(p);
  };
  const road = (pts: [number, number][], wd = 3.2, mat: THREE.Material = mats.dirt) => { for (let i = 1; i < pts.length; i++) pathSeg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], wd, mat); };
  const tree = (x: number, z: number, s: number, kind: 'oak' | 'pine' | 'birch' | 'apple') => {
    const ry = new THREE.Euler(0, rnd() * 6, 0), sc = V(s, s, s);
    if (kind === 'pine') {
      w.put('ePineT', () => new THREE.CylinderGeometry(0.16, 0.26, 2.4, 6), MAT.bark, V(x, 1.2 * s, z), ry, sc);
      for (let i = 0; i < 3; i++) w.put('ePine' + i, () => new THREE.ConeGeometry(1.5 - i * 0.38, 2.0, 7), mats.pineLeaf, V(x, (2.4 + i * 1.05) * s, z), ry, sc);
    } else {
      w.put(kind === 'birch' ? 'eBirchT' : 'eOakT', () => new THREE.CylinderGeometry(0.2, 0.32, 2.6, 6), kind === 'birch' ? mats.birch : MAT.bark, V(x, 1.3 * s, z), ry, sc);
      w.put('eOakA', () => new THREE.IcosahedronGeometry(1.5, 0), kind === 'birch' ? MAT.leaf : mats.oakLeaf, V(x, 3.1 * s, z), ry, V(s * 1.1, s * 0.85, s * 1.1));
      w.put('eOakB', () => new THREE.IcosahedronGeometry(1.1, 0), MAT.leafDark, V(x + 0.6 * s, 3.8 * s, z - 0.3 * s), ry, sc);
      if (kind === 'apple') for (let i = 0; i < 5; i++) w.put('eApple', () => new THREE.SphereGeometry(0.09, 5, 4), mats.apple, V(x + Math.cos(i * 1.3) * 1.1 * s, (2.7 + (i % 2) * 0.6) * s, z + Math.sin(i * 1.3) * 1.1 * s), undefined, undefined, false);
    }
    w.colliders.push({ minX: x - 0.3 * s, maxX: x + 0.3 * s, minZ: z - 0.3 * s, maxZ: z + 0.3 * s, h: 4 });
    w.cameraBlockers.push({ minX: x - 1.1 * s, maxX: x + 1.1 * s, minZ: z - 1.1 * s, maxZ: z + 1.1 * s, h: 5.5 * s });
  };
  const bush = (x: number, z: number, s: number) => w.put('eBush', () => new THREE.IcosahedronGeometry(0.7, 0), MAT.leafDark, V(x, 0.45 * s, z), new THREE.Euler(0, rnd() * 6, 0), V(s, s * 0.7, s));
  const rock = (x: number, z: number, s: number, mat: THREE.Material = MAT.rock, collide = true) => {
    w.put(mat === MAT.rock ? 'eRock' : 'eRockD', () => new THREE.DodecahedronGeometry(1, 0), mat, V(x, s * 0.45, z), new THREE.Euler(rnd() * 3, rnd() * 3, 0), V(s, s * 0.7, s));
    if (collide) w.colliders.push({ minX: x - s * 0.8, maxX: x + s * 0.8, minZ: z - s * 0.8, maxZ: z + s * 0.8, h: s });
  };
  const fence = (x1: number, z1: number, x2: number, z2: number, collide = true) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) { const t = i / n; w.put('eFenceP', () => new THREE.BoxGeometry(0.14, 1.1, 0.14), MAT.timber, V(x1 + (x2 - x1) * t, 0.55, z1 + (z2 - z1) * t)); }
    const ang = -Math.atan2(z2 - z1, x2 - x1);
    for (const y of [0.45, 0.85]) w.put('eFenceR', () => new THREE.BoxGeometry(1, 0.08, 0.06), MAT.wood, V((x1 + x2) / 2, y, (z1 + z2) / 2), new THREE.Euler(0, ang, 0), V(len, 1, 1));
    if (collide) w.colliders.push({ minX: Math.min(x1, x2) - 0.15, maxX: Math.max(x1, x2) + 0.15, minZ: Math.min(z1, z2) - 0.15, maxZ: Math.max(z1, z2) + 0.15, h: 1.1 });
  };
  /** A whole building: walls with doors, a roof that hides when you walk in, windows that glow at night. */
  const house = (name: string, minX: number, maxX: number, minZ: number, maxZ: number, o: { h?: number; wall?: THREE.Material; roof?: THREE.Material; doors: ['n' | 's' | 'e' | 'w', number, number][]; windows?: boolean; floor?: THREE.Material; chimney?: boolean }) => {
    const h = o.h ?? 3.6;
    w.shell(minX, maxX, minZ, maxZ, h, o.doors, o.wall ?? mats.wall);
    w.roof(minX, maxX, minZ, maxZ, h, o.roof ?? MAT.roof, name);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX - 0.3, 0.05, maxZ - minZ - 0.3), o.floor ?? MAT.woodLight); fl.position.set((minX + maxX) / 2, 0.02, (minZ + maxZ) / 2); fl.receiveShadow = true; w.scene.add(fl);
    if (o.windows !== false) {
      for (const [side, along] of [['n', (minX + maxX) / 2], ['s', (minX + maxX) / 2], ['e', (minZ + maxZ) / 2], ['w', (minZ + maxZ) / 2]] as ['n' | 's' | 'e' | 'w', number][]) {
        const offs = side === 'n' || side === 's' ? (maxX - minX > 9 ? [-2.6, 2.6] : [-1.8]) : (maxZ - minZ > 9 ? [-2.4, 2.4] : [1.6]);
        for (const off of offs) {
          const c = along + off; if (o.doors.some(d => d[0] === side && Math.abs(d[1] - c) < d[2] / 2 + 0.7)) continue;
          if (side === 'n') w.window(c, minZ, 1.7, 0, true); else if (side === 's') w.window(c, maxZ, 1.7, 0, true); else if (side === 'e') w.window(maxX, c, 1.7, Math.PI / 2, true); else w.window(minX, c, 1.7, Math.PI / 2, true);
        }
      }
    }
    if (o.chimney) w.block(maxX - 1.2, minZ + 1.2, 0.8, 0.8, h + 2.4, MAT.stoneDark, 0, false);
  };
  const lamp = (x: number, z: number) => w.lantern(x, z, 2.7, true);
  const crate = (x: number, z: number, s = 0.8) => w.block(x, z, s, s, s, MAT.woodLight);
  const barrel = (x: number, z: number) => { const b = w.cyl(x, z, 0.38, 0.95, MAT.wood, 0, 8); b.castShadow = true; };
  const stall = (x: number, z: number, rot: number, cloth: THREE.Material) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; w.scene.add(g);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.1), MAT.wood); tab.position.y = 0.45; g.add(tab);
    for (const [dx, dz] of [[-1.2, -0.5], [1.2, -0.5], [-1.2, 0.5], [1.2, 0.5]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4), MAT.timber); p.position.set(dx, 1.2, dz); g.add(p); }
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 1.6), cloth); top.position.y = 2.4; top.rotation.x = 0.12; g.add(top);
    for (let i = 0; i < 4; i++) { const goods = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.35), [MAT.woodLight, mats.cabbage, mats.apple, MAT.linen][i]); goods.position.set(-0.9 + i * 0.6, 1.02, 0); g.add(goods); }
    w.add(g); const c = Math.cos(rot), s2 = Math.abs(Math.sin(rot));
    w.colliders.push({ minX: x - (1.3 * Math.abs(c) + 0.55 * s2), maxX: x + (1.3 * Math.abs(c) + 0.55 * s2), minZ: z - (0.55 * Math.abs(c) + 1.3 * s2), maxZ: z + (0.55 * Math.abs(c) + 1.3 * s2), h: 1 });
  };
  const fire = (x: number, z: number, light = true) => {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.7, 6), MAT.fire.clone()); f.position.set(x, 0.35, z); w.scene.add(f); w.fires.push(f);
    for (let i = 0; i < 7; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.28), MAT.stoneDark); st.position.set(x + Math.cos(i * 0.9) * 0.7, 0.09, z + Math.sin(i * 0.9) * 0.7); w.scene.add(st); }
    if (light) w.lights.add(x, 1.1, z, 0xff7a2a, 4, 12, 1.4, { flicker: 0.15 });
  };
  const sign = (x: number, z: number, rot: number) => { w.block(x, z, 0.14, 0.14, 2.2, MAT.timber, 0, true); const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.06), MAT.woodLight); b.position.set(x + Math.cos(rot) * 0.5, 1.9, z - Math.sin(rot) * 0.5); b.rotation.y = rot; w.add(b); const b2 = b.clone(); b2.position.y = 1.5; b2.rotation.y = rot + 0.7; w.add(b2); };
  const critters: Critter[] = [], boats: THREE.Object3D[] = [];
  const critter = (kind: Critter['kind'], x: number, z: number, r: number) => {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.position.set(x, 0, z); w.scene.add(root);
    const legs: THREE.Object3D[] = [];
    let head: THREE.Object3D;
    if (kind === 'hen') {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), mats.hen); b.position.y = 0.28; b.scale.set(1, 0.9, 1.3); body.add(b);
      head = new THREE.Group(); head.position.set(0, 0.42, -0.18); body.add(head); const hm = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), mats.hen); head.add(hm); const cb = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.06), M(0xc8322a)); cb.position.y = 0.08; head.add(cb);
      for (const lx of [-0.06, 0.06]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 3), M(0xd8a040)); l.position.set(lx, 0.08, 0); body.add(l); legs.push(l); }
    } else {
      const big = kind === 'cow';
      const b = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.75 : 0.55, big ? 0.7 : 0.5, big ? 1.5 : 0.9), kind === 'sheep' ? mats.wool : M(0x6a4a32)); b.position.y = big ? 1.0 : 0.65; body.add(b);
      head = new THREE.Group(); head.position.set(0, big ? 1.25 : 0.8, big ? -0.85 : -0.5); body.add(head);
      const hm = new THREE.Mesh(new THREE.BoxGeometry(big ? 0.36 : 0.26, big ? 0.36 : 0.28, big ? 0.5 : 0.34), kind === 'sheep' ? M(0x2a2420) : M(0x5a3a28)); hm.position.z = -0.1; head.add(hm);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, big ? 0.65 : 0.45, 4), M(0x2a2420)); l.position.set(lx * (big ? 0.26 : 0.18), big ? 0.33 : 0.23, lz * (big ? 0.55 : 0.3)); body.add(l); legs.push(l); }
    }
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    bakeSkinned(root, [body, head, ...legs], 0.2); // v0.8: one draw call per animal
    critters.push({ root, head, home: V(x, 0, z), r, target: V(x, 0, z), t: rnd() * 5, kind, legs, ph: 0 });
  };
  const boat = (x: number, z: number, rot: number, sail = false) => {
    const g = new THREE.Group(); g.position.set(x, -0.2, z); g.rotation.y = rot; w.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 4.2), mats.boat); hull.position.y = 0.05; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.3, 4), mats.boat); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.05, -2.7); bow.scale.set(1, 1, 0.5); g.add(bow);
    if (sail) { const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6), MAT.timber); mast.position.y = 1.9; g.add(mast); const sl = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), mats.sail); sl.position.set(0, 2.2, 0.1); (sl.material as THREE.Material).side = THREE.DoubleSide; g.add(sl); }
    w.add(g); boats.push(g);
  };
  // ---------------- Millbrook's East Gate and the East Road ----------------
  for (const z of [EAST_GATE_Z - 3.0, EAST_GATE_Z + 3.0]) { w.block(42, z, 1.2, 1.2, 5, MAT.timber); const r = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.2, 4), MAT.roof); r.position.set(42, 5.6, z); r.rotation.y = Math.PI / 4; w.add(r); }
  w.lantern(44.2, EAST_GATE_Z - 3.4); w.lantern(44.2, EAST_GATE_Z + 3.4);
  road([[13, 3.6], [30, 4.2], [42, EAST_GATE_Z], [64, EAST_GATE_Z]], 2.8, MAT.path);
  road([[64, EAST_GATE_Z], [96, 5], [150, 5.5], [172, 12.5], [RIVER.minX - 2, 12.5]], 3.4);
  road([[RIVER.maxX + 2, 12.5], [TOWN.minX, 12.5]], 3.6, mats.cobble);
  road([[96, 5], [99, -6]], 2.4); // farm lane
  road([[150, 5], [158, -20], [164, -46]], 1.8); // Thornwood trail
  road([[164, -46], [156, -72], [151, -90]], 1.4);
  road([[246.5, TOWN.minZ], [248, -50], [254, -78], [262, -112]], 2.8); // hill road
  road([[RIVER.maxX + 1, 116], [240, 118], [262, 70], [262, TOWN.maxZ]], 1.6); // south track from the ford
  road([[RIVER.minX - 1, 114], [150, 118], [100, 110], [64, 100]], 1.6); // the ford road west, toward the raider camp
  sign(48, EAST_GATE_Z + 3.2, 0); sign(150, 8.5, 0.6); sign(RIVER.maxX + 4, 16.5, 0); sign(250, TOWN.minZ - 3, -0.4);
  // Millbrook coach post, outside the East Gate
  { w.block(47.5, 9.5, 2.4, 0.2, 2.2, MAT.wood, 0, true); const rf = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.1, 1.4), MAT.roofSlate); rf.position.set(47.5, 2.3, 9.0); w.add(rf); w.interact('coach_mb', 47.5, 8.2, 'Take the coach to Ashford', 'interact', 1.6); }
  // roadside trees
  for (let i = 0; i < 46; i++) { const x = 66 + rnd() * 130, side = rnd() < 0.5 ? -1 : 1, z = 5 + side * (7 + rnd() * 14); if (x > 84 && x < 146 && z > -26 && z < 44) continue; if (x > 134 && z < -12) continue; tree(x, z, 0.8 + rnd() * 0.6, rnd() < 0.3 ? 'birch' : 'oak'); }
  // ---------------- Brookfield farm ----------------
  house('Varley farmhouse', 92, 101, -20, -11, { doors: [['s', 96.5, 1.6]], chimney: true, roof: MAT.thatch });
  w.block(96.5, -18.6, 2.4, 0.7, 0.9, MAT.stone); // hearth
  w.interact('farm_hearth', 96.5, -17.2, 'Warm yourself at the Varley hearth', 'interact', 1.4);
  house('Varley barn', 106, 118, -22, -12, { h: 4.6, doors: [['s', 112, 3.6]], roof: mats.redRoof, windows: false, floor: MAT.straw });
  for (let i = 0; i < 5; i++) w.block(108 + i * 2, -20.5, 1.4, 1.2, 1.0, MAT.straw);
  fence(104, -8, 120, -8); fence(104, 0, 112, 0); fence(114, 0, 120, 0); fence(104, -8, 104, 0); fence(120, -8, 120, 0);
  for (let i = 0; i < 6; i++) critter('sheep', 107 + (i % 3) * 4, -5.5 + Math.floor(i / 3) * 3, 3);
  for (let i = 0; i < 5; i++) critter('hen', 98 + i * 1.3, -8.5 + (i % 2), 2.5);
  critter('cow', 124, -16, 3); critter('cow', 127, -19, 3);
  fence(121, -24, 132, -24, false); fence(121, -12, 132, -12, false); fence(132, -24, 132, -12, false);
  { const wl = w.cyl(102.5, -9.5, 0.9, 0.8, MAT.stone); void wl; w.interact('farm_well', 102.5, -8.2, 'Drink from the farm well', 'drink', 1.4); }
  // fields south of the road: wheat, cabbages, a scarecrow; hedges between
  const field = (x0: number, x1: number, z0: number, z1: number, crop: 'wheat' | 'cabbage') => {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mats.field); pl.rotation.x = -Math.PI / 2; pl.position.set((x0 + x1) / 2, 0.015, (z0 + z1) / 2); pl.receiveShadow = true; w.scene.add(pl);
    for (let x = x0 + 0.8; x < x1 - 0.5; x += 1.4) for (let z = z0 + 0.8; z < z1 - 0.5; z += crop === 'wheat' ? 0.8 : 1.2) {
      if (crop === 'wheat') w.put('eWheat', () => new THREE.ConeGeometry(0.16, 0.9, 4), mats.wheat, V(x + (rnd() - 0.5) * 0.2, 0.45, z), new THREE.Euler(0, rnd() * 3, 0), undefined, false);
      else w.put('eCabbage', () => new THREE.IcosahedronGeometry(0.28, 0), mats.cabbage, V(x, 0.22, z), new THREE.Euler(0, rnd() * 3, 0), undefined, false);
    }
  };
  field(86, 104, 12, 26, 'wheat'); field(106, 122, 12, 26, 'cabbage'); field(86, 104, 29, 42, 'cabbage'); field(106, 122, 29, 42, 'wheat');
  for (const [x0, x1, z] of [[86, 122, 27.5], [86, 122, 43.5]] as [number, number, number][]) for (let x = x0; x < x1; x += 1.5) bush(x, z, 0.7);
  { const sc = new THREE.Group(); sc.position.set(95, 0, 20); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), MAT.timber); p.position.y = 1.1; sc.add(p); const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.06), MAT.timber); arm.position.y = 1.7; sc.add(arm); const hd = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), MAT.straw); hd.position.y = 2.25; sc.add(hd); const hat = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 6), MAT.thatch); hat.position.y = 2.5; sc.add(hat); const coat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.25), M(0x6a3a2a)); coat.position.y = 1.4; sc.add(coat); w.add(sc); }
  // orchard
  for (let x = 128; x < 142; x += 4) for (let z = 14; z < 34; z += 4.5) { tree(x + (rnd() - 0.5), z + (rnd() - 0.5), 0.75, 'apple'); }
  w.interact('orchard', 133, 24, 'Pick windfall apples', 'pick', 2.2);
  // ---------------- Thornwood ----------------
  const sites = w.sites;
  const clearOf = (x: number, z: number) => Math.hypot(x - sites.thornwood.x, z - sites.thornwood.z) > 13 && Math.hypot(x - 150, z + 94) > 8 && !(Math.abs(x - (150 + (z + 20) * -0.3)) < 2.5 && z > -24 && z < 4) && Math.abs(x - (161 + (z + 33) * -0.23)) > 2 + (z < -20 && z > -46 ? 0 : 99);
  for (let i = 0; i < 300; i++) { const x = 136 + rnd() * 64, z = -112 + rnd() * 98; if (!clearOf(x, z)) continue; const k = rnd(); tree(x, z, 0.85 + rnd() * 0.8, k < 0.45 ? 'pine' : k < 0.85 ? 'oak' : 'birch'); }
  for (let i = 0; i < 110; i++) { const x = 136 + rnd() * 64, z = -112 + rnd() * 98; if (clearOf(x, z)) bush(x, z, 0.6 + rnd() * 0.8); }
  for (let i = 0; i < 14; i++) rock(136 + rnd() * 64, -112 + rnd() * 98, 0.5 + rnd() * 0.9);
  // woodcutters' camp in the clearing
  { const c = sites.thornwood;
    house("Woodcutters' hut", c.x + 2, c.x + 8, c.z - 9, c.z - 3, { h: 3.0, doors: [['s', c.x + 5, 1.4]], roof: MAT.thatch, windows: false });
    for (let i = 0; i < 4; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 4, 7), MAT.bark); lg.rotation.z = Math.PI / 2; lg.position.set(c.x - 6, 0.3 + (i % 2) * 0.55, c.z - 4 + Math.floor(i / 2) * 0.6 + (i % 2) * 0.3); w.add(lg); }
    w.colliders.push({ minX: c.x - 8, maxX: c.x - 4, minZ: c.z - 4.5, maxZ: c.z - 2.5, h: 1.2 });
    w.block(c.x - 3, c.z + 3, 0.9, 0.9, 0.55, MAT.bark); // chopping block
    fire(c.x + 1, c.z + 4);
    for (const [dx, dz] of [[-1.2, 5.6], [3.2, 5.2], [1.0, 6.4]]) w.block(c.x + dx, c.z + dz, 1.4, 0.4, 0.4, MAT.bark, 0, false);
  }
  // the Hollow Oak: an ancient tree you can stand inside
  { const ox = 150, oz = -94;
    for (let i = 0; i < 7; i++) { if (i === 3) continue; const a = (i / 7) * Math.PI * 2; const sl = new THREE.Mesh(new THREE.BoxGeometry(1.3, 7, 0.7), MAT.bark); sl.position.set(ox + Math.cos(a) * 2.0, 3.5, oz + Math.sin(a) * 2.0); sl.rotation.y = -a + Math.PI / 2; w.add(sl); w.colliders.push({ minX: ox + Math.cos(a) * 2.0 - 0.6, maxX: ox + Math.cos(a) * 2.0 + 0.6, minZ: oz + Math.sin(a) * 2.0 - 0.6, maxZ: oz + Math.sin(a) * 2.0 + 0.6, h: 7 }); }
    for (let i = 0; i < 5; i++) { const cn = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2 - i * 0.3, 0), i % 2 ? mats.oakLeaf : MAT.leafDark); cn.position.set(ox + Math.cos(i * 1.3) * 2.2, 8 + i * 0.6, oz + Math.sin(i * 1.3) * 2.2); w.add(cn); }
    const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), MAT.rune.clone()); glow.position.set(ox, 1.2, oz); w.scene.add(glow); w.crystalRunes.push(glow);
    w.interact('hollow_oak', ox, oz + 1.2, 'Look inside the Hollow Oak', 'interact', 1.8);
  }
  // ---------------- the toll tower (Ash Road bandits) ----------------
  { const t = sites.toll_tower;
    for (let i = 0; i < 14; i++) { if (i === 0 || i === 1) continue; const a = (i / 14) * Math.PI * 2; const hgt = 3 + ((i * 7) % 5) * 1.3; w.block(t.x + Math.cos(a) * 3.2, t.z + 6 + Math.sin(a) * 3.2, 1.5, 1.5, hgt, MAT.stoneDark); }
    for (const [dx, dz, r] of [[-6, -1, 0.5], [5, -2, -0.4], [6, 4, 1.1]] as [number, number, number][]) { const tn = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 4), MAT.cloth); tn.position.set(t.x + dx, 1.1, t.z + dz); tn.rotation.y = r; w.add(tn); w.colliders.push({ minX: t.x + dx - 1.2, maxX: t.x + dx + 1.2, minZ: t.z + dz - 1.2, maxZ: t.z + dz + 1.2, h: 2.2 }); }
    fire(t.x, t.z + 1);
    // log barricade across the road, with a gap
    for (const [x, z] of [[171, 6.5], [171, 8.7], [173, 16.5], [173, 18.6]] as [number, number][]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.2, 6), MAT.bark); lg.rotation.x = Math.PI / 2; lg.position.set(x, 0.5, z); w.add(lg); w.colliders.push({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 1.1, maxZ: z + 1.1, h: 1.0 }); }
    crate(t.x - 2.5, t.z + 3.5); crate(t.x - 1.6, t.z + 3.8, 0.7); barrel(t.x + 2.6, t.z + 3.2);
    w.interact('toll_chest', t.x - 2.0, t.z + 2.6, 'Search the toll chest', 'pick', 1.4);
  }
  // ---------------- the River Wend ----------------
  {
    const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.maxX - RIVER.minX + 3, 330), mats.water); water.rotation.x = -Math.PI / 2; water.position.set((RIVER.minX + RIVER.maxX) / 2, -0.28, 5); w.scene.add(water);
    const ford = new THREE.Mesh(new THREE.PlaneGeometry(RIVER.maxX - RIVER.minX + 3, FORD.maxZ - FORD.minZ + 2), mats.shallow); ford.rotation.x = -Math.PI / 2; ford.position.set((RIVER.minX + RIVER.maxX) / 2, 0.16, (FORD.minZ + FORD.maxZ) / 2); w.scene.add(ford);
    for (let i = 0; i < 10; i++) w.put('eStep', () => new THREE.CylinderGeometry(0.5, 0.6, 0.3, 6), MAT.rock, V(RIVER.minX + 0.5 + i, 0.05, (FORD.minZ + FORD.maxZ) / 2 + Math.sin(i) * 1.5), undefined, undefined, false);
    // you cannot swim: banks block except at the bridge and the ford
    for (const [z0, z1] of [[-160, BRIDGE.minZ], [BRIDGE.maxZ, 42.6], [45.4, FORD.minZ], [FORD.maxZ, 170]]) w.colliders.push({ minX: RIVER.minX - 0.6, maxX: RIVER.maxX + 0.6, minZ: z0, maxZ: z1, h: 3 });
    w.colliders.push({ minX: RIVER.minX - 0.6, maxX: RIVER.minX + 3.3, minZ: 42.6, maxZ: 45.4, h: 3 }); // the water past the end of the Ashford pier
    // reeds along both banks
    for (let i = 0; i < 160; i++) { const side = rnd() < 0.5, x = side ? RIVER.minX - 1.2 - rnd() * 1.6 : RIVER.maxX + 1.2 + rnd() * 1.6, z = -120 + rnd() * 265; if (z > BRIDGE.minZ - 3 && z < BRIDGE.maxZ + 3) continue; if (z > FORD.minZ - 2 && z < FORD.maxZ + 2) continue; if (!side && z > 22 && z < 62) continue; w.put('eReed', () => new THREE.CylinderGeometry(0.02, 0.03, 1.4, 4), M(0x7a8a4a), V(x, 0.6, z), new THREE.Euler(0.12 * Math.cos(i), 0, 0.12 * Math.sin(i * 2)), undefined, false); }
    // the stone bridge
    const bx = (RIVER.minX + RIVER.maxX) / 2, bz = (BRIDGE.minZ + BRIDGE.maxZ) / 2, blen = RIVER.maxX - RIVER.minX + 6;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(blen, 0.5, BRIDGE.maxZ - BRIDGE.minZ), mats.stoneWall); deck.position.set(bx, -0.23, bz); w.add(deck);
    for (const z of [BRIDGE.minZ + 0.2, BRIDGE.maxZ - 0.2]) { w.block(bx, z, blen, 0.4, 0.9, mats.stoneWall); }
    for (const x of [bx - 3, bx + 3]) { const pier = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, BRIDGE.maxZ - BRIDGE.minZ - 1), MAT.stoneDark); pier.position.set(x, -0.9, bz); w.add(pier); }
    w.lantern(bx - 4.5, BRIDGE.minZ - 0.6); w.lantern(bx + 4.5, BRIDGE.maxZ + 0.6);
    // bridge watch post (Corporal Strand)
    w.block(RIVER.maxX + 5, BRIDGE.minZ - 3.5, 2.6, 2.6, 2.6, MAT.wood); const pr = new THREE.Mesh(new THREE.ConeGeometry(2.0, 1.2, 4), MAT.roofSlate); pr.position.set(RIVER.maxX + 5, 3.2, BRIDGE.minZ - 3.5); pr.rotation.y = Math.PI / 4; w.add(pr);
    // fishing spots: a jetty below the bridge, and the end of the Ashford pier
    w.interact('fish_bridge', RIVER.maxX + 1.6, BRIDGE.maxZ + 4.5, 'Fish the Wend', 'fish', 1.6, Math.PI / 2);    // v0.8 fix: face the water (west)
    w.interact('fish_ford', RIVER.minX - 1.5, FORD.minZ - 3, 'Fish the Wend', 'fish', 1.6, -Math.PI / 2);     // v0.8 fix: face the water (east)
    w.interact('fish_pond', -50.2, 85.6, 'Fish the reed pond', 'fish', 1.4, 0);
  }
  // ---------------- Ashford ----------------
  const T = TOWN;
  {
    // town wall with towers; gates west (main street), west (docks) and north (hill road)
    const wall = (x1: number, z1: number, x2: number, z2: number) => { const horiz = z1 === z2, len = horiz ? Math.abs(x2 - x1) : Math.abs(z2 - z1); if (len < 0.1) return; w.block(horiz ? (x1 + x2) / 2 : x1, horiz ? z1 : (z1 + z2) / 2, horiz ? len : 1.0, horiz ? 1.0 : len, 4.2, mats.stoneWall); for (let s = 0; s < len; s += 1.6) w.put('eMerlon', () => new THREE.BoxGeometry(0.7, 0.6, 1.0), mats.stoneWall, horiz ? V(Math.min(x1, x2) + s + 0.4, 4.5, z1) : V(x1, 4.5, Math.min(z1, z2) + s + 0.4), horiz ? undefined : new THREE.Euler(0, Math.PI / 2, 0)); };
    wall(T.minX, T.minZ, 244, T.minZ); wall(249, T.minZ, T.maxX, T.minZ); wall(T.minX, T.maxZ, T.maxX, T.maxZ);
    wall(T.maxX, T.minZ, T.maxX, T.maxZ); wall(T.minX, T.minZ, T.minX, 10); wall(T.minX, 15, T.minX, 29); wall(T.minX, 33, T.minX, T.maxZ);
    for (const [x, z] of [[T.minX, T.minZ], [T.maxX, T.minZ], [T.minX, T.maxZ], [T.maxX, T.maxZ], [T.minX, 9.2], [T.minX, 15.8], [243.4, T.minZ], [249.6, T.minZ]] as [number, number][]) { w.cyl(x, z, 1.4, 6.4, mats.stoneWall, 0, 8); const cap = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.8, 8), MAT.roofSlate); cap.position.set(x, 7.3, z); w.add(cap); }
    for (const [x, z, rot] of [[T.minX - 0.3, 6.5, 0], [T.minX - 0.3, 18.5, 0], [246.5, T.minZ - 0.6, Math.PI / 2]] as [number, number, number][]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), mats.banner); b.position.set(x, 3.4, z); b.rotation.y = rot - Math.PI / 2; (b.material as THREE.Material).side = THREE.DoubleSide; w.scene.add(b); }
    // streets and the square
    road([[T.minX, 12.5], [T.maxX - 1, 12.5]], 5, mats.cobble);
    road([[246.5, T.minZ], [246.5, 10]], 4.2, mats.cobble);
    const sq = new THREE.Mesh(new THREE.CircleGeometry(11, 26), mats.cobble); sq.rotation.x = -Math.PI / 2; sq.position.set(266, 0.016, 12.5); sq.receiveShadow = true; w.scene.add(sq);
    // fountain
    w.cyl(266, 12.5, 2.2, 0.6, mats.stoneWall, 0, 12); const fw = new THREE.Mesh(new THREE.CircleGeometry(1.9, 14), MAT.water); fw.rotation.x = -Math.PI / 2; fw.position.set(266, 0.62, 12.5); w.scene.add(fw);
    w.cyl(266, 12.5, 0.3, 2.0, mats.stoneWall, 0, 8, false); const fb = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.5, 0.3, 10), mats.stoneWall); fb.position.set(266, 2.05, 12.5); w.add(fb);
    w.interact('fountain', 266, 15.3, 'Drink from the fountain', 'drink', 1.4);
    stall(257, 5.5, 0, MAT.cloth); stall(275, 5.5, 0, MAT.clothBlue); stall(257, 19.5, Math.PI, MAT.clothBlue); stall(275, 19.8, Math.PI, mats.bannerRed);
    // north of the main street
    house('Mother Ilse\'s apothecary', 230, 238, -1, 8, { doors: [['s', 234, 1.6]], roof: MAT.roofSlate, chimney: true });
    for (let i = 0; i < 3; i++) w.block(231, 1 + i * 2, 0.5, 1.6, 2.2, MAT.wood, 0, true);
    w.block(234, 3.5, 2.4, 0.7, 1.0, MAT.wood);
    house('Tamsin Reed\'s curios', 250, 256, 0, 8, { doors: [['s', 253, 1.5]], roof: mats.redRoof });
    w.block(253, 3.0, 2.2, 0.6, 1.0, MAT.wood);
    house('Reeve\'s Hall', 258, 274, -16, -2, { h: 5.2, doors: [['s', 266, 2.4]], wall: mats.stoneWall, roof: MAT.roofSlate, floor: MAT.stone });
    w.block(266, -12.5, 3.4, 1.0, 1.0, MAT.wood); for (const x of [261, 271]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.4), mats.banner); b.position.set(x, 3.2, -15.8); w.scene.add(b); }
    for (let i = 0; i < 3; i++) w.block(263 + i * 3, -7, 2.2, 0.5, 0.5, MAT.wood, 0, false);
    w.lights.add(266, 3.6, -9, 0xffc080, 6, 12, 1.5, { when: 'always', flicker: 0.05 });
    house('Hale & Daughter, gunsmiths', 278, 286, -1, 8, { doors: [['s', 282, 1.6]], roof: MAT.roofSlate, chimney: true });
    w.block(282, 3.6, 2.6, 0.8, 1.0, MAT.wood); w.block(285, 0.4, 1.4, 0.5, 2.2, MAT.wood);
    w.interact('gun_bench', 279.6, 2.6, 'Work bench: clean your gun', 'interact', 1.3);
    house('Ashford house', 288, 296, -2, 7, { doors: [['s', 292, 1.4]] });
    house('Ashford house', 230, 238, -22, -10, { doors: [['e', -16, 1.4]], roof: mats.redRoof });
    house('Ashford house', 278, 292, -24, -14, { doors: [['s', 285, 1.4]], roof: MAT.thatch });
    // south of the main street
    house('The Drowned Lantern', 232, 246, 18, 30, { h: 4.0, doors: [['n', 239, 1.8]], roof: MAT.roof, chimney: true });
    w.block(236, 22, 4.5, 0.8, 1.05, MAT.wood); // bar
    for (const [x, z] of [[241.5, 23], [241.5, 26.5], [236, 27]] as [number, number][]) { w.block(x, z, 1.6, 1.0, 0.8, MAT.woodLight); w.block(x, z + 1.1, 1.6, 0.35, 0.45, MAT.wood, 0, false); w.block(x, z - 1.1, 1.6, 0.35, 0.45, MAT.wood, 0, false); }
    w.block(245.2, 28.6, 0.5, 2.0, 0.6, MAT.linen); w.block(245.2, 25.8, 0.5, 2.0, 0.6, MAT.linen); // beds in the back room
    w.interact('inn_bed', 244.3, 28.6, `Rent a bed for the night`, 'sleep', 1.4);
    { const hx = 233.2, hz = 27.5; w.block(hx, hz, 0.8, 2.4, 1.4, MAT.stoneDark); const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.6, 6), MAT.fire.clone()); f.position.set(hx + 0.4, 0.4, hz); w.scene.add(f); w.fires.push(f); w.lights.add(hx + 0.8, 1.0, hz, 0xff8a3a, 5, 10, 1.5, { flicker: 0.12 }); }
    w.interact('inn_bar', 236, 23.4, 'Lean on the bar', 'interact', 1.6);
    house('Shrine of the Quiet Flame', 252, 259, 19, 27, { doors: [['n', 255.5, 1.6]], wall: mats.stoneWall, roof: MAT.roofSlate, floor: MAT.stone });
    { const br = w.cyl(255.5, 24.5, 0.5, 0.8, MAT.iron, 0, 8); void br; const f = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.55, 6), MAT.fire.clone()); f.position.set(255.5, 1.08, 24.5); w.scene.add(f); w.fires.push(f); w.lights.add(255.5, 1.6, 24.5, 0xffb060, 4, 9, 1.5, { flicker: 0.1 }); w.interact('shrine', 255.5, 22.7, 'Kneel at the Quiet Flame', 'kneel', 1.4); }
    house("The Wardens' Lodge", 272, 286, 18, 30, { h: 4.2, doors: [['n', 279, 2.0]], roof: MAT.roofSlate, wall: mats.stoneWall });
    { const bd = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.1), MAT.wood); bd.position.set(279, 1.7, 29.7); w.add(bd); for (let i = 0; i < 5; i++) { const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44), MAT.paper); pp.position.set(278.2 + (i % 3) * 0.55, 1.95 - Math.floor(i / 3) * 0.55, 29.62); pp.rotation.y = Math.PI; w.scene.add(pp); } w.interact('lodge_board', 279, 28.4, 'Read the Lodge notices', 'interact', 1.6); }
    w.block(274, 24, 0.6, 3.0, 2.0, MAT.wood); w.block(283.5, 24, 3.0, 1.4, 0.85, MAT.woodLight); w.interact('lodge_stores', 274.9, 24, 'Lodge stores', 'interact', 1.4);
    w.lights.add(279, 3.4, 24, 0xffc080, 5, 11, 1.5, { when: 'always', flicker: 0.05 });
    house('Ashford bathhouse', 292, 303, 17, 28, { h: 3.8, doors: [['n', 297.5, 1.8]], wall: mats.stoneWall, roof: mats.redRoof, floor: MAT.stone });
    { const pool = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.3, 4.5), MAT.stoneDark); pool.position.set(297.5, 0.15, 24); w.add(pool); const pw = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 4.0), mats.shallow); pw.rotation.x = -Math.PI / 2; pw.position.set(297.5, 0.32, 24); w.scene.add(pw);
      w.interact('bath', 297.5, 20.8, 'Take a hot bath (4 crowns)', 'bathe', 1.6, Math.PI, new THREE.Vector3(297.5, 0, 22.5)); }
    house('Ashford house', 232, 240, 36, 44, { doors: [['n', 236, 1.4]], roof: MAT.thatch });
    house('Ashford house', 262, 270, 36, 44, { doors: [['n', 266, 1.4]] });
    house('Ashford house', 288, 298, 36, 46, { doors: [['w', 41, 1.4]], roof: mats.redRoof });
    for (let i = 0; i < 6; i++) lamp(234 + i * 12, 15.4);
    lamp(244, -4); lamp(249, -20); lamp(262, 30); lamp(286, 32);
    for (const [x, z] of [[249, 6], [251, 8], [276, 32], [289, 31.5], [247, 34], [270, 32]] as [number, number][]) barrel(x, z);
    for (const [x, z] of [[260, 30], [261, 31], [290, 9.6]] as [number, number][]) crate(x, z);
    // trees and gardens inside the walls
    for (const [x, z] of [[242, 46], [276, 46], [300, 40], [300, -18], [236, -26], [252, -26], [298, 50], [254, 48]] as [number, number][]) tree(x, z, 0.75, 'oak');
    // the docks, outside the west wall
    w.block(219, 38, 7, 8, 4.0, MAT.wood); const r1 = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 8.6), MAT.roofSlate); r1.position.set(219, 4.15, 38); w.add(r1);
    w.block(219, 50, 7, 8, 4.0, MAT.wood); const r2 = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.3, 8.6), MAT.roofSlate); r2.position.set(219, 4.15, 50); w.add(r2);
    for (const z of [28, 44, 57]) { const jt = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 2.0), MAT.wood); jt.position.set(RIVER.maxX - 2.5, 0.0, z); w.add(jt); for (const dx of [-4, 0, 4]) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4), MAT.timber); pl.position.set(RIVER.maxX - 2.5 + dx, -0.4, z + 0.9); w.add(pl); } }
    w.interact('fish_dock', RIVER.minX + 4.4, 44, 'Fish from the pier end', 'fish', 1.6, Math.PI / 2);
    boat(RIVER.minX + 3.5, 31, 0.1, true); boat(RIVER.minX + 3.0, 48, -0.1); boat(RIVER.minX + 2.5, 60, 0.05, true);
    stall(222.5, 28.5, Math.PI / 2, MAT.clothBlue);
    for (const [x, z] of [[223, 33], [223.8, 34], [224, 43], [224.5, 55]] as [number, number][]) barrel(x, z);
    lamp(222, 25); lamp(222, 46);
    // the coach stand by the West Gate
    { const cx = 221, cz = 17.5; const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.6, 3.2), mats.bannerRed); body.position.set(cx, 1.4, cz); w.add(body); const roofc = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.15, 3.4), MAT.timber); roofc.position.set(cx, 2.3, cz); w.add(roofc);
      for (const [dx, dz] of [[-1, -1.1], [1, -1.1], [-1, 1.1], [1, 1.1]]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 5, 10), MAT.timber); wh.position.set(cx + dx, 0.45, cz + dz); wh.rotation.y = Math.PI / 2; w.add(wh); }
      w.colliders.push({ minX: cx - 1.1, maxX: cx + 1.1, minZ: cz - 1.7, maxZ: cz + 1.7, h: 2.3 });
      w.interact('coach_ash', cx + 1.8, cz - 1.6, 'Take the coach to Millbrook', 'interact', 1.6); }
  }
  // ---------------- the hill road and Copper Hollow ----------------
  const mineOutside = V(262, 0, -112);
  {
    // the cliff face, with the mine portal cut into it
    for (let x = 222; x < 302; x += 4) { if (x > 256 && x < 268) continue; rock(x + 2, -124 - rnd() * 3, 3.2 + rnd() * 1.6, MAT.stoneDark); }
    for (let x = 226; x < 300; x += 7) rock(x, -133, 5 + rnd() * 3, mats.cliff, false);
    w.colliders.push({ minX: 222, maxX: 259.5, minZ: -131, maxZ: -120, h: 9 }, { minX: 264.5, maxX: 302, minZ: -131, maxZ: -120, h: 9 }, { minX: 258, maxX: 266, minZ: -132, maxZ: -122, h: 9 });
    for (const x of [259.2, 264.8]) w.block(x, -121, 0.5, 0.5, 4.2, MAT.timber);
    w.block(262, -121, 6.2, 0.5, 0.5, MAT.timber, 4.0, false);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 4.0), new THREE.MeshBasicMaterial({ color: 0x050403 })); dark.position.set(262, 2.0, -121.6); w.scene.add(dark);
    w.interact('mine_door', 262, -119.4, 'Enter Copper Hollow', 'interact', 1.8);
    // winding house (the lift) beside the portal
    house('Winding house', 268, 276, -119, -111, { h: 3.4, doors: [['w', -115, 1.4]], roof: MAT.roofSlate, windows: false });
    { const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 10), MAT.timber); drum.rotation.z = Math.PI / 2; drum.position.set(272, 1.3, -116); w.add(drum); w.interact('lift_house', 270.2, -115, 'The winding gear', 'interact', 1.3); }
    // the abandoned miners' camp
    for (const [dx, dz, r] of [[-12, 4, 0.4], [-16, 0, -0.3], [-9, -1, 1.1]] as [number, number, number][]) { const tn = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.0, 4), MAT.linen); tn.position.set(262 + dx, 1.0, -110 + dz); tn.rotation.y = r; w.add(tn); w.colliders.push({ minX: 262 + dx - 1.1, maxX: 262 + dx + 1.1, minZ: -110 + dz - 1.1, maxZ: -110 + dz + 1.1, h: 2 }); }
    fire(250, -105, false);
    w.interact('miner_camp', 251.5, -108, 'Search the miners\' camp', 'pick', 1.6);
    // ore cart and rails
    for (let i = 0; i < 6; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.25), MAT.timber); sl.position.set(262, 0.04, -119 + i * 1.2); w.add(sl); }
    { const cart = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 1.4), MAT.iron); cart.position.set(262, 0.55, -114); w.add(cart); w.colliders.push({ minX: 261.5, maxX: 262.5, minZ: -114.7, maxZ: -113.3, h: 1 }); const ore = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), mats.copper); ore.position.set(262, 0.95, -114); w.add(ore); }
    // copper seams in the rocks outside (with a pick)
    let oi = 0;
    for (const [x, z] of [[240, -116], [284, -117], [236, -100], [292, -104]] as [number, number][]) { rock(x, z - 1.5, 1.6, MAT.stoneDark); const seam = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), mats.copper); seam.position.set(x, 0.6, z - 0.4); w.scene.add(seam); w.interact(`ore_${oi++}`, x, z + 0.6, 'Work the copper seam', 'mine', 1.4); }
    // hill road scenery
    for (let i = 0; i < 40; i++) { const z = -34 - rnd() * 82, x = 248 + (z + 30) * -0.15 + (rnd() < 0.5 ? -1 : 1) * (5 + rnd() * 18); rock(x, z, 0.6 + rnd() * 1.4); }
    for (let i = 0; i < 30; i++) { const z = -34 - rnd() * 80, x = 250 + (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 30); if (x < TOWN.minX - 2 || x > 230) tree(x, z, 0.8 + rnd() * 0.5, 'pine'); }
  }
  // berry bushes and mushroom patches (gatherable)
  {
    const shroomM = M(0xb89acf), berryM = M(0x7a1a3a);
    let n = 0;
    const node = (kind: 'shroom' | 'berry', x: number, z: number) => {
      const g = new THREE.Group();
      if (kind === 'shroom') for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.14, 4), MAT.linen); st.position.set(Math.cos(i * 1.7) * 0.18, 0.07, Math.sin(i * 1.7) * 0.18); g.add(st); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), shroomM); cap.position.set(st.position.x, 0.13, st.position.z); g.add(cap); }
      else { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 0), MAT.leafDark); b.position.y = 0.45; g.add(b); for (let i = 0; i < 7; i++) { const be = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 3), berryM); be.position.set(Math.cos(i * 0.9) * 0.45, 0.4 + (i % 3) * 0.15, Math.sin(i * 0.9) * 0.45); g.add(be); } }
      g.position.set(x, 0, z); w.scene.add(g);
      const it = w.interact(`${kind}_${n++}`, x, z, kind === 'shroom' ? 'Pick the mushrooms' : 'Pick thornberries', 'pick', 1.3);
      w.nodes.push({ id: it.id, kind: kind as any, mesh: g, it });
    };
    for (const [x, z] of [[160, -40], [172, -70], [145, -60], [190, -86], [156, -102], [180, -30], [140, -28], [195, -50]] as [number, number][]) node('shroom', x, z);
    for (const [x, z] of [[138, -18], [146, -14], [186, -18], [176, -96], [198, -66], [133, 40]] as [number, number][]) node('berry', x, z);
  }
  // places used by quests, the map and travel
  Object.assign(w.places, {
    east_gate: V(46, 0, EAST_GATE_Z), brookfield: V(99, 0, -7), farmhouse: V(96.5, 0, -14), thornwood_camp: V(sites.thornwood.x, 0, sites.thornwood.z + 2), hollow_oak: V(150, 0, -92.5),
    toll: V(sites.toll_tower.x, 0, sites.toll_tower.z), bridge: V(209, 0, 12.5), ford: V(209, 0, 114), ashford: V(266, 0, 12.5), docks: V(220, 0, 30), reeve: V(266, 0, -8),
    inn: V(239, 0, 24), lodge: V(279, 0, 24), shrine: V(255.5, 0, 22), bathhouse: V(297.5, 0, 22), apothecary: V(234, 0, 3.5), gunsmith: V(282, 0, 3.5), curio: V(253, 0, 4),
    copper_hollow: mineOutside.clone(), miner_camp: V(251.5, 0, -107), lift_house: V(271, 0, -115), coach_ash: V(223, 0, 16), coach_mb: V(47.5, 0, 7.5),
  });
  const regions: Region[] = [
    { id: 'ashford', name: 'Ashford', minX: TOWN.minX, maxX: TOWN.maxX, minZ: TOWN.minZ, maxZ: TOWN.maxZ },
    { id: 'docks', name: 'the Ashford docks', minX: 206, maxX: TOWN.minX, minZ: 22, maxZ: 62 },
    { id: 'hollow', name: 'the Copper Hollow road', minX: 222, maxX: 306, minZ: -126, maxZ: TOWN.minZ },
    { id: 'thornwood', name: 'Thornwood', minX: 134, maxX: 202, minZ: -126, maxZ: -12 },
    { id: 'brookfield', name: 'Brookfield', minX: 84, maxX: 146, minZ: -26, maxZ: 46 },
    { id: 'toll', name: 'the toll tower', minX: 160, maxX: 196, minZ: 18, maxZ: 50 },
    { id: 'wend', name: 'the River Wend', minX: 196, maxX: 228, minZ: -126, maxZ: 150 },
    { id: 'reach', name: 'the East Road', minX: 42, maxX: 310, minZ: -126, maxZ: 150 },
  ];
  const map: EastRefs['map'] = {
    roads: [[[13, 3.6], [42, EAST_GATE_Z], [96, 5], [150, 5.5], [172, 12.5], [228, 12.5], [304, 12.5]], [[246.5, -30], [248, -50], [254, -78], [262, -112]], [[96, 5], [99, -6]]],
    trails: [[[150, 5], [158, -20], [164, -46], [156, -72], [151, -90]], [[215, 116], [240, 118], [262, 70], [262, 54]], [[203, 114], [150, 118], [100, 110], [64, 100]]],
    water: [[RIVER.minX, -126, RIVER.maxX, 150]], forest: [[136, -112, 200, -14]], fields: [[86, 12, 122, 42], [128, 12, 142, 34]], walls: [[TOWN.minX, TOWN.minZ, TOWN.maxX, TOWN.maxZ]], hills: [[222, -132, 302, -120]],
  };
  // steam over the bath
  let steam: THREE.Points | null = null;
  { const g = new THREE.BufferGeometry(), p: number[] = []; for (let i = 0; i < 40; i++) p.push(295 + Math.random() * 5, 0.4 + Math.random() * 2.2, 22 + Math.random() * 4); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); steam = new THREE.Points(g, mats.steam); w.scene.add(steam); }
  const tmp = new THREE.Vector3();
  return {
    river: RIVER, bridge: BRIDGE, ford: FORD, ashford: V(266, 0, 12.5), mineOutside, regions, map, critters, boats, steam,
    animate(dt: number, t: number, player: THREE.Vector3) {
      stepCritters(critters, dt, t, player);
      boats.forEach((b, i) => { b.position.y = -0.22 + Math.sin(t * 1.1 + i * 2) * 0.05; b.rotation.z = Math.sin(t * 0.9 + i) * 0.03; });
      if (steam && Math.abs(player.x - 297) < 40 && Math.abs(player.z - 22) < 40) { const a = steam.geometry.attributes.position as THREE.BufferAttribute; for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.5; if (y > 2.8) y = 0.4; a.setY(i, y); a.setX(i, a.getX(i) + Math.sin(t + i) * dt * 0.05); } a.needsUpdate = true; }
    },
  };
}

const ctmp = new THREE.Vector3();
/** Farm animals wander, graze and look up when you come close (shared by the Reach and the Westmarch). */
export function stepCritters(critters: Critter[], dt: number, t: number, player: THREE.Vector3) {
  const tmp = ctmp;
      for (const c of critters) {
        // v0.8: animals out past the fog are not drawn at all (and not stepped)
        const far = Math.abs(c.root.position.x - player.x) + Math.abs(c.root.position.z - player.z) > 70; c.root.visible = !far; if (far) continue;
        c.t -= dt;
        const d = tmp.copy(c.target).sub(c.root.position); d.y = 0; const dist = d.length();
        const near = player.distanceTo(c.root.position) < (c.kind === 'hen' ? 2.5 : 4);
        if (c.t <= 0 || (near && c.kind === 'hen' && dist < 0.3)) { c.t = 3 + Math.random() * 6; const a = Math.random() * 6.28, r = Math.random() * c.r; c.target.set(c.home.x + Math.cos(a) * r, 0, c.home.z + Math.sin(a) * r); if (near && c.kind === 'hen') c.target.add(tmp.copy(c.root.position).sub(player).setY(0).normalize().multiplyScalar(2)); }
        const sp = c.kind === 'hen' ? (near ? 2.2 : 0.8) : c.kind === 'cow' ? 0.5 : 0.7;
        if (dist > 0.25) { const step = Math.min(dist, sp * dt); c.root.position.addScaledVector(d.normalize(), step); const yaw = Math.atan2(-d.x, -d.z); let dy = yaw - c.root.rotation.y; while (dy > Math.PI) dy -= 6.283; while (dy < -Math.PI) dy += 6.283; c.root.rotation.y += dy * Math.min(1, dt * 4); c.ph += dt * sp * 7; c.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.35; }); c.head.rotation.x = 0; }
        else { c.legs.forEach(l => { l.rotation.x = 0; }); const graze = near ? 0 : Math.max(0, Math.sin(t * 0.6 + c.home.x)); c.head.rotation.x = c.kind === 'hen' ? (Math.sin(t * 9 + c.home.z) > 0.6 ? 0.8 : 0) : graze * 0.9; if (near) { const want = Math.atan2(-(player.x - c.root.position.x), -(player.z - c.root.position.z)) - c.root.rotation.y; c.head.rotation.y = Math.max(-0.8, Math.min(0.8, Math.atan2(Math.sin(want), Math.cos(want)))); } else c.head.rotation.y *= 0.95; }
      }
}
