---
name: Sima (سيما) v2
description: Night Glass. Smoked glass controls over the real infrared sky; science in opaque wells.
status: v2.0, revised after challenge, 15 November 2026. Replaces DESIGN.md when the team accepts it. Night theme only in v2.0.
colors:
  # Sky and data windows: never glass, never tinted
  sky: "#05070d"
  well: "#000000"
  st-bg: "#090d1c"
  st-line: "#27305a"
  st-ink: "#eef0f8"
  st-ink-2: "#aab2d0"
  st-ink-3: "#7c86ab"
  # Night (default) glass and text
  tint: "rgb(11 14 28)"
  on-glass: "#f3f5fb"
  on-glass-2: "#c3cadf"
  on-glass-3: "#aab2cf"
  rule: "rgb(255 255 255 / .10)"
  fill-1: "rgb(255 255 255 / .07)"
  fill-2: "rgb(255 255 255 / .12)"
  fill-3: "rgb(255 255 255 / .18)"
  rim-top: "rgb(255 255 255 / .30)"
  rim-low: "rgb(255 255 255 / .05)"
  # Working colours (jobs unchanged from v1)
  action: "#3f5cf5"
  action-hi: "#2f4be0"
  on-action: "#ffffff"
  action-soft: "rgb(84 112 255 / .24)"
  on-action-soft: "#c5d0ff"
  mark: "#ff4a9c"
  path: "#ffb03a"
  good: "#6fe0aa"
  good-soft: "rgb(80 214 150 / .16)"
  warn: "#ffc670"
  warn-soft: "rgb(255 176 58 / .16)"
  bad: "#ff8a8f"
  bad-soft: "rgb(255 92 102 / .16)"
  skill: "#ffffff"
  d1: "#8f7cff"
  d2: "#4fa8ff"
  d3: "#3fd0c0"
  d4: "#a8d34f"
  d5: "#f4b740"
  d6: "#ff7650"
  p1: "#e6e9f7"
  p2: "#c3cbea"
  p3: "#9fabd8"
  p4: "#8291c9"
materials:
  # blur radius / saturate() / brightness() of the backdrop / tint opacity
  thin:    { blur: "16px", saturate: 1.5, brightness: 0.55, tint: 0.62 }
  regular: { blur: "24px", saturate: 1.6, brightness: 0.50, tint: 0.62 }
  raised:  { blur: "32px", saturate: 1.6, brightness: 0.45, tint: 0.70 }
  slate:   { blur: "none", tint: 0.96 }
  solid:   { blur: "none", tint: 0.95 }
  grain: 0.035
  rim: "1px, linear-gradient(180deg, rim-top, rim-low 38%, rim-low 80%, rgb(255 255 255 / .09))"
shadows:
  lift-1: "0 1px 1px rgb(0 0 0 / .35), 0 10px 28px -10px rgb(0 0 0 / .6)"
  lift-2: "0 1px 2px rgb(0 0 0 / .4), 0 22px 48px -16px rgb(0 0 0 / .7)"
typography:
  ui: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
  arabic-display: "token --arabic-display: the Sima wordmark only (Ruqaa; mockups use Aref Ruqaa Bold, SIL OFL)"
  arabic-text: "token --arabic-text: Arabic star names and all small Arabic text (a plain face; mockups use Noto Sans Arabic, SIL OFL)"
  expert-sizes: [11, 12, 14, 17, 25]
  discover-sizes: [12, 14, 16, 17, 25]
  phone-hit-area: "48px, 8px apart"
  reading: 16
rounded:
  tag: "8px"
  control: "12px"
  card: "18px"
  frame: "20px"
  bar: "24px"
  sheet: "28px"
  pill: "999px"
spacing:
  group: "2px"
  tight: "6px"
  inset: "10px"
  bar-gap: "14px"
  gutter: "16px (12px on phones)"
motion:
  ease: "cubic-bezier(.16,1,.3,1)"
  fade: "0.18s"
  settle: "0.32s"
  glide: "0.42s"
---

# Design System v2: Sima (سيما), Night Glass

This file is the proposed replacement for `DESIGN.md`. It keeps every job a colour, a line style or
a motion had in v1, and changes the surface those jobs sit on: from pale printed cards to smoked
glass. Where this file says "carried", the v1 rule holds word for word. The executable form of every
token is `mockups/glass.css`; the screens are in `mockups/png/` (WebP at 1366×768 and 390×844).

**v2.0 after challenge.** Two reviews (`challenge/CODEX.md`, `challenge/OPUS.md`) asked for a
smaller, more honest first release. In this file that means: Night only (Chart glass moves to
section 14, later); two looks, **Glass** or **Solid**, chosen once (no Lite level); **phones start
Solid**, with an opaque sheet that never covers the picture; the intro cross-fades to the globe
rather than claiming an exact hand-over; and the Ruqaa face is for the wordmark only. The reasons
for each choice are in `BEGINNER-AND-MOBILE.md` section 2.

The product is still سيما, Sima: Arabic for "a sign or a mark".

## 1. Overview

**Creative North Star: "The Observatory Window."** You look at the real sky through dark,
cool glass. The glass holds the controls. It dims what is behind it, so text on it is always
strong, but it lets the colour and the glow of the sky through, so the sky never feels covered.
Science is never seen through the glass: pictures and charts sit in opaque black wells cut into it.

