// Dialog panels added in pass 4: journal (quests, character, people, today, log), the Tankard,
// the Chapel, Dorran's forge, the chair at home, selling, the Ash Road trader, and the ending.
import * as G from '../sim/state';
import * as B from '../sim/balance';
import * as T from '../sim/town';
import * as S from '../sim/story';
import type { GameState } from '../sim/state';
import { SKILLS, SKILL_IDS, TRAITS, TRAUMAS, progress, MAX_LEVEL } from '../sim/skills';
import { FACTIONS, type FactionId } from '../sim/contracts';
import { WEATHER_TEXT, EVENT_TEXT } from '../sim/days';
import { escapeHtml } from './hud';
import { runDoorOption, type DoorEvent } from '../sim/events';

export interface Ctx {
  s: () => GameState;
  openModal: (html: string, mount?: (root: HTMLElement, close: () => void) => void, onClose?: () => void) => void;
  relock: () => void; save: () => void;
  sound: (n: 'ui' | 'coin' | 'good' | 'bad' | 'eat' | 'water' | 'scribble') => void;
  npcName: (id: string) => string;
  npcFaction: (id: string) => FactionId;
  /** Play a body animation for a moment (third person and viewmodel). */
  act: (clip: 'eat' | 'drink' | 'interact' | 'kneel', seconds: number) => void;
}
type Mount = (root: HTMLElement, close: () => void) => void;
const esc = escapeHtml;
const on = (root: HTMLElement, sel: string, f: (el: HTMLElement) => void) => root.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => f(b as HTMLElement)));
const row = (left: string, right: string) => `<div class="row2"><div>${left}</div><div style="white-space:nowrap">${right}</div></div>`;
const dim = (t: string) => `<small style="color:var(--muted)">${t}</small>`;
const bar = (frac: number, color = 'var(--accent)') => `<span style="display:inline-block;width:120px;height:7px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden;vertical-align:middle"><i style="display:block;height:100%;width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${color}"></i></span>`;

