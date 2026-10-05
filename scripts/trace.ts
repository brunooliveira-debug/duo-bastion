// Trace one wave of an all-AI game. usage: npx tsx scripts/trace.ts <wave> [seed]
import { createGame, step, drainEvents } from '../src/sim/game';

const target = Number(process.argv[2] ?? 5);
const seed = Number(process.argv[3] ?? 1);
const s = createGame({ mode: 'vsai', totalWaves: 21, difficulty: 'normal', humans: [] }, seed * 7919);
let last = -1;
while (s.phase !== 'ended') {
  step(s);
  drainEvents(s);
  if (s.wave === target && s.phase === 'combat') {
    const sec = Math.floor(s.combatTime);
    if (sec !== last) {
      last = sec;
      const a0 = s.ents.filter(e => e.arena === 0);
      const fmt = (e: typeof a0[0]) => `${e.defId}[${e.x.toFixed(1)},${e.z.toFixed(1)} hp${Math.round(e.hp)} t${e.target}${e.leaked ? ' L' : ''}]`;
      console.log(`t=${sec} core=${Math.round(s.teams[0].core.hp)}`);
      console.log('  units:', a0.filter(e => !e.enemy).map(fmt).join(' '));
      console.log('  enem :', a0.filter(e => e.enemy).map(fmt).join(' '));
    }
  }
  if (s.wave > target) break;
}
