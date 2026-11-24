// Frame-time monitor: FPS, 1% low, worst frame, and a small graph. Toggle with F3.
export class PerfMonitor {
  private times = new Float32Array(600); private i = 0; private n = 0;
  el: HTMLDivElement; private cv: HTMLCanvasElement; private g: CanvasRenderingContext2D; private shown = false; private t = 0;
  constructor() {
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:fixed;left:50%;top:64px;transform:translateX(-50%);z-index:6;background:rgba(10,8,6,.8);border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:6px 8px;font:12px ui-monospace,monospace;color:#e8e0cc;pointer-events:none;display:none';
    this.cv = document.createElement('canvas'); this.cv.width = 240; this.cv.height = 48; this.cv.style.display = 'block'; this.cv.style.marginTop = '4px';
    this.g = this.cv.getContext('2d')!;
    const txt = document.createElement('div'); txt.id = 'perf-txt'; this.el.append(txt, this.cv); document.body.appendChild(this.el);
  }
  toggle() { this.shown = !this.shown; this.el.style.display = this.shown ? 'block' : 'none'; }
  frame(ms: number) {
    this.times[this.i] = ms; this.i = (this.i + 1) % this.times.length; this.n = Math.min(this.n + 1, this.times.length);
    this.t += ms; if (!this.shown || this.t < 250) return; this.t = 0;
    const s = this.stats();
    (this.el.firstChild as HTMLElement).textContent = `${s.fps.toFixed(0)} fps · 1% low ${s.low1.toFixed(0)} · avg ${s.avg.toFixed(1)} ms · worst ${s.worst.toFixed(1)} ms · spikes>33ms ${s.spikes}`;
    const g = this.g; g.clearRect(0, 0, 240, 48); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 48 - 16.7 * 1.2, 240, 1); g.fillRect(0, 48 - 33.3 * 1.2, 240, 1);
    for (let k = 0; k < 240; k++) { const v = this.times[(this.i - 240 + k + this.times.length) % this.times.length]; g.fillStyle = v > 33 ? '#e0644a' : v > 20 ? '#e0b14a' : '#8fc46a'; g.fillRect(k, 48 - Math.min(48, v * 1.2), 1, Math.min(48, v * 1.2)); }
  }
  stats() {
    const a = Array.from(this.times.subarray(0, this.n)).filter(x => x > 0).sort((x, y) => x - y);
    if (!a.length) return { fps: 0, low1: 0, avg: 0, worst: 0, p99: 0, spikes: 0 };
    const avg = a.reduce((x, y) => x + y, 0) / a.length, p99 = a[Math.min(a.length - 1, Math.floor(a.length * 0.99))];
    return { fps: 1000 / avg, low1: 1000 / p99, avg, worst: a[a.length - 1], p99, spikes: a.filter(x => x > 33.4).length };
  }
}
