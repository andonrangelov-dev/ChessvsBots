// Chess vs Bots — native services: haptics, status bar, share sheet. No ads, no purchases, no tracking.
// Bundled with esbuild into www/native-services.bundle.js and exposed as window.ChessNative. Released under GPL v3 with the app.
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

const isNative = Capacitor.isNativePlatform();

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

window.ChessNative = { share, isNative, vibrate, setStatusBarStyle };
