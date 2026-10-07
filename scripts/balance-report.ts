// Automatic balance analysis. usage: npx tsx scripts/balance-report.ts [games=120] [--quick]
// 1. Unit table: analytic strength per gold for every unit / level / branch, outliers flagged.
// 2. Lane benchmark: each army, same gold budget, fights each wave alone (no sends) → core damage & time.
// 3. Duel league: all-AI duel games with random armies → win rate, economy, sends, powers, progression, matchups, win causes.
// Options: --quick (fewer waves in the PvE bench), --duels (league only), --out=FILE, --json=FILE (before/after comparison).
// Writes BALANCE_REPORT.md and prints a summary.
import { writeFileSync } from 'node:fs';
import { UNITS, FACTIONS, FACTION_IDS, unitStats, unitValueAt, CATEGORY_NAMES } from '../src/data/units';
import { getWave } from '../src/data/waves';
import { createGame, step, drainEvents, armyValue } from '../src/sim/game';
import { aiSpendAll } from '../src/sim/ai';
import { unitDps, unitEhp, expectedGold } from '../src/sim/balance';
import { buildBonuses } from '../src/sim/synergy';
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
// ---------------------------------------------------------------- 3. duel league (instrumented)
log();
log(`## 3. Ligue de duels IA (${GAMES} parties, armées aléatoires, difficulté normale des deux côtés)`);
interface Acc { games: number; wins: number; [k: string]: number }
const acc: Record<string, Acc> = {};
const keys = ['gold', 'ether', 'army', 'level', 'workers', 'income', 'leaks', 'coreDmg', 'firstLeak', 'neverLeak', 'sends', 'sendValue', 'sendDmg', 'casts', 'powerDmg',
  'fusions', 'upgrades', 'helpKills', 'saves', 'syn', 'army5', 'army10', 'army15', 'lvl10', 'lvl15', 'reso', 'orders', 'modules', 'rifts', 'etherLeft', 'goldLeft'] as const;