**Why this and not the printed chart.** Three reasons, in order:

1. **The intro is dark.** The page now opens on a black globe with a ring of real sky light. v1
   then switches to bright paper cards, the brightest thing on screen. Night Glass continues the
   intro's palette (Blue-black Sky, `st-ink`), so the visit has one mood from the first frame.
2. **The data should be the brightest thing on screen.** On pale cards the eye goes to the
   chrome. On smoked glass it goes to the pictures, the charts and the coloured scales.
3. **The team asked for premium glass.** We found a version that passes WCAG AA on the brightest
   sky we have (section 4.4), costs a known amount of GPU, and falls back to solid.

**Key characteristics.**

- The sky is the page. Glass floats on it. At full zoom-out the sky is a globe seen from outside.
- Four materials: Thin, Regular, Raised (glass) and Slate (opaque). Plus Solid, the fallback.
- One hue for "press" (ultramarine), one for "look here" (magenta), the rainbow for detectors.
  Unchanged from v1.
- Pictures and charts in opaque wells. Never blurred, never tinted, never under glass.
- One grotesque (Archivo) for all interface text. One Arabic display font, behind a token.
- Real, simulated and missing never look the same. Unchanged.
- Two views: **Discover** (beginners, the default) and **Expert** (today's Measure level and
  workspace). See `BEGINNER-AND-MOBILE.md`.

## 2. Decisions and their reasons

These are the choices a reviewer is most likely to question. Each says what we rejected.

