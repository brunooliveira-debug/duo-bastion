// Model calibration: is the analytic strength model (src/sim/balance.ts, used by the AI and by the
// "conseillé" indicator of the HUD) biased for some armies?
// For each army and wave we find, by simulation, the smallest budget that holds the wave, then compute the
// analytic fight ratio of that army. An unbiased model gives the same ratio for every army.
// usage: npx tsx scripts/calibrate.ts
import { FACTIONS, FACTION_IDS, unitStats } from '../src/data/units';
import { createGame, step, drainEvents } from '../src/sim/game';
import { aiSpendAll } from '../src/sim/ai';
import { expectedGold, fightRatio, groupStrength, waveGroup } from '../src/sim/balance';
import type { FactionId } from '../src/data/types';

const WAVES = [2, 4, 6, 7, 9, 11, 13, 16, 18, 20];
function lane(f: FactionId, wave: number, frac: number) {
  const s = createGame({ mode: 'survival', totalWaves: 9999, difficulty: 'normal', humans: [] }, 11);
  s.wave = wave; s.waveEvent = null; s.rift = null;
  const budget = Math.round(expectedGold(wave) * frac);
  for (const p of s.players) { p.faction = f; p.draft = FACTIONS[f].units.slice(); p.gold = budget; p.ether = 0; p.isAI = true; aiSpendAll(s, p); p.ready = true; }
  const ratio = s.players.reduce((t, p) => t + fightRatio(groupStrength(p.builds.map(b => ({ stats: unitStats(b.defId, b.level, b.branch) }))), waveGroup(wave)), 0) / 2;
  const hp0 = s.teams[0].core.hp;
  s.timer = 0;
  let n = 0;
  while (s.phase !== 'resolution' && s.phase !== 'ended' && n++ < 20 * 200) { step(s); drainEvents(s); }
  return { dmg: hp0 - Math.max(0, s.teams[0].core.hp), ratio };
}
const out: Record<string, number> = {};
for (const f of FACTION_IDS) {
  const rs: number[] = [];
  for (const w of WAVES) {
    let lo = 0.05, hi = 2.5;
    for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (lane(f, w, mid).dmg > 75) lo = mid; else hi = mid; }
    rs.push(lane(f, w, hi).ratio);
  }
  rs.sort((a, b) => a - b);
  out[f] = rs[Math.floor(rs.length / 2)];
  console.log(`${FACTIONS[f].name.padEnd(24)} ratio analytique au seuil de tenue : médiane ${out[f].toFixed(2)}  (${rs.map(r => r.toFixed(2)).join(' ')})`);
}
const med = Object.values(out).sort((a, b) => a - b)[2];
console.log('\nFacteur de calibration (médiane / armée) :');
for (const f of FACTION_IDS) console.log(`  ${f}: ${(med / out[f]).toFixed(3)}`);
