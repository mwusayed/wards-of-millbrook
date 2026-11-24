// v0.7 panels for the Eastern Reach: traders, the Drowned Lantern, the coach, the bard, and the choice at
// the ward-copper seam. Same conventions as panels.ts (Ctx gives access to the game).
import * as B from '../sim/balance';
import * as G from '../sim/state';
import * as R from '../sim/reach';
import * as T from '../sim/town';
import type { Ctx } from './panels';
import { escapeHtml as esc } from './hud';

const dim = (t: string) => `<span style="color:var(--muted)">${t}</span>`;
const row = (left: string, right: string) => `<div class="row2"><div>${left}</div>${right}</div>`;
const on = (root: HTMLElement, sel: string, fn: (el: HTMLElement) => void) => root.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => fn(b as HTMLElement)));

/** A trader in the Reach: what they sell, gear they stock, and what they buy (wanted items pay a quarter more). */
/** v0.9 (docs/gdd/arms.md): Hale & Daughter's armoury. Guns on a rack with their numbers side by side, ammunition by
 *  the box or five boxes, the gun upgrades, and selling. Every purchase goes through the same rules as any trader. */
export function openArmoury(c: Ctx, shop: R.ShopId = 'gunsmith', intro = '') {
  const def = B.SHOPS[shop];
  const max = { dmg: 96, rate: 2.5, range: 160, acc: 1, cap: 8 };
  const bar = (label: string, v: number, m: number) => `<div class="stat"><span>${label}</span><i><b style="width:${Math.max(4, Math.min(100, v / m * 100))}%"></b></i></div>`;
  const render = (root: HTMLElement, close: () => void) => {
    const s = c.s();
    const guns = B.FIREARM_IDS.filter(g => g === 'revolver' || (def.gear ?? []).includes(g as B.GearId)).map(g => {
      const GD = B.GUNS[g], own = G.ownedGuns(s).includes(g), price = g === 'revolver' ? 0 : R.gearPrice(s, g as B.GearId, shop);
      const dmg = (g === 'revolver' && s.gear.rifled ? B.REVOLVER_DAMAGE_RIFLED : GD.damage) * GD.pellets;
      return `<div class="rack ${own ? 'own' : ''}"><h4>${esc(GD.name)}</h4>
        ${bar('Damage', dmg, max.dmg)}${bar('Rate', 1 / GD.cooldown, max.rate)}${bar('Range', GD.range, max.range)}${bar('Accuracy', 1 / (GD.aim * 4), max.acc)}${bar('Capacity', GD.mag, max.cap)}
        <small style="color:var(--muted)">${GD.pellets > 1 ? `${GD.pellets} pellets × ${GD.damage}` : `${dmg} a shot`} · ${GD.mag} rounds · reload ${GD.reload}s · ${esc(B.ITEMS[GD.ammo].name)}</small>
        <p>${own ? '<span class="tag">Yours</span>' : `<button class="btn primary" data-gear="${g}" ${s.crowns < price ? 'disabled' : ''}>Buy · ${price}</button>`}</p></div>`;
    }).join('');
    const ammo = def.items.map(x => { const p = R.shopPrice(s, shop, x.id); return row(`<b>${esc(B.ITEMS[x.id].name)}</b> ${dim(`(you have ${s.inventory[x.id]})`)}<br><small style="color:var(--muted)">${esc(B.ITEMS[x.id].desc)}</small>`, `<button class="btn" data-buy="${x.id}:1" ${s.crowns < p ? 'disabled' : ''}>Buy · ${p}</button> <button class="btn" data-buy="${x.id}:5" ${s.crowns < p * 5 ? 'disabled' : ''}>×5 · ${p * 5}</button>`); }).join('');
    const ups = (def.gear ?? []).filter(g => !(B.FIREARM_IDS as string[]).includes(g)).map(g => { const p = R.gearPrice(s, g, shop), own = s.gear[g]; return row(`<b>${esc(B.GEAR[g].name)}</b>${own ? ' ' + dim('(yours)') : ''}<br><small style="color:var(--muted)">${esc(B.GEAR[g].desc)}</small>`, `<button class="btn" data-gear="${g}" ${own || s.crowns < p ? 'disabled' : ''}>${own ? 'Owned' : 'Buy · ' + p}</button>`); }).join('');
    const sellable = (Object.keys(s.inventory) as B.ItemId[]).filter(k => s.inventory[k] > 0 && R.sellPriceAt(s, shop, k) > 0 && B.ITEMS[k].kind !== 'quest');
    const sells = sellable.map(k => row(`${esc(B.ITEMS[k].name)} × ${s.inventory[k]}${def.buys?.includes(k) ? ' <b style="color:var(--accent)">wanted</b>' : ''}`, `<button class="btn" data-sell="${k}">Sell 1 · ${R.sellPriceAt(s, shop, k)}</button>`)).join('');
    root.innerHTML = `<h2>${esc(def.name)}</h2><p class="sub">${intro ? esc(intro) + ' ' : ''}You have <b>${s.crowns}</b> crowns.${G.today(s).event === 'market' ? ' <b>Market day: 15% off.</b>' : ''}</p>
      <div class="armoury">${guns}</div>
      <div class="card"><h3>Ammunition</h3>${ammo}</div>${ups ? `<div class="card"><h3>Gunsmithing</h3>${ups}</div>` : ''}
      <div class="card"><h3>Sell</h3>${sells || dim('Nothing they want.')}</div><p><button class="btn primary" data-close>Done</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-buy]', b => { const [k, n] = b.dataset.buy!.split(':'); let ok = false; for (let i = 0; i < Number(n); i++) ok = R.buyFrom(s, shop, k as B.ItemId) || ok; if (ok) c.sound('coin'); render(root, close); });
    on(root, '[data-gear]', b => { if (R.buyGear(s, b.dataset.gear as B.GearId, shop)) c.sound('good'); render(root, close); c.save(); });
    on(root, '[data-sell]', b => { if (R.sellAt(s, shop, b.dataset.sell as B.ItemId, 1)) c.sound('coin'); render(root, close); });
  };
  c.openModal('', render, c.relock);
}

export function openTrader(c: Ctx, shop: R.ShopId, intro = '') {
  if (shop === 'gunsmith') return openArmoury(c, shop, intro);
  const def = B.SHOPS[shop];
  const render = (root: HTMLElement, close: () => void) => {
    const s = c.s();
    const items = def.items.map(x => { const p = R.shopPrice(s, shop, x.id); return row(`<b>${B.ITEMS[x.id].name}</b> ${dim(`(you have ${s.inventory[x.id]})`)}<br><small style="color:var(--muted)">${esc(B.ITEMS[x.id].desc)}</small>`, `<button class="btn" data-buy="${x.id}" ${s.crowns < p ? 'disabled' : ''}>Buy · ${p}</button>`); }).join('');
    const gear = (def.gear ?? []).map(g => { const p = R.gearPrice(s, g, shop), own = s.gear[g]; return row(`<b>${B.GEAR[g].name}</b>${own ? ' ' + dim('(yours)') : ''}<br><small style="color:var(--muted)">${esc(B.GEAR[g].desc)}</small>`, `<button class="btn" data-gear="${g}" ${own || s.crowns < p ? 'disabled' : ''}>${own ? 'Owned' : 'Buy · ' + p}</button>`); }).join('');
    const sellable = (Object.keys(s.inventory) as B.ItemId[]).filter(k => s.inventory[k] > 0 && R.sellPriceAt(s, shop, k) > 0 && B.ITEMS[k].kind !== 'quest');
    const sells = sellable.map(k => { const p = R.sellPriceAt(s, shop, k), wants = def.buys?.includes(k); return row(`${B.ITEMS[k].name} × ${s.inventory[k]} ${wants ? '<b style="color:var(--accent)">wanted</b>' : ''}`, `<button class="btn" data-sell="${k}:1">Sell 1 · ${p}</button>${s.inventory[k] > 1 ? `<button class="btn" data-sell="${k}:${s.inventory[k]}">All · ${p * s.inventory[k]}</button>` : ''}`); }).join('') || `<p>${dim('Nothing they want.')}</p>`;
    root.innerHTML = `<h2>${esc(def.name)}</h2><p class="sub">${intro ? esc(intro) + ' ' : ''}You have <b>${s.crowns}</b> crowns.${G.today(s).event === 'market' ? ' <b>Market day: 15% off.</b>' : ''}</p>${items}${gear ? `<div class="card"><h3>Gear</h3>${gear}</div>` : ''}<div class="card"><h3>Sell</h3>${sells}</div><p><button class="btn primary" data-close>Done</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-buy]', b => { if (R.buyFrom(s, shop, b.dataset.buy as B.ItemId)) c.sound('coin'); render(root, close); });
    on(root, '[data-gear]', b => { if (R.buyGear(s, b.dataset.gear as B.GearId, shop)) c.sound('good'); render(root, close); c.save(); });
    on(root, '[data-sell]', b => { const [k, n] = b.dataset.sell!.split(':'); if (R.sellAt(s, shop, k as B.ItemId, Number(n))) c.sound('coin'); render(root, close); });
  };
  c.openModal('', render, c.relock);
}

