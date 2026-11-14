---
name: Sima (سيما)
description: A printed sky chart laid over the real infrared sky of SPHEREx.
colors:
  action: "#2740e0"
  action-hi: "#1a2fc0"
  action-soft: "#e1e4fa"
  on-action: "#ffffff"
  mark: "#ff4a9c"
  mark-ink: "#c2135f"
  card: "#f6f3ec"
  card-2: "#ece7da"
  card-3: "#dfd8c8"
  rule: "#d5cebd"
  ink: "#0f1a3c"
  ink-2: "#414c75"
  ink-3: "#626c92"
  sky: "#05070d"
  st-bg: "#090d1c"
  st-raise: "#1a2240"
  st-line: "#27305a"
  st-ink: "#eef0f8"
  st-ink-2: "#aab2d0"
  st-ink-3: "#7c86ab"
  st-accent-2: "#ffb03a"
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
  good: "#12754a"
  good-soft: "#dcefe3"
  warn: "#8a5200"
  warn-soft: "#f5e5c4"
  bad: "#b3262f"
  bad-soft: "#f7dedd"
typography:
  headline:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "25px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  control:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  scale:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1
  reading:
    fontFamily: "'Archivo', 'Helvetica Neue', Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  wordmark:
    fontFamily: "'Reem Kufi', 'Archivo', sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1
rounded:
  tip: "7px"
  window: "8px"
  control: "9px"
  panel: "13px"
  frame: "14px"
  bar: "16px"
  pill: "999px"
spacing:
  group: "2px"
  tight: "6px"
  inset: "10px"
  bar-gap: "14px"
  gutter: "16px"
components:
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  frame:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.frame}"
    padding: "0 10px 10px"
  bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.bar}"
    height: "84px"
    padding: "0 18px 0 12px"
  data-window:
    backgroundColor: "{colors.st-bg}"
    textColor: "{colors.st-ink}"
    rounded: "{rounded.window}"
  button:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 12px"
  button-hover:
    backgroundColor: "{colors.card-3}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
  button-quiet-hover:
    backgroundColor: "{colors.card-2}"
  button-pressed:
    backgroundColor: "{colors.action-soft}"
    textColor: "{colors.action}"
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.action-hi}"
  play-button:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.pill}"
    size: "46px"
  play-button-hover:
    backgroundColor: "{colors.action-hi}"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    size: "36px"
  icon-button-sm:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.window}"
    size: "30px"
  segmented:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    rounded: "10px"
    padding: "3px"
  segmented-item-selected:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.window}"
    height: "32px"
  search-field:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.panel}"
    height: "46px"
    padding: "0 12px 0 13px"
  tooltip:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    typography: "{typography.label}"
    rounded: "{rounded.tip}"
    padding: "5px 9px"
  status-good:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.good}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  status-warn:
    backgroundColor: "{colors.warn-soft}"
    textColor: "{colors.warn}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  status-bad:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  status-neutral:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.ink-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "1px 7px"
  date-stop:
    backgroundColor: "{colors.p1}"
    textColor: "{colors.ink}"
    rounded: "6px"
    size: "20px"
  wavelength-handle:
    backgroundColor: "{colors.mark-ink}"
    rounded: "5px"
    width: "14px"
    height: "20px"
---

# Design System: Sima (سيما)

The product is called سيما, written Sima in Latin letters. It is Arabic for "a sign or a mark", which is what the app is for: the patch you mark on the sky, and the sign that something there moved.

## Overview

**Creative North Star: "The Printed Sky Chart"**

The sky fills the window. The controls are a printed star chart laid over it. Every panel is a pale card with deep-blue ink, like a planisphere. Real data sits in dark windows cut into the card.

Colour has jobs, and each colour has only one. Ultramarine means "you can press this". Magenta means "you are looking here". The rainbow belongs to the six detectors. Everything else on the card is ink. Because the chrome stays in two inks, any hue the user sees is telling them something.

The mood is calm, exact and honest. It is busy only where data is: the picture, the charts and the two ruled scales. This look refuses the dark-navy "space dashboard" with neon accents and a side panel of equal-weight buttons.

