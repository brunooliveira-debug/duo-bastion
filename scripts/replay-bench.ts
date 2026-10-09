// How long does a full game take to simulate? (server-side replay budget)
import { createGame, step, drainEvents } from '../src/sim/game';
for (const [mode, waves] of [['vsai', 21], ['survival', 9999]] as const) {
  const t0 = performance.now();
  const s = createGame({ mode, totalWaves: waves, difficulty: 'normal', humans: [] }, 4242);
  let n = 0; const marks: string[] = [];
  let lastWave = 0;
  while (s.phase !== 'ended' && n++ < 20 * 60 * 90) {
    step(s); drainEvents(s);
    if (s.wave !== lastWave) { lastWave = s.wave; if (s.wave % 5 === 0) marks.push(`w${s.wave}@${(performance.now() - t0).toFixed(0)}ms`); }
  }
  console.log(mode, 'ticks', n, 'wave', s.wave, 'ms', (performance.now() - t0).toFixed(0), marks.join(' '), 'journal', s.journal.length);
}