for (const f of FACTION_IDS) { acc[f] = { games: 0, wins: 0 }; for (const k of keys) acc[f][k] = 0; }
const vs: Record<string, Record<string, { g: number; w: number }>> = {};
for (const a of FACTION_IDS) { vs[a] = {}; for (const b of FACTION_IDS) vs[a][b] = { g: 0, w: 0 }; }
const causes: Record<string, number> = { 'Défense débordée (vagues)': 0, 'Pression des envois': 0, 'PV du Core à la vague finale': 0 };
let decidedEarly = 0, totalWaves = 0;
const avgLevel = (p: GameState['players'][number]) => p.builds.length ? p.builds.reduce((t, b) => t + b.level, 0) / p.builds.length : 0;
for (let g = 0; g < GAMES; g++) {
  const s: GameState = createGame({ mode: 'duel', totalWaves: 21, difficulty: 'normal', humans: [] }, 1000 + g * 7919);
  const snap: Record<number, Record<number, { army: number; lvl: number }>> = {};
  let n = 0, lastW = 0;
  while (s.phase !== 'ended' && n++ < 20 * 60 * 60) {
    step(s); drainEvents(s);
    if (s.phase === 'combat' && s.wave !== lastW) {
      lastW = s.wave;
      if (lastW === 5 || lastW === 10 || lastW === 15) snap[lastW] = Object.fromEntries(s.players.map(p => [p.pid, { army: armyValue(p), lvl: avgLevel(p) }]));
    }
  }
  if (!s.result) continue;
  if (s.teams.some(t => !t.alive)) decidedEarly++;
  totalWaves += s.wave;
  const loser = s.teams.find(t => t.id !== s.result!.winner) as (GameState['teams'][number] & { dmgSends?: number; dmgWaves?: number }) | undefined;
  if (loser) {
    if (loser.alive) causes['PV du Core à la vague finale']++;
    else if ((loser.dmgSends ?? 0) > (loser.dmgWaves ?? 0)) causes['Pression des envois']++;
    else causes['Défense débordée (vagues)']++;
  }
  for (const p of s.players) {
    const a = acc[p.faction], st = p.stats as unknown as Record<string, number>;
    a.games++;
    const won = p.team === s.result.winner;
    if (won) a.wins++;
    for (const o of s.players) if (o.team !== p.team) { vs[p.faction][o.faction].g++; if (won) vs[p.faction][o.faction].w++; }
    a.gold += p.stats.goldEarned; a.ether += p.stats.etherProduced; a.army += armyValue(p); a.level += avgLevel(p);
    a.workers += p.workers; a.income += p.income; a.leaks += p.stats.leaks; a.coreDmg += p.stats.coreDamageCaused;
    if (st.firstLeakWave) a.firstLeak += st.firstLeakWave; else a.neverLeak++;
    a.sends += p.stats.raidersSent; a.sendValue += (st.raiderEther ?? 0) + (st.raiderGold ?? 0); a.sendDmg += st.raiderCoreDmg ?? 0;
    a.casts += p.stats.casts; a.powerDmg += st.powerDmg ?? 0; a.fusions += p.stats.fusions; a.upgrades += p.stats.upgrades;
    a.helpKills += st.helpKills ?? 0; a.saves += st.saves ?? 0;
    a.syn += [...buildBonuses(p.builds, p.runes).values()].reduce((t, b) => t + b.syn.length, 0);
    a.reso += st.resoGain ?? 0; a.orders += st.orders ?? 0; a.rifts += st.riftsClosed ?? 0; a.modules += st.etherModules ?? 0;
    a.etherLeft += p.ether; a.goldLeft += p.gold;
    for (const w of [5, 10, 15] as const) if (snap[w]?.[p.pid]) { a[`army${w}`] += snap[w][p.pid].army; if (w !== 5) a[`lvl${w}`] += snap[w][p.pid].lvl; }
  }
}
const byRate = FACTION_IDS.slice().sort((a, b) => acc[b].wins / Math.max(1, acc[b].games) - acc[a].wins / Math.max(1, acc[a].games));
const avg = (f: string, k: string, d = 0) => (acc[f][k] / Math.max(1, acc[f].games)).toFixed(d);
const N = (f: string) => FACTIONS[f as FactionId].name;
log();
log('| Armée | Parties | Victoires | Taux |');
log('|---|---|---|---|');
for (const f of byRate) log(`| ${N(f)} | ${acc[f].games} | ${acc[f].wins} | ${Math.round((acc[f].wins / Math.max(1, acc[f].games)) * 100)} % |`);
log();
log(`Parties décidées par la destruction d'un Core : ${Math.round((decidedEarly / GAMES) * 100)} % · durée moyenne ${(totalWaves / GAMES).toFixed(1)} vagues`);
log();
log('### 3a. Cause principale de victoire');
for (const [k, v] of Object.entries(causes)) log(`- ${k} : ${Math.round((v / Math.max(1, GAMES)) * 100)} %`);
log();
log('### 3b. Économie (moyennes par joueur et par partie)');
log('| Armée | Or gagné | Éther produit | Ouvriers | Revenu final | Or restant | Éther restant |');
log('|---|---|---|---|---|---|---|');
for (const f of byRate) log(`| ${N(f)} | ${avg(f, 'gold')} | ${avg(f, 'ether')} | ${avg(f, 'workers', 1)} | ${avg(f, 'income')} | ${avg(f, 'goldLeft')} | ${avg(f, 'etherLeft')} |`);
log();
log('### 3c. Défense (PvE subi en duel)');
log('| Armée | Fuites | Dégâts au Core venus de sa voie | Vague du 1er leak | Jamais de fuite | Kills chez le partenaire | Sauvetages |');
log('|---|---|---|---|---|---|---|');
for (const f of byRate) {
  const leaked = acc[f].games - acc[f].neverLeak;
  log(`| ${N(f)} | ${avg(f, 'leaks', 1)} | ${avg(f, 'coreDmg')} | ${leaked ? (acc[f].firstLeak / leaked).toFixed(1) : '—'} | ${Math.round((acc[f].neverLeak / Math.max(1, acc[f].games)) * 100)} % | ${avg(f, 'helpKills', 1)} | ${avg(f, 'saves', 1)} |`);
}
log();
log('### 3d. Envois (Raiders)');
log('| Armée | Envois | Valeur investie | Dégâts au Core adverse | Dégâts par point investi |');
log('|---|---|---|---|---|');
for (const f of byRate) log(`| ${N(f)} | ${avg(f, 'sends', 1)} | ${avg(f, 'sendValue')} | ${avg(f, 'sendDmg')} | ${(acc[f].sendDmg / Math.max(1, acc[f].sendValue)).toFixed(2)} |`);
log();
log('### 3e. Pouvoirs de commandant');
log('| Armée | Pouvoirs lancés | Dégâts des pouvoirs | Dégâts par lancer |');
log('|---|---|---|---|');
for (const f of byRate) log(`| ${N(f)} | ${avg(f, 'casts', 1)} | ${avg(f, 'powerDmg')} | ${(acc[f].powerDmg / Math.max(1, acc[f].casts)).toFixed(0)} |`);
log();
log('### 3f. Progression, synergies, fusions');
log('| Armée | Armée V5 | Armée V10 | Armée V15 | Armée finale | Niveau moyen V10 | Niveau moyen V15 | Niveau final | Améliorations | Fusions | Synergies actives (fin) |');
log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const f of byRate) log(`| ${N(f)} | ${avg(f, 'army5')} | ${avg(f, 'army10')} | ${avg(f, 'army15')} | ${avg(f, 'army')} | ${avg(f, 'lvl10', 2)} | ${avg(f, 'lvl15', 2)} | ${avg(f, 'level', 2)} | ${avg(f, 'upgrades', 1)} | ${avg(f, 'fusions', 2)} | ${avg(f, 'syn', 1)} |`);
if (FACTION_IDS.some(f => acc[f].reso + acc[f].orders + acc[f].rifts + acc[f].modules > 0)) {
  log();
  log('### 3g. Mécaniques v0.4');
  log('| Armée | Charge de Résonance apportée | Ordres donnés | Failles fermées | Éther dans les modules |');
  log('|---|---|---|---|---|');
  for (const f of byRate) log(`| ${N(f)} | ${avg(f, 'reso')} | ${avg(f, 'orders', 1)} | ${avg(f, 'rifts', 2)} | ${avg(f, 'modules')} |`);
}
log();
log('### 3h. Matchups (taux de victoire de la ligne contre la colonne)');
log(`| | ${FACTION_IDS.map(f => FACTIONS[f].title).join(' | ')} |`);
log(`|---|${FACTION_IDS.map(() => '---').join('|')}|`);
for (const a of FACTION_IDS) log(`| ${FACTIONS[a].title} | ${FACTION_IDS.map(b => vs[a][b].g ? `${Math.round((vs[a][b].w / vs[a][b].g) * 100)} %` : '—').join(' | ')} |`);

const outPath = process.argv.find(a => a.startsWith('--out='))?.slice(6) ?? 'BALANCE_REPORT.md';
const jsonPath = process.argv.find(a => a.startsWith('--json='))?.slice(7);
if (!DUELS_ONLY || process.argv.some(a => a.startsWith('--out='))) writeFileSync(outPath, out.join('\n') + '\n');
if (jsonPath) writeFileSync(jsonPath, JSON.stringify({ games: GAMES, acc, vs, causes, decidedEarly, totalWaves }, null, 1));
console.log('\n→ ' + outPath);
