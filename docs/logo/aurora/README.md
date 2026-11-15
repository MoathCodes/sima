# Sima logo: "Aurora"

The Arabic word سيما sits on a round patch of night sky. A green aurora curtain sweeps across it.
The two dots under ي are drawn as two stars.

سيما means "a sign or a mark". People have always read the stars as signs, so the stars sit
inside the word itself.

## Files

| File | Use |
|---|---|
| `sima-logo.svg` | Main logo, full colour. Splash screen, About, slides, social posts. |
| `sima-logo-pink-star.svg` | Same, with one star in the app's pink `mark` colour. Optional. |
| `sima-app-icon.svg` | Rounded-square app icon (PWA, home screen). |
| `sima-favicon.svg`, `sima-favicon.ico` | Browser tab. A simpler drawing, made for 16–48 px. |
| `sima-logo-mono.svg`, `sima-logo-mono-ink.svg` | One colour, no gradients. Print, stamps, stickers, laser-cut. |
| `sima-lockup-light.svg`, `sima-lockup-dark.svg` | Logo with the Latin name "Sima" beside it. |
| `png/` | Ready-made PNG sizes. |

All text is converted to outlines, so the files need no fonts installed.

### English versions (`english/`)

The same sky and aurora, with "Sima" in Latin letters. The dot on the "i" is a star, matching the
star-dots under ي in the Arabic logo.

| File | Use |
|---|---|
| `sima-logo-en.svg` | Main English logo (Amiri Bold, same family as the Arabic logo). |
| `sima-logo-bilingual.svg` | "Sima" large, سيما small beneath it. |
| `sima-logo-en-cormorant.svg`, `sima-logo-bilingual-cormorant.svg` | Alternative in Cormorant Garamond Bold: finer, more formal, weaker at small sizes. |
| `sima-app-icon-en.svg` | Rounded-square app icon. |
| `sima-favicon-en.svg`, `sima-favicon-en.ico` | One serif "S" with its star, for 16–48 px. |
| `sima-logo-en-mono.svg`, `sima-logo-en-mono-ink.svg` | One colour. |

Twelve Latin faces were compared with the star-dot: Amiri, Cormorant Garamond, Fraunces, Playfair
Display, DM Serif Display, Instrument Serif, Libre Caslon Display, Marcellus, Young Serif, Gloock,
Italiana and Archivo.

## How it was built

- **Letters:** Amiri Bold (classical Arabic Naskh, SIL OFL), shaped with HarfBuzz and converted to
  outlines. In the comparison it read the most clearly and elegantly. Its stacked سيـ gives an
  almost square shape that fits a circle. Twenty Arabic faces were compared. The runner-up was Noto
  Nastaliq Urdu: more dramatic, but Persian in feel. Aref Ruqaa, the app's wordmark face, looked
  rough at logo size.
- **Latin name:** Archivo 600, the app's UI face.
- **Colours:** night navy close to `ink` `#0f1a3c`, cream `card` `#f6f3ec`, and aurora green
  `#5cf2a6` fading through teal `d3` to violet `d1`.

## The science in the picture

- **Green at the bottom, violet at the top.** That is how a real aurora is layered. Green is oxygen
  at 557.7 nm, about 100–150 km up. Red oxygen light (630 nm) shows higher, where the air is
  thinner. Blue and violet come from nitrogen.
- **Why an aurora fits SPHEREx.** SPHEREx flies a Sun-synchronous polar orbit, so it passes over the
  polar regions, where auroras live, on every ~98-minute orbit. That same orbit is why its two
  deep fields sit at the ecliptic poles. The northern one is centred at RA 270°, Dec +66.5°.

## Logo design rules applied

- **Natural, harmonious, moderately detailed.** Henderson & Cote (1998) studied 195 logos. The ones
  people recognise best show something familiar, have parts that agree with each other, and carry
  some richness without clutter. Here that means one script, one sky, one aurora and stars, with
  no extra orbit or telescope.
- **Silhouette first.** The word is the largest shape and the brightest colour. The aurora stays
  behind it, and the alif cutting through the curtain adds depth.
- **Keep the dots.** Arabic logos that drop the dots stop reading as the word. The stars replace the
  dots without removing them.
- **Rebuild for small sizes.** A gradient and thin rays turn to mud at 16 px. The favicon is
  redrawn: bigger letters, plain round dots, and one flat green band.
- **Works in one colour.** The mono version has no gradients or transparency.
- **Not NASA's insignia.** The round sky badge is a familiar space-patch form. Still, NASA's
  "meatball" may not be used or imitated without permission, and Space Apps asks teams to avoid
  NASA marks. This logo uses an aurora instead of the red chevron, Arabic letters instead of
  NASA's, and no orbit ring.

## Regenerating

The scripts that made these files are kept outside the repo, in the session scratchpad.
Ask to have them added under `scripts/` if the logo should be rebuilt from source.