**Key Characteristics:**
- The sky is the page. Cards float on it and stay out of its way.
- Two inks for chrome: pale card and deep-blue ink.
- One ultramarine for things you can press. One magenta for where you are looking.
- Data lives in dark windows cut into the card.
- Ruled scales with ticks for date and wavelength, in one bottom bar.
- One grotesque sans (Archivo) with tabular figures, in five sizes; a Kufic wordmark.
- Real, simulated and missing data never look the same.

## Colors

A pale card and one deep-blue ink carry the chrome. Two working colours and a small set of data colours do the rest.

### Primary
- **Press Ultramarine** (`action`): the fill of the Play button and of any primary button, and the colour of links. It is also the focus outline, the text caret, the underline of the chosen tab and the "on" side of a switch.
- **Ultramarine, pressed down** (`action-hi`): the hover fill of a primary button.
- **Ultramarine Wash** (`action-soft`): the background of a control that is on or open (a pressed toggle, an open menu button, the chosen row in a list). Its text and icon turn `action`.
- **On Ultramarine** (`on-action`): text and icons on an ultramarine fill.

### Secondary
- **Marker Magenta** (`mark`): where the user is looking, drawn over dark things. It is the patch outline and its label on the sky, the dotted line from the patch to the frame, and the selection ring and playhead inside dark windows. The canvas code reads it as `--st-accent`.
- **Marker Magenta, on card** (`mark-ink`): the same idea printed on the pale card, where the bright magenta would be too faint. It is the date playhead, the ring on the current date stop and the wavelength handle.

### Tertiary
These are data colours. They never colour chrome.
- **Detector hues** (`d1` violet, `d2` blue, `d3` teal, `d4` lime, `d5` amber, `d6` coral): the six SPHEREx detector bands, shortest wavelength first. They colour the band strip on the wavelength scale, chart points and the "Band" picture colour map.
- **Pass tints** (`p1` to `p4`): four tints of the ink, oldest survey pass first. They colour the date stops, the edge of the picture while it flips, and chart points grouped by date.
- **Path Amber** (`st-accent-2`): things that are worked out and not observed. Inside dark windows it draws the path and the predicted positions. On the sky it is the dashed outline and label of a simulated patch.
- **Real Green** (`good` on `good-soft`): real data, a match with the catalogue, done.
- **Caution Brown** (`warn` on `warn-soft`): simulated data, partly done, a result to treat with care.
- **Flag Red** (`bad` on `bad-soft`): saturated or flagged data, no data at this wavelength, not possible.

### Neutral
- **Chart Card** (`card`): the background of every panel.
- **Card Shade** (`card-2`): quiet button fills, hover rows, the trough of a segmented control, the Share field.
- **Card Deep** (`card-3`): the hover of a quiet fill, the "off" side of a switch, minor ticks, unplayed parts of the date scale.
- **Ruled Line** (`rule`): 1px lines between sections of a panel and between rows of a table.
- **Chart Ink** (`ink`): main text and icons. It is also the fill of tooltips and the toast, with card-coloured text.
- **Soft Ink** (`ink-2`): supporting text, unselected choices, played parts of the date scale.
- **Faint Ink** (`ink-3`): group labels, hints, placeholders, scale lettering and major ticks.
- **Blue-black Sky** (`sky`): the page behind the map.
- **Window Night** (`st-bg`): the background of a dark data window. `st-raise` and `st-line` are its raised fills and its grid lines. `st-ink`, `st-ink-2` and `st-ink-3` are its three text strengths. Catalogue marks in the picture use `st-ink` and are told apart by shape: a circle for Gaia, a square for AllWISE.

### Named Rules
**The Two Inks Rule.** Chrome is card and ink. A hue on a card means one of two things: it can be pressed (ultramarine) or it is data.

**The One Mark Rule.** Magenta marks where the user is looking and nothing else: the patch, the selection, the playheads. It never fills a button and never decorates. Use `mark` on the sky and in dark windows. Use `mark-ink` on the card, because `mark` on card is only 2.8:1.

