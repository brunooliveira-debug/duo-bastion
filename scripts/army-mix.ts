// What do AI armies actually build? Average share of the army value per unit, per army (all-AI duels).
// usage: npx tsx scripts/army-mix.ts [games=80]
import { FACTIONS, FACTION_IDS, UNITS } from '../src/data/units';
import { createGame, step, drainEvents } from '../src/sim/game';

const GAMES = Number(process.argv[2] ?? 80);
const value: Record<string, number> = {}, level: Record<string, number> = {}, n: Record<string, number> = {};
const total: Record<string, number> = {};
for (let g = 0; g < GAMES; g++) {
  const s = createGame({ mode: 'duel', totalWaves: 21, difficulty: 'normal', humans: [] }, 1000 + g * 7919);
  let k = 0;
  while (s.phase !== 'ended' && !(s.wave === 12 && s.phase === 'combat') && k++ < 20 * 60 * 60) { step(s); drainEvents(s); }
  for (const p of s.players) for (const b of p.builds) {
    value[b.defId] = (value[b.defId] ?? 0) + b.value; level[b.defId] = (level[b.defId] ?? 0) + b.level; n[b.defId] = (n[b.defId] ?? 0) + 1;
    total[p.faction] = (total[p.faction] ?? 0) + b.value;
  }
}
console.log('Composition des armées IA à la vague 12 (part de la valeur, nombre moyen, niveau moyen)');
for (const f of FACTION_IDS) {
  console.log(FACTIONS[f].name);
  for (const id of FACTIONS[f].units) console.log(`  ${UNITS[id].name.padEnd(24)} ${((100 * (value[id] ?? 0)) / Math.max(1, total[f])).toFixed(0).padStart(3)} %   niv ${n[id] ? (level[id] / n[id]).toFixed(1) : '—'}   ×${n[id] ?? 0}`);
}
