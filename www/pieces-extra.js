/**
 * pieces-extra.js — 8 more self-drawn piece families (24 more sets). All shapes drawn for this app.
 * Loaded before chess-core.js, which merges them. Shapes live in a 45×45 box; the base line is y≈36–40.
 */
'use strict';
(function () {
  const BASE = 'M11 40 H34 V36 H11 Z';

  // Scale an absolute/relative SVG path (M L H V C Q Z a) horizontally about x=22.5 and vertically about y=40.
  function scalePath(d, sx, sy) {
    const tx = x => 22.5 + (x - 22.5) * sx, ty = y => 40 + (y - 40) * sy;
    const out = [], re = /([MLHVCQZa])([^MLHVCQZa]*)/g; let m;
    while ((m = re.exec(d))) {
      const c = m[1], n = (m[2].trim().match(/-?\d*\.?\d+/g) || []).map(Number);
      if (c === 'Z') out.push('Z');
      else if (c === 'H') out.push('H' + n.map(tx).map(r2).join(' '));
      else if (c === 'V') out.push('V' + n.map(ty).map(r2).join(' '));
      else if (c === 'a') out.push('a' + [n[0] * sx, n[1] * sy, n[2], n[3], n[4], n[5] * sx, n[6] * sy].map(r2).join(' '));
      else { const p = []; for (let i = 0; i < n.length; i += 2) p.push(r2(tx(n[i])), r2(ty(n[i + 1]))); out.push(c + p.join(' ')); }
    }
    return out.join(' ');
  }
  function r2(v) { return Math.round(v * 100) / 100; }
  function derive(fam, sx, sy, sw) {
    const shapes = {};
    for (const T of Object.keys(fam.shapes)) shapes[T] = { body: fam.shapes[T].body.map(d => scalePath(d, sx, sy)), detail: fam.shapes[T].detail.map(d => scalePath(d, sx, sy)) };
    return { kind: 'paths', sw: sw || fam.sw, shapes };
  }

  const staunton = { kind: 'paths', sw: 1.6, shapes: {
    P: { body: ['M22.5 6 a5.2 5.2 0 1 0 0.01 0 Z', 'M17.5 18 H27.5 L26.5 21.5 H18.5 Z', 'M18.5 21.5 C18.5 28 15.5 31 14.5 35 H30.5 C29.5 31 26.5 28 26.5 21.5 Z', 'M12 35 H33 V40 H12 Z'], detail: [] },
    R: { body: ['M13 6 H18 V10.5 H20.5 V6 H24.5 V10.5 H27 V6 H32 V15 H13 Z', 'M15.5 15 H29.5 L28 19 H17 Z', 'M17 19 H28 L30 33.5 H15 Z', 'M12 33.5 H33 V40 H12 Z'], detail: ['M15 15 H30'] },
    N: { body: ['M14 35 C14 28 16.5 24 20 20.5 C17 21 14.5 23 12 26 L8.5 22.5 C10.5 16 15 11 21 8.5 L21.5 3.5 L25.5 7.5 C33.5 9.5 36.5 18.5 34.5 28 C34 31 33.5 33 33.5 35 Z', 'M12 35 H35 V40 H12 Z'], detail: ['M26 13.5 L26.1 13.6', 'M20 12 C24 11.5 28 14 29 19', 'M12.5 23.5 L16 25'] },
    B: { body: ['M22.5 2.5 a3 3 0 1 0 0.01 0 Z', 'M22.5 8 C29.5 13 30.5 19.5 26.5 24.5 L28 29.5 H17 L18.5 24.5 C14.5 19.5 15.5 13 22.5 8 Z', 'M16 29.5 H29 V32.5 H16 Z', 'M13.5 32.5 H31.5 L33 40 H12 Z'], detail: ['M19 14.5 L26 21.5', 'M22.5 12 V17'] },
    Q: { body: ['M22.5 2.5 a2.6 2.6 0 1 0 0.01 0 Z', 'M13 7.5 a2.4 2.4 0 1 0 0.01 0 Z', 'M32 7.5 a2.4 2.4 0 1 0 0.01 0 Z', 'M12 33 L10 12 L17 22 L20 10 L22.5 21 L25 10 L28 22 L35 12 L33 33 Z', 'M12 33 H33 V40 H12 Z'], detail: ['M14 28 H31'] },
    K: { body: ['M20.8 1.5 H24.2 V4.5 H27.2 V7.8 H24.2 V11 H20.8 V7.8 H17.8 V4.5 H20.8 Z', 'M17 11 H28 L28.5 14 H16.5 Z', 'M16 14 C14 20 12.5 28 12 33 H33 C32.5 28 31 20 29 14 Z', 'M12 33 H33 V40 H12 Z'], detail: ['M15 24 H30'] },
  } };

  const gothic = { kind: 'paths', sw: 1.6, shapes: {
    P: { body: ['M22.5 4 L28 13 L24.5 18 L29.5 35 H15.5 L20.5 18 L17 13 Z', BASE], detail: [] },
    R: { body: ['M13 36 V9 L16.5 5.5 V11.5 H20 V5.5 H25 V11.5 H28.5 V5.5 L32 9 V36 Z', BASE], detail: ['M13 21 H32', 'M22.5 24 V33'] },
    N: { body: ['M12 36 L14 26 L8 24.5 L12.5 14 L19 8 L20.5 2.5 L25 7.5 L31 11.5 L34.5 22 L33.5 36 Z', BASE], detail: ['M24.5 13 L24.6 13.1', 'M14 21 L18 18'] },
    B: { body: ['M22.5 1.5 L30 16 L26 22 L29 33 H16 L19 22 L15 16 Z', 'M12.5 36 L16 33 H29 L32.5 36 Z', BASE], detail: ['M22.5 8 V14', 'M19.5 11 H25.5'] },
    Q: { body: ['M10 36 L7.5 9 L15 19 L18 5 L22.5 17 L27 5 L30 19 L37.5 9 L35 36 Z', BASE], detail: ['M13 31 H32'] },
    K: { body: ['M21 0.8 H24 V4.5 H27.5 V7.5 H24 V11 L33 19.5 L31.5 36 H13.5 L12 19.5 L21 11 V7.5 H17.5 V4.5 H21 Z', BASE], detail: ['M14 29 H31'] },
  } };

  // Drawn from the classic family and stretched: tall & thin / short & wide. The classic shapes are read lazily
  // from window.CHESS_CLASSIC_SHAPES (set by chess-core.js) so we don't duplicate them here.
  function lateFamilies(classicShapes, roundShapes) {
    return {
      slim:   derive({ sw: 1.5, shapes: classicShapes }, 0.78, 1.06, 1.5),
      chunky: derive({ sw: 2.0, shapes: roundShapes }, 1.1, 0.94, 2.0),
    };
  }

  window.CHESS_EXTRA_PIECES = {
    order: ['staunton', 'gothic', 'slim', 'chunky', 'heavy'],
    families: { staunton, gothic },
    late: lateFamilies,          // slim + chunky + heavy are finished by chess-core.js
    palettes: {
      forest: { wf: '#e4f3d4', bf: '#2c5a2a', ws: '#234a22', bs: '#0f2610', wd: '#234a22', bd: '#d6edc0' },
      sunset: { wf: '#ffe2b8', bf: '#b5412a', ws: '#8a2e1a', bs: '#4a150b', wd: '#8a2e1a', bd: '#ffe2b8' },
      steel:  { wf: '#e6ecf5', bf: '#2f3b52', ws: '#26324a', bs: '#10182a', wd: '#26324a', bd: '#e6ecf5' },
    },
    familyPalettes: {
      staunton: ['neutral', 'walnut', 'forest'],
      gothic:   ['neutral', 'ruby', 'steel'],
      slim:     ['neutral', 'ivory', 'lavender'],
      chunky:   ['neutral', 'mint', 'gold'],
      heavy:    ['neutral', 'sunset', 'steel'],
    },
  };
})();
