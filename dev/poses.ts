import * as THREE from 'three';
import { Humanoid, Hound, clip, layered, makeCarbine, makeStaff, makeClub, type ClipName } from '../src/render/rig';
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true });
r.shadowMap.enabled = true;
const sc = new THREE.Scene(); sc.background = new THREE.Color(0x9fb4c7);
sc.add(new THREE.HemisphereLight(0xffffff, 0x445533, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(5, 10, 6); sun.castShadow = true; sun.shadow.camera.left = -15; sun.shadow.camera.right = 15; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10; sc.add(sun);
const g = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x6f8a4a })); g.rotation.x = -Math.PI / 2; g.receiveShadow = true; sc.add(g);
const cam = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 100); cam.position.set(0, 6, 17); cam.lookAt(0, 0.8, 0);
const clips: [ClipName, number, any?][] = [['idle', 0.5], ['walk', 0.3], ['run', 0.2], ['jump', 0], ['interact', 0.45], ['eat', 0.3], ['wash', 0.2], ['sit', 0], ['write', 0.3], ['sleep', 0], ['aim', 0], ['reload', 0.7], ['cast', 0.2], ['windup', 0.5], ['melee', 0.15], ['hit', 0.05], ['die', 1.2], ['float', 0.3]];
const look = { skin: 0xd9a77a, shirt: 0x6f7f5a, pants: 0x4a3b2c, coat: 0x3d4f63, hair: 0x2b1d14, boots: 0x2a2018, hat: null as any };
clips.forEach(([c, t], i) => {
  const isShade = c === 'float';
  const h = new Humanoid(isShade ? { skin: 0x9a9ab8, shirt: 0x2a2440, pants: 0x2a2440, coat: 0x2a2440, boots: 0x111111, hat: 'hood', robe: true, glowEyes: 0xb48cff } : c === 'windup' || c === 'melee' ? { skin: 0xc58c64, shirt: 0x7a3b2b, pants: 0x3b3328, boots: 0x221a12, hair: 0x111111, hat: 'cap', bulk: 1.15 } : look);
  const col = i % 6, row = Math.floor(i / 6);
  h.root.position.set((col - 2.5) * 2.6, 0, (row - 1) * 2.8);
  h.root.rotation.y = Math.PI * 0.8;
  if (['aim', 'reload'].includes(c)) { const cb = makeCarbine(); cb.rotation.set(Math.PI / 2, 0, 0); h.handRSlot.add(cb); }
  if (['cast', 'idle', 'walk'].includes(c)) { const st = makeStaff(); st.rotation.x = Math.PI / 2 * 0; h.handRSlot.add(st); }
  if (['windup', 'melee'].includes(c)) h.handRSlot.add(makeClub());
  const legs = clip(['aim','reload','cast'].includes(c) ? 'idle' : c, t, 1.5);
  const p = ['aim', 'reload', 'cast'].includes(c) ? layered(legs, clip(c, t)) : legs;
  for (let k = 0; k < 60; k++) h.apply(p, 0.1);
  sc.add(h.root);
});
const hd = new Hound(); hd.root.position.set(6.5, 0, 3); hd.root.rotation.y = 2.4; hd.animate('run', 0.3); sc.add(hd.root);
const hd2 = new Hound(); hd2.root.position.set(4.5, 0, 4.5); hd2.root.rotation.y = 2.4; hd2.animate('windup', 0.5); sc.add(hd2.root);
r.render(sc, cam);
(window as any).done = true;
