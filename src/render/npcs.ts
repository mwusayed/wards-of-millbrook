// Millbrook townsfolk (names from Project Archmage / Ledger & Ward). Simple daily routes.
import * as THREE from 'three';
import { Humanoid, clip, gaitPose, makeLoaf, makeTool, type ClipName, type Look } from './rig';
import { collide, type Box } from './world';
import { EAST_NPCS } from './npcs_east';
import { WEST_NPCS } from './npcs_west';
import { SOUTH_NPCS } from './npcs_south';

export interface Stop { x: number; z: number; from: number; to: number; clip: ClipName; face?: number; via?: [number, number][] }
export type PropKind = 'broom' | 'rod' | 'pick' | 'axe' | 'lute' | 'mug' | 'hammer' | 'spoon' | 'shovel' | 'rake' | 'staff';
export interface NpcDef { id: string; name: string; look: Look; stops: Stop[]; lines: string[]; faction?: string; about?: { vale: string; tip: string }; fidgets?: ClipName[]; prop?: PropKind; speed?: number; region?: 'west' | 'east' | 'march' | 'coast' }

export const NPCS: NpcDef[] = [
  { id: 'bram', name: 'Bram Thatch, baker', look: { skin: 0xe0b08a, shirt: 0xe8e0cc, pants: 0x5a4a38, boots: 0x3a2a1c, hair: 0xc9a46a, bulk: 1.25 },
    stops: [{ x: -7, z: 6.4, from: 6, to: 20, clip: 'idle', face: Math.PI }, { x: 16, z: 13.8, from: 20, to: 30, clip: 'idle' }],
    lines: ['"You can\'t fight shadows on an empty stomach. Loaf\'s four crowns."', '"Rations keep a week. Bread keeps a day. Your stomach keeps nothing."', '"Saw you limping yesterday. Eat something with salt in it."'] },
  { id: 'sera', name: 'Sera Vint, store owner', look: { skin: 0xc58c64, shirt: 0x3f5f4a, pants: 0x3a3028, boots: 0x2a2018, hair: 0x2a1a10, hat: null },
    stops: [{ x: -6, z: 2.6, from: 7, to: 11, clip: 'idle', face: 0 }, { x: 2, z: 3, from: 11, to: 13, clip: 'idle' }, { x: -5, z: 2.4, from: 13, to: 19, clip: 'idle', face: 0 }, { x: -26, z: 11, from: 19, to: 31, clip: 'idle' }],
    lines: ['"I don\'t haggle. I survive. You want the bandages or not?"', '"Cartridges are dear since the road closed. Blame the raiders."'] },
  { id: 'brannic', name: 'Brannic, keeper of the town ledger', look: { skin: 0xd9a77a, shirt: 0x4a4a5a, pants: 0x2f2f38, coat: 0x2f3f5a, boots: 0x1a1a1a, hair: 0x9a9a9a, hat: 'wide' },
    stops: [{ x: 9.2, z: -11, from: 8, to: 17, clip: 'write', face: -Math.PI / 2 }, { x: 13, z: -2, from: 17, to: 32, clip: 'idle' }],
    lines: ['"Debits on the left, credits on the right, and no blood on either."', '"A clerk who balances is worth two who are fast."'] },
  { id: 'tolan', name: 'Tolan, Aldric\'s clerk', look: { skin: 0xd9b090, shirt: 0x5a2f5a, pants: 0x2a2030, coat: 0x4a2a5a, boots: 0x1a1a1a, hair: 0x3a2a1a },
    stops: [{ x: 18.6, z: -10, from: 7, to: 19, clip: 'idle', face: Math.PI / 2 }, { x: 18.6, z: -10, from: 19, to: 31, clip: 'idle', face: Math.PI / 2 }],
    lines: ['"Master Voss asks after his three hundred crowns. Daily."', '"Sixty a week. The book does not care about your week."'] },
  { id: 'vole', name: 'Sergeant Vole, South Gate', look: { skin: 0xc58c64, shirt: 0x6a6a6a, pants: 0x3a3a40, coat: 0x2f4f7d, boots: 0x1a1a1a, hat: 'cap' },
    stops: [{ x: -1.8, z: 30.5, from: 0, to: 32, clip: 'idle', face: Math.PI }],
    lines: ['"Captain Renn says the Vale\'s quiet tonight. Quiet\'s worse than screaming."', '"Hounds by the mill, raiders by the ford, and something worse at the stones."'] },
  { id: 'petch', name: 'Old Petch', look: { skin: 0xd0a080, shirt: 0x6a5a4a, pants: 0x4a3a2a, boots: 0x2a1a10, hair: 0xdddddd, scale: 0.95 },
    stops: [{ x: -3, z: 8.6, from: 8, to: 18, clip: 'sit', face: Math.PI }, { x: -16, z: 7, from: 18, to: 32, clip: 'idle' }],
    lines: ['"They sealed the West Gate for a reason, lad. Some doors are mercy."', '"Pay the Tower what you owe. The Tower remembers."'] },
  // ---- pass 4: the rest of Ledger & Ward's Millbrook ----
  { id: 'maren', name: 'Maren Soloway, priestess of the Quiet Flame', faction: 'chapel', look: { skin: 0xc9a07a, shirt: 0xe9e2d0, pants: 0xe9e2d0, coat: 0xd8cdb4, boots: 0x3a2a1c, hair: 0x5a3a22, robe: true },
    stops: [{ x: -14.5, z: -19.7, from: 0, to: 32, clip: 'idle', face: Math.PI }],
    lines: ['"The Flame asks nothing. I ask that you wipe your boots."', '"A wound closed late is a scar. A fear closed late is worse. Come before it sets."', '"Ysolde lit a candle here every week. For whom, she never said."'],
    about: { vale: '"The pilgrim road ran north-east once, to a chapel by the water. Then the water rose. We do not speak of what stayed."', tip: '"Bandages close skin. They do nothing for the hands that shake afterwards. I can help with those too."' } },
  { id: 'dorran', name: 'Dorran Kade, blacksmith', faction: 'town', look: { skin: 0xb07a52, shirt: 0x5a4a3a, pants: 0x2f2a24, coat: 0x3a2f28, boots: 0x1a1410, hair: 0x1a1410, bulk: 1.35, scale: 1.04 },
    stops: [{ x: 26.2, z: 17.6, from: 7, to: 18, clip: 'hammer', face: -Math.PI / 2 }, { x: 26.6, z: 15, from: 18, to: 31, clip: 'idle', face: Math.PI / 2 }],
    lines: ['"Iron doesn\'t care who holds it. I do. Keep that revolver oiled."', '"A fouled barrel throws wide, then it doesn\'t throw at all. Three crowns and I\'ll clean it."', '"Your aunt paid for a staff-shoe she never collected. It\'s yours if you want the work done."'],
    about: { vale: '"Raider steel is pot-metal. Their tags are better iron than their knives; the Watch pays for those."', tip: '"A rifled barrel hits harder. A speed loader keeps you alive. Buy the loader first."' } },
  { id: 'tomlin', name: 'Tomlin Wren, innkeeper of the Gilded Tankard', faction: 'town', look: { skin: 0xe0b08a, shirt: 0x7a5a3a, pants: 0x3a3028, coat: 0x8a3a2a, boots: 0x2a2018, hair: 0x7a5a3a, bulk: 1.3 },
    stops: [{ x: -16, z: 13.4, from: 0, to: 32, clip: 'idle', face: 0 }],
    lines: ['"Pot pie\'s hot, ale\'s cold, dice are honest. Two of those are true every night."', '"I hear everything in this room. Buy a drink and I might repeat some of it."', '"No blades on the table, no magic near the barrels."'],
    about: { vale: '"Travellers used to come up that road with stories. Now they come with bandages, or they don\'t come."', tip: '"A hot meal sits better than cold bread before a long walk. Six crowns. I\'m not being kind, I\'m being a businessman."' } },
  { id: 'fenn', name: 'Fenn Marlow, hunter', faction: 'town', look: { skin: 0xc08a62, shirt: 0x4f5f3a, pants: 0x4a3b2c, coat: 0x5a4a30, boots: 0x2a2018, hair: 0x6a4a2a, hat: 'cap' },
    stops: [{ x: -18.6, z: 10.4, from: 0, to: 32, clip: 'sit', face: -Math.PI / 2 }],
    lines: ['"Used to be you could walk to the Stones and back with a brace of rabbits. Used to be."', '"Hounds hunt by sound first. Walk, don\'t run, and they find you later."'],
    about: { vale: '"Hounds den by the mill wheel. Raiders keep to the ford. Shades stay at the Stones until dark, then they wander."', tip: '"Aim for the hound in front. The second one always waits to see how the first one does."' } },
  { id: 'noname', name: 'A man with no name', faction: 'ashRoad', look: { skin: 0x9a7a5a, shirt: 0x2a2a2a, pants: 0x1f1f1f, coat: 0x2a2420, boots: 0x111111, hat: 'hood' },
    stops: [{ x: -13.4, z: 10.4, from: 16, to: 30, clip: 'idle', face: Math.PI / 2 }, { x: -13.4, z: 10.4, from: 0, to: 6, clip: 'idle', face: Math.PI / 2 }, { x: -40.2, z: 30.2, from: 6, to: 16, clip: 'idle' }],
    lines: ['"I sell what the Watch counts and the Tower taxes. Cheaper, for people I like."', '"Names are for people who intend to be found."'],
    about: { vale: '"There are older roads through the Vale than the pilgrim road. Ash Road people use them. You don\'t, yet."', tip: '"Sera pays five for a pelt. I pay seven and don\'t ask whose hound it was."' } },
  { id: 'renn', name: 'Captain Ilsa Renn of the Watch', faction: 'watch', look: { skin: 0xc58c64, shirt: 0x6a6a6a, pants: 0x2f3a4a, coat: 0x2f4f7d, boots: 0x1a1a1a, hair: 0x8a2a1a, hat: 'cap', scale: 1.03 },
    stops: [{ x: 2.2, z: 29.6, from: 6, to: 10, clip: 'idle', face: Math.PI }, { x: 6, z: -1, from: 10, to: 14, clip: 'idle' }, { x: 2.2, z: 29.6, from: 14, to: 30, clip: 'idle', face: Math.PI }],
    lines: ['"Six guards, one sergeant, one gate. Do the sum."', '"I don\'t care what you owe the Tower. I care which way your gun points."', '"Bring me tags, not stories."'],
    about: { vale: '"We hold the gate. Everything past the tree line belongs to whoever is meanest that night."', tip: '"Sweeps keep the road open. Every one you finish, my people sleep an hour longer."' } },
  { id: 'lira', name: 'Lira Voss, scholar of the Spire', faction: 'tower', look: { skin: 0xd9b090, shirt: 0x3a4a6a, pants: 0x2a3040, coat: 0x4a5a8a, boots: 0x1a1a1a, hair: 0x1a1410, robe: true, scale: 0.98 },
    stops: [{ x: -31.6, z: 22, from: 7, to: 20, clip: 'idle', face: -Math.PI / 2 }, { x: -32.4, z: 23.2, from: 20, to: 31, clip: 'idle', face: -Math.PI / 2 }],
    lines: ['"My uncle counts crowns because he cannot count on anything else. That is not an excuse. It is a diagnosis."', '"A spell is a debt too. You borrow from your own body and it always collects."', '"Ysolde taught me my first cantrip. She said never to tell Uncle Aldric. I never have."'],
    about: { vale: '"The waystone cairns are older than the wards. They remember where things are. You only have to ask them properly."', tip: '"Mana follows water. Drink before you cast, not after you fall over."' } },
  { id: 'aldric', name: 'Aldric Voss, Town Mage', faction: 'tower', look: { skin: 0xcfa98a, shirt: 0x2a2a3a, pants: 0x1f1f2a, coat: 0x3a2a5a, boots: 0x111111, hair: 0xcfcfcf, robe: true, scale: 1.06 },
    stops: [{ x: -31.4, z: 24.6, from: 0, to: 32, clip: 'idle', face: -Math.PI / 2 }],
    lines: ['"I held this valley together with ledgers. Do not look at me as if that were the easy way."', '"Your aunt argued with me every week for twenty years. I find I miss it."'],
    about: { vale: '"The dark out there is not evil. It is merely patient, which is worse."', tip: '"Pay what you owe. Then nobody owns any part of what you do next."' } },
  { id: 'pip', name: 'Pip', faction: 'town', look: { skin: 0xd9a77a, shirt: 0x7a6a4a, pants: 0x4a3b2c, boots: 0x2a2018, hair: 0x8a5a2a, scale: 0.72 },
    stops: [{ x: 3.5, z: 4.5, from: 7, to: 11, clip: 'idle' }, { x: -4.5, z: -3, from: 11, to: 15, clip: 'idle' }, { x: 7, z: 8.4, from: 15, to: 20, clip: 'idle' }, { x: -11.6, z: 16.5, from: 20, to: 31, clip: 'idle' }],
    lines: ['"I saw you come back from the Vale. You walk different after."', '"Bram drops a loaf every morning by accident. Every morning. Funny, that."', '"I know where the palisade has a loose post. I\'m not telling."'],
    about: { vale: '"I\'m not allowed. I went anyway, once, as far as the first cairn. Something breathed at me."', tip: '"If you\'re hungry and skint, stand near Bram and look sad. Works for me."' } },
  { id: 'yara', name: 'Yara Fen, herbalist', faction: 'chapel', look: { skin: 0xb8865a, shirt: 0x4a6a3a, pants: 0x3a3a2a, coat: 0x5a7a4a, boots: 0x2a2018, hair: 0x2a1a10 },
    stops: [{ x: -9.4, z: -15.4, from: 6, to: 12, clip: 'idle', face: 0 }, { x: -9.2, z: 3.4, from: 12, to: 18, clip: 'idle', face: 0 }, { x: -9.4, z: -15.4, from: 18, to: 30, clip: 'idle' }],
    lines: ['"Vale herbs grow where the old stones are. So do worse things. Pick quickly."', '"Tea before spellwork, child. Your aunt drank it by the pot."', '"Moonpetal sulks all day and opens at night. Like my first husband."'],
    about: { vale: '"Herbs by every cairn, and thick around the Whisper Stones. Moonpetal too, after dark, glowing like it wants to be found."', tip: '"Herb tea clears the head: your mana comes back a third faster. Cheapest magic there is."' } },
  { id: 'cael', name: 'Widow Cael', faction: 'town', look: { skin: 0xd0a888, shirt: 0x3a3a3a, pants: 0x2a2a2a, coat: 0x2f2f2f, boots: 0x1a1a1a, hair: 0xe0e0e0, scale: 0.9, robe: true },
    stops: [{ x: 22.4, z: -2, from: 8, to: 19, clip: 'idle', face: Math.PI / 2 }, { x: 23.2, z: -3.4, from: 19, to: 32, clip: 'idle', face: Math.PI / 2 }],
    lines: ['"Forty years I have watched that gate. It has never once brought me what I was watching for."', '"You have Ysolde\'s way of standing. She was stubborn too."'],
    about: { vale: '"My Harn went out past the Stones the winter the chapel sank. The Vale keeps what it likes."', tip: '"Do not make offerings to old stones, girl or boy or whatever you are. They take, and then they are still stones."' } },
];