// ---------------- journal ----------------
export type JournalTab = 'quests' | 'character' | 'people' | 'today' | 'log';
export function openJournal(c: Ctx, tab: JournalTab = 'quests') {
  const render: Mount = (root, close) => {
    const s = c.s();
    const tabs = (['quests', 'character', 'people', 'today', 'log'] as JournalTab[]).map(t => `<button class="btn ${t === tab ? 'primary' : ''}" data-tab="${t}">${{ quests: 'Quests', character: 'Character', people: 'People', today: 'Today', log: 'Log' }[t]}</button>`).join('');
    let body = '';
    if (tab === 'quests') {
      const tr = S.tracked(s);
      const active = S.QUESTS.filter(q => s.quests[q.id]?.state === 'active'), done = S.QUESTS.filter(q => s.quests[q.id]?.state === 'done');
      const card = (q: S.Quest) => { const d = S.describe(s, q.id)!; return `<div class="card"><h3>${esc(q.name)} ${dim(q.kind === 'main' ? 'main quest' : 'task')}</h3><p style="color:var(--muted)">${esc(q.blurb)}</p><p>› ${esc(d.lines[0])}</p>${q.stages.slice(0, s.quests[q.id].stage).map(st => `<p style="color:var(--muted);text-decoration:line-through;font-size:12.5px">${esc(typeof st.text === 'function' ? st.text(s) : st.text)}</p>`).join('')}<button class="btn" data-track="${q.id}" ${tr?.id === q.id ? 'disabled' : ''}>${tr?.id === q.id ? 'Shown on screen' : 'Show on screen'}</button></div>`; };
      body = (active.length ? active.sort((a, b) => (a.kind === 'main' ? 0 : 1) - (b.kind === 'main' ? 0 : 1)).map(card).join('') : '<p style="color:var(--muted)">Nothing pressing. Talk to people: a gold mark over someone\'s head means they have something for you.</p>') +
        (done.length ? `<div class="card"><h3>Finished</h3>${done.map(q => `<p>${esc(q.name)} ${dim('day ' + s.quests[q.id].doneDay)}</p>`).join('')}</div>` : '');
    } else if (tab === 'character') {
      body = `<div class="card"><h3>Skills ${dim('grow by doing')}</h3>${SKILL_IDS.map(k => { const p = progress(s.skills[k] ?? 0); return row(`<b>${SKILLS[k].name}</b> ${dim(SKILLS[k].how)}<br>${dim(SKILLS[k].per)}`, `level ${p.level}${p.level >= MAX_LEVEL ? '' : ' ' + bar(p.into / p.need)}`); }).join('')}</div>
        <div class="card"><h3>Traits</h3>${s.traits.length ? s.traits.map(t => `<p><b style="color:${TRAITS[t].good ? 'var(--good)' : 'var(--bad)'}">${TRAITS[t].name}</b>: ${TRAITS[t].desc}${TRAUMAS.includes(t) ? ' ' + dim('Maren at the Chapel can treat this.') : ''}</p>`).join('') : '<p style="color:var(--muted)">None yet. Hard days leave marks; so do good habits.</p>'}</div>
        <div class="card"><h3>Gear</h3><p>Revolver: ${Math.round(G.revolverDamage(s))} damage, reload ${G.reloadTime(s)} s, condition ${Math.round(s.revolverCond)}% (${T.condText(s.revolverCond)})</p><p>Staff: ${G.meleeDamage(s)} melee damage · spells ×${G.spellPower(s).toFixed(2)}</p><p>${(Object.keys(B.GEAR) as B.GearId[]).filter(g => s.gear[g]).map(g => B.GEAR[g].name).join(' · ') || dim('No upgrades yet. Dorran Kade at the smithy can help.')}</p><p>${dim('Difficulty: ' + B.DIFFICULTY[s.difficulty].name)}</p></div>
        <div class="card"><h3>Record</h3><p style="color:var(--muted)">Day ${G.day(s)} · ${s.contractsDone} notices · ${s.job.shifts} shifts and ${s.ledgerCases} case files · ${s.stats.kills} kills · ${G.tally(s, 'crownsEarned')} crowns earned · ${s.stats.collapses} collapses · ${G.tally(s, 'questsDone')} quests and tasks finished</p></div>`;
    } else if (tab === 'people') {
      body = `<div class="card"><h3>Standing</h3>${(Object.keys(FACTIONS) as FactionId[]).map(f => row(`${FACTIONS[f].name} ${dim(FACTIONS[f].who)}`, `<b>${G.standing(s.factions[f])}</b> ${s.factions[f]}`)).join('')}</div>
        <div class="card"><h3>People you know</h3>${Object.keys(s.npcMemory).length ? Object.entries(s.npcMemory).map(([id, m]) => row(`<b>${esc(c.npcName(id))}</b> ${dim(FACTIONS[c.npcFaction(id)].name)}`, `met ${m.met}× ${m.mood > 0 ? '· warm' : m.mood < -2 ? '· wary of you' : ''}${S.hasBusiness(s, id) ? ' · <span style="color:var(--accent)">wants a word</span>' : ''}`)).join('') : '<p style="color:var(--muted)">You have not spoken to anyone yet.</p>'}</div>`;
    } else if (tab === 'today') {
      const d = G.today(s), left = Math.max(0, B.INSTALMENT - s.paidThisCycle);
      body = `<div class="card"><h3>Day ${G.day(s)}, ${G.clock(s)}</h3><p>${WEATHER_TEXT[d.weather]}</p>${d.event !== 'none' ? `<p style="color:var(--accent)">${EVENT_TEXT[d.event]}</p>` : ''}</div>
        <div class="card"><h3>Money</h3><p>${s.crowns} crowns in your purse, ${s.savings} at the Millbrook Trust.</p><p>${s.debt > 0 ? `Debt to Aldric Voss: ${s.debt}. ${left > 0 ? `${left} more due by the end of day ${s.nextDueDay}.` : `Paid up until day ${s.nextDueDay}.`}${s.missed ? ` Missed instalments: ${s.missed} of ${B.MISSES_TO_GAMEOVER}.` : ''}` : 'You owe nobody anything.'}</p></div>
        <div class="card"><h3>Work</h3><p>${s.active ? `Notice in hand: ${esc(s.active.title)} (${s.active.progress}/${s.active.count}).` : 'No notice in hand. The board in the square has new ones every morning.'}</p><p>${s.job.lastShiftDay === G.day(s) ? 'You have done your desk work for today.' : `Brannic takes clerks from ${B.SHIFT_START_HOUR}:00 to ${B.SHIFT_LAST_START_HOUR}:00.`} Boss Attention ${s.job.attention}/100.</p></div>`;
    } else {
      body = s.log.slice(-40).reverse().map(l => `<p class="${l.kind === 'bad' ? 'res-bad' : l.kind === 'good' ? 'res-ok' : ''}">${dim(`Day ${l.day} ${l.time}`)} ${esc(l.text)}</p>`).join('');
    }
    root.innerHTML = `<h2>Journal</h2><p>${tabs}</p>${body}<p><button class="btn primary" data-close>Close</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-tab]', el => { tab = el.dataset.tab as JournalTab; c.sound('ui'); render(root, close); });
    on(root, '[data-track]', el => { S.track(s, el.dataset.track!); c.sound('ui'); render(root, close); });
  };
  c.openModal('', render, c.relock);
}

// ---------------- the Gilded Tankard ----------------
export function openTavern(c: Ctx) {
  let said = '';
  const render: Mount = (root, close) => {
    const s = c.s(), fest = G.today(s).event === 'festival' && !G.tally(s, 'today:freeAle');
    root.innerHTML = `<h2>The Gilded Tankard</h2><p class="sub">Tomlin Wren keeps the pot hot and his ears open. You have <b>${s.crowns}</b> crowns.</p>
      ${said ? `<div class="doc" style="font-size:15px">${esc(said)}</div>` : ''}
      ${row(`<b>Pot pie and bread</b><br>${dim('+950 kcal, +300 ml, comfort, a little less stress. Half an hour.')}`, `<button class="btn" data-a="meal" ${s.crowns < T.TAVERN.meal ? 'disabled' : ''}>${T.TAVERN.meal} crowns</button>`)}
      ${row(`<b>Small beer</b><br>${dim('−12 stress (less after the second). Fills the bladder. The third makes you tired.')}`, `<button class="btn" data-a="ale" ${!fest && s.crowns < T.TAVERN.ale ? 'disabled' : ''}>${fest ? 'Free tonight' : T.TAVERN.ale + ' crowns'}</button>`)}
      ${row(`<b>Ask what Tomlin has heard</b><br>${dim('Rumours point at things worth doing.')}`, `<button class="btn" data-a="rumour">Listen</button>`)}
      <p><button class="btn primary" data-close>Leave the bar</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-a]', el => {
      const a = el.dataset.a;
      if (a === 'meal' && T.tavernMeal(s)) { c.sound('eat'); G.count(s, 'ate'); said = 'Tomlin: "Eat it while it\'s angry."'; }
      if (a === 'ale' && T.tavernAle(s)) { c.sound('water'); said = 'Tomlin slides it down the bar without looking.'; }
      if (a === 'rumour') { said = 'Tomlin: ' + S.rumour(s); G.count(s, 'rumours'); c.sound('ui'); }
      render(root, close);
    });
  };
  c.openModal('', render, () => { c.save(); c.relock(); });
}
export function openDice(c: Ctx) {
  let g: T.DiceGame | null = null, bet = 2;
  const face = (n: number) => `<span style="display:inline-block;width:44px;height:44px;line-height:44px;text-align:center;font:700 24px Georgia,serif;background:#efe3c4;color:#2a2116;border-radius:6px;margin:0 4px">${n}</span>`;
  const render: Mount = (root, close) => {
    const s = c.s(), left = T.DICE_MAX_ROUNDS - G.tally(s, 'today:dice');
    let body: string;
    if (!g) body = `<p>Stake: ${[1, 2, 5, 10].map(b => `<button class="btn ${b === bet ? 'primary' : ''}" data-bet="${b}" ${s.crowns < b ? 'disabled' : ''}>${b}</button>`).join('')}</p><p><button class="btn primary" data-roll ${left <= 0 || s.crowns < bet ? 'disabled' : ''}>Roll</button> ${dim(left > 0 ? `${left} rounds left tonight` : 'Tomlin has put the dice away for today.')}</p>`;
    else if (!g.house) body = `<p>You rolled ${face(g.dice[0])}${face(g.dice[1])} = <b>${g.dice[0] + g.dice[1]}</b></p><p><button class="btn" data-re="0" ${g.rerolled ? 'disabled' : ''}>Re-roll the first</button><button class="btn" data-re="1" ${g.rerolled ? 'disabled' : ''}>Re-roll the second</button><button class="btn primary" data-stand>Stand</button></p>`;
    else body = `<p>You ${face(g.dice[0])}${face(g.dice[1])} = <b>${g.dice[0] + g.dice[1]}</b> &nbsp; House ${face(g.house[0])}${face(g.house[1])} = <b>${g.house[0] + g.house[1]}</b></p><p class="${g.result === 'win' ? 'res-ok' : 'res-bad'}">${g.result === 'win' ? `You win ${g.bet} crowns.` : `The house takes ${g.bet}.`}</p><p><button class="btn primary" data-again>Again</button></p>`;
    root.innerHTML = `<h2>Sevens</h2><p class="sub">Roll two dice. You may re-roll one of them once. Then the house rolls: the higher total wins the stake, and the house takes ties. Purse: <b>${s.crowns}</b>.</p>${body}<p><button class="btn" data-close>Leave the table</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-bet]', el => { bet = Number(el.dataset.bet); render(root, close); });
    on(root, '[data-roll]', () => { g = T.diceStart(s, bet); c.sound('scribble'); render(root, close); });
    on(root, '[data-re]', el => { if (g) T.diceReroll(s, g, Number(el.dataset.re) as 0 | 1); c.sound('scribble'); render(root, close); });
    on(root, '[data-stand]', () => { if (g) { T.diceStand(s, g); c.sound(g.result === 'win' ? 'coin' : 'bad'); } render(root, close); });
    on(root, '[data-again]', () => { g = null; render(root, close); });
  };
  c.openModal('', render, () => { c.save(); c.relock(); });
}

// ---------------- the Chapel ----------------
export function openChapel(c: Ctx) {
  const render: Mount = (root, close) => {
    const s = c.s(), hc = T.chapelHealCost(s), bad = s.traits.filter(t => TRAUMAS.includes(t));
    root.innerHTML = `<h2>Chapel of the Quiet Flame</h2><p class="sub">Maren Soloway tends the flame and whoever limps in. ${G.today(s).event === 'pilgrims' ? 'Pilgrims are in town: healing costs half today. ' : ''}You have <b>${s.crowns}</b> crowns.</p>
      ${row(`<b>Have a wound closed</b><br>${dim(s.wounds.length ? `${s.wounds.length} wound${s.wounds.length > 1 ? 's' : ''}: ${s.wounds.map(w => w.label).join(', ')}. No bandage needed; +20 health.` : 'You have no wounds.')}`, `<button class="btn" data-a="heal" ${!s.wounds.length || s.crowns < hc ? 'disabled' : ''}>${hc} crowns</button>`)}
      ${row(`<b>Sit with the flame</b><br>${dim('−25 stress now, and stress builds half as fast for 12 hours.' + ((s.story.flags.blessedUntil ?? 0) > s.minutes ? ' (Still with you.)' : ''))}`, `<button class="btn" data-a="bless" ${s.crowns < T.CHAPEL.blessing ? 'disabled' : ''}>${T.CHAPEL.blessing} crowns</button>`)}
      ${row(`<b>Healing draught</b> ${dim(`(you have ${s.inventory.draught})`)}<br>${dim(B.ITEMS.draught.desc)}`, `<button class="btn" data-a="draught" ${s.crowns < T.draughtCost(s, 'draught') ? 'disabled' : ''}>${T.draughtCost(s, 'draught')} crowns</button>`)}
      ${row(`<b>Mana draught</b> ${dim(`(you have ${s.inventory.manadraught})`)}<br>${dim(B.ITEMS.manadraught.desc + (s.inventory.dust ? ' Maren takes one shade dust and 5 crowns off.' : ' Cheaper if you bring shade dust.'))}`, `<button class="btn" data-a="manadraught" ${s.crowns < T.draughtCost(s, 'manadraught') ? 'disabled' : ''}>${T.draughtCost(s, 'manadraught')} crowns</button>`)}
      ${bad.map(t => row(`<b>Treat: ${TRAITS[t].name}</b><br>${dim(TRAITS[t].desc + ' An hour of careful work.')}`, `<button class="btn" data-cure="${t}" ${s.crowns < T.CHAPEL.cure ? 'disabled' : ''}>${T.CHAPEL.cure} crowns</button>`)).join('')}
      <p><button class="btn primary" data-close>Leave</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-a]', el => {
      const a = el.dataset.a; let ok = false;
      if (a === 'heal') ok = T.chapelHeal(s); if (a === 'bless') ok = T.blessing(s);
      if (a === 'draught' || a === 'manadraught') ok = T.buyDraught(s, a);
      c.sound(ok ? 'good' : 'bad'); render(root, close);
    });
    on(root, '[data-cure]', el => { c.sound(T.cureTrait(s, el.dataset.cure as any) ? 'good' : 'bad'); render(root, close); });
  };
  c.openModal('', render, () => { c.save(); c.relock(); });
}

