// v0.8: the Westmarch (docs/gdd/westmarch.md). Everything beyond Millbrook's West Gate: the Heath Road, the
// Smeaths' charcoal camp, the Barrow Downs with the Ring of Nine, Vane's dig and King Orm's mound, Fernhollow
// on the shore of Lake Hallow, and the reed marsh to the south. Built with the same helpers as the Reach;
// shared props are instanced under "w" keys.
import * as THREE from 'three';
import { bakeSkinned } from './bake';
import { World, MAT, M } from './world';
import { stepCritters, type Critter, type Region } from './east';

export interface WestRefs {
  gate: { leaves: THREE.Group[]; collider: { minX: number; maxX: number; minZ: number; maxZ: number; h: number }; open: boolean; t: number };
  regions: Region[];
  map: { roads: [number, number][][]; trails: [number, number][][]; water: [number, number, number, number][]; forest: [number, number, number, number][]; fields: [number, number, number, number][]; walls: [number, number, number, number][]; hills: [number, number, number, number][]; barrows: [number, number, number][] };
  critters: Critter[]; smoke: THREE.Points[]; boats: THREE.Object3D[]; pole: THREE.Object3D | null;
  ring: THREE.Vector3; door: THREE.Vector3; village: THREE.Vector3;
  marsh: { minX: number; maxX: number; minZ: number; maxZ: number }; boardwalk: [number, number, number, number][];
  openGate(instant?: boolean): void;
  closeGate(): void;
  animate(dt: number, t: number, player: THREE.Vector3): void;
}

export const WEST_GATE = { x: -42, z: 4.5 };
export const LAKE_X = -300;
export const JETTY = { z: 0, end: -316 };
export const RING = { x: -186, z: -66 };
export const ORM_DOOR = { x: -200, z: -91 };
export const VILLAGE = { minX: -300, maxX: -238, minZ: -18, maxZ: 56 };
export const MARSH = { minX: -310, maxX: -246, minZ: 60, maxZ: 140 };

