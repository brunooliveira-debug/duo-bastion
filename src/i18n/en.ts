// English dictionary (v0.8): French source string → English. `npm run i18n` lists the keys the code uses;
// `npm run i18n:check` reports the ones missing here. Keys with {n} placeholders also match messages built by
// the simulation (numbers / names inside), see src/i18n/index.ts.
import { EN_DATA } from './en-data';
import { EN_HUD } from './en-hud';
import { EN_MENUS } from './en-menus';
import { EN_SIM } from './en-sim';

export const EN: Record<string, string> = { ...EN_DATA, ...EN_SIM, ...EN_HUD, ...EN_MENUS };
