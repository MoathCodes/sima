# Sima (سيما): rules for every agent working here

Sima is a web app on NASA SPHEREx's infrared sky, built for NASA Space Apps 2026 ("Planet X and
SPHEREx"). This repo is a **clean rebuild** of an earlier working build, done from the spec.

## Read first

| File | What it fixes |
|---|---|
| `docs/SPEC.md` | Behaviour, requirements (section 5), architecture and contracts (section 8), lanes (section 9), open work to build (section 10), done checks (section 11). Wins on behaviour. |
| `DESIGN.md` | The look. Binding word for word. Wins on looks. |
| `docs/tools.md` | Every picture tool and algorithm. |
| `docs/data-format.md` | File format of shipped real exposures. |
| `docs/live-service.md` | The live service for any coordinate. |
| `docs/spec-img/*.jpg` | Screenshots of the old build: the visual reference. Section 10 overrides them where they differ. |

## Clean rebuild rule (hard)

The old build lives at `/home/moath/Projects/SIMA`. The team has not been told it may reuse work done
before the hackathon (SPEC section 12, risk 3), so:

- **Do not read, copy or adapt any source, script, test, style, config, data or generated file from
  `/home/moath/Projects/SIMA`.** That includes `src/`, `scripts/`, `tests/`, `index.html`, `public/`,
  `dist/`, `vite.config.ts`, `package.json` and its `.venv`.
- The spec documents and screenshots in `docs/` and `DESIGN.md` are already copied here. Use these.
- You may open the old build's `dist/` in a browser to *observe behaviour* (serve it with a static
  server on a free port), but do not read its code in devtools or on disk.
- All data must be real and fetched fresh from the public sources in SPEC 6.1 (NASA IRSA, Gaia,
  VizieR, SIMBAD, OpenNGC, Wikidata, WGSN). Fonts come fresh from their official sources (Google Fonts
  or the font's repo, SIL OFL).

## Honesty rules (SPEC section 2): hard requirements

Never invent data. Never fall back to a model value when something was not measured ("not measured"
and why). Simulated data says "Simulated" first, is dashed, and never mixes with real results. No
sentence claims a discovery. Every picture says its source, release, date and wavelength.

## Lanes and ownership (SPEC 9.3 and 9.4)

1. One owner per file. Edit only the files your lane owns (SPEC 9.3). If you need a change in another
   lane's file, do not make it: write it down under "Requests to other lanes" in your final report,
   with the exact patch you want.
2. Each lane styles only its own classes in its own stylesheet. Tokens come from `src/styles/app.css`.
3. Only lane F edits `index.html` after phase 0.
4. To draw on the picture, register a `drawHooks` function. Do not edit `viewer/render.ts`.
5. Anything floating on the sky goes on lane C's keep-clear list.
6. Every card that can open has a place in the Escape order and stacking order in `DESIGN.md`.
7. Contracts in SPEC 8.4 (and `src/shell/bus.ts`, `src/core/types.ts`, `src/viewer/state.ts`) change
   only if the integrator agrees. Ask in your report rather than changing them.

## Working in your checkout

- You are on your own branch in your own git worktree. Commit there in small, working steps. Never
  push, never touch other branches, never rewrite history.
- To pick up other lanes' finished work, run `git merge rebuild` (the integration branch). Do this
  before you start and again before you finish. Resolve conflicts only in files you own.
- End commit messages with: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or your own
  model's name if you are another tool).
- Commands: `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke`.
  Before finishing, all of `npm run typecheck`, `npm test` and `npm run build` must pass.
- Python: `uv venv .venv && uv pip install -r scripts/requirements.txt` (the `.venv` is ignored).
- A headless Chromium for Playwright is in `~/.cache/ms-playwright/` (chromium-1243).
- The machine is shared by about eight agents (12 cores, 14 GB RAM). Use the dev-server port given in
  your task, run at most one headless browser at a time, and stop servers and browsers when done.

## Privacy

Requests to outside services carry no personal name, email or project name. Use a generic
User-Agent such as `sima-sky-viewer/1.0`.

## Writing

User-facing text in the app follows `DESIGN.md` and SPEC wording. Reports to the integrator: plain
English, short sentences, lead with the result, then details (files, what was checked, what is left).
