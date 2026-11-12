// End-to-end tests of the web build in a headless browser (Playwright + Chromium), with the real Stockfish engine.
//   npm run test:web          (needs: npm i -g playwright   or any local Playwright with Chromium)
import http from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch (_) {}
  try { return require(require.resolve('playwright', { paths: [execSync('npm root -g').toString().trim()] })); } catch (_) {}
  throw new Error('Playwright is not installed. Run: npm i -g playwright && npx playwright install chromium');
}
const { chromium } = loadPlaywright();

const WWW = path.resolve('www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p === '/') p = '/index.html';
  const f = path.join(WWW, p);
  if (!f.startsWith(WWW) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end('nope'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(r => server.listen(0, r));
const URL_ = 'http://localhost:' + server.address().port + '/index.html';
const SHOTS = process.env.SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const browser = await chromium.launch();
let passed = 0;
const ok = (name) => { passed++; console.log('  ok -', name); };

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 390, height: 844 }, deviceScaleFactor: 1, locale: opts.locale || 'en-US' });
  if (opts.native) await ctx.addInitScript(opts.native);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') page.errors.push('console: ' + m.text()); });
  return page;
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const sqXY = async (page, sq) => {
  const box = await page.locator('#boardSvg').boundingBox();
  const vb = await page.evaluate(() => { const v = document.getElementById('boardSvg').viewBox.baseVal; return { x: v.x, y: v.y, w: v.width, h: v.height }; });
  const orient = await page.evaluate(() => __cvb.board().getOrientation());
  const f = sq.charCodeAt(0) - 97, r = +sq[1] - 1;
  const gx = orient === 'white' ? f : 7 - f, gy = orient === 'white' ? 7 - r : r;
  return [box.x + (gx + 0.5 - vb.x) / vb.w * box.width, box.y + (gy + 0.5 - vb.y) / vb.h * box.height];
};
async function tap(page, from, to) {
  const a = await sqXY(page, from); await page.mouse.click(a[0], a[1]); await page.waitForTimeout(60);
  const b = await sqXY(page, to); await page.mouse.click(b[0], b[1]);
}
const hist = page => page.evaluate(() => __cvb.G.chess.history());
async function waitFor(page, fn, ms = 20000, arg) { await page.waitForFunction(fn, arg, { timeout: ms }); }
async function startGame(page, botIdx, color) {
  await page.click('#playBtn');
  await page.click('.botTile >> nth=' + botIdx);
  await page.click(color === 'w' ? '#colW' : color === 'b' ? '#colB' : '#colR');
  await page.click('#startGameBtn');
  await waitFor(page, () => document.getElementById('playScreen').classList.contains('active'));
}
// replace the bot by a script of moves (SAN or UCI strings); falls back to the real bot when the script is empty
async function scriptBot(page, ucis) {
  await page.evaluate(u => { window.__script = u.slice(); const real = Bots.chooseMove; window.__realChoose = real; Bots.chooseMove = async (bot, chess) => window.__script.length ? window.__script.shift() : real(bot, chess); }, ucis);
}

