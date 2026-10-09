// Inventory of user-facing string literals (AST based). usage: npx tsx scripts/i18n-extract.ts [file...]
import ts from 'typescript';
import { readFileSync } from 'node:fs';
const files = process.argv.slice(2);
const looksHuman = (s: string) => /[À-ÿ]/.test(s) || /[A-Z]/.test(s) || / /.test(s) || /'/.test(s);
for (const f of files) {
  const src = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
      const inT = n.parent && ts.isCallExpression(n.parent) && n.parent.expression.getText() === 't';
      if (!inT && looksHuman(n.text) && !/^#|^0x|^--|^[a-z0-9_:\-\.]+$/.test(n.text) && !(ts.isPropertyAssignment(n.parent) && /^(class|style|id|html|type|fx|icon|shape|href|src|placeholder-id)$/.test(n.parent.name.getText())) && !(ts.isPropertyAssignment(n.parent) && n.parent.name.getText() === 'style')) out.push(JSON.stringify(n.text));
    } else if (ts.isTemplateExpression(n)) {
      const txt = n.head.text + n.templateSpans.map((sp, i) => `{${i}}` + sp.literal.text).join('');
      if (looksHuman(txt) && !(ts.isPropertyAssignment(n.parent) && /^(class|style)$/.test(n.parent.name.getText()))) out.push('T ' + JSON.stringify(txt));
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
  console.log(`## ${f} (${out.length})`);
  for (const s of out) console.log(s);
}
