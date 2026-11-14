"""Writes 05-switch-expert.html and 06-expert-workspace.html from one template (same Expert page,
two states). Run: python3 gen_expert.py"""

def i(name, cls='icon', style=''):
    return f'<svg class="{cls}"{f" style=\"{style}\"" if style else ""}><use href="icons.svg#{name}"/></svg>'

def date_scale():
    # Aug 2025 .. Oct 2026: 15 months; passes and 12 visits as in the real app's Measure bar.
    W, x0, x1 = 600, 8, 592
    months = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct']
    step = (x1 - x0) / (len(months) - 1)
    out = [f'<svg class="scale" viewBox="0 0 {W} 60" width="100%" height="60" preserveAspectRatio="none" aria-label="Dates: 12 visits in 3 survey passes, August 2025 to September 2026">']
    for k, m in enumerate(months):
        x = x0 + k * step
        major = m in ('Oct', 'Jan', 'Apr', 'Jul')
        out.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{30 if not major else 26}" y2="38" stroke="{"var(--on-glass-3)" if major else "rgb(255 255 255 / .22)"}" stroke-width="1"/>')
        if major:
            lab = '2026' if m == 'Jan' else m
            out.append(f'<text x="{x:.1f}" y="54" text-anchor="middle">{lab}</text>')
    passes = [(0, 3.0, 'Pass 1'), (4.5, 8.5, 'Pass 2'), (9.5, 13.2, 'Pass 3')]
    for a, b, n in passes:
        xa, xb = x0 + a * step, x0 + b * step
        out.append(f'<rect x="{xa:.1f}" y="30" width="{xb - xa:.1f}" height="4" rx="2" fill="rgb(255 255 255 / .55)"/>')
        out.append(f'<text x="{(xa + 4):.1f}" y="16">{n}</text>')
    visits = [0.3, 0.45, 0.6, 0.75, 5.2, 5.35, 5.5, 5.65, 12.3, 12.45, 12.6, 12.75]
    for v in visits:
        x = x0 + v * step
        out.append(f'<circle cx="{x:.1f}" cy="32" r="3.2" fill="var(--on-glass)"/>')
    xp = x0 + 12.6 * step
    out.append(f'<line x1="{xp:.1f}" x2="{xp:.1f}" y1="20" y2="44" stroke="var(--mark)" stroke-width="2"/><circle cx="{xp:.1f}" cy="32" r="7" fill="var(--mark)" stroke="rgb(var(--tint))" stroke-width="2"/>')
    out.append('</svg>')
    return ''.join(out)

def mini_dates():
    out = ['<svg viewBox="0 0 200 24" width="100%" height="24" aria-label="12 visits in 3 passes, Aug 2025 to Sep 2026">']
    for a, b in [(2, 46), (72, 120), (150, 198)]:
        out.append(f'<rect x="{a}" y="10" width="{b - a}" height="4" rx="2" fill="rgb(255 255 255 / .5)"/>')
    for x in [6, 10, 14, 18, 84, 88, 92, 96, 182, 186, 190, 194]:
        out.append(f'<circle cx="{x}" cy="12" r="1.8" fill="var(--on-glass)"/>')
    out.append('<circle cx="190" cy="12" r="5" fill="var(--mark)" stroke="rgb(var(--tint))" stroke-width="1.5"/></svg>')
    out.append('<div style="display:flex;justify-content:space-between;font:400 11px/1 var(--font);color:var(--on-glass-3);margin-top:2px"><span>Aug 2025</span><span>Sep 2026</span></div>')
    return ''.join(out)

