// DOM HUD and dialogs. Everything here only reads state; actions go back through callbacks.
import * as B from '../sim/balance';
import * as G from '../sim/state';
import type { GameState } from '../sim/state';

const CSS = `
:root{--ink:#efe6d2;--muted:#b9ad94;--panel:rgba(20,17,13,.72);--line:rgba(239,230,210,.18);--good:#8fc46a;--warn:#e0b14a;--bad:#e0644a;--mana:#5fa8ff;--stam:#d8c06a;--hp:#d0503c;--load:#9a8a6a;--accent:#e9b65c}
*{box-sizing:border-box}
html,body{margin:0;height:100%;overflow:hidden;background:#000;color:var(--ink);font:14px/1.4 "Alegreya Sans","Trebuchet MS",system-ui,sans-serif}
#game{position:fixed;inset:0;display:block;width:100%;height:100%}
.hud{position:fixed;pointer-events:none;z-index:5}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:8px 10px;contain:layout paint}
.title{font:600 11px/1 "Cinzel",Georgia,serif;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin-bottom:6px}
#needs{top:12px;left:12px;width:228px}
.need{display:grid;grid-template-columns:62px 1fr 64px;gap:6px;align-items:center;font-size:12px;margin:2px 0}
.need .bar{height:7px;background:rgba(255,255,255,.08);border-radius:4px;overflow:hidden}
.need .bar i{display:block;height:100%;border-radius:4px}
.need .v{text-align:right;color:var(--muted);font-variant-numeric:tabular-nums;font-size:11px}
.optimal i{background:var(--good)}.strained i{background:var(--warn)}.critical i{background:var(--bad)}
.critical .lab{color:var(--bad)}
#vitals{left:12px;bottom:12px;width:310px;contain:layout paint}
.vbar{position:relative;height:14px;background:rgba(255,255,255,.08);border-radius:3px;margin:4px 0;overflow:hidden}
.vbar i{position:absolute;inset:0 auto 0 0;border-radius:3px}
.vbar span{position:absolute;inset:0;font-size:11px;line-height:14px;padding-left:6px;text-shadow:0 1px 1px #000;font-variant-numeric:tabular-nums}
.vbar .cap{position:absolute;top:0;bottom:0;right:0;background:repeating-linear-gradient(45deg,rgba(208,80,60,.45) 0 4px,rgba(0,0,0,.3) 4px 8px)}
#rightcol{top:12px;right:12px;width:250px;display:flex;flex-direction:column;gap:8px;transform-origin:top right;transform:scale(var(--hud,1))}
#clock{text-align:right}
#clock .big{font:600 22px "Cinzel",Georgia,serif}
#clock .row{color:var(--muted);font-size:12.5px}
#quest .qline{font-size:12.5px;color:var(--muted);margin-top:2px}#quest .qline:before{content:"› ";color:var(--accent)}
#needs{transform-origin:top left;transform:scale(var(--hud,1))}#vitals{transform-origin:bottom left;transform:scale(var(--hud,1))}
#compass{top:28px;left:50%;margin-left:-210px;width:420px;height:54px;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent);mask-image:linear-gradient(90deg,transparent,#000 18%,#000 82%,transparent)}
#compass .strip{position:absolute;top:0;left:0;height:18px;will-change:transform}
#compass .strip span{position:absolute;top:0;width:30px;margin-left:-15px;text-align:center;font:600 12px "Cinzel",Georgia,serif;color:var(--ink);text-shadow:0 1px 2px #000}
#compass .strip .min{color:rgba(239,230,210,.35)}
#compass .needle{position:absolute;left:50%;top:15px;width:2px;height:5px;margin-left:-1px;background:var(--accent)}
#compass .mark{position:absolute;top:13px;left:0;width:60px;margin-left:-30px;text-align:center;will-change:transform;line-height:1}
#compass .mark b{display:block;font-size:11px;color:var(--accent)}#compass .mark small{font-size:10px;color:var(--muted);text-shadow:0 1px 2px #000}
#compass .mark.alt small{display:block;margin-top:10px}#compass .mark.quest b{color:#ffd76a}#compass .mark.job b{color:#9fd0ff}#compass .mark.home b{color:#bfe39e}#compass .mark.danger b{color:#ff8a6a}#compass .mark.edge{opacity:.55}
#boss{top:112px;left:50%;transform:translateX(-50%);width:min(520px,70vw);text-align:center}
#boss .bname{font:700 16px "Cinzel",Georgia,serif;color:#f1d9a8;text-shadow:0 1px 3px #000;margin-bottom:3px}
.bbar{height:10px;background:rgba(0,0,0,.55);border:1px solid rgba(239,230,210,.3);border-radius:3px;overflow:hidden}.bbar i{display:block;height:100%;background:linear-gradient(#c8452f,#8f2a1c);will-change:width}
.bbar.thin{height:4px;margin-top:2px;border:none}.bbar.thin i{background:#ffb04a}
#boss .bnote{font-size:12px;color:#ffd9a0;text-shadow:0 1px 2px #000;margin-top:2px;min-height:15px}
#target{top:70px;left:50%;transform:translateX(-50%);width:200px;text-align:center;font-size:12px;text-shadow:0 1px 2px #000}
.tbar{height:5px;background:rgba(0,0,0,.5);border-radius:3px;overflow:hidden;margin-top:2px}.tbar i{display:block;height:100%;background:#c8452f}
#weapons{bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;contain:layout paint}
.slot{position:relative;overflow:hidden}.slot .cd{position:absolute;left:0;bottom:0;height:3px;background:var(--mana);width:0}
.vbar .mark{position:absolute;top:0;bottom:0;width:2px;background:rgba(255,255,255,.5)}
.need .bar i,.vbar i{will-change:width}
.tip{font-size:11px;color:var(--muted);margin-top:5px;border-top:1px solid var(--line);padding-top:4px}.tip b{color:var(--ink)}
.dim{color:var(--muted);font-size:12.5px}.small{font-size:12px}
#feed{left:50%;top:168px;transform:translateX(-50%);width:min(560px,80vw);text-align:center;contain:layout paint}
#feed p{margin:3px 0;font-size:14px;text-shadow:0 1px 3px #000,0 0 8px #000;transition:opacity .6s}
#buffs{left:12px;bottom:118px;font-size:12px;color:#bfe39e;text-shadow:0 1px 2px #000}
#perf{left:50%;bottom:70px;transform:translateX(-50%);font:12px/1.35 ui-monospace,monospace;white-space:pre;color:#cfe}
.slot{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:6px 8px;min-width:84px;text-align:center;font-size:12px}
.slot b{display:block;font-size:10px;color:var(--muted)}
.slot.sel{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}
.slot.off{opacity:.45}
#log{right:12px;bottom:12px;width:360px;contain:layout paint;font-size:12.5px;max-height:190px;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end}
#log p{margin:2px 0;text-shadow:0 1px 2px #000}
#log .good{color:#bfe39e}#log .warn{color:#f0cf7a}#log .bad{color:#f39a84}#log .t{color:var(--muted);font-size:11px;margin-right:4px}
#cross{left:50%;top:50%;width:22px;height:22px;margin:-11px 0 0 -11px}
#cross:before,#cross:after{content:"";position:absolute;background:rgba(255,255,255,.85);box-shadow:0 0 2px #000}
#cross:before{left:10px;top:3px;width:2px;height:16px}#cross:after{top:10px;left:3px;height:2px;width:16px}
#cross.hit:before,#cross.hit:after{background:#ff6a4a;transform:rotate(45deg)}
#prompt{left:50%;top:58%;transform:translateX(-50%);font-size:15px;text-shadow:0 1px 3px #000;white-space:nowrap}
#prompt kbd{background:var(--accent);color:#1a1208;border-radius:3px;padding:0 6px;font:700 13px system-ui;margin-right:6px}
#vignette{inset:0;box-shadow:inset 0 0 180px rgba(160,20,10,0);transition:box-shadow .15s}
#fade{inset:0;background:#000;opacity:0;transition:opacity .4s;display:flex;align-items:center;justify-content:center;font:600 20px "Cinzel",Georgia,serif;color:var(--ink)}
#mode{top:8px;left:50%;transform:translateX(-50%);font-size:11.5px;color:var(--muted)}
#warn{top:92px;left:50%;transform:translateX(-50%);font-size:13px;color:#f3c46a;text-shadow:0 1px 2px #000;text-align:center}
.modal-wrap{position:fixed;inset:0;z-index:40;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}
.modal{width:min(640px,94vw);max-height:86vh;overflow:auto;background:#1b1712;border:1px solid #5a4a32;border-radius:8px;padding:18px 20px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
.modal h2{margin:0 0 4px;font:700 22px "Cinzel",Georgia,serif;color:var(--accent)}
.modal .sub{color:var(--muted);margin:0 0 12px}
.modal p{margin:6px 0}
.btn{pointer-events:auto;cursor:pointer;background:#3a2f22;color:var(--ink);border:1px solid #6a5a40;border-radius:5px;padding:7px 12px;font:600 13px system-ui;margin:3px 4px 3px 0}
.btn:hover{background:#4d3e2c}.btn:disabled{opacity:.4;cursor:default}
.btn.primary{background:var(--accent);color:#1b1208;border-color:var(--accent)}
.row2{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #2e271d}
.card{border:1px solid #3a3022;border-radius:6px;padding:10px 12px;margin:8px 0;background:#221d16}
.card h3{margin:0 0 4px;font-size:15px}
.doc{background:#efe3c4;color:#2a2116;border-radius:4px;padding:12px 14px;font:16px/1.45 Georgia,serif;margin:8px 0 12px}
.accts{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.accts label{display:block;font-size:12px;color:var(--muted);margin-bottom:4px}
.accts select{width:100%;padding:7px;background:#2a231a;color:var(--ink);border:1px solid #5a4a32;border-radius:5px;font-size:14px}
.res-ok{color:var(--good)}.res-bad{color:var(--bad)}
.controls{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px;color:var(--muted)}
.controls b{color:var(--ink)}
.armoury{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin:8px 0}.rack{border:1px solid #4a3e2c;border-radius:6px;padding:10px;background:#1b1610}.rack.own{border-color:var(--accent)}.rack h4{margin:0 0 6px;color:var(--accent)}
.stat{display:grid;grid-template-columns:64px 1fr;gap:6px;align-items:center;font-size:12px;margin:2px 0}.stat i{height:7px;background:#2b2418;border-radius:4px;overflow:hidden}.stat b{display:block;height:100%;background:var(--accent)}
.modal:has(.invwrap),.modal:has(.armoury){width:min(1120px,96vw)}
body.titling .hud,body.titling #feed{display:none!important}
.invwrap{display:grid;grid-template-columns:240px minmax(380px,1fr) 220px;gap:14px;align-items:start}
@media (max-width:900px){.invwrap{grid-template-columns:1fr}}
.invcol h3{margin:4px 0 8px}.invcol .gun{display:grid;grid-template-columns:34px 1fr auto;gap:8px;align-items:center;padding:7px;border:1px solid #4a3e2c;border-radius:6px;margin-bottom:6px;background:#1b1610}
.invcol .gun.on{border-color:var(--accent);background:#2a2014}.gun .gi{font-size:22px;text-align:center}.gun small{color:var(--muted)}.gun .tag{font-size:11px;color:var(--accent)}
.chips{display:flex;flex-wrap:wrap;gap:5px}.chip{font-size:12px;padding:3px 7px;border-radius:10px;background:#2b2418;border:1px solid #4a3e2c}.chip.charm{border-color:#7a6aa0}
.chk{display:block;font-size:13px;margin:4px 0 8px}
.wbar{position:relative;height:20px;background:#1b1610;border:1px solid #4a3e2c;border-radius:4px;overflow:hidden;margin-bottom:8px}.wbar div{height:100%}.wbar span{position:absolute;inset:0;font-size:12px;line-height:20px;padding-left:8px;color:#f0e6d0;text-shadow:0 1px 2px #000}
.tabs{display:flex;flex-wrap:wrap;gap:4px;margin:0 0 8px}.tabs .btn{padding:4px 9px;font-size:12px}
.igrid{display:grid;gap:3px;background:#120e0a;padding:6px;border-radius:6px;border:1px solid #3a2f22}
.igrid .cell{background:#1e1912;border-radius:3px}.igrid .cell.over{background:#2a1512}
.igrid .tile{position:relative;z-index:1;border:1px solid #5a4a34;border-radius:4px;background:#2c241a;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;color:#fff}
.igrid .tile:hover{border-color:var(--accent)}.igrid .tile.sel{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent) inset}
.tile .ic{font-size:22px}.tile .n{position:absolute;right:3px;bottom:1px;font-size:11px;color:#f0e6d0;text-shadow:0 1px 2px #000}
.tile.c-arms{background:#2a2a30}.tile.c-food{background:#2c2618}.tile.c-medicine{background:#2e1c1c}.tile.c-materials{background:#1e2a1e}.tile.c-quest{background:#2a2034}
.detail .big{font-size:44px}.detail h3{margin:2px 0 4px}
#intro{position:fixed;inset:0;z-index:30;background:linear-gradient(90deg,rgba(8,6,4,.92) 0,rgba(8,6,4,.78) 30%,rgba(8,6,4,.15) 62%,rgba(8,6,4,0) 100%),radial-gradient(ellipse at 70% 120%,rgba(0,0,0,.5),transparent 60%);display:flex;align-items:stretch;animation:tin 1.2s ease-out}
@keyframes tin{from{opacity:0}to{opacity:1}}
#intro .tside{width:min(440px,92vw);padding:7vh 0 4vh 6vw;display:flex;flex-direction:column}
#intro .crest{margin-bottom:10px;filter:drop-shadow(0 2px 6px #000)}
#intro .kicker{font:600 12px/1.4 system-ui;letter-spacing:.22em;text-transform:uppercase;color:#b89a62;margin:0 0 10px}
#intro h1{font:700 64px/0.92 "Cinzel",Georgia,serif;color:var(--accent);margin:0 0 30px;letter-spacing:.02em;text-shadow:0 3px 18px rgba(0,0,0,.85),0 0 1px #000}
#intro h1 span{display:block}#intro h1 small{display:block;font:italic 400 22px/1.3 Georgia,serif;color:#d8ccb0;margin:4px 0 2px 4px;letter-spacing:.1em}
#intro .tmenu{display:flex;flex-direction:column;gap:6px;max-width:300px}
#intro .tbtn{text-align:left;background:transparent;border:0;border-left:3px solid transparent;color:#e8dcc0;font:600 19px/1.2 Georgia,serif;padding:9px 14px;cursor:pointer;transition:all .15s;border-radius:0 4px 4px 0}
#intro .tbtn small{display:block;font:400 12px system-ui;color:#a8987a;margin-top:2px}
#intro .tbtn:hover:not([disabled]),#intro .tbtn:focus-visible{border-left-color:var(--accent);background:rgba(216,178,106,.12);color:#fff;padding-left:20px;outline:none}
#intro .tbtn.primary{color:var(--accent);font-size:23px}#intro .tbtn[disabled]{opacity:.35;cursor:default}
#intro .tver{margin-top:auto;color:#8f846e;font-size:12px}
#intro .tnews{position:absolute;right:4vw;bottom:5vh;width:min(320px,80vw);background:rgba(14,11,8,.78);border:1px solid #4a3e2c;border-radius:8px;padding:12px 16px;color:#d8ccb0;font-size:13.5px;backdrop-filter:blur(3px)}
#intro .tnews h3{margin:0 0 6px;color:var(--accent);font:700 14px Georgia,serif;letter-spacing:.08em;text-transform:uppercase}
@media (max-width:700px){#intro h1{font-size:44px}#intro .tnews{display:none}#intro{background:rgba(8,6,4,.82)}}
@media (max-width:900px){#log{display:none}#needs{width:190px}#contract{display:none}}
`;

