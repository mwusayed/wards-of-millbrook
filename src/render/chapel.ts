// The Sunken Chapel (pass 4). Exterior ruin in the north-east Vale; interior far off the map like the mill.
// Narthex → flooded nave (two side chapels, each with a sluice valve) → crypt passage (waystone) → sanctum.
import * as THREE from 'three';
import { MAT, M, type World, type Box } from './world';

export interface ChapelRefs {
  origin: THREE.Vector3; spawn: THREE.Vector3; checkpoint: THREE.Vector3; arena: THREE.Vector3; outside: THREE.Vector3;
  water: THREE.Mesh; gate: { mesh: THREE.Mesh; box: Box };
  /** 1 = flooded to the knee, 0 = drained. Animated by the game. */
  flood: number;
  valves: Record<'a' | 'b', THREE.Mesh>;
  nave: { minX: number; maxX: number; minZ: number; maxZ: number };
  pillars: THREE.Vector3[];
}

export function buildChapel(w: World): ChapelRefs {
  const fire = (x: number, y: number, z: number, r = 0.25, color = 0xff8a3a) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, r * 2.2, 6), new THREE.MeshBasicMaterial({ color })); f.position.set(x, y, z); w.scene.add(f); w.fires.push(f); };
  // ---------- exterior: a drowned ruin by a black pool ----------
  const ex = 47, ez = 122;
  const pool = new THREE.Mesh(new THREE.CircleGeometry(6.5, 24), M(0x16303a, { roughness: 0.15, metalness: 0.2 })); pool.rotation.x = -Math.PI / 2; pool.position.set(ex + 2, 0.04, ez + 3); w.scene.add(pool);
  for (const [dx, dz, ww, dd, h] of [[-5, -4, 0.6, 7, 3.6], [-1.5, -7.4, 7, 0.6, 2.4], [5, -5.5, 0.6, 3.5, 4.4], [5, 0.5, 0.6, 2.5, 1.6], [-5, 2.6, 0.6, 2.2, 1.2]] as number[][]) w.block(ex + dx, ez + dz, ww, dd, h, MAT.stoneDark);
  w.block(ex + 5.6, ez - 7.4, 1.8, 1.8, 6.2, MAT.stone);                                    // stump of the bell tower
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 0.8, 10), MAT.brass); bell.position.set(ex + 3.2, 0.45, ez - 4.6); bell.rotation.z = 1.2; w.add(bell);
  for (let i = 0; i < 4; i++) w.block(ex - 1 + i * 0.9, ez - 0.6 + i * 0.9, 2.2, 0.9, 0.36 - i * 0.1, MAT.stone, 0, false); // steps going down into the water
  for (let i = 0; i < 9; i++) { const a = i * 0.7, r = 6.2 + (i % 3) * 0.5; w.put('reed', () => new THREE.CylinderGeometry(0.02, 0.03, 1.3, 4), M(0x7a8a4a), new THREE.Vector3(ex + 2 + Math.cos(a) * r, 0.65, ez + 3 + Math.sin(a) * r), new THREE.Euler(0.1, 0, 0.1 * Math.sin(a * 2)), undefined, false); }
  w.interact('chapel_door', ex + 0.4, ez + 0.4, 'Wade down into the Sunken Chapel', 'interact', 1.8);
  w.places.chapel_door.set(ex + 0.4, 0, ez + 0.4);
  w.lights.add(ex + 2, 0.6, ez + 3, 0x5fd0c0, 2.6, 12, 1.6, { when: 'night' });

  // ---------- interior ----------
  const C = new THREE.Vector3(160, 0, -320), x0 = C.x, z0 = C.z, H = 4.2;
  const floorM = M(0x34403e), wallM = M(0x45524e), dark = M(0x232a29), wood = M(0x3a2c20);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(46, 0.1, 64), floorM); floor.position.set(x0, 0.05, z0 - 8); floor.receiveShadow = true; w.scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(46, 0.2, 64), dark); ceil.position.set(x0, H + 2.1, z0 - 8); w.scene.add(ceil);
  // narthex 10 × 8
  w.shell(x0 - 5, x0 + 5, z0 + 12, z0 + 20, H, [['n', x0, 2.6]], wallM, false);
  for (let i = 0; i < 3; i++) w.block(x0 - 1.1, z0 + 19.4 - i * 0.5, 2.2, 0.5, 0.3 + i * 0.3, MAT.stone, 0, false);
  w.interact('chapel_exit', x0, z0 + 18.2, 'Climb the steps back to the Vale', 'interact', 1.6);
  w.block(x0 + 3.6, z0 + 14, 1.2, 0.5, 1.0, wood); w.interact('chapel_note_1', x0 + 3.0, z0 + 14.9, "Read the pilgrims' tablet", 'interact', 1.2);
  w.lights.add(x0, 2.8, z0 + 16, 0x7fd0c0, 6.5, 16, 1.6, { zone: 'chapel', flicker: 0.05 });
  // nave 14 × 20, flooded to the knee until both sluices are open
  const nave = { minX: x0 - 7, maxX: x0 + 7, minZ: z0 - 8, maxZ: z0 + 12 };
  w.shell(nave.minX, nave.maxX, nave.minZ, nave.maxZ, H + 1.6, [['s', x0, 2.6], ['n', x0, 2.6], ['w', z0 + 2, 2.2], ['e', z0 + 2, 2.2]], wallM, false);
  const pillars: THREE.Vector3[] = [];
  for (const px of [-4.2, 4.2]) for (const pz of [8, 2.5, -3.5]) w.cyl(x0 + px, z0 + pz, 0.45, H + 1.6, MAT.stone, 0, 8);
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) w.block(x0 + side * 1.9, z0 + 9.5 - i * 3.2, 2.2, 0.5, 0.5, wood);      // pews in the water
  const water = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 19.8), new THREE.MeshStandardMaterial({ color: 0x1f5a5a, roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.8 }));
  water.rotation.x = -Math.PI / 2; water.position.set(x0, 0.55, z0 + 2); w.scene.add(water);
  w.lights.add(x0, 3.4, z0 + 6, 0x6fc8c0, 6, 17, 1.6, { zone: 'chapel' }); w.lights.add(x0, 3.4, z0 - 3, 0x6fc8c0, 6, 17, 1.6, { zone: 'chapel' });
  // side chapels 8 × 8 with the sluice valves
  const valves = {} as Record<'a' | 'b', THREE.Mesh>;
  for (const side of [-1, 1] as const) {
    const ax = x0 + side * 11, minX = Math.min(x0 + side * 7, x0 + side * 15), maxX = Math.max(x0 + side * 7, x0 + side * 15);
    w.shell(minX, maxX, z0 - 2, z0 + 6, H, [[side < 0 ? 'e' : 'w', z0 + 2, 2.2]], wallM, false);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.6, 8), MAT.iron); pipe.position.set(x0 + side * 14.5, 1.3, z0 + 2); w.add(pipe);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 12), MAT.brass); wheel.position.set(x0 + side * 14.2, 1.3, z0 + 2); wheel.rotation.y = Math.PI / 2; w.add(wheel);
    valves[side < 0 ? 'a' : 'b'] = wheel;
    w.interact(side < 0 ? 'chapel_valve_a' : 'chapel_valve_b', x0 + side * 13.4, z0 + 2, 'Turn the sluice valve', 'interact', 1.4, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    w.block(ax, z0 + 5.2, 2.4, 0.8, 0.9, MAT.stone); fire(ax, 1.15, z0 + 5.2, 0.14, 0x7fe0d0);                               // a small shrine
    w.lights.add(ax, 2.6, z0 + 2, side < 0 ? 0x7fd0c0 : 0xff9a5a, 5, 13, 1.6, { zone: 'chapel', flicker: 0.08 });
  }
  w.interact('chapel_note_2', x0 - 9.2, z0 + 4.4, 'Read the scratches on the shrine', 'interact', 1.2);
  w.block(x0 + 9.2, z0 - 1.2, 1.0, 1.0, 0.8, wood); w.interact('chapel_crate_1', x0 + 9.2, z0 - 0.2, "Search the sexton's chest", 'pick', 1.2);
  // the water gate between nave and crypt
  const gm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.2, 0.2), MAT.iron); gm.position.set(x0, 1.6, z0 - 8); w.add(gm);
  const gb: Box = { minX: x0 - 1.4, maxX: x0 + 1.4, minZ: z0 - 8.15, maxZ: z0 - 7.85, h: 3.2 }; w.colliders.push(gb);
  // crypt passage 6 × 8 with the waystone
  w.shell(x0 - 3, x0 + 3, z0 - 16, z0 - 8, H, [['s', x0, 2.6], ['n', x0, 3.0]], wallM, false);
  w.cyl(x0 + 1.9, z0 - 12, 0.45, 1.4, MAT.rock);
  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.5), MAT.rune); rune.position.set(x0 + 1.42, 1.0, z0 - 12); w.scene.add(rune); w.crystalRunes.push(rune);
  w.interact('chapel_waystone', x0 + 0.9, z0 - 12, 'Light the waystone (checkpoint)', 'interact', 1.3, -Math.PI / 2);
  w.block(x0 - 2.3, z0 - 10, 0.9, 0.9, 0.7, wood); w.interact('chapel_crate_2', x0 - 1.5, z0 - 10, 'Search the reliquary box', 'pick', 1.1);
  w.interact('chapel_note_3', x0 - 1.6, z0 - 15.2, 'Read the words burned into the lintel', 'interact', 1.2);
  w.lights.add(x0, 2.8, z0 - 12, 0x8fb8ff, 5.5, 13, 1.6, { zone: 'chapel' });
  // sanctum 20 × 20: altar, four pillars, four braziers
  w.shell(x0 - 10, x0 + 10, z0 - 36, z0 - 16, H + 2, [['s', x0, 3.0]], wallM, false);
  for (const [px, pz] of [[-5, -21.5], [5, -21.5], [-5, -30.5], [5, -30.5]]) { w.block(x0 + px, z0 + pz, 1.3, 1.3, H + 2, MAT.stone); pillars.push(new THREE.Vector3(x0 + px, 0, z0 + pz)); }
  w.block(x0, z0 - 34.4, 3.2, 1.2, 1.0, MAT.stoneDark);
  for (const [bx, bz] of [[-8.6, -17.6], [8.6, -17.6], [-8.6, -34.4], [8.6, -34.4]]) { w.cyl(x0 + bx, z0 + bz, 0.4, 0.9, MAT.iron, 0, 8); fire(x0 + bx, 1.2, z0 + bz, 0.26); }
  w.lights.add(x0 - 7.5, 2.4, z0 - 19, 0xff8a4a, 7, 17, 1.5, { zone: 'chapel', flicker: 0.14 }); w.lights.add(x0 + 7.5, 2.4, z0 - 33, 0xff8a4a, 7, 17, 1.5, { zone: 'chapel', flicker: 0.14 });
  w.lights.add(x0, 3.2, z0 - 26, 0xffa060, 5, 18, 1.5, { zone: 'chapel', flicker: 0.1 });
  w.interact('chapel_crate_3', x0, z0 - 33.2, 'Search the altar', 'pick', 1.4);
  for (let i = 0; i < 6; i++) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 3 + (i % 3)), M(0x1a3434, { roughness: 0.2 })); ch.position.set(x0 - 8 + i * 3.2, 0.12, z0 - 26 + (i % 2) * 3); ch.rotation.y = (i % 2) * 1.2; w.scene.add(ch); }
  return {
    origin: C, spawn: new THREE.Vector3(x0, 0, z0 + 17), checkpoint: new THREE.Vector3(x0 - 0.4, 0, z0 - 12), arena: new THREE.Vector3(x0, 0, z0 - 26), outside: new THREE.Vector3(ex - 2.5, 0, ez - 1.5),
    water, gate: { mesh: gm, box: gb }, flood: 1, valves, nave, pillars,
  };
}
export function setChapelGate(w: World, open: boolean) {
  const g = w.chapel.gate, i = w.colliders.indexOf(g.box);
  if (open) { if (i >= 0) w.colliders.splice(i, 1); g.mesh.position.y = 4.4; }
  else { if (i < 0) w.colliders.push(g.box); g.mesh.position.y = 1.6; }
}
