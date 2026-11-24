// Procedural sound effects (Web Audio), in the spirit of VEILWORK's audio.ts.
export class Sfx {
  ctx: AudioContext | null = null;
  master!: GainNode;
  private noiseBuf!: AudioBuffer;
  volume = 0.6;
  /** Everything (sound effects and music) passes through `out`; `master` is the effects bus. */
  out!: GainNode;
  private rainGain: GainNode | null = null;
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain(); this.out.gain.value = this.volume; this.out.connect(this.ctx.destination);
      this.master = this.ctx.createGain(); this.master.gain.value = this.sfxVol; this.master.connect(this.out);
      const len = this.ctx.sampleRate * 1.5; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.wind();
    } catch { this.ctx = null; }
  }
  sfxVol = 1;
  setVolume(master: number, sfx: number) { this.volume = master; this.sfxVol = sfx; if (this.ctx) { this.out.gain.value = master; this.master.gain.value = sfx; } }
  /** Steady rain: 0 = none, 1 = outdoors in a storm; pass a lower level when under a roof. */
  rain(level: number) {
    if (!this.ctx) return; const c = this.ctx;
    if (!this.rainGain) { const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.5; this.rainGain = c.createGain(); this.rainGain.gain.value = 0; s.connect(f).connect(this.rainGain).connect(this.master); s.start(); }
    this.rainGain.gain.setTargetAtTime(level * 0.11, c.currentTime, 0.6);
  }
  thunder() { this.noise(90, 0.6, 0.9, 2.2, 'lowpass', 0.05); setTimeout(() => this.noise(140, 0.8, 0.5, 1.6, 'lowpass', 0.1), 350); }
  zap() { this.noise(3200, 0.8, 0.5, 0.18, 'highpass', 0.002); this.tone(1400, 200, 0.25, 0.16, 'sawtooth', 0.002); }
  pickup() { this.tone(880, 1320, 0.1, 0.12, 'triangle'); }
  roll() { this.noise(500, 0.9, 0.35, 0.22, 'bandpass', 0.02); }
  bell() { this.tone(660, 655, 0.3, 1.6, 'sine', 0.01); this.tone(1320, 1310, 0.12, 1.2, 'sine', 0.01); }
  horn() { this.tone(196, 196, 0.35, 1.4, 'sawtooth', 0.15); this.tone(98, 98, 0.3, 1.4, 'triangle', 0.15); }
  quest() { this.tone(523, 523, 0.12, 0.18, 'triangle'); setTimeout(() => this.tone(659, 659, 0.12, 0.18, 'triangle'), 130); setTimeout(() => this.tone(784, 784, 0.14, 0.35, 'triangle'), 260); }
  private env(g: GainNode, a: number, peak: number, dec: number) {
    const t = this.ctx!.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  private noise(freq: number, q: number, peak: number, dec: number, type: BiquadFilterType = 'bandpass', a = 0.004, pan = 0) {
    if (!this.ctx) return; const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); const p = c.createStereoPanner(); p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.master); this.env(g, a, peak, dec); s.start(); s.stop(c.currentTime + a + dec + 0.05);
  }
  private tone(f0: number, f1: number, peak: number, dec: number, type: OscillatorType = 'sine', a = 0.005) {
    if (!this.ctx) return; const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, c.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), c.currentTime + a + dec);
    const g = c.createGain(); o.connect(g).connect(this.master); this.env(g, a, peak, dec); o.start(); o.stop(c.currentTime + a + dec + 0.05);
  }
  private wind() {
    if (!this.ctx) return; const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380;
    const g = c.createGain(); g.gain.value = 0.035;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08; const lg = c.createGain(); lg.gain.value = 160; lfo.connect(lg).connect(f.frequency); lfo.start();
    s.connect(f).connect(g).connect(this.master); s.start();
  }
  shot() { this.noise(1800, 0.7, 0.9, 0.18, 'bandpass', 0.002); this.noise(220, 1, 0.8, 0.35, 'lowpass', 0.002); this.tone(140, 50, 0.5, 0.2, 'triangle', 0.002); }
  dry() { this.tone(2400, 1800, 0.12, 0.04, 'square'); }
  reload() { this.noise(3000, 3, 0.25, 0.05); setTimeout(() => this.noise(2200, 4, 0.3, 0.06), 550); setTimeout(() => this.tone(900, 700, 0.15, 0.06, 'square'), 1150); }
  fire() { this.noise(900, 0.6, 0.5, 0.45, 'bandpass', 0.03); this.tone(320, 90, 0.25, 0.4, 'sawtooth', 0.02); }
  frost() { this.tone(1800, 2600, 0.18, 0.3, 'sine', 0.01); this.noise(5000, 2, 0.25, 0.25, 'highpass', 0.01); }
  ward() { this.tone(220, 440, 0.25, 0.6, 'triangle', 0.05); this.tone(330, 660, 0.15, 0.6, 'sine', 0.05); }
  swing() { this.noise(700, 0.8, 0.45, 0.16, 'bandpass', 0.03); }
  hit() { this.noise(400, 1, 0.7, 0.12, 'lowpass', 0.002); this.tone(160, 70, 0.4, 0.12, 'sine', 0.002); }
  hurt() { this.tone(300, 120, 0.35, 0.25, 'sawtooth', 0.01); this.noise(500, 1, 0.4, 0.2); }
  growl(pan = 0) { this.noise(160, 4, 0.35, 0.5, 'bandpass', 0.08, pan); this.tone(90, 70, 0.2, 0.5, 'sawtooth', 0.08); }
  shout(pan = 0) { this.noise(600, 3, 0.3, 0.35, 'bandpass', 0.04, pan); this.tone(220, 180, 0.15, 0.3, 'square', 0.03); }
  hiss(pan = 0) { this.noise(3500, 1, 0.25, 0.6, 'highpass', 0.1, pan); this.tone(500, 260, 0.1, 0.6, 'sine', 0.1); }
  orb() { this.tone(500, 200, 0.2, 0.5, 'sine', 0.05); }
  step(run: boolean) { this.noise(run ? 260 : 200, 1.4, run ? 0.16 : 0.09, 0.07, 'lowpass', 0.003); }
  land() { this.noise(180, 1, 0.3, 0.12, 'lowpass', 0.002); }
  eat() { for (let i = 0; i < 4; i++) setTimeout(() => this.noise(2500 + Math.random() * 1500, 2, 0.15, 0.05), i * 260); }
  water() { for (let i = 0; i < 6; i++) setTimeout(() => this.tone(600 + Math.random() * 600, 300, 0.06, 0.12, 'sine'), i * 90); }
  coin() { this.tone(2400, 2300, 0.15, 0.25, 'triangle'); setTimeout(() => this.tone(3100, 3000, 0.12, 0.3, 'triangle'), 90); }
  ui() { this.tone(900, 800, 0.08, 0.05, 'triangle'); }
  scribble() { for (let i = 0; i < 5; i++) setTimeout(() => this.noise(4000, 3, 0.07, 0.07), i * 120); }
  good() { this.tone(660, 660, 0.12, 0.15, 'triangle'); setTimeout(() => this.tone(990, 990, 0.12, 0.2, 'triangle'), 110); }
  bad() { this.tone(300, 220, 0.15, 0.3, 'square'); }
  death() { this.tone(200, 40, 0.35, 0.9, 'sawtooth', 0.02); }
}