/** Wenna's bar at the Drowned Lantern. */
export function openInn(c: Ctx) {
  const menu: { id: B.ItemId; price: number }[] = [{ id: 'eelpie', price: 8 }, { id: 'smokedfish', price: 5 }, { id: 'bread', price: 4 }, { id: 'milk', price: 2 }];
  const render = (root: HTMLElement, close: () => void) => {
    const s = c.s();
    root.innerHTML = `<h2>The Drowned Lantern</h2><p class="sub">Wenna Brightwater keeps the bar; the river keeps the lantern. You have <b>${s.crowns}</b> crowns.</p>` +
      menu.map(m => row(`<b>${B.ITEMS[m.id].name}</b> ${dim(`(you have ${s.inventory[m.id]})`)}<br><small style="color:var(--muted)">${esc(B.ITEMS[m.id].desc)}</small>`, `<button class="btn" data-buy="${m.id}:${m.price}" ${s.crowns < m.price ? 'disabled' : ''}>Buy · ${m.price}</button>`)).join('') +
      row(`<b>A pint of river ale</b><br><small style="color:var(--muted)">−12 stress, +300 ml. Drink it here.</small>`, `<button class="btn" data-ale ${s.crowns < 2 ? 'disabled' : ''}>Drink · 2</button>`) +
      row(`<b>A bed for the night</b><br><small style="color:var(--muted)">${B.INN_ROOM_COST} crowns: sleep in the back room, by the beds. Not as good as your own feather bed, but dry.</small>`, '') +
      `<p><button class="btn primary" data-close>Done</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-buy]', b => { const [id, p] = b.dataset.buy!.split(':'); const pr = Number(p); if (s.crowns >= pr) { s.crowns -= pr; s.inventory[id as B.ItemId]++; G.log(s, `Wenna slides a ${B.ITEMS[id as B.ItemId].name.toLowerCase()} across the bar.`, 'info'); c.sound('coin'); } render(root, close); });
    on(root, '[data-ale]', () => { if (s.crowns >= 2) { s.crowns -= 2; s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 12); s.needs.hydration = G.clampNeedPublic('hydration', s.needs.hydration + 300); s.needs.bladder = G.clampNeedPublic('bladder', s.needs.bladder + 30); G.advanceMinutes(s, 15, 'rest'); G.log(s, 'River ale: brown, cold and faintly of the river. The edges come off the day.', 'good'); c.sound('water'); c.act('drink', 1.6); } render(root, close); });
  };
  c.openModal('', render, c.relock);
}

/** Joss's coach between Millbrook's East Gate and Ashford's West Gate. */
export function openCoach(c: Ctx, to: 'ashford' | 'millbrook', go: () => void) {
  const render = (root: HTMLElement, close: () => void) => {
    const s = c.s(), h = G.hour(s), running = h >= 7 && h < 20;
    root.innerHTML = `<h2>The coach to ${to === 'ashford' ? 'Ashford' : 'Millbrook'}</h2><p class="sub">${B.COACH_COST} crowns, about ${Math.round(B.COACH_MINUTES / 60 * 10) / 10} hours on the road, sitting down. Runs from 07:00 to 20:00. You have <b>${s.crowns}</b> crowns.</p>` +
      (running ? '' : `<p>${dim('The horses are stabled for the night. Joss will drive again from seven.')}</p>`) +
      `<p><button class="btn primary" data-go ${!running || s.crowns < B.COACH_COST || s.carryingCrate ? 'disabled' : ''}>Ride · ${B.COACH_COST}</button> <button class="btn" data-close>Not now</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-go]', () => { close(); go(); });
  };
  c.openModal('', render, c.relock);
}

