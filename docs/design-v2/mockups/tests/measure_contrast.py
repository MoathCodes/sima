"""Measures text contrast on each glass material over worst-case real backdrops.
Renders tests/contrast.html in headless Chromium (see ../render.mjs for the browser) and samples
the panel pixels. Usage: python3 tests/measure_contrast.py <screenshot.png>
Worst case: the 98th-percentile brightest panel pixel for light text (Night), the 2nd-percentile
darkest for dark text (Chart), per WCAG failure F83 (test against the least contrasting area)."""
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
def lin(c):
    c = c / 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def L(rgb): r, g, b = [lin(x) for x in rgb]; return .2126 * r + .7152 * g + .0722 * b
def hexL(h): return L(tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)))
def cr(a, b): a, b = max(a, b), min(a, b); return (a + .05) / (b + .05)
texts = {'night': {'on-glass': '#f3f5fb', 'on-glass-2': '#c3cadf', 'on-glass-3': '#aab2cf'},
         'chart': {'on-glass': '#0f1a3c', 'on-glass-2': '#343f6a', 'on-glass-3': '#4a5479'}}
mats = ['thin', 'regular', 'raised', 'slate', 'solid']; bks = ['white', 'black', 'betelgeuse', 'milky way']
print('| Theme | Material | ' + ' | '.join(texts['night']) + ' | worst backdrop |')
print('|---|---|---|---|---|---|')
for ti, t in enumerate(['night', 'chart']):
    for mi, m in enumerate(mats):
        y0 = (ti * len(mats) + mi) * 220; worst = {}
        for bi, bk in enumerate(bks):
            x0 = bi * 300
            px = [im.getpixel((x, y)) for x in range(x0 + 60, x0 + 240, 3) for y in range(y0 + 70, y0 + 150, 3)]
            Ls = sorted(L(p) for p in px)
            worst[bk] = Ls[int(len(Ls) * .98)] if t == 'night' else Ls[int(len(Ls) * .02)]
        res = {k: min((cr(hexL(v), w), b) for b, w in worst.items()) for k, v in texts[t].items()}
        print(f'| {t} | {m} | ' + ' | '.join(f'{v[0]:.1f}' for v in res.values()) + f' | {list(res.values())[0][1]} |')