def wl_scale():
    cols = ['--d1','--d2','--d3','--d4','--d5','--d6']
    edges = ['0.75','1.11','1.63','2.41','3.83','4.41','5.0 µm']
    W = 420; seg = (W - 10) / 6
    out = [f'<svg class="scale" viewBox="0 0 {W} 40" width="100%" height="40" preserveAspectRatio="none" aria-label="Wavelength 2.00 micrometres, detector D3">']
    for k, c in enumerate(cols):
        out.append(f'<rect x="{k * (seg + 2):.1f}" y="10" width="{seg:.1f}" height="6" rx="2" fill="var({c})"/>')
    for k, e in enumerate(edges):
        x = min(k * (seg + 2), W - 1)
        out.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="6" y2="20" stroke="var(--on-glass)" stroke-width="1"/>')
        out.append(f'<text x="{x:.1f}" y="36" text-anchor="{"start" if k == 0 else ("end" if k == 6 else "middle")}">{e}</text>')
    hx = 2 * (seg + 2) + seg * 0.45
    out.append(f'<rect x="{hx - 7:.1f}" y="3" width="14" height="20" rx="5" fill="var(--mark)" stroke="rgb(var(--tint))" stroke-width="2"/>')
    out.append('</svg>')
    return ''.join(out)

TOP = f'''
<header class="top">
  <div class="glass brand"><span class="wordmark"><span class="ar">سيما</span><span class="la">Sima</span></span></div>
  <div class="glass-thin find d-only">{i("search")}Search a star or galaxy, or paste coordinates<span class="kbd">/</span></div>
  <div class="spacer"></div>
  <nav class="glass cluster d-only">
    <span class="btn">{i("compass")}Guide</span><span class="btn">{i("pin")}Places</span>
    <span class="btn icon-only">{i("share")}</span><span class="btn icon-only">{i("info")}</span>
  </nav>
  <div class="glass switch2" data-guide="view-switch"><span>{i("sun", "icon d-only")}Discover</span><span class="on">{i("chart", "icon d-only")}Expert</span></div>
</header>
<div class="chips d-only">
  <span class="chip glass-thin">{i("pin")}Stars</span><span class="chip glass-thin">{i("pin")}Nearby</span><span class="chip glass-thin">{i("chart")}Changing</span>
  <span class="chip glass-thin">{i("globe")}Clusters</span><span class="chip glass-thin narrow-hide">{i("layers")}Nebulae</span><span class="chip glass-thin narrow-hide">{i("globe")}Galaxies</span>
  <span class="chip glass-thin narrow-hide">{i("arrow")}Tours</span><span class="chip glass-thin">More{i("chev-down")}</span>
</div>
<nav class="rail glass d-only">
  <span class="icon-btn">{i("plus")}</span><span class="icon-btn">{i("minus")}</span><hr>
  <span class="icon-btn">{i("layers")}</span><span class="icon-btn">{i("globe")}</span><hr>
  <span class="icon-btn">{i("frame-add")}</span>
</nav>'''

TOOLS = f'''
<section class="toolsp slate d-only" style="left:74px;width:min(330px, calc(100vw - 1050px))" aria-label="Picture tools">
  <div class="tabs" style="margin-top:0"><span class="on">Picture</span><span>Clean up</span><span>Find changes</span><span>Layers</span></div>
  <p style="font-size:12px;color:var(--on-glass-2);margin:12px 0 0;line-height:1.5">How pixel values become brightness on screen. The values themselves do not change.</p>
  <div class="label" style="margin-top:14px">Stretch</div>
  <div class="seg" style="margin-top:6px;display:flex;flex-wrap:wrap"><span>Linear</span><span>Sqrt</span><span>Log</span><span class="on">Asinh</span><span>Equalise</span></div>
  <p style="font-size:12px;color:var(--on-glass-2);margin:6px 0 0">Asinh: faint things visible, bright stars not burnt out (default)</p>
  <div class="label" style="margin-top:14px">Black and white points</div>
  <div class="seg" style="margin-top:6px;display:flex;flex-wrap:wrap"><span class="on">Noise</span><span>zscale</span><span>99.5%</span><span>Custom</span></div>
  <div style="margin-top:12px;background:var(--st-bg);border-radius:10px;padding:8px"><img src="img/hist-0.png" style="width:100%;display:block;image-rendering:auto" alt="Histogram of pixel values with the black and white points"></div>
  <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12px;color:var(--on-glass-3)"><span>Reset all</span><span>Kept in this browser and in shared links</span></div>
</section>'''

