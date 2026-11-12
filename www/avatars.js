/**
 * avatars.js — original, drawn-for-this-app cartoon portraits of people and simplified SVG country flags.
 * Nothing here is copied from any other app. Released under the GNU GPL v3 (see LICENSE).
 *
 *   Avatars.portrait(spec, size)  -> '<svg class="botAvatar" ...>'
 *   Avatars.flag(cc, h)           -> '<svg class="flag" ...>'
 */
'use strict';

window.Avatars = (function () {
  const SKIN = ['#f8d9bf', '#efc29b', '#dfa678', '#c68656', '#9a643e', '#6d4328'];
  const HAIR = { black: '#1b1714', dkbrown: '#35220f', brown: '#6a4424', auburn: '#8c3f1e', red: '#b5481f', blond: '#d3a548', lblond: '#e6cc86', grey: '#a9a9a9', white: '#e9e9e9' };
  const EYE = { brown: '#4a2c17', dark: '#1f1612', blue: '#3b78b5', green: '#3f8a5a', grey: '#6c7c8a' };
  let uid = 0;

  function shade(hex, k) {   // k < 0 darker, k > 0 lighter
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    r = f(r); g = f(g); b = f(b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  /** spec: { skin:0-5, hair:style, hc:colour key, beard, glasses, top:'#hex', collar, bg:'#hex', eye, eyes:'round'|'narrow', mouth, brow, hat, hatc:'#hex' } */
  function portrait(spec, size) {
    const id = 'av' + (uid++);
    const skin = SKIN[spec.skin == null ? 1 : spec.skin], skinD = shade(skin, -0.2), skinDD = shade(skin, -0.38);
    const hc = HAIR[spec.hc || 'dkbrown'], hcD = shade(hc, -0.28);
    const eyeC = EYE[spec.eye || 'brown'];
    const top = spec.top || '#3a6ea5', topD = shade(top, -0.25), topL = shade(top, 0.25);
    const hat = spec.hat || null, hatc = spec.hatc || '#c0392b', hatD = shade(hatc, -0.25);
    const hair = spec.hair || 'short';
    const B = [], F = [], H = [];   // back layer, face layer, hair/hat layer
    // ── background ─────────────────────────────────────────────────────
    B.push(`<rect width="100" height="100" fill="${spec.bg || '#2d4a7a'}"/>`);
    // ── hair behind the head ───────────────────────────────────────────
    if (hair === 'long') B.push(`<path d="M23 44C20 18 36 8 50 8C64 8 80 18 77 44C79 62 83 78 86 94L14 94C17 78 21 62 23 44Z" fill="${hc}"/>`);
    if (hair === 'bob') B.push(`<path d="M23 44C20 18 36 8 50 8C64 8 80 18 77 44L78 68C72 73 65 69 63 63L37 63C35 69 28 73 22 68Z" fill="${hc}"/>`);
    if (hair === 'ponytail') B.push(`<path d="M67 24C89 18 98 46 86 70C82 56 77 46 70 40Z" fill="${hc}"/><circle cx="69" cy="27" r="3" fill="${spec.top || '#3a6ea5'}"/>`);
    if (hair === 'afro') B.push(`<circle cx="50" cy="35" r="30" fill="${hc}"/><circle cx="29" cy="46" r="9" fill="${hc}"/><circle cx="71" cy="46" r="9" fill="${hc}"/>`);
    if (hair === 'bun') B.push(`<circle cx="50" cy="9" r="9" fill="${hc}"/>`);
    // ── body ───────────────────────────────────────────────────────────
    B.push(`<path d="M4 100C6 82 24 75 50 75C76 75 94 82 96 100Z" fill="${top}"/>`);
    const col = spec.collar || 'tee';
    if (col === 'hoodie') B.push(`<path d="M22 82C26 70 38 66 50 66C62 66 74 70 78 82C70 76 60 74 50 74C40 74 30 76 22 82Z" fill="${topD}"/><path d="M44 78V90M56 78V90" stroke="${topL}" stroke-width="1.6" stroke-linecap="round"/>`);
    B.push(`<path d="M42 60H58V76Q50 83 42 76Z" fill="${skinD}"/>`);
    if (col === 'tee') B.push(`<path d="M40 75Q50 86 60 75Q50 80 40 75Z" fill="${skinD}"/>`);
    if (col === 'v') B.push(`<path d="M39 75L50 92L61 75Q50 81 39 75Z" fill="${skinD}"/>`);
    if (col === 'shirt') B.push(`<path d="M38 74L50 90L40 96L30 80Z" fill="#f4f4f4"/><path d="M62 74L50 90L60 96L70 80Z" fill="#e4e4e4"/><path d="M50 78L46 86L50 100L54 86Z" fill="${spec.tie || '#b03a48'}"/>`);
    if (col === 'jacket') B.push(`<path d="M36 76L50 98L40 100L26 82Z" fill="${topD}"/><path d="M64 76L50 98L60 100L74 82Z" fill="${topD}"/><path d="M42 76L50 92L58 76Q50 82 42 76Z" fill="#f2f2f2"/>`);
    if (col === 'bow') { const bt = spec.tie || '#16161c'; B.push(`<path d="M36 76L50 98L40 100L26 82Z" fill="${topD}"/><path d="M64 76L50 98L60 100L74 82Z" fill="${topD}"/><path d="M42 74L50 96L58 74Q50 80 42 74Z" fill="#f4f4f4"/><path d="M42.5 70.5L38.5 78L49.5 82Z" fill="#fff"/><path d="M57.5 70.5L61.5 78L50.5 82Z" fill="#fff"/><path d="M50 80L40 75L40 85.5Z" fill="${bt}"/><path d="M50 80L60 75L60 85.5Z" fill="${bt}"/><rect x="47.4" y="77.4" width="5.2" height="5.4" rx="1.6" fill="${shade(bt, 0.28)}"/>`); }
    // ── hijab / scarf behind the face ─────────────────────────────────
    if (hat === 'hijab') B.push(`<path d="M17 56C13 22 33 8 50 8C67 8 87 22 83 56C84 76 76 90 68 98L32 98C24 90 16 76 17 56Z" fill="${hatc}"/><path d="M20 70C28 86 40 94 50 94C60 94 72 86 80 70" fill="none" stroke="${hatD}" stroke-width="1.4" opacity=".6"/>`);
    // ── ears and face ──────────────────────────────────────────────────
    F.push(`<circle cx="24.5" cy="50" r="5" fill="${skin}"/><circle cx="75.5" cy="50" r="5" fill="${skin}"/><circle cx="24.5" cy="50" r="2.2" fill="${skinD}"/><circle cx="75.5" cy="50" r="2.2" fill="${skinD}"/>`);
    F.push(`<path d="M26 44C26 26 37 17 50 17C63 17 74 26 74 44C74 63 64 77 50 77C36 77 26 63 26 44Z" fill="${skin}"/>`);
    F.push(`<path d="M30 60C34 72 42 77 50 77C58 77 66 72 70 60C64 70 58 73 50 73C42 73 36 70 30 60Z" fill="${skinD}" opacity=".35"/>`);
    F.push(`<circle cx="35" cy="59" r="5" fill="#e0675f" opacity=".16"/><circle cx="65" cy="59" r="5" fill="#e0675f" opacity=".16"/>`);
    // ── beard (under mouth/nose) ───────────────────────────────────────
    const beard = spec.beard || 'none';
    if (beard === 'full') F.push(`<path d="M26 46C26 66 36 80 50 80C64 80 74 66 74 46C71 58 63 62 57 62C54 60 46 60 43 62C37 62 29 58 26 46Z" fill="${hc}"/><ellipse cx="50" cy="67.5" rx="8.5" ry="4" fill="${skinDD}"/>`);
    if (beard === 'short') F.push(`<path d="M27 54C27 68 36 77 50 77C64 77 73 68 73 54C70 63 63 64 57 63C54 61 46 61 43 63C37 64 30 63 27 54Z" fill="${hc}" opacity=".95"/><ellipse cx="50" cy="67.5" rx="8" ry="3.8" fill="${skinDD}"/>`);
    if (beard === 'stubble') F.push(`<path d="M27 52C27 68 36 77 50 77C64 77 73 68 73 52C70 62 62 64 50 64C38 64 30 62 27 52Z" fill="${hc}" opacity=".22"/>`);
    // ── eyes ───────────────────────────────────────────────────────────
    const narrow = spec.eyes === 'narrow', ry = narrow ? 2.9 : 4.2;
    for (const x of [39.5, 60.5]) {
      F.push(`<ellipse cx="${x}" cy="47" rx="4.6" ry="${ry}" fill="#fff"/><circle cx="${x}" cy="47.2" r="${narrow ? 2.5 : 2.9}" fill="${eyeC}"/><circle cx="${x}" cy="47.2" r="1.25" fill="#0d0907"/><circle cx="${x + 0.9}" cy="46.2" r=".8" fill="#fff"/>`);
      F.push(`<path d="M${x - 5.2} ${47.4 - ry * 0.55}Q${x} ${47 - ry * 1.55} ${x + 5.2} ${47.4 - ry * 0.55}" fill="none" stroke="${skinDD}" stroke-width="1.5" stroke-linecap="round"/>`);
    }
    // eyebrows
    const bc = spec.hair === 'bald' && !spec.hc ? hcD : hcD, mood = spec.brow || 'friendly', bw = spec.thick ? 3 : 2.1;
    const bl = mood === 'stern' ? 'M34 38.5Q39.5 37.5 45.5 41' : mood === 'cheer' ? 'M34 39.5Q39.5 34.5 45 37' : 'M34 39.5Q39.5 36 45 38.5';
    const br = mood === 'stern' ? 'M66 38.5Q60.5 37.5 54.5 41' : mood === 'cheer' ? 'M66 39.5Q60.5 34.5 55 37' : 'M66 39.5Q60.5 36 55 38.5';
    F.push(`<path d="${bl}M0 0" fill="none" stroke="${bc}" stroke-width="${bw}" stroke-linecap="round"/><path d="${br}M0 0" fill="none" stroke="${bc}" stroke-width="${bw}" stroke-linecap="round"/>`);
    // nose
    F.push(`<path d="M50 49C48.6 54 46.6 57 48.6 59C49.6 60 51.6 60 52.6 59" fill="none" stroke="${skinDD}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>`);
    // mouth
    const mouth = spec.mouth || 'smile', lip = beard === 'full' || beard === 'short' ? '#f2b9a8' : '#7d3a33';
    if (mouth === 'smile') F.push(`<path d="M42 66Q50 73 58 66" fill="none" stroke="${lip}" stroke-width="1.9" stroke-linecap="round"/>`);
    if (mouth === 'grin') F.push(`<path d="M41 65Q50 67 59 65Q57 74 50 74Q43 74 41 65Z" fill="#7d2d2d"/><path d="M42.6 65.8Q50 67.4 57.4 65.8Q56.4 69 50 69Q43.6 69 42.6 65.8Z" fill="#fff"/>`);
    if (mouth === 'neutral') F.push(`<path d="M43.5 67.5H56.5" stroke="${lip}" stroke-width="1.9" stroke-linecap="round"/>`);
    if (mouth === 'smirk') F.push(`<path d="M43 68Q50 69.5 58 65.5" fill="none" stroke="${lip}" stroke-width="1.9" stroke-linecap="round"/>`);
    if (mouth === 'o') F.push(`<ellipse cx="50" cy="68" rx="3.6" ry="4" fill="#7d2d2d"/>`);
    // moustache / goatee (over the mouth region)
    if (beard === 'bigmoustache') F.push(`<path d="M36 64.5C40 58.5 47 60 50 63.2C53 60 60 58.5 64 64.5C61 70.5 55 67.6 50 66.4C45 67.6 39 70.5 36 64.5Z" fill="${hc}"/><path d="M40 63.5C44 61.5 47 62.5 49 64M60 63.5C56 61.5 53 62.5 51 64" stroke="${hcD}" stroke-width=".9" fill="none" opacity=".7"/>`);
    if (beard === 'moustache' || beard === 'goatee') F.push(`<path d="M41 63.5C44 60.5 48 61.5 50 63C52 61.5 56 60.5 59 63.5C55 66 45 66 41 63.5Z" fill="${hc}"/>`);
    if (beard === 'goatee') F.push(`<path d="M44.5 72C46.5 70 53.5 70 55.5 72C54.5 78 45.5 78 44.5 72Z" fill="${hc}"/>`);
    // glasses
    if (spec.glasses === 'round') F.push(`<g fill="#fff" fill-opacity=".14" stroke="#1d1d22" stroke-width="1.7"><circle cx="39.5" cy="47" r="7.4"/><circle cx="60.5" cy="47" r="7.4"/></g><path d="M46.9 46Q50 44 53.1 46M32.2 45.5L26.5 44.5M67.8 45.5L73.5 44.5" fill="none" stroke="#1d1d22" stroke-width="1.7" stroke-linecap="round"/>`);
    if (spec.glasses === 'square') F.push(`<g fill="#fff" fill-opacity=".14" stroke="#1d1d22" stroke-width="1.8"><rect x="31.5" y="41" width="16" height="12" rx="3"/><rect x="52.5" y="41" width="16" height="12" rx="3"/></g><path d="M47.5 45.5H52.5M31.5 44L26.5 43M68.5 44L73.5 43" fill="none" stroke="#1d1d22" stroke-width="1.8" stroke-linecap="round"/>`);
    // ── hair in front / hats ───────────────────────────────────────────
    const fringe = {
      short: `<path d="M25 44C22 24 34 12 50 12C66 12 78 24 75 44C73 36 70 31 64 29C56 33 42 33 34 29C30 32 27 37 25 44Z" fill="${hc}"/>`,
      side: `<path d="M25 46C21 22 36 11 52 12C68 13 79 25 75 44C73 35 68 29 60 27C50 31 38 31 31 36C28 38 26 41 25 46Z" fill="${hc}"/><path d="M45 13C43 20 39 25 33 28" fill="none" stroke="${hcD}" stroke-width="1.2" opacity=".7"/>`,
      buzz: `<path d="M26 43C24 25 36 15 50 15C64 15 76 25 74 43C72 35 66 31 50 31C34 31 28 35 26 43Z" fill="${hc}" opacity=".6"/>`,
      long: `<path d="M25 46C21 22 36 10 50 10C64 10 79 22 75 46C70 34 62 26 52 25C44 31 32 36 25 46Z" fill="${hc}"/>`,
      bob: `<path d="M25 42C23 22 35 11 50 11C65 11 77 22 75 42C72 34 64 30 50 30C36 30 28 34 25 42Z" fill="${hc}"/><path d="M26 40C34 33 66 33 74 40L74 31C66 25 34 25 26 31Z" fill="${hc}"/>`,
      curly: [[30, 30], [38, 21], [50, 18], [62, 21], [70, 30], [27, 41], [73, 41], [44, 25], [56, 25]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="8.5" fill="${hc}"/>`).join(''),
      afro: `<path d="M29 36C32 24 42 19 50 19C58 19 68 24 71 36C65 29 58 27 50 27C42 27 35 29 29 36Z" fill="${hc}"/>`,
      slick: `<path d="M25 46C21 22 36 10 52 11C68 12 79 24 75 46C74 36 70 28 62 24C52 21 40 23 32 29C28 33 26 40 25 46Z" fill="${hc}"/><path d="M36 20C46 15 58 15 68 21M32 26C44 20 58 20 70 28" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".2"/>`,
      recede: `<path d="M25 48C20 32 26 20 36 16C32 24 30.5 34 31 46Z" fill="${hc}"/><path d="M75 48C80 32 74 20 64 16C68 24 69.5 34 69 46Z" fill="${hc}"/><path d="M37 19C43 13 57 13 63 19C57 16.5 43 16.5 37 19Z" fill="${hc}" opacity=".85"/><ellipse cx="46" cy="22" rx="9" ry="3.2" fill="#fff" opacity=".22"/>`,
      wave: [[34, 19, 9], [46, 13, 10], [58, 14, 10], [69, 22, 8], [28, 28, 7]].map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="${hc}"/>`).join('') + `<path d="M25 44C21 24 30 18 38 19C56 17 72 20 75 44C74 33 68 27 58 25C46 22 36 26 31 33C28 36 26 40 25 44Z" fill="${hc}"/><path d="M34 21C40 17 46 21 52 17C58 14 64 19 70 20" fill="none" stroke="${hcD}" stroke-width="1.3" stroke-linecap="round" opacity=".8"/>`,
      baldside: `<path d="M26 40C24 46 25 52 28 55C28 49 28 44 28.5 40Z" fill="${hc}"/><path d="M74 40C76 46 75 52 72 55C72 49 72 44 71.5 40Z" fill="${hc}"/><ellipse cx="44" cy="25" rx="8" ry="3.4" fill="#fff" opacity=".25"/>`,
      bald: `<ellipse cx="44" cy="25" rx="8" ry="3.4" fill="#fff" opacity=".25"/>`,
    };
    if (hair === 'ponytail' || hair === 'bun') H.push(fringe.side);
    else if (hair === 'long') H.push(fringe.long);
    else if (fringe[hair] && hat !== 'hijab') H.push(fringe[hair]);
    if (hat === 'cap') H.push(`<path d="M24 38C24 19 36 11 50 11C64 11 76 19 76 38Z" fill="${hatc}"/><path d="M31 37H85C87 43 78 45 70 43H31Z" fill="${hatD}"/><circle cx="50" cy="11.5" r="2.2" fill="${hatD}"/>`);
    if (hat === 'beanie') H.push(`<path d="M24 38C24 15 37 8 50 8C63 8 76 15 76 38Z" fill="${hatc}"/><rect x="22.5" y="31" width="55" height="10" rx="5" fill="${hatD}"/><circle cx="50" cy="7" r="5" fill="${shade(hatc, 0.2)}"/>`);
    if (hat === 'hijab') H.push(`<path d="M27 38C28 24 38 17 50 17C62 17 72 24 73 38C66 28 58 25 50 25C42 25 34 28 27 38Z" fill="${hatc}"/><path d="M27 38C34 28 42 25 50 25C58 25 66 28 73 38" fill="none" stroke="${hatD}" stroke-width="1.2" opacity=".7"/>`);
    if (hat === 'turban') H.push(`<path d="M24 38C22 16 36 7 50 7C64 7 78 16 76 38C70 30 62 27 50 27C38 27 30 30 24 38Z" fill="${hatc}"/><path d="M30 27C42 21 58 21 70 27M27 33C40 26 60 26 73 33" fill="none" stroke="${hatD}" stroke-width="1.6"/>`);
    if (spec.ring) H.push(`<circle cx="50" cy="50" r="47.6" fill="none" stroke="#d9b13b" stroke-width="4.4"/><circle cx="50" cy="50" r="45.2" fill="none" stroke="#fff3b0" stroke-width=".8" opacity=".6"/>`);
    const s = size ? ` width="${size}" height="${size}"` : '';
    return `<svg class="botAvatar" viewBox="0 0 100 100"${s} xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#${id})">${B.join('')}${F.join('')}${H.join('')}</g></svg>`;
  }

  // ── Flags (simplified, 30 x 20) ──────────────────────────────────────────
  const star = (cx, cy, R, fill, rot) => {
    const pts = [];
    for (let i = 0; i < 10; i++) { const a = (rot == null ? -90 : rot) + i * 36, r = i % 2 ? R * 0.382 : R; pts.push((cx + r * Math.cos(a * Math.PI / 180)).toFixed(2) + ',' + (cy + r * Math.sin(a * Math.PI / 180)).toFixed(2)); }
    return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
  };
  const H3 = (a, b, c, w) => { w = w || [1, 1, 1]; const t = w[0] + w[1] + w[2], h1 = 20 * w[0] / t, h2 = 20 * w[1] / t; return `<rect width="30" height="${h1}" fill="${a}"/><rect y="${h1}" width="30" height="${h2}" fill="${b}"/><rect y="${h1 + h2}" width="30" height="${20 - h1 - h2}" fill="${c}"/>`; };
  const V3 = (a, b, c, w) => { w = w || [1, 1, 1]; const t = w[0] + w[1] + w[2], w1 = 30 * w[0] / t, w2 = 30 * w[1] / t; return `<rect width="${w1}" height="20" fill="${a}"/><rect x="${w1}" width="${w2}" height="20" fill="${b}"/><rect x="${w1 + w2}" width="${30 - w1 - w2}" height="20" fill="${c}"/>`; };
  const UJ = `<rect width="30" height="20" fill="#012169"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="3.6"/><path d="M0 0L30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.2"/><rect x="12" width="6" height="20" fill="#fff"/><rect y="7" width="30" height="6" fill="#fff"/><rect x="13" width="4" height="20" fill="#c8102e"/><rect y="8" width="30" height="4" fill="#c8102e"/>`;
  const cross = (bg, fg, x, w, y, h) => `<rect width="30" height="20" fill="${bg}"/><rect x="${x}" width="${w}" height="20" fill="${fg}"/><rect y="${y}" width="30" height="${h}" fill="${fg}"/>`;
  const FLAGS = {
    BG: () => H3('#ffffff', '#00966e', '#d62612'),
    TR: () => `<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5.2" fill="#fff"/><circle cx="12.5" cy="10" r="4.2" fill="#e30a17"/>${star(17, 10, 2.4, '#fff')}`,
    AR: () => H3('#74acdf', '#ffffff', '#74acdf') + `<circle cx="15" cy="10" r="2.3" fill="#f6b40e"/>`,
    JP: () => `<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>`,
    CZ: () => H3('#ffffff', '#ffffff', '#d7141a', [1, 0, 1]).replace(/<rect y="10"[^>]*\/>/, '') + `<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#d7141a"/><polygon points="0,0 15,10 0,20" fill="#11457e"/>`,
    NG: () => V3('#008751', '#ffffff', '#008751'),
    SE: () => cross('#006aa7', '#fecc00', 8.5, 3.4, 8.3, 3.4),
    IN: () => H3('#ff9933', '#ffffff', '#138808') + `<circle cx="15" cy="10" r="2.5" fill="none" stroke="#000080" stroke-width=".6"/><circle cx="15" cy="10" r=".6" fill="#000080"/>`,
    BR: () => `<rect width="30" height="20" fill="#009c3b"/><polygon points="15,2 27.5,10 15,18 2.5,10" fill="#ffdf00"/><circle cx="15" cy="10" r="4.3" fill="#002776"/><path d="M10.9 9.2Q15 8 19.1 11" fill="none" stroke="#fff" stroke-width="1"/>`,
    GR: () => { let s = ''; for (let i = 0; i < 9; i++) s += `<rect y="${(i * 20 / 9).toFixed(2)}" width="30" height="${(20 / 9 + 0.05).toFixed(2)}" fill="${i % 2 ? '#fff' : '#0d5eaf'}"/>`; return s + `<rect width="11.1" height="11.2" fill="#0d5eaf"/><rect x="4.4" width="2.3" height="11.2" fill="#fff"/><rect y="4.4" width="11.1" height="2.3" fill="#fff"/>`; },
    IT: () => V3('#009246', '#ffffff', '#ce2b37'),
    DE: () => H3('#000000', '#dd0000', '#ffce00'),
    FR: () => V3('#0055a4', '#ffffff', '#ef4135'),
    PL: () => H3('#ffffff', '#dc143c', '#dc143c', [1, 1, 0]).replace(/<rect y="20"[^>]*\/>/, ''),
    EG: () => H3('#ce1126', '#ffffff', '#000000') + `<circle cx="15" cy="10" r="2" fill="#c09300"/>`,
    IE: () => V3('#169b62', '#ffffff', '#ff883e'),
    CN: () => `<rect width="30" height="20" fill="#de2910"/>${star(5.5, 5.5, 3.2, '#ffde00')}${star(10.5, 2.4, 1, '#ffde00', -70)}${star(12.4, 4.6, 1, '#ffde00', -50)}${star(12.4, 7.4, 1, '#ffde00', -20)}${star(10.5, 9.6, 1, '#ffde00', 10)}`,
    MX: () => V3('#006847', '#ffffff', '#ce1126') + `<circle cx="15" cy="10" r="2.5" fill="#8c6b3c"/><circle cx="15" cy="10" r="1.2" fill="#006847"/>`,
    FI: () => cross('#ffffff', '#003580', 7.5, 4, 8, 4),
    GH: () => H3('#ce1126', '#fcd116', '#006b3f') + star(15, 10, 3.2, '#000'),
    ES: () => H3('#aa151b', '#f1bf00', '#aa151b', [1, 2, 1]) + `<rect x="7.5" y="7.5" width="3.4" height="5" rx="1" fill="#aa151b" opacity=".85"/>`,
    KR: () => `<rect width="30" height="20" fill="#fff"/><path d="M10.8 10A4.2 4.2 0 0 1 19.2 10Z" fill="#cd2e3a"/><path d="M10.8 10A4.2 4.2 0 0 0 19.2 10Z" fill="#0047a0"/>` + [[3, 3, 0], [27, 17, 0], [27, 3, 1], [3, 17, 1]].map(p => `<g transform="translate(${p[0]} ${p[1]}) rotate(${p[2] ? -35 : 35})"><rect x="-2.6" y="-1.8" width="5.2" height=".9" fill="#111"/><rect x="-2.6" y="0" width="5.2" height=".9" fill="#111"/><rect x="-2.6" y="1.8" width="5.2" height=".9" fill="#111"/></g>`).join(''),
    AT: () => H3('#ed2939', '#ffffff', '#ed2939'),
    MA: () => `<rect width="30" height="20" fill="#c1272d"/><path d="M15 5.5L16.9 11.4L11.9 7.8H18.1L13.1 11.4Z" fill="none" stroke="#006233" stroke-width=".9" stroke-linejoin="round"/>`,
    DK: () => cross('#c60c30', '#ffffff', 9.5, 3, 8.5, 3),
    NL: () => H3('#ae1c28', '#ffffff', '#21468b'),
    PT: () => V3('#006600', '#ff0000', '#ff0000', [2, 3, 0]).replace(/<rect x="30"[^>]*\/>/, '') + `<circle cx="12" cy="10" r="3.4" fill="#ffcc00"/><circle cx="12" cy="10" r="1.7" fill="#fff" stroke="#c00" stroke-width=".6"/>`,
    HU: () => H3('#cd2a3e', '#ffffff', '#436f4d'),
    HR: () => H3('#ff0000', '#ffffff', '#171796') + `<rect x="12.2" y="6.4" width="5.6" height="6.6" fill="#fff" stroke="#ff0000" stroke-width=".5"/>` + [0, 1, 2].map(r => [0, 1].map(c => (r + c) % 2 === 0 ? `<rect x="${12.4 + c * 2.7}" y="${6.6 + r * 2.1}" width="2.7" height="2.1" fill="#ff0000"/>` : '').join('')).join(''),
    RO: () => V3('#002b7f', '#fcd116', '#ce1126'),
    KZ: () => `<rect width="30" height="20" fill="#00afca"/><circle cx="15" cy="9" r="3.1" fill="#fec50c"/>` + Array.from({ length: 12 }, (_, i) => { const a = i * 30 * Math.PI / 180; return `<path d="M${(15 + 4 * Math.cos(a)).toFixed(2)} ${(9 + 4 * Math.sin(a)).toFixed(2)}L${(15 + 5.4 * Math.cos(a)).toFixed(2)} ${(9 + 5.4 * Math.sin(a)).toFixed(2)}" stroke="#fec50c" stroke-width=".8"/>`; }).join('') + `<path d="M8 16.4Q15 14 22 16.4" fill="none" stroke="#fec50c" stroke-width="1"/>`,
    AU: () => `<rect width="30" height="20" fill="#012169"/><g transform="scale(.5)">${UJ}</g>${star(7.5, 15, 2.4, '#fff')}${star(22, 4, 1.4, '#fff')}${star(26, 8.5, 1.4, '#fff')}${star(22, 15, 1.4, '#fff')}${star(18, 9, 1.4, '#fff')}`,
    CH: () => `<rect width="30" height="20" fill="#d52b1e"/><rect x="12.8" y="4" width="4.4" height="12" fill="#fff"/><rect x="9" y="7.8" width="12" height="4.4" fill="#fff"/>`,
    CA: () => V3('#d80621', '#ffffff', '#d80621', [1, 2, 1]) + `<path d="M15 3.8L16.3 7L19 6L18.2 9.6L21 9L19.5 11.6L21 13L15.8 13.2L15.8 17L14.2 17L14.2 13.2L9 13L10.5 11.6L9 9L11.8 9.6L11 6L13.7 7Z" fill="#d80621"/>`,
    NO: () => cross('#ba0c2f', '#ffffff', 7.5, 5, 7.5, 5) + `<rect x="8.8" width="2.4" height="20" fill="#00205b"/><rect y="8.8" width="30" height="2.4" fill="#00205b"/>`,
    GB: () => UJ,
    CL: () => `<rect width="30" height="10" fill="#fff"/><rect y="10" width="30" height="10" fill="#d52b1e"/><rect width="10" height="10" fill="#0039a6"/>${star(5, 5, 2.8, '#fff')}`,
    UA: () => H3('#0057b7', '#ffd700', '#ffd700', [1, 1, 0]).replace(/<rect y="20"[^>]*\/>/, '').replace(/<rect y="10"[^>]*\/>/, '') + `<rect y="10" width="30" height="10" fill="#ffd700"/>`,
    US: () => { let s = ''; for (let i = 0; i < 13; i++) s += `<rect y="${(i * 20 / 13).toFixed(2)}" width="30" height="${(20 / 13 + 0.05).toFixed(2)}" fill="${i % 2 ? '#fff' : '#b22234'}"/>`; s += `<rect width="12" height="10.8" fill="#3c3b6e"/>`; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s += `<circle cx="${(1.7 + c * 2.9).toFixed(1)}" cy="${(1.6 + r * 2.5).toFixed(1)}" r=".55" fill="#fff"/>`; return s; },
    CU: () => { let r = ''; for (let i = 0; i < 5; i++) r += `<rect y="${i * 4}" width="30" height="4.05" fill="${i % 2 ? '#fff' : '#002a8f'}"/>`; return r + `<polygon points="0,0 13,10 0,20" fill="#cf142b"/>` + star(4.3, 10, 2.9, '#fff'); },
    LV: () => H3('#9e3039', '#ffffff', '#9e3039', [2, 1, 2]),
  };

  function flag(cc, h) {
    const draw = FLAGS[cc];
    if (!draw) return '';
    const id = 'fl' + (uid++), hh = h || 14;
    return `<svg class="flag" viewBox="0 0 30 20" width="${(hh * 1.5).toFixed(1)}" height="${hh}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${cc}"><defs><clipPath id="${id}"><rect width="30" height="20" rx="2.6"/></clipPath></defs><g clip-path="url(#${id})">${draw()}</g><rect width="30" height="20" rx="2.6" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="1"/></svg>`;
  }

  // Pictures a player can choose for their own profile.
  const PRESETS = [
    { hair: 'short', hc: 'dkbrown', skin: 1, top: '#4a7fb5', bg: '#2f5d62', mouth: 'grin' },
    { hair: 'long', hc: 'black', skin: 2, top: '#c0566a', bg: '#5a3f6b', collar: 'v', eye: 'dark' },
    { hair: 'curly', hc: 'dkbrown', skin: 3, top: '#2fa36b', bg: '#2b5a50', mouth: 'grin', eye: 'dark' },
    { hair: 'side', hc: 'blond', skin: 0, top: '#555d6b', bg: '#3d4a5c', beard: 'stubble', eye: 'blue', collar: 'jacket' },
    { hair: 'bob', hc: 'auburn', skin: 0, top: '#27407a', bg: '#5a4a62', glasses: 'round', eye: 'green' },
    { hair: 'buzz', hc: 'black', skin: 5, top: '#e0a030', bg: '#3b4a6b', beard: 'short', mouth: 'grin', eye: 'dark' },
    { hair: 'ponytail', hc: 'blond', skin: 0, top: '#3a6ea5', bg: '#3d5470', collar: 'hoodie', eye: 'blue' },
    { hair: 'short', hc: 'grey', skin: 2, top: '#2f5aa0', bg: '#3a4f6b', beard: 'full', collar: 'shirt', tie: '#c9a227' },
    { hair: 'short', hc: 'black', skin: 1, top: '#b3322e', bg: '#3a4a66', eyes: 'narrow', glasses: 'square', eye: 'dark' },
    { hair: 'short', hc: 'black', skin: 2, top: '#e8e0d0', bg: '#4a5568', hat: 'hijab', hatc: '#2a8a8a', collar: 'v', eye: 'dark' },
    { hair: 'short', hc: 'dkbrown', skin: 4, top: '#4a4f55', bg: '#3a5060', hat: 'beanie', hatc: '#b03a2e', collar: 'hoodie', beard: 'short' },
    { hair: 'long', hc: 'red', skin: 0, top: '#1f7a4d', bg: '#34506a', mouth: 'smirk', eye: 'green' },
  ];

  return { portrait, flag, PRESETS, FLAG_CODES: Object.keys(FLAGS), SKIN, HAIR, EYE };
})();
