// Before / after comparison of two balance-report JSON files (scripts/balance-report.ts --json=…).
// usage: npx tsx scripts/compare-balance.ts before.json after.json
import { readFileSync } from 'node:fs';
import { FACTIONS, FACTION_IDS } from '../src/data/units';

const [a, b] = process.argv.slice(2).map(f => JSON.parse(readFileSync(f, 'utf8')));
const avg = (r: { acc: Record<string, Record<string, number>> }, f: string, k: string) => r.acc[f][k] / Math.max(1, r.acc[f].games);
const rows: [string, string, number][] = [
  ['Taux de victoire', 'wins', 100], ['Fuites / partie', 'leaks', 1], ['Dégâts au Core venus de sa voie', 'coreDmg', 1],
  ['Envois / partie', 'sends', 1], ['Dégâts des envois au Core adverse', 'sendDmg', 1], ['Pouvoirs lancés', 'casts', 1],
  ['Fusions', 'fusions', 1], ['Niveau moyen final', 'level', 1], ['Kills chez le partenaire', 'helpKills', 1], ['Sauvetages', 'saves', 1],
];
console.log('| Armée | Indicateur | Avant (v0.3) | Après (v0.4) |');
console.log('|---|---|---|---|');
for (const f of FACTION_IDS) for (const [label, k, mul] of rows) {
  const va = k === 'wins' ? (a.acc[f].wins / Math.max(1, a.acc[f].games)) * 100 : avg(a, f, k) * mul;
  const vb = k === 'wins' ? (b.acc[f].wins / Math.max(1, b.acc[f].games)) * 100 : avg(b, f, k) * mul;
  console.log(`| ${FACTIONS[f].name} | ${label} | ${va.toFixed(k === 'level' || k === 'fusions' ? 2 : k === 'wins' ? 0 : 1)}${k === 'wins' ? ' %' : ''} | ${vb.toFixed(k === 'level' || k === 'fusions' ? 2 : k === 'wins' ? 0 : 1)}${k === 'wins' ? ' %' : ''} |`);
}
const spread = (r: typeof a) => { const rates = FACTION_IDS.map(f => (r.acc[f].wins / Math.max(1, r.acc[f].games)) * 100); return `${Math.round(Math.min(...rates))}–${Math.round(Math.max(...rates))} %`; };
console.log(`\nÉcart des taux de victoire : avant ${spread(a)} · après ${spread(b)}`);
console.log(`Parties décidées par la destruction d'un Core : avant ${Math.round((a.decidedEarly / a.games) * 100)} % · après ${Math.round((b.decidedEarly / b.games) * 100)} %`);
console.log(`Causes de victoire avant : ${JSON.stringify(a.causes)}`);
console.log(`Causes de victoire après : ${JSON.stringify(b.causes)}`);