def frame(left):
    return f'''
<section class="xframe glass d-only" style="left:{left}" aria-label="Frame: Barnard's Star">
  <div class="fh">
    <div class="grow"><div class="name">Barnard's Star</div><div class="src"><span class="dot"></span>Real data</div></div>
    <span class="icon-btn fovb">{i("minus")}</span><span class="fov">6′</span><span class="icon-btn fovb">{i("plus")}</span>
    <span class="icon-btn TOOLSON">{i("sliders")}</span><span class="btn on" style="height:30px;padding:0 9px;font-size:12px">{i("chart")}Measure</span><span class="icon-btn">{i("close")}</span>
  </div>
  <div class="well pic">
    <img class="px" src="img/pic-barnard-2.png" alt="Barnard's Star, 17 August 2026, detector D3">
    <div class="badge xbadge"><b><span class="letter" style="background:var(--p3)">C</span>17 Aug 2026, 00:53 UTC</b>Survey pass 3<br>D3, 1.77 µm<br>Different colour: 1.77 vs 1.67 µm</div>
    <span class="badge orig">Original</span>
    <div class="edge" style="box-shadow:inset 0 0 0 3px var(--p3)"></div>
  </div>
  <div class="seg"><span class="on">Flip</span><span>Swipe</span><span>Two dates</span><span>Difference</span><span>Stack</span><span>Trail</span></div>
  <div class="exif">Real SPHEREx data, QR3 · 17 Aug 2026, 1 exposure · D3 1.77 µm</div>
</section>'''

MEASURE = f'''
<section class="measure slate d-only" style="width:clamp(380px, 40vw, 760px)" aria-label="Measure">
  <div class="mh"><div><div class="obj">Barnard's Star</div><div class="kind">Red dwarf (M4V), <span class="term">1.83 pc</span></div></div><span class="icon-btn">{i("close")}</span></div>
  <div class="mgrid">
    <div>
      <div class="head"><span class="v">10.50″/yr</span><span class="pill good"><span class="dot"></span>matches catalogue</span></div>
      <div class="how"><span class="term">Measured ±0.26″</span> from the pixels of 71 of 72 real exposures, catalogue 10.39″/yr</div>
      <div class="tabs"><span class="on">Path</span><span>Spectrum</span><span>Brightness</span><span>Cutouts</span><span>Exposure</span></div>
      <div class="chartwin"><img src="img/chart-barnard-0.png" alt="Path chart: each exposure's measured position, moving north"></div>
      <p>Moving toward <span class="term">position angle 357°</span> (each dot is one exposure; colours are survey passes). The catalogue value is from Gaia DR3 4472832130942575872. Parallax is not shown: three passes cannot measure it, so only the catalogue value is given.</p>
      <p><span class="textlink" style="font-size:12px">Download these numbers (CSV)</span></p>
    </div>
    <div class="statcol">
      <div class="label" style="margin-bottom:4px">The numbers</div>
      <div class="stat"><span>Motion</span><span>10.50 ± 0.26″/yr</span></div>
      <div class="stat"><span>Direction</span><span>357°</span></div>
      <div class="stat"><span>Catalogue (Gaia DR3)</span><span>10.39″/yr</span></div>
      <div class="stat"><span>Parallax</span><span>547 mas, catalogue</span></div>
      <div class="stat"><span>Exposures used</span><span>71 of 72</span></div>
      <div class="stat"><span>Dates</span><span>Aug 2025 – Sep 2026</span></div>
      <div class="stat"><span>Fit</span><span class="term">straight line</span></div>
    </div>
  </div>
</section>'''

