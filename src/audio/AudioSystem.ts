// AudioSystem — 100 % procedural WebAudio (no asset files, nothing copied).
// SFX are short synth recipes; music is a tiny generative sequencer with moods.
type Mood = 'menu' | 'build' | 'combat' | 'boss' | 'danger' | 'off';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noise!: AudioBuffer;
  private mood: Mood = 'off';
  private step = 0;
  private nextTime = 0;
  private timer: number | null = null;
  private lastPlay = new Map<string, number>();
  sfxVol = 0.8;
  musicVol = 0.5;

  /** Must be called from a user gesture (mobile autoplay rules). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain(); this.master.gain.value = 0.9; this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain(); this.musicBus.connect(this.master);
    this.setVolumes(this.sfxVol, this.musicVol);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.timer = window.setInterval(() => this.schedule(), 50);
  }

  setVolumes(sfx: number, music: number) {
    this.sfxVol = sfx; this.musicVol = music;
    if (!this.ctx) return;
    this.sfxBus.gain.value = sfx;
    this.musicBus.gain.value = music * 0.35;
  }

  setMood(m: Mood) { this.mood = m; }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, t0 = 0, slide = 0, bus?: GainNode) {
    const c = this.ctx!; const t = c.currentTime + t0;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus ?? this.sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }

  private noiseHit(dur: number, vol: number, freq: number, t0 = 0, q = 1) {
    const c = this.ctx!; const t = c.currentTime + t0;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  play(name: string) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = performance.now();
    const minGap = name === 'hit' || name === 'shot' ? 60 : 40;
    if (now - (this.lastPlay.get(name) ?? 0) < minGap) return;
    this.lastPlay.set(name, now);
    switch (name) {
      case 'click': this.tone(880, 0.05, 'triangle', 0.15); break;
      case 'build': this.tone(392, 0.12, 'triangle', 0.25); this.tone(587, 0.18, 'triangle', 0.2, 0.06); this.noiseHit(0.08, 0.2, 2000); break;
      case 'upgrade': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'square', 0.08, i * 0.06)); this.noiseHit(0.3, 0.15, 6000, 0.2, 0.7); break;
      case 'sell': this.tone(500, 0.15, 'triangle', 0.2, 0, 0.6); break;
      case 'coin': this.tone(1318, 0.08, 'square', 0.07); this.tone(1760, 0.14, 'square', 0.06, 0.06); break;
      case 'ether': this.tone(1046, 0.3, 'sine', 0.12, 0, 1.5); this.tone(1568, 0.3, 'sine', 0.08, 0.05, 1.5); break;
      case 'worker': this.noiseHit(0.06, 0.35, 3000); this.tone(330, 0.12, 'square', 0.08, 0.05); break;
      case 'raider': this.tone(140, 0.35, 'sawtooth', 0.18, 0, 0.5); this.noiseHit(0.3, 0.2, 400, 0, 2); break;
      case 'leak': this.tone(220, 0.25, 'square', 0.12, 0, 0.5); break;
      case 'boss': this.tone(98, 1.2, 'sawtooth', 0.22, 0, 0.9); this.tone(147, 1.2, 'sawtooth', 0.15, 0.1, 0.9); this.noiseHit(1, 0.25, 200, 0, 0.5); break;
      case 'bossDie': this.noiseHit(1.2, 0.5, 300, 0, 0.4); [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.15, 0.2 + i * 0.08)); break;
      case 'coreHit': this.tone(80, 0.35, 'sine', 0.5, 0, 0.5); this.noiseHit(0.25, 0.35, 250); break;
      case 'shot': this.tone(1400 + Math.random() * 300, 0.06, 'square', 0.03, 0, 0.5); break;
      case 'hit': this.noiseHit(0.05, 0.08, 1500 + Math.random() * 800, 0, 2); break;
      case 'die': this.tone(300, 0.12, 'triangle', 0.06, 0, 0.4); break;
      case 'pulse': this.tone(200, 0.4, 'sine', 0.15, 0, 2); this.noiseHit(0.3, 0.12, 900, 0, 0.6); break;
      case 'wave': this.tone(262, 0.4, 'triangle', 0.15); this.tone(392, 0.5, 'triangle', 0.12, 0.12); break;
      case 'combat': this.tone(196, 0.25, 'sawtooth', 0.12); this.tone(294, 0.35, 'sawtooth', 0.12, 0.1); this.noiseHit(0.2, 0.2, 500); break;
      case 'ping': this.tone(1200, 0.12, 'sine', 0.2); this.tone(1600, 0.18, 'sine', 0.18, 0.1); break;
      case 'error': this.tone(180, 0.15, 'square', 0.1); this.tone(150, 0.2, 'square', 0.1, 0.1); break;
      case 'victory': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.18, i * 0.14)); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.18, i * 0.22)); break;
      case 'ready': this.tone(660, 0.1, 'triangle', 0.15); this.tone(990, 0.15, 'triangle', 0.15, 0.08); break;
    }
  }

  // ------------------------------------------------ generative music
  private schedule() {
    if (!this.ctx || this.mood === 'off') return;
    const c = this.ctx;
    const bpm = this.mood === 'combat' ? 112 : this.mood === 'boss' || this.mood === 'danger' ? 124 : this.mood === 'menu' ? 76 : 84;
    const spb = 60 / bpm / 2; // eighth notes
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      this.note(this.step, this.nextTime - c.currentTime, spb);
      this.step++;
      this.nextTime += spb;
    }
  }

  private note(step: number, t0: number, spb: number) {
    // A minor-ish progression: Am F C G (science-fantasy pad + arp)
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bar = Math.floor(step / 8) % 4;
    const chord = prog[bar];
    const mf = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    const m = this.mood;
    if (step % 8 === 0) for (const n of chord) this.tone(mf(n), spb * 8, 'sine', m === 'menu' ? 0.05 : 0.04, t0, 0, this.musicBus);
    if (m === 'build' || m === 'menu') {
      if (step % 2 === 0) this.tone(mf(chord[(step / 2) % 3] + 12), spb * 1.5, 'triangle', 0.035, t0, 0, this.musicBus);
    } else {
      // driving bass + arp
      if (step % 2 === 0) this.tone(mf(chord[0] - 24), spb * 0.9, 'sawtooth', 0.05, t0, 0, this.musicBus);
      this.tone(mf(chord[step % 3] + 12 + (step % 8 === 7 ? 2 : 0)), spb * 0.6, 'square', 0.018, t0, 0, this.musicBus);
      if (m === 'boss' || m === 'danger') {
        if (step % 4 === 2) this.tone(mf(chord[0] - 12), spb, 'sawtooth', 0.04, t0, 0.5, this.musicBus);
        if (m === 'danger' && step % 8 === 0) this.tone(880, spb * 2, 'sine', 0.025, t0, 0.7, this.musicBus);
      }
    }
  }
}

export const audio = new AudioSystem();
