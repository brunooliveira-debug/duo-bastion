// Readable unit texts shared by the HUD, the codex and the company builder.
import { tr } from '../i18n';
import type { Ability } from '../data/types';

/** Short readable list of a unit's abilities. */
export function abilitiesText(list: Ability[]): string {
  const t: string[] = [];
  for (const a of list) {
    switch (a.kind) {
      case 'taunt': t.push(tr('provocation {0} m', a.radius.toFixed(1))); break;
      case 'splash': t.push(tr('zone {0} m ({1} %)', a.radius.toFixed(1), Math.round(a.pct * 100))); break;
      case 'poison': t.push(tr('poison {0}/s', Math.round(a.dps))); break;
      case 'burn': t.push(tr('brûlure {0}/s', Math.round(a.dps))); break;
      case 'slowOnHit': t.push(tr('ralentit {0} %', Math.round(a.slow * 100))); break;
      case 'stunOnHit': t.push(tr('étourdit {0} %', Math.round(a.chance * 100))); break;
      case 'heal': t.push(tr('soin {0}/{1}s', Math.round(a.amount), a.every)); break;
      case 'shieldPulse': t.push(tr('bouclier {0}/{1}s', Math.round(a.amount), a.every)); break;
      case 'chain': t.push(tr('{0} rebonds', a.targets)); break;
      case 'lifesteal': t.push(tr('vol de vie {0} %', Math.round(a.pct * 100))); break;
      case 'summon': t.push(tr('invoque {0}', a.count)); break;
      case 'stealth': t.push('camouflage'); break;
      case 'pierce': t.push(tr('perce {0} % armure', Math.round(a.pct * 100))); break;
      case 'bonusVsBig': t.push(tr('+{0} % vs gros', Math.round(a.pct * 100))); break;
      case 'guardAura': t.push(tr('aura -{0} % dégâts', Math.round(a.pct * 100))); break;
      case 'auraAttackSpeed': t.push(tr('aura +{0} % cadence', Math.round(a.pct * 100))); break;
      case 'hastePulse': t.push(tr('accélération +{0} %', Math.round(a.pct * 100))); break;
      case 'regen': t.push(tr('régén {0} %/s', (a.pct * 100).toFixed(1))); break;
      case 'interceptor': t.push('intercepteur'); break;
      case 'dash': t.push('charge'); break;
      case 'execute': t.push(tr('exécute sous {0} % PV', Math.round(a.threshold * 100))); break;
      case 'bonusVsSlowed': t.push(tr('+{0} % vs ralentis', Math.round(a.pct * 100))); break;
      case 'thorns': t.push(tr('épines {0} %', Math.round(a.pct * 100))); break;
      case 'armorShred': t.push(tr('-{0} % armure', Math.round(a.pct * 100))); break;
      case 'slowPulse': t.push(tr('onde de ralentissement {0} m', a.radius.toFixed(1))); break;
      case 'stunPulse': t.push(tr('onde d\'étourdissement {0} m', a.radius.toFixed(1))); break;
      case 'novaPulse': t.push(tr('nova de feu {0} m', a.radius.toFixed(1))); break;
      case 'raise': t.push(tr('relève les morts')); break;
      case 'shieldStart': t.push(tr('bouclier de départ {0}', Math.round(a.amount))); break;
      case 'veilStart': t.push(tr('camoufle ses voisins')); break;
      case 'ramp': t.push(tr('cadence croissante')); break;
    }
  }
  return t.length ? tr('Capacités : ') + t.join(' · ') : '';
}
