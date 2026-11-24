// The map: your house, Millbrook square, the Counting House, the south gate and the Whispering Vale.
// Everything is built from code. Colliders are axis-aligned boxes on the ground plane.
import * as THREE from 'three';
import type { SiteId } from '../sim/contracts';
import { climbable } from '../sim/climb';
import { LightPool, type LightZone } from './lights';
import type { Weather } from '../sim/days';
import { buildChapel, type ChapelRefs } from './chapel';
import { buildEast, type EastRefs } from './east';
import { buildMine, type MineRefs } from './mine';
import { buildWest, inMarshWater, type WestRefs } from './west';
import { buildBarrow, type BarrowRefs } from './barrow';
import { buildSouth, type SouthRefs, GAP } from './south';
import { buildSeaCave, type SeaCaveRefs } from './seacave';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Box { minX: number; maxX: number; minZ: number; maxZ: number; h: number }
export type InteractId = string;
export interface Interactable { id: InteractId; pos: THREE.Vector3; radius: number; label: string; anim: string; facing?: number; seat?: THREE.Vector3; hidden?: boolean }
export interface WorldNode { id: string; kind: 'herb' | 'moon' | 'shroom' | 'berry' | 'heather' | 'bilberry' | 'mussel' | 'samphire'; mesh: THREE.Object3D; it: Interactable }
export interface Building { name: string; minX: number; maxX: number; minZ: number; maxZ: number; roof: THREE.Object3D }

export const M = (c: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true, ...o });
export const MAT = {
  stone: M(0x8d8676), stoneDark: M(0x5f5a50), plaster: M(0xd8cdb4), timber: M(0x5a3d26), wood: M(0x8a6240), woodLight: M(0xa98258),
  roof: M(0x7a3b2a), roofSlate: M(0x4a5260), thatch: M(0xb8964f), straw: M(0xd6be7a), cloth: M(0x7d2f2f), clothBlue: M(0x2f4f7d), linen: M(0xe8e0cc),
  water: M(0x3d6f8f, { roughness: 0.2, metalness: 0.1 }), iron: M(0x3b3d40, { metalness: 0.5, roughness: 0.5 }), grass: M(0x5f7d3c), path: M(0x9c8a68),
  leaf: M(0x3f6b30), leafDark: M(0x2f5426), bark: M(0x4a3524), rock: M(0x77736a), ash: M(0x3a3632), fire: new THREE.MeshBasicMaterial({ color: 0xff9a3a }),
  paper: M(0xf0e6c8), parchment: M(0xe2cf9e), brass: M(0xb08a3c, { metalness: 0.6, roughness: 0.4 }), glow: new THREE.MeshBasicMaterial({ color: 0xffd27a }),
  rune: new THREE.MeshBasicMaterial({ color: 0x8fd0ff }),
};

