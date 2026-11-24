// Graphics, audio and control settings, stored per browser. Applied without reloading the page.
export type Action =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sprint' | 'dodge' | 'interact' | 'reload' | 'melee' | 'holster' | 'view'
  | 'quickEat' | 'inventory' | 'journal' | 'map' | 'lantern' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5' | 'slot6';
export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'forward', label: 'Move forward' }, { id: 'back', label: 'Move back' }, { id: 'left', label: 'Step left' }, { id: 'right', label: 'Step right' },
  { id: 'jump', label: 'Jump' }, { id: 'sprint', label: 'Run (hold)' }, { id: 'dodge', label: 'Dodge step' },
  { id: 'interact', label: 'Use / talk / take' }, { id: 'reload', label: 'Reload' }, { id: 'melee', label: 'Melee strike' },
  { id: 'holster', label: 'Holster / draw' }, { id: 'view', label: 'First / third person' }, { id: 'quickEat', label: 'Eat a loaf' },
  { id: 'inventory', label: 'Pack' }, { id: 'journal', label: 'Journal' }, { id: 'map', label: 'Map' }, { id: 'lantern', label: 'Lantern' },
  { id: 'slot1', label: 'Revolver' }, { id: 'slot2', label: 'Firebolt' }, { id: 'slot3', label: 'Frost Shard' }, { id: 'slot4', label: 'Stone Ward' }, { id: 'slot5', label: 'Mend' }, { id: 'slot6', label: 'Spark' },
];
export const DEFAULT_BINDINGS: Record<Action, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sprint: 'ShiftLeft', dodge: 'KeyC', interact: 'KeyE', reload: 'KeyR', melee: 'KeyF',
  holster: 'KeyH', view: 'KeyV', quickEat: 'KeyQ', inventory: 'Tab', journal: 'KeyJ', map: 'KeyM', lantern: 'KeyL',
  slot1: 'Digit1', slot2: 'Digit2', slot3: 'Digit3', slot4: 'Digit4', slot5: 'Digit5', slot6: 'Digit6',
};
/** Human name for a KeyboardEvent.code. */
export function keyName(code: string): string {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const m: Record<string, string> = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Tab: 'Tab', Enter: 'Enter', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', CapsLock: 'Caps Lock' };
  return m[code] ?? code;
}

export interface Settings {
  resScale: number;          // 0.5 .. 1.5 × devicePixelRatio-capped base
  shadows: 'off' | 'low' | 'high';
  effects: 'low' | 'high';   // grass, particles, tracers, fog distance
  viewDist: number;          // camera far plane, metres
  fov: number;
  sens: number;              // mouse sensitivity multiplier
  invertY: boolean;
  smoothing: number;         // 0 = raw mouse, 1 = light smoothing (one-frame average)
  fpsCap: 0 | 30 | 60;       // 0 = uncapped (display refresh)
  showPerf: boolean;
  rawMouse: boolean;         // ask the browser for unaccelerated pointer-lock input
  volume: number;            // master, 0..1
  sfxVolume: number;         // 0..1
  musicVolume: number;       // 0..1
  hudScale: number;          // 0.85 .. 1.3
  /** v0.8 accessibility (UX A7, A8): scale for head bob, shake and recoil kick (0 = none); run by toggling Shift. */
  camMotion: number; runToggle: boolean;
  bindings: Record<Action, string>;
}
export const DEFAULTS: Settings = { resScale: 1, shadows: 'low', effects: 'high', viewDist: 260, fov: 72, sens: 1, invertY: false, smoothing: 0, fpsCap: 0, showPerf: false, rawMouse: true, volume: 0.7, sfxVolume: 1, musicVolume: 0.6, hudScale: 1, camMotion: 1, runToggle: false, bindings: { ...DEFAULT_BINDINGS } };
const KEY = 'wards-of-millbrook-settings';
export function loadSettings(): Settings {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEFAULTS, ...o, bindings: { ...DEFAULT_BINDINGS, ...(o.bindings ?? {}) } }; } catch { return { ...DEFAULTS, bindings: { ...DEFAULT_BINDINGS } }; }
}
export function saveSettings(s: Settings) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } }
