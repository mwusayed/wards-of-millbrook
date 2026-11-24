// The map (M): two sheets drawn from the same data the world is built from. "Millbrook and the Vale" is
// the close-up of home; "The Eastern Reach" shows everything from Millbrook to Ashford and Copper Hollow.
// Your position, quest and notice markers, and walking to places you have already found.
import { escapeHtml } from './hud';

export interface MapMark { x: number; z: number; label: string; color: string; shape?: 'dot' | 'diamond' | 'square' | 'tri' }
export interface MapTravel { id: string; label: string; minutes: number }
export interface MapFeatures { roads: [number, number][][]; trails: [number, number][][]; water: [number, number, number, number][]; forest: [number, number, number, number][]; fields: [number, number, number, number][]; walls: [number, number, number, number][]; hills: [number, number, number, number][] }
export interface MapData {
  buildings: { name: string; minX: number; maxX: number; minZ: number; maxZ: number }[];
  marks: MapMark[]; player: { x: number; z: number; yaw: number };
  travel: MapTravel[]; travelNote: string; header: string;
  features?: MapFeatures; view?: MapView; reachKnown?: boolean;
  /** v0.8: the Westmarch sheet. */
  west?: MapFeatures & { barrows: [number, number, number][] }; westKnown?: boolean; westGateOpen?: boolean;
  /** v0.9: the Saltway Coast sheet. */
  coast?: MapFeatures & { flats: [number, number, number, number] }; coastKnown?: boolean; gapOpen?: boolean; lowTideIn?: number;
}
export type MapView = 'local' | 'reach' | 'west' | 'coast';
type Open = (html: string, mount?: (root: HTMLElement, close: () => void) => void, onClose?: () => void) => void;

const VIEWS = { local: { minX: -70, maxX: 70, minZ: -36, maxZ: 140 }, reach: { minX: -70, maxX: 314, minZ: -132, maxZ: 154 }, west: { minX: -352, maxX: -30, minZ: -132, maxZ: 154 }, coast: { minX: -130, maxX: 190, minZ: 96, maxZ: 420 } };
const SHORT: [RegExp, string][] = [[/Chapel of the Quiet Flame/, 'Chapel'], [/The Gilded Tankard/, 'Tankard'], [/Dorran's smithy/, 'Smithy'], [/Widow Cael's house/, ''], [/Bram's bakery/, 'Bakery'], [/Sera's store/, 'Store'], [/^Ashford house$/, ''], [/Mother Ilse's apothecary/, 'Apothecary'], [/Tamsin Reed's curios/, 'Curios'], [/Hale & Daughter, gunsmiths/, 'Gunsmith'], [/The Drowned Lantern/, 'Inn'], [/Shrine of the Quiet Flame/, 'Shrine'], [/The Wardens' Lodge/, 'Lodge'], [/Ashford bathhouse/, 'Baths'], [/Varley farmhouse/, 'Farm'], [/Varley barn/, ''], [/Woodcutters' hut/, ''], [/Winding house/, '']];

