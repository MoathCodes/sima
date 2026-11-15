"""Converts png/*.png (from render.mjs) to high-quality WebP and deletes the PNGs.
Run with the checkout's .venv (Pillow): ../../../.venv/bin/python to_webp.py"""
from pathlib import Path
from PIL import Image

for png in sorted(Path('png').glob('*.png')):
    out = png.with_suffix('.webp')
    Image.open(png).convert('RGB').save(out, 'WEBP', quality=88, method=6)
    png.unlink()
    print(f'{out}  {out.stat().st_size // 1024} KB')