BAR = f'''
<section class="bar glass d-only" style="width:min(1360px, calc(100vw - 120px))" aria-label="Dates and wavelength">
  <span class="icon-btn">{i("prev")}</span><span class="play">{i("pause")}</span><span class="icon-btn">{i("next")}</span>
  <div style="flex:1.5;min-width:0">{date_scale()}</div>
  <span style="font:500 12px/1 var(--font);color:var(--on-glass-2);white-space:nowrap" class="term">12 / 12</span>
  <span class="icon-btn">{i("loop")}</span><span style="font:500 12px/1 var(--font);color:var(--on-glass-2)">1×</span>
  <span class="vr"></span>
  <div style="flex:1;min-width:0">
    <div class="wl-head"><span class="term" style="color:var(--on-glass-3)">Wavelength</span><b>2.00 µm</b><span class="narrow-hide">Deeper infrared</span><span style="margin-left:auto" class="narrow-hide">Same wavelength only</span></div>
    {wl_scale()}
  </div>
</section>'''

COACH = f'''
<section class="coach glass-raised d-only" style="right:16px;top:70px" role="dialog" aria-labelledby="c-h">
  <h3 id="c-h">You're in Expert view</h3>
  <p>Every number, picture tool, frame and workspace. You are looking at the same star, date and wavelength as before.</p>
  <ul>
    <li>{i("check")}Your missions, skills and field guide are kept.</li>
    <li>{i("check")}Switch back to Discover here, any time.</li>
  </ul>
  <div class="actions"><button class="btn primary">Tour the numbers (3 steps)</button><button class="btn">Got it</button></div>
</section>'''

# ---- phone: Expert on a phone ----
PHONE = f'''
<section class="pframe glass m-only" aria-label="Frame: Barnard's Star">
  <div class="fh"><div><div class="name">Barnard's Star</div><div class="src"><span class="dot"></span>Real data · QR3 · D3 1.77 µm</div></div></div>
  <div class="well ppic"><img class="px" src="img/pic-barnard-2.png" alt="Barnard's Star, 17 August 2026">
    <div class="badge" style="left:8px;top:8px"><b style="display:flex;gap:7px;align-items:center"><span class="letter" style="background:var(--p3)">C</span>17 Aug 2026</b>Pass 3 · D3, 1.77 µm</div></div>
  <div class="pbar"><span class="icon-btn" style="width:44px;height:44px">{i("prev")}</span><span class="play" style="width:48px;height:48px;border-radius:50%;background:var(--action);color:#fff;display:grid;place-items:center">{i("pause")}</span><span class="icon-btn" style="width:44px;height:44px">{i("next")}</span><div style="flex:1;min-width:0;padding:0 6px">{mini_dates()}</div><span style="font-size:12px;color:var(--on-glass-2)">12/12</span></div>
</section>
<section class="msheet glass-raised m-only PSHEET">
  <div class="grabber"></div>
  PHONEBODY
</section>'''

PHONE_COACH = f'''
  <h3 style="margin:8px 0 0;font:600 17px/1.2 var(--font)">Expert view on a phone</h3>
  <p style="font-size:14px;color:var(--on-glass-2);line-height:1.5;margin:8px 0 0">Here you get the frame, every date and every number. Picture tools, several frames and workspaces need a computer.</p>
  <div class="actions" style="margin-top:14px"><button class="btn primary lg" style="flex:1">{i("laptop")}Send this to my computer</button><button class="btn lg">Got it</button></div>'''

PHONE_MEASURE = f'''
  <div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:6px"><div class="obj" style="font:600 17px/1.2 var(--font)">Measure</div><span class="faint" style="font-size:12px">Red dwarf (M4V), 1.83 pc</span></div>
  <div class="head" style="display:flex;gap:10px;align-items:center;margin-top:10px"><span style="font:600 25px/1 var(--font)">10.50″/yr</span><span class="pill good"><span class="dot"></span>matches catalogue</span></div>
  <div style="font-size:12px;color:var(--on-glass-2);margin-top:8px">Measured ±0.26″ from 71 of 72 real exposures · catalogue 10.39″/yr</div>
  <div class="tabs" style="overflow:hidden"><span class="on">Path</span><span>Spectrum</span><span>Brightness</span><span>Cutouts</span><span>Exposure</span></div>
  <div style="margin-top:10px;background:var(--st-bg);border-radius:10px;overflow:hidden"><img src="img/chart-barnard-0.png" style="width:100%;display:block" alt="Path chart"></div>
  <div style="display:flex;gap:8px;margin-top:12px;font-size:12px;color:var(--on-glass-3);align-items:center">{i("laptop","icon","width:18px;height:18px")}Picture tools and workspaces open on a computer.</div>'''