export function buildWest(w: World): WestRefs {
  let seed = 4127;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const mats = {
    dirt: M(0x8a7656), heathPath: M(0x7a6a52), turf: M(0x5f7a3e), turfDark: M(0x4a6232), kerb: M(0x8e8a80), slab: M(0x6e6a62), slabDark: M(0x4a4740),
    heather: M(0x9a5a92), heatherDeep: M(0x7a4476), gorse: M(0x3f5a2a), gorseFlower: M(0xd8b02a), birch: M(0xd8d4c8), birchLeaf: M(0x7a9a46),
    reed: M(0x9a8a52), reedDark: M(0x6a6a3a), bog: M(0x3a3a2a), plank: M(0x7a6040), plankDark: M(0x5a4630), thatchDark: M(0x9a7a42), wallWhite: M(0xd8d0bc),
    water: M(0x3a5a6e, { roughness: 0.12, metalness: 0.2 }), lakeDeep: M(0x2a4252, { roughness: 0.1, metalness: 0.25 }), sand: M(0xa89a76), charcoal: M(0x2a2622), clamp: M(0x4a3a2a),
    canvas: M(0xc8bc9a), soot: M(0x1e1c1a), ribbon: M(0xb83a3a), ribbonB: M(0x3a6ab8), ribbonY: M(0xd8b83a), wool: M(0xe4ddcf), smokeP: new THREE.PointsMaterial({ color: 0xb8b4ac, size: 0.7, transparent: true, opacity: 0.32, depthWrite: false }),
    boat: M(0x5a4430), glowWin: M(0xffcf7a, { emissive: 0xffa040, emissiveIntensity: 0.0 }),
  };
  const sites = w.sites;
  // ---------------- ground ----------------
  const height = (x: number, z: number) => {
    // flat walkable land; hills rise beyond the north and south edges, and beyond the far lake shore
    const n = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.041 + z * 0.057) * 0.5;
    const north = -126 - z, south = z - 150, far = -352 - x;
    const hill = Math.max(north, south, far);
    let y = hill > 0 ? Math.min(18, hill * 0.8) + n * 2.4 * Math.min(1, hill / 6) : 0;
    if (x < LAKE_X - 0.5 && hill <= 0) y = -1.2 - Math.min(1.5, (LAKE_X - x) * 0.05);        // the lake bed
    return y;
  };
  const groundPlane = (X0: number, X1: number, Z0: number, Z1: number, step: number) => {
    const geo = new THREE.PlaneGeometry(X1 - X0, Z1 - Z0, Math.round((X1 - X0) / step), Math.round((Z1 - Z0) / step));
    const pos = geo.attributes.position as THREE.BufferAttribute; const col: number[] = []; const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + (X0 + X1) / 2, z = -pos.getY(i) + (Z0 + Z1) / 2;
      const n = Math.sin(x * 0.19) * Math.cos(z * 0.15) * 0.5 + Math.sin(x * 0.045 + z * 0.06) * 0.5;
      const y = height(x, z); pos.setZ(i, y);
      const village = x > VILLAGE.minX && x < VILLAGE.maxX && z > VILLAGE.minZ && z < VILLAGE.maxZ;
      const downs = x > -238 && x < -146 && z < -14 && z > -126;
      const copse = x > -126 && x < -82 && z > -54 && z < -10;
      const marsh = x > MARSH.minX && x < MARSH.maxX && z > MARSH.minZ - 4 && z < MARSH.maxZ;
      const shore = x < LAKE_X + 3 && x > LAKE_X - 1.5;
      if (y < -0.4) c.set(0x5a5040).multiplyScalar(0.85 + n * 0.08);
      else if (y > 0.3) c.setHSL(0.2 - n * 0.02, 0.2, 0.32 + Math.min(0.12, y * 0.006));
      else if (shore) c.set(0xa89a76).multiplyScalar(0.92 + n * 0.06);
      else if (marsh) c.setHSL(0.17 + n * 0.02, 0.28, 0.24 + n * 0.03);
      else if (village) c.setHSL(0.2, 0.26, 0.38 + n * 0.03);
      else if (downs) c.setHSL(0.25 - n * 0.015, 0.32, 0.35 + n * 0.035);
      else if (copse) c.setHSL(0.22, 0.28, 0.27 + n * 0.03);
      else c.setHSL(0.9 + n * 0.03, 0.12 + Math.max(0, n) * 0.08, 0.3 + n * 0.035);   // heath: purple-brown
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    g.rotation.x = -Math.PI / 2; g.position.set((X0 + X1) / 2, -0.008, (Z0 + Z1) / 2); g.receiveShadow = true; w.scene.add(g);
  };
  groundPlane(-372, -80, -160, 170, 2.5);
  groundPlane(-80, -62, -160, -50, 2.5);       // the strip north of Millbrook's own ground
  groundPlane(-80, -62, 150, 170, 2.5);
  // Lake Hallow
  { const lake = new THREE.Mesh(new THREE.PlaneGeometry(80, 340), mats.lakeDeep); lake.rotation.x = -Math.PI / 2; lake.position.set(LAKE_X - 40, -0.32, 5); lake.receiveShadow = true; w.scene.add(lake);
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(3, 300), mats.water); edge.rotation.x = -Math.PI / 2; edge.position.set(LAKE_X - 1.3, -0.3, 10); w.scene.add(edge); }
  // ---------------- edges of the world ----------------
  {
    // the old west edge of the map at x = -64 opens north of the Vale; the Vale itself stays closed to the west
    const i = w.colliders.findIndex(c => c.minX === -66 && c.maxX === -64); if (i >= 0) w.colliders.splice(i, 1);
    w.colliders.push(
      { minX: -66, maxX: -64, minZ: 36, maxZ: 152, h: 9 },            // between the Vale and the heath
      { minX: -64, maxX: -62, minZ: -128, maxZ: -30, h: 9 },          // north of Millbrook
      // the lake: open water west of the shore, except the jetty
      { minX: -380, maxX: LAKE_X - 0.4, minZ: -130, maxZ: JETTY.z - 1.15, h: 9 }, { minX: -380, maxX: LAKE_X - 0.4, minZ: JETTY.z + 1.15, maxZ: 154, h: 9 },
      { minX: -380, maxX: JETTY.end - 0.4, minZ: JETTY.z - 1.2, maxZ: JETTY.z + 1.2, h: 9 },
    );
    // v0.9.4: the old north and south edges were invisible 9 m colliders. They are now visible drystone walls
    // (3 m, same line and footprint), so what blocks you can be seen.
    w.block(-218, -128, 308, 4, 3, MAT.stoneDark); w.block(-218, 152, 308, 4, 3, MAT.stoneDark);
    w.bounds = { minX: -350, maxX: w.bounds.maxX, minZ: -126, maxZ: 150 };
  }
  // ---------------- helpers ----------------
  const pathSeg = (x1: number, z1: number, x2: number, z2: number, wd: number, mat: THREE.Material, y = 0.013) => {
    const len = Math.hypot(x2 - x1, z2 - z1); const p = new THREE.Mesh(new THREE.PlaneGeometry(wd, len + wd * 0.6), mat);
    p.rotation.x = -Math.PI / 2; p.rotation.z = -Math.atan2(x2 - x1, z2 - z1); p.position.set((x1 + x2) / 2, y, (z1 + z2) / 2); p.receiveShadow = true; w.scene.add(p);
  };
  const road = (pts: [number, number][], wd = 3.0, mat: THREE.Material = mats.dirt) => { for (let i = 1; i < pts.length; i++) pathSeg(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], wd, mat); };
  const tree = (x: number, z: number, s: number, kind: 'birch' | 'pine' | 'thorn' | 'rowan') => {
    const ry = new THREE.Euler(0, rnd() * 6, 0), sc = V(s, s, s);
    if (kind === 'pine') {
      w.put('wPineT', () => new THREE.CylinderGeometry(0.15, 0.24, 2.4, 6), MAT.bark, V(x, 1.2 * s, z), ry, sc);
      for (let i = 0; i < 3; i++) w.put('wPine' + i, () => new THREE.ConeGeometry(1.4 - i * 0.36, 2.0, 7), MAT.leafDark, V(x, (2.4 + i * 1.0) * s, z), ry, sc);
    } else if (kind === 'thorn') {
      // a wind-bent hawthorn on the heath: leaning trunk, flat crown pushed east
      w.put('wThornT', () => new THREE.CylinderGeometry(0.12, 0.22, 2.2, 5), MAT.bark, V(x + 0.3 * s, 1.0 * s, z), new THREE.Euler(0, 0, -0.35), sc);
      w.put('wThornC', () => new THREE.IcosahedronGeometry(1.2, 0), mats.gorse, V(x + 1.0 * s, 2.2 * s, z), ry, V(s * 1.5, s * 0.55, s * 1.1));
    } else {
      w.put(kind === 'birch' ? 'wBirchT' : 'wRowanT', () => new THREE.CylinderGeometry(0.13, 0.2, 2.8, 6), kind === 'birch' ? mats.birch : MAT.bark, V(x, 1.4 * s, z), ry, sc);
      if (kind === 'birch') { w.put('wBirchA', () => new THREE.IcosahedronGeometry(0.85, 0), mats.birchLeaf, V(x, 3.4 * s, z), ry, V(s * 0.75, s * 1.35, s * 0.75)); w.put('wBirchB', () => new THREE.IcosahedronGeometry(0.6, 0), mats.birchLeaf, V(x + 0.35 * s, 2.5 * s, z - 0.2 * s), ry, V(s * 0.8, s * 0.9, s * 0.8)); }
      else w.put('wRowanA', () => new THREE.IcosahedronGeometry(1.0, 0), MAT.leaf, V(x, 3.2 * s, z), ry, V(s * 0.9, s * 1.1, s * 0.9));
      if (kind === 'rowan') for (let i = 0; i < 6; i++) w.put('wRowanB', () => new THREE.SphereGeometry(0.07, 4, 3), mats.ribbon, V(x + Math.cos(i * 1.1) * 0.9 * s, (3.0 + (i % 2) * 0.5) * s, z + Math.sin(i * 1.1) * 0.9 * s), undefined, undefined, false);
    }
    w.colliders.push({ minX: x - 0.28 * s, maxX: x + 0.28 * s, minZ: z - 0.28 * s, maxZ: z + 0.28 * s, h: 4 });
    w.cameraBlockers.push({ minX: x - 1 * s, maxX: x + 1 * s, minZ: z - 1 * s, maxZ: z + 1 * s, h: 5 * s });
  };
  const heatherClump = (x: number, z: number, s: number) => {
    // three small domes clustered, so a clump reads as a low bush rather than a stone
    for (let k = 0; k < 3; k++) { const a = rnd() * 6.28, d = 0.18 * s; w.put(k === 1 ? 'wHeathD' : 'wHeath', () => new THREE.IcosahedronGeometry(0.2, 1), k === 1 ? mats.heatherDeep : mats.heather, V(x + Math.cos(a) * d, 0.1 * s, z + Math.sin(a) * d), new THREE.Euler(0, rnd() * 6, 0), V(s * (0.9 + rnd() * 0.5), s * (0.55 + rnd() * 0.3), s * (0.9 + rnd() * 0.5)), false); }
  };
  const gorse = (x: number, z: number, s: number) => {
    w.put('wGorse', () => new THREE.IcosahedronGeometry(0.6, 0), mats.gorse, V(x, 0.42 * s, z), new THREE.Euler(0, rnd() * 6, 0), V(s, s * 0.8, s));
    for (let i = 0; i < 4; i++) w.put('wGorseF', () => new THREE.BoxGeometry(0.09, 0.09, 0.09), mats.gorseFlower, V(x + Math.cos(i * 1.6) * 0.45 * s, (0.5 + (i % 2) * 0.25) * s, z + Math.sin(i * 1.6) * 0.45 * s), undefined, undefined, false);
  };
  const rock = (x: number, z: number, s: number, collide = true) => {
    w.put('wRock', () => new THREE.DodecahedronGeometry(1, 0), MAT.rock, V(x, s * 0.4, z), new THREE.Euler(rnd() * 3, rnd() * 3, 0), V(s, s * 0.65, s));
    if (collide) w.colliders.push({ minX: x - s * 0.8, maxX: x + s * 0.8, minZ: z - s * 0.8, maxZ: z + s * 0.8, h: s });
  };
  const reeds = (x: number, z: number, n: number, r: number) => {
    for (let i = 0; i < n; i++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r, h = 1.1 + rnd() * 0.9; w.put(i % 3 ? 'wReed' : 'wReedD', () => new THREE.CylinderGeometry(0.02, 0.035, 1, 3), i % 3 ? mats.reed : mats.reedDark, V(x + Math.cos(a) * d, h / 2, z + Math.sin(a) * d), new THREE.Euler((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25), V(1, h, 1), false); }
  };
  const fence = (x1: number, z1: number, x2: number, z2: number, collide = true) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 2));
    for (let i = 0; i <= n; i++) { const t = i / n; w.put('wFenceP', () => new THREE.BoxGeometry(0.14, 1.1, 0.14), MAT.timber, V(x1 + (x2 - x1) * t, 0.55, z1 + (z2 - z1) * t)); }
    const ang = -Math.atan2(z2 - z1, x2 - x1);
    for (const y of [0.45, 0.85]) w.put('wFenceR', () => new THREE.BoxGeometry(1, 0.08, 0.06), MAT.wood, V((x1 + x2) / 2, y, (z1 + z2) / 2), new THREE.Euler(0, ang, 0), V(len, 1, 1));
    if (collide) w.colliders.push({ minX: Math.min(x1, x2) - 0.15, maxX: Math.max(x1, x2) + 0.15, minZ: Math.min(z1, z2) - 0.15, maxZ: Math.max(z1, z2) + 0.15, h: 1.1 });
  };
  const drystone = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.round(len / 0.9)), ang = -Math.atan2(z2 - z1, x2 - x1);
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; w.put('wDry', () => new THREE.BoxGeometry(0.95, 0.42, 0.7), i % 2 ? MAT.stone : mats.kerb, V(x1 + (x2 - x1) * t, 0.21 + (i % 3) * 0.02, z1 + (z2 - z1) * t), new THREE.Euler(0, ang + (rnd() - 0.5) * 0.12, 0)); }
    for (let i = 0; i < n; i += 2) { const t = (i + 0.5) / n; w.put('wDryTop', () => new THREE.BoxGeometry(0.8, 0.3, 0.5), mats.kerb, V(x1 + (x2 - x1) * t, 0.55, z1 + (z2 - z1) * t), new THREE.Euler(0, ang + 0.2, 0)); }
    w.colliders.push({ minX: Math.min(x1, x2) - 0.35, maxX: Math.max(x1, x2) + 0.35, minZ: Math.min(z1, z2) - 0.35, maxZ: Math.max(z1, z2) + 0.35, h: 0.75 });
  };
  /** A whole building: walls with doors, a roof that hides when you walk in, windows that glow at night. */
  const house = (name: string, minX: number, maxX: number, minZ: number, maxZ: number, o: { h?: number; wall?: THREE.Material; roof?: THREE.Material; doors: ['n' | 's' | 'e' | 'w', number, number][]; windows?: boolean; floor?: THREE.Material; chimney?: boolean }) => {
    const h = o.h ?? 3.4;
    w.shell(minX, maxX, minZ, maxZ, h, o.doors, o.wall ?? mats.wallWhite);
    w.roof(minX, maxX, minZ, maxZ, h, o.roof ?? MAT.thatch, name);
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
  const sign = (x: number, z: number, rot: number) => { w.block(x, z, 0.14, 0.14, 2.2, MAT.timber, 0, true); const b = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 0.06), MAT.woodLight); b.position.set(x + Math.cos(rot) * 0.5, 1.9, z - Math.sin(rot) * 0.5); b.rotation.y = rot; w.add(b); };
  const hearth = (x: number, z: number, fire = true) => {
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), MAT.stoneDark); st.position.set(x + Math.cos(a) * 0.62, 0.12, z + Math.sin(a) * 0.62); w.add(st); }
    if (fire) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.75, 6), MAT.fire.clone()); f.position.set(x, 0.38, z); w.scene.add(f); w.fires.push(f); w.lights.add(x, 1.0, z, 0xff9a40, 13, 12, 1.5, { flicker: 0.12 }); }
    w.colliders.push({ minX: x - 0.7, maxX: x + 0.7, minZ: z - 0.7, maxZ: z + 0.7, h: 0.5 });
  };
  const critters: Critter[] = [], boats: THREE.Object3D[] = [], smoke: THREE.Points[] = [];
  const sheep = (x: number, z: number, r: number) => {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.position.set(x, 0, z); w.scene.add(root);
    const legs: THREE.Object3D[] = [];
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.9), mats.wool); b.position.y = 0.65; body.add(b);
    const head = new THREE.Group(); head.position.set(0, 0.8, -0.5); body.add(head);
    const hm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.34), M(0x2a2420)); hm.position.z = -0.1; head.add(hm);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 4), M(0x2a2420)); l.position.set(lx * 0.18, 0.23, lz * 0.3); body.add(l); legs.push(l); }
    root.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    bakeSkinned(root, [body, head, ...legs], 0.2);
    critters.push({ root, head, home: V(x, 0, z), r, target: V(x, 0, z), t: rnd() * 5, kind: 'sheep', legs, ph: 0 });
  };
  const smokeColumn = (x: number, y: number, z: number, n = 36, spread = 1.2) => {
    const g = new THREE.BufferGeometry(), p: number[] = [];
    for (let i = 0; i < n; i++) p.push(x + (rnd() - 0.5) * spread, y + rnd() * 6, z + (rnd() - 0.5) * spread);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); const pts = new THREE.Points(g, mats.smokeP); pts.userData = { x, y, z, spread }; w.scene.add(pts); smoke.push(pts);
  };
  const boat = (x: number, z: number, rot: number) => {
    const g = new THREE.Group(); g.position.set(x, -0.28, z); g.rotation.y = rot; w.scene.add(g);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.42, 3.6), mats.boat); hull.position.y = 0.05; g.add(hull);
    const bow = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.1, 4), mats.boat); bow.rotation.x = -Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.05, -2.3); bow.scale.set(1, 1, 0.5); g.add(bow);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.3), MAT.woodLight); seat.position.set(0, 0.26, 0.3); g.add(seat);
    w.add(g); boats.push(g);
  };

  // ---------------- the West Gate ----------------
  const gateCollider = { minX: WEST_GATE.x - 0.35, maxX: WEST_GATE.x + 0.35, minZ: WEST_GATE.z - 3, maxZ: WEST_GATE.z + 3, h: 3.4 };
  const leaves: THREE.Group[] = [];
  {
    // (world.walls leaves the gap in the palisade at z 1.5–7.5)
    for (const z of [WEST_GATE.z - 3.0, WEST_GATE.z + 3.0]) { w.block(WEST_GATE.x, z, 1.2, 1.2, 5, MAT.timber); const r = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.2, 4), MAT.roof); r.position.set(WEST_GATE.x, 5.6, z); r.rotation.y = Math.PI / 4; w.add(r); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 7.2), MAT.timber); lintel.position.set(WEST_GATE.x, 4.4, WEST_GATE.z); w.add(lintel);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(WEST_GATE.x, 0, WEST_GATE.z + side * 2.4); w.scene.add(pivot);
      for (let i = 0; i < 5; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.46), i % 2 ? MAT.wood : MAT.timber); pl.position.set(0, 1.6, -side * (0.24 + i * 0.47)); pl.castShadow = true; pivot.add(pl); }
      for (const y of [0.7, 2.5]) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 2.35), MAT.timber); br.position.set(0.1, y, -side * 1.17); pivot.add(br); }
      leaves.push(pivot);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 5.2), MAT.iron); bar.position.set(WEST_GATE.x + 0.32, 1.5, WEST_GATE.z); bar.name = 'westBar'; w.scene.add(bar); leaves[0].userData.bar = bar;
    w.colliders.push(gateCollider);
    w.lantern(WEST_GATE.x - 2.2, WEST_GATE.z - 3.4); w.lantern(WEST_GATE.x - 2.2, WEST_GATE.z + 3.4);
    w.interact('west_gate', WEST_GATE.x + 1.0, WEST_GATE.z, 'Unbar the West Gate', 'interact', 1.8, Math.PI / 2);
    // a road from the square past your house to the gate
    road([[-21, -1], [-30, 1.5], [-38, 4.5], [WEST_GATE.x + 0.5, WEST_GATE.z]], 2.4, MAT.path);
  }
  // ---------------- the West Road over the heath ----------------
  const ROAD: [number, number][] = [[WEST_GATE.x - 0.5, WEST_GATE.z], [-64, 4.5], [-96, 2], [-128, 6], [-160, 8], [-196, 6], [-228, 9], [-254, 12], [-263, 12]];
  road(ROAD, 3.0);
  road([[-100, 2], [-103, -12], [-104, -22]], 1.6, mats.heathPath);                       // to the Smeaths' camp
  road([[-160, 8], [-164, -12], [-166, -24], [-180, -48], [-186, -58], [-194, -78], [-200, -90]], 1.5, mats.heathPath);   // up onto the Downs
  road([[-244, 9], [-243, -8], [-243, -15]], 1.4, mats.heathPath);                         // Cadoc's hut
  road([[-263, 30], [-262, 44], [-262, 57]], 1.6, mats.heathPath);                         // south lane to the marsh
  sign(-66, 7.6, 0); sign(-159, 11, 0.5); sign(-236, 13, 0);
  // the fallen milestone
  { const ms = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), MAT.stone); ms.position.set(-120, 0.25, 10.6); ms.rotation.set(0, 0.4, 1.35); w.add(ms); w.colliders.push({ minX: -121.2, maxX: -118.8, minZ: 10, maxZ: 11.2, h: 0.6 });
    w.interact('milestone', -120, 9.4, 'Read the fallen milestone', 'interact', 1.4); }
  // heath scatter: heather, gorse, thorn trees, rocks
  for (let i = 0; i < 520; i++) {
    const x = -64 - rnd() * 186, z = -14 + rnd() * 80;
    if (Math.abs(z - (x > -160 ? 5 : 8)) < 3.5) continue;                                        // keep the road clear
    if (x > -126 && x < -82 && z < -10) continue;
    if (x < VILLAGE.maxX + 2) continue;
    heatherClump(x, z, 0.7 + rnd() * 0.9);
  }
  for (let i = 0; i < 70; i++) { const x = -66 - rnd() * 170, z = -12 + rnd() * 76; if (Math.abs(z - 6) < 4) continue; if (x > -126 && x < -82 && z < -10) continue; if (x < VILLAGE.maxX + 2) continue; gorse(x, z, 0.7 + rnd() * 0.7); }
  for (let i = 0; i < 18; i++) { const x = -70 - rnd() * 164, z = -10 + rnd() * 70; if (Math.abs(z - 6) < 6) continue; tree(x, z, 0.8 + rnd() * 0.4, 'thorn'); }
  for (let i = 0; i < 22; i++) { const x = -66 - rnd() * 168, z = -12 + rnd() * 76; if (Math.abs(z - 6) < 5) continue; if (x > -126 && x < -82 && z < -10) continue; rock(x, z, 0.5 + rnd() * 1.0, rnd() > 0.3); }
  // the heath also runs south of the road to the marsh
  for (let i = 0; i < 160; i++) { const x = -70 - rnd() * 170, z = 60 + rnd() * 88; if (x < -240) continue; heatherClump(x, z, 0.7 + rnd() * 0.8); }
  for (let i = 0; i < 30; i++) { const x = -70 - rnd() * 170, z = 62 + rnd() * 84; if (x < -240) continue; gorse(x, z, 0.8 + rnd() * 0.6); }
  // Wynn Calder's fold, by the road
  { const fx = -146, fz = 38; fence(fx - 6, fz - 5, fx + 6, fz - 5); fence(fx + 6, fz - 5, fx + 6, fz + 5); fence(fx + 6, fz + 5, fx - 6, fz + 5); fence(fx - 6, fz + 5, fx - 6, fz + 1.2); fence(fx - 6, fz - 1.2, fx - 6, fz - 5);
    for (let i = 0; i < 5; i++) sheep(fx - 3 + (i % 3) * 2.5, fz - 2 + Math.floor(i / 3) * 3, 4);
    const shel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, 2.6), mats.thatchDark); shel.position.set(fx + 3.5, 1.9, fz + 3); shel.rotation.x = 0.2; w.add(shel);
    for (const [dx, dz] of [[2, 1.9], [5, 1.9], [2, 4.1], [5, 4.1]]) w.block(fx + dx, fz + dz, 0.14, 0.14, 1.9, MAT.timber, 0, false);
    for (let i = 0; i < 3; i++) sheep(-130 + i * 6, 26 + (i % 2) * 5, 8);
  }
  // ---------------- the Smeaths' charcoal camp ----------------
  const CAMP = V(-104, 0, -30);
  {
    for (let i = 0; i < 38; i++) { const a = rnd() * 6.28, d = 9 + rnd() * 13, x = CAMP.x + Math.cos(a) * d, z = CAMP.z + Math.sin(a) * d * 0.85; if (Math.abs(x - CAMP.x + 1.5) < 2.5 && z > CAMP.z) continue; tree(x, z, 0.85 + rnd() * 0.45, rnd() < 0.8 ? 'birch' : 'rowan'); }
    // three earth clamps, smoking
    for (const [dx, dz, s] of [[-6, -4, 1.1], [5, -6, 1.25], [-1, -11, 0.95]] as [number, number, number][]) {
      const cl = new THREE.Mesh(new THREE.SphereGeometry(2.2 * s, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.clamp); cl.scale.y = 0.62; cl.position.set(CAMP.x + dx, 0, CAMP.z + dz); w.add(cl);
      for (let i = 0; i < 6; i++) { const tf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), mats.turfDark); tf.position.set(CAMP.x + dx + Math.cos(i) * 1.6 * s, 0.75 * s, CAMP.z + dz + Math.sin(i) * 1.6 * s); tf.rotation.y = i; w.add(tf); }
      w.colliders.push({ minX: CAMP.x + dx - 2 * s, maxX: CAMP.x + dx + 2 * s, minZ: CAMP.z + dz - 2 * s, maxZ: CAMP.z + dz + 2 * s, h: 1.4 * s });
      smokeColumn(CAMP.x + dx, 1.3 * s, CAMP.z + dz, 26, 1.4);
    }
    // turf huts
    for (const [dx, dz] of [[-10, 5], [9, 4]] as [number, number][]) {
      const hut = new THREE.Mesh(new THREE.ConeGeometry(2.3, 3.0, 8, 1, true), M(0x5a5232)); hut.position.set(CAMP.x + dx, 1.6, CAMP.z + dz); (hut.material as THREE.Material).side = THREE.DoubleSide; w.add(hut);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.1), mats.soot); door.position.set(CAMP.x + dx - Math.sign(dx) * 1.7, 0.7, CAMP.z + dz + 1.5); door.rotation.y = Math.sign(dx) * 0.8; w.add(door);
      w.colliders.push({ minX: CAMP.x + dx - 1.9, maxX: CAMP.x + dx + 1.9, minZ: CAMP.z + dz - 1.9, maxZ: CAMP.z + dz + 1.9, h: 3 });
    }
    hearth(CAMP.x, CAMP.z + 2);
    w.interact('burner_fire', CAMP.x + 1.3, CAMP.z + 3.4, 'Warm yourself at the Smeaths\' fire', 'interact', 1.6);
    w.interact('burner_trade', CAMP.x - 3.2, CAMP.z + 5.2, 'The Smeaths\' woodpile and stores', 'interact', 1.5);
    for (let i = 0; i < 5; i++) w.put('wLog', () => new THREE.CylinderGeometry(0.18, 0.2, 2.6, 6), MAT.bark, V(CAMP.x - 4 + (i % 3) * 0.4, 0.2 + Math.floor(i / 3) * 0.36, CAMP.z + 6.2 + (i % 3) * 0.4), new THREE.Euler(0, 0, Math.PI / 2));
    w.colliders.push({ minX: CAMP.x - 5.5, maxX: CAMP.x - 2.6, minZ: CAMP.z + 5.8, maxZ: CAMP.z + 7.4, h: 0.9 });
    for (const [dx, dz] of [[2.6, 4.2], [-2.2, 3.6]] as [number, number][]) { const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 1.6, 6), MAT.bark); bench.rotation.z = Math.PI / 2; bench.position.set(CAMP.x + dx, 0.26, CAMP.z + dz); w.add(bench); }
    // the rake leaning on a clamp
    const rake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 4), MAT.wood); rake.position.set(CAMP.x + 3.2, 1.0, CAMP.z - 3.6); rake.rotation.z = 0.5; w.add(rake);
  }
  // ---------------- the Barrow Downs ----------------
  const barrowsMap: [number, number, number][] = [];
  const longBarrow = (x: number, z: number, len: number, wid: number, h: number, rot: number, opened = false) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rot; w.scene.add(g);
    const mound = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), mats.turf); mound.scale.set(wid / 2, h, len / 2); g.add(mound);
    const n = Math.round(len * 1.1);
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const st = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7 + (i % 3) * 0.2, 0.35), mats.kerb); st.position.set(Math.cos(a) * (wid / 2 + 0.3), 0.3, Math.sin(a) * (len / 2 + 0.3)); st.rotation.y = -a; g.add(st); }
    // the forecourt stones at the east end
    for (const sx of [-1, 1]) { const fs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.5), mats.slab); fs.position.set(sx * 1.2, 1.1, -len / 2 - 0.6); g.add(fs); }
    if (opened) {
      // Vane's trench cut into the end of it, with the passage stones showing
      const cut = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 3.8), M(0x2e2618)); cut.position.set(0, 0.9, -len / 2 + 1.6); g.add(cut);
      const lin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.6), mats.slabDark); lin.position.set(0, 1.9, -len / 2 + 0.2); g.add(lin);
      for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7 + rnd() * 0.4, 0), M(0x6a5a40)); sp.scale.y = 0.5; sp.position.set(3 + rnd() * 2, 0.2, -len / 2 + rnd() * 5); g.add(sp); }
    }
    w.add(g);
    const c = Math.abs(Math.cos(rot)), s2 = Math.abs(Math.sin(rot)), hx = (wid / 2) * c + (len / 2) * s2, hz = (wid / 2) * s2 + (len / 2) * c;
    w.colliders.push({ minX: x - hx * 0.86, maxX: x + hx * 0.86, minZ: z - hz * 0.86, maxZ: z + hz * 0.86, h });
    barrowsMap.push([x, z, Math.max(hx, hz)]);
  };
  longBarrow(-170, -36, 18, 7, 3.0, -Math.PI / 2, true);      // Vane's, opened at its east end
  longBarrow(-208, -30, 16, 6.5, 2.8, 0.3);
  longBarrow(-158, -80, 15, 6, 2.6, Math.PI / 2 + 0.2);
  longBarrow(-224, -64, 17, 6.5, 2.9, 1.2);
  longBarrow(-214, -14 - 10, 10, 5, 2.0, 0.9);
  // King Orm's great mound with its stone facade
  {
    const ox = ORM_DOOR.x, oz = -106, R = 14;
    const mound = new THREE.Mesh(new THREE.SphereGeometry(R, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.turfDark); mound.scale.y = 0.5; mound.position.set(ox, 0, oz); w.add(mound);
    w.colliders.push({ minX: ox - R * 0.82, maxX: ox + R * 0.82, minZ: oz - R * 0.82, maxZ: ORM_DOOR.z - 1.6, h: 7 });
    for (let i = 0; i < 9; i++) { const x = ox - 7 + i * 1.75; if (Math.abs(x - ox) < 1.3) continue; const sl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.2 + Math.abs(i - 4) * -0.25 + 0.8, 0.6), i % 2 ? mats.slab : mats.slabDark); sl.position.set(x, 1.6, ORM_DOOR.z - 1.2); sl.rotation.y = (rnd() - 0.5) * 0.08; w.add(sl); }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 0.9), mats.slabDark); lintel.position.set(ox, 3.0, ORM_DOOR.z - 1.2); w.add(lintel);
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.6, 0.3), M(0x3a3832)); door.position.set(ox, 1.3, ORM_DOOR.z - 1.35); w.add(door);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.06), M(0x5a8a6a, { metalness: 0.5, roughness: 0.45 })); hand.position.set(ox + 0.5, 1.3, ORM_DOOR.z - 1.18); w.add(hand);
    for (const sx of [-1, 1]) { w.block(ox + sx * 2.6, ORM_DOOR.z + 0.4, 0.4, 0.4, 1.1, MAT.stoneDark); const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.25, 0.3, 8), MAT.iron); bowl.position.set(ox + sx * 2.6, 1.25, ORM_DOOR.z + 0.4); w.add(bowl); }
    w.interact('barrow_door', ox, ORM_DOOR.z + 0.2, 'Open King Orm\'s door', 'interact', 1.8, 0);
    barrowsMap.push([ox, oz, R]);
  }
  // the Ring of Nine
  {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.2, x = RING.x + Math.cos(a) * 8.5, z = RING.z + Math.sin(a) * 8.5;
      if (i === 6) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.6, 0.6), mats.slab); st.position.set(x, 0.3, z); st.rotation.set(Math.PI / 2 - 0.1, a, 0); w.add(st); w.colliders.push({ minX: x - 1.6, maxX: x + 1.6, minZ: z - 1.6, maxZ: z + 1.6, h: 0.6 }); continue; }
      const h = 2.8 + (i % 3) * 0.55; const st = new THREE.Mesh(new THREE.BoxGeometry(0.75, h, 0.55), i % 2 ? mats.slab : mats.slabDark); st.position.set(x, h / 2, z); st.rotation.y = -a + (rnd() - 0.5) * 0.2; st.rotation.z = (rnd() - 0.5) * 0.08; w.add(st);
      w.colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45, h });
    }
    const altar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 1.1), mats.slabDark); altar.position.set(RING.x, 0.25, RING.z - 1.2); w.add(altar);
    w.colliders.push({ minX: RING.x - 0.9, maxX: RING.x + 0.9, minZ: RING.z - 1.75, maxZ: RING.z - 0.65, h: 0.5 });
  }
  // Vane's dig camp beside the opened barrow
  const DIG = V(-162, 0, -26);
  {
    const tent = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 2.0, 2.4, 3, 1, true), mats.canvas); tent.rotation.z = Math.PI / 2; tent.rotation.y = Math.PI / 2; tent.scale.set(1, 1.4, 1); tent.position.set(DIG.x - 3, 1.0, DIG.z); (tent.material as THREE.Material).side = THREE.DoubleSide; w.add(tent);
    w.colliders.push({ minX: DIG.x - 5, maxX: DIG.x - 1, minZ: DIG.z - 1.8, maxZ: DIG.z + 1.8, h: 2 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.9), MAT.woodLight); table.position.set(DIG.x + 1.5, 0.82, DIG.z + 0.6); w.add(table);
    for (const [dx, dz] of [[-0.8, -0.35], [0.8, -0.35], [-0.8, 0.35], [0.8, 0.35]]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.06), MAT.wood); lg.position.set(DIG.x + 1.5 + dx, 0.4, DIG.z + 0.6 + dz); w.add(lg); }
    for (let i = 0; i < 4; i++) { const pp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.01, 0.36), MAT.paper); pp.position.set(DIG.x + 1.0 + i * 0.32, 0.87, DIG.z + 0.5 + (i % 2) * 0.1); pp.rotation.y = rnd() - 0.5; w.add(pp); }
    w.colliders.push({ minX: DIG.x + 0.5, maxX: DIG.x + 2.5, minZ: DIG.z + 0.1, maxZ: DIG.z + 1.1, h: 0.9 });
    for (let i = 0; i < 3; i++) crate(DIG.x - 0.4 + i * 0.9, DIG.z - 2.6, 0.7);
    const lad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.6, 0.08), MAT.wood); lad.position.set(-160.8, 1.1, -37.5); lad.rotation.x = 0.35; w.add(lad);
    lamp(DIG.x + 3.4, DIG.z - 1.2);
    w.interact('vane_finds', DIG.x + 1.5, DIG.z + 1.5, 'Look over Vane\'s finds', 'interact', 1.3, Math.PI);
  }
  // bilberry bushes between the barrows (gatherable, regrow each morning)
  const node = (kind: 'heather' | 'bilberry', x: number, z: number, n: number) => {
    const g = new THREE.Group();
    if (kind === 'heather') for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), i % 2 ? mats.heather : M(0xa060a0)); b.position.set(Math.cos(i * 1.3) * 0.32, 0.18, Math.sin(i * 1.3) * 0.32); b.scale.y = 0.7; g.add(b); }
    else { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), M(0x3f5a32)); b.position.y = 0.35; b.scale.y = 0.6; g.add(b); for (let i = 0; i < 9; i++) { const be = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), M(0x2a2a5a)); be.position.set(Math.cos(i * 0.8) * 0.42, 0.3 + (i % 3) * 0.1, Math.sin(i * 0.8) * 0.42); g.add(be); } }
    g.position.set(x, 0, z); w.scene.add(g);
    const it = w.interact(`${kind}_${n}`, x, z, kind === 'heather' ? 'Cut heather' : 'Pick bilberries', 'pick', 1.3);
    w.nodes.push({ id: it.id, kind, mesh: g, it });
  };
  [[-82, -6], [-92, 20], [-118, 18], [-136, -6], [-142, 52], [-176, 30], [-198, 22], [-110, 46], [-214, 40], [-86, 34]].forEach(([x, z], i) => node('heather', x, z, i));
  [[-176, -54], [-196, -42], [-152, -58], [-214, -86], [-182, -96], [-230, -44], [-160, -104]].forEach(([x, z], i) => node('bilberry', x, z, i));
  for (let i = 0; i < 40; i++) { const x = -150 - rnd() * 86, z = -16 - rnd() * 108; if (Math.hypot(x - RING.x, z - RING.z) < 11) continue; rock(x, z, 0.4 + rnd() * 0.6, false); }
  for (let i = 0; i < 9; i++) { const x = -150 - rnd() * 86, z = -20 - rnd() * 100; if (Math.hypot(x - RING.x, z - RING.z) < 12 || Math.hypot(x - ORM_DOOR.x, z + 106) < 18) continue; tree(x, z, 0.9 + rnd() * 0.5, 'thorn'); }
  // ---------------- Fernhollow ----------------
  const G0 = V(-272, 0, 12);
  {
    // the green with its maypole
    const green = new THREE.Mesh(new THREE.CircleGeometry(9.5, 22), M(0x6f8a48)); green.rotation.x = -Math.PI / 2; green.position.set(G0.x, 0.011, G0.z); green.receiveShadow = true; w.scene.add(green);
    w.cyl(G0.x, G0.z, 0.16, 6.5, MAT.woodLight, 0, 8);
    var pole = new THREE.Group(); pole.position.set(G0.x, 6.3, G0.z); w.scene.add(pole);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 4, 12), MAT.leaf); crown.rotation.x = Math.PI / 2; pole.add(crown);
    [mats.ribbon, mats.ribbonB, mats.ribbonY, mats.ribbon, mats.ribbonB, mats.ribbonY].forEach((m, i) => { const a = i / 6 * Math.PI * 2; const rb = new THREE.Mesh(new THREE.BoxGeometry(0.018, 3.6, 0.07), m); rb.position.set(Math.cos(a) * 0.62, -1.75, Math.sin(a) * 0.62); rb.rotation.z = Math.cos(a) * 0.12; rb.rotation.x = -Math.sin(a) * 0.12; pole.add(rb); });
    // the Heron and Reed
    house('The Heron and Reed', -266, -254, -12, -1, { doors: [['s', -260, 1.6]], chimney: true, h: 3.8, roof: MAT.thatch, floor: MAT.wood });
    { const bar = w.block(-260, -9.6, 6, 0.8, 1.05, MAT.wood); void bar; const top = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.08, 1.0), MAT.woodLight); top.position.set(-260, 1.09, -9.6); w.add(top);
      for (let i = 0; i < 4; i++) barrel(-263.5 + i * 1.4, -11.2);
      for (const [x, z] of [[-263, -4.5], [-257, -4.5]] as [number, number][]) { w.block(x, z, 1.6, 0.9, 0.78, MAT.woodLight); const m1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.16, 6), MAT.iron); m1.position.set(x + 0.3, 0.86, z); w.add(m1); }
      hearth(-255.4, -6.8); w.interact('inn_bar_w', -260, -8.3, 'Lean on the bar at the Heron and Reed', 'interact', 1.6, 0);
      const bed = w.block(-264.6, -3.4, 1.3, 2.2, 0.5, MAT.linen); void bed; w.interact('inn_bed_w', -263.2, -3.4, 'Take a bed at the Heron and Reed', 'sleep', 1.4, -Math.PI / 2);
      const hs = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.08), MAT.wood); hs.position.set(-257.8, 2.9, -0.8); w.add(hs);
      const heron = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4), MAT.linen); heron.position.set(-257.8, 2.95, -0.74); heron.rotation.z = 0.4; w.add(heron);
      lamp(-262.4, 0.6); }
    // Orla Hesk's longhouse
    house('The longhouse', -287, -270, -15, -3, { doors: [['s', -278, 1.8]], chimney: true, h: 3.6, roof: MAT.thatch, floor: MAT.wood });
    { w.block(-278.5, -12.4, 5, 1.2, 0.8, MAT.woodLight); hearth(-273, -9); for (let i = 0; i < 3; i++) w.block(-284 + i * 1.6, -11.8, 0.5, 0.5, 0.45, MAT.wood); w.interact('hesk_table', -278.5, -11, 'Orla Hesk\'s table', 'interact', 1.3, 0);
      const loom = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.8, 0.2), MAT.wood); loom.position.set(-285.6, 0.9, -6); loom.rotation.y = Math.PI / 2; w.add(loom); w.colliders.push({ minX: -286.4, maxX: -284.9, minZ: -6.9, maxZ: -5.1, h: 1.8 }); }
    // Tobin Crake's smithy (open front to the green)
    house('Crake\'s smithy', -270, -262, 24, 32, { doors: [['n', -266, 2.4]], chimney: true, h: 3.4, roof: MAT.roofSlate, floor: mats.soot, windows: false });
    { const forge = w.block(-268.6, 30.4, 1.6, 1.2, 0.9, MAT.stoneDark); void forge; const coal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.8), MAT.fire.clone()); coal.position.set(-268.6, 0.95, 30.4); w.scene.add(coal); w.fires.push(coal); w.lights.add(-268.6, 1.6, 30.4, 0xff7a30, 12, 10, 1.4, { flicker: 0.15 });
      const anvil = w.block(-265.4, 28.6, 0.8, 0.4, 0.8, MAT.iron); void anvil; w.interact('smithy_west', -265.4, 27.2, 'Tobin Crake\'s smithy', 'interact', 1.4, Math.PI);
      w.interact('smithy_bench', -263.2, 30.4, 'Tobin\'s bench: clean your gun', 'interact', 1.3, -Math.PI / 2); w.block(-262.9, 30.4, 0.6, 1.6, 0.9, MAT.woodLight); }
    // Ebba Rook's smokehouse
    house('The smokehouse', -284, -277, 23, 30, { doors: [['n', -280.5, 1.6]], h: 3.2, roof: MAT.roofSlate, floor: mats.soot, windows: false });
    { for (let i = 0; i < 4; i++) { const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.6, 4), MAT.wood); rail.rotation.z = Math.PI / 2; rail.position.set(-280.5, 2.2 + (i % 2) * 0.4, 25 + i * 1.1); w.add(rail); for (let k = 0; k < 6; k++) { const fish = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.14), M(0x8a6a3a)); fish.position.set(-283 + k * 0.9, 1.95 + (i % 2) * 0.4, 25 + i * 1.1); w.add(fish); } }
      w.interact('smokehouse', -280.5, 22, 'Ebba Rook\'s smokehouse', 'interact', 1.6, 0); smokeColumn(-280.5, 3.4, 26.5, 30, 2.5); barrel(-276, 22.4); barrel(-276.9, 21.6); }
    // Marra Quill's slipway and the boat shed
    { for (const [x, z] of [[-298, 7], [-290, 7], [-298, 18], [-290, 18]] as [number, number][]) w.block(x, z, 0.3, 0.3, 3.2, MAT.timber);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.14, 12.4), MAT.thatch); rf.position.set(-294, 3.3, 12.5); rf.rotation.z = 0.12; w.add(rf);
      // a hull on trestles, half planked
      const hull = new THREE.Group(); hull.position.set(-294, 0.9, 12.5); w.scene.add(hull);
      const keel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 6.2), MAT.timber); hull.add(keel);
      for (let i = 0; i < 7; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 4, 10, Math.PI), MAT.wood); rib.position.set(0, 0.85, -2.7 + i * 0.9); rib.rotation.set(0, Math.PI / 2, Math.PI); hull.add(rib); }
      for (const sx of [-1, 1]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 5.4), mats.plank); pl.position.set(sx * 0.78, 0.35, 0); pl.rotation.z = sx * 0.5; hull.add(pl); }
      w.add(hull); for (const z of [10, 15]) w.block(-294, z, 1.6, 0.3, 0.6, MAT.timber);
      w.colliders.push({ minX: -295.2, maxX: -292.8, minZ: 9.2, maxZ: 15.8, h: 1.8 });
      const pitch = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.6, 8), MAT.iron); pitch.position.set(-290.8, 0.3, 9.6); w.add(pitch); hearth(-291, 8.2, true);
      w.interact('slipway', -291.4, 12.5, 'Marra Quill\'s slipway', 'interact', 1.6, Math.PI / 2);
      // the slipway rails down to the water
      for (const z of [11.6, 13.4]) { const rl = new THREE.Mesh(new THREE.BoxGeometry(6, 0.1, 0.16), mats.plankDark); rl.position.set(-300.5, 0.02, z); w.add(rl); } }
    // the jetty out into the lake
    { const len = LAKE_X - JETTY.end;
      for (let i = 0; i < len / 0.5; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 2.0), i % 3 ? mats.plank : mats.plankDark); pl.position.set(LAKE_X + 1 - i * 0.5, 0.0, JETTY.z); pl.receiveShadow = true; w.scene.add(pl); }
      for (let i = 0; i <= len; i += 3) for (const sz of [-0.95, 0.95]) { const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), mats.plankDark); pile.position.set(LAKE_X - i, -0.4, JETTY.z + sz); w.add(pile); }
      for (const sz of [-1.0, 1.0]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), MAT.wood); rail.position.set(LAKE_X - len / 2, 0.9, JETTY.z + sz); w.add(rail); }
      for (let i = 0; i <= len; i += 2) for (const sz of [-1.0, 1.0]) w.put('wJettyP', () => new THREE.BoxGeometry(0.08, 0.9, 0.08), MAT.wood, V(LAKE_X - i, 0.45, JETTY.z + sz), undefined, undefined, false);
      w.lantern(LAKE_X + 1.2, JETTY.z + 1.8);
      w.interact('fish_lake', JETTY.end + 1.0, JETTY.z, 'Fish Lake Hallow from the jetty end', 'fish', 1.6, Math.PI / 2);
      boat(-306, 4.2, 0.1); boat(-307.5, -3.6, -0.2); boat(-303, 8.6, 1.4); }
    // Cadoc's hut at the east edge, facing the Downs road
    house('The warden\'s hut', -246, -240, -23, -16, { doors: [['s', -243, 1.4]], h: 3.0, roof: mats.thatchDark, wall: MAT.stone });
    { hearth(-244.6, -21.4); w.interact('cadoc_hut', -243, -19, 'Cadoc\'s hut: bog-oak, bones and old maps', 'interact', 1.2, 0); }
    // Gammer Thrush's cottage at the marsh edge
    house('Gammer Thrush\'s cottage', -266, -258, 46, 53, { doors: [['n', -262, 1.4]], h: 3.0, roof: mats.thatchDark, wall: mats.wallWhite });
    { const shelf = w.block(-262, 52.2, 5, 0.5, 1.8, MAT.wood); void shelf; for (let i = 0; i < 8; i++) { const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 6), [M(0x6a8a5a), M(0x8a5a6a), M(0xb8a86a)][i % 3]); jar.position.set(-264.2 + i * 0.6, 1.0 + (i % 2) * 0.6, 52.0); w.add(jar); }
      hearth(-259.6, 49.6); w.interact('thrush', -262, 49.8, 'Gammer Thrush\'s shelves', 'interact', 1.4, Math.PI);
      for (let i = 0; i < 3; i++) tree(-268 - i * 2.2, 44 + i * 1.8, 0.8, 'rowan'); }
    // cottages
    house('A cottage', -252, -246, 22, 28, { doors: [['w', 25, 1.3]], h: 3.0, chimney: true });
    house('A cottage', -258, -252, 34, 40, { doors: [['n', -255, 1.3]], h: 3.0 });
    house('A cottage', -296, -290, 26, 32, { doors: [['e', 29, 1.3]], h: 3.0, chimney: true });
    house('A cottage', -250, -244, 0, 6, { doors: [['w', 3, 1.3]], h: 3.0 });
    // well, notice post, lamps, a drystone wall round the village
    { w.cyl(-279, 17, 0.9, 0.8, MAT.stone); w.interact('well_west', -279, 18.3, 'Drink from the village well', 'drink', 1.4, 0);
      const post = w.block(-262, 6.2, 0.2, 0.2, 2.4, MAT.timber); void post; const bd = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.08), MAT.wood); bd.position.set(-262, 1.8, 6.32); w.add(bd);
      for (let i = 0; i < 4; i++) { const pp = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), MAT.paper); pp.position.set(-262.5 + (i % 2) * 0.6, 1.95 - Math.floor(i / 2) * 0.48, 6.37); pp.rotation.z = (rnd() - 0.5) * 0.2; w.add(pp); }
      w.interact('notice_west', -262, 7.4, 'Fernhollow\'s notice post', 'interact', 1.4, 0);
      for (const [x, z] of [[-264, 3], [-280, 3], [-264, 21], [-281, 20.5], [-254, 12], [-286, 12]] as [number, number][]) lamp(x, z);
      drystone(-238, -24, -238, 6); drystone(-238, 16, -238, 56); drystone(-238, 56, -258, 56); drystone(-266, 56, -300, 56); drystone(-300, -24, -238, -24);
      for (let i = 0; i < 10; i++) { const x = -300 + rnd() * 6, z = -20 + rnd() * 74; reeds(x, z, 8, 1.4); }
      for (let i = 0; i < 6; i++) tree(-292 - rnd() * 4, -20 + i * 6 + rnd() * 3, 0.8 + rnd() * 0.3, 'birch');
      // drying racks and nets by the shore
      for (let i = 0; i < 3; i++) { const z = 36 + i * 4; w.block(-297, z, 0.12, 0.12, 1.8, MAT.timber, 0, false); w.block(-297, z + 2.6, 0.12, 0.12, 1.8, MAT.timber, 0, false); const net = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.4), M(0x6a6a5a, { transparent: true, opacity: 0.7 })); net.position.set(-297, 1.1, z + 1.3); net.rotation.y = Math.PI / 2; (net.material as THREE.Material).side = THREE.DoubleSide; w.add(net); }
      for (let i = 0; i < 5; i++) crate(-284 + i * 0.9, 33.2, 0.6); }
    // an island with a ruined tower, out in the mist
    { const isl = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 1.4, 12), mats.turfDark); isl.position.set(-338, -0.5, 18); w.add(isl);
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.8, 9, 10, 1, true), MAT.stoneDark); tw.position.set(-338, 4.3, 18); (tw.material as THREE.Material).side = THREE.DoubleSide; w.add(tw);
      for (let i = 0; i < 6; i++) { const mer = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.6), MAT.stoneDark); const a = i / 6 * Math.PI * 2; mer.position.set(-338 + Math.cos(a) * 2.5, 9.2 + (i % 2) * 0.5, 18 + Math.sin(a) * 2.5); w.add(mer); }
      for (let i = 0; i < 4; i++) tree(-332 - rnd() * 10, 12 + rnd() * 12, 1.0, 'pine'); }
  }
  // ---------------- the reed marsh ----------------
  const BOARD: [number, number, number, number][] = [[-262, 57, -270, 72], [-270, 72, -277, 86], [-277, 86, -286, 102], [-286, 102, -296, 118]];
  {
    for (const [x1, z1, x2, z2] of BOARD) {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.round(len / 0.55), ang = Math.atan2(x2 - x1, z2 - z1);
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; w.put(i % 4 ? 'wBoard' : 'wBoardD', () => new THREE.BoxGeometry(1.7, 0.08, 0.48), i % 4 ? mats.plank : mats.plankDark, V(x1 + (x2 - x1) * t, 0.06, z1 + (z2 - z1) * t), new THREE.Euler(0, ang, 0), undefined, false); }
    }
    // black pools and reed beds
    for (let i = 0; i < 26; i++) { const x = MARSH.minX + 4 + rnd() * (MARSH.maxX - MARSH.minX - 8), z = MARSH.minZ + 4 + rnd() * (MARSH.maxZ - MARSH.minZ - 8); const pool = new THREE.Mesh(new THREE.CircleGeometry(1.6 + rnd() * 2.6, 10), mats.bog); pool.rotation.x = -Math.PI / 2; pool.position.set(x, 0.016, z); pool.scale.set(1, 0.6 + rnd() * 0.6, 1); w.scene.add(pool); }
    for (let i = 0; i < 70; i++) { const x = MARSH.minX + rnd() * (MARSH.maxX - MARSH.minX), z = MARSH.minZ + rnd() * (MARSH.maxZ - MARSH.minZ); reeds(x, z, 10, 1.6); }
    for (let i = 0; i < 6; i++) tree(-250 - rnd() * 50, 64 + rnd() * 70, 0.7 + rnd() * 0.3, 'birch');
    // the old causeway post with its ribbons
    { const px = -296.5, pz = 120; w.block(px, pz, 0.32, 0.32, 3.2, mats.plankDark); for (let i = 0; i < 5; i++) { const rb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.1), [mats.ribbon, mats.ribbonB, mats.ribbonY][i % 3]); rb.position.set(px + 0.18, 2.6 - i * 0.18, pz + (i - 2) * 0.08); rb.rotation.z = 0.2; w.add(rb); }
      w.interact('marsh_post', px + 0.6, pz - 1.2, 'Search the old causeway post', 'pick', 1.4, Math.PI);
      w.interact('fish_marsh', -279.6, 90, 'Fish the black water between the reeds', 'fish', 1.4, Math.PI / 2); }
  }
  // ---------------- places, regions and the map ----------------
  Object.assign(w.places, {
    west_gate: V(WEST_GATE.x - 1, 0, WEST_GATE.z), heath: V(-120, 0, 9), smeath: V(CAMP.x, 0, CAMP.z + 4), ring: V(RING.x, 0, RING.z + 1.5), vane_dig: V(DIG.x + 1.5, 0, DIG.z + 2), orm_mound: V(ORM_DOOR.x, 0, ORM_DOOR.z + 1),
    fernhollow: V(G0.x + 6, 0, G0.z), hesk_hall: V(-278, 0, -1), inn_fern: V(-260, 0, 1), cadoc_hut: V(-243, 0, -14.5), thrush_cottage: V(-262, 0, 44.5), jetty: V(JETTY.end + 1.5, 0, JETTY.z), slipway: V(-291, 0, 12.5),
    smokehouse: V(-280.5, 0, 21.5), smithy_west: V(-266, 0, 22.5), notice_west: V(-262, 0, 8), marsh_post: V(-296, 0, 118.5), wynn_fold: V(-146, 0, 32),
  });
  const regions: Region[] = [
    { id: 'fernhollow', name: 'Fernhollow', minX: VILLAGE.minX, maxX: VILLAGE.maxX, minZ: VILLAGE.minZ, maxZ: VILLAGE.maxZ },
    { id: 'lake', name: 'Lake Hallow', minX: -380, maxX: VILLAGE.minX, minZ: -130, maxZ: 154 },
    { id: 'marsh', name: 'the reed marsh', minX: MARSH.minX, maxX: MARSH.maxX, minZ: 56, maxZ: 154 },
    { id: 'downs', name: 'the Barrow Downs', minX: -238, maxX: -146, minZ: -126, maxZ: -14 },
    { id: 'smeath', name: 'the Smeaths\' clamp', minX: -126, maxX: -82, minZ: -56, maxZ: -12 },
    { id: 'heath', name: 'the Heath Road', minX: -238, maxX: -42, minZ: -126, maxZ: 154 },
  ];
  const map: WestRefs['map'] = {
    roads: [ROAD], trails: [[[-100, 2], [-103, -12], [-104, -22]], [[-160, 8], [-166, -24], [-186, -58], [-200, -90]], [[-263, 30], [-262, 57]], BOARD.map(b => [b[0], b[1]] as [number, number]).concat([[-296, 118]])],
    water: [[-372, -126, LAKE_X, 150]], forest: [[-124, -52, -84, -12]], fields: [[-152, 33, -140, 43]], walls: [[VILLAGE.minX, VILLAGE.minZ, VILLAGE.maxX, VILLAGE.maxZ]], hills: [[-238, -126, -146, -14]], barrows: barrowsMap,
  };
  const ring = V(RING.x, 0, RING.z), door = V(ORM_DOOR.x, 0, ORM_DOOR.z + 1);
  const refs: WestRefs = {
    gate: { leaves, collider: gateCollider, open: false, t: 0 }, regions, map, critters, smoke, boats, pole, ring, door, village: G0.clone(), marsh: MARSH, boardwalk: BOARD,
    closeGate() {
      if (!refs.gate.open) return;
      refs.gate.open = false; refs.gate.t = 0; leaves[0].rotation.y = 0; leaves[1].rotation.y = 0;
      if (!w.colliders.includes(gateCollider)) w.colliders.push(gateCollider);
      const bar = leaves[0].userData.bar as THREE.Mesh | undefined; if (bar) bar.visible = true;
      const it = w.interactables.find(x => x.id === 'west_gate'); if (it) it.hidden = false;
    },
    openGate(instant = false) {
      if (refs.gate.open) return;
      refs.gate.open = true; refs.gate.t = instant ? 1 : 0;
      const i = w.colliders.indexOf(gateCollider); if (i >= 0) w.colliders.splice(i, 1);
      const bar = leaves[0].userData.bar as THREE.Mesh | undefined; if (bar) bar.visible = false;
      const it = w.interactables.find(x => x.id === 'west_gate'); if (it) it.hidden = true;
      if (instant) { leaves[0].rotation.y = -1.75; leaves[1].rotation.y = 1.75; }
    },
    animate(dt: number, t: number, player: THREE.Vector3) {
      if (refs.gate.open && refs.gate.t < 1) { refs.gate.t = Math.min(1, refs.gate.t + dt / 1.8); const e = 1 - Math.pow(1 - refs.gate.t, 3); leaves[0].rotation.y = -1.75 * e; leaves[1].rotation.y = 1.75 * e; }
      if (player.x > -40) return;              // nothing out west to animate while you are in Millbrook or east of it
      stepCritters(critters, dt, t, player);
      boats.forEach((b, i) => { b.position.y = -0.3 + Math.sin(t * 1.0 + i * 2) * 0.05; b.rotation.z = Math.sin(t * 0.8 + i) * 0.035; });
      if (pole && Math.abs(player.x - G0.x) < 60) pole.rotation.y += dt * 0.25;
      for (const p of smoke) {
        const u = p.userData as { x: number; y: number; z: number; spread: number };
        if (Math.abs(player.x - u.x) > 70 || Math.abs(player.z - u.z) > 70) continue;
        const a = p.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < a.count; i++) { let y = a.getY(i) + dt * 0.7; let x = a.getX(i) + dt * (0.35 + Math.sin(t * 0.5 + i) * 0.2); if (y > u.y + 7) { y = u.y; x = u.x + (Math.random() - 0.5) * u.spread; a.setZ(i, u.z + (Math.random() - 0.5) * u.spread); } a.setY(i, y); a.setX(i, x); }
        a.needsUpdate = true;
      }
    },
  };
  return refs;
}

/** Wading in the reed marsh: off the boardwalk, inside the marsh. */
export function inMarshWater(p: THREE.Vector3, refs: WestRefs): boolean {
  const m = refs.marsh; if (p.x < m.minX || p.x > m.maxX || p.z < m.minZ || p.z > m.maxZ) return false;
  for (const [x1, z1, x2, z2] of refs.boardwalk) {
    const dx = x2 - x1, dz = z2 - z1, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.z - z1) * dz) / l2));
    if (Math.hypot(p.x - (x1 + dx * t), p.z - (z1 + dz * t)) < 1.1) return false;
  }
  return true;
}
