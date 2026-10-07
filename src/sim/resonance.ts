// Résonance DUO — gauge bookkeeping (pure state, no combat helpers: the effects live in combat.ts → fireResonance).
import { RESO_MAX, duoAbility, DuoAbility } from '../data/resonance';
import { anomalyOf, GameState } from './state';

/** Signature ability of a team (pair of its two armies). */
export function teamAbility(s: GameState, team: number): DuoAbility {
  const ps = s.players.filter(p => p.team === team);
  return duoAbility(ps[0].faction, (ps[1] ?? ps[0]).faction);
}

/** Add cooperation charge to a team (credited to pid for the statistics). */
export function addReso(s: GameState, team: number, pts: number, pid: number) {
  const t = s.teams[team];
  if (!t || pts <= 0 || s.ending > 0 || s.phase === 'ended') return;
  if (anomalyOf(s, team) === 'resonance_instable') pts *= 2;
  const before = t.reso;
  t.reso = Math.min(RESO_MAX, t.reso + pts);
  const p = s.players[pid];
  if (p) p.stats.resoGain += t.reso - before;
  if (t.reso >= RESO_MAX && !t.resoFullSeen) {
    t.resoFullSeen = true;
    s.events.push({ t: 'reso', team, k: 'full', pid, ability: teamAbility(s, team).id, sync: false });
  }
}
