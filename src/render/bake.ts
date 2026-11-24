import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * v0.8 (ADR-017): collapse an articulated model into as few draw calls as possible.
 *
 * Characters and animals are built from many small parts (a humanoid has ~24), each its own mesh and draw call,
 * twice over with shadows. Every part rides rigidly on one joint, so the parts can be merged into a single
 * SkinnedMesh with one bone per joint and a weight of 1: the joints keep animating exactly as before, and the
 * GPU moves each vertex with its joint. Part colours move into vertex colours, so parts that differ only in
 * colour share one material. Parts with anything special (double-sided, transparent, glowing, metal, named so
 * other code can find them) stay separate, but same-material parts on one joint are merged into one mesh.
 */

const IDENTITY = new THREE.Matrix4();

/** Parts whose material differs only by colour can share one vertex-coloured material. Returns the sharing key. */
function plainKey(m: THREE.Material): string | null {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial || (s as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) return null;
  if (s.name || s.side !== THREE.FrontSide || s.transparent || s.opacity !== 1 || s.alphaTest > 0 || s.wireframe || s.vertexColors) return null;
  if (s.map || s.normalMap || s.emissiveMap || s.alphaMap || s.roughnessMap || s.metalnessMap || s.aoMap || s.envMap) return null;
  if (s.emissiveIntensity > 0 && s.emissive.r + s.emissive.g + s.emissive.b > 0) return null;
  return `${s.roughness.toFixed(3)}|${s.metalness.toFixed(3)}|${s.flatShading ? 1 : 0}|${s.fog ? 1 : 0}|${s.depthWrite ? 1 : 0}`;
}

/** A non-indexed copy holding only position and normal, transformed by `m` (winding kept for mirrored parts). */
function flatCopy(g: THREE.BufferGeometry, m: THREE.Matrix4, keepUv = false): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal' && !(keepUv && k === 'uv')) ng.deleteAttribute(k);
  ng.morphAttributes = {}; ng.clearGroups();
  if (!ng.attributes.normal) ng.computeVertexNormals();
  ng.applyMatrix4(m);
  if (m.determinant() < 0) {
    for (const name of Object.keys(ng.attributes)) {
      const a = ng.attributes[name] as THREE.BufferAttribute, n = a.itemSize, arr = a.array as Float32Array;
      for (let i = 0; i + 2 < a.count; i += 3) for (let k = 0; k < n; k++) { const t = arr[(i + 1) * n + k]; arr[(i + 1) * n + k] = arr[(i + 2) * n + k]; arr[(i + 2) * n + k] = t; }
    }
  }
  return ng;
}

export interface Baked { skinned: THREE.SkinnedMesh[]; meshes: THREE.Mesh[] }

/**
 * Merge the parts of `root` into skinned meshes driven by `joints`. A part belongs to a joint when it IS the joint
 * (it is then hidden, and keeps transforming its children) or is a direct child of one. Call once, in the rest pose,
 * before the model has been rendered. Returns every mesh that still draws (for hit-flash tinting).
 */
export function bakeSkinned(root: THREE.Object3D, joints: THREE.Object3D[], margin = 0.3): Baked {
  root.updateMatrixWorld(true);
  const rootInv = root.matrixWorld.clone().invert();
  const index = new Map<THREE.Object3D, number>(); joints.forEach((j, i) => index.set(j, i));
  const parts: THREE.Mesh[] = [];
  root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !(m as THREE.InstancedMesh).isInstancedMesh) parts.push(m); });
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; src: THREE.MeshStandardMaterial; shadow: boolean }>();
  const left: THREE.Mesh[] = [];
  const toRoot = new THREE.Matrix4();
  for (const m of parts) {
    const owner = index.has(m) ? m : m.parent && index.has(m.parent) ? m.parent : null;
    const key = owner && m.visible && !Array.isArray(m.material) && !m.name ? plainKey(m.material as THREE.Material) : null;
    if (!owner || key === null) { left.push(m); continue; }
    const k = key + (m.castShadow ? '|s' : '|-');
    toRoot.multiplyMatrices(rootInv, m.matrixWorld);
    const g = flatCopy(m.geometry, toRoot);
    const n = g.attributes.position.count, c = (m.material as THREE.MeshStandardMaterial).color, bone = index.get(owner)!;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; si[i * 4] = bone; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    let b = buckets.get(k); if (!b) { b = { geos: [], src: m.material as THREE.MeshStandardMaterial, shadow: m.castShadow }; buckets.set(k, b); }
    b.geos.push(g);
    if (m === owner) m.visible = false; else m.removeFromParent();
  }
  const skinned: THREE.SkinnedMesh[] = [];
  if (buckets.size) {
    const inverses = joints.map(j => new THREE.Matrix4().multiplyMatrices(rootInv, j.matrixWorld).invert());
    const skeleton = new THREE.Skeleton(joints as THREE.Bone[], inverses);
    for (const b of buckets.values()) {
      const geo = mergeGeometries(b.geos, false); b.geos.forEach(g => g.dispose());
      if (!geo) continue;
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: b.src.roughness, metalness: b.src.metalness, flatShading: b.src.flatShading, fog: b.src.fog });
      const sm = new THREE.SkinnedMesh(geo, mat); sm.name = 'baked'; sm.castShadow = b.shadow;
      // cull with the rest-pose bounds plus a margin, so poses (arms up, lying down) stay inside
      geo.computeBoundingSphere(); const bs = geo.boundingSphere!.clone(); bs.radius = bs.radius * 1.25 + margin; sm.boundingSphere = bs;
      root.add(sm); sm.bind(skeleton, IDENTITY);
      skinned.push(sm);
    }
  }
  // the special parts: merge those sharing a material on the same joint (glowing eyes, a crown's points)
  const groups = new Map<string, THREE.Mesh[]>();
  const meshes: THREE.Mesh[] = [...skinned];
  for (const m of left) {
    const ok = m.parent && m.visible && !m.name && !m.children.length && !index.has(m) && !Array.isArray(m.material) && !(m.material as THREE.MeshStandardMaterial).map;
    if (!ok) { meshes.push(m); continue; }
    const k = `${m.parent!.uuid}|${(m.material as THREE.Material).uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}`;
    let l = groups.get(k); if (!l) { l = []; groups.set(k, l); } l.push(m);
  }
  for (const l of groups.values()) {
    if (l.length < 2) { meshes.push(...l); continue; }
    const geos = l.map(m => { m.updateMatrix(); return flatCopy(m.geometry, m.matrix); });
    const geo = mergeGeometries(geos, false); geos.forEach(g => g.dispose());
    if (!geo) { meshes.push(...l); continue; }
    const nm = new THREE.Mesh(geo, l[0].material); nm.castShadow = l[0].castShadow; nm.receiveShadow = l[0].receiveShadow; nm.renderOrder = l[0].renderOrder;
    l[0].parent!.add(nm); l.forEach(m => m.removeFromParent());
    meshes.push(nm);
  }
  return { skinned, meshes };
}
