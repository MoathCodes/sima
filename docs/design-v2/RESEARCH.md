# Design v2 research: glass, beginners and phones

What we studied before designing Sima v2, with links, and the principles we took from it. Written
15 November 2026. The design itself is in `DESIGN-v2.md` and `BEGINNER-AND-MOBILE.md`.

**In one paragraph.** Glass looks premium when it is used for a few controls, keeps text strong, and
shows craft in small details (an edge highlight, a little grain, a two-part shadow). It looks cheap
when everything is glass, when text sits on thin glass over bright content, and when the blur is
the only idea. Apple and Microsoft both pulled back from clear glass after people could not read it.
For Sima the hard case is a bright, busy, moving star field, so the answer is dark "smoked" glass
that dims what is behind it, measured against the brightest sky we have, with science pictures kept
out of the glass entirely. For beginners, research says points and streaks do little; feeling able
to do something does. So rewards are real tools that unlock.

## 1. What we looked at

### 1.1 The running app (our own baseline)

We ran the current build (`rebuild` at `2ff3446`, then merged `0f40013` with the intro) and captured
it at 1900×1030, 1366×768 and 390×844. The captures are the backgrounds of every mockup
(`mockups/img/`). What we saw:

- The sky map is mostly dark with fine stars, but it has three bright cases a panel must survive:
  the Milky Way band at wide zoom, the glare of a bright star such as Betelgeuse (a white disc
  about 300 px across at the default zoom), and the sky map's soft grey while tiles load.
- Today's cards are opaque pale paper (DESIGN.md "Printed Sky Chart"). They read well, but against
  the dark sky and the new dark intro they are the brightest thing on screen, brighter than the
  data.
- On a phone the app shows only "Sima is made for a desktop screen" (O-W3).
- The intro (merged 15 Nov) is dark: a black globe, a ring of real sky light in the detector hues,
  white Kufic name. It then lands on the default zoom and the pale cards fade in. The jump from the
  dark, quiet intro to bright paper cards is the biggest change of mood in the whole visit.

### 1.2 Apple

- **Two kinds of material.** Liquid Glass is "a distinct functional layer for controls and
  navigation… that floats above the content layer". Standard materials give structure inside
  content. "Don't use Liquid Glass in the content layer." "Use Liquid Glass effects sparingly."
  ([HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials))
- **Thickness.** iOS has ultra-thin, thin, regular and thick materials. Thicker is more opaque and
  better for text with fine detail. Avoid the faintest (quaternary) text on thin materials. (Same
  page.)
