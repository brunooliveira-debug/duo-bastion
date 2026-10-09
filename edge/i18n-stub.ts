// Server-side stand-in for src/i18n: the simulation never shows text, so translation is the identity.
export const LANG = 'fr';
export function t(s: string, ...args: (string | number)[]): string {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (args[Number(i)] === undefined ? m : String(args[Number(i)]))) : s;
}
export { t as tr };
