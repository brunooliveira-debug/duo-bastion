// Debug: find what keeps a combat running until the 80 s cap. usage: npx tsx scripts/trace-stall.ts [seed=1] [wave=8]
import { createGame, step, drainEvents } from '../src/sim/game';
const seed = Number(process.argv[2] ?? 1), wave = Number(process.argv[3] ?? 8);
const s = createGame({ mode: 'duel', totalWaves: 21, difficulty: 'normal', humans: [] }, seed * 7919);
while (!(s.wave === wave && s.phase === 'combat')) { step(s); drainEvents(s); }
for (let t = 0; t < 20 * 80 && s.phase === 'combat'; t++) {
  step(s); drainEvents(s);
  if (t % (20 * 10) === 0 && t > 20 * 25) {
    console.log(`t=${s.combatTime.toFixed(0)}s`);
    for (const e of s.ents.filter(e => e.enemy)) {
      const near = s.ents.filter(u => !u.enemy && u.arena === e.arena).map(u => ({ u, d: Math.hypot(u.x - e.x, u.z - e.z) })).sort((a, b) => a.d - b.d)[0];
      console.log(`  ${e.defId} arena${e.arena} owner${e.owner} x=${e.x.toFixed(1)} z=${e.z.toFixed(1)} hp=${Math.round(e.hp)}/${e.maxHp} sh=${Math.round(e.shield)} leaked=${e.leaked} tgt=${e.target} tele=${!!e.tele} stun=${(e.stunUntil - s.time).toFixed(1)}`
        + (near ? ` | nearest unit ${near.u.defId} d=${near.d.toFixed(1)} tgt=${near.u.target} spd=${near.u.moveSpeed} task=${near.u.task} retreat=${near.u.retreatUntil > s.combatTime}` : ''));
    }
  }
}
