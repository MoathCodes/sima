# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Newcomers first** (confirmed by the team): students, hackathon judges and curious visitors with no astronomy training. They open the page on a desktop monitor and want to see something real in under a minute.
- **Scientists and keen amateurs, one click away** (confirmed): people who know what proper motion and a spectrum are and want the measurements, the catalogues and the raw exposure details.
- Desktop first; phones later (confirmed).

## Product Purpose

A workspace on the infrared sky of NASA's SPHEREx telescope. The user travels over the whole sky, drops a frame on any spot, and plays that spot's real exposures in date order, so that anything that moves or changes stands out against the stars that stay still.

Built by team SIMA (سيما, Madinah) as a concept for the NASA Space Apps 2026 challenge "Planet X and SPHEREx". It will be built again at the hackathon, so the value of this build is the concept: the flow, the layout and the look.

Success: a first-time visitor finds the moving star in the first frame without reading instructions, and a scientist can reach the measurement behind it in one click.

## Positioning

Other sky browsers show one averaged map. This one shows the same spot on separate dates, at any of SPHEREx's 102 wavelengths, and says on screen where every pixel came from.

## Operating Context

- Two layers of data, never mixed up: the all-sky map (an average of a year of dates, 12.9″ pixels) and the frame (individual real exposures of one small patch, 6″ pixels).
- Real exposures exist for five test targets shipped with the app, and for any other spot when the small live service runs (a fetch takes from under a minute to a few minutes).
- NASA's archive sends about 300 KB a second per visitor, which limits how fast new sky can appear.
- Demo format at the hackathon: a 30-second video or seven slides.

## Capabilities and Constraints

- Travel: drag, zoom, search by name or coordinates, saved places, shareable links.
- Frame: play, pause, step, scrub by date; flip, two-date and difference views; six detectors (wavelength bands).
- Inspect: what moved or changed in the patch, with measured motion, brightness over time, spectrum, path and exposure details; Gaia and CatWISE overlays.
- A guided first look for newcomers ("one dot jumps, tap it").
- The science code, the data, the tests and the honesty rules are fixed. Design work changes how they are presented, not what they compute.
- English only for now. (Inferred, not confirmed: the team is Arabic-speaking and may want Arabic later.)
- The product is called **سيما** (Latin: **Sima**), Arabic for "a sign or a mark" (confirmed by the team). The wordmark sets both: سيما first, then Sima.

## Brand Commitments

- Team name: SIMA (سيما).
- Honest about the telescope: never present simulated, averaged or missing data as a real observation. Say on screen what is real, what is simulated and what is not there.

## Evidence on Hand

- Real SPHEREx exposures of Barnard's Star, Epsilon Indi B, WISE 0855−0714, RW Aurigae and R Draconis (`public/data/`).
- The SPHEREx DR1 all-sky cube, read live from NASA/IPAC IRSA.
- Measured results in the app: Barnard's Star at 10.39″ a year against a catalogue 10.39″ a year.
- No users, testimonials or usage numbers exist. Do not invent any.

## Product Principles

1. The sky is the workspace. Controls sit on it and stay out of its way.
2. One obvious next action at every moment. Everything else is quieter.
3. Show, then explain. A label earns its place only if it changes what the user does or believes.
4. Honest by default: real, simulated and missing are always told apart.
5. Every press answers at once, even when the data takes time.

## Accessibility & Inclusion

- Playback never flips faster than 2.5 times a second (WCAG three-flashes rule), and people who ask for reduced motion get a still two-date picture.
- Keyboard: arrow keys step, space plays or pauses, `/` focuses search.
