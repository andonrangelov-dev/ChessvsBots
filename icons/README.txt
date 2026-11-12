Chess vs Bots - app icon (knight with a robot antenna and a cyan visor, on a blue chessboard-pattern gradient)

Regenerate everything from one design:   python3 tools/icon/make_icons.py   (Playwright/Chromium + Pillow)

assets/            sources for @capacitor/assets (icon-only.png, icon-foreground.png, icon-background.png)
                   run:  npm i && npm run icons   (after `npx cap add ios` / `android`)
icons/ios/AppIcon.appiconset   ready to copy into ios/App/App/Assets.xcassets/ (single 1024px icon, no alpha)
icons/android/mipmap-*         legacy + round + adaptive (foreground/background) launcher icons
icons/app_store_1024.png       App Store Connect icon (no transparency)
icons/play_store_512.png       Google Play listing icon
www/icon*.png, apple-touch-icon.png, favicon-32.png   web / Netlify icons
