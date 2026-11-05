#!/usr/bin/env python3
"""Draws the app icon from the page's own lamp mark and writes build/icon.ico, build/icon.icns and build/icon.png.

The mark is the page's <symbol id="i-lamp"> (24 x 24, strokes only): a shade, a stem and a foot. It sits on a warm dark
rounded square, the shade lit from inside. Each size is rendered from the SVG by headless Chrome (one Chrome at a time,
it exits by itself), so small sizes are crisp. The .ico is written here (PNG-embedded entries 16 to 256); the .icns
comes from `iconutil` (macOS only; skipped elsewhere).

Run:  python3 scripts/make_icons.py        (needs Google Chrome at CHROME or the default macOS path)
"""
import os, shutil, struct, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
CHROME = os.environ.get('CHROME', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')

def svg(size, mac):
    """The icon as an SVG of size x size px. mac=True leaves the margin macOS expects around the square (824 of 1024)."""
    k = size / 1024.0
    box = 824 if mac else 992          # the rounded square, in 1024 units
    off = (1024 - box) / 2
    rx = box * 0.2237                  # the macOS squircle ratio, close enough to a plain round corner
    sw = 1.4 if size >= 96 else 1.85 if size >= 40 else 2.3   # stroke of the mark, in its own 24-unit space
    s = box / 1024 * 40.5              # scale of the 24-unit symbol
    tx = 512 - 12 * s
    ty = 512 - 12.2 * s
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 1024 1024">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a1d13"/><stop offset="1" stop-color="#120d09"/></linearGradient>
  <radialGradient id="glow" cx="512" cy="540" r="440" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffb36b" stop-opacity=".62"/><stop offset=".45" stop-color="#b8742f" stop-opacity=".18"/><stop offset="1" stop-color="#b8742f" stop-opacity="0"/></radialGradient>
  <linearGradient id="lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a3"/><stop offset="1" stop-color="#ffa24f"/></linearGradient>
  <clipPath id="sq"><rect x="{off}" y="{off}" width="{box}" height="{box}" rx="{rx:.1f}"/></clipPath>
</defs>
<rect x="{off}" y="{off}" width="{box}" height="{box}" rx="{rx:.1f}" fill="url(#bg)"/>
<g clip-path="url(#sq)">
  <rect x="{off}" y="{off}" width="{box}" height="{box}" fill="url(#glow)"/>
</g>
<rect x="{off + 2}" y="{off + 2}" width="{box - 4}" height="{box - 4}" rx="{rx - 2:.1f}" fill="none" stroke="#efe4cf" stroke-opacity=".10" stroke-width="4"/>
<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.4f})" fill="none" stroke="#efe4cf" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round">
  <path d="M8.5 3.5h7l3 7h-13z" fill="url(#lit)"/>
  <path d="M12 10.5v8M8.5 20.5h7"/>
</g>
</svg>'''

def render(size, mac, out, tmp):
    page = os.path.join(tmp, f'i{size}{"m" if mac else "w"}.html')
    with open(page, 'w') as f:
        f.write('<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block}</style>' + svg(size, mac))
    prof = os.path.join(tmp, 'chrome-prof')
    r = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--force-device-scale-factor=1',
                        '--default-background-color=00000000', f'--user-data-dir={prof}', f'--window-size={size},{size}',
                        f'--screenshot={out}', 'file://' + page], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    if not os.path.exists(out): sys.exit(f'Chrome did not write {out} (exit {r.returncode})')

def ico(path, pngs):
    """pngs: list of (size, bytes). PNG-embedded entries; 256 is written as 0 in the directory."""
    n = len(pngs)
    head = struct.pack('<HHH', 0, 1, n)
    off = 6 + 16 * n
    dirs, blobs = b'', b''
    for size, data in pngs:
        w = 0 if size >= 256 else size
        dirs += struct.pack('<BBBBHHII', w, w, 0, 0, 1, 32, len(data), off + len(blobs))
        blobs += data
    with open(path, 'wb') as f: f.write(head + dirs + blobs)

def main():
    os.makedirs(BUILD, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='liseuse-icon-')
    try:
        win = {}
        for s in (16, 24, 32, 48, 64, 128, 256, 512):
            out = os.path.join(tmp, f'win{s}.png'); render(s, False, out, tmp)
            win[s] = open(out, 'rb').read()
        ico(os.path.join(BUILD, 'icon.ico'), [(s, win[s]) for s in (16, 24, 32, 48, 64, 128, 256)])
        with open(os.path.join(BUILD, 'icon.png'), 'wb') as f: f.write(win[512])
        if shutil.which('iconutil'):
            iset = os.path.join(tmp, 'icon.iconset'); os.makedirs(iset)
            for name, px in (('16x16', 16), ('16x16@2x', 32), ('32x32', 32), ('32x32@2x', 64), ('128x128', 128), ('128x128@2x', 256),
                             ('256x256', 256), ('256x256@2x', 512), ('512x512', 512), ('512x512@2x', 1024)):
                render(px, True, os.path.join(iset, f'icon_{name}.png'), tmp)
            subprocess.run(['iconutil', '-c', 'icns', iset, '-o', os.path.join(BUILD, 'icon.icns')], check=True)
        else:
            print('iconutil not found: icon.icns skipped')
        shutil.copy(os.path.join(tmp, 'win256.png'), os.path.join(BUILD, 'icon-preview-256.png'))
        print('wrote', *sorted(os.listdir(BUILD)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == '__main__':
    main()
