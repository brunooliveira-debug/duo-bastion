// Automatic balance analysis. usage: npx tsx scripts/balance-report.ts [games=120] [--quick]
// 1. Unit table: analytic strength per gold for every unit / level / branch, outliers flagged.
// 2. Lane benchmark: each army, same gold budget, fights each wave alone (no sends) → core damage & time.
// 3. Duel league: all-AI duel games with random armies → win rate per faction.
// Writes BALANCE_REPORT.md and prints a summary.
import { writeFileSync } from 'node:fs';
import { UNITS, FACTIONS, FACTION_IDS, unitStats, unitValueAt, CATEGORY_NAMES } from '../src/data/units';
import { getWave } from '../src/data/waves';
import { createGame, step, drainEvents, armyValue } from '../src/sim/game';
import { aiSpendAll } from '../src/sim/ai';
import { unitDps, unitEhp, expectedGold } from '../src/sim/balance';
import type { FactionId } from '../src/data/types';
import type { GameState } from '../src/sim/state';

const GAMES = Number(process.argv.find(a => /^\d+$/.test(a)) ?? 120);
const QUICK = process.argv.includes('--quick');
const DUELS_ONLY = process.argv.includes('--duels');
const out: string[] = [];
const log = (l = '') => { out.push(l); console.log(l); };
const pct = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(x * 100)} %`;
const median = (a: number[]) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

// ---------------------------------------------------------------- 1. unit table
if (!DUELS_ONLY) {
log('# Rapport d\'équilibrage DUO BASTION');
log(`_Généré automatiquement le ${new Date().toISOString().slice(0, 16).replace('T', ' ')}_`);
log();
log('## 1. Efficacité des unités (modèle analytique)');
log('Force = √(DPS × PV effectifs) ÷ or investi. Écart par rapport à la médiane de toutes les unités au même niveau.');
log();
const rows: { id: string; lv: string; eff: number }[] = [];
for (const id of Object.keys(UNITS)) {
  const u = UNITS[id];
  if (u.token) continue;
  for (const [lv, br] of [[1, null], [3, null], [5, 'A'], [5, 'B']] as const) {
    const st = unitStats(id, lv, br);
    const eff = Math.sqrt(unitDps(st) * unitEhp(st)) / unitValueAt(id, lv);
    rows.push({ id, lv: `${lv}${br ?? ''}`, eff });
  }
}
const medBy = (lv: string) => median(rows.filter(r => r.lv === lv).map(r => r.eff));
log('| Armée | Unité | Catégorie | Coût | N1 | N3 | N5-A | N5-B |');
log('|---|---|---|---|---|---|---|---|');
const outliers: string[] = [];
for (const f of FACTION_IDS) {
  for (const id of FACTIONS[f].units) {
    const cells = ['1', '3', '5A', '5B'].map(lv => {
      const r = rows.find(x => x.id === id && x.lv === lv)!;
      const d = r.eff / medBy(lv) - 1;
      if (Math.abs(d) > 0.35) outliers.push(`${UNITS[id].name} N${lv} ${pct(d)}`);
      return pct(d);
    });
    log(`| ${FACTIONS[f].name} | ${UNITS[id].name} | ${CATEGORY_NAMES[UNITS[id].category]} | ${UNITS[id].cost} | ${cells.join(' | ')} |`);
  }
}
log();
log(outliers.length ? `**Écarts > 35 % (à surveiller, souvent compensés par le rôle : soutien, contrôle…)** : ${outliers.join(', ')}` : 'Aucun écart > 35 %.');

// ---------------------------------------------------------------- 2. lane benchmark
log();
log('## 2. Banc d\'essai par voie (même budget, sans envois)');
const WAVES = QUICK ? [1, 3, 5, 8, 10, 12, 15, 17, 19, 21] : Array.from({ length: 21 }, (_, i) => i + 1);
function laneTest(f: FactionId, wave: number, seed: number, frac = 0.85) {
  const s = createGame({ mode: 'survival', totalWaves: 9999, difficulty: 'normal', humans: [] }, seed);
  s.wave = wave;
  s.waveEvent = null;
  const budget = Math.round(expectedGold(wave) * frac);
  for (const p of s.players) {
    p.faction = f; p.draft = FACTIONS[f].units.slice(); p.gold = budget; p.ether = 0; p.isAI = true;
    aiSpendAll(s, p);
    p.ready = true;
  }
  const value = s.players.reduce((t, p) => t + armyValue(p), 0) / 2;
  const hp0 = s.teams[0].core.hp;
  s.timer = 0;
  let n = 0;
  while (s.phase !== 'resolution' && s.phase !== 'ended' && n++ < 20 * 200) { step(s); drainEvents(s); }
  const dmg = hp0 - Math.max(0, s.teams[0].core.hp);
  const leaks = s.players.reduce((t, p) => t + p.leakedThisWave, 0);
  return { dmg, leaks, time: s.combatTime, value };
}
const bench: Record<string, Record<number, { dmg: number; time: number; leaks: number }>> = {};
for (const f of FACTION_IDS) {
  bench[f] = {};
  for (const w of WAVES) {
    const seeds = QUICK ? [11] : [11, 23];
    const rs = seeds.map(sd => laneTest(f, w, sd));
    bench[f][w] = { dmg: rs.reduce((t, r) => t + r.dmg, 0) / rs.length, time: rs.reduce((t, r) => t + r.time, 0) / rs.length, leaks: rs.reduce((t, r) => t + r.leaks, 0) / rs.length };
  }
}
log('Dégâts subis par le Core (2 voies, budget ≈ or attendu × 0,85). 0 = vague tenue sans fuite.');
log();
log(`| Vague | ${FACTION_IDS.map(f => FACTIONS[f].name).join(' | ')} | Moyenne |`);
log(`|---|${FACTION_IDS.map(() => '---').join('|')}|---|`);
for (const w of WAVES) {
  const vals = FACTION_IDS.map(f => bench[f][w].dmg);
  log(`| ${w} ${getWave(w).boss ? '⚠' : ''} | ${vals.map(v => Math.round(v)).join(' | ')} | ${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)} |`);
}
const facTotal = FACTION_IDS.map(f => ({ f, dmg: WAVES.reduce((t, w) => t + bench[f][w].dmg, 0), time: WAVES.reduce((t, w) => t + bench[f][w].time, 0) / WAVES.length }));
log();
log('Total par armée (plus bas = plus solide face aux vagues) :');
for (const r of facTotal.sort((a, b) => a.dmg - b.dmg)) log(`- ${FACTIONS[r.f].name} : ${Math.round(r.dmg)} dégâts au Core, combat moyen ${r.time.toFixed(1)} s`);

// ---------------------------------------------------------------- 2b. hold threshold
/** Smallest budget (fraction of the expected gold) that holds the wave with < 3 % Core damage. */
function threshold(f: FactionId, wave: number) {
  let lo = 0.03, hi = 2.5;
  if (laneTest(f, wave, 11, hi).dmg > 75) return hi;
  for (let i = 0; i < 7; i++) {
    const mid = (lo + hi) / 2;
    if (laneTest(f, wave, 11, mid).dmg > 75) lo = mid; else hi = mid;
  }
  return hi;
}
log();
log("### Budget minimum pour tenir chaque vague (fraction de l'or attendu)");
log("Objectif : ≈ 0,75 pour une vague normale, ≈ 0,9 pour un boss — le reste sert à l'économie et aux envois.");
log();
log(`| Vague | ${FACTION_IDS.map(f => FACTIONS[f].name).join(' | ')} | Médiane |`);
log(`|---|${FACTION_IDS.map(() => '---').join('|')}|---|`);
const thr: Record<number, number> = {};
const facThr: Record<string, number[]> = {};
for (const w of WAVES) {
  const vals = FACTION_IDS.map(f => threshold(f, w));
  vals.forEach((v, i) => (facThr[FACTION_IDS[i]] ??= []).push(v));
  thr[w] = median(vals);
  log(`| ${w} ${getWave(w).boss ? '⚠' : ''} | ${vals.map(v => v.toFixed(2)).join(' | ')} | ${thr[w].toFixed(2)} |`);
}
log();
log('Moyenne par armée (plus bas = plus efficace contre les vagues) :');
for (const f of FACTION_IDS) log(`- ${FACTIONS[f].name} : ${(facThr[f].reduce((a, b) => a + b, 0) / facThr[f].length).toFixed(2)}`);
console.log('THRESHOLDS ' + JSON.stringify(thr));

}
// ---------------------------------------------------------------- 3. duel league
log();
log(`## 3. Ligue de duels IA (${GAMES} parties, armées aléatoires, difficulté normale des deux côtés)`);
const wins: Record<string, { games: number; wins: number }> = {};
for (const f of FACTION_IDS) wins[f] = { games: 0, wins: 0 };
let decidedEarly = 0, totalWaves = 0, sentTotal = 0, castsTotal = 0, fusions = 0, upgrades = 0;
for (let g = 0; g < GAMES; g++) {
  const s: GameState = createGame({ mode: 'duel', totalWaves: 21, difficulty: 'normal', humans: [] }, 1000 + g * 7919);
  let n = 0;
  while (s.phase !== 'ended' && n++ < 20 * 60 * 60) { step(s); drainEvents(s); }
  if (!s.result) continue;
  if (s.wave < 21) decidedEarly++;
  totalWaves += s.wave;
  for (const p of s.players) {
    wins[p.faction].games++;
    if (p.team === s.result.winner) wins[p.faction].wins++;
    sentTotal += p.stats.raidersSent; castsTotal += p.stats.casts; fusions += p.stats.fusions; upgrades += p.stats.upgrades;
  }
}
log();
log('| Armée | Parties | Victoires | Taux |');
log('|---|---|---|---|');
for (const f of FACTION_IDS.slice().sort((a, b) => wins[b].wins / Math.max(1, wins[b].games) - wins[a].wins / Math.max(1, wins[a].games))) {
  const w = wins[f];
  log(`| ${FACTIONS[f].name} | ${w.games} | ${w.wins} | ${Math.round((w.wins / Math.max(1, w.games)) * 100)} % |`);
}
log();
log(`Parties décidées avant la vague 21 : ${Math.round((decidedEarly / GAMES) * 100)} % · durée moyenne ${(totalWaves / GAMES).toFixed(1)} vagues`);
log(`Par joueur et par partie : ${(sentTotal / GAMES / 4).toFixed(1)} envois, ${(castsTotal / GAMES / 4).toFixed(1)} pouvoirs, ${(upgrades / GAMES / 4).toFixed(1)} améliorations, ${(fusions / GAMES / 4).toFixed(1)} fusions.`);

if (!DUELS_ONLY) writeFileSync('BALANCE_REPORT.md', out.join('\n') + '\n');
console.log('\n→ BALANCE_REPORT.md');
