/**
 * game.js — Chess vs Bots: screens, game flow, rating, review, settings.
 * Screens: home → bots → setup → play → (review) | stats | settings | about | privacy | remove ads
 *
 * Released under the GNU GPL v3 (see LICENSE). Stockfish (GPL v3) runs in a Web Worker: see engine.js.
 */
'use strict';

(function () {

  // ── Constants ────────────────────────────────────────────────────────────
  const STORAGE_PREFIX = 'chessvsbots_';
  const START_RATING = 800;
  const MAX_RECENT = 1000;     // finished games kept per player (for the period statistics and the games-per-bot lists)
  const MAX_HIST = 400;        // rating history points
  const MAX_IMPORTS = 1000;    // analysed games that were loaded from a PGN (per player)
  const STATS_BUDGET = 900000; // characters of one player's statistics in localStorage; above it the stored analyses of the oldest games are dropped (made again when opened)

  // Board themes — separate palettes for dark and light UI modes
  const BOARD_THEMES = {
    dark: {
      ocean:    { light:'#ced9e4', dark:'#5a8fa8' },
      forest:   { light:'#c8d9c0', dark:'#5a9464' },
      night:    { light:'#555577', dark:'#333355' },
      ruby:     { light:'#e8c4c4', dark:'#9f4a4a' },
      slate:    { light:'#9aa5b5', dark:'#4a5568' },
      plum:     { light:'#d9c4e6', dark:'#7a4f96' },
      teal:     { light:'#b7e3e0', dark:'#2f8a8a' },
      charcoal: { light:'#8a8a8a', dark:'#3d3d3d' },
      bronze:   { light:'#d9b88f', dark:'#7a4b24' },
      midnight: { light:'#3b4a6b', dark:'#1c2740' },
      wine:     { light:'#d8b4b8', dark:'#7a2f45' },
      moss:     { light:'#c9d1a8', dark:'#5a6b34' },
      steel:    { light:'#b8c4d6', dark:'#3d5a80' },
      copper:   { light:'#e3b894', dark:'#a0522d' },
      jade:     { light:'#bfe6d0', dark:'#2f7d5b' },
      indigo:   { light:'#c5cae9', dark:'#3f4aa0' },
      graphite: { light:'#7f8a96', dark:'#2b3036' },
      sunset:   { light:'#f3c9a8', dark:'#8c3b3b' },
    },
    light: {
      classic:  { light:'#f0d9b5', dark:'#b58863' },
      marble:   { light:'#e8e8e8', dark:'#9aafbc' },
      mint:     { light:'#d9f0e0', dark:'#56a876' },
      sky:      { light:'#dceaf5', dark:'#6590b5' },
      rose:     { light:'#f7dde4', dark:'#d98ca3' },
      sand:     { light:'#f5e6c8', dark:'#c9a66b' },
      lavender: { light:'#e9e0f5', dark:'#9a85c9' },
      olive:    { light:'#eef0cf', dark:'#7a9150' },
      ice:      { light:'#eef6fb', dark:'#8fb3cf' },
      coffee:   { light:'#e8d5c0', dark:'#8a5a3c' },
      peach:    { light:'#fde3cf', dark:'#e0976b' },
      lemon:    { light:'#fbf3c4', dark:'#c9b458' },
      aqua:     { light:'#d6f1f2', dark:'#5db0b5' },
      blush:    { light:'#fbe4e2', dark:'#cf8a85' },
      sage:     { light:'#e5ecd8', dark:'#8aa070' },
      dove:     { light:'#e3e7ee', dark:'#7b8aa3' },
      tan:      { light:'#efe0c9', dark:'#a67c52' },
      cream:    { light:'#fbf5e6', dark:'#b9a07a' },
    },
  };

  // ── Native Bridge ────────────────────────────────────────────────────────
  const Native = window.ChessNative || {
    isNative: false,
    setStatusBarStyle() {},
    vibrate(ms) { if (navigator.vibrate) navigator.vibrate(ms); },
  };

  const $ = id => document.getElementById(id);
  const tt = (key, vars) => {
    let s = window.t(key);
    if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  };

  // ── State ────────────────────────────────────────────────────────────────
  let prefs = {
    lang: detectLang(), theme: 'dark', sound: true, vibrate: true,
    coordMode: 'outside', darkBoard: 'slate', lightBoard: 'classic', pieceSet: 'classic0',
    showLegal: true, autoQueen: false,
  };
  let stats = null;            // rating, record, recent games (see freshStats)
  let saved = null;            // the saved game in progress (or null)
  let G = null;                // the game being played
  let board = null;            // interactive board (play screen)
  let settingsFrom = 'homeScreen', aboutFrom = 'homeScreen';
  let setupBot = null, setupColor = 'r';
  let pendingConfirm = null;

  function detectLang() {
    try {
      const list = (navigator.languages && navigator.languages.length) ? navigator.languages : [navigator.language];
      const codes = window.CHESS_LANGS.map(l => l.code);
      for (const raw of list) {
        const c = String(raw || '').toLowerCase().split(/[-_]/)[0];
        if (codes.includes(c)) return c;
      }
    } catch (e) {}
    return 'en';
  }

  // ── Audio / haptics ──────────────────────────────────────────────────────
  let _audioCtx = null;
  function playTone(freq, duration, type, gain, delay) {
    if (!prefs.sound) return;
    try {
      if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = _audioCtx, t0 = ctx.currentTime + (delay || 0);
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = type || 'sine'; osc.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.18, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(g); g.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + duration);
    } catch (e) {}
  }
  const soundMove = () => playTone(440, 0.07, 'square', 0.10);
  const soundCapture = () => { playTone(300, 0.09, 'square', 0.14); playTone(220, 0.08, 'square', 0.10, 0.04); };
  const soundCheck = () => { playTone(740, 0.09, 'sine', 0.16); playTone(740, 0.09, 'sine', 0.14, 0.11); };
  const soundWin = () => [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.18, 'sine', 0.18, i * 0.12));
  const soundLose = () => [392, 330, 262].forEach((f, i) => playTone(f, 0.22, 'sawtooth', 0.12, i * 0.16));
  const soundDraw = () => [494, 494].forEach((f, i) => playTone(f, 0.2, 'sine', 0.15, i * 0.18));
  const soundClick = () => playTone(600, 0.05, 'square', 0.07);
  const doVibrate = ms => { if (prefs.vibrate) { try { Native.vibrate(ms); } catch (e) {} } };

  // ── Storage ──────────────────────────────────────────────────────────────
  function storageGet(key, def) {
    try { const v = localStorage.getItem(STORAGE_PREFIX + key); return v !== null ? JSON.parse(v) : def; }
    catch (e) { return def; }
  }
  function storageSet(key, val) { try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val)); } catch (e) {} }
  function storageDel(key) { try { localStorage.removeItem(STORAGE_PREFIX + key); } catch (e) {} }

  function loadPrefs() {
    Object.assign(prefs, storageGet('prefs', {}));
    if (!window.CHESS_LANGS.some(l => l.code === prefs.lang)) prefs.lang = detectLang();
    if (!ChessCore.PIECE_SET_KEYS.includes(prefs.pieceSet)) prefs.pieceSet = 'classic0';
    if (!['inside', 'outside', 'none'].includes(prefs.coordMode)) prefs.coordMode = 'outside';
  }
  const savePrefs = () => storageSet('prefs', prefs);

  function freshStats() { return { rating: START_RATING, peak: START_RATING, games: 0, w: 0, d: 0, l: 0, hist: [], bots: {}, best: 0, recent: [], stars: {}, imports: [] }; }
  function loadStats() {
    const s = storageGet(pkey('stats'), null);
    stats = Object.assign(freshStats(), s && typeof s === 'object' ? s : {});
    if (!Array.isArray(stats.hist)) stats.hist = [];
    if (!Array.isArray(stats.recent)) stats.recent = [];
    if (!Array.isArray(stats.imports)) stats.imports = [];
    if (!stats.bots || typeof stats.bots !== 'object') stats.bots = {};
    if (!stats.stars || typeof stats.stars !== 'object') stats.stars = {};
  }
  function saveStats() {
    let json = JSON.stringify(stats);
    if (json.length > STATS_BUDGET) {
      let size = json.length;
      for (const r of stats.recent.concat(stats.imports).filter(x => x.an).sort((x, y) => x.t - y.t)) {      // oldest first
        if (size <= STATS_BUDGET) break;
        size -= JSON.stringify(r.an).length + 6; delete r.an;
      }
      json = JSON.stringify(stats);
    }
    try { localStorage.setItem(STORAGE_PREFIX + pkey('stats'), json); } catch (e) {}
  }
  function loadSaved() {
    const s = storageGet(pkey('save'), null);
    saved = (s && Bots.byId(s.botId) && Array.isArray(s.moves) && (s.color === 'w' || s.color === 'b')) ? s : null;
    if (saved) {   // sanity: the moves must replay
      try { const c = new Chess(); for (const u of saved.moves) if (!c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] })) throw 0; if (c.isGameOver()) saved = null; }
      catch (e) { saved = null; }
      if (!saved) storageDel(pkey('save'));
    }
  }

  // ── Rating ───────────────────────────────────────────────────────────────
  function levelKey(r) { return r < 900 ? 'lvl0' : r < 1200 ? 'lvl1' : r < 1500 ? 'lvl2' : r < 1800 ? 'lvl3' : r < 2100 ? 'lvl4' : 'lvl5'; }
  const expectedScore = (r, botElo) => 1 / (1 + Math.pow(10, (botElo - r) / 400));
  // score: 1 win, .5 draw, 0 loss. Wins always give at least +1; assisted wins (hint/undo used) give half.
  function ratingDelta(r, botElo, score, games, assisted) {
    const K = games < 10 ? 48 : games < 30 ? 32 : 24;
    let d = Math.round(K * (score - expectedScore(r, botElo)));
    if (score === 1) { if (assisted) d = Math.round(d / 2); d = Math.max(1, d); }
    else if (score === 0.5 && d < 0 && assisted) d = Math.round(d / 2);
    return Math.max(100 - r, Math.min(3000 - r, d));
  }

  // ── Screens ──────────────────────────────────────────────────────────────
  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = $(id);
    if (el) el.classList.add('active');
    if (id !== 'reviewScreen') cancelReviewAnalysis();
    if (id === 'statsScreen') renderStats();
    if (id === 'privacyScreen') renderPrivacy();
    if (id === 'homeScreen') renderHome();
    if (id === 'botsScreen') renderBots();
    if (id === 'profileScreen') renderProfile();
    if (id === 'playScreen' && board) setTimeout(() => board.render(), 0);
    window.scrollTo(0, 0);
  }

  // ── Theme & board look ───────────────────────────────────────────────────
  function currentUiMode() {
    if (prefs.theme === 'system') return (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    return prefs.theme;
  }
  function currentPalette() {
    const mode = currentUiMode();
    const name = mode === 'dark' ? prefs.darkBoard : prefs.lightBoard;
    return BOARD_THEMES[mode][name] || Object.values(BOARD_THEMES[mode])[0];
  }
  function applyTheme() {
    const mode = currentUiMode();
    document.documentElement.setAttribute('data-theme', mode);
    try { Native.setStatusBarStyle(mode === 'dark'); } catch (e) {}
    applyBoardTheme();
  }
  function applyBoardTheme() {
    const pal = currentPalette();
    document.documentElement.style.setProperty('--sq-light', pal.light);
    document.documentElement.style.setProperty('--sq-dark', pal.dark);
    ChessCore.renderAll();
    if ($('homeScreen').classList.contains('active')) renderHome();
  }

  function applyLanguage(lang) {
    window._cvbLang = lang;
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang;
    document.querySelectorAll('[data-i18n]').forEach(el => { const v = window.t(el.getAttribute('data-i18n')); if (v) el.textContent = v; });
    document.querySelectorAll('[data-title-i18n]').forEach(el => { const v = window.t(el.getAttribute('data-title-i18n')); if (v) { el.title = v; el.setAttribute('aria-label', v); } });
    const sel = $('langSel');
    if (sel) {
      sel.innerHTML = '';
      for (const l of window.CHESS_LANGS) {
        const opt = document.createElement('option');
        opt.value = l.code; opt.textContent = l.flag + ' ' + l.name;
        if (l.code === lang) opt.selected = true;
        sel.appendChild(opt);
      }
    }
    const src = $('srcLink'); if (src) src.href = window.SOURCE_URL || '#';
    refreshAllViews();
    if (typeof updateNavLabels === 'function') updateNavLabels();
  }
  function refreshAllViews() {
    const active = document.querySelector('.screen.active');
    const id = active ? active.id : 'homeScreen';
    renderHome();
    if (id === 'botsScreen') renderBots();
    if (id === 'profileScreen') renderProfile();
    if (id === 'setupScreen') renderSetup();
    if (id === 'playScreen') renderPlayStatic();
    if (id === 'statsScreen') renderStats();
    if (id === 'settingsScreen') renderSettings();
    if (id === 'privacyScreen') renderPrivacy();
    if (id === 'reviewScreen') renderReview();
    updateColorButtons();
  }

  function showToast(msg, ms) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg; t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), ms || 2200);
  }

  // ── Dialogs ──────────────────────────────────────────────────────────────
  function confirmDialog(title, text, yesLabel, onYes) {
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text || '';
    $('confirmYes').textContent = yesLabel;
    pendingConfirm = onYes;
    $('confirmOverlay').style.display = 'flex';
  }
  function closeConfirm() { $('confirmOverlay').style.display = 'none'; pendingConfirm = null; }

  // ── Small drawing helpers ────────────────────────────────────────────────
  function pieceIcon(color, type, px) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1 1');
    if (px) { svg.setAttribute('width', px); svg.setAttribute('height', px); }
    ChessCore.drawPieceTo(svg, color, type, 0, 0, prefs.pieceSet);
    return svg;
  }
  const fmtDelta = d => (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d);
  function recLine(rec) { return tt('recLine', { w: rec.w, d: rec.d, l: rec.l }); }
  function botRec(id) { return stats.bots[id] || { w: 0, d: 0, l: 0 }; }
  const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const styleName = b => tt('style_' + b.style);

  // ── Players (up to 5 on one device; each has name, country, picture, rating, statistics and a game in progress) ──
  // Stored under 'profiles'. The first player (p1) keeps the old storage keys ('stats', 'save'), so nothing from older versions is lost;
  // the others use 'stats_p2', 'save_p2', ...
  const MAX_PROFILES = 5;
  let profiles = { cur: 'p1', list: [] };
  let profile = { id: 'p1', name: '', cc: '', av: { t: 'none' } };      // the current player (an element of profiles.list)
  let profileFrom = 'homeScreen';
  const keyFor = (id, base) => (id === 'p1' ? base : base + '_' + id);
  const pkey = base => keyFor(profiles.cur, base);
  function defaultCountry() {
    try {
      const m = String(navigator.language || '').match(/[-_]([A-Za-z]{2})$/);
      const cc = m ? m[1].toUpperCase() : '';
      return Avatars.ALL_CODES.includes(cc) ? cc : '';
    } catch (e) { return ''; }
  }
  function cleanProfile(p, id) {
    if (!p || typeof p !== 'object') return null;
    const av = p.av && p.av.t === 'photo' && typeof p.av.d === 'string' && p.av.d.indexOf('data:image/') === 0 ? { t: 'photo', d: p.av.d }
      : p.av && p.av.t === 'none' ? { t: 'none' }
      : { t: 'preset', i: p.av && p.av.i >= 0 && p.av.i < Avatars.PRESETS.length ? p.av.i | 0 : 0 };
    return { id, name: typeof p.name === 'string' ? p.name.slice(0, 20) : '', cc: Avatars.ALL_CODES.includes(p.cc) ? p.cc : '', av };
  }
  function loadProfile() {
    const all = storageGet('profiles', null);
    let list = [];
    if (all && Array.isArray(all.list)) {
      for (const p of all.list) {
        if (list.length < MAX_PROFILES && p && /^p[1-9]$/.test(p.id) && !list.some(x => x.id === p.id)) { const c = cleanProfile(p, p.id); if (c) list.push(c); }
      }
    }
    if (!list.length) {
      const old = storageGet('profile', null);          // a single profile from versions before 1.0.6
      list = [old && typeof old === 'object' ? cleanProfile(old, 'p1') : { id: 'p1', name: '', cc: defaultCountry(), av: { t: 'none' } }];
    }
    profiles.list = list;
    profiles.cur = all && list.some(p => p.id === all.cur) ? all.cur : list[0].id;
    profile = list.find(p => p.id === profiles.cur);
  }
  const saveProfile = () => storageSet('profiles', { cur: profiles.cur, list: profiles.list });
  const profName = () => (profile.name || '').trim() || tt('you');
  // the unidentified player: only an outline of a person, until a picture is chosen
  function blankAvatar(size) {
    const sz = size ? ' width="' + size + '" height="' + size + '"' : '';
    return '<svg class="botAvatar blank" viewBox="0 0 100 100"' + sz + ' aria-hidden="true"><circle class="bg" cx="50" cy="50" r="50"/><circle cx="50" cy="39" r="15"/><path d="M21 90c2-19 15-29 29-29s27 10 29 29" stroke-linecap="round"/></svg>';
  }
  function avatarHtmlOf(p, size) {
    const sz = size ? ' width="' + size + '" height="' + size + '"' : '';
    if (p.av.t === 'photo') return '<img class="botAvatar photo" alt=""' + sz + ' src="' + p.av.d + '">';
    if (p.av.t === 'none') return blankAvatar(size);
    return Avatars.portrait(Avatars.PRESETS[p.av.i] || Avatars.PRESETS[0], size);
  }
  const profAvatarHtml = size => avatarHtmlOf(profile, size);
  const profFlagHtml = h => profile.cc ? Avatars.flag(profile.cc, h || 14) : '';
  const playerLabel = p => (p.name || '').trim() || tt('playerN', { n: profiles.list.indexOf(p) + 1 });
  function ratingOfPlayer(p) {
    if (p.id === profiles.cur) return stats.rating;
    const s = storageGet(keyFor(p.id, 'stats'), null);
    return s && typeof s.rating === 'number' ? s.rating : START_RATING;
  }
  function countryNames() {
    let dn = null;
    try { dn = new Intl.DisplayNames([window._cvbLang === 'pt' ? 'pt-BR' : (window._cvbLang || 'en')], { type: 'region' }); } catch (e) {}
    const list = Avatars.ALL_CODES.filter(c => c !== 'OL').map(c => ({ c, n: (dn && dn.of(c)) || c })).sort((a, b) => a.n.localeCompare(b.n, window._cvbLang || 'en'));
    return [{ c: 'OL', n: tt('olympicFlag') }].concat(list);      // the Olympic flag right after "No country"
  }
  // change the current player: the game in progress and the statistics of the previous one are saved first
  function switchProfile(id, quiet) {
    const p = profiles.list.find(x => x.id === id);
    if (!p || id === profiles.cur) return;
    cancelThinking();
    try { saveGame(); } catch (e) {}
    saveStats();
    profiles.cur = id; profile = p;
    saveProfile();
    G = null;
    loadStats(); loadSaved(); statsBot = null;
    renderProfile(true); refreshProfileViews();
    if (!quiet) showToast(tt('playingAs', { name: playerLabel(p) }), 1800);
  }
  function addProfile() {
    if (profiles.list.length >= MAX_PROFILES) return;
    let n = 1; while (profiles.list.some(p => p.id === 'p' + n)) n++;
    const p = { id: 'p' + n, name: '', cc: defaultCountry(), av: { t: 'none' } };
    profiles.list.push(p);
    switchProfile(p.id, true);
  }
  function deleteProfile() {
    if (profiles.list.length < 2) return;
    const gone = profile;
    cancelThinking(); G = null;
    profiles.list = profiles.list.filter(p => p !== gone);
    storageDel(keyFor(gone.id, 'stats')); storageDel(keyFor(gone.id, 'save'));
    profiles.cur = profiles.list[0].id; profile = profiles.list[0];
    saveProfile();
    loadStats(); loadSaved(); statsBot = null;
    renderProfile(true); refreshProfileViews();
  }
  function refreshProfileViews() {
    renderHome();
    const active = document.querySelector('.screen.active');
    if (active && active.id === 'statsScreen') renderStats();
    if (G) renderPlayStatic();
  }
  function renderPlayers(center) {
    const box = $('profPlayers');
    if (!box) return;
    const keep = box.scrollLeft;
    let html = '';
    for (const p of profiles.list) {
      const sel = p.id === profiles.cur;
      html += '<button class="plCard' + (sel ? ' sel' : '') + '" data-id="' + p.id + '" role="option" aria-selected="' + sel + '">' + avatarHtmlOf(p) +
        '<span class="plName">' + esc(playerLabel(p)) + '</span><span class="plSub">' + (p.cc ? Avatars.flag(p.cc, 11) + ' ' : '') + ratingOfPlayer(p) + '</span></button>';
    }
    if (profiles.list.length < MAX_PROFILES) html += '<button class="plCard plAdd" id="plAdd"><span class="plPlus">+</span><span class="plName">' + tt('addPlayer') + '</span><span class="plSub">&nbsp;</span></button>';
    box.innerHTML = html;
    const cur = box.querySelector('.plCard.sel');
    box.scrollLeft = center && cur ? Math.max(0, cur.offsetLeft - (box.clientWidth - cur.offsetWidth) / 2) : keep;
  }
  function renderProfile(center) {
    renderPlayers(center !== false);
    $('profDelBtn').style.display = profiles.list.length > 1 ? '' : 'none';
    const grid = $('presetGrid');
    grid.innerHTML = '';
    Avatars.PRESETS.forEach((spec, i) => {
      const b = document.createElement('button');
      b.className = 'presetBtn' + (profile.av.t === 'preset' && profile.av.i === i ? ' sel' : '');
      b.setAttribute('aria-label', 'Avatar ' + (i + 1));
      b.innerHTML = Avatars.portrait(spec);
      b.addEventListener('click', () => { soundClick(); profile.av = { t: 'preset', i }; saveProfile(); renderProfile(false); refreshProfileViews(); });
      grid.appendChild(b);
    });
    const nm = $('profName');
    if (nm !== document.activeElement) nm.value = profile.name;
    nm.placeholder = tt('playerName');
    const sel = $('profCountry');
    sel.innerHTML = '<option value="">' + tt('noCountry') + '</option>' + countryNames().map(x => '<option value="' + x.c + '">' + x.n + '</option>').join('');
    sel.value = profile.cc;
    $('profFlag').innerHTML = profile.cc ? Avatars.flag(profile.cc, 22) : '';
  }
  function useProfilePhoto(file) {
    if (!file) return;
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      try {
        const S = 192, c = document.createElement('canvas'); c.width = c.height = S;
        const m = Math.min(img.naturalWidth, img.naturalHeight);
        c.getContext('2d').drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
        profile.av = { t: 'photo', d: c.toDataURL('image/jpeg', 0.86) };
        saveProfile(); renderProfile(false); refreshProfileViews();
      } catch (e) { showToast(tt('photoError')); }
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); showToast(tt('photoError')); };
    img.src = url;
  }
  function openProfile(from) { profileFrom = from || 'homeScreen'; showScreen('profileScreen'); }

  // ── Home ─────────────────────────────────────────────────────────────────
  // When the current player has not played yet, the home board shows the most recent game of any other player on this device.
  function lastGameOfOthers() {
    let best = null, bt = -1;
    for (const p of profiles.list) {
      if (p.id === profiles.cur) continue;
      const sv = storageGet(keyFor(p.id, 'save'), null), st = storageGet(keyFor(p.id, 'stats'), null);
      const cand = [];
      if (sv && Array.isArray(sv.moves) && sv.moves.length) cand.push({ g: sv, t: +sv.t || 0 });
      if (st && Array.isArray(st.recent) && st.recent[0] && Array.isArray(st.recent[0].moves) && st.recent[0].moves.length) cand.push({ g: st.recent[0], t: +st.recent[0].t || 0 });
      for (const c of cand) if (c.t >= bt) { bt = c.t; best = c.g; }
    }
    return best;
  }
  function renderHome() {
    const svg = $('homePreview');
    if (svg) {
      // the board on the home screen shows the last game: the one in progress, otherwise the last finished one (with its last move highlighted)
      const lg = saved || (stats.recent && stats.recent[0]) || lastGameOfOthers();
      let fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', last = null;
      if (lg && Array.isArray(lg.moves) && lg.moves.length) {
        try { fen = fenOf(lg.moves); const u = lg.moves[lg.moves.length - 1]; last = { from: u.slice(0, 2), to: u.slice(2, 4) }; } catch (e) { fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'; last = null; }
      }
      ChessCore.renderStatic(svg, fen, lg && lg.color === 'b' ? 'black' : 'white', last);
    }
    const r = $('homeRating');
    if (r) r.innerHTML = tt('yourRating') + ': <b>' + stats.rating + '</b><small>' + tt(levelKey(stats.rating)) + (stats.games < 10 ? ' · ' + tt('provisional') : '') + '</small>';
    const pc = $('homeProfile');
    if (pc) pc.innerHTML = profAvatarHtml() + '<span class="pcName">' + esc(profName()) + ' ' + profFlagHtml(14) + '</span><span class="pcEdit" aria-hidden="true">✎</span>';
    const cont = $('continueBtn');
    if (cont) {
      if (saved) { const b = Bots.byId(saved.botId); cont.style.display = ''; cont.textContent = tt('continueVs', { bot: b.name, elo: b.elo }); $('playBtn').classList.remove('primary'); $('playBtn').classList.add('soft'); }
      else { cont.style.display = 'none'; $('playBtn').classList.add('primary'); $('playBtn').classList.remove('soft'); }
    }
  }
  function fenOf(moves) {
    const c = new Chess();
    for (const u of moves) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return c.fen();
  }

  // ── Bots list ────────────────────────────────────────────────────────────
  function recommendedBot() {
    let best = Bots.list[0], diff = 1e9;
    for (const b of Bots.list) { const d = Math.abs(b.elo - stats.rating); if (d < diff) { diff = d; best = b; } }
    return best;
  }
  let openGroup;     // undefined = not chosen yet, null = all closed
  const starsOf = id => (stats.stars && stats.stars[id]) || 0;
  const starsHtml = n => '<span class="stars">' + '★'.repeat(n) + '<i>' + '★'.repeat(3 - n) + '</i></span>';
  function renderBots() {
    $('botsNote').textContent = tt('botsNote');
    $('starsNote').textContent = tt('starsHelp');
    const list = $('botList');
    list.innerHTML = '';
    const rec = recommendedBot();
    if (openGroup === undefined) openGroup = rec.group;
    for (const g of Bots.GROUPS) {
      const members = Bots.list.filter(b => b.group === g);
      const got = members.reduce((n, b) => n + starsOf(b.id), 0);
      const sec = document.createElement('div');
      sec.className = 'grp' + (g === openGroup ? ' open' : '');
      sec.dataset.group = g;
      const head = document.createElement('button');
      head.className = 'grpHead';
      head.innerHTML = Bots.avatar(members[members.length - 1]) +
        '<div class="gTxt"><div class="gName">' + tt('grp' + g.charAt(0).toUpperCase() + g.slice(1)) + '</div>' +
        '<div class="gSub">' + tt('nBots', { n: members.length }) + ' · ' + members[0].elo + '–' + members[members.length - 1].elo + '</div></div>' +
        '<div class="gStars">★ ' + got + '/' + members.length * 3 + '</div><span class="chev" aria-hidden="true">›</span>';
      head.addEventListener('click', () => { soundClick(); openGroup = openGroup === g ? null : g; renderBots(); });
      sec.appendChild(head);
      const body = document.createElement('div');
      body.className = 'grpBody';
      for (const b of members) {
        const btn = document.createElement('button');
        btn.className = 'botTile' + (b.id === rec.id ? ' rec' : '');
        btn.setAttribute('aria-label', b.name + ' ' + b.elo);
        btn.innerHTML = '<span class="tAv">' + Bots.avatar(b) + '<span class="tFlag">' + Bots.flag(b, 11) + '</span></span>' +
          '<span class="tName">' + (b.short || b.name) + '</span><span class="tElo">' + b.elo + '</span>' + starsHtml(starsOf(b.id)) +
          (b.id === rec.id ? '<span class="tRec">' + esc(tt('recommended')) + '</span>' : '');
        btn.addEventListener('click', () => { soundClick(); openSetup(b.id); });
        body.appendChild(btn);
      }
      sec.appendChild(body);
      list.appendChild(sec);
    }
  }

  // ── Setup ────────────────────────────────────────────────────────────────
  function openSetup(botId) { setupBot = Bots.byId(botId); renderSetup(); showScreen('setupScreen'); }
  function updateColorButtons() {
    const pal = currentPalette();
    const mk = (id, type) => {
      const b = $(id); if (!b) return;
      b.innerHTML = '';
      if (type === 'r') { const d = document.createElement('div'); d.style.cssText = 'font-size:40px;line-height:54px;height:54px'; d.textContent = '🎲'; b.appendChild(d); }
      else {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        ChessCore.renderGrid(svg, prefs.pieceSet, [[{ bg: type === 'w' ? pal.light : pal.dark, p: (type === 'w' ? 'wK' : 'bK') }]]);
        b.appendChild(svg);
      }
      const l = document.createElement('span'); l.textContent = tt(type === 'w' ? 'white' : type === 'b' ? 'black' : 'random'); b.appendChild(l);
      b.classList.toggle('active', setupColor === type);
    };
    mk('colW', 'w'); mk('colR', 'r'); mk('colB', 'b');
  }
  // The text under the picture: a greeting in the bot's own language + a short description (translated into the app language).
  // The five legends get a factual biography instead (no invented quotes).
  const countryName = cc => { try { return new Intl.DisplayNames([window._cvbLang === 'pt' ? 'pt-BR' : (window._cvbLang || 'en')], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } };
  function botBioHtml(b) {
    if (b.legend) {
      return '<div class="bioLine">' + esc(b.years) + ' · ' + Bots.flag(b, 12) + ' ' + esc(countryName(b.cc)) + ' · <b>' + esc(tt('legendLabel')) + '</b></div>' +
        '<p>' + esc(tt('bioLegend_' + b.id)) + '</p>';
    }
    const txt = tt('bio_' + b.style + '_' + (b.index % 2 + 1), { name: b.name, country: countryName(b.cc) });
    return '<p><b>' + esc(b.hi || '') + '</b> ' + esc(txt) + '</p>';
  }
  function renderSetup() {
    const b = setupBot; if (!b) return;
    $('setupAvatar').innerHTML = Bots.avatar(b);
    $('setupName').innerHTML = b.name + ' ' + Bots.flag(b, 17);
    $('setupMeta').textContent = b.elo + ' · ' + styleName(b);
    $('setupAvatar').classList.toggle('legend', !!b.legend);
    $('setupBio').innerHTML = botBioHtml(b);
    const r = botRec(b.id);
    $('setupRecord').textContent = (r.w + r.d + r.l) ? tt('yourRecord') + ': ' + recLine(r) : tt('notPlayed');
    updateColorButtons();
    const e = expectedScore(stats.rating, b.elo);
    const win = ratingDelta(stats.rating, b.elo, 1, stats.games, false), draw = ratingDelta(stats.rating, b.elo, 0.5, stats.games, false), loss = ratingDelta(stats.rating, b.elo, 0, stats.games, false);
    $('setupOdds').innerHTML = tt('oddsText', { n: '<b>' + Math.round(e * 100) + '%</b>' }) + '<br>' + tt('win') + ' ' + fmtDelta(win) + ' · ' + tt('draw') + ' ' + fmtDelta(draw) + ' · ' + tt('loss') + ' ' + fmtDelta(loss);
  }

  // ── Play ─────────────────────────────────────────────────────────────────
  const SAN_PIECE_VAL = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  const uciParts = u => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

  function newGameObject(bot, color, moves) {
    const chess = new Chess();
    for (const u of moves || []) chess.move(uciParts(u));
    return { bot, color, chess, hints: 0, undos: 0, thinking: false, over: false, token: 0, drawBlockedUntil: 0, view: null, flipped: false, startedAt: Date.now(), busy: false, engineWarned: false };
  }

  function ensureBoard() {
    if (board) return;
    board = ChessCore.create($('boardSvg'));
    board.onMove = onUserMove;
  }

  // Start a brand-new game
  async function startNewGame(botId, colorChoice) {
    const bot = Bots.byId(botId);
    let color = colorChoice === 'w' || colorChoice === 'b' ? colorChoice : (Math.random() < 0.5 ? 'w' : 'b');
    $('gameOverlay').style.display = 'none';
    cancelThinking();
    saved = null; storageDel(pkey('save'));
    G = newGameObject(bot, color, []);
    enterGame();
    saveGame();
  }
  function resumeGame() {
    if (!saved) return;
    const bot = Bots.byId(saved.botId);
    cancelThinking();
    G = newGameObject(bot, saved.color, saved.moves);
    G.hints = saved.hints || 0; G.undos = saved.undos || 0; G.flipped = !!saved.flipped; G.startedAt = saved.t || Date.now();
    enterGame();
  }
  function enterGame() {
    ensureBoard();
    $('gameOverlay').style.display = 'none';
    board.setChess(G.chess);
    board.setOrientation((G.color === 'w') !== G.flipped ? 'white' : 'black');
    board.setShowLegal(prefs.showLegal);
    board.setMover(G.color);
    board.setLocked(false);
    const h = G.chess.history({ verbose: true });
    if (h.length) { const m = h[h.length - 1]; board.setLast(m.from, m.to); board.render(); }
    renderPlayStatic();
    updatePlayUI();
    showScreen('playScreen');
    Engine.start();        // warm up (no-op once running)
    if (!G.over && G.chess.turn() !== G.color) botTurn();
  }

  function renderPlayStatic() {
    if (!G) return;
    $('playTitle').textContent = tt('vsBot', { bot: G.bot.name });
    $('playSub').textContent = G.bot.elo + ' · ' + styleName(G.bot);
    $('oppAvatar').innerHTML = Bots.avatar(G.bot);
    $('oppName').innerHTML = G.bot.name + ' ' + Bots.flag(G.bot, 13) + '<small>' + G.bot.elo + '</small>';
    $('youAvatar').innerHTML = profAvatarHtml();
    $('youName').innerHTML = esc(profName()) + ' ' + profFlagHtml(13) + '<small>' + stats.rating + '</small>';
    updatePlayUI();
  }

  function setNote(msg, cls) { const n = $('playNote'); n.textContent = msg || ''; n.className = 'note' + (cls ? ' ' + cls : ''); }

  function updatePlayUI() {
    if (!G) return;
    const ch = G.chess, hist = ch.history();
    const userTurn = !G.over && ch.turn() === G.color && !G.thinking && !G.busy;
    // note
    if (!G.over && !G.hintShown && !G.busy) {
      if (G.thinking) setNote(tt('botThinking', { bot: G.bot.name }));
      else if (ch.isCheck()) setNote(tt('check'), 'warn');
      else setNote(tt('yourMove'));
    }
    $('oppThink').classList.toggle('on', !!G.thinking);
    // controls
    const userMoves = hist.length - (G.color === 'w' ? Math.floor(hist.length / 2) : Math.ceil(hist.length / 2));
    $('undoBtn').disabled = G.over || userMoves < 1 || !!G.busy;
    $('hintBtn').disabled = !userTurn;
    $('drawBtn').disabled = !userTurn || hist.length < G.drawBlockedUntil;
    $('resignBtn').disabled = G.over;
    $('flipBtn').disabled = false;
    // captured pieces + material
    renderCaptured();
    // move strip
    const strip = $('moveStrip');
    let html = '';
    for (let i = 0; i < hist.length; i++) {
      if (i % 2 === 0) html += '<span class="n">' + (i / 2 + 1) + '.</span>';
      html += '<span' + (i === hist.length - 1 ? ' class="cur"' : '') + '>' + hist[i] + '</span>';
    }
    strip.innerHTML = html;
    strip.scrollLeft = strip.scrollWidth;
    renderMoveTable(hist);
    if (G.view != null && !G.over) setNote(tt('viewingPast'), 'warn');
  }

  // ── Move table and browsing earlier positions during a game ───────────────
  // The table lists every move (white | black). The buttons (and a tap on a move) show that position on the board, read-only;
  // as soon as a move is played, a hint is asked, or ">|" is pressed, the board returns to the live position.
  function renderMoveTable(hist) {
    const t = $('moveTable');
    if (!t) return;
    hist = hist || G.chess.history();
    const cur = G.view != null ? G.view : hist.length;
    let html = '';
    for (let i = 0; i < hist.length; i += 2) {
      const z = (i / 2) % 2 ? ' z' : '';
      html += '<span class="mn' + z + '">' + (i / 2 + 1) + '.</span>';
      html += '<button class="' + (cur === i + 1 ? 'cur ' : '') + z.trim() + '" data-k="' + (i + 1) + '">' + hist[i] + '</button>';
      html += hist[i + 1] != null ? '<button class="' + (cur === i + 2 ? 'cur ' : '') + z.trim() + '" data-k="' + (i + 2) + '">' + hist[i + 1] + '</button>' : '<span class="' + z.trim() + '" aria-hidden="true"></span>';
    }
    t.innerHTML = html;
    const c = t.querySelector('button.cur');
    if (c) t.scrollTop = Math.max(0, c.offsetTop - t.clientHeight / 2 + c.offsetHeight / 2);
    else if (cur === 0) t.scrollTop = 0;
    const n = hist.length;
    $('mvFirst').disabled = cur <= 0; $('mvPrev').disabled = cur <= 0;
    $('mvNext').disabled = cur >= n; $('mvLast').disabled = cur >= n;
  }
  function viewTo(k) {
    if (!G || !board) return;
    const h = G.chess.history({ verbose: true });
    k = Math.max(0, Math.min(h.length, k));
    if (k >= h.length) { exitView(); return; }
    const c = new Chess();
    for (let i = 0; i < k; i++) c.move({ from: h[i].from, to: h[i].to, promotion: h[i].promotion });
    G.view = k;
    clearHintMark();
    board.setChess(c);
    board.setMover(null);
    if (k > 0) board.setLast(h[k - 1].from, h[k - 1].to);
    board.render();
    updatePlayUI();
  }
  function exitView() {
    if (!G || G.view == null) return;
    G.view = null;
    board.setChess(G.chess);
    board.setMover(G.over ? null : G.color);
    const h = G.chess.history({ verbose: true });
    if (h.length) { const m = h[h.length - 1]; board.setLast(m.from, m.to); }
    board.render();
    updatePlayUI();
  }
  function curViewPly() { return G ? (G.view != null ? G.view : G.chess.history().length) : 0; }

  function renderCaptured() {
    const b = G.chess.board();
    const cnt = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
    let mat = 0;
    for (const row of b) for (const p of row) if (p && p.type !== 'k') { cnt[p.color][p.type]++; mat += (p.color === 'w' ? 1 : -1) * SAN_PIECE_VAL[p.type]; }
    const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const fill = (el, capturerColor) => {
      const victim = capturerColor === 'w' ? 'b' : 'w';
      el.innerHTML = '';
      for (const t of ['q', 'r', 'b', 'n', 'p']) {
        const missing = Math.max(0, start[t] - cnt[victim][t]);
        for (let i = 0; i < missing; i++) el.appendChild(pieceIcon(victim, t, 17));
      }
      const adv = capturerColor === 'w' ? mat : -mat;
      if (adv > 0) { const s = document.createElement('b'); s.textContent = '+' + adv; el.appendChild(s); }
    };
    fill($('youCap'), G.color);
    fill($('oppCap'), G.color === 'w' ? 'b' : 'w');
  }

  function saveGame() {
    if (!G || G.over) return;
    const moves = G.chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    saved = { botId: G.bot.id, color: G.color, moves, hints: G.hints, undos: G.undos, t: G.startedAt, flipped: G.flipped };
    storageSet(pkey('save'), saved);
  }

  // ── Moves ────────────────────────────────────────────────────────────────
  function clearHintMark() { if (G) { G.hintShown = false; } if (board) { board.setArrows([]); } }

  function onUserMove(from, to, needsPromo) {
    if (!G || G.over || G.thinking || G.busy || G.view != null || G.chess.turn() !== G.color) return;
    if (needsPromo) {
      if (prefs.autoQueen) return applyMove(from, to, 'q', 'user');
      askPromotion(G.color, p => applyMove(from, to, p, 'user'));
      return;
    }
    applyMove(from, to, undefined, 'user');
  }

  function askPromotion(color, done) {
    const box = $('promoChoices');
    box.innerHTML = '';
    for (const t of ['q', 'r', 'b', 'n']) {
      const btn = document.createElement('button');
      btn.className = 'promoBtn';
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ChessCore.renderGrid(svg, prefs.pieceSet, [[{ bg: currentPalette().light, p: color + t.toUpperCase() }]]);
      btn.appendChild(svg);
      btn.addEventListener('click', () => { $('promoOverlay').classList.remove('show'); done(t); });
      box.appendChild(btn);
    }
    $('promoOverlay').classList.add('show');
  }

  function applyMove(from, to, promotion, who) {
    exitView();
    clearHintMark();
    const piece = G.chess.get(from);
    let mv;
    try { mv = G.chess.move({ from, to, promotion }); } catch (e) { mv = null; }
    if (!mv) return false;
    board.setLast(from, to);
    board.slide(from, to, piece);
    if (G.chess.isCheck()) { soundCheck(); doVibrate(60); }
    else if (mv.captured) { soundCapture(); doVibrate(30); }
    else soundMove();
    G.hintShown = false;
    if (G.chess.isGameOver()) { finishFromPosition(); return true; }
    saveGame();
    updatePlayUI();
    if (who === 'user') botTurn();
    return true;
  }

  function cancelThinking() {
    if (G) { G.token++; if (G.thinking) { G.thinking = false; try { Engine.stop(); } catch (e) {} } }
  }

  async function botTurn() {
    if (!G || G.over) return;
    const me = G, tok = ++G.token;
    G.thinking = true;
    board.setLocked(true);
    updatePlayUI();
    const t0 = Date.now();
    let uci = null;
    try { uci = await Bots.chooseMove(G.bot, G.chess); }
    catch (e) {
      uci = null;
      if (!me.engineWarned) { me.engineWarned = true; showToast(tt('engineFailed'), 3500); }
    }
    if (!uci) {   // engine unavailable: still keep the game going with a random legal move
      const legal = me.chess.moves({ verbose: true });
      if (legal.length) { const m = legal[Math.floor(Math.random() * legal.length)]; uci = m.from + m.to + (m.promotion || ''); }
    }
    if (G !== me) return;                        // the player was switched or the game left meanwhile
    const wait = Bots.minThinkMs(me.bot) - (Date.now() - t0);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    if (G !== me || G.token !== tok || G.over) return;      // cancelled (undo / left the game)
    G.thinking = false;
    board.setLocked(false);
    if (uci) { const p = uciParts(uci); applyMove(p.from, p.to, p.promotion, 'bot'); }
  }

  // ── Controls ─────────────────────────────────────────────────────────────
  async function onHint() {
    exitView();
    if (!G || G.over || G.thinking || G.busy || G.chess.turn() !== G.color) return;
    const me = G;
    G.hints++;
    G.busy = 'hint'; board.setLocked(true); updatePlayUI();
    setNote(tt('hintThinking'));
    let r = null;
    try { r = await Engine.search(G.chess.fen(), { movetime: 700, depth: 16 }); } catch (e) { r = null; }
    if (G !== me || G.over) return;
    G.busy = false; board.setLocked(false);
    if (r && r.best) {
      const p = uciParts(r.best);
      board.setArrows([{ from: p.from, to: p.to, color: '#3fbf8f' }]);
      let san = r.best;
      try { san = new Chess(G.chess.fen()).move(p).san; } catch (e) {}
      G.hintShown = true;
      updatePlayUI();
      setNote(tt('hintBest', { san }), 'ok');
      saveGame();
    } else { G.hintShown = false; showToast(tt('engineFailed'), 3000); updatePlayUI(); }
  }

  function onUndo() {
    if (!G || G.over) return;
    exitView();
    const hist = G.chess.history();
    let n;
    if (G.thinking) { n = 1; cancelThinking(); }            // the bot has not answered yet: take back only my move
    else if (G.chess.turn() === G.color) n = 2;
    else n = 1;
    if (n > hist.length) n = hist.length;
    // never take back past the first move of the player (e.g. Black after the bot's opening move)
    const userMoves = hist.length - (G.color === 'w' ? Math.floor(hist.length / 2) : Math.ceil(hist.length / 2));
    if (userMoves < 1) return;
    G.token++; G.thinking = false;
    for (let i = 0; i < n; i++) G.chess.undo();
    G.undos++;
    G.hintShown = false;
    board.setChess(G.chess);
    board.setOrientation((G.color === 'w') !== G.flipped ? 'white' : 'black');
    board.setShowLegal(prefs.showLegal);
    board.setMover(G.color); board.setLocked(false);
    const h = G.chess.history({ verbose: true });
    if (h.length) { const m = h[h.length - 1]; board.setLast(m.from, m.to); }
    board.render();
    saveGame();
    updatePlayUI();
    soundClick();
    if (G.chess.turn() !== G.color) botTurn();           // e.g. undo left the bot to move (Black after its opening move)
  }

  async function onDraw() {
    exitView();
    if (!G || G.over || G.thinking || G.busy || G.chess.turn() !== G.color) return;
    confirmDialog(tt('drawTitle'), tt('drawText', { bot: G.bot.name }), tt('drawOffer'), async () => {
      const me = G;
      if (G.over || G.thinking || G.busy) return;
      G.busy = 'draw'; board.setLocked(true); updatePlayUI();
      setNote(tt('drawWait', { bot: G.bot.name }));
      let ok = false;
      try { ok = await Bots.acceptsDraw(G.bot, G.chess, G.color === 'w' ? 'b' : 'w'); } catch (e) { ok = false; }
      await new Promise(r => setTimeout(r, 700));
      if (G !== me || G.over) return;
      G.busy = false; board.setLocked(false);
      if (ok) { endGame('draw', 'agreement'); }
      else { G.drawBlockedUntil = G.chess.history().length + 10; updatePlayUI(); setNote(tt('drawDeclined', { bot: G.bot.name })); }
    });
  }

  function onResign() {
    if (!G || G.over) return;
    confirmDialog(tt('resignTitle'), tt('resignText'), tt('resignYes'), () => { cancelThinking(); endGame('loss', 'resign'); });
  }

  function onFlip() {
    if (!board) return;
    G.flipped = !G.flipped;
    board.flip();
    saveGame();
  }

  // ── Game end ─────────────────────────────────────────────────────────────
  function finishFromPosition() {
    const ch = G.chess;
    if (ch.isCheckmate()) {
      const loser = ch.turn();           // side to move is mated
      endGame(loser === G.color ? 'loss' : 'win', 'checkmate');
    } else if (ch.isStalemate()) endGame('draw', 'stalemate');
    else if (ch.isInsufficientMaterial()) endGame('draw', 'material');
    else if (ch.isThreefoldRepetition()) endGame('draw', 'repetition');
    else endGame('draw', 'fifty');
  }

  function endGame(outcome, reason) {
    if (!G || G.over) return;
    exitView();
    G.over = true; G.thinking = false; G.busy = false; G.token++;
    board.setLocked(true); board.setMover(null); board.setArrows([]);
    $('oppThink').classList.remove('on');
    const score = outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
    const assisted = G.hints > 0 || G.undos > 0;
    const before = stats.rating;
    const delta = ratingDelta(before, G.bot.elo, score, stats.games, assisted);
    stats.rating = before + delta;
    stats.peak = Math.max(stats.peak || 0, stats.rating);
    stats.games++;
    if (outcome === 'win') stats.w++; else if (outcome === 'draw') stats.d++; else stats.l++;
    const br = stats.bots[G.bot.id] || (stats.bots[G.bot.id] = { w: 0, d: 0, l: 0 });
    // stars for a win: 3 = no hints and no undo, 2 = up to 3 hints, 1 = more than 3 hints and/or undo
    const stars = outcome !== 'win' ? 0 : (G.undos > 0 || G.hints > 3) ? 1 : G.hints > 0 ? 2 : 3;
    if (stars) stats.stars[G.bot.id] = Math.max(starsOf(G.bot.id), stars);
    if (outcome === 'win') { br.w++; stats.best = Math.max(stats.best || 0, G.bot.elo); } else if (outcome === 'draw') br.d++; else br.l++;
    stats.hist.push({ t: Date.now(), r: stats.rating }); if (stats.hist.length > MAX_HIST) stats.hist.shift();
    const moves = G.chess.history({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    const rec = { id: Date.now(), t: Date.now(), bot: G.bot.id, color: G.color, res: outcome === 'win' ? 'w' : outcome === 'draw' ? 'd' : 'l', reason, delta, after: stats.rating, moves, assisted, stars };
    stats.recent.unshift(rec);
    if (stats.recent.length > MAX_RECENT) stats.recent.length = MAX_RECENT;
    saveStats();
    saved = null; storageDel(pkey('save'));
    G.record = rec;
    updatePlayUI();
    setNote(tt('gameOver'));
    // let the final move be seen, then show the result card
    const me = G;
    setTimeout(() => { if (G === me) showGameOver(rec, delta, before, assisted); }, 900);
  }

  function showGameOver(rec, delta, before, assisted) {
    const bot = G.bot;
    $('goIcon').innerHTML = rec.res === 'w' ? '🏆' : rec.res === 'd' ? '🤝' : Bots.avatar(bot);
    $('goTitle').textContent = tt(rec.res === 'w' ? 'goWin' : rec.res === 'd' ? 'goDraw' : 'goLoss');
    const r = rec.reason;
    let reason;
    if (r === 'checkmate') reason = tt(rec.res === 'w' ? 'rMateWin' : 'rMateLoss', { bot: bot.name });
    else if (r === 'resign') reason = tt('rResign');
    else reason = tt('r_' + r);
    $('goReason').textContent = reason;
    const cls = delta > 0 ? 'up' : delta < 0 ? 'down' : '';
    $('goRating').innerHTML = tt('rating') + ': ' + before + ' → <b>' + stats.rating + '</b> <span class="' + cls + '">(' + fmtDelta(delta) + ')</span>' +
      (rec.stars ? '<div class="goStars">' + starsHtml(rec.stars) + '</div><small style="font-weight:500;color:var(--muted)">' + tt('star' + rec.stars + 'Why') + '</small>' : '') +
      (assisted && rec.res !== 'l' ? '<br><small style="font-weight:500;color:var(--muted)">' + tt('assistedNote') + '</small>' : '');
    $('gameOverlay').style.display = 'flex';
    if (rec.res === 'w') { soundWin(); doVibrate(120); } else if (rec.res === 'l') { soundLose(); doVibrate(250); } else { soundDraw(); doVibrate(100); }
  }

  // ── Review (analysis after the game) ─────────────────────────────────────
  // Full Lichess-based Accuracy calculation lives in accuracy.js. It is
  // independent of bot rating; both players use the same Stockfish evaluations.
  // Move quality labels use our own fixed Win%-loss bands, not Chess.com CAPS2.
  const { winPct, scoreGame } = window.ChessAccuracy;
  const ACCURACY_VERSION = window.ChessAccuracy.version;
  const CLS_COLOR = { best: 'var(--q-best)', excellent: 'var(--q-exc)', good: 'var(--q-good)', inacc: 'var(--q-inacc)', mistake: 'var(--q-mistake)', blunder: 'var(--q-blunder)' };
  let rv = null;                 // { rec, an, ply, chess, board, flipped }
  let reviewFrom = 'homeScreen';
  let reviewToken = 0;
  let reviewRunningToken = null;

  function cancelReviewAnalysis() {
    reviewToken++;
    // Engine.search is queued; stopping the currently running review releases
    // the worker sooner for a new game or a newly opened review.
    if (reviewRunningToken !== null) try { Engine.stop(); } catch (_) {}
  }

  // an imported game: names of White and Black
  function impNames(rec) {
    const w = rec.wName != null ? rec.wName : (rec.color === 'w' ? rec.myName : rec.oppName);
    const b = rec.bName != null ? rec.bName : (rec.color === 'w' ? rec.oppName : rec.myName);
    return { w: w || tt('white'), b: b || tt('black') };
  }
  function revPlayerInfo(side) {
    const rec = rv.rec;
    if (rec.imported) { const elo = side === 'w' ? rec.wElo : rec.bElo; return { name: impNames(rec)[side], elo: elo > 0 ? elo : null, av: blankAvatar(), flag: '' }; }
    if (side === rec.color) {
      const before = (typeof rec.after === 'number' && typeof rec.delta === 'number') ? rec.after - rec.delta : null;     // your rating before the game
      return { name: profName(), elo: before, av: profAvatarHtml(), flag: profFlagHtml(13) };
    }
    return { name: rv.bot.name, elo: rv.bot.elo, av: Bots.avatar(rv.bot), flag: Bots.flag(rv.bot, 13) };
  }
  // names and ratings above and below the board (the side at the bottom is the one the board is turned to)
  function renderPlayerBars() {
    if (!rv) return;
    const bottom = ((rv.rec.color === 'w') !== !!rv.flipped) ? 'w' : 'b';
    const mk = (id, side) => {
      const p = revPlayerInfo(side);
      $(id).innerHTML = '<div class="pAvatar">' + p.av + '</div><div class="pInfo"><div class="pName"><i class="colDot ' + side + '" aria-hidden="true"></i>' + esc(p.name) + (p.elo != null ? '<small>(' + p.elo + ')</small>' : '') + ' ' + p.flag + '</div></div>';
    };
    mk('revTop', bottom === 'w' ? 'b' : 'w'); mk('revBottom', bottom);
  }

  async function openReview(rec, from) {
    reviewFrom = from || 'homeScreen';
    $('gameOverlay').style.display = 'none';
    const bot = rec.imported ? { name: impNames(rec)[rec.color === 'w' ? 'b' : 'w'], imported: true } : Bots.byId(rec.bot);
    // Previously saved reviews used a rating-dependent, approximate formula.
    // Reanalyse them once instead of displaying outdated cached Accuracy values.
    if (rec.an && rec.an.version !== ACCURACY_VERSION) delete rec.an;
    rv = { rec, bot, an: rec.an || null, ply: 0, chess: new Chess(), board: null, flipped: false };
    if (!rv.board) { rv.board = ChessCore.create($('revBoardSvg')); }
    rv.board.setLocked(true);
    showScreen('reviewScreen');
    if (rv.an) { startReviewView(); return; }
    $('reviewProgress').style.display = ''; $('reviewBody').style.display = 'none';
    const tok = ++reviewToken;
    $('revProgText').textContent = tt('analysing'); $('revProgBar').style.width = '0';
    let an = null;
    reviewRunningToken = tok;
    try { an = await analyseGame(rec, tok, (i, n) => { $('revProgText').textContent = tt('analysingN', { i, n }); $('revProgBar').style.width = Math.round(i / n * 100) + '%'; }); }
    catch (e) { console.warn('Game review failed:', e); an = null; }
    finally { if (reviewRunningToken === tok) reviewRunningToken = null; }
    if (tok !== reviewToken) return;           // left the screen meanwhile
    if (!an) { $('revProgText').textContent = tt('engineFailed'); return; }
    rec.an = an;
    if (stats.recent.some(r => r.id === rec.id) || stats.imports.some(r => r.id === rec.id)) saveStats();
    rv.an = an;
    startReviewView();
  }

  function startReviewView() {
    $('reviewProgress').style.display = 'none'; $('reviewBody').style.display = '';
    rv.flipped = false;
    rv.board.setShowLegal(false);
    rv.board.setMover(null);
    jumpTo(rv.an.key && rv.an.key.length ? Math.min(rv.rec.moves.length, rv.an.key[0].ply + 1) : rv.rec.moves.length);
    renderReview();
  }

  async function analyseGame(rec, tok, onProgress) {
    const ch = new Chess();
    const fens = [ch.fen()];
    const mvs = [];
    for (const u of rec.moves) { const m = ch.move(uciParts(u)); if (!m) throw new Error('bad move'); mvs.push(m); fens.push(ch.fen()); }
    const n = rec.moves.length;
    const pov = [];       // Stockfish centipawns from White's point of view
    const best = [], second = [];
    for (let i = 0; i <= n; i++) {
      if (tok !== reviewToken) return null;
      onProgress(i, n + 1);
      const c = new Chess(fens[i]);
      const stm = c.turn();
      let s = 0;
      if (c.isCheckmate()) s = -10000;
      else if (c.isDraw() || c.isStalemate() || c.isInsufficientMaterial()) s = 0;
      else {
        // More stable than the old 250 ms / depth 16 analysis while still
        // bounded for offline iPhones. Two principal variations are needed to
        // find the most instructive best move.
        const r = await Engine.search(fens[i], { movetime: 350, depth: 18, multipv: 2, newGame: i === 0 });
        if (tok !== reviewToken) return null;
        const sc = l => l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : (l.cp || 0);
        if (!r.lines[0]) throw new Error('Stockfish returned no evaluation');
        s = sc(r.lines[0]);
        best[i] = r.best || (r.lines[0].pv[0]) || null;
        if (r.lines[1]) second[i] = sc(r.lines[1]);
        else second[i] = null;
      }
      pov[i] = stm === 'w' ? s : -s;
    }
    onProgress(n + 1, n + 1);
    // classify and score every move
    const userSide = rec.color, botSide = userSide === 'w' ? 'b' : 'w';
    // a move that gives checkmate is always the best move, whatever the engine listed first
    mvs.forEach((m, i) => { if (m.san.indexOf('#') > 0) best[i] = rec.moves[i]; });
    const sg = scoreGame(pov, rec.moves, best);
    const cls = [], drop = [], gap = [];
    const counts = { best: 0, excellent: 0, good: 0, inacc: 0, mistake: 0, blunder: 0 }, countsOpp = Object.assign({}, counts);
    for (let i = 0; i < n; i++) {
      const mover = mvs[i].color, r = sg.moves[i];
      const before = mover === 'w' ? pov[i] : -pov[i];
      drop[i] = Math.round(r.loss * 10) / 10;                         // Lichess Win% lost, percentage points
      cls[i] = r.cls;
      // gap between the best and the second best move (how "only" the best move was), from the mover's point of view
      gap[i] = (second[i] != null && best[i]) ? Math.round(Math.max(0, winPct(before) - winPct(second[i])) * 10) / 10 : 0;
      (mover === userSide ? counts : countsOpp)[r.cls]++;
    }
    // No turns by a player means no Accuracy sample (not a 0%-accuracy game).
    const turns = { w: 0, b: 0 };
    mvs.forEach(m => turns[m.color]++);
    const acc = { you: turns[userSide] ? Math.round(sg[userSide]) : null, bot: turns[botSide] ? Math.round(sg[botSide]) : null };
    // key moments of one side: its biggest mistakes and its best move
    const keyOf = side => {
      const mine = [];
      for (let i = 0; i < n; i++) if (mvs[i].color === side) mine.push(i);
      const key = [];
      mine.filter(i => cls[i] === 'blunder' || cls[i] === 'mistake').sort((a, b) => drop[b] - drop[a]).slice(0, 3).forEach(i => key.push({ type: 'mistake', ply: i }));
      if (!key.length) mine.filter(i => cls[i] === 'inacc').sort((a, b) => drop[b] - drop[a]).slice(0, 2).forEach(i => key.push({ type: 'mistake', ply: i }));
      // best move: the player's move that was best and clearly better than the alternatives
      let bi = -1, bg = -1;
      for (const i of mine) {
        const isMate = mvs[i].san.indexOf('#') > 0;
        if (cls[i] !== 'best' && !isMate) continue;
        const g = isMate ? 100 : gap[i];
        if (g > bg) { bg = g; bi = i; }
      }
      if (bi >= 0) key.push({ type: 'best', ply: bi });
      return key;
    };
    const key = keyOf(userSide), keyOpp = keyOf(botSide);
    return { version: ACCURACY_VERSION, pov: pov.map(v => Math.max(-1500, Math.min(1500, v))), best, cls, drop, gap, acc, counts, countsOpp, key, keyOpp };
  }

  function jumpTo(k) {
    const rec = rv.rec;
    k = Math.max(0, Math.min(rec.moves.length, k));
    rv.ply = k;
    const c = new Chess();
    for (let i = 0; i < k; i++) c.move(uciParts(rec.moves[i]));
    rv.chess = c;
    const b = rv.board;
    b.setChess(c);
    b.setOrientation((rec.color === 'w') !== rv.flipped ? 'white' : 'black');
    if (k > 0) { const u = uciParts(rec.moves[k - 1]); b.setLast(u.from, u.to); }
    const arrows = [];
    const an = rv.an;
    if (an && k > 0) {
      const i = k - 1, mover = (i % 2 === 0) ? 'w' : 'b';
      if (mover === rec.color && (an.cls[i] === 'inacc' || an.cls[i] === 'mistake' || an.cls[i] === 'blunder') && an.best[i]) {
        const p = uciParts(an.best[i]); arrows.push({ from: p.from, to: p.to, color: '#3fbf8f' });
        const q = uciParts(rec.moves[i]); arrows.push({ from: q.from, to: q.to, color: '#ef5b5b', opacity: 0.7 });
      }
    }
    b.setArrows(arrows);
    renderReviewLabel();
    highlightReviewMove();
  }

  const fmtEval = cp => { if (Math.abs(cp) >= 1500) return cp > 0 ? '+#' : '−#'; const v = Math.abs(cp) / 100; return (cp > 0 ? '+' : cp < 0 ? '−' : '') + v.toFixed(1); };
  function sanAt(i) { const c = new Chess(); const h = rv.rec.moves; for (let j = 0; j < i; j++) c.move(uciParts(h[j])); return c.move(uciParts(h[i])).san; }
  function bestSanAt(i) { try { const c = new Chess(); for (let j = 0; j < i; j++) c.move(uciParts(rv.rec.moves[j])); return c.move(uciParts(rv.an.best[i])).san; } catch (e) { return ''; } }

  function renderReviewLabel() {
    const el = $('revMoveLabel');
    if (!el || !rv || !rv.an) return;
    const k = rv.ply, an = rv.an;
    if (k === 0) { el.innerHTML = tt('startPos'); return; }
    const i = k - 1;
    const num = Math.floor(i / 2) + 1, dots = i % 2 === 0 ? '.' : '…';
    const cname = { best: 'cBest', excellent: 'cExcellent', good: 'cGood', inacc: 'cInacc', mistake: 'cMistake', blunder: 'cBlunder' }[an.cls[i]];
    const who = ((i % 2 === 0) ? 'w' : 'b') === rv.rec.color ? (rv.rec.imported ? impNames(rv.rec)[rv.rec.color] : tt('you')) : rv.bot.name;
    let html = '<b>' + num + dots + ' ' + sanAt(i) + '</b> · ' + who + '<span class="tag" style="background:' + CLS_COLOR[an.cls[i]] + '">' + tt(cname) + '</span>';
    if ((an.cls[i] === 'inacc' || an.cls[i] === 'mistake' || an.cls[i] === 'blunder') && an.best[i]) html += '<br>' + tt('betterWas', { san: bestSanAt(i) });
    html += '<br><small style="color:var(--muted)">' + tt('evalLbl') + ' ' + fmtEval(an.pov[k]) + '</small>';
    el.innerHTML = html;
  }

  function highlightReviewMove() {
    document.querySelectorAll('#revMoves button').forEach(b => b.classList.toggle('cur', +b.dataset.k === rv.ply));
    const ml = $('revMoves'), cur = ml.querySelector('button.cur');
    // scroll only the list itself (not the page) so the current move stays in view
    if (cur && ml.scrollHeight > ml.clientHeight + 2) ml.scrollTop = Math.max(0, cur.offsetTop - ml.clientHeight / 2 + cur.offsetHeight / 2);
    drawEvalGraph();
    updateEvalBar();
  }

  function renderReview() {
    if (!rv || !rv.an) return;
    const an = rv.an, rec = rv.rec, bot = rv.bot;
    const youSide = rec.color === 'w' ? tt('white') : tt('black');
    const resTxt = rec.res === 'u' ? '' : ' · ' + tt(rec.res === 'w' ? 'goWin' : rec.res === 'd' ? 'goDraw' : 'goLoss');
    if (rec.imported) { const nm = impNames(rec); $('revHead').innerHTML = '<span>' + esc(nm.w) + ' — ' + esc(nm.b) + (rec.score && rec.score !== '*' ? ' · ' + esc(rec.score) : '') + '</span>'; }
    else $('revHead').innerHTML = Bots.avatar(bot) + '<span>' + tt('revVs', { bot: bot.name, elo: bot.elo }) + ' · ' + youSide + resTxt + '</span>';
    $('revRematch').style.display = rec.imported ? 'none' : '';
    $('revOther').style.display = rec.imported ? 'none' : '';
    renderPlayerBars();
    $('revTiles').innerHTML =
      '<div class="tile"><b>' + (an.acc.you == null ? '—' : an.acc.you + '%') + '</b><span>' + (rec.imported ? tt('accBot', { bot: esc(impNames(rec)[rec.color]) }) : tt('accYou')) + '</span></div>' +
      '<div class="tile"><b>' + (an.acc.bot == null ? '—' : an.acc.bot + '%') + '</b><span>' + tt('accBot', { bot: esc(bot.name) }) + '</span></div>';
    // key moments and move counts of both players
    const key = $('revKey'); key.innerHTML = '';
    const cell = (n, k, nm) => '<div><b style="color:' + CLS_COLOR[k] + '">' + n + '</b><span>' + tt(nm) + '</span></div>';
    const countsCard = (title, c) => {
      const el = document.createElement('div'); el.className = 'keyCard';
      c = c || { best: 0, excellent: 0, good: 0, inacc: 0, mistake: 0, blunder: 0 };
      el.innerHTML = '<div class="kIco">📊</div><div class="kTxt"><b>' + title + '</b><div class="cntRow">' +
        cell(c.best, 'best', 'cBest') + cell(c.excellent || 0, 'excellent', 'cExcellent') + cell(c.good, 'good', 'cGood') + cell(c.inacc, 'inacc', 'cInacc') + cell(c.mistake, 'mistake', 'cMistake') + cell(c.blunder, 'blunder', 'cBlunder') + '</div></div>';
      return el;
    };
    const keyCards = (keys, prefix) => {
      const mistakes = keys.filter(k => k.type === 'mistake'), bestK = keys.find(k => k.type === 'best');
      if (bestK) {
        const b = document.createElement('button'); b.className = 'keyCard';
        b.innerHTML = '<div class="kIco">⭐</div><div class="kTxt"><b>' + prefix + tt(prefix ? 'bestMoveNeutral' : 'bestMoveTitle') + '</b><span>' + (Math.floor(bestK.ply / 2) + 1) + (bestK.ply % 2 === 0 ? '. ' : '… ') + sanAt(bestK.ply) + '</span></div><span class="chev">›</span>';
        b.addEventListener('click', () => { jumpTo(bestK.ply + 1); scrollToBoard(); });
        key.appendChild(b);
      }
      if (mistakes.length) {
        mistakes.forEach(m => {
          const b = document.createElement('button'); b.className = 'keyCard';
          const k = an.cls[m.ply], cname = { inacc: 'cInacc', mistake: 'cMistake', blunder: 'cBlunder' }[k];
          b.innerHTML = '<div class="kIco" style="color:' + CLS_COLOR[k] + '">⚠</div><div class="kTxt"><b>' + prefix + tt(cname) + ' · ' + (Math.floor(m.ply / 2) + 1) + (m.ply % 2 === 0 ? '. ' : '… ') + sanAt(m.ply) + '</b><span>' + tt('betterWas', { san: bestSanAt(m.ply) }) + '</span></div><span class="chev">›</span>';
          b.addEventListener('click', () => { jumpTo(m.ply + 1); scrollToBoard(); });
          key.appendChild(b);
        });
      } else {
        const ok = document.createElement('div'); ok.className = 'keyCard';
        ok.innerHTML = '<div class="kIco">👏</div><div class="kTxt"><b>' + prefix + tt('noMistakes') + '</b></div>';
        key.appendChild(ok);
      }
    };
    if (rec.imported) {
      // a game from a file: White first, then Black, each with the player's name
      const nm = impNames(rec);
      for (const side of ['w', 'b']) {
        const mine = side === rec.color;
        key.appendChild(countsCard(tt('movesOf', { name: esc(nm[side]) }), mine ? an.counts : an.countsOpp));
      }
      for (const side of ['w', 'b']) keyCards(side === rec.color ? an.key : (an.keyOpp || []), esc(nm[side]) + ' · ');
    } else {
      key.appendChild(countsCard(tt('yourMoves'), an.counts));
      key.appendChild(countsCard(tt('oppMoves'), an.countsOpp));
      keyCards(an.key, '');
    }
    // move list
    const ml = $('revMoves'); ml.innerHTML = '';
    for (let i = 0; i < rec.moves.length; i++) {
      const zc = (Math.floor(i / 2) % 2) ? ' z' : '';
      if (i % 2 === 0) { const s = document.createElement('span'); s.className = 'mn' + zc; s.textContent = (i / 2 + 1) + '.'; ml.appendChild(s); }
      const b = document.createElement('button'); b.dataset.k = i + 1; b.className = zc.trim();
      b.innerHTML = '<i style="background:' + CLS_COLOR[an.cls[i]] + ';opacity:' + ((rec.imported || ((i % 2 === 0) ? 'w' : 'b') === rec.color) ? 1 : 0.35) + '"></i>' + sanAt(i);
      b.addEventListener('click', () => jumpTo(i + 1));
      ml.appendChild(b);
      if (i % 2 === 0 && i === rec.moves.length - 1) { const e = document.createElement('span'); e.className = zc.trim(); e.setAttribute('aria-hidden', 'true'); ml.appendChild(e); }
    }
    jumpTo(rv.ply);
  }
  function scrollToBoard() { try { $('revBoardOuter').scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }

  function drawEvalGraph() {
    const svg = $('evalGraph');
    if (!svg || !rv || !rv.an) return;
    const an = rv.an, n = an.pov.length - 1, W = 300, H = 80;
    const X = i => n ? i / n * W : 0, Y = cp => H * (1 - winPct(cp) / 100);
    let line = '', area = '';
    for (let i = 0; i <= n; i++) line += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(an.pov[i]).toFixed(1);
    area = line + 'L' + W + ' ' + H + 'L0 ' + H + 'Z';
    const dots = [];
    for (let i = 0; i < n; i++) if ((rv.rec.imported || ((i % 2 === 0) ? 'w' : 'b') === rv.rec.color) && (an.cls[i] === 'mistake' || an.cls[i] === 'blunder'))
      dots.push('<circle cx="' + X(i + 1).toFixed(1) + '" cy="' + Y(an.pov[i + 1]).toFixed(1) + '" r="3.2" fill="' + CLS_COLOR[an.cls[i]] + '"/>');
    svg.innerHTML = '<rect x="0" y="0" width="300" height="80" fill="none"/>' +
      '<path d="' + area + '" fill="var(--ink)" opacity=".16"/>' +
      '<line x1="0" y1="' + H / 2 + '" x2="' + W + '" y2="' + H / 2 + '" stroke="var(--muted)" stroke-width=".6" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/>' +
      '<path d="' + line + '" fill="none" stroke="var(--accent2)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' + dots.join('') +
      '<line x1="' + X(rv.ply).toFixed(1) + '" y1="0" x2="' + X(rv.ply).toFixed(1) + '" y2="' + H + '" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>';
  }
  // evaluation bar (like chess.com): white part = White's winning chances after the move shown; the number is the evaluation
  function updateEvalBar() {
    const bar = $('evalBar');
    if (!bar || !rv || !rv.an) return;
    const cp = rv.an.pov[rv.ply];
    const flipped = (rv.rec.color === 'w') === !!rv.flipped;      // Black at the bottom
    $('ebWhite').style.height = winPct(cp).toFixed(1) + '%';
    bar.classList.toggle('flip', flipped);
    const txt = $('ebTxt');
    const whiteEnd = flipped ? 'top' : 'bot', blackEnd = flipped ? 'bot' : 'top';
    const mate = Math.abs(cp) >= 1500;
    txt.textContent = mate ? 'M' : (Math.abs(cp) / 100).toFixed(1);
    const whiteBetter = cp >= 0;
    txt.className = 'ebTxt ' + (whiteBetter ? whiteEnd : blackEnd) + (whiteBetter ? ' onW' : ' onB');
    bar.title = fmtEval(cp);
  }
  function graphPointer(e) {
    if (!rv || !rv.an) return;
    const r = $('evalGraph').getBoundingClientRect(), n = rv.an.pov.length - 1;
    jumpTo(Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * n));
  }

  // ── Statistics / profile ─────────────────────────────────────────────────
  function sparkline(vals) {
    if (vals.length < 2) return '';
    const W = 300, H = 56, lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = Math.max(1, hi - lo);
    const pts = vals.map((v, i) => [(i / (vals.length - 1)) * (W - 8) + 4, H - 6 - ((v - lo) / span) * (H - 12)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const last = pts[pts.length - 1];
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="display:block;width:100%;height:56px;margin-top:10px"><path d="' + d + '" fill="none" stroke="var(--accent2)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="' + last[0] + '" cy="' + last[1] + '" r="3.5" fill="var(--accent)"/></svg>';
  }
  let resetArmed = false;
  // ── Statistics: period, opponents, games per bot ─────────────────────────
  const PERIODS = [['7', 7], ['30', 30], ['90', 90], ['365', 365], ['all', 0]];
  const periodName = k => tt(k === 'all' ? 'perAll' : 'per' + k);
  let statsPeriod = 'all', statsBot = null, recLimit = 10;
  const periodCutoff = () => { const p = PERIODS.find(x => x[0] === statsPeriod); return p && p[1] ? Date.now() - p[1] * 86400000 : 0; };
  const locale = () => (window._cvbLang === 'pt' ? 'pt-BR' : (window._cvbLang || 'en'));
  function fmtWhen(t) {
    const d = new Date(t);
    try { return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) + ' · ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return d.toLocaleString(); }
  }
  function loadStatsPeriod() { const v = storageGet('statsPeriod', 'all'); statsPeriod = PERIODS.some(x => x[0] === v) ? v : 'all'; }
  function gameRowEl(r) {
    const b = Bots.byId(r.bot); if (!b) return null;
    const btn = document.createElement('button'); btn.className = 'recRow';
    btn.innerHTML = Bots.avatar(b) + '<div class="rInfo">' + b.name + ' · ' + b.elo + '<small>' + fmtWhen(r.t) + ' · ' + tt(r.color === 'w' ? 'white' : 'black') + ' · ' + Math.ceil(r.moves.length / 2) + '</small></div>' +
      '<span class="rRes ' + r.res + '">' + tt(r.res === 'w' ? 'resW' : r.res === 'd' ? 'resD' : 'resL') + '</span><span class="rDelta">' + fmtDelta(r.delta) + '</span><span class="chev">›</span>';
    btn.addEventListener('click', () => openReview(r, 'statsScreen'));
    return btn;
  }
  function importRowEl(r) {
    const btn = document.createElement('button'); btn.className = 'recRow';
    const nm = impNames(r);
    const score = r.score && r.score !== '*' ? '<span class="rRes">' + esc(r.score) + '</span>' : '';
    btn.innerHTML = blankAvatar() + '<div class="rInfo">' + esc(nm.w) + ' — ' + esc(nm.b) + '<small>' + fmtWhen(r.t) + ' · ' + Math.ceil(r.moves.length / 2) + '</small></div>' + score + '<span class="chev">›</span>';
    btn.addEventListener('click', () => openReview(r, 'statsScreen'));
    return btn;
  }
  function periodDropdownHtml() {
    return '<div class="perWrap"><button class="perBtn" id="perBtn" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="' + esc(tt('periodLbl')) + '">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>' +
      '<span class="perTxt">' + esc(periodName(statsPeriod)) + '</span><svg class="perChev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>' +
      '<div class="perMenu" id="perMenu" role="listbox" style="display:none">' +
      PERIODS.map(p => '<button type="button" role="option" class="perItem' + (p[0] === statsPeriod ? ' sel' : '') + '" data-p="' + p[0] + '" aria-selected="' + (p[0] === statsPeriod) + '"><span>' + esc(periodName(p[0])) + '</span>' + (p[0] === statsPeriod ? '<i class="perCheck" aria-hidden="true">✓</i>' : '') + '</button>').join('') + '</div></div>';
  }
  function renderStats() {
    const body = $('statsBody');
    if (!body) return;
    const s = stats, cut = periodCutoff(), all = statsPeriod === 'all';
    const games = s.recent.filter(r => r.t >= cut && Bots.byId(r.bot));
    // totals: all time = the exact counters, a period = counted from the stored games
    let n, w, d, l, bestElo = 0;
    if (all) { n = s.games; w = s.w; d = s.d; l = s.l; bestElo = s.best || 0; }
    else { n = games.length; w = d = l = 0; for (const r of games) { if (r.res === 'w') { w++; bestElo = Math.max(bestElo, Bots.byId(r.bot).elo); } else if (r.res === 'd') d++; else l++; } }
    const rate = n ? Math.round((w + d * 0.5) / n * 100) : 0;
    // rating over the period
    const histIn = s.hist.filter(h => h.t >= cut);
    const prev = s.hist.filter(h => h.t < cut);
    const startR = all ? START_RATING : (prev.length ? prev[prev.length - 1].r : (histIn.length ? START_RATING : s.rating));
    const series = (all ? [START_RATING] : (startR != null ? [startR] : [])).concat(histIn.map(h => h.r));
    const change = series.length >= 2 ? s.rating - series[0] : 0;
    let html = '<button class="profChip big" id="statsProfile">' + profAvatarHtml() + '<span class="pcName">' + esc(profName()) + ' ' + profFlagHtml(16) + '</span><span class="pcEdit" aria-hidden="true">✎ ' + tt('profileEdit') + '</span></button>' +
      '<button class="bigbtn soft" id="statsAnalyse" style="margin-bottom:12px">' + tt('analyseAGame') + '</button>' +
      periodDropdownHtml();
    if (statsBot) {
      const b = Bots.byId(statsBot);
      const mine = games.filter(r => r.bot === statsBot);
      let bw = 0, bd = 0, bl = 0; for (const r of mine) { if (r.res === 'w') bw++; else if (r.res === 'd') bd++; else bl++; }
      html += '<button class="bigbtn dark" id="statsAllBots" style="margin:12px 0 10px">' + tt('allOpponents') + '</button>' +
        '<div class="stCard"><div class="botHead">' + Bots.avatar(b) + '<div><b>' + tt('gamesVsBot', { bot: esc(b.name) }) + '</b><small>' + b.elo + ' · ' + tt('gamesCount', { n: mine.length }) + ' · ' + bw + ' ' + tt('wins') + ' · ' + bd + ' ' + tt('draws') + ' · ' + bl + ' ' + tt('losses') + '</small></div></div>' +
        (mine.length ? '<div class="stNote hint">' + tt('tapToAnalyse') + '</div><div id="botGames"></div>' : '<div class="stNote hint">' + tt('noGamesPeriod') + '</div>') + '</div>';
      body.innerHTML = html;
      const gl = $('botGames'); if (gl) for (const r of mine) { const el = gameRowEl(r); if (el) gl.appendChild(el); }
    } else {
      html += '<div class="stCard"><h3>' + tt('yourRating') + '</h3><div class="eloBig" style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><b style="font-size:44px;line-height:1;color:var(--accent2)">' + s.rating + '</b><span class="lvlTag">' + tt(levelKey(s.rating)) + '</span>' +
        (change ? '<span class="chg ' + (change > 0 ? 'up' : 'down') + '">' + (change > 0 ? '▲ ' : '▼ ') + Math.abs(change) + '</span>' : '') + '</div>' +
        '<div class="stNote" style="color:var(--muted);font-size:13px;line-height:1.45;margin-top:8px">' + (s.games < 10 ? tt('provisionalNote') : tt('peakNote', { n: s.peak })) + '</div>' +
        sparkline(series) + '</div>';
      html += '<div class="tiles4"><div class="tile"><b>' + n + '</b><span>' + tt('played') + '</span></div><div class="tile w"><b>' + w + '</b><span>' + tt('wins') + '</span></div><div class="tile d"><b>' + d + '</b><span>' + tt('draws') + '</span></div><div class="tile l"><b>' + l + '</b><span>' + tt('losses') + '</span></div></div>';
      if (n) {
        const bb = bestElo ? Bots.list.filter(b => b.elo === bestElo)[0] : null;
        html += '<div class="stCard"><div class="kv"><span>' + tt('scoreRate') + '</span><b>' + rate + '%</b></div>' +
          '<div class="kv"><span>' + tt('bestWin') + '</span><b>' + (bb ? bb.name + ' · ' + bb.elo : '—') + '</b></div></div>';
      } else html += '<div class="stCard"><div class="stNote" style="color:var(--muted);font-size:14px;line-height:1.45">' + tt(all ? 'noGamesYet' : 'noGamesPeriod') + '</div></div>';
      // opponents (most recently played first)
      const byBot = new Map();
      for (const r of games) { let e = byBot.get(r.bot); if (!e) byBot.set(r.bot, e = { id: r.bot, n: 0, w: 0, d: 0, l: 0, t: 0 }); e.n++; e[r.res]++; e.t = Math.max(e.t, r.t); }
      const opp = Array.from(byBot.values()).sort((a, b) => b.t - a.t);
      if (opp.length) html += '<div class="stCard"><h3>' + tt('opponentsTitle') + '</h3><div class="stNote hint">' + tt('opponentsHint') + '</div><div id="oppList"></div></div>';
      if (games.length) html += '<div class="stCard"><h3>' + tt('recentGames') + '</h3><div id="recList"></div><button class="bigbtn dark" id="recMore" style="margin-top:8px;display:none">' + tt('showMore') + '</button></div>';
      if (s.imports.length) html += '<div class="stCard"><h3>' + tt('importedGames') + '</h3><div id="impList"></div></div>';
      html += '<div class="stBtns" style="display:flex;flex-direction:column;gap:10px;margin-top:4px"><button class="bigbtn" id="resetStatsBtn">' + tt(resetArmed ? 'resetConfirm' : 'resetStats') + '</button></div>';
      body.innerHTML = html;
      const ol = $('oppList');
      if (ol) for (const e of opp) {
        const b = Bots.byId(e.id), btn = document.createElement('button'); btn.className = 'recRow';
        btn.innerHTML = Bots.avatar(b) + '<div class="rInfo">' + b.name + ' · ' + b.elo + '<small>' + tt('gamesCount', { n: e.n }) + ' · ' + e.w + ' ' + tt('wins') + ' · ' + e.d + ' ' + tt('draws') + ' · ' + e.l + ' ' + tt('losses') + '</small></div><span class="chev">›</span>';
        btn.addEventListener('click', () => { soundClick(); statsBot = e.id; renderStats(); window.scrollTo(0, 0); });
        ol.appendChild(btn);
      }
      const list = $('recList'), more = $('recMore');
      const fillRecent = () => {
        if (!list) return; list.innerHTML = '';
        for (const r of games.slice(0, recLimit)) { const el = gameRowEl(r); if (el) list.appendChild(el); }
        if (more) more.style.display = games.length > recLimit ? '' : 'none';
      };
      fillRecent();
      if (more) more.addEventListener('click', () => { soundClick(); recLimit += 20; fillRecent(); });
      const il = $('impList'); if (il) for (const r of s.imports) il.appendChild(importRowEl(r));
      const rb = $('resetStatsBtn');
      if (rb) rb.addEventListener('click', () => {
        if (!resetArmed) { resetArmed = true; rb.textContent = tt('resetConfirm'); setTimeout(() => { resetArmed = false; if (rb.isConnected) rb.textContent = tt('resetStats'); }, 4000); return; }
        resetArmed = false; stats = freshStats(); saveStats(); showToast(tt('resetDone')); renderStats(); renderHome();
      });
    }
    const sp = $('statsProfile'); if (sp) sp.addEventListener('click', () => { soundClick(); openProfile('statsScreen'); });
    const sa = $('statsAnalyse'); if (sa) sa.addEventListener('click', () => { soundClick(); openImport('statsScreen'); });
    const ab = $('statsAllBots'); if (ab) ab.addEventListener('click', () => { soundClick(); statsBot = null; renderStats(); window.scrollTo(0, 0); });
    const pb = $('perBtn'), pm = $('perMenu');
    if (pb && pm) {
      pb.addEventListener('click', e => { e.stopPropagation(); const open = pm.style.display === 'none'; pm.style.display = open ? '' : 'none'; pb.setAttribute('aria-expanded', open); pb.classList.toggle('open', open); });
      pm.querySelectorAll('.perItem').forEach(it => it.addEventListener('click', () => { soundClick(); statsPeriod = it.dataset.p; storageSet('statsPeriod', statsPeriod); recLimit = 10; renderStats(); }));
    }
  }
  document.addEventListener('click', () => { const pm = $('perMenu'), pb = $('perBtn'); if (pm && pm.style.display !== 'none') { pm.style.display = 'none'; if (pb) { pb.classList.remove('open'); pb.setAttribute('aria-expanded', 'false'); } } });

  // ── Analyse a game that was played elsewhere (PGN) ───────────────────────
  let importFrom = 'statsScreen';
  function openImport(from) { importFrom = from || 'statsScreen'; $('importErr').textContent = ''; showScreen('importScreen'); }
  const STD_BOARD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  // returns a game record (without analysis) or throws an i18n key
  function parsePgnGame(text) {
    text = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
    if (!text) throw 'importErrPgn';
    const first = text.split(/\n\s*\n(?=\[Event )/)[0];      // only the first game of a file with several games
    const c = new Chess();
    try { c.loadPgn(first); } catch (e) { throw 'importErrPgn'; }
    const h = (c.getHeaders ? c.getHeaders() : c.header()) || {};
    if (h.FEN && String(h.FEN).split(' ')[0] !== STD_BOARD) throw 'importErrFen';
    const hist = c.history({ verbose: true });
    if (!hist.length) throw 'importErrShort';
    const moves = hist.map(m => m.from + m.to + (m.promotion || ''));
    const clean = v => (v && v !== '?' ? String(v).slice(0, 40) : '');
    const wName = clean(h.White), bName = clean(h.Black);
    let rs = h.Result;
    if (rs !== '1-0' && rs !== '0-1' && rs !== '1/2-1/2') rs = c.isCheckmate() ? (c.turn() === 'w' ? '0-1' : '1-0') : (c.isDraw() ? '1/2-1/2' : '*');
    const elo = v => { const n = parseInt(v, 10); return n > 0 && n < 4000 ? n : null; };
    // names of both players come from the file; the game is shown from White's side and both players are analysed
    return { id: Date.now(), t: Date.now(), imported: true, color: 'w', res: 'u', score: rs, moves,
      wName, bName, wElo: elo(h.WhiteElo), bElo: elo(h.BlackElo), myName: wName, oppName: bName };
  }
  function startImport() {
    const err = $('importErr'); err.textContent = '';
    let rec;
    try { rec = parsePgnGame($('importText').value); }
    catch (e) { err.textContent = tt(typeof e === 'string' ? e : 'importErrPgn'); return; }
    // the same game again: reuse the stored one (and its analysis), but from the chosen side
    const same = stats.imports.find(r => r.moves.join(' ') === rec.moves.join(' '));
    if (same) { Object.assign(same, { color: rec.color, res: rec.res, score: rec.score, wName: rec.wName, bName: rec.bName, wElo: rec.wElo, bElo: rec.bElo, myName: rec.myName, oppName: rec.oppName }); stats.imports = [same].concat(stats.imports.filter(r => r !== same)); rec = same; }
    else { stats.imports.unshift(rec); if (stats.imports.length > MAX_IMPORTS) stats.imports.length = MAX_IMPORTS; }
    saveStats();
    openReview(rec, 'statsScreen');
  }

  // ── Settings ─────────────────────────────────────────────────────────────
  function openSettings(from) {
    soundClick();
    settingsFrom = from;
    $('settContinue').style.display = from === 'playScreen' ? '' : 'none';
    renderSettings();
    showScreen('settingsScreen');
  }
  function renderSettings() {
    document.querySelectorAll('#themeSeg button').forEach(b => b.classList.toggle('active', b.dataset.v === prefs.theme));
    setToggle('soundToggle', prefs.sound); setToggle('vibToggle', prefs.vibrate);
    setToggle('legalToggle', prefs.showLegal); setToggle('autoQueenToggle', prefs.autoQueen);
    renderBoardSwatches(); renderPieceTiles(); renderSettingsPreview(); renderCoordChips();
  }
  function renderSettingsPreview() {
    const svg = $('settPreview'); if (!svg) return;
    const pal = currentPalette();
    const bg = (r, c) => ((r + c) % 2 === 0 ? pal.light : pal.dark);
    const rows = [['bB', 'bQ', 'bP'], [null, null, null], ['wN', 'wK', 'wR']];
    ChessCore.renderGrid(svg, prefs.pieceSet, rows.map((row, r) => row.map((p, c) => ({ bg: bg(r, c), p }))), {
      coords: prefs.coordMode, ranks: [8, 7, 6], files: ['a', 'b', 'c'], contrast: [pal.dark, pal.light],
    });
  }
  function renderBoardSwatches() {
    const container = $('boardSwatches'); if (!container) return;
    container.innerHTML = '';
    const mode = currentUiMode();
    const current = mode === 'dark' ? prefs.darkBoard : prefs.lightBoard;
    for (const [name, p] of Object.entries(BOARD_THEMES[mode])) {
      const sw = document.createElement('button');
      sw.className = 'boardSwatch' + (name === current ? ' active' : '');
      sw.title = name;
      sw.style.background = 'conic-gradient(' + p.dark + ' 25%, ' + p.light + ' 0 50%, ' + p.dark + ' 0 75%, ' + p.light + ' 0)';
      sw.addEventListener('click', () => {
        if (mode === 'dark') prefs.darkBoard = name; else prefs.lightBoard = name;
        savePrefs(); applyBoardTheme(); renderBoardSwatches(); renderPieceTiles(); renderSettingsPreview();
      });
      container.appendChild(sw);
    }
  }
  function renderPieceTiles() {
    const container = $('pieceTiles'); if (!container) return;
    container.innerHTML = '';
    const pal = currentPalette();
    for (const key of ChessCore.PIECE_SET_KEYS) {
      const btn = document.createElement('button');
      btn.className = 'pieceTile' + (prefs.pieceSet === key ? ' active' : '');
      btn.title = key;
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ChessCore.renderGrid(svg, key, [[{ bg: pal.light, p: 'wN' }, { bg: pal.dark, p: 'bN' }], [{ bg: pal.dark, p: 'wP' }, { bg: pal.light, p: 'bP' }]]);
      btn.appendChild(svg);
      btn.addEventListener('click', () => {
        prefs.pieceSet = key; savePrefs(); ChessCore.setPieceSet(key);
        renderHome(); renderPieceTiles(); renderSettingsPreview(); updateColorButtons();
      });
      container.appendChild(btn);
    }
  }
  function renderCoordChips() {
    const container = $('coordChips'); if (!container) return;
    container.innerHTML = '';
    for (const opt of [['inside', 'coordInside'], ['outside', 'coordOutside'], ['none', 'coordNone']]) {
      const btn = document.createElement('button');
      btn.className = 'chip' + (prefs.coordMode === opt[0] ? ' active' : '');
      btn.textContent = tt(opt[1]);
      btn.addEventListener('click', () => { prefs.coordMode = opt[0]; savePrefs(); ChessCore.setCoordMode(opt[0]); renderCoordChips(); renderSettingsPreview(); });
      container.appendChild(btn);
    }
  }
  function setToggle(id, on) { const b = $(id); if (b) b.classList.toggle('on', !!on); }
  function bindToggle(id, key, after) {
    const b = $(id); if (!b) return;
    b.addEventListener('click', () => { prefs[key] = !prefs[key]; setToggle(id, prefs[key]); savePrefs(); if (after) after(); });
  }

  // ── Privacy / ads state ──────────────────────────────────────────────────
  function renderPrivacy() {
    const d = window.CHESS_I18N[window._cvbLang] || window.CHESS_I18N.en;
    $('privUpdated').textContent = d.privacyUpdated;
    const email = window.PRIVACY_EMAIL || '';
    $('privBody').innerHTML = (d.priv || window.CHESS_I18N.en.priv).map(([h, p]) =>
      '<div class="privSec"><h3>' + h + '</h3><p>' + String(p).replace('{email}', email).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p></div>').join('');
  }
  function applyTacticsLinks() {
    const url = window.TACTICS_URL || '#';
    ['homeTactics', 'settTactics'].forEach(id => { const a = $(id); if (a) a.setAttribute('href', url); });
  }

  // ── Navigation buttons on every page: full view, settings, home ───────────
  const NAV_SVG = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const NAV_ICON = {
    home: NAV_SVG('<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-6h4v6"/>'),
    gear: NAV_SVG('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
    full: NAV_SVG('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    exit: NAV_SVG('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  };
  // first / previous / next / latest move (filled shapes, same look in the game and in the review)
  const MV_ICON = {
    first: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="2.6" height="14" rx="1.1"/><path d="M19 5.6v12.8L9.4 12z"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    last: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5.6v12.8L14.6 12z"/><rect x="16.4" y="5" width="2.6" height="14" rx="1.1"/></svg>',
  };
  function applyMoveIcons() { document.querySelectorAll('[data-nav-ico]').forEach(b => { b.innerHTML = MV_ICON[b.getAttribute('data-nav-ico')] || ''; }); }
  const fsActive = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function setFullView(on) { document.body.classList.toggle('fullview', !!on); updateNavLabels(); }
  // Full view: the browser's full-screen mode where it exists (desktop, iPad) and a roomier layout (bigger board, no width limit).
  function toggleFullView() {
    const want = !document.body.classList.contains('fullview');
    const el = document.documentElement;
    try {
      if (want) { const f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) { const p = f.call(el); if (p && p.catch) p.catch(() => {}); } }
      else if (fsActive()) { const x = document.exitFullscreen || document.webkitExitFullscreen; if (x) x.call(document); }
    } catch (e) {}
    setFullView(want);
  }
  function updateNavLabels() {
    const fv = document.body.classList.contains('fullview');
    document.querySelectorAll('.navBtn').forEach(b => {
      const k = b.dataset.nav;
      const label = k === 'home' ? tt('goHome') : k === 'gear' ? tt('settings') : tt(fv ? 'exitFullView' : 'fullView');
      b.setAttribute('aria-label', label); b.title = label;
      if (k === 'full') b.innerHTML = fv ? NAV_ICON.exit : NAV_ICON.full;
    });
  }
  function goHomeNav() {
    const cur = document.querySelector('.screen.active');
    if (cur && (cur.id === 'playScreen' || (cur.id === 'settingsScreen' && settingsFrom === 'playScreen'))) cancelThinking();   // the game in progress stays saved
    renderHome(); showScreen('homeScreen');
  }
  function onNavClick(e) {
    const k = e.currentTarget.dataset.nav;
    soundClick();
    if (k === 'full') return toggleFullView();
    if (k === 'home') return goHomeNav();
    const cur = document.querySelector('.screen.active');
    openSettings(cur ? cur.id : 'homeScreen');
  }
  function injectNav() {
    const mk = kind => { const b = document.createElement('button'); b.type = 'button'; b.className = 'smallbtn navBtn'; b.dataset.nav = kind; b.innerHTML = NAV_ICON[kind]; b.addEventListener('click', onNavClick); return b; };
    // pages with a title bar: a row of buttons under the title (as in Chess Tactics Gym)
    const pages = { importScreen: true, botsScreen: true, profileScreen: true, setupScreen: true, reviewScreen: true, settingsScreen: false, statsScreen: true, privacyScreen: true, aboutScreen: true };
    for (const id of Object.keys(pages)) {
      const bar = document.querySelector('#' + id + ' .topbar'); if (!bar) continue;
      const row = document.createElement('div'); row.className = 'topbarBtns';
      row.appendChild(mk('full')); if (pages[id]) row.appendChild(mk('gear')); row.appendChild(mk('home'));
      bar.appendChild(row);
    }
    // the game screen: in the header line
    const pt = document.querySelector('#playScreen .playTop');
    if (pt) { pt.appendChild(mk('full')); pt.appendChild(mk('home')); pt.appendChild(mk('gear')); }
    // the home screen: full view in the corner (settings is already there)
    const hero = document.querySelector('#homeScreen .homeHero');
    if (hero) { const b = mk('full'); b.classList.add('homeFull'); hero.appendChild(b); }
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => setFullView(fsActive())));
    updateNavLabels();
  }

  // ── Wire events ──────────────────────────────────────────────────────────
  function backTo(id) { soundClick(); showScreen(id); }
  function wireEvents() {
    $('langSel').addEventListener('change', e => { prefs.lang = e.target.value; savePrefs(); applyLanguage(prefs.lang); });
    $('continueBtn').addEventListener('click', () => { soundClick(); resumeGame(); });
    $('playBtn').addEventListener('click', () => { soundClick(); showScreen('botsScreen'); });
    $('statsBtn').addEventListener('click', () => { soundClick(); statsBot = null; showScreen('statsScreen'); });
    $('analyseHomeBtn').addEventListener('click', () => { soundClick(); openImport('homeScreen'); });
    $('importBack').addEventListener('click', () => backTo(importFrom));
    $('importFileBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (!f) return; const fr = new FileReader(); fr.onload = () => { $('importText').value = String(fr.result || ''); $('importErr').textContent = ''; }; fr.onerror = () => { $('importErr').textContent = tt('importErrPgn'); }; fr.readAsText(f); e.target.value = ''; });
    $('importGo').addEventListener('click', () => { soundClick(); startImport(); });
    $('settBtn').addEventListener('click', () => openSettings('homeScreen'));
    $('aboutHomeBtn').addEventListener('click', () => { aboutFrom = 'homeScreen'; showScreen('aboutScreen'); });

    $('botsBack').addEventListener('click', () => backTo('homeScreen'));
    $('setupBack').addEventListener('click', () => backTo('botsScreen'));
    $('colorPick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; setupColor = b.dataset.c; soundClick(); updateColorButtons(); });
    $('startGameBtn').addEventListener('click', () => {
      const go = () => startNewGame(setupBot.id, setupColor);
      if (saved && !(G && G.over)) confirmDialog(tt('newGameTitle'), tt('newGameText', { bot: Bots.byId(saved.botId).name }), tt('startGame'), go);
      else go();
    });

    $('playBack').addEventListener('click', () => { soundClick(); cancelThinking(); renderHome(); showScreen('homeScreen'); });
    $('undoBtn').addEventListener('click', onUndo);
    $('hintBtn').addEventListener('click', onHint);
    $('drawBtn').addEventListener('click', onDraw);
    $('resignBtn').addEventListener('click', onResign);
    $('flipBtn').addEventListener('click', onFlip);

    $('confirmYes').addEventListener('click', () => { const f = pendingConfirm; closeConfirm(); if (f) f(); });
    $('confirmNo').addEventListener('click', closeConfirm);
    $('goReview').addEventListener('click', () => { if (G && G.record) openReview(G.record, 'homeScreen'); });
    $('goRematch').addEventListener('click', () => { const b = G.bot, c = G.color; startNewGame(b.id, c === 'w' ? 'b' : 'w'); });
    $('goOther').addEventListener('click', () => { $('gameOverlay').style.display = 'none'; showScreen('botsScreen'); });
    $('goHome').addEventListener('click', () => { $('gameOverlay').style.display = 'none'; showScreen('homeScreen'); });

    $('reviewBack').addEventListener('click', () => backTo(reviewFrom));
    $('revFirst').addEventListener('click', () => jumpTo(0));
    $('revPrev').addEventListener('click', () => jumpTo(rv.ply - 1));
    $('revNext').addEventListener('click', () => jumpTo(rv.ply + 1));
    $('mvFirst').addEventListener('click', () => { soundClick(); viewTo(0); });
    $('mvPrev').addEventListener('click', () => { soundClick(); viewTo(curViewPly() - 1); });
    $('mvNext').addEventListener('click', () => { soundClick(); viewTo(curViewPly() + 1); });
    $('mvLast').addEventListener('click', () => { soundClick(); exitView(); });
    $('moveTable').addEventListener('click', e => { const b = e.target.closest('button[data-k]'); if (b && G) viewTo(+b.dataset.k); });
    $('revLast').addEventListener('click', () => jumpTo(rv.rec.moves.length));
    $('revFlip').addEventListener('click', () => { rv.flipped = !rv.flipped; rv.board.flip(); updateEvalBar(); renderPlayerBars(); });
    $('revRematch').addEventListener('click', () => { const b = rv.bot, c = rv.rec.color; startNewGame(b.id, c === 'w' ? 'b' : 'w'); });
    $('revOther').addEventListener('click', () => showScreen('botsScreen'));
    const eg = $('evalGraph');
    let dragging = false;
    eg.addEventListener('pointerdown', e => { dragging = true; try { eg.setPointerCapture(e.pointerId); } catch (_) {} graphPointer(e); });
    eg.addEventListener('pointermove', e => { if (dragging) graphPointer(e); });
    eg.addEventListener('pointerup', () => { dragging = false; });
    eg.addEventListener('pointercancel', () => { dragging = false; });

    $('settBack').addEventListener('click', () => { soundClick(); showScreen(settingsFrom); });
    $('settContinue').addEventListener('click', () => { soundClick(); showScreen('playScreen'); });
    document.querySelectorAll('#themeSeg button').forEach(b => b.addEventListener('click', () => { prefs.theme = b.dataset.v; savePrefs(); applyTheme(); renderSettings(); }));
    bindToggle('soundToggle', 'sound'); bindToggle('vibToggle', 'vibrate');
    bindToggle('legalToggle', 'showLegal', () => { if (board) board.setShowLegal(prefs.showLegal); });
    bindToggle('autoQueenToggle', 'autoQueen');
    $('privBtn').addEventListener('click', () => showScreen('privacyScreen'));
    $('privBack').addEventListener('click', () => backTo('settingsScreen'));
    $('aboutBtn').addEventListener('click', () => { aboutFrom = 'settingsScreen'; showScreen('aboutScreen'); });
    $('aboutBack').addEventListener('click', () => backTo(aboutFrom));
    $('aboutPrivBtn').addEventListener('click', () => showScreen('privacyScreen'));
    $('statsBack').addEventListener('click', () => backTo('homeScreen'));
    $('homeProfile').addEventListener('click', () => { soundClick(); openProfile('homeScreen'); });
    $('profileBack').addEventListener('click', () => backTo(profileFrom));
    $('profCamBtn').addEventListener('click', () => { soundClick(); $('profCam').value = ''; $('profCam').click(); });
    $('profUpBtn').addEventListener('click', () => { soundClick(); $('profFile').value = ''; $('profFile').click(); });
    $('profCam').addEventListener('change', e => useProfilePhoto(e.target.files && e.target.files[0]));
    $('profFile').addEventListener('change', e => useProfilePhoto(e.target.files && e.target.files[0]));
    $('profName').addEventListener('input', e => { profile.name = e.target.value.slice(0, 20); saveProfile(); renderPlayers(false); refreshProfileViews(); });
    $('profCountry').addEventListener('change', e => { profile.cc = e.target.value; saveProfile(); $('profFlag').innerHTML = profile.cc ? Avatars.flag(profile.cc, 22) : ''; renderPlayers(false); refreshProfileViews(); });
    $('profPlayers').addEventListener('click', e => {
      const c = e.target.closest('.plCard'); if (!c) return;
      soundClick();
      if (c.id === 'plAdd') addProfile(); else switchProfile(c.dataset.id);
    });
    $('profDelBtn').addEventListener('click', () => confirmDialog(tt('deletePlayer'), tt('deletePlayerText', { name: playerLabel(profile) }), tt('deletePlayer'), deleteProfile));

    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { try { saveGame(); } catch (e) {} } });
    if (window.matchMedia) { try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs.theme === 'system') applyTheme(); }); } catch (e) {} }
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────
  async function init() {
    loadPrefs();
    loadProfile();
    loadStats(); loadStatsPeriod();
    ChessCore.setPieceSet(prefs.pieceSet);
    ChessCore.setCoordMode(prefs.coordMode);
    loadSaved();
    applyTheme();
    applyLanguage(prefs.lang);
    applyTacticsLinks();
    injectNav();
    applyMoveIcons();
    wireEvents();
    renderHome();
    showScreen('homeScreen');
    setTimeout(() => { try { Engine.start(); } catch (e) {} }, 1200);     // warm the engine up while the menu is shown
    window.__cvb = { get G() { return G; }, get stats() { return stats; }, get prefs() { return prefs; }, get saved() { return saved; }, get profile() { return profile; }, saveStats, get rv() { return rv; }, board: () => board, scoreGame, viewTo, exitView, openReview, startNewGame, endGame, refresh: () => updatePlayUI() };
  }

  document.addEventListener('DOMContentLoaded', init);

})();
