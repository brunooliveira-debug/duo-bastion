// RÉSONANCE DUO — the shared gauge of a team and its signature ability.
// The gauge fills only when the two players genuinely cooperate (help kills, saves, clean waves, assists…),
// never with time. When full, either player starts the ability; the partner can SYNCHRONISE during the
// short channel for a stronger effect. The ability depends on the PAIR of armies (15 pairs + 6 mirror pairs).
// Effects are composable data blocks interpreted by sim/resonance.ts (no code per pair).
import type { FactionId } from './types';

export const RESO_MAX = 100;
/** Seconds between the trigger and the detonation (telegraph + time for the partner to synchronise). */
export const RESO_CHANNEL = 2.2;
/** Synchronised activation: effect multiplier. */
export const RESO_SYNC_MUL = 1.3;

/** Charge sources (points, gauge = 100). Calibrated with scripts/balance-report.ts: ≈ 1 activation every 4–6 waves in good co-op. */
export const RESO_GAIN = {
  helpKill: 1.4, // your unit kills an enemy of your partner's lane
  helpKillElite: 6,
  helpBossPct: 16, // per 100 % of a boss's HP dealt by helpers
  save: 2, // a leaked enemy dies before reaching the Core
  saveCross: 3.5, // …killed by the partner of the lane owner
  cleanWave: 12, // both lanes without a single leak
  powerAssist: 7, // a commander power cast on the partner's lane (yours was clear)
  syncCast: 6, // both players cast a power within SYNC_WINDOW seconds (once per wave)
  crossSynergy: 0.8, // lightning on a target soaked by an abyssal helper (max once / 2 s per unit)
  rift: 8, // a secondary rift closed by the partner's units
};
export const SYNC_WINDOW = 4;

export type ResoFx =
  | { k: 'stun'; dur: number } // every enemy of the arena (bosses: half)
  | { k: 'slow'; pct: number; dur: number }
  | { k: 'push'; dist: number } // back toward the rift
  | { k: 'mark'; pct: number; dur: number } // enemies take +pct damage
  | { k: 'nova'; dmg: number; zones: number; r: number } // bursts on the densest groups
  | { k: 'burn'; dps: number; dur: number }
  | { k: 'poison'; dps: number; dur: number }
  | { k: 'execute'; th: number; bossPct: number } // non-bosses under th die, bosses lose bossPct of their HP
  | { k: 'haste'; pct: number; dur: number } // allies' attack speed
  | { k: 'dmg'; pct: number; dur: number } // allies' damage
  | { k: 'heal'; pct: number }
  | { k: 'shield'; pct: number }
  | { k: 'coreHeal'; pct: number }
  | { k: 'raise'; unit: string; n: number; life: number } // minions in each lane
  | { k: 'summon'; unit: string; life: number } // one colossus in front of the Core
  | { k: 'revive'; life: number; max: number } // units destroyed this wave come back as ghosts
  | { k: 'dark'; dur: number }; // eclipse (visual)

export interface DuoAbility {
  id: string;
  name: string;
  text: string;
  color: number; // main colour of the visual
  color2: number;
  fx: ResoFx[];
}

const key = (a: FactionId, b: FactionId) => [a, b].sort().join('+');

