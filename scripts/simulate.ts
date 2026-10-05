// Headless balance/QA run: all-AI games, prints a per-wave report.
// usage: npx tsx scripts/simulate.ts [mode=vsai|survival] [waves=21] [difficulty=normal] [seeds=3]
import { createGame, step, drainEvents, armyValue } from '../src/sim/game';
import type { Difficulty, GameMode } from '../src/sim/state';
import { recommendedValue } from '../src/sim/balance';

const mode = (process.argv[2] ?? 'vsai') as GameMode;
const waves = Number(process.argv[3] ?? 21);
const diff = (process.argv[4] ?? 'normal') as Difficulty;
const seeds = Number(process.argv[5] ?? 3);
const verbose = process.argv.includes('-v');

for (let seed = 1; seed <= seeds; seed++) {
  const s = createGame({ mode, totalWaves: mode === 'survival' ? 9999 : waves, difficulty: diff, humans: [] }, seed * 7919);
  let lastWave = 0;
  const t0 = Date.now();
  let ticks = 0;
  while (s.phase !== 'ended' && ticks < 20 * 60 * 120) {
    step(s); ticks++;
    drainEvents(s);
    if (s.phase === 'combat' && s.wave !== lastWave) {
      lastWave = s.wave;
      if (verbose) {
        const line = s.players.map(p => {
          const v = armyValue(p);
          const rec = recommendedValue(s.wave, p.builds.map(b => b.defId), v, 1);
          return `${p.pid}:${p.personality.slice(0, 3)} v${v}/r${rec} g${Math.round(p.gold)} w${p.workers} inc${p.income} e${Math.round(p.ether)}`;
        }).join(' | ');
        console.log(`W${s.wave} cores ${s.teams.map(t => Math.round(t.core.hp)).join('/')} :: ${line}`);
      }
    }
    if (s.phase === 'resolution' && verbose && s.timer > 2.94) {
      console.log(`   end W${s.wave} t=${s.combatTime.toFixed(1)}s leaks ${s.players.map(p => p.leakedThisWave).join(',')} cores ${s.teams.map(t => Math.round(t.core.hp)).join('/')}`);
    }
  }
  console.log(`seed ${seed}: ${s.result?.outcome} at wave ${s.wave} — ${s.result?.reason} | cores ${s.teams.map(t => Math.round(t.core.hp)).join('/')} | game time ${(s.time / 60).toFixed(1)} min | cpu ${Date.now() - t0} ms`);
  for (const p of s.players) console.log(`   P${p.pid} ${p.personality} army ${armyValue(p)} workers ${p.workers} income ${p.income} leaks ${p.stats.leaks} dmg ${Math.round(p.stats.dmgDealt)} best ${p.stats.bestUnit}`);
}
