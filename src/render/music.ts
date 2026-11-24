// Generative music and ambience, made in the browser (no audio files). A small scheduler plays
// plucked notes, a soft pad and, in a fight, a drum, from a scale chosen by where you are and
// what is happening. Changing mood only changes what is scheduled next, so it cross-fades by itself.
export type Mood = 'off' | 'home' | 'town' | 'tavern' | 'chapel' | 'vale' | 'night' | 'dungeon' | 'combat' | 'boss';
interface MoodDef { root: number; scale: number[]; tempo: number; pluck: number; pad: number; drum: number; bell: number; octave: number }
// root in Hz; scale in semitones; tempo in beats per minute; pluck/pad/drum/bell are levels 0..1
const MOODS: Record<Exclude<Mood, 'off'>, MoodDef> = {
  home:    { root: 196.0, scale: [0, 2, 4, 7, 9], tempo: 62, pluck: 0.5, pad: 0.5, drum: 0, bell: 0, octave: 1 },        // G major pentatonic, slow
  town:    { root: 220.0, scale: [0, 2, 3, 5, 7, 9, 10], tempo: 84, pluck: 0.7, pad: 0.35, drum: 0, bell: 0, octave: 1 },   // A dorian, a walking lute
  tavern:  { root: 220.0, scale: [0, 2, 3, 5, 7, 9, 10], tempo: 112, pluck: 0.9, pad: 0.2, drum: 0.25, bell: 0, octave: 1 },
  chapel:  { root: 146.8, scale: [0, 2, 5, 7, 9], tempo: 48, pluck: 0.15, pad: 0.8, drum: 0, bell: 0.5, octave: 2 },      // D, open fifths, a bell
  vale:    { root: 164.8, scale: [0, 2, 3, 7, 8], tempo: 56, pluck: 0.4, pad: 0.6, drum: 0, bell: 0, octave: 1 },         // E minor, sparse
  night:   { root: 138.6, scale: [0, 1, 3, 7, 8], tempo: 46, pluck: 0.25, pad: 0.7, drum: 0, bell: 0.15, octave: 1 },     // C# phrygian, uneasy
  dungeon: { root: 110.0, scale: [0, 1, 5, 6, 10], tempo: 40, pluck: 0.12, pad: 0.85, drum: 0, bell: 0.35, octave: 1 },   // low and wrong
  combat:  { root: 146.8, scale: [0, 3, 5, 7, 10], tempo: 132, pluck: 0.7, pad: 0.3, drum: 0.8, bell: 0, octave: 1 },     // D minor pentatonic, driving
  boss:    { root: 123.5, scale: [0, 1, 3, 6, 7, 10], tempo: 148, pluck: 0.8, pad: 0.45, drum: 1, bell: 0.2, octave: 1 },
};

export class Music {
  mood: Mood = 'off';
  private out: GainNode; private padGain: GainNode; private padOsc: OscillatorNode[] = [];
  private nextBeat = 0; private beat = 0; private timer = 0; private seed = 7;
  private vol = 0.6;
  constructor(private ctx: AudioContext, dest: AudioNode) {
    this.out = ctx.createGain(); this.out.gain.value = 0; this.out.connect(dest);
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; this.padGain.connect(lp).connect(this.out);
    for (let i = 0; i < 3; i++) { const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sine'; o.frequency.value = 110; o.detune.value = (i - 1) * 7; o.connect(this.padGain); o.start(); this.padOsc.push(o); }
    this.timer = window.setInterval(() => this.tick(), 120);
  }
  setVolume(v: number) { this.vol = v; this.out.gain.setTargetAtTime(this.mood === 'off' ? 0 : v * 0.5, this.ctx.currentTime, 0.4); }
  setMood(m: Mood) {
    if (m === this.mood) return;
    this.mood = m; const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(m === 'off' ? 0 : this.vol * 0.5, t, 0.8);
    if (m !== 'off') { const d = MOODS[m]; this.padGain.gain.setTargetAtTime(d.pad * 0.16, t, 1.5); this.chord(t); if (this.nextBeat < t) this.nextBeat = t + 0.1; }
  }
  private rnd() { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; }
  private freq(d: MoodDef, degree: number, oct = 0) { const n = d.scale.length, o = Math.floor(degree / n), s = d.scale[((degree % n) + n) % n]; return d.root * Math.pow(2, (s + 12 * (o + oct)) / 12); }
  private chord(t: number) {
    if (this.mood === 'off') return; const d = MOODS[this.mood];
    const base = [0, 0, 3, 4, 0, 2][Math.floor(this.rnd() * 6)];
    this.padOsc[0].frequency.setTargetAtTime(this.freq(d, base, -1), t, 0.9);
    this.padOsc[1].frequency.setTargetAtTime(this.freq(d, base + 2, -1), t, 0.9);
    this.padOsc[2].frequency.setTargetAtTime(this.freq(d, base + 4, -1), t, 0.9);
  }
  private pluck(f: number, t: number, level: number, long = false) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * level, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + (long ? 2.2 : 0.9));
    o.connect(lp).connect(g).connect(this.out); o.start(t); o.stop(t + (long ? 2.3 : 1.0));
  }
  private bell(f: number, t: number, level: number) {
    const c = this.ctx;
    for (const [mul, lv] of [[1, 1], [2.76, 0.4], [5.4, 0.18]] as [number, number][]) { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f * mul; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.09 * level * lv, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2); o.connect(g).connect(this.out); o.start(t); o.stop(t + 3.3); }
  }
  private drum(t: number, level: number, high = false) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(high ? 190 : 105, t); o.frequency.exponentialRampToValueAtTime(high ? 90 : 42, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3 * level, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.out); o.start(t); o.stop(t + 0.3);
  }
  /** Schedule the next half second of notes. */
  private tick() {
    if (this.mood === 'off' || this.ctx.state !== 'running') return;
    const d = MOODS[this.mood], spb = 60 / d.tempo / 2, t = this.ctx.currentTime;   // eighth notes
    if (this.nextBeat < t - 0.5) this.nextBeat = t + 0.05;
    while (this.nextBeat < t + 0.5) {
      const b = this.beat++, at = this.nextBeat; this.nextBeat += spb;
      if (b % 16 === 0) this.chord(at);
      const strong = b % 4 === 0;
      if (d.pluck > 0 && this.rnd() < (strong ? 0.75 : 0.32) * (0.5 + d.pluck * 0.6)) { const deg = Math.floor(this.rnd() * 7) + (strong ? 0 : 2); this.pluck(this.freq(d, deg, d.octave - 1 + (this.rnd() < 0.2 ? 1 : 0)), at, d.pluck * (strong ? 1 : 0.7), d.tempo < 60); }
      if (d.bell > 0 && b % 16 === 8 && this.rnd() < 0.6) this.bell(this.freq(d, [0, 4, 2][Math.floor(this.rnd() * 3)], 1), at, d.bell);
      if (d.drum > 0) { if (b % 4 === 0) this.drum(at, d.drum); else if (b % 4 === 2 && d.drum > 0.5) this.drum(at, d.drum * 0.6, true); else if (d.drum >= 1 && b % 8 === 7) this.drum(at, 0.5, true); }
    }
  }
  dispose() { clearInterval(this.timer); }
}
