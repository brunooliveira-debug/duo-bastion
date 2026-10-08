// Readable unit texts shared by the HUD, the codex and the company builder.
import type { Ability } from '../data/types';

/** Short readable list of a unit's abilities. */
export function abilitiesText(list: Ability[]): string {
  const t: string[] = [];
  for (const a of list) {
    switch (a.kind) {
      case 'taunt': t.push(`provocation ${a.radius.toFixed(1)} m`); break;
      case 'splash': t.push(`zone ${a.radius.toFixed(1)} m (${Math.round(a.pct * 100)} %)`); break;
      case 'poison': t.push(`poison ${Math.round(a.dps)}/s`); break;
      case 'burn': t.push(`brûlure ${Math.round(a.dps)}/s`); break;
      case 'slowOnHit': t.push(`ralentit ${Math.round(a.slow * 100)} %`); break;
      case 'stunOnHit': t.push(`étourdit ${Math.round(a.chance * 100)} %`); break;
      case 'heal': t.push(`soin ${Math.round(a.amount)}/${a.every}s`); break;
      case 'shieldPulse': t.push(`bouclier ${Math.round(a.amount)}/${a.every}s`); break;
      case 'chain': t.push(`${a.targets} rebonds`); break;
      case 'lifesteal': t.push(`vol de vie ${Math.round(a.pct * 100)} %`); break;
      case 'summon': t.push(`invoque ${a.count}`); break;
      case 'stealth': t.push('camouflage'); break;
      case 'pierce': t.push(`perce ${Math.round(a.pct * 100)} % armure`); break;
      case 'bonusVsBig': t.push(`+${Math.round(a.pct * 100)} % vs gros`); break;
      case 'guardAura': t.push(`aura -${Math.round(a.pct * 100)} % dégâts`); break;
      case 'auraAttackSpeed': t.push(`aura +${Math.round(a.pct * 100)} % cadence`); break;
      case 'hastePulse': t.push(`accélération +${Math.round(a.pct * 100)} %`); break;
      case 'regen': t.push(`régén ${(a.pct * 100).toFixed(1)} %/s`); break;
      case 'interceptor': t.push('intercepteur'); break;
      case 'dash': t.push('charge'); break;
      case 'execute': t.push(`exécute sous ${Math.round(a.threshold * 100)} % PV`); break;
      case 'bonusVsSlowed': t.push(`+${Math.round(a.pct * 100)} % vs ralentis`); break;
      case 'thorns': t.push(`épines ${Math.round(a.pct * 100)} %`); break;
      case 'armorShred': t.push(`-${Math.round(a.pct * 100)} % armure`); break;
      case 'slowPulse': t.push(`onde de ralentissement ${a.radius.toFixed(1)} m`); break;
      case 'stunPulse': t.push(`onde d'étourdissement ${a.radius.toFixed(1)} m`); break;
      case 'novaPulse': t.push(`nova de feu ${a.radius.toFixed(1)} m`); break;
      case 'raise': t.push('relève les morts'); break;
      case 'shieldStart': t.push(`bouclier de départ ${Math.round(a.amount)}`); break;
      case 'veilStart': t.push('camoufle ses voisins'); break;
      case 'ramp': t.push('cadence croissante'); break;
    }
  }
  return t.length ? 'Capacités : ' + t.join(' · ') : '';
}