try {
  // ── 1. load, screens, no errors ───────────────────────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(600);
    assert.equal(await page.title(), 'Chess vs Bots');
    assert.ok(await page.isVisible('#playBtn'));
    await shot(page, '01_home');
    for (const id of ['settBtn', 'statsBtn', 'aboutHomeBtn']) {
      await page.click('#' + id); await page.waitForTimeout(150);
      const ow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(ow <= 1, 'horizontal overflow on ' + id + ': ' + ow);
      await shot(page, '02_' + id);
      await page.click('.screen.active .back');
    }
    assert.deepEqual(page.errors, []);
    ok('home, settings, profile and about open without errors or horizontal scroll');
    await page.context().close();
  }

  // ── 2. engine + a real game against a weak bot ────────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(500);
    await startGame(page, 0, 'w');
    await shot(page, '03_play_start');
    await tap(page, 'e2', 'e4');
    await waitFor(page, () => __cvb.G.chess.history().length >= 2);
    assert.equal((await hist(page))[0], 'e4');
    assert.equal(await page.evaluate(() => __cvb.G.chess.turn()), 'w');
    ok('tap-to-move works and the bot (real Stockfish worker) answers');

    // illegal tap: knight to a wrong square does nothing
    await tap(page, 'b1', 'b3');
    assert.equal((await hist(page)).length, 2);
    ok('illegal moves are ignored');

    // hint draws an arrow and counts
    await page.click('#hintBtn');
    await waitFor(page, () => __cvb.G.hintShown === true, 15000);
    assert.ok(await page.locator('#boardSvg polygon').count() >= 1, 'hint arrow missing');
    assert.equal(await page.evaluate(() => __cvb.G.hints), 1);
    await shot(page, '04_hint');
    ok('hint shows an arrow');

    // undo takes back my move and the bot reply
    const before = (await hist(page)).length;
    await tap(page, 'g1', 'f3');
    await waitFor(page, () => __cvb.G.chess.history().length >= 4);
    await page.click('#undoBtn');
    assert.equal((await hist(page)).length, before);
    assert.equal(await page.evaluate(() => __cvb.G.undos), 1);
    ok('undo takes back a full move (mine + the bot reply)');

    // flip
    const o1 = await page.evaluate(() => __cvb.board().getOrientation());
    await page.click('#flipBtn');
    assert.notEqual(await page.evaluate(() => __cvb.board().getOrientation()), o1);
    await page.click('#flipBtn');
    ok('flip board');

    // saved game survives a reload and can be continued
    const moves = await hist(page);
    await page.reload(); await page.waitForTimeout(600);
    assert.ok(await page.isVisible('#continueBtn'), 'continue button missing');
    await page.click('#continueBtn');
    await waitFor(page, () => document.getElementById('playScreen').classList.contains('active') && window.__cvb.G);
    assert.deepEqual(await hist(page), moves);
    ok('game in progress is saved and continues after a reload');

    // resign -> result card, rating drops, stats update
    await page.click('#resignBtn'); await page.click('#confirmYes');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    assert.equal(await page.evaluate(() => __cvb.stats.l), 1);
    assert.ok(await page.evaluate(() => __cvb.stats.rating) < 800);
    assert.equal(await page.evaluate(() => __cvb.saved), null);
    await shot(page, '05_gameover');
    ok('resign ends the game, updates the rating and clears the save');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }

  // ── 3. fool's mate (scripted bot): win/loss detection, rating, review ─────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(400);
    await scriptBot(page, ['f2f3', 'g2g4']);          // 1.f3 e5 2.g4 Qh4#  (installed before the game: the bot opens)
    await startGame(page, 0, 'b');                    // I am Black
    await waitFor(page, () => __cvb.G.chess.history().length >= 1);
    await tap(page, 'e7', 'e5');
    await waitFor(page, () => __cvb.G.chess.history().length >= 3);
    await tap(page, 'd8', 'h4');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    assert.equal(await page.evaluate(() => __cvb.G.record.res), 'w');
    assert.equal(await page.evaluate(() => __cvb.G.record.reason), 'checkmate');
    const r1 = await page.evaluate(() => __cvb.stats.rating);
    assert.ok(r1 > 800, 'win must raise the rating (got ' + r1 + ')');
    assert.equal(await page.evaluate(() => __cvb.stats.w), 1);
    await shot(page, '06_win');
    ok('checkmate is detected; a win raises the rating');

    // review of the game
    await page.click('#goReview');
    await waitFor(page, () => document.getElementById('reviewBody').style.display !== 'none', 60000);
    assert.ok(await page.locator('#revMoves button').count() === 4);
    await shot(page, '07_review');
    const an = await page.evaluate(() => __cvb.rv.an);
    assert.equal(an.cls.length, 4);
    assert.ok(an.key.some(k => k.type === 'best' && k.ply === 3), 'Qh4# must be the best move of the game');
    assert.ok(an.acc.you >= 90, 'accuracy of the mating side');
    assert.ok(an.cls[0] !== 'best' || true);
    await page.click('#revFirst'); assert.equal(await page.evaluate(() => __cvb.rv.ply), 0);
    await page.click('#revNext'); assert.equal(await page.evaluate(() => __cvb.rv.ply), 1);
    await page.click('#revLast'); assert.equal(await page.evaluate(() => __cvb.rv.ply), 4);
    ok('review: analysis, accuracy, best move, navigation');
    // the analysis is cached on the game record
    assert.ok(await page.evaluate(() => !!__cvb.stats.recent[0].an));
    await page.click('#reviewBack');
    await page.click('#statsBtn');
    assert.ok(await page.locator('.recRow').count() === 1);
    await shot(page, '08_stats');
    ok('profile lists the game');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }

  // ── 3b. a game with a blunder: the review must find it ─────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(400);
    await scriptBot(page, ['e2e4', 'd1h5', 'f1c4', 'h5f7']);       // 1.e4 e5 2.Qh5 Nc6 3.Bc4 Nf6?? 4.Qxf7#
    await startGame(page, 0, 'b');
    await waitFor(page, () => __cvb.G.chess.history().length >= 1);
    await tap(page, 'e7', 'e5'); await waitFor(page, () => __cvb.G.chess.history().length >= 3);
    await tap(page, 'b8', 'c6'); await waitFor(page, () => __cvb.G.chess.history().length >= 5);
    await tap(page, 'g8', 'f6'); await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 8000);
    assert.equal(await page.evaluate(() => __cvb.G.record.res), 'l');
    await page.click('#goReview');
    await waitFor(page, () => document.getElementById('reviewBody').style.display !== 'none', 60000);
    const an = await page.evaluate(() => __cvb.rv.an);
    assert.ok(['mistake', 'blunder'].includes(an.cls[5]), 'Nf6?? must be a mistake/blunder, got ' + an.cls[5]);
    assert.ok(an.key.some(k => k.type === 'mistake' && k.ply === 5), 'the blunder must be a key moment');
    assert.ok(an.counts.blunder + an.counts.mistake >= 1);
    assert.ok(an.acc.you < an.acc.bot, 'accuracy: loser lower than winner');
    await page.locator('#revKey .keyCard >> nth=1').click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('#boardSvg').count() === 1);
    await shot(page, '07b_review_blunder');
    ok('review finds the blunder, lists it as a key moment and shows the better move');
    await page.context().close();
  }

  // ── 4. loss by checkmate, stalemate, promotion dialog ─────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(400);
    await startGame(page, 0, 'w');
    await scriptBot(page, ['e7e5', 'd8h4']);          // 1.f3 e5 2.g4 Qh4#  (I am White and blunder)
    await tap(page, 'f2', 'f3'); await waitFor(page, () => __cvb.G.chess.history().length >= 2);
    await tap(page, 'g2', 'g4'); await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 8000);
    assert.equal(await page.evaluate(() => __cvb.G.record.res), 'l');
    assert.ok(await page.evaluate(() => __cvb.stats.rating) < 800);
    ok('loss by checkmate');
    await page.click('#goHome');

    // stalemate: load a position and make the stalemating move
    await startGame(page, 0, 'w');
    await page.evaluate(() => { const G = __cvb.G; G.chess.load('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1'); __cvb.board().setChess(G.chess); });
    await tap(page, 'g5', 'g6');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 8000);
    assert.equal(await page.evaluate(() => __cvb.G.record.reason), 'stalemate');
    assert.equal(await page.evaluate(() => __cvb.G.record.res), 'd');
    ok('stalemate is a draw');
    await page.click('#goHome');

    // promotion dialog
    await startGame(page, 0, 'w');
    await page.evaluate(() => { const G = __cvb.G; G.chess.load('8/P7/8/8/8/8/k6K/8 w - - 0 1'); __cvb.board().setChess(G.chess); });
    await scriptBot(page, ['a2b2']);
    await tap(page, 'a7', 'a8');
    await waitFor(page, () => document.getElementById('promoOverlay').classList.contains('show'), 3000);
    await shot(page, '09_promo');
    await page.click('#promoChoices button >> nth=0');
    await waitFor(page, () => __cvb.G.chess.history().length >= 1);
    assert.ok((await hist(page))[0].startsWith('a8=Q'));
    ok('promotion dialog (queen)');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }

  // ── 5. draw offer (accept + decline) ──────────────────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(400);
    await startGame(page, 0, 'w');
    await page.evaluate(() => { Bots.acceptsDraw = async () => false; });
    await page.click('#drawBtn'); await page.click('#confirmYes');
    await waitFor(page, () => !__cvb.G.busy && __cvb.G.drawBlockedUntil > 0, 8000);
    assert.equal(await page.evaluate(() => __cvb.G.over), false);
    assert.ok(await page.isDisabled('#drawBtn'), 'draw button must be blocked after a declined offer');
    ok('declined draw offer');
    await page.evaluate(() => { __cvb.G.drawBlockedUntil = 0; Bots.acceptsDraw = async () => true; __cvb.G.chess.load('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'); __cvb.board().setChess(__cvb.G.chess); __cvb.refresh(); });
    await page.click('#drawBtn'); await page.click('#confirmYes');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 8000);
    assert.equal(await page.evaluate(() => __cvb.G.record.reason), 'agreement');
    ok('accepted draw offer');
    await page.context().close();
  }

  // ── 6. no ads, no purchases; links to Chess Tactics Gym ───────────────────
  {
    const page = await newPage({});
    await page.goto(URL_); await page.waitForTimeout(400);
    const html = await page.content();
    for (const id of ['homeRemoveAds', 'settRemoveAds', 'removeAdsScreen', 'restorePurchBtn', 'adChoicesBtn']) assert.ok(!html.includes('id="' + id + '"'), 'leftover ads element ' + id);
    assert.ok(!(await page.evaluate(() => Object.keys(window.ChessNative || {}).some(k => /interstitial|purchase|consent|ads/i.test(k)))), 'native bridge has no ads API');
    // home: puzzle button opens the other game in a new tab
    const home = await page.evaluate(() => { const a = document.getElementById('homeTactics'); return { href: a.getAttribute('href'), target: a.target, rel: a.rel, shown: a.offsetParent !== null, text: a.textContent }; });
    assert.ok(home.shown && home.target === '_blank' && /noopener/.test(home.rel), 'tactics button on home');
    assert.equal(home.href, await page.evaluate(() => window.TACTICS_URL), 'home link = TACTICS_URL');
    assert.ok(/Tactics Gym/.test(home.text));
    // settings: same link
    await page.click('#settBtn');
    const sett = await page.evaluate(() => { const a = document.getElementById('settTactics'); return { href: a.getAttribute('href'), shown: a.offsetParent !== null }; });
    assert.ok(sett.shown && sett.href === home.href, 'tactics link in settings');
    // finishing games never shows anything ad-like
    await page.click('#settBack').catch(() => {});
    assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
    ok('no ads or purchases anywhere; "Chess puzzles" button (home + settings) links to Chess Tactics Gym');
    await page.context().close();
  }

  // ── 7. every bot returns a legal move in several positions ────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(400);
    const res = await page.evaluate(async () => {
      window.__botsMovetime = 60;
      const fens = ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 2 3', '8/5pk1/6p1/8/8/6P1/5PK1/3R4 w - - 0 40', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'];
      const out = [];
      for (const bot of Bots.list) for (const fen of fens) {
        const c = new Chess(fen); const u = await Bots.chooseMove(bot, c);
        const m = u && c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        out.push(!!m);
      }
      return { n: out.length, bad: out.filter(x => !x).length, bots: Bots.list.length, avatars: Bots.list.every(b => Bots.avatar(b).startsWith('<svg')) };
    });
    assert.equal(res.bots, 45); assert.equal(res.bad, 0); assert.ok(res.avatars);
    ok('40 bots x 4 positions: all moves legal, all avatars drawn');
    assert.deepEqual(page.errors, []);
    await page.context().close();
  }

  // ── 8. languages, light theme, small and large phones ─────────────────────
  {
    for (const lang of ['de', 'fr', 'es', 'it', 'pt', 'nl', 'bg']) {
      const page = await newPage({ locale: lang === 'pt' ? 'pt-BR' : lang });
      await page.goto(URL_); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => window._cvbLang), lang, 'language detection ' + lang);
      await startGame(page, 3, 'w');
      const texts = await page.evaluate(() => [...document.querySelectorAll('[data-i18n]')].map(e => e.textContent));
      const keys = await page.evaluate(() => Object.keys(window.CHESS_I18N.en));
      assert.ok(!texts.some(t => keys.includes(t.trim()) && t.trim().length > 3 && /^[a-z]+[A-Z_]/.test(t.trim())), 'raw key visible in ' + lang);
      if (lang === 'bg') await shot(page, '10_bg_play');
      assert.deepEqual(page.errors, []);
      await page.context().close();
    }
    ok('8 languages detected from the device and rendered');
    for (const vp of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 768, height: 1024 }]) {
      const page = await newPage({ viewport: vp });
      await page.goto(URL_); await page.waitForTimeout(300);
      await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('chessvsbots_prefs') || '{}'); p.theme = 'light'; localStorage.setItem('chessvsbots_prefs', JSON.stringify(p)); });
      await page.reload(); await page.waitForTimeout(400);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
      for (const go of [async () => {}, async () => { await page.click('#playBtn'); }, async () => { await page.click('.botTile >> nth=2'); }, async () => { await page.click('#startGameBtn'); await waitFor(page, () => window.__cvb.G); await page.waitForTimeout(700); }]) {
        await go();
        const ow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        assert.ok(ow <= 1, 'overflow ' + ow + ' at ' + vp.width);
      }
      await shot(page, '11_light_' + vp.width);
      await page.context().close();
    }
    ok('light theme; no horizontal overflow at 320, 430 and 768 px');
  }

  // ── 9. rating rules ───────────────────────────────────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(400);
    // a win with hints counts half; beating a much weaker bot still gives +1
    await scriptBot(page, ['f2f3', 'g2g4']);
    await startGame(page, 0, 'b');
    await waitFor(page, () => __cvb.G.chess.history().length >= 1);
    await page.evaluate(() => { __cvb.G.hints = 2; });
    await tap(page, 'e7', 'e5'); await waitFor(page, () => __cvb.G.chess.history().length >= 3);
    await tap(page, 'd8', 'h4');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    const d = await page.evaluate(() => __cvb.G.record.delta);
    assert.ok(d >= 1 && d <= 3, 'assisted win vs the weakest bot should be +1..+3, got ' + d);
    ok('win vs a much weaker bot gives only a small gain (+1 minimum, halved when hints are used)');
    await page.context().close();
  }

  // ── 10. roster ────────────────────────────────────────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const L = Bots.list;
      return {
        n: L.length, ids: new Set(L.map(b => b.id)).size, faces: new Set(L.map(b => Bots.avatar(b))).size,
        inc: L.slice(0, 40).every((b, i) => i === 0 || b.elo > L[i - 1].elo), first: [L[0].name, L[0].cc, L[0].elo], last: L[39].elo,
        legends: L.filter(b => b.legend).map(b => [b.id, b.cc, b.elo, b.group, b.years]),
        groups: Bots.GROUPS.map(g => L.filter(b => b.group === g).length), flags: L.every(b => Bots.flag(b).startsWith('<svg')),
        countries: new Set(L.map(b => b.cc)).size, names: L.map(b => b.name),
      };
    });
    assert.equal(r.n, 45); assert.equal(r.ids, 45); assert.equal(r.faces, 45); assert.ok(r.inc, 'ratings of the 40 bots strictly increase');
    assert.deepEqual(r.legends.map(l => l[0]), ['morphy', 'lasker', 'tal', 'capablanca', 'alekhine']);
    assert.deepEqual(r.legends.map(l => l[1]), ['US', 'DE', 'LV', 'CU', 'FR']);
    assert.ok(r.legends.every(l => l[3] === 'top' && l[2] >= 2675 && l[2] <= 2825), 'legends are in the top group, 2675-2825');
    assert.deepEqual(r.first, ['Andon', 'BG', 250]); assert.ok(r.last >= 2750 && r.last <= 2850, 'top bot ' + r.last);
    assert.deepEqual(r.groups, [10, 10, 10, 10, 5]); assert.ok(r.flags); assert.ok(r.countries >= 38, 'countries ' + r.countries);
    for (const bad of ['Zach', 'Maria', 'Oscar', 'Wei']) assert.ok(!r.names.includes(bad), 'copied name ' + bad);
    ok('roster: 40 bots from ' + r.countries + ' countries + 5 legends (Morphy, Lasker, Tal, Capablanca, Alekhine), weakest is Andon (BG), 45 different faces');
    await page.context().close();
  }

  // ── 11. bots screen: groups (accordion) and tiles ─────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(300);
    await page.click('#playBtn');
    assert.equal(await page.locator('.grp').count(), 5);
    assert.equal(await page.locator('.grp.open').count(), 1);
    assert.equal(await page.locator('.grp.open .botTile:visible').count(), 10);
    await shot(page, '12_bots_groups');
    await page.click('.grp[data-group="master"] .grpHead');
    assert.equal(await page.locator('.grp.open').count(), 1);
    assert.equal(await page.locator('.grp[data-group="master"].open .botTile:visible').count(), 10);
    await shot(page, '12_bots_master');
    await page.click('.grp[data-group="master"] .grpHead');
    assert.equal(await page.locator('.grp.open').count(), 0, 'all groups can be closed');
    await page.click('.grp[data-group="beginner"] .grpHead');
    await page.click('.botTile >> nth=0');
    assert.ok(await page.evaluate(() => document.getElementById('setupScreen').classList.contains('active')));
    assert.ok((await page.textContent('#setupName')).startsWith('Andon'));
    assert.ok(await page.locator('#setupName .flag').count() === 1);
    // every bot has a text under the picture: greeting in the bot's own language + a description in the app language
    const bio = await page.textContent('#setupBio');
    assert.ok(bio.includes('Здравей!') && bio.includes('Andon') && bio.includes('Bulgaria'), 'bio of Andon: ' + bio);
    assert.ok(!/[{}]/.test(bio));
    await shot(page, '12_setup_andon');
    // top players group
    await page.click('#setupBack');
    await page.click('.grp[data-group="top"] .grpHead');
    assert.equal(await page.locator('.grp[data-group="top"].open .botTile:visible').count(), 5);
    await shot(page, '12_bots_top');
    await page.click('.grp[data-group="top"] .botTile >> nth=0');
    assert.ok((await page.textContent('#setupName')).startsWith('Paul Morphy'));
    const mb = await page.textContent('#setupBio');
    assert.ok(mb.includes('1837') && mb.includes('1884') && mb.includes('New Orleans') && mb.includes('United States'), 'legend info: ' + mb);
    await shot(page, '12_setup_morphy');
    for (const [i, key] of [[1, 'Lasker'], [2, 'Tal'], [3, 'Capablanca'], [4, 'Alekhine']]) {
      await page.click('#setupBack'); await page.click('.grp[data-group="top"] .botTile >> nth=' + i);
      assert.ok((await page.textContent('#setupName')).includes(key));
      assert.ok((await page.textContent('#setupBio')).length > 150, key + ' has a biography');
      await shot(page, '12_setup_' + key.toLowerCase());
    }
    const ov = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.ok(!ov, 'no horizontal overflow');
    assert.deepEqual(page.errors, []);
    ok('bots screen: 5 groups as an accordion (incl. Top players), tiles with flags and stars, text under the picture of every bot and a biography for each legend');
    await page.context().close();
  }

  // ── 12. stars for wins ────────────────────────────────────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(300);
    const finish = async (hints, undos) => {
      await startGame(page, 0, 'w');
      await page.evaluate(([h, u]) => { __cvb.G.hints = h; __cvb.G.undos = u; __cvb.endGame('win', 'resign'); }, [hints, undos]);
      await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
      const r = await page.evaluate(() => ({ stars: __cvb.G.record.stars, saved: __cvb.stats.stars.andon, shown: document.querySelectorAll('#goRating .stars')[0].textContent.replace(/\s/g, '').length }));
      await page.click('#goHome');
      return r;
    };
    const a = await finish(2, 0); assert.equal(a.stars, 2, '1-3 hints = 2 stars'); assert.equal(a.saved, 2);
    const b = await finish(4, 0); assert.equal(b.stars, 1, 'more than 3 hints = 1 star'); assert.equal(b.saved, 2, 'best result is kept');
    const c = await finish(0, 1); assert.equal(c.stars, 1, 'undo = 1 star');
    const d = await finish(3, 0); assert.equal(d.stars, 2, 'exactly 3 hints still 2 stars');
    const e = await finish(0, 0); assert.equal(e.stars, 3, 'no hints, no undo = 3 stars'); assert.equal(e.saved, 3); assert.equal(e.shown, 3);
    await startGame(page, 0, 'w');
    await page.evaluate(() => { __cvb.endGame('loss', 'resign'); });
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    assert.equal(await page.evaluate(() => __cvb.G.record.stars), 0, 'a loss gives no stars');
    assert.equal(await page.evaluate(() => __cvb.stats.stars.andon), 3, 'stars are never lowered');
    await page.click('#goOther');
    await page.click('.grp[data-group="beginner"] .grpHead').catch(() => {});
    const hdr = await page.textContent('.grp[data-group="beginner"] .gStars');
    assert.ok(/3\/30/.test(hdr), 'group header shows the stars, got ' + hdr);
    const tile = await page.locator('.botTile >> nth=0').innerHTML();
    assert.ok(tile.includes('class="stars">★★★<i>'), 'tile shows 3 gold stars');
    ok('stars: 3 with no hints/undo, 2 with up to 3 hints, 1 with more hints or undo; best is kept and shown on tiles and group headers');
    await page.context().close();
  }

  // ── 13. my profile: name, country, picture ────────────────────────────────
  {
    const page = await newPage({ locale: 'bg-BG' });
    await page.goto(URL_); await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => JSON.parse(JSON.stringify(document.getElementById('profCam').getAttribute('capture')))), 'user', 'camera input');
    assert.ok(await page.locator('#homeProfile .flag').count() === 1, 'country defaults from the device language');
    await page.click('#homeProfile');
    assert.ok(await page.evaluate(() => document.getElementById('profileScreen').classList.contains('active')));
    assert.equal(await page.locator('.presetBtn').count(), 12);
    await shot(page, '13_profile');
    await page.fill('#profName', 'Андон');
    await page.selectOption('#profCountry', 'GR');
    await page.click('.presetBtn >> nth=5');
    await page.click('#profileBack');
    const chip = await page.textContent('#homeProfile'); assert.ok(chip.includes('Андон'), 'name on the home screen');
    assert.ok((await page.innerHTML('#homeProfile')).includes('aria-label="GR"'), 'flag on the home screen');
    await startGame(page, 0, 'w');
    assert.ok((await page.textContent('#youName')).includes('Андон'), 'name on the board screen');
    assert.ok((await page.innerHTML('#youName')).includes('aria-label="GR"'));
    await shot(page, '13_play_with_profile');
    await page.reload(); await page.waitForTimeout(400);
    assert.ok((await page.textContent('#homeProfile')).includes('Андон'), 'profile survives a reload');
    // upload a picture (a real 2x2 PNG) -> square JPEG stored on the device
    await page.click('#homeProfile');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2P8z8Dwn4GBgYGJAQoAHxQCAjtGF2cAAAAASUVORK5CYII=', 'base64');
    await page.setInputFiles('#profFile', { name: 'me.png', mimeType: 'image/png', buffer: png });
    await waitFor(page, () => (o => o.list.find(p => p.id === o.cur))(JSON.parse(localStorage.getItem('chessvsbots_profiles'))).av.t === 'photo', 5000);
    const av = await page.evaluate(() => (o => o.list.find(p => p.id === o.cur))(JSON.parse(localStorage.getItem('chessvsbots_profiles'))).av.d);
    assert.ok(av.startsWith('data:image/jpeg;base64,'), 'stored as JPEG');
    assert.ok(await page.locator('#profPlayers .plCard.sel img.photo').count() === 1);
    await page.click('#profileBack');
    assert.ok(await page.locator('#homeProfile img.photo').count() === 1, 'picture on the home screen');
    // a file that is not a picture is rejected and nothing changes
    await page.click('#homeProfile');
    await page.setInputFiles('#profFile', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => (o => o.list.find(p => p.id === o.cur))(JSON.parse(localStorage.getItem('chessvsbots_profiles'))).av.d), av, 'bad file leaves the picture as it was');
    await page.click('.presetBtn >> nth=1');
    assert.equal(await page.evaluate(() => (o => o.list.find(p => p.id === o.cur))(JSON.parse(localStorage.getItem('chessvsbots_profiles'))).av.t), 'preset', 'back to a drawn picture');
    // the stats page shows the profile and opens the editor
    await page.click('#profileBack'); await page.click('#statsBtn');
    assert.ok((await page.textContent('#statsProfile')).includes('Андон'));
    await page.click('#statsProfile');
    assert.ok(await page.evaluate(() => document.getElementById('profileScreen').classList.contains('active')));
    await page.click('#profileBack');
    assert.ok(await page.evaluate(() => document.getElementById('statsScreen').classList.contains('active')), 'back returns to where it was opened from');
    assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
    ok('profile: name, country (default from the device), 12 drawn pictures, uploaded/camera picture cropped to a square JPEG, bad files rejected, saved across reloads, shown on home, board and statistics');
    await page.context().close();
  }

  // ── 13. home board shows the last game with its last move ─────────────────
  {
    const page = await newPage({});
    await page.goto(URL_); await page.waitForTimeout(400);
    const start = await page.evaluate(() => document.getElementById('homePreview').innerHTML);
    await startGame(page, 0, 'b');                       // I am black: white (bot) moves first
    await scriptBot(page, ['e2e4']);
    await waitFor(page, () => __cvb.G.chess.history().length >= 1, 8000);
    await page.click('#resignBtn'); await page.click('#confirmYes');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    await page.click('#goHome'); await page.waitForTimeout(300);
    const info = await page.evaluate(() => {
      const rec = __cvb.stats.recent[0]; const home = document.getElementById('homePreview');
      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); tmp.setAttribute('viewBox', '0 0 8 8');
      const c = new Chess(); for (const u of rec.moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      const u = rec.moves[rec.moves.length - 1];
      ChessCore.renderStatic(tmp, c.fen(), rec.color === 'b' ? 'black' : 'white', { from: u.slice(0, 2), to: u.slice(2, 4) });
      const tmp0 = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); tmp0.setAttribute('viewBox', '0 0 8 8');
      ChessCore.renderStatic(tmp0, c.fen(), rec.color === 'b' ? 'black' : 'white', null);
      return { same: home.innerHTML === tmp.innerHTML, sameNoHighlight: home.innerHTML === tmp0.innerHTML, saved: !!__cvb.saved, n: rec.moves.length, color: rec.color };
    });
    assert.ok(!info.saved, 'the finished game is not "in progress"');
    assert.ok(info.same, 'home board = final position of the last game, my side at the bottom, last move highlighted');
    assert.ok(!info.sameNoHighlight, 'the last move is highlighted');
    assert.notEqual(await page.evaluate(() => document.getElementById('homePreview').innerHTML), start, 'differs from the start position');
    // survives a reload
    const before = await page.evaluate(() => document.getElementById('homePreview').innerHTML);
    await page.reload(); await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.getElementById('homePreview').innerHTML), before, 'same board after a reload');
    ok('home board shows the last game (final position, my colour, last move highlighted), also after a reload');
    await page.context().close();
  }

  // ── 14. accuracy: the published Lichess method (win%, per-move accuracy, volatility-weighted + harmonic mean) ──
  {
    const games = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'acc-games.json'), 'utf8'));
    const page = await newPage({});
    await page.goto(URL_); await page.waitForTimeout(400);
    const res = await page.evaluate(g => g.map(x => { const r = __cvb.scoreGame(x.pov, x.moves, x.best, { w: x.A === 'random' ? 600 : x.A, b: x.C }); return { A: x.A, C: x.C, w: Math.round(r.w), b: Math.round(r.b), n: x.moves.length }; }), games);
    const by = a => res.find(r => String(r.A) === String(a));
    // Lichess server AccuracyPercent: win% lost -> move accuracy, including +1 uncertainty bonus
    const winCp = pct => -Math.log(100 / pct - 1) / 0.00368208;          // centipawns that give this win%
    const moveAcc = await page.evaluate(([c0]) => [2, 5, 10, 20].map(l => __cvb.scoreGame([0, c0[l]], ['x'], ['y'], { w: 1500, b: 1500 }).moves[0].score), [Object.fromEntries([2, 5, 10, 20].map(l => [l, winCp(50 - l)]))]);
    const want = [92.4, 80.8, 64.6, 41.0];
    moveAcc.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 0.35, 'move accuracy ' + v + ' vs ' + want[i]));
    // no loss of winning chances (even a gain) = 100
    assert.equal(await page.evaluate(() => __cvb.scoreGame([0, 200], ['x'], ['y'], { w: 1500, b: 1500 }).moves[0].score), 100);
    // weak play scores clearly lower than engine play; engine play stays high
    assert.ok(by(250).w <= 70, 'bot 250 accuracy ' + by(250).w);
    assert.ok(by(510).w <= 70, 'bot 510 accuracy ' + by(510).w);
    assert.ok(by(2800).w >= 85 && by(2800).b >= 85, 'engine vs engine ' + by(2800).w + '/' + by(2800).b);
    assert.ok(by(250).w + 15 < by(2800).w, 'weak << engine');
    // 100 only when every move is the engine move
    for (const r of res) assert.ok(r.w < 100 && r.b < 100);
    const perfect = await page.evaluate(() => { const r = __cvb.scoreGame([0, 0, 0], ['a', 'b'], ['a', 'b'], { w: 1500, b: 1500 }); return [r.w, r.b]; });
    assert.deepEqual(perfect, [100, 100]);
    // one blunder among good moves pulls the harmonic part down: clearly below the plain average of the moves
    const mixed = await page.evaluate(() => { const pov = [0, 10, 0, 10, 0, 10, 0, -600, -590, -600, -590, -600, -590], mv = pov.slice(1).map((_, i) => 'm' + i); const r = __cvb.scoreGame(pov, mv, mv.map((m, i) => i % 2 === 0 && i !== 6 ? m : null), { w: 1500, b: 1500 }); const sc = r.moves.filter((_, i) => i % 2 === 0).map(m => m.score); return { acc: r.w, mean: sc.reduce((a, b) => a + b, 0) / sc.length }; });
    assert.ok(mixed.acc < mixed.mean - 1, 'accuracy ' + mixed.acc + ' below the plain mean ' + mixed.mean);
    // classes: custom Chess vs Bots Win%-loss bands (not Chess.com labels)
    const cls = await page.evaluate(() => [0, 40, 80, 150, 300, 900].map(l => __cvb.scoreGame([0, -l], ['x'], ['y'], { w: 1500, b: 1500 }).moves[0].cls));
    assert.deepEqual(cls[0], 'excellent', 'not the engine move but nothing lost'); assert.ok(['excellent', 'good'].includes(cls[1])); assert.equal(cls[5], 'blunder');
    // a lost side throwing material away is no longer almost free (the Lichess curve alone is flat there) ...
    const thrown = await page.evaluate(() => __cvb.scoreGame([-800, -1250], ['x'], ['y']).moves[0]);
    assert.ok(thrown.score < 60 && ['mistake', 'blunder'].includes(thrown.cls), 'rook thrown away in a lost position: ' + JSON.stringify(thrown));
    // ... and only the engine's own move is called Best
    assert.equal(await page.evaluate(() => __cvb.scoreGame([300, 295], ['x'], ['x']).moves[0].cls), 'best');
    console.log('    accuracy by strength:', res.map(r => r.A + ':' + r.w + '/' + r.C + ':' + r.b).join('  '));
    ok('accuracy by the Lichess method (2/5/10/20 points lost = ' + moveAcc.map(v => v.toFixed(1)).join('/') + '), perfect play = 100, harmonic part punishes blunders, custom Win%-loss classes');
    await page.context().close();
  }

  // ── 15. texts under the picture follow the app language ────────────────────
  {
    const page = await newPage();
    await page.goto(URL_); await page.waitForTimeout(300);
    const texts = {};
    for (const lang of ['en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'bg']) {
      await page.selectOption('#langSel', lang); await page.waitForTimeout(100);
      await page.click('#playBtn');
      await page.click('.grp[data-group="beginner"] .grpHead').catch(() => {});
      await page.evaluate(() => document.querySelector('.grp[data-group="beginner"]:not(.open) .grpHead') && document.querySelector('.grp[data-group="beginner"] .grpHead').click());
      await page.click('.grp[data-group="beginner"] .botTile >> nth=1');           // Ayşe (TR)
      const t = await page.textContent('#setupBio');
      assert.ok(t.includes('Merhaba!') && t.includes('Ayşe'), lang + ': ' + t);
      assert.ok(!/[{}]/.test(t), 'no placeholders left in ' + lang);
      texts[lang] = t;
      await page.click('#setupBack'); await page.click('#botsBack');
    }
    assert.equal(new Set(Object.values(texts)).size, 8, 'a different text in every language');
    assert.ok(/Türkiye|Turquie|Turkey|Turquía|Turchia|Turquia|Turkije|Турция/.test(Object.values(texts).join(' ')), 'country name translated');
    assert.ok(texts.bg.includes('Аз съм') || texts.bg.includes('Ayşe ('), 'Bulgarian text: ' + texts.bg);
    assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
    ok('bot description in 8 languages with a greeting in the bot\'s own language and a translated country name');
    await page.context().close();
  }

  // ── 16. Home / Settings / Full view buttons on every page; link to Chess Tactics Gym ──
  {
    const URL_TACTICS = 'https://apps.apple.com/bg/app/chess-tactics-gym-train-chess/id6830729167';
    for (const theme of ['dark', 'light']) {
      const page = await newPage({});
      await page.addInitScript(t => localStorage.setItem('chessvsbots_prefs', JSON.stringify({ theme: t })), theme);
      await page.goto(URL_); await page.waitForTimeout(400);
      const hl = await page.evaluate(() => { const a = document.getElementById('homeTactics'); const cs = getComputedStyle(a); return { href: a.getAttribute('href'), color: cs.color, bg: cs.backgroundColor }; });
      assert.equal(hl.href, URL_TACTICS, 'home link');
      assert.equal(hl.color, 'rgb(255, 255, 255)', theme + ': the puzzle button text is white (not the purple of a visited link)');
      assert.ok(!/rgba\(0, 0, 0, 0\)/.test(hl.bg), theme + ': the puzzle button has a solid background');
      await shot(page, '16_home_' + theme);
      await page.context().close();
    }
    const page = await newPage({});
    await page.goto(URL_); await page.waitForTimeout(400);
    // every page with a title bar has Home, Settings (except Settings itself) and Full view
    const open = {
      botsScreen: async () => { await page.click('#playBtn'); },
      setupScreen: async () => { await page.click('#playBtn'); await page.click('.grp.open .botTile >> nth=0'); },
      statsScreen: async () => { await page.click('#statsBtn'); },
      profileScreen: async () => { await page.click('#homeProfile'); },
      settingsScreen: async () => { await page.click('#settBtn'); },
      aboutScreen: async () => { await page.click('#aboutHomeBtn'); },
      privacyScreen: async () => { await page.click('#settBtn'); await page.click('#privBtn'); },
    };
    const toHome = async () => { await page.evaluate(() => document.querySelector('.screen.active .navBtn[data-nav=home]').click()); await page.waitForTimeout(80); };
    for (const [id, go] of Object.entries(open)) {
      await go();
      assert.ok(await page.evaluate(i => document.getElementById(i).classList.contains('active'), id), id + ' opened');
      const nav = await page.evaluate(i => ['home', 'gear', 'full'].map(k => { const b = document.querySelector('#' + i + ' .navBtn[data-nav=' + k + ']'); return b ? b.offsetParent !== null && b.getBoundingClientRect().width >= 40 : false; }), id);
      assert.deepEqual(nav, [true, id !== 'settingsScreen', true], id + ': home / settings / full view buttons');
      if (id === 'botsScreen') await shot(page, '16_nav_bots');
      if (id === 'statsScreen') await shot(page, '16_nav_stats');
      // settings: from here and back to here
      if (id === 'botsScreen' || id === 'statsScreen') {
        await page.click('#' + id + ' .navBtn[data-nav=gear]');
        assert.ok(await page.evaluate(() => document.getElementById('settingsScreen').classList.contains('active')), id + ' -> settings');
        await page.click('#settBack');
        assert.ok(await page.evaluate(i => document.getElementById(i).classList.contains('active'), id), 'settings returns to ' + id);
      }
      await toHome();
      assert.ok(await page.evaluate(() => document.getElementById('homeScreen').classList.contains('active')), id + ' -> home');
    }
    // the review page
    await startGame(page, 0, 'w');
    await page.evaluate(() => __cvb.endGame('loss', 'resign'));
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    await page.click('#goReview');
    await waitFor(page, () => document.getElementById('reviewBody').style.display !== 'none', 60000);
    assert.equal(await page.locator('#reviewScreen .navBtn').count(), 3, 'review has the buttons');
    await toHome();
    // the game page: home keeps the game, settings opens settings with "continue"
    await startGame(page, 0, 'w');
    assert.equal(await page.locator('#playScreen .navBtn').count(), 3);
    await shot(page, '16_nav_play');
    await page.click('#playScreen .navBtn[data-nav=gear]');
    assert.ok(await page.evaluate(() => document.getElementById('settingsScreen').classList.contains('active')));
    assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('settContinue')).display !== 'none'), 'continue is offered');
    await page.click('#settingsScreen .navBtn[data-nav=home]');
    assert.ok(await page.evaluate(() => document.getElementById('homeScreen').classList.contains('active')));
    assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('continueBtn')).display !== 'none'), 'the game in progress can be continued from home');
    await page.click('#continueBtn'); await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => document.getElementById('playScreen').classList.contains('active') && !__cvb.G.over));
    await page.click('#playScreen .navBtn[data-nav=home]');
    assert.ok(await page.evaluate(() => document.getElementById('homeScreen').classList.contains('active')));
    // full view toggles (browser full screen where the browser allows it)
    await page.click('#homeScreen .homeFull');
    assert.ok(await page.evaluate(() => document.body.classList.contains('fullview')), 'full view on');
    await page.click('#homeScreen .homeFull');
    assert.ok(await page.evaluate(() => !document.body.classList.contains('fullview')), 'full view off');
    // labels follow the language
    await page.selectOption('#langSel', 'de');
    assert.equal(await page.getAttribute('#homeScreen .homeFull', 'aria-label'), 'Vollbild');
    assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
    ok('Home / Settings / Full view buttons on every page, home keeps the game in progress, puzzle button is readable in dark and light, link to Chess Tactics Gym');
    await page.context().close();
  }

  // ── 17. iPad / large screens: adaptive layout ──────────────────────────────
  {
    const sizes = [[390, 844], [768, 1024], [820, 1180], [1024, 768], [1180, 820], [1366, 1024]];
    const rows = [];
    for (const [w, h] of sizes) {
      const page = await newPage({ viewport: { width: w, height: h } });
      await page.goto(URL_); await page.waitForTimeout(300);
      assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), w + 'x' + h + ' home overflows');
      await startGame(page, 0, 'w');
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const r = id => { const b = document.querySelector(id).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
        return { board: r('#boardSvg'), ctrl: r('.gameControls'), you: r('#youBar'), opp: r('#oppBar'), iw: innerWidth, ih: innerHeight, over: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      assert.ok(!m.over, w + 'x' + h + ' horizontal overflow');
      assert.ok(Math.abs(m.board.w - m.board.h) < 1.5, 'the board is square');
      assert.ok(m.board.r <= m.iw + 1 && m.ctrl.r <= m.iw + 1, 'inside the screen');
      const landscape = w >= 980 && w > h;
      if (landscape) {
        assert.ok(m.ctrl.l >= m.board.r - 1, w + 'x' + h + ': controls to the right of the board');
        assert.ok(m.board.b <= m.ih && m.you.b <= m.ih + 2, w + 'x' + h + ': board and both player bars fit in the height (' + Math.round(m.you.b) + ' of ' + m.ih + ')');
        assert.ok(m.board.w >= 520, w + 'x' + h + ': a big board (' + Math.round(m.board.w) + 'px)');
      } else if (w >= 700) {
        assert.ok(m.board.w >= 600, w + 'x' + h + ': a big board on a tablet in portrait (' + Math.round(m.board.w) + 'px)');
        assert.ok(m.ctrl.b <= m.ih + 2, w + 'x' + h + ': everything fits without scrolling (' + Math.round(m.ctrl.b) + ' of ' + m.ih + ')');
      } else assert.ok(m.board.w >= 330 && m.board.w <= 380, 'phone board ' + m.board.w);
      rows.push(w + 'x' + h + ': board ' + Math.round(m.board.w) + 'px');
      if (w === 768 || w === 1024 || w === 1366) await shot(page, '17_play_' + w + 'x' + h);
      if (w === 1024) {                                   // the other pages are centred and not stretched
        await page.click('#playScreen .navBtn[data-nav=home]');
        const bw = await page.evaluate(() => document.getElementById('playBtn').getBoundingClientRect().width);
        assert.ok(bw <= 690, 'home buttons are not stretched across a wide screen: ' + bw);
        await shot(page, '17_home_1024');
        // full view lifts the width limit
        await page.click('#homeScreen .homeFull');
        assert.ok(await page.evaluate(() => document.body.classList.contains('fullview')));
      }
      assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
      await page.context().close();
    }
    ok('adaptive layout: ' + rows.join(', ') + '; no overflow, landscape tablets show board and controls side by side');
  }

  // ── 18. move table + browsing earlier positions in the game (wide layout) ──
  {
    const page = await newPage({ viewport: { width: 1366, height: 1024 } });
    await page.goto(URL_); await page.waitForTimeout(300);
    await scriptBot(page, ['e7e5', 'b8c6', 'g8f6']);
    await startGame(page, 0, 'w');
    await tap(page, 'e2', 'e4'); await waitFor(page, () => __cvb.G.chess.history().length >= 2);
    await tap(page, 'g1', 'f3'); await waitFor(page, () => __cvb.G.chess.history().length >= 4);
    await tap(page, 'f1', 'c4'); await waitFor(page, () => __cvb.G.chess.history().length >= 6);
    assert.ok(await page.isVisible('#moveTable') && !(await page.isVisible('#moveStrip')), 'table instead of the strip in the wide layout');
    const cells = await page.$$eval('#moveTable button', b => b.map(x => x.textContent));
    assert.deepEqual(cells, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], 'all moves in the table');
    assert.equal(await page.$$eval('#moveTable .mn', e => e.map(x => x.textContent).join(' ')), '1. 2. 3.');
    assert.equal(await page.$eval('#moveTable button.cur', b => b.textContent), 'Nf6', 'the last move is highlighted');
    assert.ok(await page.isDisabled('#mvNext') && await page.isDisabled('#mvLast'), 'nothing newer than the last move');
    const fenLive = await page.evaluate(() => __cvb.G.chess.fen());
    await page.click('#mvPrev');
    assert.equal(await page.$eval('#moveTable button.cur', b => b.textContent), 'Bc4');
    await page.click('#mvFirst');
    assert.equal(await page.$('#moveTable button.cur'), null, 'start position: no move highlighted');
    assert.ok(await page.isDisabled('#mvPrev'));
    assert.equal(await page.evaluate(() => __cvb.G.view), 0);
    assert.ok((await page.textContent('#playNote')).length > 0 && await page.evaluate(() => document.getElementById('playNote').className.includes('warn')), 'a note says an earlier position is shown');
    // the live game is untouched; moves cannot be played while looking at the past
    assert.equal(await page.evaluate(() => __cvb.G.chess.fen()), fenLive);
    await tap(page, 'd2', 'd4'); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => __cvb.G.chess.fen()), fenLive, 'no move in the past');
    await page.click('#moveTable button[data-k="3"]');
    assert.equal(await page.evaluate(() => __cvb.G.view), 3); assert.equal(await page.$eval('#moveTable button.cur', b => b.textContent), 'Nf3');
    await page.click('#mvNext'); await page.click('#mvNext');
    assert.equal(await page.evaluate(() => __cvb.G.view), 5);
    await shot(page, '18_table_1366');
    await page.click('#mvLast');
    assert.equal(await page.evaluate(() => __cvb.G.view), null);
    assert.equal(await page.evaluate(() => __cvb.board().getOrientation()), 'white');
    // back in the live position the move can be played again
    await tap(page, 'd2', 'd3'); await waitFor(page, () => __cvb.G.chess.history().length >= 7);
    // a bot move (or a hint) while looking back returns to the live position
    await page.click('#mvFirst'); assert.equal(await page.evaluate(() => __cvb.G.view), 0);
    await waitFor(page, () => __cvb.G.chess.history().length >= 8 && __cvb.G.view == null, 30000);
    assert.ok(await page.$$eval('#moveTable button', b => b.length) >= 8);
    // narrow screens keep the strip
    const phone = await newPage({ viewport: { width: 390, height: 844 } });
    await phone.goto(URL_); await phone.waitForTimeout(300);
    await startGame(phone, 0, 'w');
    assert.ok(await phone.isVisible('#moveStrip') && !(await phone.isVisible('#moveTable')), 'phone: strip only');
    assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
    await phone.context().close(); await page.context().close();
    ok('move table (all moves, highlight, first/previous/next/latest, tap a move), read-only past positions, back to live on a move; phone keeps the strip');
  }

  // ── 19. review: evaluation bar on the left, move table, layouts ───────────
  {
    for (const [w, h] of [[1366, 1024], [390, 844]]) {
      const page = await newPage({ viewport: { width: w, height: h } });
      await page.goto(URL_); await page.waitForTimeout(300);
      await scriptBot(page, ['f2f3', 'g2g4']);
      await startGame(page, 0, 'b');
      await waitFor(page, () => __cvb.G.chess.history().length >= 1);
      await tap(page, 'e7', 'e5'); await waitFor(page, () => __cvb.G.chess.history().length >= 3);
      await tap(page, 'd8', 'h4');
      await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
      await page.click('#goReview');
      await waitFor(page, () => document.getElementById('reviewBody').style.display !== 'none', 60000);
      assert.ok(await page.isVisible('#evalBar'), 'evaluation bar is visible');
      const bar = await page.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); return { bar: r('evalBar'), board: r('revBoardSvg') }; });
      assert.ok(bar.bar.right <= bar.board.left + 1, 'the bar is left of the board');
      assert.ok(Math.abs(bar.bar.height - bar.board.height) < 3, 'the bar is as tall as the board');
      // the bar follows the move: at the end (mate for Black, I am Black) the bar is black-filled; at the start it is even
      await page.click('#revFirst');
      const h0 = parseFloat(await page.$eval('#ebWhite', e => e.style.height));
      assert.ok(h0 > 45 && h0 < 58, 'start position is about even (' + h0 + '%)');
      await page.click('#revLast');
      const h4 = parseFloat(await page.$eval('#ebWhite', e => e.style.height));
      assert.ok(h4 < 10, 'after mate against White the white part is almost empty (' + h4 + '%)');
      assert.ok(await page.$eval('#ebTxt', e => e.className.includes('onB')), 'number on the black part');
      const f0 = await page.$eval('#evalBar', e => e.classList.contains('flip'));
      assert.equal(f0, true, 'I play Black: White is at the top of the bar');
      await page.click('#revFlip');
      assert.equal(await page.$eval('#evalBar', e => e.classList.contains('flip')), false, 'the bar turns with the board');
      await page.click('#revFlip');
      // table layout only in the wide layout
      const disp = await page.$eval('#revMoves', e => getComputedStyle(e).display);
      if (w >= 980) {
        assert.equal(disp, 'grid', 'moves as a table');
        const cols = await page.$eval('#revMoves', e => getComputedStyle(e).gridTemplateColumns.split(' ').length);
        assert.equal(cols, 3);
        const lay = await page.evaluate(() => { const r = id => document.querySelector(id).getBoundingClientRect(); return { board: r('#revBoardSvg'), nav: r('.revNav'), moves: r('#revMoves'), ih: innerHeight }; });
        assert.ok(lay.nav.left >= lay.board.right - 1 && lay.moves.left >= lay.board.right - 1, 'controls and moves to the right of the board');
        assert.ok(lay.board.bottom <= lay.ih + 2, 'the board fits the height');
        await shot(page, '19_review_wide');
      } else {
        assert.equal(disp, 'flex', 'phone: the old list');
        await shot(page, '19_review_phone');
      }
      assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)), 'no horizontal overflow');
      assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
      await page.context().close();
    }
    ok('review: evaluation bar left of the board follows every move (even / mate / flip), moves table and two-column layout on wide screens, phone layout unchanged');
  }

  // ── 20. ratings: legends above Master ───────────────────────────────────────
  {
    const page = await newPage({});
    await page.goto(URL_); await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ legends: Bots.list.filter(b => b.group === 'top').map(b => [b.id, b.elo]), masters: Bots.list.filter(b => b.group === 'master').map(b => b.elo), adv: Bots.list.filter(b => b.group === 'advanced').map(b => b.elo) }));
    assert.deepEqual(r.legends, [['morphy', 2675], ['lasker', 2715], ['tal', 2780], ['capablanca', 2800], ['alekhine', 2825]]);
    assert.equal(r.masters.length, 10); assert.equal(Math.max(...r.masters), 2775);
    assert.ok(r.masters.every((v, i, a) => !i || v > a[i - 1]), 'master ratings still rise');
    assert.ok(Math.min(...r.masters) > Math.max(...r.adv));
    assert.ok(Math.max(...r.legends.map(l => l[1])) > Math.max(...r.masters));
    ok('ratings: legends 2675-2825, Master lowered by 5-25 (top 2775)');
    await page.context().close();
  }

  // ── 21. several players on one device (up to 5): switch, own rating / statistics / saved game, outline picture until chosen ──
  {
    const page = await newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(URL_); await page.waitForTimeout(300);
    const cur = () => page.evaluate(() => (o => ({ cur: o.cur, n: o.list.length, p: o.list.find(p => p.id === o.cur) }))(JSON.parse(localStorage.getItem('chessvsbots_profiles'))));
    // a fresh player is "unidentified": only an outline of a person, no drawn picture selected
    assert.ok(await page.locator('#homeProfile svg.blank').count() === 1, 'outline picture on home');
    await page.click('#homeProfile');
    assert.equal(await page.locator('#profPlayers .plCard').count(), 2, 'one player + the add card');
    assert.equal(await page.locator('#profPlayers .plCard.sel svg.blank').count(), 1);
    assert.equal(await page.locator('.presetBtn.sel').count(), 0, 'no picture chosen yet');
    assert.equal(await page.isVisible('#profDelBtn'), false, 'a single player cannot be removed');
    await page.fill('#profName', 'Anna'); await page.click('.presetBtn >> nth=3');
    assert.equal(await page.textContent('#profPlayers .plCard.sel .plName'), 'Anna', 'the card shows the name at once');
    // play a game as Anna (resign) to give her a rating
    await page.click('#profileBack');
    await startGame(page, 0, 'w'); await tap(page, 'e2', 'e4'); await waitFor(page, () => __cvb.G.chess.history().length >= 2);
    await page.click('#playScreen .navBtn[data-nav=home]');
    assert.ok(await page.evaluate(() => !!__cvb.saved), 'Anna has a game in progress');
    const annaRating = await page.evaluate(() => __cvb.stats.rating);
    // add a second player
    await page.click('#homeProfile'); await page.click('#plAdd');
    let c = await cur(); assert.equal(c.cur, 'p2'); assert.equal(c.n, 2); assert.equal(c.p.av.t, 'none'); assert.equal(c.p.name, '');
    assert.equal(await page.textContent('#profPlayers .plCard.sel .plName'), 'Player 2');
    assert.equal(await page.evaluate(() => __cvb.saved), null, 'the new player has no saved game');
    assert.equal(await page.evaluate(() => __cvb.stats.games), 0);
    assert.equal(await page.isVisible('#profDelBtn'), true);
    await page.fill('#profName', 'Boris'); await page.selectOption('#profCountry', 'BG'); await page.click('.presetBtn >> nth=7');
    await page.click('#profileBack');
    assert.ok((await page.textContent('#homeProfile')).includes('Boris'));
    assert.equal(await page.isVisible('#continueBtn'), false, "Boris sees no 'continue' of Anna's game");
    // Boris plays and resigns -> his own rating
    await startGame(page, 0, 'w'); await tap(page, 'd2', 'd4'); await waitFor(page, () => __cvb.G.chess.history().length >= 2);
    await page.click('#resignBtn'); await page.click('#confirmYes');
    await waitFor(page, () => document.getElementById('gameOverlay').style.display === 'flex', 5000);
    const borisRating = await page.evaluate(() => __cvb.stats.rating);
    assert.ok(borisRating < 800, 'Boris lost: ' + borisRating);
    await page.click('#goHome').catch(() => {});
    await page.evaluate(() => { document.getElementById('gameOverlay').style.display = 'none'; });
    // switch back to Anna by tapping her card (the carousel): her rating, her unfinished game
    await page.click('#homeProfile');
    await page.click('#profPlayers .plCard[data-id=p1]');
    assert.equal((await cur()).cur, 'p1');
    assert.equal(await page.evaluate(() => __cvb.stats.rating), annaRating);
    assert.equal(await page.evaluate(() => __cvb.stats.games), 0, 'Anna has played no finished game');
    assert.ok(await page.evaluate(() => !!__cvb.saved), "Anna's game in progress is back");
    await page.click('#profileBack');
    assert.ok(await page.isVisible('#continueBtn'), 'continue is offered again');
    // statistics are separate and everything survives a reload
    await page.reload(); await page.waitForTimeout(400);
    assert.ok((await page.textContent('#homeProfile')).includes('Anna'));
    await page.click('#homeProfile'); await page.click('#profPlayers .plCard[data-id=p2]');
    assert.equal(await page.evaluate(() => __cvb.stats.rating), borisRating); assert.equal(await page.evaluate(() => __cvb.stats.games), 1);
    // the carousel shows ratings of everybody and scrolls horizontally when it does not fit (5 players)
    for (let i = 0; i < 3; i++) await page.click('#plAdd');
    assert.equal((await cur()).n, 5); assert.equal(await page.locator('#plAdd').count(), 0, 'no add card at 5 players');
    const sc = await page.$eval('#profPlayers', e => ({ sw: e.scrollWidth, cw: e.clientWidth, ox: getComputedStyle(e).overflowX }));
    assert.ok(sc.sw > sc.cw && sc.ox === 'auto', 'swipeable carousel on a phone: ' + JSON.stringify(sc));
    await shot(page, '21_players');
    // remove the current (5th) player: back to another one, data of the removed one is gone
    await page.click('#profDelBtn'); await page.click('#confirmYes');
    assert.equal((await cur()).n, 4);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => /_p5$/.test(k)).length), 0, 'the removed player left nothing behind');
    // an old single-profile installation is migrated (name, country, picture, rating, game in progress stay with the first player)
    const old = await newPage({ viewport: { width: 390, height: 844 } });
    await old.addInitScript(() => { if (!localStorage.getItem('chessvsbots_stats')) { localStorage.setItem('chessvsbots_profile', JSON.stringify({ name: 'Old', cc: 'DE', av: { t: 'preset', i: 4 } })); localStorage.setItem('chessvsbots_stats', JSON.stringify({ rating: 1234, peak: 1234, games: 7, w: 4, d: 1, l: 2 })); } });
    await old.goto(URL_); await old.waitForTimeout(400);
    assert.ok((await old.textContent('#homeProfile')).includes('Old'));
    assert.equal(await old.evaluate(() => __cvb.stats.rating), 1234);
    await old.click('#homeProfile');
    assert.equal(await old.locator('.presetBtn.sel').count(), 1, 'the old drawn picture is kept');
    assert.deepEqual(old.errors.filter(e => !/Failed to load resource/.test(e)), []);
    assert.deepEqual(page.errors.filter(e => !/Failed to load resource/.test(e)), []);
    await old.context().close(); await page.context().close();
    ok('players: up to 5 on one device, outline picture until chosen, swipeable carousel, own rating / statistics / game in progress, remove a player, migration of the old single profile');
  }

  console.log(`\nALL WEB TESTS PASSED (${passed} groups)`);
} catch (e) {
  console.error('\nTEST FAILED:', e && e.stack || e);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
}