// v0.7: the Eastern Reach's people live in npcs_east.ts
NPCS.push(...EAST_NPCS, ...WEST_NPCS, ...SOUTH_NPCS);

const MARK_GEO = new THREE.OctahedronGeometry(0.11, 0), MARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffd24a });
const FIDGET_LEN: Partial<Record<ClipName, number>> = { lookAround: 3.2, stretch: 2.9, scratch: 2.2, crossArms: 7, point: 2.4, bow: 1.4, wave: 1.6 };
const PROP_CLIP: Record<PropKind, ClipName> = { broom: 'sweep', rod: 'fish', pick: 'mine', axe: 'chop', lute: 'lute', mug: 'drinkMug', hammer: 'hammer', spoon: 'stir', shovel: 'shoveling', rake: 'sweep', staff: 'idle' };
const PROP_POSE: Partial<Record<PropKind, [number, number, number]>> = { rake: [0.3, 0, 0], staff: [0.1, 0, 0], broom: [0.3, 0, 0], rod: [0, 0, 0], pick: [Math.PI / 2, 0, 0], axe: [Math.PI / 2, 0, 0], shovel: [0.2, 0, 0], hammer: [Math.PI / 2, 0, 0] };
export class Townsfolk {
  /** World colliders, set once by the game, so people walk around buildings instead of through them. */
  static colliders: Box[] = [];
  root = new THREE.Group();
  h: Humanoid;
  pos = new THREE.Vector3(); yaw = 0; t = Math.random() * 10; lineIdx = 0; talkT = 0;
  /** Hidden by the story (Aldric before the finale, Tolan after his dismissal). */
  present = true;
  mark: THREE.Mesh;
  private fidget: { clip: ClipName; t: number; dur: number } | null = null; private fidgetT = 4 + Math.random() * 10;
  private prop: THREE.Object3D | null = null; private stuckT = 0; private detour = 0;
  private headTarget = new THREE.Vector3();
  /** Doorways and corners to pass on the way to the current stop (Stop.via). */
  private curStop: Stop | null = null; private viaQ: [number, number][] = [];
  constructor(public def: NpcDef) {
    this.h = new Humanoid(def.look); this.root = this.h.root;
    if (def.id === 'bram') this.h.handLSlot.add(makeLoaf());
    if (def.prop) { const pr = makeTool(def.prop); const r = PROP_POSE[def.prop]; if (r) pr.rotation.set(r[0], r[1], r[2]); this.h.handRSlot.add(pr); this.prop = pr; pr.visible = false; }
    const s = def.stops[0]; this.pos.set(s.x, 0, s.z);
    this.mark = new THREE.Mesh(MARK_GEO, MARK_MAT); this.mark.position.y = 2.25 * (def.look.scale ?? 1); this.mark.visible = false; this.root.add(this.mark);
  }
  stopAt(hour: number): Stop {
    const h = hour < 6 ? hour + 24 : hour;
    return this.def.stops.find(s => h >= s.from && h < s.to) ?? this.def.stops[0];
  }
  /** Step toward a point, sliding around walls; tries a few headings when the direct one is blocked. */
  private walk(target: THREE.Vector3, step: number): number | null {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z, base = Math.atan2(dx, dz);
    const tries = this.detour ? [this.detour, 0, -this.detour] : [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9];
    for (const a of tries) {
      const h = base + a, nx = this.pos.x + Math.sin(h) * step, nz = this.pos.z + Math.cos(h) * step;
      const [x, z] = collide(Townsfolk.colliders, nx, nz, 0.3);
      const got = Math.hypot(x - this.pos.x, z - this.pos.z);
      if (got > step * 0.6) { this.pos.x = x; this.pos.z = z; if (a !== 0 && !this.detour) this.detour = a; if (a === 0) this.detour = 0; return h; }
    }
    this.detour = 0; return null;
  }
  update(dt: number, hour: number, player: THREE.Vector3) {
    this.t += dt; this.talkT = Math.max(0, this.talkT - dt);
    const far = Math.abs(player.x - this.pos.x) + Math.abs(player.z - this.pos.z) > 75;
    this.root.visible = this.present && !far;
    if (this.mark.visible) { this.mark.rotation.y = this.t * 2; this.mark.position.y = 2.25 * (this.def.look.scale ?? 1) + Math.sin(this.t * 3) * 0.06; }
    const s = this.stopAt(hour);
    if (s !== this.curStop) { this.curStop = s; this.viaQ = s.via ? s.via.map(v => [v[0], v[1]] as [number, number]) : []; }
    while (this.viaQ.length && Math.hypot(this.viaQ[0][0] - this.pos.x, this.viaQ[0][1] - this.pos.z) < 0.7) this.viaQ.shift();
    const target = this.viaQ.length ? new THREE.Vector3(this.viaQ[0][0], 0, this.viaQ[0][1]) : new THREE.Vector3(s.x, 0, s.z);
    const dist = Math.hypot(target.x - this.pos.x, target.z - this.pos.z);
    let c: ClipName = s.clip; let v = 0;
    const speed = this.def.speed ?? 1.6;
    if (dist > 0.3 || this.viaQ.length) {
      // far from the player nobody watches: move straight, no collision tests
      const step = Math.min(dist, speed * dt);
      let heading: number | null;
      if (far) { const dx = target.x - this.pos.x, dz = target.z - this.pos.z; this.pos.x += dx / dist * step; this.pos.z += dz / dist * step; heading = Math.atan2(dx, dz); }
      else heading = this.walk(target, step);
      if (heading === null) { this.stuckT += dt; if (this.stuckT > 3) { this.pos.x += (target.x - this.pos.x) / dist * step; this.pos.z += (target.z - this.pos.z) / dist * step; } }
      else this.stuckT = 0;
      const want = heading === null ? this.yaw : heading + Math.PI;
      let dl = want - this.yaw; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI; this.yaw += dl * Math.min(1, dt * 7);
      c = 'walk'; v = speed; this.fidget = null;
    } else {
      const near = player.distanceTo(this.pos) < 3.5 && s.clip !== 'write' && s.clip !== 'sit' && s.clip !== 'hammer' && s.clip !== 'sitGround' && s.clip !== 'drinkMug';
      const want = near ? Math.atan2(-(player.x - this.pos.x), -(player.z - this.pos.z)) : s.face ?? this.yaw;
      let dl = want - this.yaw; while (dl > Math.PI) dl -= 2 * Math.PI; while (dl < -Math.PI) dl += 2 * Math.PI; this.yaw += dl * Math.min(1, dt * 3);
      if (this.talkT > 0) { c = this.talkT > 1.2 && this.talkT < 2.4 ? 'wave' : 'talk'; this.fidget = null; }
      else if (s.clip === 'idle') {
        // the occasional fidget: looking around, a stretch, a scratch, arms folded for a while
        this.fidgetT -= dt;
        if (!this.fidget && this.fidgetT <= 0) { const pool = this.def.fidgets ?? ['lookAround', 'stretch', 'scratch', 'crossArms', 'lookAround']; const pick = pool[Math.floor(Math.random() * pool.length)]; this.fidget = { clip: pick, t: 0, dur: FIDGET_LEN[pick] ?? 3 }; }
        if (this.fidget) { this.fidget.t += dt; c = this.fidget.clip; if (this.fidget.t > this.fidget.dur) { this.fidget = null; this.fidgetT = 7 + Math.random() * 12; } }
      }
    }
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    if (far || !this.present) return;
    // heads turn toward you when you are close and in front of them
    const pd = player.distanceTo(this.pos);
    if (pd < 7 && c !== 'sleep') { this.headTarget.set(player.x, player.y + 1.6, player.z); this.h.lookAt = this.headTarget; } else this.h.lookAt = null;
    if (this.prop) this.prop.visible = this.def.prop === 'staff' || c === PROP_CLIP[this.def.prop!] || (c === 'walk' && this.def.prop !== 'mug' && this.def.prop !== 'lute');
    if (c === 'walk') { this.h.stride(dt, v); this.h.apply(gaitPose(this.h.phase, v, false), dt, 12, 'walk'); }
    else this.h.apply(clip(c, this.fidget ? this.fidget.t : this.t, v), dt, 10, c);
  }
  talk(): string { this.talkT = 1.6; const l = this.def.lines[this.lineIdx % this.def.lines.length]; this.lineIdx++; return `${this.def.name}: ${l}`; }
}

