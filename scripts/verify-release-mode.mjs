import { readFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const prod = process.env.CHESS_RELEASE_MODE === 'production';
if (statSync('www/native-services.bundle.js').size < 3000) throw new Error('RELEASE ERROR: the built JS bundle is missing.');
const cfg = readFileSync('www/privacy-config.js', 'utf8');
// one version everywhere: package.json, the build label in the review, the ?v= cache keys of the scripts
{
  const v = JSON.parse(readFileSync('package.json', 'utf8')).version, html = readFileSync('www/index.html', 'utf8');
  const label = (html.match(/class="revBuild"[^>]*>v([\d.]+)</) || [])[1];
  if (label !== v) throw new Error('RELEASE ERROR: index.html shows v' + label + ' but package.json is ' + v + '.');
  const keys = [...html.matchAll(/<script src="[^"]+\?v=(\d+)"/g)].map(m => m[1]);
  const want = v.replace(/\./g, '');
  if (!keys.length || keys.some(k => k !== want)) throw new Error('RELEASE ERROR: script cache keys ?v=' + [...new Set(keys)].join('/') + ' do not match version ' + v + ' (expected ?v=' + want + ').');
}
// the in-app App Store page plugin must be part of the repository (an "ios/" rule in .gitignore once dropped it)
for (const f of ['native-plugins/store-sheet/package.json', 'native-plugins/store-sheet/CapacitorStoreSheet.podspec', 'native-plugins/store-sheet/ios/Sources/StoreSheetPlugin/StoreSheetPlugin.swift'])
  if (!existsSync(f)) throw new Error('RELEASE ERROR: ' + f + ' is missing. Check .gitignore (use /ios/, not ios/) and upload native-plugins/ to the repository.');
if (!/TACTICS_URL\s*=\s*['"]https?:\/\//.test(cfg)) throw new Error('RELEASE ERROR: window.TACTICS_URL (link to Chess Tactics Gym) is missing in www/privacy-config.js.');
if (prod) {
  if (/YOUR-EMAIL@example\.com/.test(cfg)) throw new Error('RELEASE ERROR: set your real contact e-mail in www/privacy-config.js and run: node tools/build_privacy.js');
  if (/YOUR-GITHUB-USER/.test(cfg)) throw new Error('RELEASE ERROR: GPL v3 requires a public source link. Set window.SOURCE_URL in www/privacy-config.js to your real GitHub repository.');
  if (/YOUR-TACTICS-APP-ID/.test(cfg)) throw new Error('RELEASE ERROR: set window.TACTICS_URL in www/privacy-config.js to the App Store link of Chess Tactics Gym.');
  const pt = (cfg.match(/TACTICS_PT\s*=\s*'([^']*)'/) || [])[1] || '';
  if (pt && !/^\d+$/.test(pt)) throw new Error('RELEASE ERROR: TACTICS_PT must be the numeric provider ID from App Store Connect (or empty).');
  if (!/^https:\/\/apps\.apple\.com\//.test((cfg.match(/TACTICS_URL\s*=\s*'([^']*)'/) || [])[1] || '')) throw new Error('RELEASE ERROR: TACTICS_URL must be an https://apps.apple.com/ link.');
  for (const f of ['LICENSE', 'COPYING', 'THIRD_PARTY_NOTICES.txt']) if (!existsSync(f)) throw new Error('RELEASE ERROR: ' + f + ' is missing (GPL v3 release).');
  if (!existsSync('www/engine/stockfish-19-lite-single.wasm') || !existsSync('www/engine/stockfish-19-lite-single.js')) throw new Error('RELEASE ERROR: Stockfish engine files are missing in www/engine/.');
  // GPL v3: the public repository must hold exactly the source of this build, as tag v<version>
  // (create it with: git tag v1.0.17 && git push origin v1.0.17). SKIP_SOURCE_TAG_CHECK=1 skips the check.
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const repo = ((cfg.match(/SOURCE_URL\s*=\s*'([^']*)'/) || [])[1] || '').replace(/\/+$/, '');
  if (process.env.SKIP_SOURCE_TAG_CHECK === '1') console.log('WARNING: source tag check skipped (SKIP_SOURCE_TAG_CHECK=1).');
  else {
    let out = null;
    try { out = execFileSync('git', ['ls-remote', '--tags', repo + '.git', 'refs/tags/v' + version], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }); }
    catch (e) { throw new Error('RELEASE ERROR: the public source repository ' + repo + ' cannot be read (is it public?). GPL v3 needs public source. ' + String(e.stderr || e.message).trim()); }
    if (!out.trim()) throw new Error('RELEASE ERROR: tag v' + version + ' is missing in ' + repo + '. Push the source of this build: git tag v' + version + ' && git push origin v' + version);
    console.log('PASS: public source tag v' + version + ' found in ' + repo + '.');
  }
  console.log('PASS: production checks (no ads), links, GPL files and engine present.');
} else {
  console.log('PASS: TestFlight build (no ads).');
}
