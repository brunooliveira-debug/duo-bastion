// Trace a boss wave on a lane benchmark. usage: npx tsx scripts/trace-boss.ts <wave> <faction> [budgetFrac]
import { createGame, step, drainEvents, armyValue } from '../src/sim/game';
import { aiSpendAll } from '../src/sim/ai';
import { FACTIONS } from '../src/data/units';
import { expectedGold } from '../src/sim/balance';
import type { FactionId } from '../src/data/types';

const wave = Number(process.argv[2] ?? 10);
const f = (process.argv[3] ?? 'rouages') as FactionId;
const frac = Number(process.argv[4] ?? 1.2);
const s = createGame({ mode: 'survival', totalWaves: 9999, difficulty: 'normal', humans: [] }, 11);
s.wave = wave; s.waveEvent = null;
for (const p of s.players) { p.faction = f; p.draft = FACTIONS[f].units.slice(); p.gold = Math.round(expectedGold(wave) * frac); p.ether = 0; aiSpendAll(s, p); p.ready = true; }
console.log('army', s.players.map(p => `${armyValue(p)}: ${p.builds.map(b => `${b.defId}${b.level}${b.branch ?? ''}@${b.col},${b.row}`).join(' ')}`).join('\n     '));
s.timer = 0;
let last = -1;
const hp0 = s.teams[0].core.hp;
while (s.phase !== 'resolution' && s.phase !== 'ended') {
  step(s);
  for (const e of drainEvents(s)) if (e.t === 'coreHit') console.log(`  t=${s.combatTime.toFixed(1)} coreHit ${Math.round(e.dmg)}`);
  const sec = Math.floor(s.combatTime);
  if (sec !== last && sec % 4 === 0) {
    last = sec;
    const bosses = s.ents.filter(e => e.boss).map(e => `${e.defId} hp${Math.round(e.hp)}/${e.maxHp} sh${Math.round(e.shield)} x${e.x.toFixed(1)} t${e.target}`);
    const units = s.ents.filter(e => !e.enemy && e.owner === 0);
    console.log(`t=${sec} enemies=${s.ents.filter(e => e.enemy).length} units0=${units.length} [${units.map(u => `${u.defId.slice(0, 6)}:${Math.round(u.hp)}${u.target >= 0 ? '' : '-'}`).join(' ')}] ${bosses.join(' ')}`);
  }
}
console.log('core damage', Math.round(hp0 - s.teams[0].core.hp), 'time', s.combatTime.toFixed(1));
