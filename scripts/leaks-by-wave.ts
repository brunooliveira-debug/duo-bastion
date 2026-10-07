// Where does each army leak? Average leaks per wave and per army over N all-AI duels.
// usage: npx tsx scripts/leaks-by-wave.ts [games=60]
import { FACTIONS, FACTION_IDS } from '../src/data/units';
import { createGame, step, drainEvents, armyValue } from '../src/sim/game';
import { recommendedValue } from '../src/sim/balance';

const GAMES = Number(process.argv[2] ?? 60);
const leaks: Record<string, number[]> = {}, count: Record<string, number[]> = {}, ratio: Record<string, number[]> = {};
for (const f of FACTION_IDS) { leaks[f] = Array(22).fill(0); count[f] = Array(22).fill(0); ratio[f] = Array(22).fill(0); }
for (let g = 0; g < GAMES; g++) {
  const s = createGame({ mode: 'duel', totalWaves: 21, difficulty: 'normal', humans: [] }, 1000 + g * 7919);
  let prev = s.phase, n = 0;
  while (s.phase !== 'ended' && n++ < 20 * 60 * 60) {
    step(s); drainEvents(s);
    if (s.phase === 'combat' && prev === 'build') for (const p of s.players) { const v = armyValue(p); ratio[p.faction][s.wave] += v / Math.max(1, recommendedValue(s.wave, p.builds, v, 1)); }
    if (s.phase === 'resolution' && prev === 'combat') for (const p of s.players) { leaks[p.faction][s.wave] += p.leakedThisWave; count[p.faction][s.wave]++; }
    prev = s.phase;
  }
}
console.log('Fuites moyennes par vague (et valeur d\'armée / valeur conseillée au début du combat)');
console.log('V   ' + FACTION_IDS.map(f => FACTIONS[f].title.slice(0, 11).padEnd(16)).join(''));
for (let w = 1; w <= 21; w++) console.log(String(w).padEnd(4) + FACTION_IDS.map(f => (count[f][w] ? `${(leaks[f][w] / count[f][w]).toFixed(1)} (${(ratio[f][w] / count[f][w]).toFixed(2)})` : '—').padEnd(16)).join(''));