/** The 15 cross pairs. */
const PAIRS: Record<string, DuoAbility> = {
  [key('astreens', 'rouages')]: {
    id: 'matrice', name: 'MATRICE STELLAIRE', color: 0x9fd8ff, color2: 0xffc04a,
    text: 'Gel instantané de tous les ennemis (2 s) et surcharge technologique : +60 % cadence et +20 % dégâts pendant 7 s.',
    fx: [{ k: 'stun', dur: 2 }, { k: 'haste', pct: 0.6, dur: 7 }, { k: 'dmg', pct: 0.2, dur: 7 }],
  },
  [key('astreens', 'ronces')]: {
    id: 'constellation', name: 'CONSTELLATION SYLVESTRE', color: 0xbfe0ff, color2: 0x7aff8a,
    text: 'Les étoiles marquent les ennemis (+25 % dégâts subis, 8 s), la forêt soigne tes unités de 35 % et empoisonne la horde.',
    fx: [{ k: 'mark', pct: 0.25, dur: 8 }, { k: 'heal', pct: 0.35 }, { k: 'poison', dps: 14, dur: 6 }],
  },
  [key('astreens', 'abysses')]: {
    id: 'maree_astrale', name: 'MARÉE ASTRALE', color: 0x7ff6ff, color2: 0xbfe0ff,
    text: 'Une marée d\'étoiles repousse les ennemis de 5 m, les ralentit de 50 % (5 s) et les marque (+20 % dégâts subis).',
    fx: [{ k: 'push', dist: 5 }, { k: 'slow', pct: 0.5, dur: 5 }, { k: 'mark', pct: 0.2, dur: 6 }],
  },
  [key('astreens', 'solaires')]: {
    id: 'supernova', name: 'SUPERNOVA', color: 0xfff0a0, color2: 0xff8a3a,
    text: 'Une étoile naît au-dessus du Bastion puis explose sur 4 zones : dégâts massifs, étourdissement et brûlure.',
    fx: [{ k: 'nova', dmg: 150, zones: 4, r: 3.2 }, { k: 'stun', dur: 1 }, { k: 'burn', dps: 12, dur: 5 }],
  },
  [key('astreens', 'necrose')]: {
    id: 'etoile_noire', name: 'ÉTOILE NOIRE', color: 0xc48bff, color2: 0xbfe0ff,
    text: 'Une étoile morte écrase la horde : marque (+25 %), exécute les ennemis sous 15 % PV, les boss perdent 6 %.',
    fx: [{ k: 'mark', pct: 0.25, dur: 7 }, { k: 'execute', th: 0.15, bossPct: 0.06 }, { k: 'stun', dur: 1 }],
  },
  [key('rouages', 'ronces')]: {
    id: 'serre', name: 'SERRE MÉCANIQUE', color: 0x9aff7a, color2: 0xffc04a,
    text: 'Engrenages et racines : soin de 40 %, +40 % cadence (8 s) et un Gardien Sylvestre blindé se déploie (15 s).',
    fx: [{ k: 'heal', pct: 0.4 }, { k: 'haste', pct: 0.4, dur: 8 }, { k: 'summon', unit: 'sylvain', life: 15 }],
  },
  [key('rouages', 'abysses')]: {
    id: 'leviathan', name: 'LÉVIATHAN MÉCANIQUE', color: 0x5ad8ff, color2: 0xffc04a,
    text: 'Un léviathan de métal surgit devant le Core (16 s) : il provoque, écrase en zone et étourdit. Bouclier de 30 % pour tous.',
    fx: [{ k: 'summon', unit: 'leviathan', life: 16 }, { k: 'shield', pct: 0.3 }],
  },
  [key('rouages', 'solaires')]: {
    id: 'fournaise', name: 'FOURNAISE', color: 0xff9a3a, color2: 0xffd060,
    text: 'Le Bastion surchauffe : 3 explosions de forge, brûlure de 6 s et +40 % cadence pendant 7 s.',
    fx: [{ k: 'nova', dmg: 110, zones: 3, r: 3 }, { k: 'burn', dps: 16, dur: 6 }, { k: 'haste', pct: 0.4, dur: 7 }],
  },
  [key('rouages', 'necrose')]: {
    id: 'machine_interdite', name: 'MACHINE INTERDITE', color: 0xb07aff, color2: 0xffc04a,
    text: 'Les unités détruites pendant cette vague reviennent en constructions fantômes (12 s) et tout le monde gagne +20 % dégâts.',
    fx: [{ k: 'revive', life: 12, max: 6 }, { k: 'dmg', pct: 0.2, dur: 8 }, { k: 'raise', unit: 'squelette', n: 2, life: 12 }],
  },
  [key('ronces', 'abysses')]: {
    id: 'mangrove', name: 'MANGROVE PRIMORDIALE', color: 0x5adc8a, color2: 0x3fd0c9,
    text: 'Des racines envahissent le champ de bataille : ennemis immobilisés 2,5 s et empoisonnés, tes unités régénèrent 40 %.',
    fx: [{ k: 'stun', dur: 2.5 }, { k: 'poison', dps: 16, dur: 6 }, { k: 'heal', pct: 0.4 }],
  },
  [key('ronces', 'solaires')]: {
    id: 'cendres_fertiles', name: 'CENDRES FERTILES', color: 0xffb04a, color2: 0x8aff6a,
    text: 'Le feu purifie et la forêt repousse : brûlure + poison sur toute la horde, soin de 30 % et +15 % dégâts (8 s).',
    fx: [{ k: 'burn', dps: 16, dur: 6 }, { k: 'poison', dps: 12, dur: 6 }, { k: 'heal', pct: 0.3 }, { k: 'dmg', pct: 0.15, dur: 8 }],
  },
  [key('ronces', 'necrose')]: {
    id: 'jardin_ossements', name: 'JARDIN DES OSSEMENTS', color: 0x9aff9a, color2: 0xc48bff,
    text: 'Des squelettes poussent du sol dans chaque voie (3 par voie, 14 s), la horde est empoisonnée et tes unités soignées de 20 %.',
    fx: [{ k: 'raise', unit: 'squelette', n: 3, life: 14 }, { k: 'poison', dps: 14, dur: 6 }, { k: 'heal', pct: 0.2 }],
  },
  [key('abysses', 'solaires')]: {
    id: 'geyser', name: 'GEYSER DE LAVE', color: 0xff6a3a, color2: 0x5ad8ff,
    text: 'Vapeur et magma : les ennemis sont repoussés de 4 m, 3 geysers explosent et la horde brûle.',
    fx: [{ k: 'push', dist: 4 }, { k: 'nova', dmg: 110, zones: 3, r: 3 }, { k: 'burn', dps: 14, dur: 5 }],
  },
  [key('abysses', 'necrose')]: {
    id: 'abysse_noir', name: 'ABYSSE NOIR', color: 0x4a6aff, color2: 0xc48bff,
    text: 'Les eaux noires engloutissent la horde : -60 % vitesse (6 s), exécution sous 15 % PV et bouclier de 25 % pour tes unités.',
    fx: [{ k: 'slow', pct: 0.6, dur: 6 }, { k: 'execute', th: 0.15, bossPct: 0.05 }, { k: 'shield', pct: 0.25 }],
  },
  [key('solaires', 'necrose')]: {
    id: 'eclipse', name: 'ÉCLIPSE TOTALE', color: 0xffa040, color2: 0x8a3aff,
    text: 'Le terrain plonge dans l\'obscurité : la horde brûle intensément, les ennemis sous 18 % PV sont exécutés, les boss perdent 8 %.',
    fx: [{ k: 'dark', dur: 2.5 }, { k: 'burn', dps: 22, dur: 6 }, { k: 'execute', th: 0.18, bossPct: 0.08 }],
  },
};

