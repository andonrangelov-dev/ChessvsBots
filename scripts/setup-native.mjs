import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const bundleId = process.env.BUNDLE_ID || 'com.chessvsbots.app';
if (!/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+){2,}$/.test(bundleId)) throw new Error('Invalid BUNDLE_ID: ' + bundleId);
const configPath = 'capacitor.config.json';
const config = JSON.parse(readFileSync(configPath, 'utf8'));
config.appId = bundleId;
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

// The iOS platform is generated on Codemagic (the repository is created on Windows/Linux).
if (!existsSync('ios/App/App.xcodeproj')) {
  execFileSync('npx', ['--no-install', 'cap', 'add', 'ios', '--packagemanager', 'CocoaPods'], { stdio: 'inherit' });
}
execFileSync('npx', ['--no-install', 'cap', 'sync', 'ios'], { stdio: 'inherit' });

const iconDir = 'ios/App/App/Assets.xcassets/AppIcon.appiconset';
mkdirSync(iconDir, { recursive: true });
copyFileSync('assets/icon-only.png', join(iconDir, 'AppIcon-512@2x.png'));
writeFileSync(join(iconDir, 'Contents.json'), JSON.stringify({
  images: [{ filename: 'AppIcon-512@2x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 }
}, null, 2) + '\n');

const plist = 'ios/App/App/Info.plist';
const plistBuddy = '/usr/libexec/PlistBuddy';
function ensurePlist(key, kind, value) {
  try { execFileSync(plistBuddy, ['-c', `Set :${key} ${value}`, plist], { stdio: 'pipe' }); }
  catch { execFileSync(plistBuddy, ['-c', `Add :${key} ${kind} ${value}`, plist], { stdio: 'inherit' }); }
}
ensurePlist('NSCameraUsageDescription', 'string', '"The camera is used only if you choose to take a profile picture. The picture stays on your device."');
ensurePlist('NSPhotoLibraryUsageDescription', 'string', '"Your photo library is used only if you choose a picture for your profile. The picture stays on your device."');
ensurePlist('UIViewControllerBasedStatusBarAppearance', 'bool', 'true');
ensurePlist('UIStatusBarStyle', 'string', 'UIStatusBarStyleDefault');
ensurePlist('ITSAppUsesNonExemptEncryption', 'bool', 'false');
console.log('Chess vs Bots iOS project ready for signing:', bundleId);
