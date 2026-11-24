// What kind of day it is: weather and town events, decided by the day number and the save's seed
// (so a reloaded save sees the same sky). Pure functions; the rules read them where they matter.
import { mulberry32 } from './rng';

export type Weather = 'clear' | 'overcast' | 'rain' | 'fog' | 'storm';
export type DayEvent = 'none' | 'market' | 'pilgrims' | 'raidWarning' | 'festival' | 'tinker';
export interface DayInfo { weather: Weather; event: DayEvent }

export const WEATHER_TEXT: Record<Weather, string> = {
  clear: 'Clear skies over the Vale.',
  overcast: 'A grey lid of cloud sits on the valley.',
  rain: 'Steady rain. The roads are mud; fire spells gutter in it and frost bites harder.',
  fog: 'Thick fog. You can hear the Vale, but not see far into it. Neither can anything else.',
  storm: 'A storm is on the hills. Thunder, hard rain, and nobody sensible outdoors.',
};
export const EVENT_TEXT: Record<DayEvent, string> = {
  none: '',
  market: 'Market day: the stalls are full and prices are 15% lower.',
  pilgrims: 'Pilgrims are in town for the Quiet Flame. The Chapel is generous today: healing costs half.',
  raidWarning: 'The Watch has posted a raid warning. Sweep notices pay a fifth more today.',
  festival: "Lamplight Eve: the Tankard pours the first ale free and the square is strung with lanterns.",
  tinker: 'A tinker has set up by the well. He will clean and oil a revolver for two crowns.',
};
export function dayInfo(day: number, seed: number): DayInfo {
  const r = mulberry32(day * 7919 + seed * 31 + 11);
  let weather: Weather = 'clear';
  const w = r();
  if (day > 1) weather = w < 0.44 ? 'clear' : w < 0.64 ? 'overcast' : w < 0.84 ? 'rain' : w < 0.94 ? 'fog' : 'storm';
  let event: DayEvent = 'none';
  const e = r();
  if (day > 1) {
    if (day % 5 === 3) event = 'market';
    else if (day % 14 === 10) event = 'festival';
    else if (e < 0.12) event = 'pilgrims';
    else if (e < 0.24) event = 'raidWarning';
    else if (e < 0.33) event = 'tinker';
  }
  return { weather, event };
}
export const isWet = (w: Weather) => w === 'rain' || w === 'storm';
/** Spell damage in the weather: rain weakens fire and helps frost. */
export function weatherSpellMult(w: Weather, kind: 'fire' | 'frost' | 'spark'): number {
  if (!isWet(w)) return 1;
  return kind === 'fire' ? 0.85 : kind === 'frost' ? 1.15 : 1.1;
}
