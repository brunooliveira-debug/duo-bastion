// i18n codemod (v0.8). Two commands:
//   npx tsx scripts/i18n-wrap.ts wrap <files…>   wraps user-facing string literals / template literals in t() (idempotent)
//   npx tsx scripts/i18n-wrap.ts keys <out.json> lists every key the dictionary must cover: t() arguments across src/
//                                                + the human strings of the simulation (translated when displayed)
// Heuristic: a string is "human" when it holds letters and an upper-case letter, an accent, a space or an apostrophe
// (ids are lower-case single tokens). Strings compared with ===, imports, types, CSS/class/html props… are left alone.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SKIP_PROPS = new Set(['class', 'style', 'id', 'type', 'fx', 'icon', 'shape', 'href', 'src', 'role', 'key', 'k', 'kind', 'family', 'category', 'mode', 'attack', 'defense', 'faction', 'color', 'msg', 'to', 'c', 'action', 'autocomplete', 'autocapitalize', 'challenge', 'data-id', 'data-slot']);
const SKIP_CALLEES = /(^|\.)(play|add|remove|toggle|contains|querySelector|querySelectorAll|setProperty|getPropertyValue|getItem|setItem|removeItem|addEventListener|removeEventListener|matchMedia|includes|startsWith|endsWith|split|indexOf|has|get|delete|test|match|exec|localeCompare|log|warn|error|replaceState|pushState|createElement|getContext|setMood|journal|icon|categoryIcon|h|esc|hex|register|rpc|from|eq|order|select|channel|on|track|send|setAttribute|getAttribute|setMode|unlock|dispatchEvent|open|require|import|Error)$/;
const SKIP_ASSIGN = new Set(['className', 'id', 'src', 'href', 'style', 'cursor', 'display', 'background', 'left', 'top', 'width', 'height']);

function hasLetters(s: string) { return /\p{L}[\s\S]*\p{L}/u.test(s); }
function looksHuman(s: string) { return hasLetters(s) && (/[À-ÿ]/.test(s) || /[A-Z]/.test(s) || / /.test(s) || /'/.test(s)) && !/^[a-z0-9_:\-./]+$/.test(s) && !/^#|^0x|^--/.test(s); }

function propName(p: ts.Node): string | null {
  if (ts.isPropertyAssignment(p)) return ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
  return null;
}

/** Should this string / template node be wrapped? */
function wrappable(n: ts.Node, text: string, forceHuman = false): boolean {
  if (!(forceHuman ? hasLetters(text) : looksHuman(text))) return false;
  const p = n.parent;
  if (!p) return false;
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isExternalModuleReference(p)) return false;
  if (ts.isLiteralTypeNode(p) || ts.isTypeNode(p)) return false;
  if ((ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p) || ts.isEnumMember(p)) && p.name === n) return false;
  if (ts.isComputedPropertyName(p) || ts.isElementAccessExpression(p)) return false;
  if (ts.isCaseClause(p)) return false;
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind;
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken || k === ts.SyntaxKind.InKeyword) return false;
    if (k === ts.SyntaxKind.EqualsToken && p.right === n && ts.isPropertyAccessExpression(p.left) && SKIP_ASSIGN.has(p.left.name.text)) return false;
  }
  const pn = propName(p);
  if (pn && SKIP_PROPS.has(pn)) return false;
  if (ts.isCallExpression(p)) {
    const callee = p.expression.getText();
    if (callee === 'tr' || callee.endsWith('.tr')) return false;
    if (SKIP_CALLEES.test(callee) && !(callee === 'h' && p.arguments.indexOf(n as ts.Expression) >= 2)) return false;
    if (callee === 'h' && p.arguments[0] === n) return false;
  }
  if (ts.isNewExpression(p)) return false;
  if (ts.isTemplateSpan(p)) return false; // handled through the whole template
  return true;
}

/** `${a}` → '{0}' keys with single quotes. */
function templateKey(n: ts.TemplateExpression) {
  return n.head.text + n.templateSpans.map((sp, i) => `{${i}}` + sp.literal.text).join('');
}
const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

