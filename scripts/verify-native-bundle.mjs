import { readFileSync, statSync } from 'node:fs';
const file = 'www/native-services.bundle.js';
const source = readFileSync(file, 'utf8');
if (statSync(file).size < 3000 || !source.includes('ChessNative')) {
  throw new Error('FATAL: native JS bundle is missing. Run npm run native:bundle before iOS packaging.');
}
for (const banned of ['admob', 'AdMob', 'native-purchases', 'NativePurchases', 'interstitial', 'removeads']) {
  if (source.includes(banned)) throw new Error('FATAL: the bundle still contains ads / purchase code: ' + banned);
}
console.log('PASS: native bundle created, no ads or purchase code (' + statSync(file).size + ' bytes).');
