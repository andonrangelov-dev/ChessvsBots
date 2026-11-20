// Offline contract test of the native bridge with mocked Capacitor plugins (NOT a substitute for physical iOS tests).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/native-services.js', 'utf8').replace(/^import .*;\s*$/gm, '');
assert.ok(!/AdMob|NativePurchases|interstitial/i.test(source), 'no ads / purchases in the source');

function boot(native, opts = {}) {
  const calls = { haptics: [], style: [], share: [], store: [] };
  const win = { };
  const ctx = {
    window: win, console, setTimeout, clearTimeout, Promise,
    navigator: { vibrate: ms => calls.haptics.push(['web', ms]) },
    Capacitor: { isNativePlatform: () => native, getPlatform: () => opts.platform || (native ? 'ios' : 'web'), isPluginAvailable: n => n === 'StoreSheet' && opts.storeSheet !== false },
    registerPlugin: name => name === 'StoreSheet' ? { open: async o => { calls.store.push(o); if (opts.storeFails) throw new Error('not loaded'); } } : {},
    StatusBar: { setStyle: async o => { calls.style.push(o.style); } },
    Style: { Dark: 'DARK', Light: 'LIGHT' },
    Haptics: { impact: async o => calls.haptics.push(['impact', o.style]), notification: async o => calls.haptics.push(['note', o.type]) },
    ImpactStyle: { Light: 'LIGHT' }, NotificationType: { Error: 'ERR', Success: 'OK' },
    Share: { share: async o => calls.share.push(o) },
  };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { N: win.ChessNative, calls };
}

// Web: navigator.vibrate, no native, share rejects
{
  const { N, calls } = boot(false);
  assert.equal(N.isNative, false);
  N.vibrate(40); assert.deepEqual(calls.haptics[0], ['web', 40]);
  N.setStatusBarStyle(true); assert.equal(calls.style.length, 0);
  await assert.rejects(() => N.share({ title: 'x' }));
  assert.equal(typeof N.showInterstitial, 'undefined');
  assert.equal(typeof N.purchaseRemoveAds, 'undefined');
}
// Native: haptics by strength, status bar, share
{
  const { N, calls } = boot(true);
  N.vibrate(250); N.vibrate(120); N.vibrate(30);
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(calls.haptics.map(h => h[0]), ['note', 'note', 'impact']);
  N.setStatusBarStyle(true); N.setStatusBarStyle(false);
  await new Promise(r => setTimeout(r, 5));
  assert.deepEqual(calls.style, ['DARK', 'LIGHT']);
  await N.share({ title: 'T', text: 'x', url: 'u' });
  assert.equal(calls.share.length, 1);
}
// In-app App Store page of Chess Tactics Gym (iOS only); everywhere else the caller opens the link normally
{
  const web = boot(false);
  assert.equal(await web.N.openStore({ appId: '6830729167' }), false);
  assert.equal(web.calls.store.length, 0);
  const ios = boot(true);
  assert.equal(ios.N.platform, 'ios');
  assert.equal(await ios.N.openStore({ appId: '6830729167', providerToken: '123', campaignToken: 'cvb_home' }), true);
  assert.deepEqual(JSON.parse(JSON.stringify(ios.calls.store[0])), { appId: '6830729167', providerToken: '123', campaignToken: 'cvb_home' });
  assert.equal(await ios.N.openStore({ appId: 'abc' }), false, 'non-numeric id is refused');
  assert.equal(await boot(true, { storeFails: true }).N.openStore({ appId: '1' }), false, 'load error -> fallback');
  assert.equal(await boot(true, { storeSheet: false }).N.openStore({ appId: '1' }), false, 'old build without plugin -> fallback');
  const android = boot(true, { platform: 'android' });
  assert.equal(await android.N.openStore({ appId: '1' }), false);
  assert.equal(android.calls.store.length, 0);
}
console.log('PASS: native bridge contract tests (haptics, status bar, share, in-app App Store page; no ads).');
