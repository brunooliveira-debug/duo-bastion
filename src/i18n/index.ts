// Translation layer (v0.8). French is the source language: every user-facing string in the code is French and
// `tr()` looks it up in the dictionary of the active language. Missing entries fall back to French, so the game
// never breaks because of a translation. Data strings (unit names, texts…) are translated when their module loads;
// strings produced by the simulation (host side, canonical French) are translated when displayed, with `{n}`
// pattern keys so messages that embed numbers or names still match.
import { EN } from './en';

export type Lang = 'fr' | 'en';
export const LANGS: [Lang, string][] = [['fr', 'Français'], ['en', 'English']];
const KEY = 'duobastion:lang';

function detect(): Lang {
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'fr' || q === 'en') return q;
  } catch { /* no location (tests, server) */ }
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'fr' || v === 'en') return v;
  } catch { /* storage unavailable */ }
  try {
    const nav = String(navigator.languages?.[0] ?? navigator.language ?? 'fr').toLowerCase();
    return nav.startsWith('fr') ? 'fr' : 'en';
  } catch { return 'fr'; }
}

/** Active language, decided once per page load (changing it reloads the game). */
export const LANG: Lang = typeof window === 'undefined' || typeof document === 'undefined' ? 'fr' : detect();

export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch { /* */ }
}

interface Pattern { re: RegExp; nums: number[]; out: string }
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fill = (out: string, args: unknown[]) => out.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] === undefined ? m : String(args[Number(i)])));

/** Builds a translation function for a dictionary (exported for the tests; the game uses `tr`). */
export function makeT(dict: Record<string, string>) {
  const identity = !Object.keys(dict).length;
  let patterns: Pattern[] | null = null;
  const memo = new Map<string, string>();
  const compile = () => {
    patterns = [];
    for (const k in dict) {
      if (!k.includes('{')) continue;
      const nums = [...k.matchAll(/\{(\d+)\}/g)].map(m => Number(m[1]));
      const src = k.split(/\{\d+\}/).map(escapeRe).join('([\\s\\S]+?)');
      patterns.push({ re: new RegExp('^' + src + '$'), nums, out: dict[k] });
    }
  };
  const t = (s: string, ...args: unknown[]): string => {
    let out = dict[s];
    if (out === undefined && !identity && args.length === 0 && typeof s === 'string' && s.length < 400) {
      // a message built by the simulation: try the {n} pattern keys (captured parts are translated too)
      const cached = memo.get(s);
      if (cached !== undefined) out = cached;
      else {
        if (!patterns) compile();
        for (const p of patterns!) {
          const m = p.re.exec(s);
          if (!m) continue;
          out = p.out.replace(/\{(\d+)\}/g, (_, i) => { const at = p.nums.indexOf(Number(i)); return at < 0 ? '' : t(m[at + 1]); });
          break;
        }
        if (memo.size > 500) memo.clear();
        memo.set(s, out ?? s);
      }
    }
    if (out === undefined) out = s;
    return args.length ? fill(out, args) : out;
  };
  return t;
}

/**
 * Translate a French source string. `tr('Niveau {0}', 3)` fills the placeholders; `tr(msg)` on a message built by
 * the simulation matches the `{n}` pattern keys of the dictionary. (`tr`, not `t`: too easily shadowed by locals.)
 */
export const tr = makeT(LANG === 'en' ? EN : {});
export const t = tr;
