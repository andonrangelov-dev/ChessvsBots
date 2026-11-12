# Чеклист преди изпращане към App Store

- [ ] Име „Chess vs Bots“ е свободно в App Store Connect (резервирай го; ако не — вариант с подзаглавие/добавка).
- [ ] Bundle ID `com.chessvsbots.app`.
- [ ] App Store Connect → НОВО приложение, версия 1.0.0; избери build-а от TestFlight; „What's New“ от 08_WHATS_NEW_1.0.txt; текст на листинга от 01_APP_STORE_TEXT_EN.txt.
- [ ] Приложението е безплатно, без реклами и без покупки: НЯМА IAP, AdMob и app-ads.txt.
- [x] `TACTICS_URL` е зададен (App Store адрес на Chess Tactics Gym).
- [ ] Тествай на iPad (портрет и пейзаж): голяма дъска, бутони Начало/Настройки/Цял екран.
- [ ] `www/privacy-config.js`: истински имейл и `SOURCE_URL` (https://github.com/andonrangelov-dev/ChessvsBots/ — зададено) → `node tools/build_privacy.js` → публикуване (напр. Netlify).
- [ ] Публичният адрес https://stirap.eu/ChessvsBots/privacy.html и /support.html отварят (Privacy Policy URL е задължителен за iOS в App Store Connect).
- [ ] GPL v3: GitHub репото е публично, съдържа LICENSE, COPYING, THIRD_PARTY_NOTICES.txt; About екранът води към него.
- [ ] TestFlight build (workflow `chess-testflight`): ход на бота, ревю, бутонът „Шахматни пъзели“ (отваря Chess Tactics Gym), профил със снимка/камера, началната дъска след партия.
- [ ] Production build (workflow `chess-appstore-production`) → качване за ревю.
- [ ] App Privacy въпросник: **Data Not Collected**; tracking = No.
- [ ] Възрастов рейтинг, авторски права, контакт за ревю.
- [ ] Скрийншоти (виж 07).
