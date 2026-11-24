import * as THREE from 'three';
import { Humanoid, clip, layered, makeRevolver, pistolPose } from '../src/render/rig';
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9fb4c7); sc.add(new THREE.HemisphereLight(0xffffff, 0x445533, 2.2));
const cam = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100); cam.position.set(5.5, 1.6, 2.2); cam.lookAt(0, 1.3, 0.2);
const rots: [number, number, number][] = [[-Math.PI / 2, 0, 0], [Math.PI / 2, Math.PI, 0], [-Math.PI / 2, Math.PI, Math.PI]];
rots.forEach((rv, i) => {
  const h = new Humanoid({ skin: 0xd9a77a, shirt: 0x6f7f5a, pants: 0x4a3b2c, coat: 0x3d4f63, boots: 0x2a2018 });
  const g = makeRevolver(); g.rotation.set(...rv); h.handRSlot.add(g);
  h.root.position.set(0, 0, (i - 1) * 1.7); for (let k = 0; k < 60; k++) h.apply(layered(clip('idle', 0), pistolPose('aim', 0)), 0.1); sc.add(h.root);
});
r.render(sc, cam); (window as any).done = true;
