/**
 * chess-core.js — SVG board rendering and move handling
 * Uses chess.js (window.Chess) for legal move validation
 */

'use strict';

window.ChessCore = (function () {

  // ── Piece character sets ─────────────────────────────────────────────────
  // Both colors use the SAME glyph type → identical sizes.
  // Color is conveyed by fill/stroke only.


  // ── Self-drawn piece shapes (45×45 box) ──────────────────────────────────
  const BASE = 'M11 40 H34 V36 H11 Z';
  const PX = 'M13 40 H32 V35 H13 Z';

  // Eight very different drawing families (all self-drawn). 'paths' families list closed shapes
  // (body) and decorative strokes (detail) in a 45x45 box.
  const FAMILIES = {
    classic: { kind: 'paths', sw: 1.8, shapes: {
      P: { body: ['M22.5 8 a5.5 5.5 0 1 0 0.01 0 Z', 'M16 36 C16 29 18 25 22.5 21 C27 25 29 29 29 36 Z', BASE], detail: [] },
      R: { body: ['M13 36 L15 31 V17 H12 V8 H17 V11 H20.5 V8 H24.5 V11 H28 V8 H33 V17 H30 V31 L32 36 Z', BASE], detail: ['M15 17 H30', 'M15 31 H30'] },
      N: { body: ['M14 36 C14 28 17 24 21 20 C18 20 15 22 12.5 25 L10 22 C12 16 16 11 21 9 L21 5 L25 8 C33 10 35 19 34 27 C33.5 31 33 33 33 36 Z', BASE], detail: ['M25.5 14 L25.6 14.1', 'M17 18 L20 15'] },
      B: { body: ['M22.5 4 a3 3 0 1 0 0.01 0 Z', 'M22.5 9 C29 14 30 20 26 25 L28.5 31 H16.5 L19 25 C15 20 16 14 22.5 9 Z', 'M14 36 C14 33 17 31 22.5 31 C28 31 31 33 31 36 Z', BASE], detail: ['M22.5 13 V19', 'M19.5 16 H25.5'] },
      Q: { body: ['M12 35 L8 14 L16 24 L19 9 L22.5 23 L26 9 L29 24 L37 14 L33 35 Z', BASE], detail: ['M13 31 H32'] },
      K: { body: ['M20.5 3 H24.5 V6 H27.5 V9.5 H24.5 V13 H20.5 V9.5 H17.5 V6 H20.5 Z', 'M12 36 C9 27 12 21 17 19 H28 C33 21 36 27 33 36 Z', 'M17 19 C17 16 19 14 22.5 14 C26 14 28 16 28 19 Z', BASE], detail: ['M13 31 H32'] },
    } },
    modern: { kind: 'paths', sw: 1.6, shapes: {
      P: { body: ['M22.5 7 a5.5 5.5 0 1 0 0.01 0 Z', 'M17 36 L19.5 21 H25.5 L28 36 Z', BASE], detail: [] },
      R: { body: ['M14 36 V9 H19 V14 H21 V9 H24 V14 H26 V9 H31 V36 Z', BASE], detail: [] },
      N: { body: ['M14 36 L15 24 L10 21 L21 5 L24 9 C32 12 34 24 32 36 Z', BASE], detail: ['M24 14 L24.1 14.1'] },
      B: { body: ['M22.5 4 L29 17 L22.5 29 L16 17 Z', 'M14 36 L18 29 H27 L31 36 Z', BASE], detail: [] },
      Q: { body: ['M22.5 3 a3 3 0 1 0 0.01 0 Z', 'M10 13 a2.6 2.6 0 1 0 0.01 0 Z', 'M35 13 a2.6 2.6 0 1 0 0.01 0 Z', 'M11 15 L17 35 H28 L34 15 L26 22 L22.5 9 L19 22 Z', BASE], detail: [] },
      K: { body: ['M20.5 2 H24.5 V6 H28.5 V10 H24.5 V14 H20.5 V10 H16.5 V6 H20.5 Z', 'M14 36 L16 19 H29 L31 36 Z', BASE], detail: [] },
    } },
    round: { kind: 'paths', sw: 1.6, shapes: {
      P: { body: ['M22.5 8 a7 7 0 1 0 0.01 0 Z', 'M11 39 C11 27 16 22 22.5 22 C29 22 34 27 34 39 Z'], detail: [] },
      R: { body: ['M11 39 V15 Q11 9 17 9 H28 Q34 9 34 15 V39 Z'], detail: ['M15 19 H30', 'M15 31 H30'] },
      N: { body: ['M11 39 C11 24 14 14 24 10 C30 8 35 12 33 18 C32 21 29 22 27 23 C32 28 34 33 34 39 Z', 'M21 11 L20 3 L28 9 Z'], detail: ['M27 15 L27.1 15.1'] },
      B: { body: ['M22.5 2 a3 3 0 1 0 0.01 0 Z', 'M22.5 7 C32 15 33 28 28 33 H17 C12 28 13 15 22.5 7 Z', 'M11 39 C11 35 16 33 22.5 33 C29 33 34 35 34 39 Z'], detail: ['M19 17 L26 24'] },
      Q: { body: ['M11 39 C9 29 11 21 15 17 C12 15 12 9 16 8 C19 7 20 11 19 14 C20 6 25 6 26 14 C25 11 26 7 29 8 C33 9 33 15 30 17 C34 21 36 29 34 39 Z'], detail: ['M13 32 H32'] },
      K: { body: ['M21 2 H24 V5 H27 V8 H24 V11 H21 V8 H18 V5 H21 Z', 'M11 39 C9 29 12 20 22.5 17 C33 20 36 29 34 39 Z'], detail: ['M13 31 H32'] },
    } },
    spire: { kind: 'paths', sw: 1.5, shapes: {
      P: { body: ['M22.5 4 L27.5 14 L22.5 20 L17.5 14 Z', 'M22.5 20 L29 36 H16 Z', BASE], detail: [] },
      R: { body: ['M14 36 L16 12 L11 5 L18 9 L22.5 3 L27 9 L34 5 L29 12 L31 36 Z', BASE], detail: ['M16 24 H29'] },
      N: { body: ['M13 36 L16 22 L10 20 L20 8 L21 2 L25 7 C33 10 36 24 32 36 Z', BASE], detail: ['M26 14 L26.1 14.1'] },
      B: { body: ['M22.5 1 L29 17 L25 24 L28 33 H17 L20 24 L16 17 Z', 'M14 36 C14 34 17 33 22.5 33 C28 33 31 34 31 36 Z', BASE], detail: ['M22.5 8 V16'] },
      Q: { body: ['M22.5 1 L25 14 L34 7 L30 22 L33 35 H12 L15 22 L11 7 L20 14 Z', BASE], detail: ['M14 31 H31'] },
      K: { body: ['M21 1 H24 V5 H27 V8 H24 V13 L30 35 H15 L21 13 V8 H18 V5 H21 Z', BASE], detail: ['M16 30 H29'] },
    } },
    line: { kind: 'line', sw: 2.6, shapes: null }, // stroke-only drawing, reuses classic shapes
  };
  FAMILIES.line.shapes = FAMILIES.classic.shapes;
  // 'round' is kept only as the base shape for the 'chunky' family; it is not offered as a set itself.
  const FAMILY_ORDER = ['classic', 'modern', 'spire', 'line'];

  // Colour palettes: wf/bf fills, ws/bs outlines, wd/bd details.
  const PALETTES = {
    neutral:  { wf:'#ffffff', bf:'#1f1f33', ws:'#1a1a2e', bs:'#0b0b14', wd:'#1a1a2e', bd:'#e8eefc' },
    ivory:    { wf:'#f8efd6', bf:'#4a2f1c', ws:'#5a4026', bs:'#2a170a', wd:'#5a4026', bd:'#f1dcb8' },
    ocean:    { wf:'#e3f4ff', bf:'#153b66', ws:'#0f2f55', bs:'#07182e', wd:'#0f2f55', bd:'#bfe3ff' },
    gold:     { wf:'#f6d365', bf:'#2d2a26', ws:'#7a5a00', bs:'#0e0d0b', wd:'#7a5a00', bd:'#f6d365' },
    rose:     { wf:'#ffe3ec', bf:'#6a1f3d', ws:'#7c2a4a', bs:'#2e0c1b', wd:'#7c2a4a', bd:'#ffd0e0' },
    slate:    { wf:'#d5dae3', bf:'#434a5c', ws:'#2c3140', bs:'#1d2230', wd:'#2c3140', bd:'#d5dae3' },
    neon:     { wf:'#7cf5ff', bf:'#ff4f9a', ws:'#0a2a30', bs:'#3a0420', wd:'#0a2a30', bd:'#3a0420' },
    walnut:   { wf:'#e9c79a', bf:'#5b3a22', ws:'#6b4a2a', bs:'#2b180a', wd:'#6b4a2a', bd:'#2b180a' },
    mint:     { wf:'#d8ffe8', bf:'#1f5a3c', ws:'#1b4d34', bs:'#0a2a1b', wd:'#1b4d34', bd:'#c8f5dc' },
    ruby:     { wf:'#ffd6d6', bf:'#8a1c2b', ws:'#6e1220', bs:'#3a0810', wd:'#6e1220', bd:'#ffd6d6' },
    lavender: { wf:'#efe4ff', bf:'#4b2f7a', ws:'#3d2566', bs:'#1d1033', wd:'#3d2566', bd:'#e2d2ff' },
  };
  // 3 colourways per family -> 24 sets. Order = row by row (8 families per row).
  const FAMILY_PALETTES = {
    classic: ['neutral', 'ivory', 'ocean'],
    modern:  ['neutral', 'slate', 'neon'],
    round:   ['neutral', 'gold', 'rose'],
    spire:   ['neutral', 'ruby', 'ivory'],
    line:    ['neutral', 'gold', 'neon'],
  };
  // Extra families (pieces-extra.js): 8 more families -> 24 more sets, appended after the original 24 so saved prefs stay valid.
  const EX = window.CHESS_EXTRA_PIECES;
  if (EX) {
    Object.assign(FAMILIES, EX.families, EX.late(FAMILIES.classic.shapes, FAMILIES.round.shapes));
    FAMILIES.heavy = { kind: 'line', sw: 3.4, shapes: EX.families.staunton.shapes };
    Object.assign(PALETTES, EX.palettes);
    Object.assign(FAMILY_PALETTES, EX.familyPalettes);
  }
  const PIECE_SET_KEYS = [];
  const ALL_FAMILIES = FAMILY_ORDER.concat(EX ? EX.order : []);      // 9 families x 3 colourways = 27 sets
  for (let j = 0; j < 3; j++) for (const f of ALL_FAMILIES) PIECE_SET_KEYS.push(f + j);
  // old preference values -> new keys
  const SET_ALIAS = { classic:'classic0', outline:'classic0', ivory:'classic1', ocean:'classic2', modern:'modern0', slate:'modern1', neon:'modern2', standard:'classic0', solid:'classic0' };
  function resolveSet(key) {
    if (PIECE_SET_KEYS.includes(key)) key = key;
    else key = SET_ALIAS[key] || 'classic0';
    const fam = key.slice(0, -1), pal = PALETTES[FAMILY_PALETTES[fam][+key.slice(-1)]];
    return { fam: FAMILIES[fam], pal: pal };
  }


  // CSS variables for square colors (read at render time)
  function sqColor(dark) {
    const s = getComputedStyle(document.documentElement);
    return dark ? s.getPropertyValue('--sq-dark').trim()
                : s.getPropertyValue('--sq-light').trim();
  }
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ── Global look (shared by every board) ──────────────────────────────────
  let _pieceSet = 'classic0';
  let _coordMode = 'outside';   // 'inside' | 'outside' (drawn in the margin of the svg) | 'none'
  const _boards = new Set();

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    const e = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    return e;
  }

  function drawPiece(parent, piece, gx, gy, setKey) {
    const R = resolveSet(setKey || _pieceSet), F = R.fam, P = R.pal;
    const isWhite = piece.color === 'w';
    const T = piece.type.toUpperCase();
    const fill = isWhite ? P.wf : P.bf, stroke = isWhite ? P.ws : P.bs, detail = isWhite ? P.wd : P.bd;
    const g = el('g', { transform: 'translate(' + (gx - 0.06) + ',' + (gy - 0.05) + ') scale(' + (1.12/45) + ')' });

    if (F.kind === 'paths') {
      const sh = F.shapes[T];
      for (const d of sh.body) g.appendChild(el('path', { d, fill, stroke, 'stroke-width': F.sw, 'stroke-linejoin': 'round' }));
      for (const d of sh.detail) g.appendChild(el('path', { d, fill: 'none', stroke: detail, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    } else if (F.kind === 'line') {
      const sh = F.shapes[T];
      const halo = isWhite ? P.ws : P.wf;           // contrasting halo so lines show on any square
      for (const d of sh.body) g.appendChild(el('path', { d, fill: 'none', stroke: halo, 'stroke-width': F.sw + 2.6, 'stroke-linejoin': 'round' }));
      for (const d of sh.body) g.appendChild(el('path', { d, fill: 'none', stroke: fill, 'stroke-width': F.sw, 'stroke-linejoin': 'round' }));
    }
    parent.appendChild(g);
  }

  // Generic small grid (settings preview, piece-set tiles).
  // grid: rows of cells {bg:'#hex', p:'wN'|null}; opts.coords = 'inside' | 'outside' | 'none'
  function renderGrid(svg, setKey, grid, opts) {
    opts = opts || {};
    const rows = grid.length, cols = grid[0].length;
    const mode = opts.coords || 'none';
    const m = mode === 'outside' ? 0.5 : 0;
    svg.setAttribute('viewBox', (-m) + ' 0 ' + (cols + m) + ' ' + (rows + m));
    svg.innerHTML = '';
    grid.forEach((row, r) => row.forEach((cell, cc) => {
      svg.appendChild(el('rect', { x: cc, y: r, width: 1, height: 1, fill: cell.bg }));
      if (cell.p) drawPiece(svg, { color: cell.p[0], type: cell.p[1] }, cc, r, setKey);
    }));
    if (mode === 'none') return;
    const ranks = opts.ranks || [], files = opts.files || [];
    const muted = cssVar('--muted') || '#999';
    for (let r = 0; r < rows; r++) {
      const t = el('text', mode === 'inside'
        ? { x: 0.07, y: r + 0.27, 'font-size': 0.25, 'font-weight': 700, fill: opts.contrast ? opts.contrast[(r % 2)] : '#888', 'font-family': 'sans-serif' }
        : { x: -0.25, y: r + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.3, 'font-weight': 700, fill: muted, 'font-family': 'sans-serif' });
      t.textContent = ranks[r]; svg.appendChild(t);
    }
    for (let k = 0; k < cols; k++) {
      const t = el('text', mode === 'inside'
        ? { x: k + 0.93, y: rows - 0.06, 'text-anchor': 'end', 'font-size': 0.25, 'font-weight': 700, fill: opts.contrast ? opts.contrast[((rows - 1 + k) % 2)] : '#888', 'font-family': 'sans-serif' }
        : { x: k + 0.5, y: rows + 0.3, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.3, 'font-weight': 700, fill: muted, 'font-family': 'sans-serif' });
      t.textContent = files[k]; svg.appendChild(t);
    }
  }

  // Static, non-interactive board (home-screen preview). lastMove = {from,to} is highlighted.
  function renderStatic(svg, fen, orientation, lastMove) {
    const ch = new Chess(fen);
    const board = ch.board();
    const light = sqColor(false), dark = sqColor(true);
    const mFrom = cssVar('--sq-move-from'), mTo = cssVar('--sq-move-to');
    svg.innerHTML = '';
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const file = orientation === 'white' ? gx : 7 - gx;
        const rank = orientation === 'white' ? 7 - gy : gy;
        const sq = String.fromCharCode(97 + file) + (rank + 1);
        const isDark = (file + rank) % 2 === 0;
        let col = isDark ? dark : light;
        if (lastMove && sq === lastMove.from) col = mFrom;
        if (lastMove && sq === lastMove.to)   col = mTo;
        svg.appendChild(el('rect', { x: gx, y: gy, width: 1, height: 1, fill: col }));
        const piece = board[7 - rank][file];
        if (piece) drawPiece(svg, piece, gx, gy);
      }
    }
  }


  // Static, non-interactive board (home preview). lastMove = {from,to} is highlighted.
  function renderStatic(svg, fen, orientation, lastMove) {
    const ch = new Chess(fen);
    const board = ch.board();
    const light = sqColor(false), dark = sqColor(true);
    const mFrom = cssVar('--sq-move-from'), mTo = cssVar('--sq-move-to');
    svg.innerHTML = '';
    for (let gy = 0; gy < 8; gy++) {
      for (let gx = 0; gx < 8; gx++) {
        const file = orientation === 'white' ? gx : 7 - gx;
        const rank = orientation === 'white' ? 7 - gy : gy;
        const sq = String.fromCharCode(97 + file) + (rank + 1);
        const isDark = (file + rank) % 2 === 0;
        let col = isDark ? dark : light;
        if (lastMove && sq === lastMove.from) col = mFrom;
        if (lastMove && sq === lastMove.to)   col = mTo;
        svg.appendChild(el('rect', { x: gx, y: gy, width: 1, height: 1, fill: col }));
        const piece = board[7 - rank][file];
        if (piece) drawPiece(svg, piece, gx, gy);
      }
    }
  }

  // ── Interactive / display board (one instance per <svg>) ─────────────────
  // The board never owns the rules: the game gives it a chess.js instance (setChess) and handles every move.
  function create(svgEl) {
    const B = {
      svg: svgEl, chess: null, orient: 'white',
      sel: null, targets: [], last: null, arrows: [], hintSq: null,
      mover: null,            // 'w' | 'b' | 'both' | null: which side the user may move
      showLegal: true,
      locked: false, onMove: null, anim: null, animTimer: 0,
    };
    _boards.add(B);

    const sqXY = sq => {
      const f = sq.charCodeAt(0) - 97, r = parseInt(sq[1], 10) - 1;
      return B.orient === 'white' ? { x: f, y: 7 - r } : { x: 7 - f, y: r };
    };
    const xySq = (x, y) => {
      const file = B.orient === 'white' ? x : 7 - x, rank = B.orient === 'white' ? 7 - y : y;
      return (file < 0 || file > 7 || rank < 0 || rank > 7) ? null : String.fromCharCode(97 + file) + (rank + 1);
    };

    function drawArrow(a) {
      const p = sqXY(a.from), q = sqXY(a.to);
      const x1 = p.x + 0.5, y1 = p.y + 0.5, x2 = q.x + 0.5, y2 = q.y + 0.5;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const head = 0.34, w = 0.13, tipX = x2 - ux * 0.06, tipY = y2 - uy * 0.06;
      const bx = tipX - ux * head, by = tipY - uy * head;
      const g = el('g', { opacity: a.opacity || 0.82 });
      g.appendChild(el('line', { x1: x1 + ux * 0.18, y1: y1 + uy * 0.18, x2: bx, y2: by, stroke: a.color, 'stroke-width': w, 'stroke-linecap': 'round' }));
      g.appendChild(el('polygon', { points: [tipX, tipY, bx - uy * 0.2, by + ux * 0.2, bx + uy * 0.2, by - ux * 0.2].join(','), fill: a.color }));
      B.svg.appendChild(g);
    }

    function render() {
      const svg = B.svg;
      if (!svg || !B.chess) return;
      svg.innerHTML = '';
      const out = _coordMode === 'outside', m = out ? 0.42 : 0;
      B.vb = { x: -m, y: 0, w: 8 + m, h: 8 + m };
      svg.setAttribute('viewBox', B.vb.x + ' 0 ' + B.vb.w + ' ' + B.vb.h);
      const board = B.chess.board();
      const lightColor = sqColor(false), darkColor = sqColor(true);
      const selColor = cssVar('--sq-sel'), hintColor = cssVar('--sq-hint');
      const mFrom = cssVar('--sq-move-from'), mTo = cssVar('--sq-move-to'), legalColor = cssVar('--sq-legal');
      const checkSq = B.chess.isCheck() ? kingSquare(B.chess, B.chess.turn()) : null;
      const hideSq = B.anim ? B.anim.to : null;
      for (let gy = 0; gy < 8; gy++) {
        for (let gx = 0; gx < 8; gx++) {
          const sq = xySq(gx, gy);
          const file = sq.charCodeAt(0) - 97, rank = parseInt(sq[1], 10) - 1;
          const piece = board[7 - rank][file];
          const isDark = (file + rank) % 2 === 0;
          let fill = isDark ? darkColor : lightColor;
          if (B.last && (sq === B.last.from)) fill = mFrom;
          if (B.last && (sq === B.last.to)) fill = mTo;
          if (sq === B.sel) fill = selColor;
          if (sq === B.hintSq) fill = hintColor;
          svg.appendChild(el('rect', { x: gx, y: gy, width: 1, height: 1, fill }));
          if (sq === checkSq) svg.appendChild(el('circle', { cx: gx + 0.5, cy: gy + 0.5, r: 0.52, fill: 'rgba(235,40,40,0.55)' }));
          if (piece && sq !== hideSq) drawPiece(svg, piece, gx, gy);
          if (_coordMode === 'inside') {
            if (gx === 0) {
              const c = el('text', { x: gx + 0.07, y: gy + 0.25, 'font-size': '0.2', fill: isDark ? lightColor : darkColor, 'font-weight': '700', 'font-family': '-apple-system,sans-serif' });
              c.textContent = B.orient === 'white' ? (8 - gy) : (gy + 1);
              svg.appendChild(c);
            }
            if (gy === 7) {
              const c = el('text', { x: gx + 0.93, y: gy + 0.96, 'text-anchor': 'end', 'font-size': '0.2', fill: isDark ? lightColor : darkColor, 'font-weight': '700', 'font-family': '-apple-system,sans-serif' });
              c.textContent = String.fromCharCode(97 + (B.orient === 'white' ? gx : 7 - gx));
              svg.appendChild(c);
            }
          }
        }
      }
      if (out) {
        const muted = cssVar('--muted') || '#999';
        for (let i = 0; i < 8; i++) {
          const r = el('text', { x: -0.21, y: i + 0.5, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.3, 'font-weight': 700, fill: muted, 'font-family': '-apple-system,sans-serif' });
          r.textContent = B.orient === 'white' ? (8 - i) : (i + 1); svg.appendChild(r);
          const f = el('text', { x: i + 0.5, y: 8.22, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 0.3, 'font-weight': 700, fill: muted, 'font-family': '-apple-system,sans-serif' });
          f.textContent = String.fromCharCode(97 + (B.orient === 'white' ? i : 7 - i)); svg.appendChild(f);
        }
      }
      if (B.showLegal) for (const t of B.targets) {
        const p = sqXY(t), r = B.chess.get(t);
        if (r) svg.appendChild(el('circle', { cx: p.x + 0.5, cy: p.y + 0.5, r: 0.46, fill: 'none', stroke: legalColor, 'stroke-width': 0.08 }));
        else svg.appendChild(el('circle', { cx: p.x + 0.5, cy: p.y + 0.5, r: 0.15, fill: legalColor }));
      }
      for (const a of B.arrows) drawArrow(a);
      if (B.anim) {    // the sliding piece sits on top and moves to its square via a CSS transition
        const a = B.anim, p = sqXY(a.from), q = sqXY(a.to);
        const wrap = el('g');
        wrap.style.transform = 'translate(' + (p.x - q.x) + 'px,' + (p.y - q.y) + 'px)';
        drawPiece(wrap, a.piece, q.x, q.y);
        svg.appendChild(wrap);
        void wrap.getBoundingClientRect();
        wrap.style.transition = 'transform 170ms ease-out';
        requestAnimationFrame(() => { wrap.style.transform = 'translate(0px,0px)'; });
      }
    }

    function kingSquare(ch, color) {
      const b = ch.board();
      for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) { const p = b[r][f]; if (p && p.type === 'k' && p.color === color) return String.fromCharCode(97 + f) + (8 - r); }
      return null;
    }

    function canMove(color) { return !B.locked && B.mover && (B.mover === 'both' || B.mover === color); }

    function onTap(clientX, clientY) {
      if (!B.chess || B.locked) return;
      const rect = B.svg.getBoundingClientRect();
      const vb = B.vb || { x: 0, y: 0, w: 8, h: 8 };
      const sq = xySq(Math.floor((clientX - rect.left) / rect.width * vb.w + vb.x), Math.floor((clientY - rect.top) / rect.height * vb.h + vb.y));
      if (!sq) return;
      if (B.sel) {
        if (B.targets.includes(sq)) {
          const from = B.sel, to = sq, piece = B.chess.get(from);
          let promo = false;
          if (piece && piece.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))) promo = true;
          B.sel = null; B.targets = []; render();
          if (B.onMove) B.onMove(from, to, promo);
          return;
        }
        B.sel = null; B.targets = [];
      }
      const piece = B.chess.get(sq);
      if (piece && piece.color === B.chess.turn() && canMove(piece.color)) {
        B.sel = sq;
        B.targets = B.chess.moves({ square: sq, verbose: true }).map(m => m.to);
      }
      render();
    }
    let _downX = 0, _downY = 0;
    svgEl.addEventListener('pointerdown', e => { _downX = e.clientX; _downY = e.clientY; });
    svgEl.addEventListener('pointerup', e => {
      if (e.button > 0) return;
      if (Math.hypot(e.clientX - _downX, e.clientY - _downY) > 14) return;   // a swipe, not a tap
      onTap(e.clientX, e.clientY);
    });

    Object.assign(B, {
      render,
      setChess(ch) { B.chess = ch; B.sel = null; B.targets = []; B.anim = null; B.arrows = []; B.hintSq = null; B.last = null; render(); },
      setOrientation(o) { B.orient = o === 'black' ? 'black' : 'white'; render(); },
      flip() { B.orient = B.orient === 'white' ? 'black' : 'white'; render(); },
      getOrientation() { return B.orient; },
      setLast(from, to) { B.last = from ? { from, to } : null; },
      setArrows(list) { B.arrows = list || []; render(); },
      setHintSquare(sq) { B.hintSq = sq || null; render(); },
      setMover(m) { B.mover = m; B.sel = null; B.targets = []; },
      setShowLegal(v) { B.showLegal = !!v; render(); },
      setLocked(v) { B.locked = !!v; if (v) { B.sel = null; B.targets = []; } },
      clearSelection() { B.sel = null; B.targets = []; },
      // Call AFTER the move was made in chess.js: the piece slides from -> to.
      slide(from, to, piece, ms) {
        clearTimeout(B.animTimer);
        B.anim = { from, to, piece };
        render();
        B.animTimer = setTimeout(() => { B.anim = null; render(); }, ms || 190);
      },
      destroy() { _boards.delete(B); },
    });
    return B;
  }

  function setPieceSet(k) { _pieceSet = PIECE_SET_KEYS.includes(k) ? k : (SET_ALIAS[k] || 'classic0'); _boards.forEach(b => b.render()); }
  function setCoordMode(m) { _coordMode = m; _boards.forEach(b => b.render()); }
  function renderAll() { _boards.forEach(b => b.render()); }

  return {
    create, renderStatic, renderGrid, setPieceSet, setCoordMode, renderAll, PIECE_SET_KEYS,
    drawPieceTo: (parent, color, type, x, y, setKey) => drawPiece(parent, { color, type }, x, y, setKey),
  };

})();