- **Vibrancy.** visionOS brightens text "by pulling light and color forward from what's behind it",
  updated in real time. ([WWDC23 "Principles of spatial design"](https://developer.apple.com/videos/play/wwdc2023/10076/))
  On the web, `mix-blend-mode: plus-lighter` works in Chrome, Firefox and Safari; `plus-darker` is
  effectively Safari only ([Blink intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/KXAJlJsbBak/m/JisA_CS2AAAJ),
  [Mozilla bug 1746248](https://bugzilla.mozilla.org/show_bug.cgi?id=1746248)). Apple publishes no
  recipe for vibrancy.
- **Liquid Glass** ([WWDC25 session 219 "Meet Liquid Glass"](https://developer.apple.com/videos/play/wwdc2025/219/)):
  light bends at the edges (lensing); highlights follow the shape; the shadow is stronger over text
  and lighter over plain backgrounds; small elements flip between light and dark, large ones adapt
  but do not flip; tint only the primary action ("When every element is tinted, nothing stands
  out"). The **clear** variant "needs a dimming layer"; use it only over media-rich content, when
  dimming does not hurt the content, and when what sits on it is bold. **No glass on glass.**
  In steady states, keep glass from overlapping key content.
- **Dimming number.** "If the underlying content is bright, consider adding a dark dimming layer of
  35% opacity." ([HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials))
- **Accessibility.** Reduce Transparency makes glass frostier. Increase Contrast makes it mostly
  black or white with a border. Reduce Motion turns off elastic effects. (WWDC25 219)
- **The backlash.** iOS 26 beta 3 made glass frostier after legibility complaints
  ([TechRepublic](https://www.techrepublic.com/article/news-apple-ios-26-beta-3-liquid-glass/)).
  Nielsen Norman Group found text over glass "an illegible mess" in places
  ([NN/g, Oct 2025](https://www.nngroup.com/articles/liquid-glass/)). iOS 26.1 added a "Tinted"
  option that "increases opacity and adds more contrast"
  ([TidBITS](https://tidbits.com/2025/10/21/ios-26-1-to-add-optional-opacity-to-liquid-glass/)).

### 1.3 Microsoft Fluent

- **Acrylic recipe**, from WinUI's own source
  ([AcrylicBrush.h](https://github.com/microsoft/microsoft-ui-xaml/blob/main/controls/dev/Materials/Acrylic/AcrylicBrush.h),
  [AcrylicBrush.cpp](https://github.com/microsoft/microsoft-ui-xaml/blob/main/controls/dev/Materials/Acrylic/AcrylicBrush.cpp)):
  blur radius 30, saturation 1.25, noise at 2% opacity, a 10% white exclusion layer for contrast,
  and a tint whose opacity is capped by its brightness (100% asked gives 45% for white, 85% for
  black). The newer recipe uses a **luminosity blend**: hue and saturation come from behind, but
  brightness comes from the tint, "blocking sharp differences in brightness".
- **Where and when** ([MS Learn: Acrylic](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic)):
  transient surfaces (flyouts, menus); never edge to edge; never stacked; no accent-coloured text
  on acrylic. It is "GPU-intensive" and falls back to a **solid colour** with transparency off, in
  Battery Saver, on low-end hardware, in High Contrast and in inactive windows.
- **Mica** samples the wallpaper once, so it is cheap; it is for long-lived backgrounds
  ([MS Learn: Mica](https://learn.microsoft.com/en-us/windows/apps/design/style/mica)).
- **Fluent 2** shadows pair a sharp "key" shadow with a soft "ambient" one
  ([Fluent 2 Elevation](https://fluent2.microsoft.design/elevation)).

### 1.4 The web platform

- `backdrop-filter` is in about 97% of browsers; ship it with and without the `-webkit-` prefix
  ([caniuse](https://caniuse.com/css-backdrop-filter); a Safari 18.6 bug with the unprefixed form:
  [WebKit 297620](https://bugs.webkit.org/show_bug.cgi?id=297620)).
- **Cost.** "The bigger the image or the bigger the blur radius, the more costly." A blurred,
  promoted element "is re-blurred by the GPU every frame"
  ([Chrome: Animating a blur](https://developer.chrome.com/blog/animated-blur/)). Over a WebGL sky
  that redraws while panning, every glass pixel is blurred again every frame. We found no published
  benchmark for exactly this, so Sima measures it (DESIGN-v2 "Performance").
- **Edges.** Blur only samples what is directly behind the element, so edges look thin; extending
  the backdrop and masking it fixes that
  ([Josh Comeau, "Next-level frosted glass"](https://www.joshwcomeau.com/css/backdrop-filter/)).
  Chrome 129 mirrors at blur edges, which removes edge flicker as content moves
  ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/ZtMnFCHZhMQ/m/ewdpvCq_AQAJ)).
- **Backdrop root (a trap we must design around).** In the Filter Effects 2 spec, an ancestor with
  `opacity` below 1, a `filter`, a `mask`, a `clip-path`, a `backdrop-filter` or a `mix-blend-mode`
  becomes the "backdrop root": glass inside it can only see that ancestor's content, not the sky.
  So fading a container that holds glass, or nesting glass, breaks the blur. Glass elements must be
  faded one by one, and never nested.
- **Settings.** `prefers-reduced-transparency`: Chrome and Edge 118+ only; Safari does not pass the
  iOS setting to pages ([caniuse](https://caniuse.com/mdn-css_at-rules_media_prefers-reduced-transparency),
  [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency)).
  `prefers-contrast`: Chrome 96+, Firefox 101+, Safari 14.1+. `forced-colors`: all three; there,
  shadows and non-image backgrounds are removed, so edges need real borders
  ([MDN forced-colors](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/forced-colors)).

### 1.5 Contrast over a changing background

- WCAG 1.4.3: 4.5:1 for text (3:1 at 24 px, or 18.66 px bold). 1.4.11: 3:1 for parts of controls
  and graphics ([1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
  [1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)).
- Over an image, test against the least contrasting part: "the area of the image that is lightest
  (for light text)" ([failure F83](https://www.w3.org/WAI/WCAG22/Techniques/failures/F83)).
  Accepted fixes are fogging the image behind the text, an outline or a halo
  ([G18](https://www.w3.org/WAI/WCAG22/Techniques/general/G18)).
- No standard says how to measure text over blur. **Our method:** render each material in Chromium
  over pure white, over the sky's black, over Betelgeuse's glare and over the Milky Way; take the
  brightest 2% of panel pixels (darkest 2% for dark text); compute WCAG contrast with each text
  colour. The script and page are `mockups/tests/`. Results are in DESIGN-v2 "Materials".

### 1.6 Learning, games and citizen science

- **Rewards can backfire.** A meta-analysis of 128 experiments found that rewards for doing,
  finishing or performing a task lowered free-choice interest (d = −0.40, −0.36, −0.28)
  ([Deci, Koestner & Ryan 1999](https://pubmed.ncbi.nlm.nih.gov/10589297/)).
- **What gamification does well.** Across 35 studies, effects on autonomy (g = 0.64) and
  relatedness (g = 1.78) were larger than on competence (g = 0.28); points and leaderboards do
  little for feeling able ([Springer 2024](https://link.springer.com/article/10.1007/s11423-023-10337-7)).
- **Duolingo** shows streaks keep people coming back (7-day streak users are 2.4× more likely to
  return next day; a correlation) ([Duolingo](https://blog.duolingo.com/improving-the-streak)), and
  that a rigid path annoys people who want to choose
  ([NBC](https://www.nbcnews.com/tech/tech-news/duolingos-update-redesign-luis-von-ahn-interview-rcna44655)).
- **Citizen science.** Backyard Worlds teaches dipoles, movers and artefacts first, then keeps a
  field guide beside the flipbook ([NASA](https://science.nasa.gov/citizen-science/backyard-worlds-planet-9)).
  Galaxy Zoo Clump Scout mixed expert-labelled images into a volunteer's first ~20 and gave instant
  feedback ([arXiv 2210.03684](https://arxiv.org/pdf/2210.03684)). The main reason Galaxy Zoo
  volunteers take part is to contribute to real science (about 11,000 people surveyed;
  [Raddick et al. 2013](https://arxiv.org/abs/1303.6886)).

### 1.7 Phones

- **Sky apps.** Stellarium Mobile: full-screen sky, small corner icons that "blend into the busy
  starfield", and a bottom sheet with no hint that it expands
  ([Pratt IxD critique](https://ixd.prattsi.org/2025/09/design-critique-stellarium-ios-app/)).
  SkySafari 7 cut its bottom toolbar to five icons
  ([Space.com](https://space.com/sky-safari-7-pro-app-review)).
- **Sheets.** Apple: detents (medium, large), a grabber that works with VoiceOver, nonmodal sheets
  so the view behind stays usable, one sheet at a time
  ([HIG: Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)). Material:
  standard (nonmodal) sheets for content that stays up while a map pans
  ([Material](https://material.io/components/sheets-bottom)).
- **Targets.** 44×44 pt (Apple), 48×48 dp with 8 dp gaps (Android), 24×24 CSS px minimum
  (WCAG 2.5.8) ([Apple](https://developer.apple.com/design/human-interface-guidelines/buttons),
  [Google](https://support.google.com/accessibility/android/answer/7101858),
  [2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

Not verified from a primary source: Star Walk's and Google Earth's phone layouts; Foldit's unlock
system; true refraction with SVG filters inside `backdrop-filter` (reported Chromium-only).

## 2. Principles we drew

Each principle names the decision it led to in DESIGN-v2 or BEGINNER-AND-MOBILE.

1. **Glass is for controls; science is never under or inside glass.** (Apple, Fluent.) Pictures and
   charts sit in opaque wells; the glass is the chrome around them. *Leads to the Well Rule.*
2. **Measure contrast against the brightest sky, after blur.** (WCAG F83.) Every text colour on
   every material passes 4.5:1 over pure white, Betelgeuse and the Milky Way. *Leads to the
   material values and an automated test.*
3. **Smoke, not clear.** The star field is the "media-rich, bright" case where Apple says clear
   glass needs dimming. We dim the backdrop itself (`brightness(0.45–0.55)`) and then tint, which
   keeps the colour of what is behind but caps its brightness, like Fluent's luminosity blend.
   *Leads to Night Glass being dark, and to the dimming term in every recipe.*
4. **Few glass surfaces, thin ones.** Cost grows with blurred area and blur radius, and the sky
   redraws while panning. Big reading panels are opaque "slate". *Leads to the four materials and a
   blurred-area budget.*
5. **Premium comes from details, not from more blur.** Saturation (1.5–1.6) so colour behind does
   not turn grey, 3.5% grain, a 1 px edge that is brighter at the top, a key plus ambient shadow,
   concentric corners. *Leads to the material anatomy.*
6. **One hue that means "press", one that means "look here", the rest is data.** Liquid Glass and
   Fluent both warn against tinting everything. DESIGN.md's colour jobs carry over unchanged.
7. **Never glass on glass, never fade a glass container.** (Apple; the backdrop-root rule.)
   *Leads to the Flat Glass Rule.*
8. **Always a solid fallback, and an in-app switch.** Fluent falls back to solid; Safari hides the
   iOS Reduce Transparency setting from pages. *Leads to the Solid setting and a frame-time
   governor.*
9. **Rewards are abilities, not points.** (Deci et al.; SDT meta-analysis.) A mission unlocks a real
   tool. No streaks, no points, no leaderboard. *Leads to skills.*
10. **Practise on known answers, then do real work, honestly labelled.** (Galaxy Zoo, Backyard
    Worlds.) *Leads to the mission order and to "The real hunt" being ungraded.*
11. **Let people choose.** (Duolingo's path backlash; autonomy.) After the first mission, any
    mission can be played in any order, and Expert is always one press away.
12. **On phones: full-screen sky, one nonmodal sheet with detents, controls in the bottom third,
    48 px targets.** *Leads to the phone layouts.*
13. **Carry the intro through.** The intro is dark, real and quiet; dark glass keeps that mood
    instead of switching to bright paper the moment it ends.
