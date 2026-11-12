// Generates www/flags/xx.svg (SVG flags of all countries) from the npm package "flag-icons" (MIT, https://github.com/lipis/flag-icons).
// Run (needs network):  mkdir /tmp/fi && cd /tmp/fi && npm i flag-icons svgo && node <project>/tools/build_flags.mjs /tmp/fi   (prints the country-code list that is pasted into www/avatars.js)
import fs from "node:fs"; import path from "node:path"; import { createRequire } from "node:module";
const base = path.resolve(process.argv[2] || '.');
const require = createRequire(base + '/');
const { optimize } = require('svgo');
const dir = path.join(base, 'node_modules/flag-icons/flags/4x3');
const SKIP = new Set(['ac', 'pc', 'cp', 'dg', 'ea', 'eu', 'ic', 'ta', 'un', 'xx']);   // not countries
const outDir = new URL('../www/flags/', import.meta.url);
fs.mkdirSync(outDir, { recursive: true });
const codes = []; let total = 0;
for (const f of fs.readdirSync(dir).sort()) {
  const m = f.match(/^([a-z]{2})\.svg$/); if (!m || SKIP.has(m[1])) continue;
  const raw = fs.readFileSync(path.join(dir, f), 'utf8');
  const r = optimize(raw, { multipass: true, floatPrecision: 1, plugins: ['preset-default', 'removeDimensions'] });
  const svg = r.data;
  fs.writeFileSync(new URL(m[1] + '.svg', outDir), svg); total += svg.length; codes.push(m[1].toUpperCase());
}
console.log(codes.length + ' flags, ' + (total / 1024).toFixed(0) + ' KB');
console.log(codes.join(' '));