/** Mirror pairs (both players picked the same army): the army's signature, amplified. */
const ECHO: Record<FactionId, DuoAbility> = {
  astreens: { id: 'echo_astral', name: 'ÉCHO ASTRAL', color: 0xbfe0ff, color2: 0x7fb4ff, text: 'Gel de 2,2 s et marque (+25 % dégâts subis, 8 s).', fx: [{ k: 'stun', dur: 2.2 }, { k: 'mark', pct: 0.25, dur: 8 }] },
  rouages: { id: 'echo_rouages', name: 'ÉCHO DES ROUAGES', color: 0xffc04a, color2: 0xf0b04a, text: '+70 % cadence (8 s), +15 % dégâts et réparation du Core (6 %).', fx: [{ k: 'haste', pct: 0.7, dur: 8 }, { k: 'dmg', pct: 0.15, dur: 8 }, { k: 'coreHeal', pct: 0.06 }] },
  ronces: { id: 'echo_ronces', name: 'ÉCHO DES RONCES', color: 0x7aff8a, color2: 0x6fdc7a, text: 'Soin de 50 %, poison massif et immobilisation de 1,5 s.', fx: [{ k: 'heal', pct: 0.5 }, { k: 'poison', dps: 20, dur: 6 }, { k: 'stun', dur: 1.5 }] },
  abysses: { id: 'echo_abysses', name: 'ÉCHO ABYSSAL', color: 0x3fd0c9, color2: 0x7ff6ff, text: 'Repousse de 5 m, ralentit de 55 % (5 s) et bouclier de 35 %.', fx: [{ k: 'push', dist: 5 }, { k: 'slow', pct: 0.55, dur: 5 }, { k: 'shield', pct: 0.35 }] },
  solaires: { id: 'echo_solaire', name: 'ÉCHO SOLAIRE', color: 0xff8a3a, color2: 0xffd060, text: '4 explosions solaires et brûlure intense.', fx: [{ k: 'nova', dmg: 140, zones: 4, r: 3 }, { k: 'burn', dps: 20, dur: 6 }] },
  necrose: { id: 'echo_necrose', name: 'ÉCHO DU VOILE', color: 0xc48bff, color2: 0x8a3aff, text: 'Exécution sous 18 % PV (boss -7 %) et 3 squelettes par voie (14 s).', fx: [{ k: 'execute', th: 0.18, bossPct: 0.07 }, { k: 'raise', unit: 'squelette', n: 3, life: 14 }] },
};

/** Signature ability of a team (pair of armies, order-independent). */
export function duoAbility(a: FactionId, b: FactionId): DuoAbility {
  return a === b ? ECHO[a] : PAIRS[key(a, b)];
}
export const ALL_DUO_ABILITIES: DuoAbility[] = [...Object.values(PAIRS), ...Object.values(ECHO)];
