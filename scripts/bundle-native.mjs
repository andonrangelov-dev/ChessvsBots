import { execFileSync } from 'node:child_process';
// Native services: haptics, status bar, share. No ads, no purchases.
execFileSync('npx', [
  '--no-install', 'esbuild', 'src/native-services.js',
  '--bundle', '--format=iife', '--platform=browser', '--target=es2020',
  '--outfile=www/native-services.bundle.js',
], { stdio: 'inherit' });
execFileSync('node', ['scripts/verify-native-bundle.mjs'], { stdio: 'inherit' });
console.log('Chess vs Bots: native bundle created.');