**The Rainbow Rule.** The six bright hues belong to the six detectors. Dates use the four pass tints. Nothing else may borrow either set.

**The Honesty Rule.** Green, brown and red are only for status labels: what the data is, and whether a step is done. Each one always comes with words. Simulated data also gets a dashed line, so the difference does not rest on colour alone.

**The Grey Map Rule.** The sky map stays grey. A screen-blend layer lifts its black to blue-black on screen and leaves its whites white. Marks ride over the map and never recolour it. Shown larger than its own pixels, the map is softened by about 0.4 of a map pixel (display only), and its small gaps (bright star centres) are filled from their rim; the sky note says so.

## Typography

**Display Font:** Archivo
**Body Font:** Archivo (the same family, variable weight 100 to 900)
**Label/Mono Font:** Archivo for labels. The system monospace (ui-monospace) appears only for code: the link in Share and code in About.
**Wordmark Font:** Reem Kufi, for سيما and Sima in the top-left card, and the Arabic name in About.

**Character:** Archivo is a grotesque from Omnibus-Type, made to work in print and on screen alike. It is compact and a little stiff, like the lettering on a printed chart, with plain, open shapes that stay clear at 11 and 12px. Its tabular figures keep the punctuation narrow ("10.39″" stays one word), so dates and coordinates do not jitter and do not gape. Reem Kufi is a geometric Kufic face; its square, built letters suit a name that means "a sign or a mark", and its Latin letters match its Arabic, so سيما and Sima read as one mark.

**Why these and not others.** Round 1 (Nov 2026) compared on screen: Atkinson Hyperlegible Next (very legible but read as generic here), Readex Pro and Alexandria (good Arabic, but their wide Latin letters cost space on the bar at 1366px), Kufam and Changa (strong Kufic wordmarks, weaker as a pair with the UI face), El Messiri (too soft for a chart). Round 4 replaced the first UI face, IBM Plex Sans: the impeccable skill lists IBM Plex among the faces that mean "you stopped looking", and the team asked for faces that are not the usual AI defaults. Compared on the app's own strings (scratchpad specimen): Schibsted Grotesk (its tabular figures make the full stop and comma as wide as a digit, so "10.39" reads "10 . 39"), Libre Franklin (no tabular figures in the open build), Hanken Grotesk (no prime marks ′ ″, which every coordinate needs). Archivo has the figures, the primes and µ, and the 35 KB Latin file is smaller than Plex's was. An Arabic UI face, if the interface is translated, should be chosen to pair with Archivo (Reem Kufi stays the wordmark).

**Shipping.** Both families are under the SIL Open Font License 1.1. The woff2 files and their licences (`OFL-Archivo.txt`, `OFL-Reem-Kufi.txt`) are in `src/styles/fonts/` and are bundled by Vite; no font host is contacted. The Latin subset covers the app's symbols (µ, ′, ″, −, ·, ×, …); Greek σ falls back to Helvetica Neue or Arial. Text falls back to those faces until the font arrives (`font-display: swap`).

### Hierarchy
- **Headline** (600, 25px, line-height 1.15, letter-spacing -0.02em): the welcome card's heading, the one big measured number in Measure, section headings in About.
- **Title** (600, 17px, line-height 1.2): the name of the place in the frame, the name of the object in Measure, dialog headings, the Latin wordmark.
- **Body** (400, 14px, line-height 1.45): sentences, list rows, table values in the guide.
- **Control** (500, 14px): buttons, tabs, segmented choices. Result names and the wavelength value use 600.
- **Label** (500, 12px, line-height 1.35 to 1.4): supporting lines, tooltips, status labels, provenance lines. Group labels inside panels are 600 in Faint Ink, in sentence case.
- **Scale** (400, 11px): lettering on the ruled scales and under small charts. Nothing else is this small.
- **Reading** (400, 16px, line-height 1.6, lines up to about 72ch): the long text in the About dialog.
- **Wordmark** (Reem Kufi 600): "سيما" at 24px, then "Sima" at 19px, in one card.