/** Merrin's songs. */
export function openBard(c: Ctx) {
  const songs = [
    { name: 'The Lantern in the Wend', text: 'A slow river song about a lantern that never went out. Half the room hums along; Jory cries, as usual.' },
    { name: 'Fourteen Went Down', text: 'Merrin\'s new one, about Copper Hollow. She sings it quietly. Nobody claps; everyone pays.' },
    { name: 'The Ballad of Millbrook\'s Debt', text: 'A comic song about a house, an aunt and three hundred crowns. You realise halfway through that it is about you.' },
  ];
  const render = (root: HTMLElement, close: () => void) => {
    const s = c.s();
    root.innerHTML = `<h2>Merrin Vale, bard</h2><p class="sub">A crown a song. Music lowers stress and passes the time pleasantly.</p>` +
      songs.map((g, i) => row(`<b>${esc(g.name)}</b>`, `<button class="btn" data-song="${i}" ${s.crowns < 1 ? 'disabled' : ''}>Listen · 1</button>`)).join('') + `<p><button class="btn primary" data-close>Done</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-song]', b => { if (s.crowns < 1) return; s.crowns--; const g = songs[Number(b.dataset.song)]; s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 8); s.needs.comfort = G.clampNeedPublic('comfort', s.needs.comfort + 4); G.advanceMinutes(s, 10, 'rest'); G.log(s, `${g.name}. ${g.text}`, 'good'); c.sound('coin'); render(root, close); });
  };
  c.openModal('', render, c.relock);
}

/** The choice at the ward-copper seam, once the Warden Engine is down. */
export function openSeam(c: Ctx, choose: (fate: 1 | 2 | 3) => void) {
  const render = (root: HTMLElement, close: () => void) => {
    root.innerHTML = `<h2>The ward-copper seam</h2><p class="sub">The Engine lies still. Behind it, veins of copper glow in the rock and hum at a pitch you feel in your teeth. Its heart, the rune-core, is in your pack. This seam is where the old wardwrights cut their stones.</p>
      <div class="card"><h3>Seal it</h3><p>Set the heart back in the rock and leave the seam to sleep. The Reach's wards hold; the Chapel will be glad; nobody gets rich. ${dim('Chapel ++, Ashford +, the Tower −. The Reeve pays 45 crowns.')}</p><button class="btn primary" data-f="1">Seal the seam</button></div>
      <div class="card"><h3>Open it to Ashford's guild</h3><p>Chalk the guild mark and sell the heart. Copper (and ward-copper) will flow; Ashford will eat this winter. ${dim('150 crowns at once. Ashford ++, the Chapel −−.')}</p><button class="btn" data-f="2">Open the seam</button></div>
      <div class="card"><h3>Send the heart to Aldric Voss</h3><p>The Voss family built the Engine. The Tower will keep this ward as it keeps the others. ${dim('80 crowns off your debt. The Tower ++, Ashford −.')}</p><button class="btn" data-f="3">Send it to the Tower</button></div>
      <p><button class="btn" data-close>Decide later</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-f]', b => { close(); choose(Number(b.dataset.f) as 1 | 2 | 3); });
  };
  c.openModal('', render, c.relock);
}
/** Selling at a Reach trader uses the town sell price as its base; exported for tests. */
export const baseSell = T.sellPrice;

