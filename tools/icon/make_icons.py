"""Generates every app icon for Chess vs Bots from one drawn design (knight + robot antenna and visor).
Run:  python3 tools/icon/make_icons.py   (needs Playwright/Chromium and Pillow)"""
import os, io
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KNIGHT = ('M14 36 C14 28 17 24 21 20 C18 20 15 22 12.5 25 L10 22 C12 16 16 11 21 9 L21 5 L25 8 C33 10 35 19 34 27 C33.5 31 33 33 33 36 Z', 'M11 40 H34 V36 H11 Z')

def svg(kind):
    s, tx, ty = (19.2, 512 - 22.5 * 19.2, 58) if kind == 'full' else (13.2, 512 - 22.5 * 13.2, 512 - 22.5 * 13.2 + 8)
    bg = ''
    if kind == 'full':
        bg = '''<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a74f0"/><stop offset="0.55" stop-color="#1c3a82"/><stop offset="1" stop-color="#0b1633"/></linearGradient>
        <pattern id="p" width="256" height="256" patternUnits="userSpaceOnUse"><rect width="128" height="128" fill="#ffffff" opacity="0.045"/><rect x="128" y="128" width="128" height="128" fill="#ffffff" opacity="0.045"/></pattern></defs>
        <rect width="1024" height="1024" fill="url(#g)"/><rect width="1024" height="1024" fill="url(#p)"/>
        <circle cx="512" cy="540" r="400" fill="#6cc4ff" opacity="0.10"/>'''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">{bg}
    <g transform="translate({tx},{ty}) scale({s})" stroke-linejoin="round" stroke-linecap="round">
      <path d="M25 6.6 L29.2 -0.2" stroke="#0b1633" stroke-width="3.6" fill="none"/>
      <path d="M25 6.6 L29.2 -0.2" stroke="#e9f0ff" stroke-width="1.5" fill="none"/>
      <circle cx="29.6" cy="-1.1" r="2.6" fill="#5ff3ff" stroke="#0b1633" stroke-width="1.2"/>
      <path d="{KNIGHT[0]}" fill="#f6f8ff" stroke="#0b1633" stroke-width="1.7"/>
      <path d="{KNIGHT[1]}" fill="#f6f8ff" stroke="#0b1633" stroke-width="1.7"/>
      <path d="M14.5 31 H32.5" stroke="#9db4e8" stroke-width="1.2" fill="none"/>
      <rect x="22.2" y="12.6" width="9.2" height="3.4" rx="1.7" fill="#0b1633" stroke="#0b1633" stroke-width="0.8"/>
      <rect x="24.4" y="13.45" width="5" height="1.7" rx="0.85" fill="#5ff3ff"/>
      <path d="M17.2 18.6 L20.6 15.4" stroke="#9db4e8" stroke-width="1.1" fill="none"/>
    </g></svg>'''

def render(kind, transparent):
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1024, 'height': 1024})
        pg.set_content('<body style="margin:0;background:transparent">' + svg(kind) + '</body>')
        png = pg.screenshot(omit_background=transparent, clip={'x': 0, 'y': 0, 'width': 1024, 'height': 1024})
        b.close()
    return Image.open(io.BytesIO(png))

full = render('full', False).convert('RGB')
fg = render('fg', True).convert('RGBA')
bgonly = Image.new('RGB', (1024, 1024))
# background plate = the full design without the knight: render by painting the gradient only
def plate():
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1024, 'height': 1024})
        s = svg('full'); s = s[:s.index('<g transform')] + '</svg>'
        pg.set_content('<body style="margin:0">' + s + '</body>'); png = pg.screenshot(clip={'x': 0, 'y': 0, 'width': 1024, 'height': 1024}); b.close()
    return Image.open(io.BytesIO(png)).convert('RGB')
bgonly = plate()

def save(img, rel, size=None, mode=None):
    path = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(path), exist_ok=True)
    im = img.resize((size, size), Image.LANCZOS) if size else img
    if mode: im = im.convert(mode)
    im.save(path, optimize=True)

save(full, 'assets/icon-only.png', mode='RGB'); save(fg, 'assets/icon-foreground.png'); save(bgonly, 'assets/icon-background.png')
save(full, 'icons/app_store_1024.png', mode='RGB'); save(full, 'icons/ios/AppIcon.appiconset/AppIcon-512@2x.png', mode='RGB')
save(full, 'icons/play_store_512.png', 512, 'RGB')
save(full, 'www/icon.png', 192, 'RGB'); save(full, 'www/icon512.png', 512, 'RGB'); save(full, 'www/apple-touch-icon.png', 180, 'RGB'); save(full, 'www/favicon-32.png', 32, 'RGB')
for d, legacy, adaptive in [('mdpi', 48, 108), ('hdpi', 72, 162), ('xhdpi', 96, 216), ('xxhdpi', 144, 324), ('xxxhdpi', 192, 432)]:
    base = f'icons/android/mipmap-{d}/'
    save(full, base + 'ic_launcher.png', legacy, 'RGB')
    rnd = full.resize((legacy, legacy), Image.LANCZOS).convert('RGBA'); m = Image.new('L', (legacy * 4, legacy * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, legacy * 4 - 1, legacy * 4 - 1), fill=255)
    rnd.putalpha(m.resize((legacy, legacy), Image.LANCZOS)); os.makedirs(os.path.join(ROOT, base), exist_ok=True); rnd.save(os.path.join(ROOT, base + 'ic_launcher_round.png'), optimize=True)
    save(fg, base + 'ic_launcher_foreground.png', adaptive); save(bgonly, base + 'ic_launcher_background.png', adaptive, 'RGB')
print('icons written')