### Named Rules
**The Five Sizes Rule.** Interface text is 11, 12, 14, 17 or 25px. The only others are 16px for About's reading text and the wordmark (24px Arabic, 19px Latin), and the name in the opening intro (see Intro).

**The Tabular Figures Rule.** All numbers use tabular figures (set once on the body), so dates, coordinates and counters do not jitter while pictures play.

**The Scale Lettering Rule.** 11px is for scale and axis lettering only. Anything a person must read as a sentence is 12px or larger.

## Layout

The sky map is fixed and fills the whole window. Everything else is a card floating over it in a fixed place. Nothing scrolls the page.

- **Gutter:** cards sit 16px from the window's left and right edges, and 14px from the top.
- **Top left:** the wordmark card and the search field, both 46px tall, 10px apart.
- **Top right:** the page's few actions (Places, Share, About) in one small card.
- **Left edge:** a vertical tool rail for the map, centred on the window's height.
- **Right:** the frame. It hangs from its top right corner, 76px from the top. The user can drag it by its header and size it from its bottom left corner. Its picture is square, 480px by default.
- **Bottom centre:** one bar, 84px tall, 30px above the bottom edge. Left to right: play controls, the date scale, loop and speed, a hairline, the wavelength scale.
- **Bottom corners:** two one-line notes straight on the sky: what the map shows (left) and the pointer's coordinates (right).

Inside a card, buttons in a group sit 2px apart. Related items sit 6px apart. The frame pads its content by 10px. Panels in Measure pad by 14px top and bottom and 16px at the sides.

Stacking order, from the back: sky, marks on the sky, sky notes, frame and rail, bar, top row, popovers, tip card, toast. The opening intro, while it plays, covers all of them (see Intro).

**Two levels.** Explore (the default) shows less: lettered date stops, three ways to view, no counter. Measure shows every visit as a dot on the date scale, six ways to view, and opens the Measure panel beside the frame.

**Measure panel.** Its width is `clamp(380px, 40vw, 760px)`. At 1600px and wider it splits in two: the chart on the left, numbers and lists in a 300px column on the right.

**Narrower windows.** Below 1420px the wavelength's plain name is hidden. Below 1180px the date scale gets shorter. Below 900px the bar wraps onto several rows, button labels in the top row collapse to icons, and the pointer note is hidden. Phones are not designed yet.

**Embed mode.** With `embed=1` only the frame, the bar and Measure show, stacked in the page flow on a card background, with no shadows and no rounded outer corners.

## Elevation & Depth