export class World {
  scene = new THREE.Scene();
  colliders: Box[] = [];
  /** Extra boxes only the third-person camera avoids (tree canopies). */
  cameraBlockers: Box[] = [];
  interactables: Interactable[] = [];
  buildings: Building[] = [];
  sites: Record<SiteId, THREE.Vector3> = {
    mill_road: new THREE.Vector3(-32, 0, 72), raider_camp: new THREE.Vector3(30, 0, 86), whisper_stones: new THREE.Vector3(0, 0, 118),
    // v0.7: the Eastern Reach (built by east.ts; cairns and herb patches come from the shared code below)
    thornwood: new THREE.Vector3(166, 0, -58), toll_tower: new THREE.Vector3(176, 0, 34), brookfield: new THREE.Vector3(128, 0, -10), hollow_road: new THREE.Vector3(254, 0, -78),
    // v0.8: the Westmarch (built by west.ts)
    heath_road: new THREE.Vector3(-128, 0, 34), barrow_downs: new THREE.Vector3(-186, 0, -58), reed_marsh: new THREE.Vector3(-286, 0, 100),
    // v0.9: the Saltway Coast (built by south.ts)
    saltway: new THREE.Vector3(30, 0, 214), gull_tower: new THREE.Vector3(64, 0, 258), tidal_flats: new THREE.Vector3(-14, 0, 366), wreckers_cove: new THREE.Vector3(-90, 0, 362),
  };
  homeSpawn = new THREE.Vector3(-29, 0, -9);
  sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight;
  private tmpV = new THREE.Vector3(); private tmpF = new THREE.Vector3(); private tmpR = new THREE.Vector3(); private tmpU = new THREE.Vector3(); private tmpT = new THREE.Vector3(); private UP = new THREE.Vector3(0, 1, 0);
  /** Every lamp, hearth and torch is an anchor served by a fixed pool of six lights (see lights.ts). */
  lights!: LightPool;
  night = 0;
  /** Today's weather (set by the game); greys the sky and pulls the fog in. */
  weather: Weather = 'clear'; fogFar = 150; flash = 0;
  /** Which sealed interior the player is in, if any. */
  dungeon: null | 'mill' | 'chapel' | 'mine' | 'barrow' | 'seacave' = null;
  get inMill() { return this.dungeon === 'mill'; }
  get inChapel() { return this.dungeon === 'chapel'; }
  get inMine() { return this.dungeon === 'mine'; }
  /** v0.7: the Eastern Reach (east.ts) and the Copper Hollow mine (mine.ts). */
  east!: EastRefs; mine!: MineRefs; west!: WestRefs; barrow!: BarrowRefs; south!: SouthRefs; seacave!: SeaCaveRefs;
  /** Region groups: whole areas are hidden when you are far from them or inside a dungeon. */
  regionGroups: { id: string; g: THREE.Group; minX: number; maxX: number; minZ: number; maxZ: number }[] = [];
  showerPos = new THREE.Vector3(); showerDrops!: THREE.Points;
  /** Old Mill interior (pass 3) lives far south of the map, out of sight; entered through the mill door. */
  mill = { origin: new THREE.Vector3(0, 0, -320), spawn: new THREE.Vector3(0, 0, -302), checkpoint: new THREE.Vector3(0, 0, -334), arena: new THREE.Vector3(0, 0, -356), outside: new THREE.Vector3(-38, 0, 70) };
  millDoorPos = new THREE.Vector3(-41, 0, 66);
  millGate!: { mesh: THREE.Mesh; box: Box };
  millRoots: THREE.Mesh[] = [];
  millDarkness: THREE.Mesh[] = [];
  instMeshes: THREE.InstancedMesh[] = [];
  /** Effects setting: low hides grass tufts and other small clutter. */
  setDetail(high: boolean) { for (const m of this.instMeshes) if (/grass|tuft|flower/.test(m.name)) m.visible = high; }
  lanternMeshes: THREE.Mesh[] = [];
  /** v0.8: one shared material for every lamp's glass and one for every lit window, so they batch with the static
   *  scenery; their glow is set once a frame on the material (see setTime). */
  lampGlass = new THREE.MeshBasicMaterial({ color: 0xffd27a }); winLit = new THREE.MeshStandardMaterial({ color: 0x2d3a44, emissive: 0xffa040, emissiveIntensity: 0, flatShading: true }); winDark = new THREE.MeshStandardMaterial({ color: 0x2d3a44, flatShading: true });
  fires: THREE.Mesh[] = [];
  crystalRunes: THREE.Mesh[] = [];
  bounds = { minX: -64, maxX: 64, minZ: -30, maxZ: 136 };
  private tmpSky = new THREE.Color(); private dusk = new THREE.Color(0xe0a070);

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color(0x9fb8cc);
    s.fog = new THREE.Fog(0x9fb8cc, 40, 150);
    this.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x4a5a32, 1.0); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.0);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera; sc.left = -32; sc.right = 32; sc.top = 32; sc.bottom = -32; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0008; s.add(this.sun); s.add(this.sun.target);
    this.lights = new LightPool(s, 6);
    this.ground(); this.home(); this.town(); this.countingHouse(); this.decorBuildings(); this.townInteriors(); this.walls(); this.vale(); this.valeProps(); this.oldMill(); this.chapel = buildChapel(this); this.east = buildEast(this); this.mine = buildMine(this); this.west = buildWest(this); this.barrow = buildBarrow(this); this.south = buildSouth(this); this.seacave = buildSeaCave(this); this.flushInstances(); this.groupRegions(); this.mergeStatic();
  }

  // ---------------- helpers ----------------
  private inst: Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[]; shadow: boolean }> = new Map();
  /** Queue one copy of a shared mesh; flushed into a single InstancedMesh (one draw call). */
  put(key: string, geo: () => THREE.BufferGeometry, mat: THREE.Material, pos: THREE.Vector3, rot = new THREE.Euler(), scale = new THREE.Vector3(1, 1, 1), shadow = true) {
    let e = this.inst.get(key); if (!e) { e = { geo: geo(), mat, m: [], shadow }; this.inst.set(key, e); }
    e.m.push(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), scale));
  }
  private flushInstances() {
    for (const [key, e] of this.inst) {
      const im = new THREE.InstancedMesh(e.geo, e.mat, e.m.length); im.name = 'inst:' + key; this.instMeshes.push(im);
      e.m.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = e.shadow; im.receiveShadow = true; im.computeBoundingSphere(); this.scene.add(im);
    }
    this.inst.clear();
  }
  add(mesh: THREE.Object3D, parent: THREE.Object3D = this.scene) { mesh.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; (o as THREE.Mesh).receiveShadow = true; } }); parent.add(mesh); return mesh; }
  /** Solid box with collider. */
  block(x: number, z: number, w: number, d: number, h: number, mat: THREE.Material, y0 = 0, collide = true, parent?: THREE.Object3D) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y0 + h / 2, z); this.add(m, parent);
    if (collide) this.colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: y0 + h });
    return m;
  }
  cyl(x: number, z: number, r: number, h: number, mat: THREE.Material, y0 = 0, seg = 8, collide = true) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat); m.position.set(x, y0 + h / 2, z); this.add(m);
    if (collide) this.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h: y0 + h });
    return m;
  }
  interact(id: InteractId, x: number, z: number, label: string, anim: string, radius = 1.6, facing?: number, seat?: THREE.Vector3) {
    const it: Interactable = { id, pos: new THREE.Vector3(x, 0, z), radius, label, anim, facing, seat };
    this.interactables.push(it); return it;
  }
  /** Walls of a rectangular building, with door gaps: list of [side, center, width]. */
  shell(minX: number, maxX: number, minZ: number, maxZ: number, h: number, doors: ['n' | 's' | 'e' | 'w', number, number][], wallMat: THREE.Material, trim = true) {
    const t = 0.3;
    const side = (s: 'n' | 's' | 'e' | 'w') => {
      const horiz = s === 'n' || s === 's';
      const a = horiz ? minX : minZ, b = horiz ? maxX : maxZ;
      const fixed = s === 'n' ? minZ : s === 's' ? maxZ : s === 'w' ? minX : maxX;
      const gaps = doors.filter(d => d[0] === s).map(d => [d[1] - d[2] / 2, d[1] + d[2] / 2]).sort((p, q) => p[0] - q[0]);
      let cur = a;
      const seg = (from: number, to: number) => {
        if (to - from < 0.05) return;
        const c = (from + to) / 2, len = to - from;
        if (horiz) this.block(c, fixed, len, t, h, wallMat); else this.block(fixed, c, t, len, h, wallMat);
      };
      for (const g of gaps) {
        seg(cur, g[0]);
        // lintel above door
        const c = (g[0] + g[1]) / 2, len = g[1] - g[0];
        if (horiz) this.block(c, fixed, len, t, h - 2.3, wallMat, 2.3, false); else this.block(fixed, c, t, len, h - 2.3, wallMat, 2.3, false);
        cur = g[1];
      }
      seg(cur, b);
    };
    (['n', 's', 'e', 'w'] as const).forEach(side);
    if (trim) { // timber framing posts at corners
      for (const [x, z] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]]) this.block(x, z, 0.4, 0.4, h + 0.1, MAT.timber, 0, false);
    }
  }
  roof(minX: number, maxX: number, minZ: number, maxZ: number, h: number, mat: THREE.Material, name: string) {
    const g = new THREE.Group();
    const w = maxX - minX + 0.8, d = maxZ - minZ + 0.8, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const ridge = Math.min(w, d) * 0.38;
    const geo = new THREE.BufferGeometry();
    const alongX = w >= d;
    const hw = w / 2, hd = d / 2;
    const v = alongX
      ? [-hw, 0, -hd, hw, 0, -hd, hw, ridge, 0, -hw, ridge, 0, -hw, 0, hd, hw, 0, hd]
      : [-hw, 0, -hd, -hw, 0, hd, 0, ridge, hd, 0, ridge, -hd, hw, 0, -hd, hw, 0, hd];
    const idx = alongX ? [0, 3, 2, 0, 2, 1, 4, 5, 2, 4, 2, 3, 0, 4, 3, 1, 2, 5] : [0, 1, 2, 0, 2, 3, 4, 3, 2, 4, 2, 5, 0, 3, 4, 1, 5, 2];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); (m.material as THREE.Material).side = THREE.DoubleSide; m.castShadow = true;
    g.add(m);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w - 0.8, 0.08, d - 0.8), MAT.timber); ceil.position.y = -0.04; ceil.receiveShadow = true; g.add(ceil);
    g.position.set(cx, h, cz); this.scene.add(g);
    this.buildings.push({ name, minX, maxX, minZ, maxZ, roof: g });
  }
  window(x: number, z: number, y: number, rotY: number, lit = false) {
    // frame and pane go straight into the scene (no group) so the static batcher can merge them per region cell
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.9, 0.36), MAT.timber); frame.position.set(x, y, z); frame.rotation.y = rotY; this.scene.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.38), lit ? this.winLit : this.winDark); glass.position.set(x, y, z); glass.rotation.y = rotY; this.scene.add(glass); return glass;
  }
  lantern(x: number, z: number, y = 2.6, light = true) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, y, 6), MAT.iron); post.position.set(x, y / 2, z); this.add(post);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.32, 0.25), this.lampGlass); lamp.position.set(x, y + 0.12, z); this.scene.add(lamp);
    if (light) this.lights.add(x, y + 0.1, z, 0xffb060, 11, 14, 1.6, { when: 'night', flicker: 0.04 });
    this.colliders.push({ minX: x - 0.15, maxX: x + 0.15, minZ: z - 0.15, maxZ: z + 0.15, h: y });
  }

  // ---------------- ground ----------------
  private ground() {
    const geo = new THREE.PlaneGeometry(160, 200, 80, 100);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors: number[] = []; const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i); // plane local y == world -z
      const wz = -y + 50;
      const n = Math.sin(x * 0.21) * Math.cos(wz * 0.17) * 0.5 + Math.sin(x * 0.05 + wz * 0.07) * 0.5;
      if (wz > 30) c.setHSL(0.24 - n * 0.02, 0.32, 0.33 + n * 0.04); else c.setHSL(0.22, 0.25, 0.36 + n * 0.03);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const g = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    g.rotation.x = -Math.PI / 2; g.position.z = 50; g.receiveShadow = true; this.scene.add(g);
    // cobbled square and paths
    const sq = new THREE.Mesh(new THREE.CircleGeometry(13, 24), MAT.path); sq.rotation.x = -Math.PI / 2; sq.position.y = 0.01; sq.receiveShadow = true; this.scene.add(sq);
    const pathTo = (x1: number, z1: number, x2: number, z2: number, w = 2.6) => {
      const len = Math.hypot(x2 - x1, z2 - z1); const p = new THREE.Mesh(new THREE.PlaneGeometry(w, len), MAT.path);
      p.rotation.x = -Math.PI / 2; p.rotation.z = -Math.atan2(x2 - x1, z2 - z1); p.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2); p.receiveShadow = true; this.scene.add(p);
    };
    pathTo(-21, -6.4, -8, -3); pathTo(0, 10, 0, 32); pathTo(0, 32, -30, 70, 2); pathTo(0, 32, 28, 84, 2); pathTo(0, 32, 0, 115, 2); pathTo(10, -3, 13, -3.5);
  }

  // ---------------- your house ----------------
  private home() {
    const minX = -35, maxX = -22, minZ = -15, maxZ = -3, h = 3.2;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.1, maxZ - minZ), MAT.wood); floor.position.set((minX + maxX) / 2, 0.05, (minZ + maxZ) / 2); floor.receiveShadow = true; this.scene.add(floor);
    this.shell(minX, maxX, minZ, maxZ, h, [['e', -6.4, 1.8]], MAT.plaster);
    this.roof(minX, maxX, minZ, maxZ, h, MAT.thatch, 'Your house');
    this.window(-28.5, minZ, 1.7, 0); this.window(-28.5, maxZ, 1.7, 0);
    // privy: walled-off corner with a door gap (enclosed, as Waiz asked for VEILWORK)
    this.block(-25.5, -12, 0.15, 6, h, MAT.plaster); // partition west side x=-25.5 from z -15..-9
    this.block(-23.32, -9.1, 2.35, 0.15, h, MAT.plaster); // front wall, door gap -25.5..-24.5
    // bed
    this.block(-33.4, -12.6, 1.4, 2.4, 0.45, MAT.timber);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 2.2), MAT.linen); mattress.position.set(-33.4, 0.54, -12.6); this.add(mattress);
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.06, 1.3), MAT.clothBlue); blanket.position.set(-33.4, 0.65, -12.2); this.add(blanket);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.4), MAT.linen); pillow.position.set(-33.4, 0.68, -13.4); this.add(pillow);
    this.interact('bed', -32.2, -12.4, 'Sleep', 'sleep', 1.7, Math.PI, new THREE.Vector3(-33.4, 0.2, -12.3));
    // hearth + kitchen
    this.block(-34.4, -6.5, 0.9, 2.6, 2.0, MAT.stone);
    this.block(-34.5, -6.5, 0.8, 1.2, 3.6, MAT.stoneDark, 2.0, false);
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 6), MAT.fire.clone()); fire.position.set(-33.9, 0.45, -6.5); this.scene.add(fire); this.fires.push(fire);
    this.lights.add(-33.5, 1.0, -6.5, 0xff8a3a, 3, 9, 1.5, { flicker: 0.12 });
    this.block(-34.1, -4.4, 1.4, 1.2, 0.9, MAT.woodLight); // counter
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.25, 8), MAT.iron); pot.position.set(-34.1, 1.03, -4.4); this.add(pot);
    this.interact('hearth', -32.7, -5.4, 'Cook / eat', 'eat', 1.7, Math.PI / 2);
    // chair by the hearth
    this.block(-31.2, -7.2, 0.6, 0.6, 0.45, MAT.wood, 0, true);
    this.block(-31.2, -6.92, 0.6, 0.08, 0.9, MAT.wood, 0.45, false);
    this.interact('chair', -31.2, -7.9, 'Sit by the fire', 'sit', 1.3, 0, new THREE.Vector3(-31.2, 0, -7.2));
    // cistern
    this.cyl(-28.5, -14.2, 0.55, 1.0, MAT.stone, 0, 10);
    const wat = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.02, 10), MAT.water); wat.position.set(-28.5, 0.98, -14.2); this.scene.add(wat);
    this.interact('cistern', -28.5, -13.0, 'Drink from the cistern', 'drink', 1.4, 0);
    // ---- bathroom (inside the enclosure x -25.4..-22.15, z -14.85..-9.2): privy at the back,
    // wash basin on the east wall, shower beside it nearer the door. Each has room to stand in front.
    const tile = M(0x9fa7a4);
    const bf = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.02, 5.6), tile); bf.position.set(-23.8, 0.11, -12.05); bf.receiveShadow = true; this.scene.add(bf);
    // privy seat, back-west corner, facing the door
    this.block(-24.75, -14.4, 1.0, 0.8, 0.5, MAT.wood);
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.02, 10), MAT.stoneDark); hole.position.set(-24.75, 0.51, -14.4); this.scene.add(hole);
    this.block(-24.75, -14.78, 0.8, 0.12, 0.7, MAT.wood, 0.5, false); // back board
    this.interact('privy', -24.75, -13.25, 'Use the privy', 'sit', 0.95, Math.PI, new THREE.Vector3(-24.75, 0, -14.3));
    // wash basin on the east wall
    this.block(-22.5, -13.75, 0.6, 1.0, 0.85, MAT.woodLight);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.2, 0.15, 10), MAT.linen); bowl.position.set(-22.5, 0.93, -13.75); this.add(bowl);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.6, 0.5), M(0xbcd0d8, { roughness: 0.15, metalness: 0.4 })); mirror.position.set(-22.22, 1.6, -13.75); this.scene.add(mirror);
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 8), MAT.stone); jug.position.set(-22.4, 1.0, -14.15); this.add(jug);
    this.interact('basin', -23.35, -13.75, 'Wash hands and face at the basin', 'wash', 0.9, -Math.PI / 2);
    // shower beside it: tray, low kerb, rain tank and pipe overhead, curtain on a rail
    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.4), MAT.stoneDark); tray.position.set(-22.85, 0.14, -11.55); tray.receiveShadow = true; this.scene.add(tray);
    this.block(-22.85, -12.27, 1.3, 0.06, 2.1, MAT.plaster, 0, true); // partition between basin and shower
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.5, 10), MAT.wood); tank.position.set(-22.5, 2.8, -11.55); this.add(tank);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), MAT.iron); pipe.rotation.z = Math.PI / 2; pipe.position.set(-22.75, 2.35, -11.55); this.scene.add(pipe);
    const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.08, 0.06, 10), MAT.brass); rose.position.set(-22.95, 2.3, -11.55); this.scene.add(rose);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), MAT.iron); rail.rotation.x = Math.PI / 2; rail.position.set(-23.5, 2.2, -11.55); this.scene.add(rail);
    const curtain = new THREE.Mesh(new THREE.BoxGeometry(0.02, 1.6, 0.6), M(0xe8e0cc, { side: THREE.DoubleSide })); curtain.position.set(-23.5, 1.4, -10.95); this.scene.add(curtain);
    this.showerPos.set(-22.95, 0, -11.55);
    this.interact('shower', -23.6, -11.55, 'Take a shower', 'wash', 0.9, -Math.PI / 2, new THREE.Vector3(-22.95, 0, -11.55));
    // shower water: a column of falling drops, shown only while showering (no light, cheap)
    const dg = new THREE.BufferGeometry(); const dp = new Float32Array(240 * 3);
    for (let i = 0; i < 240; i++) { dp[i * 3] = (Math.random() - 0.5) * 0.35; dp[i * 3 + 1] = Math.random() * 2.1; dp[i * 3 + 2] = (Math.random() - 0.5) * 0.35; }
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.showerDrops = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xbfe0ff, size: 0.035, transparent: true, opacity: 0.7, depthWrite: false }));
    this.showerDrops.position.set(-22.95, 0.15, -11.55); this.showerDrops.visible = false; this.showerDrops.frustumCulled = false; this.scene.add(this.showerDrops);
    // medical table
    this.block(-28.5, -3.8, 1.8, 0.8, 0.85, MAT.woodLight);
    const kit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.3), MAT.cloth); kit.position.set(-28.2, 0.93, -3.8); this.add(kit);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), MAT.linen); roll.rotation.z = Math.PI / 2; roll.position.set(-28.9, 0.93, -3.8); this.add(roll);
    this.interact('medical', -28.5, -4.9, 'Treat wounds', 'interact', 1.3, Math.PI);
    // chest / rack
    this.block(-24.0, -3.8, 1.2, 0.7, 0.7, MAT.timber);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.12, 0.75), MAT.wood); lid.position.set(-24, 0.76, -3.8); this.add(lid);
    this.interact('chest', -24.0, -4.9, 'Open your chest', 'interact', 1.2, Math.PI);
    // rug + table
    const rug = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 2), MAT.cloth); rug.position.set(-29.5, 0.11, -8.5); rug.receiveShadow = true; this.scene.add(rug);
    // interior light
    this.lights.add(-29, 2.7, -9, 0xffd8a0, 2.4, 14, 1.4);
    
  }

  // ---------------- town square ----------------
  private town() {
    // well
    this.cyl(0, 0, 1.0, 0.9, MAT.stone, 0, 12);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.02, 12), MAT.water); w.position.set(0, 0.85, 0); this.scene.add(w);
    for (const x of [-0.9, 0.9]) this.block(x, 0, 0.14, 0.14, 2.2, MAT.timber, 0.9, false);
    this.block(0, 0, 2.2, 0.16, 0.16, MAT.timber, 3.0, false);
    const rf = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.8, 4), MAT.roof); rf.rotation.y = Math.PI / 4; rf.position.set(0, 3.5, 0); this.add(rf);
    this.interact('well', 0, 1.6, 'Drink from the well', 'drink', 1.6, 0);
    // contract board
    this.block(4.5, -4, 0.15, 0.15, 2.4, MAT.timber); this.block(6.7, -4, 0.15, 0.15, 2.4, MAT.timber);
    this.block(5.6, -4, 2.4, 0.08, 1.3, MAT.wood, 0.9, false);
    for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.02), i % 2 ? MAT.paper : MAT.parchment); n.position.set(4.9 + i * 0.48, 1.6 - (i % 2) * 0.1, -4.05 + 0.06); n.rotation.z = (i - 1.5) * 0.05; this.scene.add(n); }
    const brd = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.5, 4), MAT.roofSlate); brd.rotation.y = Math.PI / 4; brd.scale.z = 0.4; brd.position.set(5.6, 2.6, -4); this.add(brd);
    this.interact('board', 5.6, -2.9, 'Contract board', 'interact', 1.6, 0);
    // market stall
    this.block(-7, 5, 3.4, 1.2, 1.0, MAT.wood);
    for (const [x, z] of [[-8.6, 4.5], [-5.4, 4.5], [-8.6, 6.2], [-5.4, 6.2]]) this.block(x, z, 0.12, 0.12, 2.5, MAT.timber, 0, false);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 2.4), MAT.cloth); awn.position.set(-7, 2.55, 5.3); awn.rotation.x = 0.15; this.add(awn);
    for (let i = 0; i < 6; i++) { const lf = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.15, 3, 6), M(0xc9904a)); lf.rotation.z = Math.PI / 2; lf.position.set(-8.2 + i * 0.45, 1.1, 4.8); this.add(lf); }
    for (let i = 0; i < 3; i++) { const cr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), MAT.woodLight); cr.position.set(-9.4, 0.2, 3.8 + i * 0.6); this.add(cr); }
    this.interact('market', -7, 3.4, 'Market stall', 'interact', 1.8, Math.PI);
    this.lantern(-4, -6); this.lantern(4, 6); this.lantern(-10, -1); this.lantern(9, 2); this.lantern(-2.5, 28); this.lantern(2.5, 28);
    this.lantern(-18, -7.5, 2.6, false);
    // benches and barrels
    this.block(-3, 8, 2, 0.5, 0.45, MAT.wood); this.block(3, -8, 2, 0.5, 0.45, MAT.wood);
    for (const [x, z] of [[8, 7], [8.6, 7.6], [-11, -4]]) this.cyl(x, z, 0.35, 0.9, MAT.woodLight, 0, 8);
  }

  private countingHouse() {
    const minX = 8, maxX = 20, minZ = -14, maxZ = -5, h = 3.6;
    const floor = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.1, maxZ - minZ), MAT.stone); floor.position.set(14, 0.05, -9.5); floor.receiveShadow = true; this.scene.add(floor);
    this.shell(minX, maxX, minZ, maxZ, h, [['s', 13, 2]], MAT.stone);
    this.roof(minX, maxX, minZ, maxZ, h, MAT.roofSlate, 'Counting House');
    this.window(10.5, maxZ, 1.9, 0); this.window(17.5, maxZ, 1.9, 0);
    const sign = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.08), MAT.wood); sign.position.set(13, 2.8, maxZ + 0.2); this.add(sign);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12), MAT.brass); coin.rotation.x = Math.PI / 2; coin.position.set(13, 2.8, maxZ + 0.26); this.scene.add(coin);
    // ledger desk (Brannic's)
    this.block(11, -11, 2.2, 1.0, 0.8, MAT.wood);
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.45), MAT.paper); book.position.set(11, 0.83, -11); this.scene.add(book);
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.04, 0.48), MAT.cloth); cover.position.set(11, 0.79, -11); this.scene.add(cover);
    const inkpot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), MAT.iron); inkpot.position.set(11.6, 0.84, -10.8); this.scene.add(inkpot);
    this.block(11, -9.75, 0.5, 0.5, 0.45, MAT.wood, 0, false); // stool
    this.interact('ledger_desk', 11, -9.2, 'Work a ledger shift', 'write', 1.4, 0, new THREE.Vector3(11, 0, -9.75));
    // clerk counter (Aldric's debt book)
    this.block(17.5, -10, 0.9, 3.4, 1.05, MAT.timber);
    const scales = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 10), MAT.brass); scales.position.set(17.5, 1.1, -9.3); this.scene.add(scales);
    this.interact('clerk', 16.3, -10, 'Aldric\'s clerk (debt)', 'interact', 1.4, -Math.PI / 2);
    const shelf = this.block(14, -13.6, 4, 0.5, 2.6, MAT.timber);
    for (let i = 0; i < 12; i++) { const bk = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38, 0.32), i % 3 ? MAT.cloth : MAT.clothBlue); bk.position.set(12.4 + i * 0.27, 1.5 + (i % 2) * 0.7, -13.4); this.scene.add(bk); }
    void shelf;
    this.lights.add(14, 3, -9.5, 0xffd8a0, 1.6, 14, 1.5);
  }

  private decorBuildings() {
    const house = (minX: number, maxX: number, minZ: number, maxZ: number, roofMat: THREE.Material, doorSide: 'n' | 's' | 'e' | 'w', name: string, tall = 3.0) => {
      this.shell(minX, maxX, minZ, maxZ, tall, [], MAT.plaster);
      // closed door
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      const d = new THREE.Mesh(new THREE.BoxGeometry(doorSide === 'n' || doorSide === 's' ? 1.2 : 0.12, 2.1, doorSide === 'n' || doorSide === 's' ? 0.12 : 1.2), MAT.timber);
      d.position.set(doorSide === 'e' ? maxX + 0.12 : doorSide === 'w' ? minX - 0.12 : cx, 1.05, doorSide === 's' ? maxZ + 0.12 : doorSide === 'n' ? minZ - 0.12 : cz); this.add(d);
      this.roof(minX, maxX, minZ, maxZ, tall, roofMat, name);
      const glass = this.window(doorSide === 'e' ? maxX : doorSide === 'w' ? minX : cx + 2, doorSide === 's' ? maxZ : doorSide === 'n' ? minZ : cz + 2, 1.7, doorSide === 'e' || doorSide === 'w' ? Math.PI / 2 : 0, true);
      void glass;
    };
    house(12, 20, 6, 13, MAT.thatch, 'w', 'Bram\'s bakery');
    house(24, 31, -6, 2, MAT.thatch, 'w', 'Widow Cael\'s house');
    house(-30, -22, 12, 19, MAT.roof, 'e', 'Sera\'s store');
    // chapel spire
    const sp = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4, 4), MAT.roofSlate); sp.position.set(-14.5, 6.6, -19); sp.rotation.y = Math.PI / 4; this.add(sp);
    // Aldric's Spire, decorative tower in the west
    this.cyl(-36, 22, 3, 12, MAT.stone, 0, 10);
    const tt = new THREE.Mesh(new THREE.ConeGeometry(3.6, 4.5, 10), MAT.roofSlate); tt.position.set(-36, 14.2, 22); this.add(tt);
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), MAT.rune.clone()); orb.position.set(-36, 17, 22); this.scene.add(orb); this.crystalRunes.push(orb);
  }

  // ---------------- enterable town buildings (pass 4) ----------------
  nodes: WorldNode[] = [];
  chapel!: ChapelRefs;
  /** Named places the HUD compass, the map and quests can point at. */
  places: Record<string, THREE.Vector3> = {};
  private townInteriors() {
    const open = (minX: number, maxX: number, minZ: number, maxZ: number, tall: number, door: ['n' | 's' | 'e' | 'w', number, number], roofMat: THREE.Material, name: string, floorMat: THREE.Material) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.1, maxZ - minZ), floorMat); f.position.set((minX + maxX) / 2, 0.05, (minZ + maxZ) / 2); f.receiveShadow = true; this.scene.add(f);
      this.shell(minX, maxX, minZ, maxZ, tall, [door], MAT.plaster); this.roof(minX, maxX, minZ, maxZ, tall, roofMat, name);
    };
    const fire = (x: number, y: number, z: number, r = 0.25) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2, 6), MAT.fire.clone()); f.position.set(x, y, z); this.scene.add(f); this.fires.push(f); };
    const stool = (x: number, z: number) => this.block(x, z, 0.4, 0.4, 0.45, MAT.wood, 0, false);
    // --- The Gilded Tankard: bar, hearth, tables, dice ---
    open(-20, -12, 8, 15, 3.4, ['n', -16, 1.6], MAT.roof, 'The Gilded Tankard', MAT.wood);
    this.window(-18.5, 8, 1.8, 0); this.window(-13.5, 8, 1.8, 0);
    this.block(-16.6, 12.6, 3.6, 0.7, 1.05, MAT.timber);                               // bar
    for (let i = 0; i < 3; i++) { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8), MAT.brass); mug.position.set(-17.8 + i * 0.9, 1.13, 12.5); this.scene.add(mug); stool(-17.8 + i * 1.1, 11.75); }
    for (const x of [-18.9, -17.9]) this.cyl(x, 14.3, 0.4, 1.0, MAT.woodLight, 0, 8);    // kegs
    this.block(-19.55, 13.4, 0.6, 1.5, 1.7, MAT.stone); fire(-19.2, 0.5, 13.4); this.lights.add(-18.9, 1.0, 13.4, 0xff8a3a, 3.2, 9, 1.5, { flicker: 0.12 });
    this.block(-17.6, 10.4, 0.9, 0.9, 0.75, MAT.woodLight); stool(-18.6, 10.4); stool(-16.6, 10.4);   // Fenn's table
    this.block(-13.3, 13.0, 1.0, 1.0, 0.75, MAT.woodLight);                                // dice table
    for (const [dx, dz] of [[-0.15, 0.1], [0.12, -0.1]]) { const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), MAT.linen); d.position.set(-13.3 + dx, 0.82, 13.0 + dz); d.rotation.y = dx * 5; this.scene.add(d); }
    this.interact('bar', -16.6, 11.75, 'Order at the bar', 'sit', 1.2, Math.PI);
    this.interact('dice', -13.3, 12.0, 'Play dice', 'interact', 1.1, Math.PI);
    this.lights.add(-16, 2.8, 11, 0xffd8a0, 2.2, 13, 1.4);
    const tsign = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.08), MAT.wood); tsign.position.set(-16, 2.85, 7.75); this.add(tsign);
    const tmug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 8), MAT.brass); tmug.position.set(-16, 2.85, 7.66); tmug.rotation.x = Math.PI / 2; this.scene.add(tmug);
    // --- Chapel of the Quiet Flame: brazier, pews ---
    open(-18, -11, -22, -16, 4.2, ['s', -14.5, 1.6], MAT.roofSlate, 'Chapel of the Quiet Flame', MAT.stone);
    this.cyl(-14.5, -21, 0.5, 0.9, MAT.stoneDark, 0, 10); fire(-14.5, 1.15, -21, 0.22); this.lights.add(-14.5, 1.6, -20.6, 0xffc070, 3.4, 11, 1.4, { flicker: 0.06 });
    for (const x of [-16.6, -12.4]) for (const z of [-18.6, -17.4]) this.block(x, z, 1.9, 0.45, 0.45, MAT.wood);
    for (const x of [-17.6, -11.4]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), MAT.linen); c.position.set(x, 1.5, -21.6); this.scene.add(c); }
    this.interact('flame', -14.5, -19.0, 'Kneel at the Quiet Flame', 'kneel', 1.0, 0, new THREE.Vector3(-14.5, 0, -19.9));
    // --- Dorran's smithy: forge, anvil, bench ---
    open(22, 30, 12, 20, 3.2, ['w', 16, 1.8], MAT.roof, "Dorran's smithy", MAT.stoneDark);
    this.block(29.2, 16, 1.2, 2.4, 1.0, MAT.stoneDark); this.block(29.4, 16, 0.9, 1.2, 2.4, MAT.stone, 1.0, false); fire(28.8, 1.2, 16, 0.3);
    this.lights.add(28.2, 1.5, 16, 0xff7a2a, 4, 11, 1.4, { flicker: 0.14 });
    this.cyl(26.2, 18.5, 0.3, 0.55, MAT.bark, 0, 8); const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.3), MAT.iron); anvil.position.set(26.2, 0.69, 18.5); this.add(anvil);
    this.block(25.6, 12.7, 3.2, 0.7, 0.9, MAT.wood); this.cyl(28.6, 13.3, 0.4, 0.8, MAT.woodLight, 0, 8);
    for (let i = 0; i < 4; i++) { const tl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.06), MAT.iron); tl.position.set(24.6 + i * 0.6, 1.5, 12.2); tl.rotation.z = 0.2 * (i - 1.5); this.scene.add(tl); }
    this.interact('anvil', 24.4, 16, "Dorran's forge: gear and repairs", 'interact', 1.3, -Math.PI / 2);
    // --- Aldric's Spire: a door at its foot, and a path to it ---
    const sd = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.3, 1.3), MAT.timber); sd.position.set(-33.0, 1.15, 22); this.add(sd);
    const sl = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), MAT.rune.clone()); sl.position.set(-32.9, 2.7, 22); this.scene.add(sl); this.crystalRunes.push(sl);
    this.lights.add(-31.8, 2.6, 22, 0x8fb0ff, 3, 12, 1.5, { when: 'night' });
    this.interact('spire_door', -32.2, 22, "Knock at Aldric's Spire", 'interact', 1.0, Math.PI / 2);
    for (const [x1, z1, x2, z2] of [[-9, 2, -30.5, 21], [-13, -6, -14.5, -15.6], [-10, 6, -16, 7.6], [10, 8, 21.6, 16]]) {
      const len = Math.hypot(x2 - x1, z2 - z1); const p = new THREE.Mesh(new THREE.PlaneGeometry(1.8, len), MAT.path);
      p.rotation.x = -Math.PI / 2; p.rotation.z = -Math.atan2(x2 - x1, z2 - z1); p.position.set((x1 + x2) / 2, 0.011, (z1 + z2) / 2); p.receiveShadow = true; this.scene.add(p);
    }
    Object.assign(this.places, { home: new THREE.Vector3(-21, 0, -6.4), board: new THREE.Vector3(5.6, 0, -2.9), clerk: new THREE.Vector3(16.3, 0, -10), ledger_desk: new THREE.Vector3(11, 0, -9.2), well: new THREE.Vector3(0, 0, 1.6), gate: new THREE.Vector3(0, 0, 33), tavern: new THREE.Vector3(-16, 0, 7.5), chapel: new THREE.Vector3(-14.5, 0, -15.5), smithy: new THREE.Vector3(21.5, 0, 16), spire: new THREE.Vector3(-32, 0, 22), hearth: new THREE.Vector3(-32.7, 0, -5.4), basin: new THREE.Vector3(-23.35, 0, -13.75) });
  }
  /** Things to find in the Vale: herbs and moonpetal, the reed pond, Sera's cart, the offering stone. */
  private valeProps() {
    const herbM = M(0x79b356), moonM = new THREE.MeshBasicMaterial({ color: 0xcfe8ff }), stemM = M(0x4a6a3a);
    let n = 0;
    const node = (kind: 'herb' | 'moon', x: number, z: number) => {
      const g = new THREE.Group();
      if (kind === 'herb') { for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 5), herbM); c.position.set(Math.cos(i * 2.1) * 0.16, 0.21, Math.sin(i * 2.1) * 0.16); c.rotation.z = Math.cos(i * 2.1) * 0.3; g.add(c); } }
      else { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.4, 4), stemM); st.position.y = 0.2; g.add(st); const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), moonM); fl.position.y = 0.44; g.add(fl); }
      g.position.set(x, 0, z); this.scene.add(g);
      const it = this.interact(`${kind}_${n++}`, x, z, kind === 'herb' ? 'Pick Vale herbs' : 'Cut the moonpetal', 'pick', 1.25);
      this.nodes.push({ id: it.id, kind, mesh: g, it });
    };
    for (const p of Object.values(this.sites)) { node('herb', p.x + 8.5, p.z + 3); node('herb', p.x - 7.5, p.z + 6.5); node('herb', p.x + 2, p.z - 9); node('moon', p.x - 9.5, p.z - 4); }
    const w = this.sites.whisper_stones; node('moon', w.x + 9.5, w.z + 5.5); node('moon', w.x + 1.5, w.z + 10.5); node('herb', -18, 52); node('herb', 16, 60);
    // reed pond west of the Mill Road
    const px = -54, pz = 82;
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20), MAT.water); pond.rotation.x = -Math.PI / 2; pond.position.set(px, 0.03, pz); this.scene.add(pond);
    for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 3.6 + (i % 3) * 0.5; this.put('reed', () => new THREE.CylinderGeometry(0.02, 0.03, 1.3, 4), M(0x7a8a4a), new THREE.Vector3(px + Math.cos(a) * r, 0.65, pz + Math.sin(a) * r), new THREE.Euler(0.1 * Math.cos(a * 3), 0, 0.12 * Math.sin(a * 2)), undefined, false); }
    this.interact('pond', px + 4.4, pz + 1.5, 'Search the reeds', 'pick', 1.6);
    // Sera's cart, wrecked on the ford road
    const cx = 50, cz = 93;
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 1.4), MAT.wood); bed.position.set(cx, 0.55, cz); bed.rotation.set(0.05, 0.4, 0.28); this.add(bed);
    for (const [dx, dz, rz] of [[-1.0, 0.8, 1.2], [1.3, -0.9, 0.2]]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 5, 10), MAT.timber); wh.position.set(cx + dx, 0.35, cz + dz); wh.rotation.set(rz, 0.4, 0); this.add(wh); }
    this.block(cx + 0.6, cz + 1.3, 0.6, 0.4, 0.4, MAT.iron, 0, false);
    this.colliders.push({ minX: cx - 1.3, maxX: cx + 1.3, minZ: cz - 0.8, maxZ: cz + 0.8, h: 1.0 });
    this.interact('cart', cx + 0.6, cz + 2.1, 'Search the wrecked cart', 'pick', 1.5);
    // the tallest Whisper Stone, where offerings are left
    this.interact('offering', w.x + 7, w.z - 1.3, 'Search the foot of the tallest stone', 'pick', 1.3);
    Object.assign(this.places, { mill_door: this.millDoorPos, pond: new THREE.Vector3(px + 4.4, 0, pz + 1.5), cart: new THREE.Vector3(cx, 0, cz + 2), chapel_door: new THREE.Vector3(46, 0, 121) });
    for (const id of Object.keys(this.sites) as SiteId[]) this.places['cairn_' + id] = this.interactables.find(i => i.id === 'cairn_' + id)!.pos;
  }

  private walls() {
    // palisade around town with a south gate
    const P = (x1: number, z1: number, x2: number, z2: number) => {
      const len = Math.hypot(x2 - x1, z2 - z1), n = Math.floor(len / 0.55);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
        const hh = 1 + (i % 3) * 0.06;
        this.put('post', () => new THREE.CylinderGeometry(0.22, 0.25, 3.2, 5), MAT.timber, new THREE.Vector3(x, 1.6 * hh, z), undefined, new THREE.Vector3(1, hh, 1));
        this.put('postTip', () => new THREE.ConeGeometry(0.24, 0.5, 5), MAT.timber, new THREE.Vector3(x, 3.2 * hh + 0.2, z), undefined, undefined, false);
      }
      this.colliders.push({ minX: Math.min(x1, x2) - 0.3, maxX: Math.max(x1, x2) + 0.3, minZ: Math.min(z1, z2) - 0.3, maxZ: Math.max(z1, z2) + 0.3, h: 3.5 });
    };
    P(-42, -26, 42, -26); P(-42, -26, -42, 1.5); P(-42, 7.5, -42, 32); P(42, -26, 42, 1.5); P(42, 7.5, 42, 32); P(-42, 32, -3.2, 32); P(3.2, 32, 42, 32);
    for (const x of [-3.6, 3.6]) { this.block(x, 32, 1.2, 1.2, 5, MAT.timber); const r = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.2, 4), MAT.roof); r.position.set(x, 5.6, 32); r.rotation.y = Math.PI / 4; this.add(r); }
    // world edge (invisible) with rocks
    const b = this.bounds;
    this.colliders.push({ minX: b.minX - 2, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ, h: 9 }, { minX: b.maxX, maxX: b.maxX + 2, minZ: b.minZ, maxZ: b.maxZ, h: 9 },
      { minX: b.minX, maxX: b.maxX, minZ: b.maxZ, maxZ: b.maxZ + 2, h: 9 }, { minX: b.minX, maxX: b.maxX, minZ: b.minZ - 2, maxZ: b.minZ, h: 9 });
  }

  // ---------------- the Whispering Vale ----------------
  private vale() {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const tree = (x: number, z: number, s: number) => {
      const sc = new THREE.Vector3(s, s, s), ry = new THREE.Euler(0, rnd() * 6, 0);
      this.put('trunk', () => new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6), MAT.bark, new THREE.Vector3(x, 1.1 * s, z), ry, sc);
      for (let i = 0; i < 3; i++) this.put('leaf' + i, () => new THREE.ConeGeometry(1.6 - i * 0.35, 1.8, 7), i % 2 ? MAT.leaf : MAT.leafDark, new THREE.Vector3(x, (2.2 + i * 1.0) * s, z), ry, sc);
      this.colliders.push({ minX: x - 0.3 * s, maxX: x + 0.3 * s, minZ: z - 0.3 * s, maxZ: z + 0.3 * s, h: 4 });
      this.cameraBlockers.push({ minX: x - 1.1 * s, maxX: x + 1.1 * s, minZ: z - 1.1 * s, maxZ: z + 1.1 * s, h: 5.5 * s });
    };
    const rock = (x: number, z: number, s: number) => {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), MAT.rock); r.position.set(x, s * 0.5, z); r.rotation.set(rnd() * 3, rnd() * 3, 0); r.scale.y = 0.7; this.add(r);
      this.colliders.push({ minX: x - s * 0.8, maxX: x + s * 0.8, minZ: z - s * 0.8, maxZ: z + s * 0.8, h: s });
    };
    const clear = (x: number, z: number) => Object.values(this.sites).every(p => Math.hypot(p.x - x, p.z - z) > 11) && Math.abs(x) > 4 + (z - 32) * 0.02 && !(x > -53 && x < -35 && z > 55 && z < 73) && Math.hypot(x + 54, z - 82) > 7 && Math.hypot(x - 50, z - 93) > 5 && !(x > 34 && x < 58 && z > 110 && z < 134);
    for (let i = 0; i < 170; i++) { const x = -60 + rnd() * 120, z = 38 + rnd() * 96; if (clear(x, z)) tree(x, z, 0.8 + rnd() * 0.7); }
    for (let i = 0; i < 26; i++) { const x = -58 + rnd() * 116, z = 36 + rnd() * 98; if (clear(x, z)) rock(x, z, 0.5 + rnd() * 1.1); }
    for (let i = 0; i < 40; i++) { const x = -40 + rnd() * 80, z = -24 + rnd() * 54; if (Math.hypot(x, z) > 16 && !(x < -20 && x > -37 && z < 0 && z > -17) && !(x > 6 && x < 32 && z < 21 && z > -15) && !(x < -10 && z > 6) && Math.abs(x) < 39) { this.put('tuft', () => new THREE.ConeGeometry(0.25, 0.5, 4), MAT.leaf, new THREE.Vector3(x, 0.25, z), undefined, undefined, false); } }
    // Old Mill road site: ruined mill
    const m = this.sites.mill_road;
    this.block(m.x - 6, m.z - 3, 6, 5, 4, MAT.stoneDark); this.block(m.x - 6, m.z + 0.5, 6, 0.3, 1.8, MAT.stone);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.25, 6, 14), MAT.timber); wheel.position.set(m.x - 2.6, 1.9, m.z - 3); wheel.rotation.y = Math.PI / 2; wheel.rotation.z = 0.3; this.add(wheel);
    // Raider camp: tents, fire, crates
    const c = this.sites.raider_camp;
    for (const [dx, dz, r] of [[-4, -3, 0.4], [3, -4, -0.3], [4, 3, 1.2]]) { const t = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 4), MAT.cloth); t.position.set(c.x + dx, 1.1, c.z + dz); t.rotation.y = r; this.add(t); this.colliders.push({ minX: c.x + dx - 1.2, maxX: c.x + dx + 1.2, minZ: c.z + dz - 1.2, maxZ: c.z + dz + 1.2, h: 2.2 }); }
    const camp = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), MAT.fire.clone()); camp.position.set(c.x, 0.4, c.z); this.scene.add(camp); this.fires.push(camp);
    this.lights.add(c.x, 1.2, c.z, 0xff7a2a, 4, 12, 1.4, { flicker: 0.15 });
    for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.3), MAT.ash); s.position.set(c.x + Math.cos(i) * 0.7, 0.1, c.z + Math.sin(i) * 0.7); this.scene.add(s); }
    this.block(c.x - 2, c.z + 4, 0.8, 0.8, 0.8, MAT.woodLight); this.block(c.x - 1, c.z + 4.3, 0.8, 0.8, 0.8, MAT.woodLight);
    // Whisper Stones: standing stones ring with runes
    const w = this.sites.whisper_stones;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, x = w.x + Math.cos(a) * 7, z = w.z + Math.sin(a) * 7;
      this.block(x, z, 0.9, 0.9, 3 + (i % 3) * 0.6, MAT.stoneDark);
      const rn = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.02), MAT.rune.clone()); rn.position.set(x - Math.cos(a) * 0.46, 1.8, z - Math.sin(a) * 0.46); rn.lookAt(w.x, 1.8, w.z); this.scene.add(rn); this.crystalRunes.push(rn);
    }
    // cairns for courier work
    for (const id of Object.keys(this.sites) as SiteId[]) {
      const p = this.sites[id], cx = p.x + 5, cz = p.z + 6;
      for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 - i * 0.08, 0), MAT.rock); st.position.set(cx, 0.3 + i * 0.32, cz); this.add(st); }
      this.colliders.push({ minX: cx - 0.5, maxX: cx + 0.5, minZ: cz - 0.5, maxZ: cz + 0.5, h: 1.4 });
      this.interact(`cairn_${id}` as InteractId, cx, cz - 1.2, 'Waystone cairn', 'interact', 1.5);
    }
  }

  // ---------------- the Old Mill (pass 3) ----------------
  private oldMill() {
    // Exterior: a ruined mill with a broken wheel beside the Mill Road, and its cellar door.
    const ox = -44, oz = 64;
    this.shell(ox - 4, ox + 4, oz - 3, oz + 3, 4.2, [['e', oz + 2, 1.6]], MAT.stoneDark, false);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.22, 6, 14), MAT.timber); wheel.position.set(ox - 4.6, 2.3, oz); wheel.rotation.y = Math.PI / 2; wheel.rotation.z = 0.4; this.add(wheel);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.2, 0.12), MAT.timber); sp.position.copy(wheel.position); sp.rotation.set(0, Math.PI / 2, i / 6 * Math.PI + 0.4); this.scene.add(sp); }
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 1.2), MAT.wood); hatch.position.set(ox + 2.5, 0.08, oz + 2); this.scene.add(hatch);
    this.millDoorPos.set(ox + 2.5, 0, oz + 2);
    this.interact('mill_door', ox + 2.5, oz + 2, 'Go down into the Old Mill', 'interact', 1.4);
    this.mill.outside.set(ox + 5.5, 0, oz + 2);
    // Interior. Origin O; corridor runs north (−z). Rooms:
    //  entry hall → grain store (west, lever + note) → flooded corridor (gate) → wheel chamber (waystone, east crates) → Patriarch's arena.
    const O = this.mill.origin, x0 = O.x, z0 = O.z, H = 3.6;
    const floorM = M(0x3b352c), wallM = M(0x4a443a), beam = M(0x2e2216), moss = M(0x2f4a2a);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(60, 0.1, 80), floorM); floor.position.set(x0, 0.05, z0 - 20); floor.receiveShadow = true; this.scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(60, 0.2, 80), M(0x221d16)); ceil.position.set(x0, H + 0.1, z0 - 20); this.scene.add(ceil);
    // entry hall 12 × 10 (z0+22 .. z0+12)
    this.shell(x0 - 6, x0 + 6, z0 + 8, z0 + 20, H, [['n', x0, 2.4], ['w', z0 + 14, 2.2]], wallM, false);
    this.block(x0 + 3, z0 + 18, 2.2, 1.4, 1.0, MAT.wood); this.block(x0 - 4, z0 + 11, 1.2, 1.2, 1.2, MAT.wood); // sacks/crates
    this.interact('mill_exit', x0, z0 + 19.2, 'Climb back out to the Vale', 'interact', 1.6);
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.4, 0.1), beam); ladder.position.set(x0, 1.7, z0 + 19.9); this.scene.add(ladder);
    this.interact('mill_note_1', x0 + 3, z0 + 16.9, 'Read the scratched note', 'interact', 1.2);
    // grain store (west) 10 × 10, lever on the far wall
    this.shell(x0 - 17, x0 - 6, z0 + 9, z0 + 19, H, [['e', z0 + 14, 2.2]], wallM, false);
    for (let i = 0; i < 5; i++) this.block(x0 - 15.5 + (i % 3) * 1.6, z0 + 10.5 + Math.floor(i / 3) * 6.5, 1.1, 1.1, 0.9 + (i % 2) * 0.5, MAT.straw);
    this.block(x0 - 16.7, z0 + 14, 0.2, 0.5, 1.2, MAT.iron, 0.8, false);
    this.interact('mill_lever', x0 - 16, z0 + 14, 'Pull the rusted lever', 'interact', 1.3, Math.PI / 2);
    this.interact('mill_crate_1', x0 - 13, z0 + 17.5, 'Search the miller\'s crate', 'interact', 1.2);
    this.interact('mill_note_2', x0 - 9, z0 + 10.2, 'Read the ledger page nailed to a post', 'interact', 1.2);
    // corridor north 4 wide, 16 long (z0+8 .. z0-8), with a gate at z0+1 and debris forcing a zig-zag
    this.shell(x0 - 2, x0 + 2, z0 - 8, z0 + 8, H, [['s', x0, 2.4], ['n', x0, 2.4]], wallM, false);
    this.block(x0 - 1.1, z0 + 4.5, 1.8, 1.0, 1.2, beam); this.block(x0 + 1.1, z0 - 3.5, 1.8, 1.0, 1.0, MAT.rock);
    const gm = new THREE.Mesh(new THREE.BoxGeometry(3.7, 3.0, 0.2), MAT.iron); gm.position.set(x0, 1.5, z0 + 1); this.add(gm);
    const gb: Box = { minX: x0 - 1.85, maxX: x0 + 1.85, minZ: z0 + 0.9, maxZ: z0 + 1.1, h: 3 }; this.colliders.push(gb); this.millGate = { mesh: gm, box: gb };
    const water = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.03, 6), MAT.water); water.position.set(x0, 0.12, z0 - 4); this.scene.add(water);
    // wheel chamber 16 × 12 (z0-8 .. z0-20) with the great gear and the waystone
    this.shell(x0 - 8, x0 + 8, z0 - 20, z0 - 8, H + 1, [['s', x0, 2.4], ['n', x0, 3.0]], wallM, false);
    const gear = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.5, 16), beam); gear.rotation.x = Math.PI / 2; gear.position.set(x0 - 5, 2.4, z0 - 14); this.add(gear);
    this.colliders.push({ minX: x0 - 7.6, maxX: x0 - 2.4, minZ: z0 - 14.4, maxZ: z0 - 13.6, h: 4.8 });
    for (let i = 0; i < 4; i++) this.block(x0 + 6.5, z0 - 10 - i * 2.6, 1.0, 1.0, 0.8 + (i % 2) * 0.4, MAT.wood);
    this.cyl(x0 + 2.5, z0 - 15, 0.5, 1.4, MAT.rock);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.05), MAT.rune); rune.position.set(x0 + 2.5, 1.0, z0 - 14.48); this.scene.add(rune); this.crystalRunes.push(rune);
    this.interact('mill_waystone', x0 + 2.5, z0 - 13.6, 'Light the waystone (checkpoint)', 'interact', 1.4);
    this.mill.checkpoint.set(x0 + 2.5, 0, z0 - 12.2);
    this.interact('mill_crate_2', x0 + 5.6, z0 - 17.5, 'Search the sealed crate', 'interact', 1.2);
    this.interact('mill_note_3', x0 - 2, z0 - 19.2, 'Read the words cut into the door', 'interact', 1.2);
    // arena 22 × 22 (z0-20 .. z0-42), millstone in the centre, four pillars for cover
    this.shell(x0 - 11, x0 + 11, z0 - 42, z0 - 20, H + 2, [['s', x0, 3.0]], wallM, false);
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.7, 18), MAT.rock); stone.position.set(x0, 0.35, z0 - 33); this.add(stone);
    this.colliders.push({ minX: x0 - 1.6, maxX: x0 + 1.6, minZ: z0 - 34.6, maxZ: z0 - 31.4, h: 0.7 });
    for (const [px, pz] of [[-6, -26], [6, -26], [-6, -38], [6, -38]]) this.block(x0 + px, z0 + pz, 1.2, 1.2, H + 2, wallM);
    this.mill.arena.set(x0, 0, z0 - 31);
    this.interact('mill_crate_3', x0 + 9.5, z0 - 40.5, 'Search the Patriarch\'s hoard', 'interact', 1.3);
    for (let i = 0; i < 8; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 2 + Math.random() * 2), moss); r.position.set(x0 - 10 + Math.random() * 20, 0.12, z0 - 22 - Math.random() * 18); r.rotation.y = Math.random() * 3; this.scene.add(r); }
    // torches (anchors for the shared light pool)
    for (const [lx, lz] of [[0, 15], [-11, 14], [0, 0], [0, -14], [-7, -31], [7, -31]]) {
      const an = this.lights.add(x0 + lx, 2.8, z0 + lz, 0x9fb8ff, 8.5, 18, 1.6, { zone: 'mill', flicker: 0.12 });
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xb8ccff })); flame.position.copy(an.pos); this.scene.add(flame);
    }
    // telegraphed darkness pools for the boss (hidden until used)
    const dm = new THREE.MeshBasicMaterial({ color: 0x5a2a8f, transparent: true, opacity: 0.0, depthWrite: false });
    for (let i = 0; i < 6; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(2.2, 20), dm.clone()); d.rotation.x = -Math.PI / 2; d.position.set(x0, 0.13, z0 - 31); d.visible = false; this.scene.add(d); this.millDarkness.push(d); }
  }
  openMillGate() {
    const i = this.colliders.indexOf(this.millGate.box); if (i >= 0) this.colliders.splice(i, 1);
    this.millGate.mesh.position.y = 3.3;
  }
  closeMillGate() { if (!this.colliders.includes(this.millGate.box)) this.colliders.push(this.millGate.box); this.millGate.mesh.position.y = 1.5; }
  inMillArea(p: THREE.Vector3) { return p.z < -270 && p.x >= -100 && p.x < 100; }
  inBarrowArea(p: THREE.Vector3) { return p.z < -270 && p.x < -100; }
  /** v0.8: off the boardwalk in the reed marsh (wading). */
  inMarsh(p: THREE.Vector3) { return !this.dungeon && p.x < -240 && inMarshWater(p, this.west); }
  inChapelArea(p: THREE.Vector3) { return p.z < -270 && p.x >= 100 && p.x < 250; }
  inMineArea(p: THREE.Vector3) { return p.z < -270 && p.x >= 250 && p.x < 430; }
  /** v0.9: the Sea Cave under Wreckers' Cove (ADR-015's fifth band). */
  inSeaCaveArea(p: THREE.Vector3) { return p.z < -270 && p.x >= 430; }
  inMineVault(p: THREE.Vector3) { const v = this.mine.vault; return p.x > v.minX && p.x < v.maxX && p.z > v.minZ && p.z < v.maxZ - 2; }
  inFord(p: THREE.Vector3) { const e = this.east; return p.x > e.river.minX - 0.5 && p.x < e.river.maxX + 0.5 && p.z > e.ford.minZ && p.z < e.ford.maxZ; }
  /** The named area at a point: an Eastern Reach region, the Vale, Millbrook or home. */
  regionAt(p: THREE.Vector3): { id: string; name: string } { if (this.dungeon) return { id: this.dungeon, name: this.dungeon }; if (p.z > GAP.z1 || (p.z > 137 && p.x > GAP.minX - 1 && p.x < GAP.maxX + 1)) { for (const r of this.south.regions) if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return r; return { id: 'saltway', name: 'the Saltway' }; } if (p.x < -42.4 || (p.x < -40 && Math.abs(p.z - 4.5) < 3 && this.west.gate.open)) { for (const r of this.west.regions) if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return r; return { id: 'heath', name: 'the Heath Road' }; } if (p.x >= 42 || (p.x > 40 && Math.abs(p.z - 4.5) < 3)) { for (const r of this.east.regions) if (p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ) return r; } return p.z > 32 ? { id: 'vale', name: 'the Whispering Vale' } : { id: 'millbrook', name: 'Millbrook' }; }
  inChapelArena(p: THREE.Vector3) { const O = this.chapel.origin; return p.z < O.z - 16.5 && p.z > O.z - 36 && Math.abs(p.x - O.x) < 10; }
  inArena(p: THREE.Vector3) { const O = this.mill.origin; return p.z < O.z - 20.5 && p.z > O.z - 42 && Math.abs(p.x - O.x) < 11; }

  /** Time of day lighting. h in fractional hours. */
  setTime(h: number, playerPos: THREE.Vector3) {
    const dayAmt = Math.max(0, Math.min(1, (Math.sin(((h - 6) / 12) * Math.PI) + 0.15) * 1.4));
    const ang = ((h - 6) / 12) * Math.PI;
    // Shadow box follows the player, snapped to whole shadow-map texels in light space so shadows
    // don't crawl and shimmer every time you move or turn.
    const ld = this.tmpV.set(Math.cos(ang) * 50, Math.max(8, Math.sin(ang) * 70), 25);
    const fwd = this.tmpF.copy(ld).normalize().negate();
    const rt = this.tmpR.crossVectors(fwd, this.UP).normalize(), up = this.tmpU.crossVectors(rt, fwd);
    const sc = this.sun.shadow.camera, texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const a = Math.round(playerPos.dot(rt) / texel) * texel, b = Math.round(playerPos.dot(up) / texel) * texel, c = playerPos.dot(fwd);
    const tgt = this.tmpT.copy(rt).multiplyScalar(a).addScaledVector(up, b).addScaledVector(fwd, c);
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).add(ld);
    const wx = this.weather, grey = wx === 'clear' ? 0 : wx === 'overcast' ? 0.45 : wx === 'rain' ? 0.65 : wx === 'storm' ? 0.85 : 0.5;
    const fm = this.dungeon ? 0.5 : wx === 'fog' ? 0.3 : wx === 'storm' ? 0.55 : wx === 'rain' ? 0.72 : wx === 'overcast' ? 0.9 : 1;
    const fog = this.scene.fog as THREE.Fog; fog.far = this.fogFar * fm; fog.near = Math.min(40, fog.far * 0.27);
    this.flash = Math.max(0, this.flash - 0.06);
    this.sun.intensity = (0.15 + dayAmt * 2.0) * (1 - grey * 0.55);
    const warm = h < 8 || h > 17 ? 1 : 0;
    this.sun.color.setHSL(0.09, 0.4 + warm * 0.4, 0.75 + dayAmt * 0.15);
    this.hemi.intensity = (0.25 + dayAmt * 0.8) * (1 - grey * 0.25) + this.flash * 2.5;
    const sky = this.tmpSky.setHSL(0.6, (0.35 + dayAmt * 0.1) * (1 - grey * 0.8), (0.08 + dayAmt * 0.62) * (1 - grey * 0.35) + this.flash * 0.3);
    if (warm && dayAmt > 0.15) sky.lerp(this.dusk, 0.35 * (1 - dayAmt));
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    const night = 1 - dayAmt; this.night = night;
    for (const m of this.lanternMeshes) { const mm = m.material as any; if (mm.emissive) mm.emissiveIntensity = night * 1.5; else mm.color.setHSL(0.11, 0.9, 0.3 + night * 0.4); }
    this.winLit.emissiveIntensity = night * 1.5; this.lampGlass.color.setHSL(0.11, 0.9, 0.3 + night * 0.4);
  }
  /** Sealed interiors: no sun, torchlight only, close fog. */
  setDungeon(d: null | 'mill' | 'chapel' | 'mine' | 'barrow' | 'seacave') { this.dungeon = d; }
  setMillMode(on: boolean) { this.dungeon = on ? 'mill' : null; }
  /** v0.8: King Orm's second phase: the chamber goes nearly black. */
  barrowDark = false;
  dungeonAtmosphere() {
    this.sun.intensity = 0.05; this.hemi.intensity = this.dungeon === 'chapel' ? 0.42 : this.dungeon === 'mine' ? 0.34 : this.dungeon === 'barrow' ? (this.barrowDark ? 0.08 : 0.34) : this.dungeon === 'seacave' ? 0.36 : 0.38;
    const c = this.dungeon === 'chapel' ? [0.02, 0.04, 0.045] : this.dungeon === 'mine' ? [0.03, 0.026, 0.02] : this.dungeon === 'barrow' ? [0.012, 0.014, 0.018] : this.dungeon === 'seacave' ? [0.012, 0.026, 0.03] : [0.02, 0.025, 0.035];
    (this.scene.background as THREE.Color).setRGB(c[0], c[1], c[2]); (this.scene.fog as THREE.Fog).color.setRGB(c[0], c[1], c[2]);
  }
  /** Sort everything the builders put in the scene into region groups (by where it is), so whole areas
   *  can be skipped: the Vale and Millbrook when you are in Ashford, every dungeon you are not inside. */
  private groupRegions() {
    // the overworld in 80 m cells; each dungeon is its own group
    const defs: { id: string; minX: number; maxX: number; minZ: number; maxZ: number }[] = [
      { id: 'mill', minX: -60, maxX: 60, minZ: -420, maxZ: -270 }, { id: 'chapel', minX: 100, maxX: 240, minZ: -420, maxZ: -270 }, { id: 'mine', minX: 250, maxX: 420, minZ: -420, maxZ: -270 },
      { id: 'barrow', minX: -260, maxX: -100, minZ: -420, maxZ: -270 }, { id: 'seacave', minX: 430, maxX: 620, minZ: -420, maxZ: -270 },
    ];
    for (let x = -340; x < 340; x += 80) for (let z = -180; z < 460; z += 80) defs.push({ id: `cell:${x}:${z}`, minX: x, maxX: x + 80, minZ: z, maxZ: z + 80 });
    for (const d of defs) { const g = new THREE.Group(); g.name = 'region:' + d.id; this.regionGroups.push({ ...d, g }); }
    const box = new THREE.Box3(), c = new THREE.Vector3();
    for (const o of [...this.scene.children]) {
      if ((o as THREE.Light).isLight || o === this.sun.target) continue;
      box.setFromObject(o); if (box.isEmpty()) continue;
      const size = box.getSize(c.set(0, 0, 0)); if (size.x > 200 || size.z > 200) continue;     // spans regions: leave it
      box.getCenter(c);
      const r = this.regionGroups.find(r => c.x >= r.minX && c.x <= r.maxX && c.z >= r.minZ && c.z <= r.maxZ);
      if (r) r.g.add(o);
    }
    for (const r of this.regionGroups) this.scene.add(r.g);
  }
  /** Static batching: inside each region cell, meshes that share a material and never move or change are
   *  merged into one mesh. Anything the game animates, hides or swaps (lamps, fires, runes, roofs, nodes,
   *  gates, valves, water, animals, boats) is left alone. Cuts draw calls in towns by more than half. */
  mergeStats = { merged: 0, removed: 0 };
  private mergeStatic() {
    const keep = new Set<THREE.Object3D>();
    const mark = (o?: THREE.Object3D | null) => { if (o) o.traverse(c => keep.add(c)); };
    this.lanternMeshes.forEach(mark); this.fires.forEach(mark); this.crystalRunes.forEach(mark); this.millRoots.forEach(mark); this.millDarkness.forEach(mark);
    this.instMeshes.forEach(mark); this.nodes.forEach(n => mark(n.mesh)); this.buildings.forEach(b => mark(b.roof)); mark(this.showerDrops); mark(this.millGate?.mesh);
    const ch = this.chapel; if (ch) { mark(ch.water); mark(ch.gate.mesh); Object.values(ch.valves).forEach(mark); }
    const e = this.east; if (e) { e.boats.forEach(mark); e.critters.forEach(c => mark(c.root)); mark(e.steam); }
    if (this.mine) this.mine.veins.forEach(mark);
    const wr = this.west; if (wr) { wr.gate.leaves.forEach(mark); mark(wr.gate.leaves[0]?.userData.bar); wr.critters.forEach(c => mark(c.root)); wr.boats.forEach(mark); wr.smoke.forEach(mark); mark(wr.pole); }
    const br = this.barrow; if (br) { br.braziers.forEach(b => mark(b.fire)); mark(br.slab.mesh); }
    const so = this.south; if (so) { so.boats.forEach(mark); so.gulls.forEach(g => mark(g.root)); mark(so.sea); mark(so.beam); mark(so.lampRoom); so.rockfall.meshes.forEach(mark); mark(this.scene.getObjectByName('wrenBell')); mark(this.scene.getObjectByName('signalLantern')); mark(this.scene.getObjectByName('wreckBell')); }
    const sc = this.seacave; if (sc) mark(sc.flood);
    this.scene.updateMatrixWorld(true);
    for (const r of this.regionGroups) {
      const buckets = new Map<string, THREE.Mesh[]>();
      // v0.8: meshes inside wholly static groups (stalls, huts, hulls, barrows) are candidates too
      const cands: THREE.Mesh[] = [];
      const staticGroup = (g: THREE.Object3D): boolean => { let ok = g.visible; g.traverse(c => { if (!ok) return; if (keep.has(c) || !c.visible || (c as any).isInstancedMesh || (c as any).isSprite || (c as any).isPoints || (c as any).isLine || (c as any).isLight) ok = false; else if ((c as THREE.Mesh).isMesh && Array.isArray((c as THREE.Mesh).material)) ok = false; }); return ok; };
      for (const o of r.g.children) {
        if ((o as THREE.Mesh).isMesh && !o.children.length) cands.push(o as THREE.Mesh);
        else if (!(o as THREE.Mesh).isMesh && o.children.length && staticGroup(o)) o.traverse(c => { if ((c as THREE.Mesh).isMesh && !c.children.length) cands.push(c as THREE.Mesh); });
      }
      for (const m of cands) {
        if (!m.isMesh || (m as any).isInstancedMesh || keep.has(m) || m.children.length || !m.visible || Array.isArray(m.material)) continue;
        const g = m.geometry as THREE.BufferGeometry; if (!g.attributes.position || !g.attributes.normal || Object.keys(g.morphAttributes).length) continue;
        const sig = `${(m.material as THREE.Material).uuid}|${Object.keys(g.attributes).sort().join(',')}|${g.index ? 'i' : 'n'}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
        let list = buckets.get(sig); if (!list) { list = []; buckets.set(sig, list); } list.push(m);
      }
      for (const list of buckets.values()) {
        if (list.length < 3) continue;
        const geos = list.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld));
        const mg = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
        if (!mg) continue;
        mg.computeBoundingSphere();
        const mm = new THREE.Mesh(mg, list[0].material); mm.castShadow = list[0].castShadow; mm.receiveShadow = list[0].receiveShadow; mm.name = 'merged:' + r.id;
        for (const m of list) m.parent?.remove(m);
        r.g.add(mm); this.mergeStats.merged++; this.mergeStats.removed += list.length;
      }
    }
  }
  /** Show only the regions that can be seen from here. Call every frame (cheap). */
  updateRegions(p: THREE.Vector3) {
    const reach = this.fogFar + 10;   // v0.9.3: was +25; fog colour is the sky colour, so a cell past the fog is invisible (the camera sits ~5 m back)
    for (const r of this.regionGroups) {
      if (r.id === 'mill' || r.id === 'chapel' || r.id === 'mine' || r.id === 'barrow' || r.id === 'seacave') { r.g.visible = this.dungeon === r.id; continue; }
      if (this.dungeon) { r.g.visible = false; continue; }
      const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX), dz = Math.max(r.minZ - p.z, 0, p.z - r.maxZ);
      r.g.visible = Math.hypot(dx, dz) < reach;
    }
  }
  /** Move the pooled lights to the lamps nearest the player. Call once a frame. */
  updateLights(dt: number, p: THREE.Vector3, t: number) { this.lights.update(dt, p, (this.dungeon ?? 'out') as LightZone, this.dungeon ? 1 : this.night, t); }
  animate(t: number) {
    for (const f of this.fires) { f.scale.set(1 + Math.sin(t * 13) * 0.08, 1 + Math.sin(t * 17 + 1) * 0.15, 1); }
    for (const r of this.crystalRunes) { (r.material as THREE.MeshBasicMaterial).color.setHSL(0.56, 0.8, 0.55 + Math.sin(t * 2 + r.position.x) * 0.15); }
  }
  /** Hide roofs of the building the player is standing in (third-person view). */
  updateRoofs(p: THREE.Vector3, hideAll: boolean) {
    for (const b of this.buildings) b.roof.visible = !(p.x > b.minX - 0.2 && p.x < b.maxX + 0.2 && p.z > b.minZ - 0.2 && p.z < b.maxZ + 0.2) || !hideAll;
  }
  insideBuilding(p: THREE.Vector3): string | null {
    for (const b of this.buildings) if (p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ) return b.name;
    return null;
  }
}

/** Push a circle out of all boxes. Returns corrected position. */
export function collide(colliders: Box[], x: number, z: number, r: number, y = 0, stepUp = 0): [number, number] {
  for (let iter = 0; iter < 2; iter++) {
    for (const b of colliders) {
      if (y >= b.h - 0.05) continue;
      if (stepUp > 0 && climbable(b, y, stepUp)) continue; // v0.9.4: a ledge the walker can step onto
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), push = r - d; x += (dx / d) * push; z += (dz / d) * push; }
        else { // centre inside box: push out along the shallowest axis
          const l = x - b.minX, rr = b.maxX - x, n = z - b.minZ, s = b.maxZ - z, m = Math.min(l, rr, n, s);
          if (m === l) x = b.minX - r; else if (m === rr) x = b.maxX + r; else if (m === n) z = b.minZ - r; else z = b.maxZ + r;
        }
      }
    }
  }
  return [x, z];
}
/** Ray vs boxes on the ground plane (with height). Returns hit distance or Infinity. */
export function rayBoxes(colliders: Box[], o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number {
  let best = maxDist;
  for (const b of colliders) {
    let tmin = 0, tmax = best;
    const axes: [number, number, number, number][] = [[o.x, d.x, b.minX, b.maxX], [o.y, d.y, 0, b.h], [o.z, d.z, b.minZ, b.maxZ]];
    let ok = true;
    for (const [oo, dd, mn, mx] of axes) {
      if (Math.abs(dd) < 1e-9) { if (oo < mn || oo > mx) { ok = false; break; } continue; }
      let t1 = (mn - oo) / dd, t2 = (mx - oo) / dd; if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) { ok = false; break; }
    }
    if (ok && tmin < best && tmin > 0.001) best = tmin;
  }
  return best;
}