function wrapFile(file: string) {
  let src = readFileSync(file, 'utf8');
  const hasT = /\bimport \{[^}]*\btr\b[^}]*\} from '[^']*i18n'/.test(src);
  // pass 1: plain string literals
  {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
    const edits: { a: number; b: number; s: string }[] = [];
    const visit = (n: ts.Node) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isTemplateSpan(n.parent)) {
        const forced = !!n.parent && ts.isCallExpression(n.parent) && n.parent.expression.getText() === 'h' && n.parent.arguments.indexOf(n) >= 2;
        if (wrappable(n, n.text, forced)) edits.push({ a: n.getStart(sf), b: n.getEnd(), s: `tr(${quote(n.text)})` });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    for (const e of edits.sort((x, y) => y.a - x.a)) src = src.slice(0, e.a) + e.s + src.slice(e.b);
  }
  // pass 2+: template literals, innermost first (re-parse until nothing is left)
  for (let round = 0; round < 6; round++) {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, true);
    const edits: { a: number; b: number; s: string }[] = [];
    const visit = (n: ts.Node) => {
      if (ts.isTemplateExpression(n)) {
        let nested = false;
        const look = (m: ts.Node) => { if (m !== n && ts.isTemplateExpression(m)) nested = true; ts.forEachChild(m, look); };
        look(n);
        const key = templateKey(n);
        if (!nested && wrappable(n, key)) {
          const args = n.templateSpans.map(sp => sp.expression.getText(sf));
          edits.push({ a: n.getStart(sf), b: n.getEnd(), s: `tr(${quote(key)}${args.length ? ', ' + args.join(', ') : ''})` });
          return; // children handled with the template
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!edits.length) break;
    for (const e of edits.sort((x, y) => y.a - x.a)) src = src.slice(0, e.a) + e.s + src.slice(e.b);
  }
  if (!hasT && /\btr\(/.test(src)) {
    const rel = file.replace(/\\/g, '/').replace(/^src\//, '');
    const depth = rel.split('/').length - 1;
    const imp = `import { tr } from '${depth ? '../'.repeat(depth) : './'}i18n';\n`;
    const m = /^(\/\/[^\n]*\n)*/.exec(src); // after the leading comment block
    const at = m ? m[0].length : 0;
    src = src.slice(0, at) + imp + src.slice(at);
  }
  writeFileSync(file, src, 'utf8');
  console.log('wrapped', file);
}

/** every t() key in src/ + simulation strings (patterns), grouped by file */
function collectKeys(out: string) {
  const files = execSync('git ls-files src', { encoding: 'utf8' }).split(/\r?\n/).filter(f => f.endsWith('.ts'));
  const keys: Record<string, string[]> = {};
  const push = (f: string, k: string) => { (keys[f] ??= []); if (!keys[f].includes(k)) keys[f].push(k); };
  const SIM = /^src\/(sim\/(game|combat|ai|resonance)|net\/Session)\.ts$/;
  for (const f of files) {
    const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && n.expression.getText() === 'tr' && n.arguments.length) {
        const a = n.arguments[0];
        if (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) push(f, a.text);
      } else if (SIM.test(f)) {
        if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && !ts.isTemplateSpan(n.parent) && wrappable(n, n.text)) push(f, n.text);
        else if (ts.isTemplateExpression(n)) { const k = templateKey(n); if (wrappable(n, k)) push(f, k); }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  writeFileSync(out, JSON.stringify(keys, null, 1), 'utf8');
  const n = Object.values(keys).reduce((t, a) => t + a.length, 0);
  console.log('keys:', n, 'in', Object.keys(keys).length, 'files →', out);
}

/** keys used by the code that the English dictionary does not cover (exit code 1 when any) */
async function check() {
  const tmp = 'i18n-keys.tmp.json';
  collectKeys(tmp);
  const keys = JSON.parse(readFileSync(tmp, 'utf8')) as Record<string, string[]>;
  const { EN } = await import('../src/i18n/en');
  const IGNORE = /^[a-zA-Z]+$/; // event / ability ids collected from the simulation files
  let missing = 0;
  for (const f in keys) for (const k of keys[f]) {
    if (EN[k] !== undefined) continue;
    if (/^src\/sim\//.test(f) && IGNORE.test(k)) continue;
    if (/^src\/sim\/game\.ts$/.test(f) && /^(Vex|Morgane|Krull|Ishta|Orso|Sélène)$/.test(k)) continue;
    missing++;
    console.log(`${f}: ${JSON.stringify(k)}`);
  }
  console.log(missing ? `${missing} key(s) missing in EN` : 'EN covers every key');
  process.exitCode = missing ? 1 : 0;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'wrap') rest.forEach(wrapFile);
else if (cmd === 'keys') collectKeys(rest[0] ?? 'i18n-keys.json');
else if (cmd === 'check') check();
else console.log('usage: wrap <files…> | keys <out.json> | check');
