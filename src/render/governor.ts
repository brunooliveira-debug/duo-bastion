// Dynamic resolution: holds the refresh rate of the screen (60, 120, 144 Hz…) by scaling the render resolution.
// requestAnimationFrame is locked to the display, so the shortest frame intervals reveal the refresh rate; when the
// smoothed frame time stays above it, the resolution drops a step, and it climbs back slowly when there is headroom.

const RATES = [30, 50, 60, 75, 90, 100, 120, 144, 165, 180, 240, 360];
/** snaps a measured frame interval (ms) to the nearest common refresh rate (returns the interval in ms) */
export function snapRefresh(ms: number) {
  const hz = 1000 / ms;
  let best = RATES[0];
  for (const r of RATES) if (Math.abs(r - hz) < Math.abs(best - hz)) best = r;
  return 1000 / best;
}

export class FrameGovernor {
  scale = 1;
  enabled = true;
  private recent: number[] = [];
  private refreshMs = 1000 / 60;
  private ema = 0;
  private over = 0;
  private under = 0;
  private cooldown = 0;
  private n = 0;
  constructor(public minScale = 0.6, public maxScale = 1) {}

  /** the frame rate it aims for (the display refresh rate) */
  get targetFps() { return Math.round(1000 / this.refreshMs); }
  /** smoothed measured frame rate */
  get fps() { return this.ema ? 1000 / this.ema : 0; }

  /** feed one frame interval in ms; returns true when the resolution scale changed */
  tick(ms: number): boolean {
    if (!this.enabled || !(ms > 0) || ms > 100) return false; // tab in background, hitch: ignore
    this.n++;
    this.recent.push(ms);
    if (this.recent.length > 180) this.recent.shift();
    if (this.recent.length >= 30 && this.n % 15 === 0) {
      // 5th percentile of the last ~2 s ≈ one vsync interval (frames can't come faster than the display)
      const s = [...this.recent].sort((a, b) => a - b);
      this.refreshMs = snapRefresh(s[Math.floor(s.length * 0.05)]);
    }
    this.ema = this.ema ? this.ema + (ms - this.ema) * 0.08 : ms;
    this.cooldown = Math.max(0, this.cooldown - ms);
    const t = this.refreshMs;
    if (this.ema > t * 1.18) { this.over += ms; this.under = 0; }
    else if (this.ema < t * 1.06) { this.under += ms; this.over = 0; }
    else { this.over = Math.max(0, this.over - ms); this.under = Math.max(0, this.under - ms); }
    if (this.cooldown > 0) return false;
    if (this.over > 700 && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, +(this.scale - 0.1).toFixed(2));
      this.over = 0; this.cooldown = 1200;
      return true;
    }
    if (this.under > 4000 && this.scale < this.maxScale) {
      this.scale = Math.min(this.maxScale, +(this.scale + 0.05).toFixed(2));
      this.under = 0; this.cooldown = 2500;
      return true;
    }
    return false;
  }
}
