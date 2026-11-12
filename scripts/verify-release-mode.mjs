import { readFileSync, statSync, existsSync } from 'node:fs';
const prod = process.env.CHESS_RELEASE_MODE === 'production';
if (statSync('www/native-services.bundle.js').size < 3000) throw new Error('RELEASE ERROR: the built JS bundle is missing.');
const cfg = readFileSync('www/privacy-config.js', 'utf8');
if (!/TACTICS_URL\s*=\s*['"]https?:\/\//.test(cfg)) throw new Error('RELEASE ERROR: window.TACTICS_URL (link to Chess Tactics Gym) is missing in www/privacy-config.js.');
if (prod) {
  if (/YOUR-EMAIL@example\.com/.test(cfg)) throw new Error('RELEASE ERROR: set your real contact e-mail in www/privacy-config.js and run: node tools/build_privacy.js');
  if (/YOUR-GITHUB-USER/.test(cfg)) throw new Error('RELEASE ERROR: GPL v3 requires a public source link. Set window.SOURCE_URL in www/privacy-config.js to your real GitHub repository.');
  if (/YOUR-TACTICS-APP-ID/.test(cfg)) throw new Error('RELEASE ERROR: set window.TACTICS_URL in www/privacy-config.js to the App Store link of Chess Tactics Gym.');
  if (!/^https:\/\/apps\.apple\.com\//.test((cfg.match(/TACTICS_URL\s*=\s*'([^']*)'/) || [])[1] || '')) throw new Error('RELEASE ERROR: TACTICS_URL must be an https://apps.apple.com/ link.');
  for (const f of ['LICENSE', 'COPYING', 'THIRD_PARTY_NOTICES.txt']) if (!existsSync(f)) throw new Error('RELEASE ERROR: ' + f + ' is missing (GPL v3 release).');
  if (!existsSync('www/engine/stockfish-19-lite-single.wasm') || !existsSync('www/engine/stockfish-19-lite-single.js')) throw new Error('RELEASE ERROR: Stockfish engine files are missing in www/engine/.');
  console.log('PASS: production checks (no ads), links, GPL files and engine present.');
} else {
  console.log('PASS: TestFlight build (no ads).');
}
