// Floating damage numbers — readable, not noisy: hits on the same target are summed over a short window,
// only significant hits / crits are shown, at most a dozen at once (DOM pool, no per-frame allocation).
interface Num { el: HTMLDivElement; x: number; y: number; z: number; t: number; dur: number; active: boolean }
interface Acc { id: number; dmg: number; crit: boolean; t: number; x: number; y: number; z: number }

export class DamageNumbers {
  private root: HTMLDivElement;
  private pool: Num[] = [];
  private acc = new Map<number, Acc>();

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'dmg-layer';
    document.body.append(this.root);
    for (let i = 0; i < 14; i++) {
      const el = document.createElement('div');
      el.className = 'dmg';
      el.style.display = 'none';
      this.root.append(el);
      this.pool.push({ el, x: 0, y: 0, z: 0, t: 0, dur: 0.8, active: false });
    }
  }

  /** Record a hit (world position of the target). */
  hit(id: number, dmg: number, crit: boolean, x: number, y: number, z: number) {
    let a = this.acc.get(id);
    if (!a) { a = { id, dmg: 0, crit: false, t: 0.35, x, y, z }; this.acc.set(id, a); }
    a.dmg += dmg; a.crit ||= crit; a.x = x; a.y = y; a.z = z;
    if (crit) a.t = Math.min(a.t, 0.05); // crits pop immediately
  }

  update(dt: number, project: (x: number, y: number, z: number) => { x: number; y: number }) {
    for (const a of [...this.acc.values()]) {
      a.t -= dt;
      if (a.t > 0) continue;
      this.acc.delete(a.id);
      if (a.dmg < 25 && !a.crit) continue;
      const n = this.pool.find(p => !p.active);
      if (!n) continue;
      n.active = true; n.t = 0; n.dur = a.crit ? 1.0 : 0.75; n.x = a.x; n.y = a.y; n.z = a.z;
      n.el.textContent = a.crit ? `${Math.round(a.dmg)}!` : String(Math.round(a.dmg));
      n.el.className = a.crit ? 'dmg crit' : a.dmg > 400 ? 'dmg big' : 'dmg';
      n.el.style.display = '';
    }
    for (const n of this.pool) {
      if (!n.active) continue;
      n.t += dt;
      const k = n.t / n.dur;
      if (k >= 1) { n.active = false; n.el.style.display = 'none'; continue; }
      const p = project(n.x, n.y + k * 0.9, n.z);
      const s = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      n.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${s.toFixed(2)})`;
      n.el.style.opacity = String(k > 0.7 ? (1 - k) / 0.3 : 1);
    }
  }

  clear() { this.acc.clear(); for (const n of this.pool) { n.active = false; n.el.style.display = 'none'; } }
  dispose() { this.root.remove(); }
}