| # | Decision | Why | Rejected, and why |
|---|---|---|---|
| D-1 | **Night is the only theme in v2.0.** The system's light/dark preference does not switch it. Chart glass (light) is kept for later (section 14). | The sky is always dark, and the intro is dark. A second theme doubles the visual checks (both reviews). | *Follow `prefers-color-scheme`:* pale panels on a black sky right after a dark intro. *Ship Chart too:* twice the states to test in days. |
| D-2 | **Smoked glass: the backdrop is dimmed (`brightness(.45–.55)`) before the tint.** | Dimming caps how bright the sky behind text can get, so contrast holds over Betelgeuse's glare and the Milky Way. It keeps hue and structure, like Fluent's luminosity blend. Apple asks for a dimming layer on bright content. | *Clear glass with a light tint:* fails 4.5:1 over bright stars. *A dark tint alone, no dimming:* needs about 0.8 opacity to pass, which kills the glass look. |
| D-3 | **The frame and the big reading panels are Slate: opaque, no blur** (the frame, Measure, picture tools, About, dialogs, and the phone sheet). | They are content, and Apple's rule is no glass in the content layer. They are large (the frame is about 584 × 750 px, Measure up to 760 × 600), text- or picture-heavy and long-lived; most of the frame's glass would sit under an opaque picture anyway. Measured: making the frame Slate cut the blurred area of a mission screen from 35% to 13% of the window at 1900×1030. Popovers that open over Slate stay glass, and glass is never on glass. | *Everything glass:* 26–36% of the window blurred, glass-on-glass when menus open, and the most text on the least stable background. |
| D-4 | **The Well Rule: every picture and chart sits in an opaque well** (`#000` for pictures, `st-bg` for charts), with a 1 px inner line. | H8 and the science: no processing on what is shown, and no sky leaking into a picture. | *Picture with a glass border inside the glass:* the border tints the picture's edge pixels on screen. |
| D-5 | **Four materials, chosen by job, not by taste.** Thin for small labels on the sky; Regular for fixed chrome; Raised for things that open; Slate for reading. | Each step up is more opaque and more dimmed, so the surfaces that carry the most text are the safest. Matches Apple's thickness ladder. | *One material:* either too thin for sheets or too heavy for chips. |
| D-6 | **The governor decides once, early: Glass or Solid.** Software renderers start Solid; otherwise the first 1.5 s of glass over the moving sky is timed against the display's own pace (section 6). Phones start Solid. | `backdrop-filter` re-blurs every frame over the WebGL sky. One reviewer measured glass doubling frame time in software rendering. A decision in the first seconds protects the judge's first minute. | *A slow three-level ladder (Glass → Lite → Solid over 90 frames):* may not decide in time, and Lite was not measured cheaper. *A fixed 22 ms threshold:* misfires at 30 fps (iOS Low Power Mode). *Chromium-only memory hints for phones:* iPhones never report them. |
| D-7 | **An in-app "Panels: Glass / Solid" setting.** | Safari never tells pages about iOS Reduce Transparency; some people simply prefer solid. | *Media query only:* misses every iPhone. |
| D-8 | **No new hue for rewards.** A learned skill gets a white check mark; one not yet learned is plain text. Nothing is locked. | v1's Two Inks rule: a hue on chrome must mean "press" or be data. An early draft used gold, which sat too close to Path Amber, the colour of *simulated*. A reward that looks like "simulated" is an honesty bug. | *Gold, green or violet:* each already has a job. |
| D-9 | **Two Arabic tokens. `--arabic-display` is Ruqaa (Aref Ruqaa Bold) for the Sima wordmark only. `--arabic-text` is a plain text face for Arabic star names and any small Arabic** (mockups: Noto Sans Arabic). Reem Kufi is used nowhere (product owner). | Ruqaa is the everyday hand of written Arabic, so سيما reads as a mark: "a sign or a mark", as the name says. At 17 px a calligraphic hand reads smaller than the Latin beside it (Opus); names need a plain face. | *Ruqaa for names too:* hard to read small. *Noto Kufi for the mark:* generic. *Reem Kufi or Reem Kufi Ink:* excluded. |
| D-10 | **The Latin "Sima" in the wordmark is Archivo 600.** | Aref Ruqaa's Latin is a serif that does not match; v1's reason for a two-script face no longer holds. | *Arabic display font for both scripts:* mismatched Latin. |
| D-11 | **At full zoom-out the sky is a globe seen from outside** (Aladin Lite's SIN view), on empty blue-black space, with a faint limb glow in the hue of the detector shown; the sky note names the detector in words. The intro draws its own globe; the page's globe **cross-fades** in after it (section 11). | Product owner's decision. It makes "the whole sky" a thing a beginner can hold, and echoes the intro's globe and ring. | *Window-filling projection at all zooms:* hides that the sky is a sphere. *Claiming an exact hand-over:* the intro's globe is its own shader (`src/intro/sphere.ts`), not Aladin; they will not match pixel for pixel. *White glow:* one reviewer's choice; the team kept the detector hue, faint, because it is data colour named in words. |
| D-12 | **Discover's text is one step larger** (body 16, supporting 14) than Expert's (body 14, supporting 12). | Beginners read sentences; experts scan numbers. Glass adds a little visual noise; larger text absorbs it. | *One scale:* either Expert loses room at 1366 or Discover feels small. |
| D-13 | **Phones start Solid, and the phone sheet is Slate at every height and never covers the picture.** The visitor can turn Glass on in Settings. | The old phone mockups put 53–65% of the window under blur on the weakest hardware, and the success sheet covered the picture (both reviews). Nobody has measured a real phone yet. | *Glass sheets at Lite:* still covers the picture; Lite unmeasured. |

## 3. Colours

Every job is carried from v1. Only the values change, because the surface is now dark.

### Working colours
- **Press Ultramarine** (`action` `#3f5cf5`): fills of Play and of the one primary button per
  surface; the focus ring; the caret; the "on" side of a switch. White text on it is 5.2:1. Hover
  is `action-hi` (`#2f4be0`, 6.6:1). Never used for text on glass (Fluent's rule, and too dark on
  Night): links are `on-glass` with an underline.
- **Ultramarine Wash** (`action-soft`): a pressed or open control. Its text is `on-action-soft`.
- **Marker Magenta** (`mark` `#ff4a9c`): where you are looking. The patch, the tether, playheads,
  the found ring in a mission, the current date chip's ring. On Night glass the bright magenta is
  used everywhere. Magenta is a mark, not text (4.2:1 on
  glass): a magenta tag carries dark text (`#1a0510`) on a magenta fill.
- **Path Amber** (`path`): worked out, not observed: predicted paths, the motion handle, simulated
  outlines, and the "Simulated" pill. Unchanged.
- **Detector hues** `d1`–`d6`, **pass tints** `p1`–`p4`: unchanged. The globe's limb glow uses the
  shown detector's hue, faintly (D-11); the sky note names the detector in words ("SPHEREx D3,
  near infrared, 1.67–1.79 µm").
- **Status**: `good`, `warn`, `bad` on their soft fills, always with words. Night values are
  lighter so they pass 4.5:1 on any material (good 8.1:1, warn 8.5:1, bad 5.8:1 on Raised over
  white).
- **Skill** (`skill`): white. Only for the "learned" check marks, the "Mission complete" pill and
  the Discover hint bulb. No glow. See D-8.

### Text on glass (Night)
- `on-glass` `#f3f5fb`: titles, values, body.
- `on-glass-2` `#c3cadf`: supporting text, unselected choices.
- `on-glass-3` `#aab2cf`: group labels, scale lettering, hints, placeholders.
Every one of them passes 4.5:1 on every material over the worst backdrop (section 4.4). There is
no fourth, fainter level (Apple: no quaternary text on thin materials).

### Fills inside glass
White at 7% (`fill-1`, quiet buttons, troughs), 12% (`fill-2`, hover) and 18% (`fill-3`, the
chosen segment). Lines between sections are white at 10% (`rule`).

Chart glass (a light theme) is not in v2.0; its recipe and measurements are kept in section 14.

### Named rules
- **The Two Inks Rule** (carried): chrome is glass and its inks. A hue on glass means "press"
  (ultramarine), "look here" (magenta), or it is data.
- **The One Mark Rule, The Rainbow Rule, The Honesty Rule, The Grey Map Rule** (carried).
- **The No Reward Hue Rule** (new): progress and rewards use white light, never a hue (D-8).

## 4. Materials

### 4.1 The four materials and the fallback

| Material | Recipe | Used for |
|---|---|---|
| **Thin** | blur 16 px · saturate 1.5 · brightness .55 · tint 62% | Chips, sky labels over bright sky, "Drag to turn the sky" |
| **Regular** | blur 24 px · saturate 1.6 · brightness .50 · tint 62% | Top row, rail, bar, the Discover mission list |
| **Raised** | blur 32 px · saturate 1.6 · brightness .45 · tint 70% | Popovers, menus, the place card, the mission card, success card, welcome, coach cards, toasts, tooltips |
| **Slate** | no blur · tint 96% · a 4% white top gradient | The frame (Discover and Expert), Measure, picture tools, About, dialogs, Share, **the phone sheet and phone pages** |
| **Solid** (fallback) | no blur · tint 95% | Every glass material when glass is off (section 5), and on phones by default |

CSS, Regular, Night (the others change only the numbers):

```css
.glass {
  background: rgb(11 14 28 / .62);
  -webkit-backdrop-filter: blur(24px) saturate(1.6) brightness(.5);
  backdrop-filter: blur(24px) saturate(1.6) brightness(.5);
  box-shadow: 0 1px 1px rgb(0 0 0 / .35), 0 10px 28px -10px rgb(0 0 0 / .6);
}
```

### 4.2 Anatomy: what makes it premium rather than grey

From back to front, on every glass and slate surface:

1. **Backdrop dimming and saturation** (in `backdrop-filter`): the sky behind is blurred, its
   colour is kept (`saturate`) and its brightness capped (`brightness`). Without `saturate` the
   blurred sky turns a muddy grey.
2. **Tint**: one flat colour at the material's opacity.
3. **Grain**: 3.5% fractal noise (`feTurbulence`, 160 px tile, `mix-blend-mode: overlay`) on a
   `::before`. It makes the surface read as a material and hides banding in the blur. (Fluent
   uses 2% on a lighter base.)
4. **Specular rim**: a 1 px border drawn on `::after` with a mask, white at 30% on the top edge,
   fading to 5% by 38% of the height and rising to 9% at the bottom: light catching a glass edge.
5. **Shadow**: a sharp key shadow plus a soft ambient one (`lift-1` for Regular and Thin,
   `lift-2` for Raised and Slate). Two levels, not one (v1's One Lift Rule is replaced): things
   that open sit higher than things that stay.
6. **Content**: text and controls. Inside glass, depth comes from fills (`fill-1` to `fill-3`), never
   from another glass layer.

### 4.3 Named rules

- **The Well Rule.** Pictures, charts, histograms, detector thumbnails and cutouts sit in opaque
  wells: `#000` for pictures, `st-bg` for charts, 10 px corners, a 1 px inner line at white 8%.
  No blur, tint, grain, rim or transparency ever touches a well. Badges over a picture use the v1
  dark badge (`rgb(9 13 28 / .82)`), not glass.
- **The Flat Glass Rule.** Glass is never inside glass, and a glass element is never inside an
  element with `opacity` < 1, `filter`, `mask`, `clip-path`, `mix-blend-mode` or its own
  `backdrop-filter` (each makes a "backdrop root" and the inner glass stops seeing the sky).
  Fade glass elements one by one, never their container. Inside glass, use fills.
- **The Brightest Sky Rule.** A text colour may be used on a material only if it passes 4.5:1
  over pure white, Betelgeuse's glare and the Milky Way core after that material's blur, dimming
  and tint (WCAG F83). Section 4.4 is the evidence; `mockups/tests/` is the test.
- **The No Animated Blur Rule.** Never transition `backdrop-filter` or its blur radius. Fade
  opacity and move with `transform` only.
- **The Rest Rule.** At rest, glass does not cover the patch, the found object or the picture
  (Apple: avoid intersections in steady states). Placement code (`frameRect`, `keepClear`) already
  enforces this for cards; Discover adds its cards to the keep-clear list.

### 4.4 Measured contrast (material samples)

These are **samples of the materials**, not a pass for every component. The build must also test
final component states (filled rows, pills, disabled controls, focus rings) with grain on
(acceptance check GLS-2). Rendered in headless Chromium on 15 November 2026 (`mockups/tests/contrast.html`,
`render_contrast.mjs`, `measure_contrast.py`). Each value is the lowest contrast of that text
colour against the brightest 2% of panel pixels over four backdrops: pure
white, the sky's black, Betelgeuse's glare and the Milky Way core. Target 4.5:1.

| Theme | Material | on-glass | on-glass-2 | on-glass-3 | Worst backdrop |
|---|---|---|---|---|---|
| Night | Thin | 9.5 | 6.3 | 4.9 | white |
| Night | Regular | 10.2 | 6.8 | 5.3 | white |
| Night | Raised | 12.4 | 8.3 | 6.4 | Betelgeuse |
| Night | Slate | 16.1 | 10.7 | 8.3 | Betelgeuse |
| Night | Solid | 15.7 | 10.5 | 8.1 | Betelgeuse |

Limits of this evidence: Chromium with SwiftShader, sRGB compositing as Chrome does it; a fixed
central sample region, ignoring the brightest 2%, so a small glare right under one glyph can be
worse. Safari and Firefox blend the same way per spec, but the build must run this test in each
(acceptance check GLS-3). Non-text parts: the 1 px rim and control fills are decoration; the boundary of every
control that needs one (fields, the date and wavelength handles, the switch) is 3:1 or more by its
own fill or ring, not by the rim.

## 5. Fallbacks and settings

| Condition | What happens | How it is detected |
|---|---|---|
| The user picks **Panels: Solid** | All glass → Solid. Remembered in `sima-panels`. | Settings popover (Discover and Expert) |
| `prefers-reduced-transparency: reduce` | Solid, unless the user picked Glass in settings | Media query (Chrome, Edge) |
| `prefers-contrast: more` | Solid, rules at white 28%, `on-glass-2` and `-3` become `on-glass`, a 1 px `on-glass` border on every card | Media query |
| `forced-colors: active` | No backdrop, no shadow, no grain, no rim. Every card gets a 1 px `CanvasText` border; buttons use `ButtonText`/`ButtonFace`; the patch and marks use `Highlight` | Media query |
| No `backdrop-filter` support | Solid | `@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))` |
| A phone (coarse pointer and narrower than 700 px) | Solid, unless the user picked Glass | `matchMedia('(pointer: coarse) and (max-width: 699px)')` |
| The governor's early check fails | Solid for the rest of the visit, remembered for this browser | Section 6 |
| `embed=1` | Solid, no shadows, no rounded outer corners (v1 embed rule) | Link |
| Printing | Solid; the pictures print as shown | `@media print` |

**Order when they disagree**: `forced-colors` and `prefers-contrast: more` always win (accessibility).
Then the user's own choice in Settings. Then `prefers-reduced-transparency`, no support, the phone
rule and the governor, any of which gives Solid.

The page sets `html[data-glass="glass" | "solid"]`. Every glass rule keys off this attribute; no lane
reads the media queries itself. (No Lite level in v2.0: a reviewer measured it no cheaper in
software rendering, and nobody has measured it on a GPU.)

## 6. Performance

Glass is drawn by the GPU every time the sky behind it changes. SPEC 11.2's budgets still hold;
these are added.

| Thing | Budget | How it is checked |
|---|---|---|
| Blurred area at 1900×1030, any screen | ≤ 25% of the window | Sum of the rects of every element with a `backdrop-filter`, in the smoke test (`mockups/tests/glass_area.mjs` does this for the mockups) |
| Blurred area at 1366×768, any screen | ≤ 30% | Same |
| Blurred area on phones | 0% by default (Solid). With Glass chosen: ≤ 15% (top row and chips only; the sheet is Slate) | Same, at 390×844 |
| Blurred device pixels on large screens | ≤ 1.5 million device pixels (area × `devicePixelRatio`²) | Same, at 3840×2160, DPR 2 |
| Blur radius | ≤ 32 px | Token check |

| Sky pan with glass on, reference laptop (integrated GPU, 1900×1030) | p95 frame ≤ 20 ms; no main-thread task over 100 ms | Manual pass (SPEC 11.4), paired Glass and Solid runs on the moving sky at native DPR |
| Frame step, starter playing, sky wavelength change | Unchanged (SPEC 11.2) | Unchanged |

The blurred area is a guard, not a cost measurement: it ignores DPR and the blur's reach outside an
element (Codex 10). Real cost is checked by the paired runs above, on a reference laptop, a weaker
Android phone and an iPhone, on day 5 of the build. If that check cannot be run, desktops keep the
early check and phones stay Solid.

Measured on the revised mockups (15 Nov 2026), share of the window under glass:

| Screen | 1900×1030 | 1366×768 | 390×844 (Solid) |
|---|---|---|---|
| 01 First run | 12% | 23% | 0% |
| 02 Discover home | 14% | 24% | 0% |
| 03 Mission in progress | 13% | 25% | 0% |
| 04 Mission success | 14% | 27% | 0% |
| 05 Switch to Expert | 14% | 24% | 0% |
| 06 Expert workspace | 10% | 17% | 0% |
| 07 Place card | 13% | 24% | 0% |

The home screen fell from 23% / 39% to 14% / 24% when the dock was removed.

**The governor** (lane F, `shell/glass.ts`) makes **one decision, early**:

1. **Software renderer → Solid at once.** If the WebGL renderer string (`WEBGL_debug_renderer_info`,
   where available) contains "SwiftShader", "llvmpipe" or "Software", start Solid.
2. **Otherwise, time the first glass over moving sky.** The first 1.5 s in which glass sits over a
   moving sky: the welcome card fading in while the globe settles after the intro, or a repeat
   visit's landing, or the first drag. Only while the tab is visible; gaps after a hidden tab or
   a resume are ignored.
3. **Judge against the display's own pace.** The pace is the shortest gap seen (about 16.7 ms at
   60 Hz, 33 ms when the browser caps at 30). A frame is dropped when its gap is over 1.5× the
   pace. **Solid** if more than 25% of frames dropped, or if two gaps were over 50 ms.
4. **Never back up during the visit.** The result is kept for this browser (`sima-panels-auto`),
   so the next visit starts right. Settings says "Panels are solid because the sky was slow with
   glass on" with **Try glass again**, which clears it.
5. The visitor's own choice wins, and is never overruled by the check. Phones start Solid
   (section 5) and run no check unless the visitor turns Glass on.

**Why not "glass off while panning".** Swapping looks while the user drags is a visible flicker on
every pan. The governor decides once.

## 7. Typography

- **UI face: Archivo** (carried): variable 100–900, tabular figures on the body, primes and µ.
- **Arabic display font: the token `--arabic-display`**, Ruqaa, **for the Sima wordmark only**.
  The mockups use **Aref Ruqaa Bold** (SIL OFL 1.1, `github.com/google/fonts/ofl/arefruqaa`; file
  and licence in `mockups/fonts/`). Sizes: 30 px in the wordmark pill, 34 px on the welcome card.
  Reem Kufi is used nowhere (product owner).
- **Arabic text font: the token `--arabic-text`**, a plain face for Arabic star names on place
  cards, labels and search results, and any other Arabic text at small sizes. The mockups use
  **Noto Sans Arabic** (SIL OFL 1.1, from the Google Fonts repository; file and licence in
  `mockups/fonts/`). Never under 14 px. Arabic inside a Latin line sits in a `<bdi>`.
- **The wordmark**: سيما in the Arabic display font, then "Sima" in Archivo 600 at 17 px with
  0.02em tracking (D-10).

### Sizes

| Role | Expert | Discover |
|---|---|---|
| Headline (one big number, welcome, mission title, success) | 600 · 25 px · 1.15 · −0.02em | same |
| Title (place name, object, sheet title) | 600 · 17 px · 1.2 | same |
| Body (sentences) | 400 · 14 px · 1.45 | 400 · 16 px · 1.55 |
| Control (buttons, tabs, segments) | 500 · 14 px | 500 · 14 px; 16 px on large buttons |
| Supporting line | 500 · 12 px · 1.4 | 400 · 14 px · 1.45 |
| Label (group labels, pills, tooltips, data lines) | 500/600 · 12 px | same |
| Scale (ruled scales, axes only) | 400 · 11 px | same |
| Reading (About) | 400 · 16 px · 1.6, 72ch | same |

**The Size Ladder Rule** (replaces the Five Sizes Rule): interface text uses only 11, 12, 14, 16,
17 or 25 px; 11 only on scales and axes; 16 only for Discover body text, large buttons and
reading. Wordmark sizes are exempt.

**The Weight on Glass Rule** (new): sentences on glass are at least 14 px; text under 14 px on glass
(labels, pills, data lines) is weight 500 or more. Thin strokes lose to the grain and the blur
behind. Chart axes are at least 11 px.

## 8. Layout

### 8.1 Expert (desktop)

Carried from v1: the sky fills the window; top left wordmark and search, chips under them; top
right actions; rail on the left; the frame hanging from the top right; Measure beside it; the bar
at the bottom; the sky note bottom left. Changes:

- **Top right** gains the **view switch** (Discover | Expert, section 9) as its own glass pill,
  right of Guide, Places, Share and About.
- The first-visit coach card for Expert sits in the free sky left of the frame; it never covers the
  frame, Measure's numbers or the switch.
- **The frame, Measure and picture tools** are Slate (D-3).
- **The sky note** sits below the bar as plain text with a dark halo, not glass, to keep blurred
  area down (it is one line over the sky; it gets a Thin chip only over a bright sky, as labels do).
- At full zoom-out, the globe sits in the space left of the frame and Measure (8.4).

### 8.2 Discover (desktop)

See `BEGINNER-AND-MOBILE.md` for screens and flows. Layout:

- **Top left**: wordmark pill; "Find a star, galaxy or nebula" (Thin, 340 px).
- **Top right**: Settings and About (one Regular pill); the view switch.
- **Left**: the mission list (Regular, 372 px), from 76 px down, with the skills record in its
  header. Under 820 px tall its rows show one line and it scrolls inside; it never covers the sky
  note.
- **During a mission**: the Discover frame (Slate, picture `min(560px, 100vh − 330px)`) at the
  right, and the mission card (Raised, 380 px) **directly left of the frame** with a 16 px gap,
  so the instruction sits next to the picture. Under 1500 px wide the card sits at the left edge.
  After success the card becomes the success card (Raised, 420 px).
- **Centre**: the sky. At home it is the globe (8.4).
- There is no dock: the mission list is the one place to start the next mission.

### 8.3 Phones (under 700 px)

Full rules in `BEGINNER-AND-MOBILE.md` section 11. In short:

- **Solid by default** (D-13). Gutter 12 px.
- **Top row 56 px** with 48 px hit areas: wordmark pill, a menu button (Find, Settings, Share,
  About), the view switch.
- **Two layouts, chosen from the visual viewport**: *fit* (the frame, then one Slate sheet under
  it) when the picture can be at least 240 px; otherwise *scroll* (one vertically scrolling
  column, no sheet). Rotation and very short screens use *scroll*.
- **The sheet**: Slate at every height, 28 px top corners, a grabber button; two heights (peek,
  half), a tap toggles; Back returns to what was there before. It never covers the picture: the
  picture shrinks to fit above it, down to 240 px.
- The frame's header carries the full data line (source, release, date, wavelength).
- Every hit area is at least 48 × 48 px with 8 px between.
- The intro still plays and cross-fades to the Discover globe.

### 8.4 The globe (full zoom-out)

- Below about 150° wide the sky fills the window as today (stereographic). Zooming out past that,
  the sky switches to **SIN** (Aladin Lite's `setProjection`): the whole visible half of the sky as
  a globe seen from outside. Changing projection is a jump in Aladin, so it is covered by a 0.3 s
  cross-fade both ways. Lane C proves this in a half-day spike before building on it; if it fails,
  Discover's home uses today's sky at its widest zoom.
- **Space** around the globe is empty blue-black (`sky`) with a very soft radial lift
  (`#0b1020` at the globe's centre to `sky` at 1.1 diameters). No stars outside: nothing lies outside
  the celestial sphere.
- **Limb glow**: `0 0 0 1px` + `0 0 40px` + `0 0 140px` in the hue of the detector shown, at 24%,
  16% and 7%: faint. It changes with the shown detector, and the sky note names the detector in
  words.
- **Size and place**: the globe is centred in the free space, not the window: Discover home,
  right of the mission list (`min(800px, 100vh − 160px)` at 1900); first run, right of the welcome
  card, which overlaps the globe's edge by about 40 px so the glass shows the sky through it
  (`min(880px, 100vh − 140px)`); Expert, left of the frame and Measure; phone, at the top,
  `100vw − 48px` to `100vw − 96px`, above the sheet.
- **On it**: places and mission beacons as on the sky. Things on the far side are not drawn.
  Starting a mission turns the globe to its target. (Limb tags for far-side objects are later.)
- **Drag turns the globe**; it does not move the globe across the screen. A one-time Thin tag
  "Drag to turn the sky" sits at its upper right on first run (desktop only).

### 8.5 Stacking order

From the back: space, sky (or globe), marks on the sky, sky note, frame and rail, bar, mission list
or card, top row, popovers, the phone sheet, phone pages, coach and tip cards, toast. The intro,
while it plays, covers all of them (carried).

## 9. Components

Carried components keep their v1 behaviour; only their surface changes to the material named.

### Buttons
- 36 px tall (Expert) or 48 px (`.lg`, Discover's main actions, phones), 12 px corners, 14 px
  medium text, optional 20 px icon 8 px before the label.
- **Primary**: `action` fill, white text, an inner top highlight (`inset 0 1px 0` white 22%) and a
  soft ultramarine glow under it (`0 6px 18px -6px` `action` at 70%). One per surface.
- **Default**: `fill-1`; hover `fill-2`. **Quiet**: transparent; hover `fill-1`.
- **On / open**: `action-soft` fill, `on-action-soft` text.
- **Text link**: `on-glass` with an underline at white 35%, 4 px offset. Never ultramarine text.
- Press moves 1 px down; focus is a 2 px `action` outline 2 px away, plus a 2 px white halo on
  Night so the ring shows over dark glass (`0 0 0 4px rgb(255 255 255 / .9)` outside the outline).

### Play
Carried: the only round filled control in Expert (46 px). Discover's Play is 56 px.

### The view switch (new)
A Regular pill, 46 px tall (48 px segments on phones), two segments: **Discover** and **Expert**, each with
an icon on desktop. The chosen one is a `fill-3` tile with `on-glass` text. It is a real
`role="radiogroup"` with arrow-key movement. It is always on screen, top right, in both views.

### Segmented control, tabs, switches, status pills, tooltips
Carried, on glass: troughs `fill-1`, chosen segment `fill-3` with a 1 px inner top highlight; the
chosen tab is `on-glass` with a 2 px `on-glass` underline (not ultramarine: no accent text on
glass); switches `fill-2` off, `action` on; pills as in section 3; tooltips Raised, 12 px.

### Cards and sheets
- Corner radius by size: chips and tags 8 px or full pill; controls 12 px; cards 18 px; the frame
  20 px; the bar 24 px; welcome and success cards 24–26 px; phone sheets 28 px top.
  **Concentric rule**: an inner corner = outer corner − padding (a 12 px button in a 24 px bar with
  12 px padding), so curves stay parallel.
- Padding: 16–22 px in cards, 12 px in the frame, 14 × 18 px in Measure.

### Data windows (wells)
See the Well Rule. Carried: hard pixel edges, the pass-tint edge line while pictures flip (3 px),
hard cuts, the 2.5 per second cap.

### The date scale and the wavelength scale (signatures)
Carried exactly, drawn on the Regular bar: ticks `on-glass-3` (major) and white 22% (minor);
passes white 55%; visit dots `on-glass`; the playhead and handle in `mark` with a 2 px tint-coloured
border; detector strip in `d1`–`d6`; band-edge ticks `on-glass`. Discover replaces the date scale
with **date chips** (one per group of dates: letter in its pass tint, month and year, the current
one ringed in `mark`).

### Marks on the sky
Carried, plus:
- **Labels over a bright sky** sit on a Thin chip. Lane C samples the map under each label (the
  tile's mean brightness at that spot); above 0.4 (linear) the label gets the chip. Without this a
  white label vanishes in a bright star's glare (seen in `07-place-card`).
- **Mission beacons** (Discover): a 44 px ring in `mark` with a 14 px dot (48 px hit area); a done
  mission's ring turns white; a Thin tag names the object and the mission. Tags stay inside the
  window and never cover their own beacon or the sky note.

### The Discover frame, mission list, mission card, step list, hint, success card, coach card
Defined with their states in `BEGINNER-AND-MOBILE.md` section 6.

## 10. Motion

Carried: panels fade (0.18 s) and settle 6–14 px (0.32 s, `ease`); the frame glides (0.42 s);
pictures hard-cut; the sky cross-fades wavelength (0.26 s); loading shows only when it lasts;
reduced motion keeps fades only.

New:
- **Glass enters by opacity and transform on the glass element itself** (Flat Glass Rule), never
  by fading a parent, never by animating blur.
- **Zoom to globe**: the camera zooms continuously; the projection change at about 150° is covered by
  a 0.3 s cross-fade (8.4).
- **Mission start**: the globe turns to the target and the camera flies to the patch (0.6 s), then
  the frame and mission card rise (0.32 s). The pictures were loaded before (they are ready in under
  1 s). Reduced motion: a 0.3 s cross-fade to the patch.
- **Skill learned**: the check mark fades in (0.18 s). No sweep, no glow, no confetti, no sound.
- **View switch**: the frame glides from its Discover place to its Expert place (0.42 s) while
  Discover's cards fade out and Expert's fade in (0.18 s), one movement at a time (GEN-5).

## 11. The intro and the hand-off

The intro (DESIGN.md "Intro", merged 15 November) is carried with two changes:

1. **First visit, Discover**: the turn ends with Barnard's Star facing us. Instead of the dive,
   the page's globe (Aladin, SIN) **cross-fades in over 0.4 s** at its first-run place while the
   intro's own globe fades out; the intro already uses a 0.4 s cross-fade (`T.crossfade`). The two
   globes are drawn by different code (`src/intro/sphere.ts` and Aladin) and are not claimed to
   match pixel for pixel. Then the welcome card, top row and sky note fade in (0.18 s). Barnard's
   Star's pictures load during the intro, so "Start your first mission" opens them at once.
2. **Links that open a patch, Expert visits and repeat visits** keep today's landing (dive to the
   patch, cards fade in).

The ring's detector hue lives on as the globe's limb glow. The intro's line ("SPHEREx all-sky map,
NASA IRSA (DR1) · average of all dates · …") becomes the sky note, which is where the eye finds it.

## 12. Interaction

Carried (map and video player behaviour, keys, loading always says what and how far, a click on the
sky asks first). Added:

- **Phones**: one finger pans or turns the globe; two fingers zoom; a tap on a beacon or place
  opens its card in the sheet; a tap on the picture answers a mission step; a tap on the sheet's
  grabber (a button) toggles peek and half. No drag on the sheet in v2.0.
- **Keys in Discover**: Space plays, ← → step dates, Escape closes the top card. In the picture,
  the existing key picker: the arrow keys move a crosshair one pixel (Shift for more) and Enter
  answers. `H` asks for a hint **only while focus is in the mission card or the picture** (WCAG
  2.1.4).
- **The view switch** is reached with Tab and moved with the arrow keys. No letter shortcut.

## 13. Do's and don'ts

### Do
- **Do** put every picture and chart in an opaque well.
- **Do** pick the material by job: Thin for labels, Regular for chrome, Raised for what opens,
  Slate for reading.
- **Do** test every new text colour with `mockups/tests/` over the four backdrops.
- **Do** fade glass elements themselves; keep their ancestors free of opacity, filter and mask.
- **Do** give every surface its rim, grain and two-part shadow; that is what makes it glass.
- **Do** keep one primary button per surface, and Play as Expert's only round filled control.
- **Do** say the detector in words wherever its hue appears (limb glow, strip, chart points).
- **Do** put labels over bright sky on a Thin chip.

### Don't
- **Don't** blur, tint, dim or put glass over a picture, chart, cutout or histogram.
- **Don't** nest glass, or put glass inside a faded, filtered or masked parent.
- **Don't** animate `backdrop-filter`.
- **Don't** use ultramarine or magenta for text on glass; use `on-glass` and words.
- **Don't** add a reward hue, points, streaks or confetti.
- **Don't** use a text colour fainter than `on-glass-3`, or text under 14 px at weight 400 on glass.
- **Don't** make the frame or the big reading panels glass.
- **Don't** draw stars outside the globe.
- **Don't** use Reem Kufi. Use `--arabic-display` only for the wordmark and `--arabic-text` for
  every other Arabic word.
- **Don't** put anything over the picture on phones: the sheet sits under it.
- **Don't** lock a tool behind a mission.
- Everything in v1's don't list still holds (no magenta buttons, no detector hues outside
  detectors, no status colours without words, no recolouring the sky map, no fades between
  pictures, no simulated data in the look of real data, no neon space dashboard).

## 14. Later (not in v2.0)

**Chart glass (light theme).** The v1 printed chart, frosted: tint `rgb(246 243 236)`, ink
`#0f1a3c`, `#343f6a`, `#4a5479`; ultramarine `#2740e0` (hover `#1a2fc0`); v1's status colours
(good `#12754a`, warn `#8a5200`, bad `#b3262f`); skill ink `#0f1a3c`. The backdrop is brightened
(`brightness` 1.35 / 1.40 / 1.45 for Thin / Regular / Raised, `saturate` 1.3) and the tint is denser
(84 / 85 / 88%); the rim is white 85% → 25%. Measured with the same method (lowest contrast,
darkest 2% of pixels, worst backdrop black): Thin 10.7 / 6.4 / 4.7, Regular 11.1 / 6.6 / 4.8,
Raised 11.8 / 7.1 / 5.2, Slate 14.1 / 8.4 / 6.1, Solid 13.8 / 8.2 / 6.0 (on-glass / -2 / -3). The
values stay in `mockups/glass.css` under `[data-theme='chart']`.

**Lite glass** (half blur, no `saturate`, tint +0.12): only if measured cheaper than Glass on real
GPUs.