// ---------------- v0.9.1: seats and facing ----------------
// Every seated stop gets something to sit on, and NPCs at a table or counter face it, so a seated pose never hangs
// in the air and nobody serves with their back to the counter. Run once after the world is built.
export const SEATED: ClipName[] = ['sit', 'write', 'drinkMug'];
const LOW: ClipName[] = ['mendNet'];
/** Tables, counters, desks and benches: low colliders (between knee and chest height). */
const isFurniture = (b: Box) => b.h >= 0.6 && b.h <= 1.25 && (b.maxX - b.minX) < 7 && (b.maxZ - b.minZ) < 7;
function nearestFurniture(x: number, z: number, within: number): { b: Box; d: number; cx: number; cz: number } | null {
  let best: { b: Box; d: number; cx: number; cz: number } | null = null;
  for (const b of Townsfolk.colliders) {
    if (!isFurniture(b)) continue;
    const px = Math.max(b.minX, Math.min(x, b.maxX)), pz = Math.max(b.minZ, Math.min(z, b.maxZ)), d = Math.hypot(px - x, pz - z);
    if (d < within && (!best || d < best.d)) best = { b, d, cx: px, cz: pz };
  }
  return best;
}
export function alignStops(defs: NpcDef[], seatTaken: (x: number, z: number) => boolean): { x: number; z: number; face: number; h: number }[] {
  const seats: { x: number; z: number; face: number; h: number }[] = [];
  for (const d of defs) for (const s of d.stops) {
    const seated = SEATED.includes(s.clip), low = LOW.includes(s.clip);
    // sitting by a bench: sit ON it, hips over its middle, legs out the open side
    const bench = seated ? Townsfolk.colliders.find(b => b.h >= 0.3 && b.h <= 0.6 && s.x > b.minX - 0.8 && s.x < b.maxX + 0.8 && s.z > b.minZ - 0.8 && s.z < b.maxZ + 0.8 && Math.min(b.maxX - b.minX, b.maxZ - b.minZ) < 1.2) : undefined;
    if (bench) {
      const cx = (bench.minX + bench.maxX) / 2, cz = (bench.minZ + bench.maxZ) / 2, alongX = bench.maxX - bench.minX >= bench.maxZ - bench.minZ;
      // face away from the bench's long side, toward where the NPC was standing
      const f = alongX ? (s.z >= cz ? Math.PI : 0) : (s.x >= cx ? -Math.PI / 2 : Math.PI / 2);
      const hx = alongX ? Math.max(bench.minX + 0.3, Math.min(bench.maxX - 0.3, s.x)) : cx, hz = alongX ? cz : Math.max(bench.minZ + 0.3, Math.min(bench.maxZ - 0.3, s.z));
      const back = 0.06 * (d.look.scale ?? 1);
      s.face = f; s.x = hx - Math.sin(f) * back; s.z = hz - Math.cos(f) * back;
      continue;
    }
    // on a bench: sit ON it (hips over the middle of the seat), facing away from its long side you came from
    if (seated) {
      const bench = Townsfolk.colliders.find(b => b.h >= 0.3 && b.h <= 0.65 && Math.min(b.maxX - b.minX, b.maxZ - b.minZ) <= 0.9 && Math.max(b.maxX - b.minX, b.maxZ - b.minZ) >= 1.2
        && s.x > b.minX - 0.9 && s.x < b.maxX + 0.9 && s.z > b.minZ - 0.9 && s.z < b.maxZ + 0.9);
      if (bench) {
        const cx = (bench.minX + bench.maxX) / 2, cz = (bench.minZ + bench.maxZ) / 2, alongX = bench.maxX - bench.minX > bench.maxZ - bench.minZ, sc = d.look.scale ?? 1;
        if (alongX) { const f = s.z >= cz ? Math.PI : 0; s.face = f; s.x = Math.max(bench.minX + 0.35, Math.min(bench.maxX - 0.35, s.x)); s.z = cz + (f === Math.PI ? 1 : -1) * 0.06 * sc; }
        else { const f = s.x >= cx ? -Math.PI / 2 : Math.PI / 2; s.face = f; s.z = Math.max(bench.minZ + 0.35, Math.min(bench.maxZ - 0.35, s.z)); s.x = cx + (f < 0 ? 1 : -1) * 0.06 * sc; }
        (s as Stop & { onBench?: boolean }).onBench = true; continue;
      }
    }
    const work = seated || ['idle', 'stir', 'write', 'talk', 'crossArms'].includes(s.clip);
    const f = work ? nearestFurniture(s.x, s.z, seated ? 1.3 : 0.9) : null;
    if (f) {
      // face the table or counter (forward is (−sin yaw, −cos yaw)); keep an explicit facing that already looks at it
      const want = Math.atan2(-(f.cx - s.x), -(f.cz - s.z));
      const cur = s.face ?? want, fwdDot = -Math.sin(cur) * (f.cx - s.x) - Math.cos(cur) * (f.cz - s.z);
      if (s.face === undefined || fwdDot < 0) s.face = want;
      // seated at a table: pull up close enough to reach it
      if (seated && f.d > 0.55) { const k = (f.d - 0.5) / f.d; s.x += (f.cx - s.x) * k; s.z += (f.cz - s.z) * k; }
    }
    if ((seated || low) && !seatTaken(s.x, s.z)) {
      const face = s.face ?? 0, back = 0.06 * (d.look.scale ?? 1);
      seats.push({ x: s.x + Math.sin(face) * back, z: s.z + Math.cos(face) * back, face, h: (low ? 0.32 : 0.46) * (d.look.scale ?? 1) });
    }
  }
  return seats;
}