// ---------------- v0.8: the Westmarch ----------------
/** Davin Teague's bar at the Heron and Reed, Fernhollow. */
export function openWestInn(c: Ctx) {
  const menu: { id: B.ItemId; price: number }[] = [{ id: 'friedperch', price: 6 }, { id: 'pikepie', price: 11 }, { id: 'smokedfish', price: 5 }, { id: 'bread', price: 4 }, { id: 'heathertea', price: 3 }];
  const render = (root: HTMLElement, close: () => void) => {
    const s = c.s(), bed = R.innCost(s, 'fernhollow');
    root.innerHTML = `<h2>The Heron and Reed</h2><p class="sub">Davin Teague keeps the bar; the heron on the sign keeps its opinions to itself. You have <b>${s.crowns}</b> crowns.</p>` +
      menu.map(m => row(`<b>${B.ITEMS[m.id].name}</b> ${dim(`(you have ${s.inventory[m.id]})`)}<br><small style="color:var(--muted)">${esc(B.ITEMS[m.id].desc)}</small>`, `<button class="btn" data-buy="${m.id}:${m.price}" ${s.crowns < m.price ? 'disabled' : ''}>Buy · ${m.price}</button>`)).join('') +
      row(`<b>A pint of lake ale</b><br><small style="color:var(--muted)">−12 stress, +300 ml. Brown, and proud of it.</small>`, `<button class="btn" data-ale ${s.crowns < 2 ? 'disabled' : ''}>Drink · 2</button>`) +
      row(`<b>A bed for the night</b><br><small style="color:var(--muted)">${bed ? `${bed} crowns` : 'Free, on Liss\'s orders'}: the bed by the window, upstairs from the bar.</small>`, '') +
      `<p><button class="btn primary" data-close>Done</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-buy]', b => { const [id, p] = b.dataset.buy!.split(':'); const pr = Number(p); if (s.crowns >= pr) { s.crowns -= pr; s.inventory[id as B.ItemId]++; G.log(s, `Davin puts a ${B.ITEMS[id as B.ItemId].name.toLowerCase()} on the bar and a thumbprint on the plate.`, 'info'); c.sound('coin'); } render(root, close); });
    on(root, '[data-ale]', () => { if (s.crowns >= 2) { s.crowns -= 2; s.needs.stress = G.clampNeedPublic('stress', s.needs.stress - 12); s.needs.hydration = G.clampNeedPublic('hydration', s.needs.hydration + 300); s.needs.bladder = G.clampNeedPublic('bladder', s.needs.bladder + 30); G.advanceMinutes(s, 10, 'rest'); c.sound('ui'); } render(root, close); });
  };
  c.openModal('', render, c.relock);
}
/** The choice at King Orm's bier. */
export function openCrown(c: Ctx, choose: (fate: 1 | 2 | 3) => void) {
  const render = (root: HTMLElement, close: () => void) => {
    root.innerHTML = `<h2>The Crown of Orm</h2><p class="sub">The king is dust and bronze. His crown lies on the bier where he fell, cold as lake water, humming very faintly. The braziers burn low around it.</p>
      <div class="card"><h3>Set it back on his brow</h3><p>Return the crown and leave the king to sleep. Cadoc's rite holds; the barrow is sealed; the Downs go quiet and the mist lifts from the lake. Nobody gets rich. ${dim('Fernhollow ++, the Chapel +. The dead mostly stop walking.')}</p><button class="btn primary" data-f="1">Return the crown</button></div>
      <div class="card"><h3>Sell it to Master Vane</h3><p>The Spire's antiquarian will pay, and pay well, for the find of his life. The barrow stays open. ${dim(`${B.CROWN_SALE} crowns. Fernhollow −−, the Tower +. The Downs stay haunted.`)}</p><button class="btn" data-f="2">Sell it to Vane</button></div>
      <div class="card"><h3>Keep it</h3><p>Bend the old gold small enough to wear. It hums at night, and your hands feel quicker for it. ${dim('Becomes Orm\'s circlet (a charm). Fernhollow −. Half the dead keep walking.')}</p><button class="btn" data-f="3">Keep the crown</button></div>
      <p><button class="btn" data-close>Decide later</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-f]', b => { close(); choose(Number(b.dataset.f) as 1 | 2 | 3); });
  };
  c.openModal('', render, c.relock);
}
