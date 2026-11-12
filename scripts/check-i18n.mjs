// Checks that every language has the same keys and placeholders, and that every key used by the code exists.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(readFileSync('www/i18n.js', 'utf8'), ctx);
const I = ctx.window.CHESS_I18N, langs = ctx.window.CHESS_LANGS.map(l => l.code);
const en = Object.keys(I.en);
let bad = 0;
const fail = m => { console.error('FAIL:', m); bad++; };

for (const l of langs) {
  const keys = Object.keys(I[l]);
  for (const k of en) if (!(k in I[l])) fail(`${l}: missing key ${k}`);
  for (const k of keys) if (!(k in I.en)) fail(`${l}: extra key ${k}`);
  for (const k of en) {
    const a = I.en[k], b = I[l][k];
    if (typeof a === 'string') {
      if (typeof b !== 'string' || !b.trim()) { fail(`${l}.${k}: empty or not a string`); continue; }
      const ph = s => (s.match(/\{[a-z]+\}/g) || []).sort().join(',');
      if (ph(a) !== ph(b)) fail(`${l}.${k}: placeholders differ (${ph(a)} vs ${ph(b)})`);
    } else if (Array.isArray(a) && (!Array.isArray(b) || a.length !== b.length)) fail(`${l}.${k}: array shape differs`);
  }
}

// keys referenced from code
const code = readFileSync('www/game.js', 'utf8') + readFileSync('www/bots.js', 'utf8') + readFileSync('src/native-services.js', 'utf8');
const html = readFileSync('www/index.html', 'utf8');
const used = new Set();
for (const m of code.matchAll(/\b(?:tt|t|T)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) for (const s of m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)) used.add(s[1]);
for (const m of html.matchAll(/data-(?:title-)?i18n="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
for (const m of code.matchAll(/\['(\w+)', '(coord\w+)'\]/g)) used.add(m[2]);
const IGNORE = new Set(['style_', 'bio_', 'bioLegend_', 'r_', 'w', 'b', 'r', 'd', 'l', 'n', 'i', 'k', 'q', 'san', 'bot', 'elo']);
for (const k of used) if (!IGNORE.has(k) && !(k in I.en) && /^[a-z]+[A-Z_]|^(win|draw|loss|you|check|undo|white|black|random|rating|played|wins|draws|losses|rematch|cancel)$/.test(k)) fail(`code uses unknown key ${k}`);
for (const s of ['chaotic', 'aggressive', 'cautious', 'tricky', 'balanced', 'solid', 'tactical', 'positional', 'relentless']) { if (!('style_' + s in I.en)) fail('style_' + s); for (const v of [1, 2]) if (!(`bio_${s}_${v}` in I.en)) fail(`bio_${s}_${v}`); }
for (const l of ['morphy', 'lasker', 'tal', 'capablanca', 'alekhine']) if (!('bioLegend_' + l in I.en)) fail('bioLegend_' + l);
for (const g of ['beginner', 'intermediate', 'advanced', 'master', 'top']) if (!('grp' + g[0].toUpperCase() + g.slice(1) in I.en)) fail('grp ' + g);
for (const s of ['stalemate', 'material', 'repetition', 'fifty', 'agreement']) if (!('r_' + s in I.en)) fail('r_' + s);
if (bad) { console.error(bad + ' i18n problem(s)'); process.exit(1); }
console.log(`PASS: ${langs.length} languages x ${en.length} keys, placeholders match.`);