// ---------------- Dorran's forge ----------------
export function openSmithy(c: Ctx) {
  const render: Mount = (root, close) => {
    const s = c.s();
    root.innerHTML = `<h2>Dorran's forge</h2><p class="sub">${s.story.flags.dorranFriend ? 'Dorran gives you a quarter off, for the pelts. ' : ''}You have <b>${s.crowns}</b> crowns.</p>
      ${(Object.keys(B.GEAR) as B.GearId[]).map(g => { const ok = T.canBuyGear(s, g); return row(`<b>${B.GEAR[g].name}</b><br>${dim(B.GEAR[g].desc)}`, `<button class="btn" data-g="${g}" ${ok.ok ? '' : 'disabled'}>${s.gear[g] ? 'Owned' : ok.ok || ok.why === 'Not enough crowns' ? T.gearCost(s, g) + ' crowns' : ok.why}</button>`); }).join('')}
      ${row(`<b>Clean and oil the revolver</b><br>${dim(`Condition ${Math.round(s.revolverCond)}% (${T.condText(s.revolverCond)}). A fouled gun shoots wide; a filthy one misfires.`)}`, `<button class="btn" data-clean ${s.revolverCond >= 99 || s.crowns < 3 ? 'disabled' : ''}>3 crowns</button>`)}
      ${row(`<b>Gun oil and rag</b> ${dim(`(you have ${s.inventory.oil})`)}<br>${dim('Clean it yourself, anywhere, from your pack.')}`, `<button class="btn" data-oil ${s.crowns < 4 ? 'disabled' : ''}>4 crowns</button>`)}
      <p><button class="btn primary" data-close>Leave</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-g]', el => { c.sound(T.buyGear(s, el.dataset.g as B.GearId) ? 'good' : 'bad'); render(root, close); });
    on(root, '[data-clean]', () => { c.sound(T.cleanRevolver(s, 'smith') ? 'good' : 'bad'); render(root, close); });
    on(root, '[data-oil]', () => { if (s.crowns >= 4) { s.crowns -= 4; s.inventory.oil++; c.sound('coin'); } render(root, close); });
  };
  c.openModal('', render, () => { c.save(); c.relock(); });
}

// ---------------- selling ----------------
export function sellRows(s: GameState, mult = 1): string {
  const ids = B.ITEM_IDS.filter(k => s.inventory[k] > 0 && B.SELL[k]);
  return ids.length ? ids.map(k => { const p = Math.max(1, Math.round(T.sellPrice(s, k) * mult)); return row(`<b>${B.ITEMS[k].name}</b> × ${s.inventory[k]} ${dim(B.ITEMS[k].kind === 'loot' ? 'loot' : '')}`, `<button class="btn" data-sell="${k}:1">Sell 1 · ${p}</button><button class="btn" data-sell="${k}:99">Sell all · ${p * s.inventory[k]}</button>`); }).join('') : '<p style="color:var(--muted)">Nothing in your pack that anyone here would buy.</p>';
}
/** The man with no name: pays more for loot, sells rounds cheaper to people the Ash Road likes. */
export function openNoName(c: Ctx) {
  const render: Mount = (root, close) => {
    const s = c.s(), liked = s.factions.ashRoad >= 5, ammo = liked ? 4 : 6;
    root.innerHTML = `<h2>A man with no name</h2><p class="sub">Ash Road: ${G.standing(s.factions.ashRoad)}. He pays about a third more than the market for anything the Watch would ask questions about. You have <b>${s.crowns}</b> crowns.</p>
      <div class="card"><h3>He buys</h3>${(['pelt', 'dust', 'cinder', 'tags'] as B.ItemId[]).filter(k => s.inventory[k] > 0).map(k => { const p = k === 'tags' ? 4 : Math.round(T.sellPrice(s, k) * 1.35); return row(`<b>${B.ITEMS[k].name}</b> × ${s.inventory[k]}${k === 'tags' ? ' ' + dim('(the Watch pays 6 and thanks you; he pays 4 and the Watch never hears)') : ''}`, `<button class="btn" data-fence="${k}">Sell all · ${p * s.inventory[k]}</button>`); }).join('') || '<p style="color:var(--muted)">"Bring me pelts, dust, cinders. Things with no receipts."</p>'}</div>
      <div class="card"><h3>He sells</h3>${row(`<b>Revolver rounds ×6</b> ${dim(liked ? 'friend\'s price' : 'no discount yet')}`, `<button class="btn" data-buy="ammo" ${s.crowns < ammo ? 'disabled' : ''}>${ammo} crowns</button>`)}${row(`<b>Calming tonic</b> ${dim('off the back of a Tower cart')}`, `<button class="btn" data-buy="tonic" ${s.crowns < 8 ? 'disabled' : ''}>8 crowns</button>`)}</div>
      <p><button class="btn primary" data-close>Walk away</button></p>`;
    on(root, '[data-close]', () => { c.sound('ui'); close(); });
    on(root, '[data-fence]', el => { const k = el.dataset.fence as B.ItemId, n = s.inventory[k], p = k === 'tags' ? 4 : Math.round(T.sellPrice(s, k) * 1.35); s.inventory[k] = 0; s.crowns += p * n; G.count(s, 'crownsEarned', p * n); G.rep(s, 'ashRoad', Math.max(1, Math.floor(n / 2)), false); if (k === 'tags') G.rep(s, 'watch', -1, false); G.log(s, `The man with no name takes ${n} × ${B.ITEMS[k].name} and counts out ${p * n} crowns without a word.`, 'info'); c.sound('coin'); render(root, close); });
    on(root, '[data-buy]', el => { const k = el.dataset.buy as 'ammo' | 'tonic', cost = k === 'ammo' ? ammo : 8; if (s.crowns >= cost) { s.crowns -= cost; s.inventory[k]++; G.rep(s, 'ashRoad', 1, false); c.sound('coin'); } render(root, close); });
  };
  c.openModal('', render, () => { c.save(); c.relock(); });
}

// ---------------- the chair by the fire ----------------
export function openChair(c: Ctx, done: (what: 'sit' | 'read' | 'meditate' | 'wait', minutes: number) => void) {
  const s = c.s(), hasBook = s.inventory.book + s.storage.book > 0, h = G.hour(s);
  const waits = [[8, 'morning (08:00)'], [12, 'noon'], [18, 'evening (18:00)'], [21, 'night (21:00)']].filter(([t]) => t !== h) as [number, string][];
  c.openModal(`<h2>The chair by the fire</h2><p class="sub">Day ${G.day(s)}, ${G.clock(s)}. Stress ${Math.round(s.needs.stress)}, mana ${Math.round(s.mana)}/${Math.round(B.manaMax(s.needs))}.</p>
    ${row(`<b>Sit a while</b><br>${dim('Half an hour. +40 comfort, −8 stress.')}`, '<button class="btn" data-a="sit">Sit</button>')}
    ${row(`<b>Read Aunt Ysolde's notebook</b><br>${dim(hasBook ? `An hour. Calms you; the first read each day teaches Spellcraft or Bookkeeping${s.upgrades.bookshelf ? ' (doubled by your bookshelf)' : ''}.` : 'The notebook is not here. (It started in your chest.)')}`, `<button class="btn" data-a="read" ${hasBook ? '' : 'disabled'}>Read</button>`)}
    ${row(`<b>Meditate</b><br>${dim('An hour. Mana returns in full if you have the water for it; −12 stress.')}`, '<button class="btn" data-a="meditate">Meditate</button>')}
    ${row(`<b>Wait until…</b><br>${dim('Time passes at resting rates: you will get hungry and thirsty.')}`, waits.map(([t, l]) => `<button class="btn" data-w="${t}">${l}</button>`).join(''))}
    <p><button class="btn primary" data-close>Stand up</button></p>`, (root, close) => {
    on(root, '[data-a]', el => { const a = el.dataset.a as 'sit' | 'read' | 'meditate'; close(); done(a, a === 'sit' ? 30 : 60); });
    on(root, '[data-w]', el => { close(); done('wait', Number(el.dataset.w)); });
  }, c.relock);
}

// ---------------- endings ----------------
export function openEnding(c: Ctx, onContinue: () => void, onNew: () => void) {
  const s = c.s(), e = S.ending(s);
  let i = 0;
  const render: Mount = (root, close) => {
    const sl = e.slides[i], last = i >= e.slides.length - 1;
    root.innerHTML = `<h2>${esc(e.title)}</h2><p class="sub">${e.id === 'debt' ? 'The end of this life.' : e.final ? 'An ending' : 'A chapter closes'} · ${i + 1} of ${e.slides.length}</p>
      <div class="card"><h3>${esc(sl.head)}</h3><p style="font:16px/1.55 Georgia,serif">${esc(sl.text)}</p></div>
      <p>${i > 0 ? '<button class="btn" data-prev>Back</button>' : ''}${!last ? '<button class="btn primary" data-next>Next</button>' : ''}
      ${last && e.id !== 'debt' ? `<button class="btn primary" data-cont>${e.final ? 'Keep living in Millbrook' : 'Go on: the Vale is not finished with you'}</button>` : ''}${last ? '<button class="btn" data-new>Start a new life</button>' : ''}</p>`;
    on(root, '[data-prev]', () => { i--; c.sound('ui'); render(root, close); });
    on(root, '[data-next]', () => { i++; c.sound('ui'); render(root, close); });
    on(root, '[data-cont]', () => { close(); onContinue(); });
    on(root, '[data-new]', () => { close(); onNew(); });
  };
  c.openModal('', render);
}

// ---------------- something at the door ----------------
export function openDoorEvent(c: Ctx, e: DoorEvent) {
  const s = c.s(); let result = '';
  const render: Mount = (root, close) => {
    const opts = e.options.filter(o => !o.cond || o.cond(s));
    root.innerHTML = `<h2>${esc(e.title)}</h2><p class="sub">Day ${G.day(s)}, ${G.clock(s)}, at your own front door.</p><div class="doc" style="font-size:15px">${esc(result || e.text)}</div>
      ${result ? '<p><button class="btn primary" data-ok>Go on with the day</button></p>' : opts.map((o, i) => `<p><button class="btn" style="width:100%;text-align:left" data-opt="${i}">${esc(o.label)}</button></p>`).join('')}`;
    on(root, '[data-opt]', el => { result = runDoorOption(s, e, Number(el.dataset.opt)); c.sound('ui'); render(root, close); });
    on(root, '[data-ok]', () => { c.sound('ui'); close(); });
  };
  c.openModal('', render, () => { c.save(); c.relock(); });
}
