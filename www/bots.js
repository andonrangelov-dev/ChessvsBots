/**
 * bots.js — the 40 bot characters (drawn people from different countries), the 5 chess legends and the strength logic.
 *
 *   >= 1320 Elo : Stockfish UCI_LimitStrength + UCI_Elo
 *   <  1320 Elo : Skill Level, shallow depth, MultiPV candidates and occasional human-like mistakes
 *
 * Bot names and faces are original to this app (see avatars.js). Released under the GNU GPL v3 (see LICENSE).
 */
'use strict';

window.Bots = (function () {

  // ── Roster ───────────────────────────────────────────────────────────────
  // 40 characters, weakest first. Every character is a drawn person from a different country (original names and faces).
  // [name, country code, style, look]; the rating follows from the position in the list (250 ... 2800).
  const P = (hair, hc, skin, top, bg, extra) => Object.assign({ hair, hc, skin, top, bg }, extra || {});
  const PEOPLE = [
    // Beginner
    ['Andon', 'BG', 'chaotic', P('short', 'dkbrown', 1, '#4a7fb5', '#2f5d62', { beard: 'stubble', mouth: 'grin', brow: 'cheer' })],
    ['Ayşe', 'TR', 'cautious', P('long', 'black', 1, '#c0566a', '#5a3f6b', { collar: 'v', eye: 'dark' })],
    ['Mateo', 'AR', 'tricky', P('curly', 'dkbrown', 2, '#74acdf', '#3a5a7a', { beard: 'stubble', mouth: 'grin' })],
    ['Sakura', 'JP', 'balanced', P('bob', 'black', 0, '#e8a0b4', '#4a6b8a', { eyes: 'narrow', eye: 'dark' })],
    ['Pavel', 'CZ', 'solid', P('short', 'brown', 0, '#5a7d4f', '#4c5a6e', { glasses: 'square', collar: 'shirt', tie: '#8a2a36', mouth: 'neutral' })],
    ['Chidi', 'NG', 'aggressive', P('buzz', 'black', 5, '#e0a030', '#3b4a6b', { beard: 'short', mouth: 'grin', brow: 'stern', eye: 'dark' })],
    ['Astrid', 'SE', 'cautious', P('long', 'lblond', 0, '#3a6ea5', '#3d5470', { collar: 'hoodie', eye: 'blue' })],
    ['Rohan', 'IN', 'chaotic', P('side', 'black', 3, '#d9783a', '#46405f', { glasses: 'round', mouth: 'grin', brow: 'cheer', eye: 'dark' })],
    ['Carla', 'BR', 'chaotic', P('curly', 'dkbrown', 3, '#2fa36b', '#2b5a50', { collar: 'v', mouth: 'grin', eye: 'dark' })],
    ['Nikos', 'GR', 'solid', P('short', 'grey', 2, '#2f5aa0', '#3a4f6b', { beard: 'full', collar: 'shirt', tie: '#c9a227' })],
    // Intermediate
    ['Giulia', 'IT', 'tricky', P('ponytail', 'dkbrown', 1, '#c0392b', '#58404a', { collar: 'v', mouth: 'smirk', eye: 'dark' })],
    ['Jonas', 'DE', 'tactical', P('short', 'lblond', 0, '#555d6b', '#3d4a5c', { collar: 'jacket', mouth: 'neutral', eye: 'blue' })],
    ['Camille', 'FR', 'positional', P('bob', 'auburn', 0, '#27407a', '#5a4a62', { glasses: 'round', eye: 'green' })],
    ['Tomasz', 'PL', 'solid', P('side', 'brown', 0, '#8a2a36', '#3f4b58', { beard: 'stubble', collar: 'shirt', tie: '#222831', mouth: 'neutral', eye: 'grey' })],
    ['Aisha', 'EG', 'balanced', P('short', 'black', 2, '#e8e0d0', '#4a5568', { hat: 'hijab', hatc: '#2a8a8a', collar: 'v', eye: 'dark' })],
    ['Liam', 'IE', 'aggressive', P('short', 'red', 0, '#1f7a4d', '#34506a', { beard: 'short', collar: 'hoodie', mouth: 'grin', eye: 'green' })],
    ['Mei', 'CN', 'positional', P('long', 'black', 1, '#b3322e', '#3a4a66', { eyes: 'narrow', glasses: 'square', eye: 'dark' })],
    ['Diego', 'MX', 'tactical', P('side', 'black', 2, '#2f7f5a', '#4a4a64', { beard: 'moustache', hat: 'cap', hatc: '#c0392b', mouth: 'smirk', eye: 'dark' })],
    ['Hanna', 'FI', 'solid', P('bob', 'lblond', 0, '#2f6f9f', '#3a4d63', { collar: 'hoodie', mouth: 'neutral', eye: 'blue' })],
    ['Kofi', 'GH', 'tricky', P('baldside', 'black', 5, '#d4a017', '#3a3f5c', { beard: 'goatee', collar: 'v', mouth: 'grin', eye: 'dark' })],
    // Advanced
    ['Elena', 'ES', 'positional', P('long', 'dkbrown', 1, '#aa151b', '#463c5e', { collar: 'v', eye: 'dark' })],
    ['Ji-ho', 'KR', 'tactical', P('side', 'black', 1, '#2b3a55', '#4a5b73', { eyes: 'narrow', glasses: 'round', collar: 'jacket', mouth: 'neutral', eye: 'dark' })],
    ['Lukas', 'AT', 'balanced', P('short', 'brown', 0, '#a33a3a', '#3c4e62', { beard: 'stubble', collar: 'shirt', tie: '#223355', eye: 'blue' })],
    ['Fatima', 'MA', 'cautious', P('short', 'black', 2, '#e6d3b0', '#42506a', { hat: 'hijab', hatc: '#7a3b6e', collar: 'v', eye: 'dark' })],
    ['Henrik', 'DK', 'solid', P('short', 'lblond', 0, '#394b63', '#4b5a68', { beard: 'full', collar: 'jacket', mouth: 'neutral', eye: 'blue' })],
    ['Daan', 'NL', 'aggressive', P('side', 'blond', 0, '#e07a1f', '#35506b', { glasses: 'square', mouth: 'grin', brow: 'stern', eye: 'blue' })],
    ['Inês', 'PT', 'tricky', P('ponytail', 'black', 1, '#2e7d5b', '#4a4460', { mouth: 'smirk', eye: 'dark' })],
    ['Zsolt', 'HU', 'relentless', P('buzz', 'dkbrown', 1, '#3a4a3a', '#3d4a58', { beard: 'short', collar: 'jacket', mouth: 'neutral', brow: 'stern', eye: 'brown' })],
    ['Ivana', 'HR', 'positional', P('long', 'auburn', 0, '#2a4f8a', '#52405a', { collar: 'v', eye: 'green' })],
    ['Andrei', 'RO', 'tactical', P('side', 'dkbrown', 1, '#1f2f4f', '#40506a', { beard: 'goatee', glasses: 'round', collar: 'shirt', tie: '#c9a227', mouth: 'smirk', eye: 'brown' })],
    // Master
    ['Rustam', 'KZ', 'solid', P('short', 'black', 2, '#2a5d7a', '#3b4f65', { eyes: 'narrow', beard: 'moustache', collar: 'jacket', mouth: 'neutral', eye: 'dark' })],
    ['Chloe', 'AU', 'balanced', P('ponytail', 'blond', 0, '#12315f', '#3f5a73', { mouth: 'grin', eye: 'blue' })],
    ['Noah', 'CH', 'positional', P('short', 'dkbrown', 0, '#c8102e', '#3b4a5e', { glasses: 'square', collar: 'shirt', tie: '#222831', mouth: 'neutral', eye: 'brown' })],
    ['Émile', 'CA', 'cautious', P('short', 'dkbrown', 1, '#4a4f55', '#3a5060', { beard: 'full', hat: 'beanie', hatc: '#b03a2e', collar: 'hoodie', eye: 'brown' })],
    ['Sven', 'NO', 'tactical', P('long', 'lblond', 0, '#2a3f5f', '#44566a', { beard: 'full', collar: 'jacket', mouth: 'neutral', brow: 'stern', eye: 'blue' })],
    ['Harriet', 'GB', 'tricky', P('bob', 'grey', 0, '#8b2e3c', '#4a4560', { glasses: 'round', collar: 'jacket', eye: 'grey' })],
    ['Valentina', 'CL', 'relentless', P('long', 'black', 2, '#d1495b', '#44445e', { collar: 'v', mouth: 'smirk', brow: 'stern', eye: 'dark' })],
    ['Bogdan', 'UA', 'aggressive', P('buzz', 'brown', 0, '#0057b7', '#3a4a5c', { beard: 'stubble', collar: 'jacket', mouth: 'neutral', brow: 'stern', eye: 'blue' })],
    ['Jordan', 'US', 'balanced', P('short', 'black', 4, '#2f3e5c', '#4a5568', { beard: 'short', collar: 'shirt', tie: '#b22234', mouth: 'grin', eye: 'dark' })],
    ['Janis', 'LV', 'relentless', P('baldside', 'grey', 0, '#1b1f2a', '#2e3648', { beard: 'goatee', glasses: 'square', collar: 'jacket', mouth: 'neutral', brow: 'stern', eye: 'grey' })],
  ];
  const GROUPS = ['beginner', 'intermediate', 'advanced', 'master', 'top'];
  const ROSTER = PEOPLE.map((p, i) => ({
    id: p[0].toLowerCase().replace(/[^a-z]/g, (c) => ({ 'ş': 's', 'ê': 'e', 'é': 'e' }[c] || '')),
    name: p[0], cc: p[1], style: p[2], look: p[3],
    // 250 ... 2800 evenly; the Master group (positions 30-39) is lowered by 5 ... 25 points (the strongest by 25), so the legends can sit above it
    elo: Math.round((250 + i * 2550 / (PEOPLE.length - 1)) / 10) * 10 - (i >= 30 ? Math.round((5 + (i - 30) * 20 / 9) / 5) * 5 : 0),
    group: GROUPS[Math.floor(i / 10)], index: i,
  }));
  // Top players: five chess legends. Drawn caricatures made for this app (not photos); the texts about them are in i18n (bioLegend_<id>).
  // The ratings are playing-strength labels for this app (about the same as other chess apps give them), not historical ratings.
  const LEGENDS = [
    { id: 'morphy', name: 'Paul Morphy', cc: 'US', style: 'tactical', elo: 2675, years: '1837–1884',
      look: P('side', 'black', 0, '#2a2a31', '#6b5636', { collar: 'bow', tie: '#15151b', eye: 'dark', mouth: 'neutral', ring: true }) },
    { id: 'lasker', name: 'Emanuel Lasker', cc: 'DE', style: 'tricky', elo: 2715, years: '1868–1941',
      look: P('recede', 'grey', 0, '#3a3f4a', '#4a5260', { beard: 'bigmoustache', collar: 'shirt', tie: '#23232b', eye: 'grey', brow: 'stern', thick: true, mouth: 'neutral', ring: true }) },
    { id: 'tal', name: 'Mikhail Tal', cc: 'LV', style: 'aggressive', elo: 2780, years: '1936–1992',
      look: P('wave', 'black', 0, '#2f3a4d', '#5c3d3d', { collar: 'jacket', eye: 'dark', eyes: 'narrow', brow: 'stern', thick: true, mouth: 'smirk', ring: true }) },
    { id: 'capablanca', name: 'José Raúl Capablanca', cc: 'CU', style: 'positional', elo: 2800, years: '1888–1942',
      look: P('slick', 'black', 1, '#2d3748', '#5a4a3a', { collar: 'shirt', tie: '#8a1f2b', eye: 'dark', mouth: 'smile', ring: true }) },
    { id: 'alekhine', name: 'Alexander Alekhine', cc: 'FR', style: 'relentless', elo: 2825, years: '1892–1946',
      look: P('slick', 'dkbrown', 0, '#343a46', '#4a4a5c', { glasses: 'round', collar: 'shirt', tie: '#444b57', eye: 'dark', brow: 'stern', thick: true, mouth: 'neutral', ring: true }) },
  ];
  LEGENDS.forEach((l, k) => ROSTER.push({ id: l.id, name: l.name, cc: l.cc, style: l.style, look: l.look, elo: l.elo, group: 'top', index: PEOPLE.length + k, legend: true, years: l.years, short: l.name.split(' ').pop() }));
  // How each character greets you, in the language of their own country (shown in the bot's speech bubble).
  const HELLO = {
    BG: 'Здравей!', TR: 'Merhaba!', AR: '¡Hola, che!', JP: 'こんにちは！', CZ: 'Ahoj!', NG: 'Ndewo!', SE: 'Hej!', IN: 'Namaste!', BR: 'Olá!', GR: 'Γεια σου!',
    IT: 'Ciao!', DE: 'Hallo!', FR: 'Salut !', PL: 'Cześć!', EG: 'أهلاً!', IE: 'Dia duit!', CN: '你好！', MX: '¡Hola!', FI: 'Moi!', GH: 'Akwaaba!',
    ES: '¡Hola!', KR: '안녕하세요!', AT: 'Servus!', MA: 'السلام عليكم!', DK: 'Hej!', NL: 'Hoi!', PT: 'Olá!', HU: 'Szia!', HR: 'Bok!', RO: 'Salut!',
    KZ: 'Сәлем!', AU: "G'day!", CH: 'Grüezi!', CA: 'Bonjour !', NO: 'Hei!', GB: 'Hello!', CL: '¡Hola!', UA: 'Привіт!', US: 'Hi!', LV: 'Sveiki!',
  };
  ROSTER.forEach(b => { if (!b.legend) b.hi = HELLO[b.cc] || 'Hi!'; });
  const BY_ID = {};
  ROSTER.forEach(b => { BY_ID[b.id] = b; });

  // ── Avatars (SVG, drawn for this app; see avatars.js) ────────────────────
  function avatar(bot, size) {
    const b = typeof bot === 'string' ? BY_ID[bot] : bot;
    return b ? window.Avatars.portrait(b.look, size) : '';
  }
  function flag(bot, h) {
    const b = typeof bot === 'string' ? BY_ID[bot] : bot;
    return b ? window.Avatars.flag(b.cc, h) : '';
  }

  // ── Strength ─────────────────────────────────────────────────────────────
  const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
  // Bots under 1320 build on Stockfish "Skill Level" 0 (about 1320 Elo: it picks among the top moves of a depth-1 search with
  // lots of noise) and get weaker with a growing chance of a human-like slip (a random legal move).
  // Anchors: [elo, probability of a slip]. Calibrated with bot-vs-bot games (see tools/ notes).
  const LOW = [
    [200, 0.92], [300, 0.75], [400, 0.62], [500, 0.52], [600, 0.43], [700, 0.35], [800, 0.28], [900, 0.21],
    [1000, 0.155], [1100, 0.105], [1200, 0.06], [1320, 0.0],
  ];
  function lowParams(elo) {
    let i = 0;
    while (i < LOW.length - 2 && elo > LOW[i + 1][0]) i++;
    const a = LOW[i], b = LOW[i + 1], t = (elo - a[0]) / (b[0] - a[0]);
    return { skill: 0, depth: 1, pSlip: lerp(a[1], b[1], t) };
  }
  // The engine scale is a bit softer than what players feel (e.g. chess.com bots): every bot plays like a bot BOOST points
  // higher on the raw engine scale, while the shown rating stays the same. Bots are also given a little more time to think.
  const BOOST = 100;
  function strength(bot) {
    const eff = bot.elo + BOOST;
    if (eff >= 1320) {
      return { mode: 'elo', elo: Math.min(3190, eff), movetime: Math.round(lerp(320, 1700, (eff - 1320) / 1280)) };
    }
    return Object.assign({ mode: 'skill' }, lowParams(eff));
  }

  const STYLE_TWEAK = {   // flavour: slip frequency and what the bot likes to play when moves are about equal
    chaotic:    { slip: 1.35, like: 'any' },
    aggressive: { slip: 1.0,  like: 'attack' },
    cautious:   { slip: 0.85, like: 'castle' },
    tricky:     { slip: 1.1,  like: 'check' },
    balanced:   { slip: 1.0,  like: null },
    solid:      { slip: 0.85, like: 'castle' },
    tactical:   { slip: 1.0,  like: 'attack' },
    positional: { slip: 0.9,  like: 'castle' },
    relentless: { slip: 0.9,  like: 'attack' },
  };

  // ── Opening character (first move only, so games vary) ───────────────────
  const OPEN_WHITE = {
    aggressive: ['e2e4', 'e2e4', 'f2f4', 'd2d4'], tactical: ['e2e4', 'd2d4', 'g1f3'], relentless: ['e2e4', 'd2d4'],
    cautious: ['d2d4', 'g1f3', 'c2c4', 'b2b3'], solid: ['d2d4', 'c2c4', 'g1f3'], positional: ['d2d4', 'c2c4', 'g1f3'],
    tricky: ['b1c3', 'g1f3', 'e2e4', 'b2b3', 'c2c4'], balanced: ['e2e4', 'd2d4', 'g1f3', 'c2c4'], chaotic: ['e2e4', 'd2d4', 'g1f3', 'c2c4', 'b2b3', 'f2f4', 'b1c3', 'g2g3'],
  };
  const OPEN_BLACK = {   // reply to White's first move
    e2e4: { aggressive: ['c7c5', 'e7e5'], tactical: ['c7c5', 'e7e5'], relentless: ['c7c5', 'e7e5'], cautious: ['e7e6', 'c7c6', 'd7d6'], solid: ['e7e5', 'c7c6', 'e7e6'], positional: ['e7e5', 'e7e6', 'c7c6'], tricky: ['d7d6', 'b8c6', 'c7c5', 'g7g6'], balanced: ['e7e5', 'c7c5', 'e7e6'], chaotic: ['e7e5', 'c7c5', 'd7d5', 'g8f6', 'b7b6', 'a7a6'] },
    d2d4: { aggressive: ['g8f6', 'f7f5'], tactical: ['g8f6', 'd7d5'], relentless: ['g8f6', 'd7d5'], cautious: ['d7d5', 'e7e6'], solid: ['d7d5', 'g8f6'], positional: ['d7d5', 'g8f6', 'e7e6'], tricky: ['g8f6', 'd7d6', 'c7c5'], balanced: ['d7d5', 'g8f6'], chaotic: ['d7d5', 'g8f6', 'f7f5', 'e7e6', 'b8c6'] },
    c2c4: { _: ['e7e5', 'g8f6', 'c7c5', 'e7e6'] },
    g1f3: { _: ['d7d5', 'g8f6', 'c7c5'] },
  };
  function openingMove(bot, chess) {
    const hist = chess.history({ verbose: true });
    let pool = null;
    if (hist.length === 0) pool = OPEN_WHITE[bot.style];
    else if (hist.length === 1) {
      const first = hist[0].from + hist[0].to;
      const t = OPEN_BLACK[first];
      if (t) pool = t[bot.style] || t._;
    }
    if (!pool || !pool.length) return null;
    const legal = chess.moves({ verbose: true }).map(m => m.from + m.to + (m.promotion || ''));
    const ok = pool.filter(u => legal.includes(u));
    return ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
  }

  // ── Choosing a move ──────────────────────────────────────────────────────
  const score = l => l.mate != null ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : (l.cp || 0);

  function pickLow(bot, chess, res, sp) {
    const tw = STYLE_TWEAK[bot.style] || STYLE_TWEAK.balanced;
    const legal = chess.moves({ verbose: true });
    const uciOf = m => m.from + m.to + (m.promotion || '');
    const byUci = {};
    legal.forEach(m => { byUci[uciOf(m)] = m; });
    if (Math.random() < sp.pSlip * tw.slip) {          // a human-like slip
      if (bot.elo < 800 || res.lines.length < 2 || Math.random() < 0.4) return uciOf(legal[Math.floor(Math.random() * legal.length)]);
      const others = res.lines.filter(l => l.pv.length && byUci[l.pv[0]] && l.pv[0] !== res.best);
      if (others.length) return others[Math.floor(Math.random() * others.length)].pv[0];
    }
    // flavour: when another good candidate fits the bot's taste (within 45 cp of the best), sometimes prefer it
    if (tw.like && res.best && Math.random() < 0.4) {
      const top = res.lines.length ? score(res.lines[0]) : 0;
      const liked = res.lines.filter(l => {
        const m = l.pv.length && byUci[l.pv[0]];
        if (!m || score(l) < top - 45) return false;
        if (tw.like === 'any') return true;
        if (tw.like === 'attack') return !!m.captured || m.san.indexOf('+') > 0;
        if (tw.like === 'check') return m.san.indexOf('+') > 0 || !!m.promotion;
        if (tw.like === 'castle') return m.flags.indexOf('k') >= 0 || m.flags.indexOf('q') >= 0;
        return false;
      });
      if (liked.length) return liked[Math.floor(Math.random() * liked.length)].pv[0];
    }
    return res.best;
  }

  async function chooseMove(bot, chess) {
    const legal = chess.moves({ verbose: true });
    if (!legal.length) return null;
    if (legal.length === 1) return legal[0].from + legal[0].to + (legal[0].promotion || '');
    const book = openingMove(bot, chess);
    if (book) return book;
    const sp = strength(bot);
    if (sp.mode === 'elo') {
      const mt = window.__botsMovetime || Math.round(sp.movetime * (0.8 + Math.random() * 0.4));
      const r = await Engine.search(chess.fen(), { elo: sp.elo, movetime: mt });
      return r.best;
    }
    const r = await Engine.search(chess.fen(), { skill: sp.skill, depth: sp.depth, multipv: 4 });
    return pickLow(bot, chess, r, sp);
  }

  // Natural-feeling pause so the reply is not instant (the engine itself is very quick at low strength).
  function minThinkMs(bot) { return Math.round(450 + Math.random() * 650 + (bot.elo >= 1320 ? 0 : 150)); }

  // Does the bot accept a draw offer? side = colour the bot plays ('w'|'b')
  async function acceptsDraw(bot, chess, side) {
    const plies = chess.history().length;
    let cp = 0;
    try {
      const r = await Engine.search(chess.fen(), { movetime: 160, depth: 12 });
      const l = r.lines[0];
      if (l) { const s = score(l); cp = chess.turn() === side ? s : -s; }
    } catch (e) { cp = 0; }
    if (plies < 16 && cp > -150) return false;                       // too early
    if (bot.elo < 1000) return cp < 350 && Math.random() < 0.5;      // weak bots do not judge the position well
    if (cp <= 25) return true;
    if (cp <= 90) return Math.random() < 0.2;
    return false;
  }

  return { list: ROSTER, byId: id => BY_ID[id], avatar, flag, GROUPS, strength, chooseMove, minThinkMs, acceptsDraw, STYLES: Object.keys(STYLE_TWEAK) };
})();