const PX_DEG = 3, COMP_W = 420;
export type Slot = 'carbine' | 'firebolt' | 'frost' | 'ward' | 'heal' | 'spark';
export const SPELL_COST: Record<B.SpellId, number> = { firebolt: B.SPELLS.firebolt.mana, frost: B.SPELLS.frost.mana, ward: B.SPELLS.ward.mana, heal: B.SPELLS.heal.mana, spark: B.SPELLS.spark.mana };
const SLOTS: [Slot, string][] = [['carbine', '1 · Revolver'], ['firebolt', '2 · Firebolt'], ['frost', '3 · Frost'], ['ward', '4 · Ward'], ['heal', '5 · Mend'], ['spark', '6 · Spark']];
const FEED_COL: Record<string, string> = { survival: '#f0cf7a', combat: '#f39a84', reputation: '#c8b0ff', finance: '#e9b65c', explore: '#a8d8c0', npc: '#9fd0ff', magic: '#8fb8ff' };

/** Persistent HUD: every node is built once; updates only change textContent, widths and classes,
 *  and only when the value changed. (v0.2 rewrote innerHTML ten times a second: layout spikes.) */
export class Hud {
  el: Record<string, HTMLElement> = {};
  private lastLogLen = -1;
  private cache = new Map<HTMLElement | CSSStyleDeclaration, Record<string, string>>();
  private need: Record<string, { row: HTMLElement; bar: HTMLElement; v: HTMLElement }> = {};
  private vb: Record<string, { fill: HTMLElement; text: HTMLElement; cap?: HTMLElement; mark?: HTMLElement }> = {};
  private slotEl: Record<string, { root: HTMLElement; sub: HTMLElement; cd: HTMLElement }> = {};
  private clockEls!: { big: HTMLElement; purse: HTMLElement; debt: HTMLElement; due: HTMLElement };
  private contractEls!: { title: HTMLElement; obj: HTMLElement; dist: HTMLElement; pay: HTMLElement };
  private feedEls: HTMLElement[] = [];
  private questEls!: { title: HTMLElement; lines: HTMLElement[] };
  private compStrip!: HTMLElement; private compMarks: { root: HTMLElement; glyph: HTMLElement; label: HTMLElement }[] = [];
  private bossEls!: { name: HTMLElement; hp: HTMLElement; st: HTMLElement; note: HTMLElement };
  private targetEls!: { name: HTMLElement; hp: HTMLElement };
  hint = 'V to switch view · Esc for menu';
  private slotNames: HTMLElement[] = [];
  /** Show the keys currently bound to the six slots. */
  slotKeys(keys: string[]) { this.slotNames.forEach((e, i) => (e.textContent = `${keys[i] ?? ''} · ${SLOTS[i][1].split(' · ')[1]}`)); }
  modalOpen = false;
  constructor() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const f = document.createElement('link'); f.rel = 'stylesheet'; f.href = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Alegreya+Sans:wght@400;500;700&display=swap'; document.head.appendChild(f);
    const mk = (id: string, cls = 'hud') => { const d = document.createElement('div'); d.id = id; d.className = cls; document.body.appendChild(d); this.el[id] = d; return d; };
    mk('needs', 'hud panel'); mk('vitals', 'hud panel'); mk('rightcol'); mk('clock', 'panel'); mk('quest', 'panel'); mk('contract', 'panel'); mk('compass'); mk('boss'); mk('target');
    for (const k of ['clock', 'quest', 'contract']) this.el.rightcol.appendChild(this.el[k]); mk('weapons'); mk('log'); mk('cross'); mk('prompt'); mk('vignette'); mk('fade'); mk('mode'); mk('warn'); mk('feed'); mk('buffs'); mk('perf', 'hud panel');
    this.el.fade.style.zIndex = '15'; this.el.perf.style.display = 'none';
    const h = (tag: string, cls = '', parent?: HTMLElement, text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent?.appendChild(e); return e; };
    // needs
    h('div', 'title', this.el.needs, 'Body');
    for (const k of B.NEED_KEYS) { const row = h('div', 'need optimal', this.el.needs); h('span', 'lab', row, B.NEED_INFO[k].label); const bw = h('span', 'bar', row); const bar = h('i', '', bw); const v = h('span', 'v', row); this.need[k] = { row, bar, v }; }
    const tip = h('div', 'tip', this.el.needs); tip.innerHTML = 'Spells burn <b>calories</b>. Refilling mana drinks <b>water</b>.';
    // vitals
    for (const k of ['hp', 'mana', 'stam', 'load']) {
      const row = h('div', 'vbar', this.el.vitals); const fill = h('i', '', row); fill.style.background = `var(--${k === 'stam' ? 'stam' : k === 'load' ? 'load' : k})`;
      const o: any = { fill }; if (k === 'hp') o.cap = h('b', 'cap', row); if (k === 'mana') { o.mark = h('b', 'mark', row); }
      o.text = h('span', '', row); this.vb[k] = o;
    }
    // clock
    this.clockEls = { big: h('div', 'big', this.el.clock), purse: h('div', 'row', this.el.clock), debt: h('div', 'row', this.el.clock), due: h('div', 'row', this.el.clock) };
    h('div', 'title', this.el.contract, 'Notice');
    this.contractEls = { title: h('b', '', h('div', '', this.el.contract)), obj: h('div', 'dim', this.el.contract), dist: h('div', '', this.el.contract), pay: h('div', 'dim small', this.el.contract) };
    for (const [id, n] of SLOTS) { const root = h('div', 'slot', this.el.weapons); root.title = id === 'carbine' ? 'Six-shot revolver' : `${B.SPELLS[id as B.SpellId].desc} Costs ${B.SPELLS[id as B.SpellId].mana} mana and ${B.SPELLS[id as B.SpellId].kcal} kcal.`; const nm = h('span', '', root, n); this.slotNames.push(nm); const sub = h('b', '', root); const cd = h('i', 'cd', root); this.slotEl[id] = { root, sub, cd }; }
    for (let i = 0; i < 4; i++) this.feedEls.push(h('p', '', this.el.feed));
    // quest tracker
    h('div', 'title', this.el.quest, 'Quest'); this.questEls = { title: h('b', '', h('div', '', this.el.quest)), lines: [0, 1, 2].map(() => h('div', 'qline', this.el.quest)) };
    this.el.quest.style.display = 'none';
    // compass strip: letters every 45 degrees on a strip that slides with your heading (transform only, no layout)
    this.compStrip = h('div', 'strip', this.el.compass);
    for (let d = -360; d <= 720; d += 15) { const major = d % 45 === 0; const e = h('span', major ? 'maj' : 'min', this.compStrip, major ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][(((d % 360) + 360) % 360) / 45] : '·'); e.style.left = (d + 360) * PX_DEG + 'px'; }
    h('i', 'needle', this.el.compass);
    for (let i = 0; i < 5; i++) { const m = h('div', 'mark', this.el.compass); m.style.display = 'none'; this.compMarks.push({ root: m, glyph: h('b', '', m, '◆'), label: h('small', '', m) }); }
    // boss bar and target bar
    this.bossEls = { name: h('div', 'bname', this.el.boss), hp: h('i', '', h('div', 'bbar', this.el.boss)), st: h('i', '', h('div', 'bbar thin', this.el.boss)), note: h('div', 'bnote', this.el.boss) };
    this.targetEls = { name: h('span', '', this.el.target), hp: h('i', '', h('div', 'tbar', this.el.target)) };
    this.el.boss.style.display = 'none'; this.el.target.style.display = 'none';
  }
  private put(e: HTMLElement, key: string, v: string, apply: (v: string) => void) { let c = this.cache.get(e); if (!c) { c = {}; this.cache.set(e, c); } if (c[key] !== v) { c[key] = v; apply(v); } }
  private text(e: HTMLElement, v: string) { this.put(e, 't', v, x => (e.textContent = x)); }
  private width(e: HTMLElement, pct: number) { this.put(e, 'w', pct.toFixed(1), x => (e.style.width = x + '%')); }
  private cls(e: HTMLElement, v: string) { this.put(e, 'c', v, x => (e.className = x)); }
  private show(e: HTMLElement, on: boolean) { this.put(e, 'd', on ? '' : 'none', x => (e.style.display = x)); }
  update(s: GameState, slot: Slot, view: 'first' | 'third', prompt: string | null, extra: { site?: string; siteDist?: number; siteDir?: string; shield: number; holstered?: boolean }) {
    for (const k of B.NEED_KEYS) {
      const info = B.NEED_INFO[k], v = s.needs[k], n = this.need[k];
      this.cls(n.row, 'need ' + B.needBand(k, v)); this.width(n.bar, (v / info.max) * 100);
      this.text(n.v, info.unit === 'kcal' || info.unit === 'ml' ? `${Math.round(v)} ${info.unit}` : `${Math.round(v)}${info.unit === '%' ? '%' : ''}`);
    }
    const mh = G.maxHp(s), mm = B.manaMax(s.needs), regen = B.manaRegenFactor(s.needs.hydration);
    this.width(this.vb.hp.fill, Math.max(0, s.hp)); this.width(this.vb.hp.cap!, 100 - mh);
    this.text(this.vb.hp.text, `Health ${Math.max(0, Math.round(s.hp))} / ${mh}${s.wounds.length ? ` · ${s.wounds.length} wound${s.wounds.length > 1 ? 's' : ''} (bandage to lift the cap)` : ''}${extra.shield > 0 ? ` · ward ${Math.round(extra.shield)}` : ''}`);
    this.width(this.vb.mana.fill, (s.mana / 120) * 100); this.put(this.vb.mana.mark!, 'l', (mm / 120 * 100).toFixed(1), x => (this.vb.mana.mark!.style.left = x + '%'));
    this.text(this.vb.mana.text, `Mana ${Math.round(s.mana)} / ${Math.round(mm)}${s.mana < mm - 0.5 ? regen === 0 ? ' · too dry to refill' : regen < 0.7 ? ' · refilling slowly (thirsty)' : ' · refilling (drinks water)' : ''}`);
    this.width(this.vb.stam.fill, s.stamina); this.put(this.vb.stam.fill, 'bg', s.staminaLocked ? 'bad' : 'stam', x => (this.vb.stam.fill.style.background = `var(--${x})`));
    const ld = G.loadState(s);
    this.text(this.vb.stam.text, `Stamina ${Math.round(s.stamina)}${s.staminaLocked ? ' · winded' : ''}`);
    this.width(this.vb.load.fill, Math.min(100, ld.frac / B.LOAD_CRUSHING * 100)); this.put(this.vb.load.fill, 'bg', ld.band, x => (this.vb.load.fill.style.background = x === 'light' ? 'var(--load)' : x === 'heavy' ? 'var(--warn)' : 'var(--bad)'));
    this.text(this.vb.load.text, `Pack ${ld.kg.toFixed(1)} / ${ld.cap} kg${ld.band === 'heavy' ? ' · heavy: slower stamina' : ld.band === 'over' ? ' · overloaded: no sprint' : ld.band === 'crushing' ? ' · crushing load' : ''}`);
    const left = Math.max(0, B.INSTALMENT - s.paidThisCycle);
    this.text(this.clockEls.big, `Day ${G.day(s)} · ${G.clock(s)}`);
    this.text(this.clockEls.purse, `${s.crowns} crowns in your purse${s.savings ? ` · ${s.savings} saved` : ''}`);
    this.text(this.clockEls.debt, `Debt to Aldric Voss: ${s.debt}`);
    this.text(this.clockEls.due, `${left > 0 ? `${left} more due by end of day ${s.nextDueDay}` : `Paid up until day ${s.nextDueDay}`}${s.missed ? ` · ${s.missed} missed` : ''}`);
    const c = s.active; this.show(this.el.contract, !!c);
    if (c) {
      const done = c.progress >= c.count;
      this.text(this.contractEls.title, c.title);
      this.text(this.contractEls.obj, c.kind === 'recovery' ? (done ? 'Carry it back to the board' : `Take it from the cairn at ${extra.site}`) : c.kind === 'courier' ? (done ? 'Return to the board for pay' : `Deliver the letter to the cairn at ${extra.site}`) : (done ? 'Return to the board for pay' : `${c.progress}/${c.count} at ${extra.site}`));
      this.text(this.contractEls.dist, !done && extra.siteDist !== undefined ? `${extra.siteDir} · ${Math.round(extra.siteDist / 5) * 5} m` : '');
      this.text(this.contractEls.pay, `Pay ${G.contractPay(s, c)}${c.prep?.armor ? ' · armoured' : ''}${c.prep?.supplies ? ' · supplied' : ''} · expires end of day ${c.expiresDay}`);
    }
    for (const [id] of SLOTS) {
      const e = this.slotEl[id];
      if (id === 'carbine') { const r = G.gunRounds(s); this.text(e.sub, `${r.mag}/${r.spare}`); const nm = this.slotNames[0], cur = nm.textContent ?? '', want = cur.replace(/ · .*$/, ' · ' + B.GUNS[s.firearm ?? 'revolver'].short + (s.firearm === 'revolver' && s.silverIn > 0 ? ' (silver)' : '')); if (cur !== want) nm.textContent = want; this.cls(e.root, `slot ${slot === id ? 'sel' : ''} ${extra.holstered ? 'off' : ''}`); continue; }
      const sp = B.SPELLS[id as B.SpellId], cd = G.spellReadyIn(s, id as B.SpellId), cost = G.manaCost(s, id as B.SpellId);
      if (id === 'spark') this.show(e.root, s.story.sparkLearned);
      this.text(e.sub, `${cost} mana · ${sp.kcal} kcal`);
      this.cls(e.root, `slot ${slot === id ? 'sel' : ''} ${s.mana < cost || s.needs.calories <= 0 ? 'off' : ''}`);
      this.width(e.cd, sp.cooldown > 1.5 ? (cd / sp.cooldown) * 100 : 0);
    }
    if (s.log.length !== this.lastLogLen) {
      this.lastLogLen = s.log.length;
      this.el.log.innerHTML = s.log.slice(-6).map(l => `<p class="${l.kind}"><span class="t">${l.time}</span>${escapeHtml(l.text)}</p>`).join('');
    }
    this.put(this.el.prompt, 'p', prompt ?? '', x => (this.el.prompt.innerHTML = x ? `<kbd>E</kbd>${escapeHtml(x)}` : ''));
    this.text(this.el.mode, `${view === 'first' ? 'First person' : 'Third person'} · ${this.hint}`);
    const w: string[] = [];
    if (s.needs.bladder > B.T.bladderUrge) w.push('You need the privy');
    if (s.needs.calories < B.T.starving) w.push('Starving: spells weaker');
    if (s.needs.hydration < B.T.dehydrated) w.push('Dehydrated: mana will not refill');
    if (s.needs.fatigue > B.T.exhausted) w.push('Exhausted');
    this.text(this.el.warn, w.join(' · '));
    const bf = G.activeBuffs(s);
    this.text(this.el.buffs, bf.map(b => `${B.BUFFS[b.id].name} ${Math.floor(b.left / 60)}:${String(Math.floor(b.left % 60)).padStart(2, '0')}`).join('   '));
  }
  /** Show the newest feed lines; older ones fade by CSS. */
  feed(lines: { text: string; kind: string; at: number }[], nowMin: number) {
    const last = lines.slice(-4);
    this.feedEls.forEach((e, i) => {
      const l = last[last.length - 1 - i];
      const vis = l && nowMin - l.at < 45;
      this.text(e, vis ? l.text : '');
      this.put(e, 'col', vis ? FEED_COL[l.kind] ?? '#efe6d2' : '', x => (e.style.color = x));
      this.put(e, 'op', vis ? String(Math.max(0.25, 1 - (nowMin - l.at) / 45)) : '0', x => (e.style.opacity = x));
    });
  }
  /** Quest tracker under the clock. */
  quest(q: { title: string; lines: string[] } | null) {
    this.show(this.el.quest, !!q); if (!q) return;
    this.text(this.questEls.title, q.title);
    this.questEls.lines.forEach((e, i) => { this.text(e, q.lines[i] ?? ''); this.show(e, !!q.lines[i]); });
  }
  /** Compass: heading in degrees clockwise from north; markers are bearings to things worth walking to. */
  compass(heading: number, marks: { bearing: number; kind: string; label: string }[]) {
    this.compStrip.style.transform = `translate3d(${(COMP_W / 2 - (heading + 360) * PX_DEG).toFixed(1)}px,0,0)`;
    this.compMarks.forEach((m, i) => {
      const k = marks[i]; this.show(m.root, !!k); if (!k) return;
      let rel = k.bearing - heading; while (rel > 180) rel -= 360; while (rel < -180) rel += 360;
      const lim = COMP_W / 2 / PX_DEG - 4, cl = Math.max(-lim, Math.min(lim, rel));
      m.root.style.transform = `translate3d(${(COMP_W / 2 + cl * PX_DEG).toFixed(1)}px,0,0)`;
      this.cls(m.root, 'mark ' + k.kind + (Math.abs(rel) > lim ? ' edge' : '') + (i % 2 ? ' alt' : ''));
      this.text(m.label, k.label);
    });
  }
  boss(b: { name: string; hp: number; stagger?: number; note?: string } | null) {
    this.show(this.el.boss, !!b); if (!b) return;
    this.text(this.bossEls.name, b.name); this.width(this.bossEls.hp, Math.max(0, b.hp) * 100);
    this.width(this.bossEls.st, Math.max(0, Math.min(1, b.stagger ?? 0)) * 100); this.text(this.bossEls.note, b.note ?? '');
  }
  target(t: { name: string; hp: number } | null) {
    this.show(this.el.target, !!t); if (!t) return;
    this.text(this.targetEls.name, t.name); this.width(this.targetEls.hp, Math.max(0, t.hp) * 100);
  }
  setScale(k: number) { document.documentElement.style.setProperty('--hud', String(k)); }
  perf(txt: string | null) { this.show(this.el.perf, !!txt); if (txt) this.text(this.el.perf, txt); }
  heal(amount: number) { this.el.vignette.style.boxShadow = `inset 0 0 220px rgba(80,220,110,${Math.min(0.6, 0.2 + amount / 50)})`; setTimeout(() => (this.el.vignette.style.boxShadow = 'inset 0 0 180px rgba(160,20,10,0)'), 450); }
  hitmarker() { this.el.cross.classList.add('hit'); setTimeout(() => this.el.cross.classList.remove('hit'), 120); }
  hurt(amount: number) { const a = Math.min(0.75, amount / 25); this.el.vignette.style.boxShadow = `inset 0 0 200px rgba(170,20,10,${a})`; setTimeout(() => (this.el.vignette.style.boxShadow = 'inset 0 0 180px rgba(160,20,10,0)'), 220); }
  fade(text: string, ms: number): Promise<void> {
    return new Promise(res => { this.el.fade.textContent = text; this.el.fade.style.opacity = '1'; setTimeout(() => { res(); setTimeout(() => (this.el.fade.style.opacity = '0'), 120); }, ms); });
  }
  modal(html: string, onMount?: (root: HTMLElement, close: () => void) => void): () => void {
    this.modalOpen = true;
    const wrap = document.createElement('div'); wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal">${html}</div>`; document.body.appendChild(wrap);
    const close = () => { wrap.remove(); this.modalOpen = document.querySelector('.modal-wrap') !== null; };
    onMount?.(wrap.querySelector('.modal') as HTMLElement, close);
    return close;
  }
}
export function escapeHtml(s: string) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!)); }