export function openMap(openModal: Open, d: MapData, onTravel: (id: string) => void, onClose: () => void) {
  let view: MapView = d.view ?? 'local';
  openModal('', (root, close) => {
    const draw = () => {
      const V = VIEWS[view], W = 640, H = Math.round(W * (V.maxZ - V.minZ) / (V.maxX - V.minX));
      root.innerHTML = `<h2>Map</h2><p class="sub">${escapeHtml(d.header)}</p>
        ${d.reachKnown || d.westKnown || d.coastKnown ? `<p><button class="btn ${view === 'local' ? 'primary' : ''}" data-view="local">Millbrook and the Vale</button>${d.reachKnown ? `<button class="btn ${view === 'reach' ? 'primary' : ''}" data-view="reach">The Eastern Reach</button>` : ''}${d.westKnown ? `<button class="btn ${view === 'west' ? 'primary' : ''}" data-view="west">The Westmarch</button>` : ''}${d.coastKnown ? `<button class="btn ${view === 'coast' ? 'primary' : ''}" data-view="coast">The Saltway Coast</button>` : ''}</p>` : ''}
        ${view === 'coast' && d.lowTideIn !== undefined ? `<p class="sub">${d.lowTideIn === 0 ? 'The tide is out: the flats and the wreck can be walked now.' : `Next low water in about ${d.lowTideIn >= 90 ? Math.round(d.lowTideIn / 6) / 10 + ' h' : d.lowTideIn + ' min'} (the spyglass and the tide board).`}</p>` : ''}
        <canvas id="mapc" width="${W}" height="${H}" style="width:100%;max-height:50vh;object-fit:contain;border-radius:6px;background:#2b2a1f;display:block"></canvas>
        <div class="card"><h3>Walk to a place you know</h3><p style="color:var(--muted)">${escapeHtml(d.travelNote)}</p><p>${d.travel.map(t => `<button class="btn" data-go="${t.id}">${escapeHtml(t.label)} · ${t.minutes >= 90 ? Math.round(t.minutes / 6) / 10 + ' h' : t.minutes + ' min'}</button>`).join('') || '<span style="color:var(--muted)">Nowhere yet. Waystone cairns and places you reach on foot appear here.</span>'}</p></div>
        <p><button class="btn primary" data-close>Close</button></p>`;
      const sx = (x: number) => ((x - V.minX) / (V.maxX - V.minX)) * W, sz = (z: number) => ((z - V.minZ) / (V.maxZ - V.minZ)) * H;
      const c = (root.querySelector('#mapc') as HTMLCanvasElement).getContext('2d')!;
      const rect = (r: [number, number, number, number], fill: string) => { c.fillStyle = fill; c.fillRect(sx(r[0]), sz(r[1]), sx(r[2]) - sx(r[0]), sz(r[3]) - sz(r[1])); };
      const line = (pts: [number, number][], color: string, width: number, dash: number[] = []) => { c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash); c.beginPath(); pts.forEach(([x, z], i) => i ? c.lineTo(sx(x), sz(z)) : c.moveTo(sx(x), sz(z))); c.stroke(); c.setLineDash([]); };
      c.fillStyle = '#3d4a2c'; c.fillRect(0, 0, W, H);
      const f = view === 'west' ? d.west : view === 'coast' ? d.coast : d.features;
      if (view === 'west' && d.west) { for (const r of d.west.hills) rect(r, '#4f5a3a'); for (const r of d.west.forest) rect(r, '#2c3d22'); for (const r of d.west.fields) rect(r, '#6a6038'); c.fillStyle = 'rgba(110,60,100,.18)'; c.fillRect(sx(-238), sz(-14), sx(-64) - sx(-238), sz(150) - sz(-14)); }
      if (view === 'coast' && d.coast) { for (const r of d.coast.hills) rect(r, '#4f5a3a'); rect(d.coast.flats, '#a8966e'); }
      if (f && view === 'reach') {
        for (const r of f.hills) rect(r, '#5a5040');
        for (const r of f.forest) rect(r, '#2c3d22');
        for (const r of f.fields) rect(r, '#6a6038');
      }
      // Millbrook inside its palisade, with its two gates
      rect([-42, -26, 42, 32], '#56603a');
      c.strokeStyle = '#2a1f14'; c.lineWidth = view === 'reach' ? 2 : 3; c.strokeRect(sx(-42), sz(-26), sx(42) - sx(-42), sz(32) - sz(-26));
      c.strokeStyle = '#56603a'; c.lineWidth = 5; c.beginPath(); c.moveTo(sx(-3), sz(32)); c.lineTo(sx(3), sz(32)); c.moveTo(sx(42), sz(1.8)); c.lineTo(sx(42), sz(7.2)); if (d.westGateOpen) { c.moveTo(sx(-42), sz(1.8)); c.lineTo(sx(-42), sz(7.2)); } c.stroke();
      if (f) {
        for (const r of f.water) rect(r, '#35647f');
        for (const r of f.walls) { rect(r, '#6a6a4a'); c.strokeStyle = '#2a1f14'; c.lineWidth = 2; c.strokeRect(sx(r[0]), sz(r[1]), sx(r[2]) - sx(r[0]), sz(r[3]) - sz(r[1])); }
        for (const p of f.roads) line(p, '#8a7a5a', view === 'reach' ? 2.5 : 3);
        for (const p of f.trails) line(p, '#8a7a5a', 1.5, [4, 4]);
      }
      if (view === 'west' && d.west) for (const [x, z, r] of d.west.barrows) { c.fillStyle = '#6a7a48'; c.strokeStyle = '#2a2a1a'; c.lineWidth = 1; c.beginPath(); c.arc(sx(x), sz(z), Math.max(3, (sx(x + r) - sx(x)) * 0.8), 0, 6.3); c.fill(); c.stroke(); }
      // roads of Millbrook and the Vale
      line([[0, 0], [0, 33], [0, 60], [-28, 72]], '#8a7a5a', 3); line([[0, 60], [26, 84]], '#8a7a5a', 3); line([[0, 60], [0, 114]], '#8a7a5a', 3); line([[-20, -6], [0, 0], [12, -9]], '#8a7a5a', 3);
      line([[2, 116], [44, 121]], '#8a7a5a', 2, [4, 5]); line([[30, 88], [50, 93]], '#8a7a5a', 2, [4, 5]);
      // buildings
      c.font = view === 'reach' ? '9px system-ui' : '11px system-ui'; c.textAlign = 'center';
      for (const b of d.buildings) { if (b.maxX < V.minX || b.minX > V.maxX || b.maxZ < V.minZ || b.minZ > V.maxZ) continue; c.fillStyle = '#b9ab8a'; c.fillRect(sx(b.minX), sz(b.minZ), Math.max(2, sx(b.maxX) - sx(b.minX)), Math.max(2, sz(b.maxZ) - sz(b.minZ))); c.strokeStyle = '#3a2f22'; c.lineWidth = 1; c.strokeRect(sx(b.minX), sz(b.minZ), sx(b.maxX) - sx(b.minX), sz(b.maxZ) - sz(b.minZ)); }
      if (view === 'local') { c.fillStyle = '#1c1812'; for (const b of d.buildings) { if (b.minX > 70) continue; let short = b.name; for (const [re, s] of SHORT) short = short.replace(re, s); if (short) c.fillText(short, (sx(b.minX) + sx(b.maxX)) / 2, (sz(b.minZ) + sz(b.maxZ)) / 2 + 4); } }
      else {
        const big = (x: number, z: number, t: string) => { c.font = '700 13px Georgia,serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.7)'; c.strokeText(t, sx(x), sz(z)); c.fillStyle = '#f4ecd8'; c.fillText(t, sx(x), sz(z)); };
        if (view === 'coast') { big(0, 104, 'the Vale'); big(84, 330, 'GULLHAVEN'); big(-14, 380, 'the flats'); big(-96, 352, 'Wreckers\' Cove'); big(64, 236, 'Gull Tower'); big(30, 196, 'the Saltway'); big(150, 410, 'lighthouse'); big(2, 160, d.gapOpen ? 'Salt Gap' : 'Salt Gap (blocked)'); }
        else if (view === 'west') { big(0, -32, 'MILLBROOK'); big(-270, -26, 'FERNHOLLOW'); big(-326, 80, 'Lake Hallow'); big(-192, -118, 'the Barrow Downs'); big(-150, 64, 'the Heath'); big(-276, 136, 'reed marsh'); big(-104, -58, 'Smeaths\' clamp'); }
        else { big(0, -32, 'MILLBROOK'); big(0, 100, 'the Vale'); big(266, -38, 'ASHFORD'); big(168, -104, 'Thornwood'); big(108, 50, 'Brookfield'); big(209, 140, 'R. Wend'); big(262, -136 + 18, 'Copper Hollow'); }
      }
      // marks
      for (const m of d.marks) {
        if (m.x < V.minX || m.x > V.maxX || m.z < V.minZ || m.z > V.maxZ) continue;
        const x = sx(m.x), y = sz(m.z); c.fillStyle = m.color; c.strokeStyle = '#111'; c.lineWidth = 1.5; c.beginPath();
        if (m.shape === 'diamond') { c.moveTo(x, y - 8); c.lineTo(x + 7, y); c.lineTo(x, y + 8); c.lineTo(x - 7, y); c.closePath(); }
        else if (m.shape === 'square') c.rect(x - 5, y - 5, 10, 10);
        else if (m.shape === 'tri') { c.moveTo(x, y - 7); c.lineTo(x + 7, y + 6); c.lineTo(x - 7, y + 6); c.closePath(); }
        else c.arc(x, y, 4.5, 0, 6.3);
        c.fill(); c.stroke();
        if (m.label) { c.font = '12px system-ui'; c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.75)'; c.strokeText(m.label, x, y - 11); c.fillStyle = '#f4ecd8'; c.fillText(m.label, x, y - 11); }
      }
      // you
      const px = sx(d.player.x), py = sz(d.player.z), fx = -Math.sin(d.player.yaw), fz = -Math.cos(d.player.yaw);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(px + fx * 11, py + fz * 11); c.lineTo(px - fz * 6 - fx * 5, py + fx * 6 - fz * 5); c.lineTo(px + fz * 6 - fx * 5, py - fx * 6 - fz * 5); c.closePath(); c.fill(); c.stroke();
      // compass rose
      c.fillStyle = '#f4ecd8'; c.font = '700 13px Georgia,serif'; c.fillText('N', W - 22, 20); c.fillText('S', W - 22, 52); c.beginPath(); c.moveTo(W - 22, 24); c.lineTo(W - 22, 40); c.strokeStyle = '#f4ecd8'; c.lineWidth = 1.5; c.stroke();
      root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { close(); onTravel((b as HTMLElement).dataset.go!); }));
      root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { view = (b as HTMLElement).dataset.view as MapView; draw(); }));
      root.querySelector('[data-close]')!.addEventListener('click', () => close());
    };
    draw();
  }, onClose);
}
