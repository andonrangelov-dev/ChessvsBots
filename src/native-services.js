// Chess vs Bots — native services: haptics, status bar, share sheet and the in-app App Store page of our puzzle game.
// No ads, no purchases, no tracking.
// Bundled with esbuild into www/native-services.bundle.js and exposed as window.ChessNative. Released under GPL v3 with the app.
import { Capacitor, registerPlugin } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform ? Capacitor.getPlatform() : (isNative ? 'ios' : 'web');
// Local plugin (native-plugins/store-sheet): SKStoreProductViewController, so the player stays in the game.
const StoreSheet = registerPlugin('StoreSheet');

function vibrate(ms) {
  if (!isNative) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} return; }
  try {
    const p = ms >= 200 ? Haptics.notification({ type: NotificationType.Error })
      : ms >= 100 ? Haptics.notification({ type: NotificationType.Success })
      : Haptics.impact({ style: ImpactStyle.Light });
    p.catch(() => {});
  } catch (_) {}
}
function setStatusBarStyle(dark) {
  if (!isNative) return;
  try { StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {}); } catch (_) {}
}
// Opens the native share sheet (title/text/url). Rejects if the user cancels - caller ignores that.
async function share(payload) {
  if (!isNative) throw new Error('share unavailable');
  await Share.share({ title: payload.title, text: payload.text, url: payload.url, dialogTitle: payload.title });
}

// Shows the App Store page of another app inside this app (iOS only). Resolves true when the sheet was shown,
// false when it is not available (web, Android, older build) - then the caller opens the link normally.
async function openStore(opts) {
  if (!isNative || platform !== 'ios') return false;
  try { if (Capacitor.isPluginAvailable && !Capacitor.isPluginAvailable('StoreSheet')) return false; } catch (_) { return false; }
  if (!opts || !/^\d+$/.test(String(opts.appId || ''))) return false;
  try {
    await StoreSheet.open({ appId: String(opts.appId), providerToken: opts.providerToken || '', campaignToken: opts.campaignToken || '' });
    return true;
  } catch (_) { return false; }
}

window.ChessNative = { share, isNative, platform, vibrate, setStatusBarStyle, openStore };