def page(title, coach, tools):
    frame_left = 'calc(100vw - 16px - clamp(380px, 40vw, 760px) - 16px - min(480px, calc(100vh - 440px)) - 20px)'
    body = TOP + (TOOLS if tools else '') + frame(frame_left).replace('TOOLSON', 'on' if tools else '') + MEASURE + BAR + (COACH if coach else '')
    phone = PHONE.replace('PHONEBODY', PHONE_COACH if coach else PHONE_MEASURE).replace('PSHEET', 'coachsheet' if coach else 'msheetx')
    return f'''<!doctype html>
<html lang="en" data-theme="night">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="glass.css"><link rel="stylesheet" href="discover.css">
<style>
  .mgrid {{ display: grid; grid-template-columns: 1fr; gap: 16px; }}
  @media (min-width: 1600px) {{ .mgrid {{ grid-template-columns: 1fr 260px; }} }}
  @media (max-width: 1599px) {{ .statcol {{ display: none; }} }}
  @media (max-width: 1420px) {{ .narrow-hide {{ display: none; }} }}
  .find {{ width: 400px; white-space: nowrap; overflow: hidden; }}
  .bar {{ bottom: 36px; }}
  .sky-note {{ bottom: 6px; height: 24px; background: transparent; box-shadow: none; -webkit-backdrop-filter: none; backdrop-filter: none; text-shadow: 0 1px 2px #000; }}
  .sky-note::before, .sky-note::after {{ display: none; }}
  .xframe .fh .name {{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }}
  .xframe .fh .grow {{ min-width: 0; }}
  @media (max-width: 1420px) {{ .xframe .seg span {{ font-size: 12px; padding: 0 4px; white-space: nowrap; }} .xframe .fov, .xframe .fh .icon-btn.fovb {{ display: none; }} }}
  .icon-btn.on {{ background: var(--action-soft); color: var(--on-action-soft); }}
  @media (max-width: 699px) {{
    .pframe {{ position: fixed; left: 12px; right: 12px; top: 64px; border-radius: 20px; padding: 8px; }}
    .pframe .fh {{ padding: 2px 4px 8px; }} .pframe .name {{ font: 600 17px/1.2 var(--font); }}
    .pframe .src {{ font: 500 12px/1 var(--font); color: var(--on-glass-2); display: flex; gap: 6px; align-items: center; margin-top: 4px; }}
    .ppic {{ width: 100%; aspect-ratio: 1; }}
    .pbar {{ display: flex; align-items: center; gap: 6px; padding: 8px 2px 0; }}
    .pbar svg.scale text {{ font: 400 11px var(--font); fill: var(--on-glass-3); }}
    .msheetx {{ height: 36vh; overflow: hidden; }}
    .coachsheet {{ padding-bottom: 24px; }}
  }}
</style>
</head>
<body>
<!-- Background: the real app's sky map around Barnard's Star (captured 15 Nov 2026). Charts and pictures are real captures of the app. -->
<div class="sky" style="background-image:url(img/sky-barnard-1900.jpg)"></div>
{body}
{phone}
<div class="sky-note glass-thin d-only"><b>Average of all dates:</b> moving things blur here · SPHEREx 2.00 µm</div>
</body>
</html>
'''

open('05-switch-expert.html', 'w').write(page('Sima v2: switching to Expert view', coach=True, tools=False))
open('06-expert-workspace.html', 'w').write(page('Sima v2: Expert workspace in Night glass', coach=False, tools=True))