Depth has two levels: the sky, and cards on the sky. Every card that floats over the sky casts the same soft shadow. Inside a card, depth comes from tone: card, then Card Shade, then Card Deep, with 1px ruled lines between sections. Dark data windows have no shadow and no border. They read as cut into the card because they are dark and the card is pale.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 14px 34px -14px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.4)`): every card, popover, dialog, tip card and toast over the sky.
- **Chosen segment** (`box-shadow: 0 1px 3px rgba(15,26,60,.22)`): the selected choice in a segmented control.
- **Knob** (`box-shadow: 0 1px 2px rgba(15,26,60,.35)`): the white knob of a switch. The wavelength handle uses a slightly larger one (`0 1px 4px rgba(15,26,60,.5)`).
- **Ring** (`box-shadow: 0 0 0 2px var(--card), 0 0 0 4px <colour>`): a 2px card-coloured gap, then a 2px ring. Magenta-on-card for the current date stop. Ultramarine for the chosen detector thumbnail.

### Named Rules
**The One Lift Rule.** A thing either floats over the sky and casts Lift, or it sits inside a card and casts nothing. There is no middle level.

## Shapes

Corners are round and get rounder as the surface gets bigger.

- **Tips and small tags:** 7px (tooltips, text buttons, the badge on the picture).
- **Data windows and small controls:** 8px (the picture, charts, small icon buttons, segmented choices).
- **Controls and rows:** 9px (buttons, icon buttons, list rows).
- **Chrome cards on the sky:** 13px (wordmark, search, top actions, rail, popovers).
- **The frame and its panels:** 14px (frame, Measure, overlays).
- **The bar, dialogs and the welcome card:** 16px.
- **Pills and circles:** status labels and switches are full pills. The Play button is a circle.

Lines are thin. Section rules and scale ticks are 1px. Icons are 20px line drawings with a 1.6px stroke and round ends, in the current text colour.

Line style carries meaning on the sky. A solid outline is real data. A dashed outline is simulated or loading. A dotted outline means no pictures. The line from the patch to the frame is dotted (2px dashes, 5px gaps) so it reads as a pointer and not as data.

Pictures are drawn with hard pixel edges, never smoothed, so one square on screen is one detector pixel.

## Components

Controls are quiet until needed. A card has at most one button filled with ultramarine. The rest are ink on card.

### Buttons
- **Shape:** softly rounded (9px), 34px tall, 12px side padding, 14px medium text. An optional 18px icon sits 6px before the label.
- **Primary:** ultramarine fill with white text (Copy in Share, the first choice on the welcome card). Hover darkens to `action-hi`.
- **Default:** Card Shade fill, ink text. Hover goes to Card Deep.
- **Quiet:** no fill until hover (Measure in the frame header). Hover is Card Shade.
- **Text button:** 28px tall, 12px text in Soft Ink, 7px corners.
- **Link:** ultramarine medium text. The underline appears on hover.
- **On or open:** Ultramarine Wash fill with ultramarine text and icon.
- **Press:** the button moves down 1px. **Focus:** a 2px ultramarine outline, 2px away. **Disabled icon buttons:** 30% opacity.

### Play button
The primary action of the whole screen. A 46px ultramarine circle with a white play or pause icon. Hover darkens it. Press shrinks it to 94%. It is the largest filled control on screen, and the only round button.

### Icon buttons
36px square (30px in the frame header and for close buttons), no fill, ink icon. Hover is Card Shade. Each has a tooltip: ink fill, card text, 12px, shown after a 0.35s pause on hover or on keyboard focus. Tooltips open below by default, to the right on the rail, and above on the bar.

### Segmented control
A row of choices where one is on (Flip, Two dates, Difference). The trough is Card Shade with 10px corners and 3px padding. Choices are 32px tall in Soft Ink. The chosen one is a card-coloured tile with ink text and the small Chosen segment shadow.

### Tabs
Text tabs on a 1px ruled line, 16px apart, in Faint Ink. The chosen tab is ink with a 2px ultramarine underline. Used for the chart tabs in Measure and for Link and Embed in Share.

### Switches
A 34 by 20px pill: Card Deep when off, ultramarine when on, with a white knob. The bar uses a smaller one (24 by 14px) inside a text button for "Same wavelength only". The knob slides in 0.15s. With reduced motion it jumps.

### Status labels
Small pills, 12px medium text, soft fill with a matching dark text colour. Green for real and matching. Brown for simulated and partly. Red for saturated and flagged. Neutral (Card Shade, Soft Ink) for plain facts. Each label says what it means in words.

The frame's source line is the same idea in the header: a 7px dot and words. A solid green dot is real data. A dashed brown ring is simulated.

### Cards / Containers
- **Corner Style:** 13px, 14px or 16px by kind (see Shapes).
- **Background:** Chart Card. Never tinted, never see-through.
- **Shadow Strategy:** Lift, and only Lift (see Elevation & Depth).
- **Border:** none. Sections inside are split by 1px ruled lines.
- **Internal Padding:** 5px or 6px around a group of buttons or rows, 10px in the frame, 14px by 16px in Measure panels, 18px in dialogs.

### Data windows
The dark rectangles cut into a card: the frame's picture, the charts, the small bar charts in the guide, the detector thumbnails, the icon tiles in search results. Background is Window Night (the picture itself sits on pure black). Corners are 8px. Text inside uses the three window text strengths. Grid lines use `st-line`. Labels over the picture sit on a see-through dark badge (`rgba(9,13,28,.74)`, 7px corners).

While pictures flip, a 3px line inside the picture's edge takes the tint of the survey pass on screen. The same tint fills that date's stop on the date scale.

Pictures swap with a hard cut, never a fade, and never faster than 2.5 times a second. With reduced motion the frame shows a still two-date picture.

### Inputs / Fields
- **Search:** a 46px card with 13px corners and Lift, a search icon in Faint Ink, 14px text, a Faint Ink placeholder and a small key hint. The suggestions open below as a card of 9px rows. Each row has a dark icon tile, a name and one supporting line.
- **Small field:** 34px tall, Card Shade fill, 9px corners, no border (the name field in Places).
- **Focus:** a 2px ultramarine outline around the whole field. The caret is ultramarine.

### Navigation
There is no page navigation. The top right card holds Places, Share and About. Popovers are cards that open next to their button. Rows inside are 9px-cornered, with a medium name and a 12px supporting line, and hover to Card Shade. A single-choice list (the sky map menu) shows a ring that fills with ultramarine when chosen.

### The date scale (signature)
A ruled scale, 60px tall, that shows the survey's dates. It replaces a plain progress bar.

- **Ruling:** a 1px tick for each month in Card Deep. Every third month gets a taller tick in Faint Ink and an 11px label. January carries the year.
- **Passes:** a 4px bar for each survey pass. Passes already played turn Soft Ink.
- **Today:** a 1px line in Faint Ink.
- **Explore:** each group of dates is a 20px lettered stop (A, B, C) filled with its pass tint, with a short stem down to the scale. The current stop gets the magenta-on-card ring. That ring is the playhead here.
- **Measure:** every visit is an 8px ink dot, and each pass is named in 11px. The playhead is a 2px magenta-on-card line with a 14px round knob.
- **Hover:** an ink tip above the scale gives the date.

### The wavelength scale (signature)
One ruled scale for both the sky map and the frame, from 0.75 to 5.0 µm.

- **Head:** the word "Wavelength" in Faint Ink, the value in 14px semibold, a plain name in Soft Ink, and the "Same wavelength only" switch.
- **Bands:** a 6px strip of six equal segments in the detector hues, 2px apart.
- **Handle:** a 14 by 20px magenta-on-card tab with a 2px card-coloured border and 5px corners.
- **Ruling:** seven 1px ticks in full Ink at the band edges, crossing the strip, with 11px numbers. The last one carries the unit.

### Marks on the sky
- **Patch outline:** a square on the map where the frame is looking. Solid magenta for real data, dashed amber for simulated, dotted grey for no pictures, dashed pale for loading.
- **Patch label:** a small magenta tag with dark text on the outline's corner. It appears only when nothing else names the patch.
- **Tether:** a 1.5px dotted magenta line from the patch to the frame, so the frame's title names the patch.
- **Pins:** saved and starter places are 14px pale rings with a 12px name. The ring turns magenta on hover.
- **Sky notes:** one-line notes on a see-through dark strip (`rgba(5,7,13,.82)`) in pale text. They say what the map is, in words.

### Welcome card and tip card
The welcome card is a 372px card with the 25px heading, one sentence, and a short list of starting points. The first choice is the primary: ultramarine fill, white text. It settles 14px into place (see Motion). The tip card is a small ink-filled card with card-coloured text and a pointer under it. Neither moves under reduced motion.

## Motion

Motion says where a thing came from and where it went. It is short and it never decorates.

- **Panels and popovers** (the frame, Measure, overlays, Places, the sky map menu, search suggestions, the welcome card, dialogs) fade in 0.18s and settle 6 to 14px into place in 0.32s with the ease-out curve `cubic-bezier(.16,1,.3,1)`. They leave the same way. CSS does it with `@starting-style` and `display … allow-discrete`, so the hidden attribute still decides what is shown.
- **The frame glides** (0.42s) when Measure opens beside it or the window changes size. The glide is a transform, so it still runs while the page builds the measurements. The controls that come with Measure (or with Explore) fade in just after. While the user drags or sizes the frame, it follows the pointer with no delay.
- **The picture slides, never jumps,** when the lines above it change height (a name on two lines, a longer task, the loading line): 0.26s with the same curve. The frame is placed once, at its final height, before it glides.
- **The sky changes wavelength by cross-fade** (0.26s): the new map comes up over the old one once its tiles are in. It never cuts to grey.
- **Pictures in the frame swap with hard cuts**, never a fade (see Data windows).
- **Loading** shows only when it lasts: the sky's loading card after 0.3s, the frame's busy cover after 0.25s, so a quick load never flashes. The first sky map is the exception: its card is on screen from the first paint. A card keeps its words while it fades out, and its percentage never goes back. When the count is known (a live fetch: "5 of 12"), the bar fills to match, and a line says the wait can take a few minutes and the sky works meanwhile.
- **Reduced motion:** everything that slides, grows or glides only fades; the loading bars stand still.

## Intro

The first visit opens with about six seconds of motion (6.25 s, then the cards' 0.45 s fade). It is the one deliberate exception to the rules above: motion here is there to set the scene, once, and it ends in the calm page. Everything in it is real data or plainly a mark, and it never holds the page up.

1. **Darkness, then the ring** (0 to 2.9 s). On Blue-black Sky, a black disc (the sky globe in shadow) with a thin ring of light round its edge, like an eclipse's corona. The ring's light is the real SPHEREx sky along the globe's edge, from the shipped all-sky images: brighter sky reaches further out, so the Milky Way makes the streamers. It steps through one channel from each detector, 0.91 to 4.92 µm, each in its detector hue (`d1` to `d6`: here they colour detector data, as the Rainbow Rule allows). A line at the bottom says what the light is, in Label size and `st-ink-3`: "SPHEREx all-sky map, NASA IRSA (DR1) · average of all dates · 0.91 µm, detector D1".
2. **The name** inside the disc, in `st-ink`: سيما (Reem Kufi 600, 30% of the disc's radius, 40 to 84px), Sima under it (Reem Kufi, 19 to 30px), and one line in Reading size and `st-ink-2`: "The infrared sky, as NASA's SPHEREx sees it." Each fades and rises 8px into place.
3. **The diamond ring** (about 2.35 s). A small white flare on the edge, up and to the right, where Barnard's Star sits: the spot the page will land on. Its name is beside it in Label size and `st-ink-2`, only when the frame's patch is a named target at the landing's centre.
4. **The shadow slides off** (from 2.9 s, 1.45 s long), away from the flare, as at the end of an eclipse. The globe under it is the real map in the channel the sky map shows, grey and lifted as the Grey Map Rule says. The ring fades as the globe lights. The name leaves first.
5. **The turn and the dive** (3.2 to 4.95 s). The globe turns until Barnard's Star faces us, then grows until the sky fills the window, changing from a globe to the sky map's own projection on the way.
6. **The landing** (4.95 to 6.25 s). The sky map takes over at about 55° wide (exactly matched: same projection, scale and centre) and glides in to its own view in 1.3 s; the intro fades over it in the first 0.4 s. The page's cards then fade in (0.45 s) on the normal first visit: the frame playing, the welcome card open.

**Rules.**
- **Once per browser** (`sima-intro` in storage). About's "Play the intro" and `?intro=1` play it again; `?intro=0`, `embed=1` and `#w=` workspace links never show it.
- **Skippable at any moment** by any key, click or tap, and a small "Skip" text button at the top right (Label size, `st-ink-2`, `st-raise` on hover). A skip fades the intro out in 0.26s onto the page as it would have landed. Every key goes to the intro while it plays, so Space skips it and does not also pause the frame. Escape skips it like any key.
- **Never holds the page up.** Every part starts under it. If the sky map is not ready when the shadow should leave, the ring and name hold, breathing gently, for at most 2 s more; then the shipped sky is shown anyway. A slow machine or network can stretch the landing too: the map lands sharp only once NASA's tiles are in, which the intro asks for while it plays. The globe is never empty or black: it is drawn from pictures shipped with the app.
- **Reduced motion:** a still ring (the sky map's channel and detector hue), a still flare and the name, for 2.4 s, then a 0.6 s fade into the page.
- **Smooth:** drawn live with WebGL 2 in a worker (an OffscreenCanvas), so the picture keeps moving while the page starts; the words fade on the compositor. No video.
- **Stacking:** while it plays it covers every card. While the sky map glides in, the cards wait (`html[data-intro='land']`), then fade in. On phones (under 700px) it plays too, then gives way to the sky and its note.

## Interaction

Behave like a map and a video player, because that is what people already know.

- **The wheel zooms what is under the pointer.** Over the sky (and over pins on it) it zooms the sky toward the pointer: the point under it stays put, as on a map, and a fast spin is one smooth zoom. Over the picture it changes the field size one notch per turn (3′ to 48′), and the sky stays still. The page never scrolls.
- **The patch square is picked up anywhere inside it,** not only by its border, as a selection in a drawing tool, also over the pin at its middle. The pointer shows a hand. The square follows the pointer, the sky stays still, and the frame is aimed where it is put down.
- **Nothing drags the map by accident.** Dragging the frame, its size corner, the date scale, the wavelength scale or any card moves only that thing. A click or a drag that places the patch does not move the sky either, unless the patch would be too small to see or hidden under the frame. Moving or sizing the frame moves the sky only if the frame then covers the patch.
- **Keys work page-wide:** Space plays or pauses, the left and right arrows step through the pictures, + and - zoom the sky, / goes to search, Escape closes what is open. Not while typing, not in a dialog, not on a button (Space) or a slider (arrows).
- **Loading always says what, how far, and what works meanwhile.** The sky's card at the top centre names the layer and the share of its tiles that are in. The frame's cover names what it waits for, with a moving bar. While a new spot loads, the frame shows the sky map's own picture of it under the cover, tagged "Preview from the sky map (all dates averaged)", never as the dated pictures.
- **A click on the sky asks before it moves anything.** It shows a small card at the spot (its coordinates and "Move the frame here"); the frame, its pictures and the sky stay as they were. Dragging the square moves the frame at once. Once the user has panned, zoomed or searched away, the sky never flies back to the patch by itself.

## Do's and Don'ts

### Do:
- **Do** keep chrome to card and ink. Add a hue only when it means "press" (`action`) or it is data.
- **Do** give a card at most one ultramarine-filled button, and make it the next thing to do. On the bar that is Play.
- **Do** use `mark-ink` for magenta on the card and `mark` for magenta on the sky and in dark windows.
- **Do** put data in a dark window with 8px corners, and keep the card around it pale.
- **Do** show any range of dates or wavelengths as a ruled scale: 1px ticks, 11px lettering, and the current position in magenta-on-card.
- **Do** say in words whether data is real, simulated or missing, and back it with line style: solid for real, dashed for simulated, dotted for none.
- **Do** tell catalogue overlays apart by shape (circle, square) in the pale window ink.
- **Do** keep text to 11, 12, 14, 17 and 25px, with tabular figures everywhere.
- **Do** give every floating card the same Lift shadow, and every icon button a tooltip.
- **Do** honour reduced motion: no slides or rises, and a still two-date picture in place of flipping.

### Don't:
- **Don't** fill a button with magenta or use magenta as decoration. It marks where the user is looking.
- **Don't** use the detector hues (`d1` to `d6`) or the pass tints (`p1` to `p4`) for anything but detectors and dates.
- **Don't** use green, brown or red for anything but a status label with words.
- **Don't** tint, recolour or draw into the sky map. Lift its black on screen and lay marks over it.
- **Don't** set text in Faint Ink (`ink-3`) on Card Shade (`card-2`). It is 4.2:1. Use Soft Ink (`ink-2`) there.
- **Don't** use 11px for anything but scale and axis lettering.
- **Don't** add a second shadow level or a see-through card. Cards are solid and cast Lift.
- **Don't** fade or slide between pictures, or flip them faster than 2.5 times a second.
- **Don't** show simulated, averaged or missing data in the look of a real observation.
- **Don't** build the dark-navy "space dashboard" with neon accents and a side panel of equal-weight buttons.
