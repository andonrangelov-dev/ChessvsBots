# Chess vs Bots

Offline chess against 40 bot characters from 40 countries (about 250 to 2800 Elo) and 5 chess legends for iOS (App Store), later Android. Capacitor 8 app; the engine is Stockfish compiled to WebAssembly and runs in a Web Worker on the device — no server, no account.

**Licence: GNU GPL v3 or later** (Stockfish is GPL v3, so the whole app is). See `LICENSE`, `COPYING`, `THIRD_PARTY_NOTICES.txt`. Replace `SOURCE_URL` in `www/privacy-config.js` with the real public repository URL before a production build.

## Features
- 40 bots (drawn people from 40 countries; groups Beginner, Intermediate, Advanced, Master; weakest is Andon from Bulgaria) with name, flag, rating, style and a short text under the picture (greeting in their own language + description in the app language). A fifth group, **Top players**: drawn caricatures of Paul Morphy, Emanuel Lasker, Mikhail Tal, José Raúl Capablanca and Alexander Alekhine (2675–2825) with a factual biography. Win stars: 3 with no hints and no undo, 2 with up to 3 hints, 1 with more hints or undo. From 1320 Elo up: Stockfish `UCI_LimitStrength` + `UCI_Elo`. Below 1320: Skill Level 0, depth 1 and human-like slips (calibrated so a stronger bot beats a weaker one).
- Choose white / black / random, undo, hint, resign, draw offer, game in progress is saved.
- Post-game review (biggest mistakes, best move, accuracy) with a MultiPV search by the same engine. The board has an evaluation bar on the left that follows every move (white part = White's winning chances, number = evaluation), and on wide screens the moves are listed in a table. Accuracy is calculated by `www/accuracy.js` using the public Lichess approach (centipawn score → Win%, per-move accuracy with the +1 uncertainty allowance for non-zero losses, volatility-weighted mean) with the decay constant fitted to Chess.com's Game Review (see "Changes in 1.0.11"). The **Best / Excellent / Good / Inaccuracy / Mistake / Blunder labels use our own documented 1.5/3.5/7/14 Win%-point loss thresholds**, fitted to the Chess.com counts and NOT identical to Chess.com categories. Chess.com CAPS2 is proprietary. Engine search is capped at 350 ms / depth 18 per position, using the offline Stockfish 19 WASM; changing analysis depth or Stockfish version can change the scores.
- During a game (wide screens, e.g. iPad in landscape or full view) a table lists all moves; first / previous / next / latest buttons and a tap on a move show earlier positions read-only, and the board returns to the live position when a move is played.
- Up to 5 players on one device: a swipeable carousel on the profile screen; each player has a name, country, picture (a plain outline of a person until one is chosen), rating, statistics and game in progress. The first player keeps the old storage keys, so older installations migrate without losing anything.
- Player rating (start 800, Elo-like) that grows with wins; hints/undo halve the gain.
- Board themes, piece sets, coordinates, flip board, dark/light mode, sound + vibration.
- 8 languages: EN, DE, FR, ES, IT, PT-BR, NL, BG.
- **No ads, no purchases, no tracking.** One button (home screen and Settings) opens the puzzle game Chess Tactics Gym (`window.TACTICS_URL` in `www/privacy-config.js`). Every page has Home / Settings / Full view buttons; the layout adapts to iPad and large screens (bigger board, side-by-side layout in landscape). The home-screen board shows the last game with its last move.

## Layout
- `www/` — the whole web app (also the Netlify site; `index.html` at the top). `www/engine/` — Stockfish WASM.
- `src/native-services.js` + `scripts/` — native bridge (haptics, status bar, share) and build/verify scripts.
- `codemagic.yaml` — `chess-testflight` and `chess-appstore-production` (the production build fails while SOURCE_URL / TACTICS_URL / the contact e-mail are placeholders).
- `tools/build_privacy.js` — generates `www/privacy.html` and `www/support.html`; `tools/icon/make_icons.py` — all icons.

## Commands
```
npm ci
npm run native:bundle   # builds www/native-services.bundle.js
npm run web:check && npm run test:accuracy && npm run i18n:check && npm run native:verify && npm run release:verify && npm run native:test
node scripts/test-web.mjs   # headless Chromium (Playwright) game tests
npm run ios:prepare     # creates the iOS project (on the Codemagic Mac)
```
Local web test: serve `www/` over HTTP (a Worker and WASM need http, not file://).

Bundle ID `com.chessvsbots.app`.

## Changes in 1.0.5
- Accuracy calculation separated from `game.js` into independently testable `www/accuracy.js`, aligned with Lichess' published formula and current source's +1 uncertainty allowance.
- Game accuracy still uses volatility-weighted and harmonic means, but zero scores now behave correctly in the harmonic mean; classification is by fixed Win%-loss bands, independent of bot Elo.
- Engine analysis searches slightly deeper (350 ms, depth 18), no longer discards the transposition table at *every position*, and selects complete MultiPV iterations where available.
- Old cached reviews automatically re-analyse once; saved games, settings, stars and player ratings are preserved.
- `npm run test:accuracy` covers numerical accuracy, edge cases and bundled fixtures.

Based on the [Lichess accuracy explanation](https://lichess.org/page/accuracy) and
[Lichess AccuracyPercent source](https://github.com/lichess-org/lila/blob/master/modules/analyse/src/main/AccuracyPercent.scala).
Lichess uses a different engine/search environment, so numerical results need not be identical.

## Changes in 1.0.11
- Accuracy formula v5, calibrated against Chess.com: six real Chess.com games (12 players) were analysed with this app's engine and compared with the accuracies Chess.com showed (`scripts/fixtures/chesscom-calibration.json`, checked by `npm run test:accuracy`). Mean difference 2.9 points (v4: 16.5); 3.9 points when each game is left out of the fit in turn. Changes: the centipawn term and the harmonic mean were removed (they turned the jumpy shallow evaluations of won positions - mate one move, +9 pawns the next - into "blunders"; the same game scored 36 % in one run and 74 % in the next), the per-move curve falls faster (`DECAY` 0.08 instead of Lichess' 0.04354), and the game accuracy is the volatility-weighted mean. Class bands are now 1.5 / 3.5 / 7 / 14 Win% points (Excellent / Good / Inaccuracy / Mistake / Blunder). Old cached reviews are analysed again once.
- Not validated: very weak players (about 250 Elo); Chess.com has no equivalent of our Best (engine move) and has extra labels (Brilliant, Great, Book, Miss).

## Changes in 1.0.10
- Accuracy formula v4 (variant "C"): `CP_CLIP` 4000, `CP_DECIDED` 1500, `CP_PER_WINPCT` 0.15, `CP_FREE` 10 (see the top of `www/accuracy.js`). Lost positions and huge advantages are no longer flattened, so a long winning game is not rated ~100%. The game is never more lenient than Lichess. Old cached reviews are analysed again once.
- Review: names and ratings above and below the board (like chess.com; the bars turn with the board); move counts (Best / Excellent / Good / Inaccuracy / Mistake / Blunder) for both players ("Your moves" and "Opponent moves"); for games loaded from a PGN the names and Elo come from the file and both players get counts and key moments.
- Up to 1000 finished games and 1000 analysed (imported) games per player. To stay within the storage of the device, the stored analyses of the oldest games are dropped first (they are made again when a game is opened).
- "Analyse a game": no choice of side any more.

## Changes in 1.0.9
- Bot list: the recommended bot (closest to your rating) is labelled "Suggested" (8 languages).
- Profile: flags of all countries (files `www/flags/xx.svg` from flag-icons, MIT, `tools/build_flags.mjs`), the Olympic flag and "No country".
- Home screen: if the current player has no game yet, the board shows the most recent game of another player on the device.
- Statistics: period dropdown (7 days / 30 days / 90 days / 1 year / all time) for the totals, rating chart, opponents and games; "Opponents" list -> all games against one bot with date and time -> tap a game to analyse it. Up to 200 finished games are kept per player (was 20).
- "Analyse a game": paste a PGN or load a .pgn file (home screen and statistics); analysed on the device, the last 30 are kept.
- Link to Chess Tactics Gym without the country part (works in every App Store).

## Changes in 1.0.8
- Source link set to https://github.com/andonrangelov-dev/ChessvsBots/ (About screen, support.html); privacy.html and support.html regenerated (Privacy Policy in 8 languages).

## Changes in 1.0.7
- Accuracy formula v3. The bundled Stockfish reports inflated centipawn values (a pawn is about +170, a rook about +750), so the plain Lichess win% curve saturates quickly: in a decided position almost any move looked free and both the winner and the loser received very high accuracy. Per-move loss is now `max(win% loss, damped centipawn loss)` where the centipawn term is `0.092 * max(0, cpBefore - cpAfter - 15) / (1 + |cpBefore|/600)` (evaluations clipped at +-1500). The accuracy of a move is still the Lichess curve applied to this loss and the game accuracy is still the Lichess volatility-weighted + harmonic mean. Tuning constants (`CP_PER_WINPCT`, `CP_FREE`, `CP_DECIDED`, `CP_CLIP`) are at the top of `www/accuracy.js`.
- New move class "Excellent" (not the engine's first choice, but loses at most 2 points); "Best" is now reserved for the engine's own move (or a mating move).
- Old cached reviews are re-analysed once (accuracy version 3).

## Changes in 1.0.6
- Several players (max. 5) per device, each with own rating, statistics and saved game; carousel with swipe on the profile screen; unidentified players show an outline silhouette; removing a player deletes only their data.
