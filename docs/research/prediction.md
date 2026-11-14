# Prediction: making NASA's data be there before the user asks

Research only. No app code, script or data was changed. Written 15 November 2026.

## The short answer

A new spot is slow because every step waits on NASA's archive (IRSA). We cannot make IRSA faster.
We can make sure the user rarely waits on it.

Three things do most of the work:

1. **Fetch the popular places ahead of time**, once, slowly, at night. About 170 spots cover every
   tour stop and the top two tiers of the places list. They then open in under a second.
2. **Reuse what is already fetched.** A spot inside a patch we already hold needs no new download.
   Today a nudge of a few arcminutes starts a whole new fetch.
3. **Start early on clear intent, and stop when the intent goes away.** When a place card or the
   "Move the frame here" card is open, the next click is almost known. Start the search then.

One thing must come first: the service needs a **priority queue with cancelling**. Without it,
predicted fetches would take the 8 request slots from the spot the user is really waiting for, and
prediction would make the app slower.

Honesty stays simple: a predicted fetch is never shown. It only fills the cache. The frame shows
pictures only after the user asks, and only real, complete files, with their true fetch date.

## The problem, with numbers

### What a new spot costs today

From `docs/live-service.md` (14 November 2026, empty cache) and the service's own saved timings
(`status.json` files in the cache on this machine, 8 patches):

| Step | IRSA calm | IRSA busy |
|---|---|---|
| Search (2 TAP queries, in parallel) | 10 to 25 s | 30 to 173 s |
| First look after the search (up to 12 cutouts) | 13 to 33 s | 56 to 158 s |
| **First look, total** | **24 to 50 s** | **77 to 203 s** |
| Full set (32 to 36 cutouts) | 60 to 78 s | 134 to 515 s |
| A spot already in the cache | under 0.01 s | under 0.01 s |

Three of the eight saved searches took more than two minutes (127, 145 and 173 s). So the search is
not always the small part.

### What I measured for this report

I sent 10 requests to IRSA in all, one at a time, between 23:41 and 23:56 UTC on 14 November 2026,
with the User-Agent `sima-sky-viewer/1.0`.

| Request | Result |
|---|---|
| TAP point search, DR1, RA 40 Dec −10 (the app's own query), tried twice | No answer in 180 s, then none in 240 s |
| TAP row count of DR1 observations | No answer in 240 s |
| SIA2 region search, circle of 0.5°, DR1 | No answer in 240 s |
| TAP region search with `INTERSECTS(CIRCLE, poly)` | Refused in 0.8 s: "unsupported ADQL" |
| Cutout, 12′, one exposure | First byte 2.8 s, done 4.0 s (stopped at 450 KB) |
| Cutout, 3′, same exposure | First byte 1.4 s, done 2.4 s |
| Cutout, 12′, another exposure | 503 busy in 0.7 s |
| Byte range, 1 MB from the middle of a full Level 2 file (62 MB) | First byte 1.6 s, done 4.1 s |

(One more request was wasted by my own mistake: a negative RA in an SIA2 call, which returned an
empty answer in 0.7 s. It is counted in the 10.)

What this shows:

- **The search services were down or very slow for those 15 minutes. The cutout service worked.**
  During such a spell no new spot can open at all, however fast the rest is. Anything that removes
  the search from the user's wait is worth more than the calm-day numbers suggest.
- One cutout in three got 503. That matches "about one in five" within the noise of three tries.
- A 3′ cutout was a little faster than a 12′ one (one sample each). The server's work, not the
  bytes, is most of the time. So asking for 12′ costs little extra.
- Reading raw rows from the full file by byte range is **not** a way around the cutout service. A
  12′ strip is about 3.8 MB over four images. At the measured rate that is about 15 s, against 4 s
  for a cutout.

### What the cache already tells us about nearby spots

The service keeps its searches on disk. I compared them (no network needed):

- Two spots **10′ apart** (near Barnard's Star): 358 and 364 exposures found, **355 the same** (99%).
  Each was searched from scratch. One search took 34 s, the other 173 s.
- Two spots **0.5° apart**: 288 and 296 found, 236 the same (80%).
- One exposure is 3.5° wide. One search row is 372 bytes as CSV; one spot is about 130 KB.

So a search for one spot is almost the search for its neighbours. Today that is thrown away.

### Where users go

From the code:

- **A place card** (`src/shell/places/panels.ts` `openCard`). Its main button is "Look with the
  frame". There are 2,930 places. Tiers 0 and 1 hold 130 of them. 2,039 places ask for a 6′ field,
  407 for 12′, 287 for 3′, 197 for more (the service gives 12′ at most).
- **A tour stop** (`goToStop`). The sky flies there. The frame moves only when the user presses
  "Look with the frame". Seven tours, 69 stops, 61 different places. The next stops are known.
- **"Move the frame here"** (`src/sky/sky.ts` `showClickCard`). The card shows the exact spot before
  the click.
- **Dropping the dashed square** (`sky.ts`, `emit('aim')`). The spot is known only at the drop. But
  drops are often small nudges from the last spot.
- **Hover** on a dot or a list row (`markers.ts`, `panels.ts` `setHover`). A weak signal.
- **Extra frames in the workspace** (`src/workspace/patches.ts`), which poll the same service.

### Two faults in today's code that prediction would make worse

1. **Nothing is ever cancelled.** When the user aims somewhere else, the page stops polling
   (`load.ts` `begin`), but the service keeps fetching the old spot to the end, 36 cutouts or more.
   Only 2 patches run at once (`live.py` `MAX_RUNNING`). Three quick drops put the spot the user
   wants behind two spots nobody is looking at.
2. **The cache key is too exact.** A patch is keyed by position rounded to 3.6″ and by field size
   (`live.py` `patch_id`). A drop 1′ away, or the same spot at 12′ instead of 6′, is a full new
   fetch (`load.ts` `setFov` calls `aimAt` again). The pictures needed are often already on disk.

## The options, ranked by value for effort

"Cost to IRSA" is extra requests compared with today.

| # | Idea | Gain | Cost to IRSA | Effort | Verdict |
|---|---|---|---|---|---|
| 1 | Priority queue, and stop fetches nobody watches | Removes waits behind abandoned spots (today up to two full fetches, minutes) | Fewer requests than today | Medium | **Do first.** Needed for everything below |
| 2 | Reuse a held patch that covers the asked spot | Nudges and field-size changes: 25–200 s → under 1 s | Fewer requests than today | Small to medium | **Do** |
| 3 | Seed the cache with tour stops and top places | About 170 spots: 25–200 s → under 1 s, even when IRSA is down | About 7,000 requests, once per release, at night | Small | **Do** |
| 4 | Start on clear intent (place card, tour's next stop, click card) | Saves the lead time: 1–3 s for the click card, often the whole wait for a place card or tour | Up to 14 requests per wrong guess, capped | Medium | **Do**, after 1 |
| 5 | Reuse a nearby search | Skips the search step (10–173 s) for spots within about 6′ of an earlier search | Fewer requests than today | Medium | Do if time allows |
| 6 | Longer browser caching of finished files, and prefetching the files of a ready patch | Revisits and tour stops open without a round trip | None | Small | **Do** (cheap) |
| 7 | First-look order follows the detector on screen | Only helps users not on 2.0 µm | None | Small | Optional |
| 8 | A local index of every exposure (search without IRSA) | Search becomes a few milliseconds, and survives a search outage | One bulk download per release; size not measured | Large | Later. Ask IRSA first |
| 9 | Hover and dwell prefetch on dots | Small: hover is a weak signal | Many wasted requests | Medium | **No** |
| 10 | Prefetch a ring of neighbour patches (as map apps do) | Small once option 2 exists | 8 patches, about 330 requests, per move | Medium | **No** |
| 11 | Ask a backup exposure as soon as one gets 503 (hedging) | Could cut busy-day first looks | More load exactly when IRSA is busy | Small | **No**, not gentle |
| 12 | Read rows of the full file by byte range | None: measured slower than a cutout | More bytes | Large | **No** |
| 13 | Snap every patch to a fixed sky grid | Good sharing between users | None | Medium | **No**: option 2 gives the same without off-centre pictures |

Notes on each follow.

### 1. Priority queue and cancelling (the base)

Three classes of work, in this order: **watched** (a page is polling it), **predicted** (a hint),
**seed** (the night job). Rules:

- A patch is watched while someone has asked its status in the last 5 s. The page already polls
  every 1.5 s, so no new message is needed.
- Cutout slots go to watched work first. Within a patch, first-look cutouts go before the rest.
- A patch that loses its watcher finishes the cutouts already in flight, then pauses. If its first
  look is not written yet and it needs 4 cutouts or fewer, it finishes the first look. What it
  holds stays on disk (raw cutouts are cached by address), so coming back is cheap.
- Predicted and seed work never start when 8 or more requests wait, and stop for a minute after any
  503. This keeps the service gentler than today on a busy day.

How map and video apps do the same: a map cancels tiles that scroll out of view and loads the
centre first. A video player buffers ahead only a bounded amount and drops the buffer on a seek.

Fit: `scripts/live.py` (`Service` queue becomes a priority queue, `Patch` gets `last_seen` and a
`wanted()` check) and `scripts/prebake.py` (`fetch_plan` takes a `keep_going()` callback checked
between batches, and `fetch` takes a priority for the shared slot gate).

### 2. Reuse a held patch that covers the asked spot

When a request comes in, look for a finished patch whose cutouts fully cover the asked field. That
is true when (offset between centres) + (asked field ÷ 2) ≤ (held cutout size ÷ 2). If one exists,
answer with that patch's status and files.

The page needs almost nothing: `load.ts` `showLive` already cuts the pictures around `S.ra`,
`S.dec`, and `panTo` already does this for moves inside the set on screen. This option makes the
same thing work across spots, across visits, and across users.

To make it pay, **fetch 12′ whenever nobody is waiting** (seeds and predictions). A 12′ patch then
serves any 3′ field within 4.8′ of its centre and any 6′ field within 3.3′. It also removes the
re-fetch when the user widens the field.

Honesty: the pictures are real exposures of that sky, cut from a slightly larger download. The
`frames.json` keeps its own centre and fetch date. One wording fix is needed: the catalogue block
says "Patch centre typed by the user", which is not true for a reused or seeded patch.

Limit: a fast-moving star is not at its catalogue position on every date. Live patches are fixed
positions already, so nothing changes.

### 3. Seed the cache with the places people open

A script asks the service for each tour stop and each tier 0 and tier 1 place, at 12′, as **seed**
work. That is 61 + 130 places with some overlap, about 170 after removing the five shipped targets.

- IRSA cost: about 170 × (2 searches + about 40 cutouts with retries) ≈ 7,000 requests. At 2 patches
  at a time that is 2 to 4 hours. Run once per data release, at IRSA's night (California).
- Disk: about 1 MB per packed 12′ patch (measured: 0.9 MB), so about 170 MB. Raw cutouts are
  0.26 MB each (measured average of 727), about 1.8 GB for the seed. They can be deleted after
  packing.
- Gain: each of those spots opens in under a second, also when IRSA is down or busy.

**A bonus for hosting (O-D2).** A finished patch is just two files. The seed can be copied to any
static host as `seed/<id>/full/frames.json` and `frames.bin.gz`, with one small index file (position,
field, id, fetch date). The page can check that index before it calls the service. Then the tour
stops show real pictures **even if the live service is not hosted at all**. This is the cheapest
way to cut the demo risk in SPEC 12.

Honesty: the label must say when it was fetched, for example "Real SPHEREx data, DR1, fetched
14 Nov 2026", not "fetched live". The date is already in `frames.json` (`live.fetched`).

### 4. Start on clear intent

Signals worth acting on, strongest first:

| Signal | Why it is strong | Lead time gained |
|---|---|---|
| A link that names a spot | Certain | Start at page load |
| "Move the frame here" card is open | The exact spot; one click away | 1 to 3 s |
| A place card is open | Its main button aims the frame there | The reading time, often 5 to 30 s |
| A tour is open | The next stop is known | A whole stop (often the full wait) |
| The top search result | Likely to be opened | A few seconds |

How: the page sends the same three numbers plus `hint=1`. The service treats it as **predicted**
work with hard limits:

- Only the search and the first look (2 + up to 12 requests), never the full set.
- One predicted patch per page at a time; a new hint replaces the old one. 4 in the whole service.
- A hint lives 20 s unless the page sends it again. A closed card stops sending.
- No hints at all while IRSA is answering busy (`pb.retrying()`), or on a phone that asked to save
  data (`navigator.connection.saveData`).
- If option 2 or 3 already covers the spot, the hint does nothing.

When the user then really asks, the page calls the normal route. The patch is promoted to
**watched** and carries on from where it was. The user sees the normal loading words, just for a
shorter time.

Waste: a wrong guess costs at most 14 requests, and the result stays in the cache for the next
person. With the limits above the worst case is about one wasted first look per place card opened.

Honesty: a hinted patch is never drawn. The patch square, the label and the frame change only on a
real `aim`. The status answer of a hint is not shown to the user.

### 5. Reuse a nearby search

If a search was done within 6′ in the last 12 hours, take its rows, keep the exposures whose
footprint contains the new spot (the corners are already decoded, `prebake.py` `decode_poly`), and
plan from that. The measured overlap at 10′ is 99%.

The 1% that is missed are exposures that contain the new spot but not the old one. To stay honest
about the count the page shows ("Found 358 exposures"), run the exact search in the background and
write its number into the full set. Until then the page should say "at least".

A true region search would be better. `INTERSECTS` with the footprint was refused by IRSA's TAP,
and the SIA2 circle search timed out, so I could not prove a query form that works. Try SIA2 again
on a calm day before building on it.

### 6. Browser-side caching (cheap)

- Finished files are served with `max-age=3600` (`live.py` `_file`). A step's files never change
  once written, and the id changes with the release list. Serve them as
  `max-age=31536000, immutable`.
- When a hint finds a patch that is already complete, the page can fetch its first-look files into
  the browser cache (about 100 to 300 KB). Opening it then needs no round trip for data.
- Skip this when the user asked to save data.

### 7. First look follows the detector on screen

`live.py` asks detector 3 first (`FIRST_DETS`). A fourth number, `det=1..6`, would put the detector
the user is viewing first. Small gain, small change, no proxy risk (a number in a fixed range).

### 8. A local index of all exposures

Astronomy archives solve this with coverage maps (MOC) and precomputed tiles (HiPS): the question
"what covers this spot" is answered from a local index, not a database query. We could download
DR1's exposure list once (id, detector, times, footprint, address) and search it locally.

I could not size it: the row count query timed out. Each row is 372 bytes as CSV. This is a bulk
download, so ask IRSA's help desk first, and use their asynchronous TAP. Worth doing after the
hackathon. Option 5 gets part of the gain now.

### Why the "no" rows are no

- **Hover and dwell on dots (9).** People sweep the pointer across hundreds of dots. Each guess
  costs 14 requests. The place card (option 4) is a far better signal for the same places.
- **Neighbour ring (10).** A map app does this because tiles are cheap. Here each neighbour is
  about 40 requests. Fetching 12′ and reusing it (option 2) already covers nudges.
- **Hedged cutouts (11).** It sends more requests exactly when IRSA says it is busy.
- **Byte ranges (12).** Measured: slower.
- **Fixed grid (13).** Pictures would be off-centre for every user, to solve what option 2 solves.

## Recommended design

Build in this order. Each step is useful alone.

1. **Queue with three classes and a watcher check** (option 1).
2. **Coverage reuse, and 12′ for unwatched work** (option 2).
3. **Seed script and static seed index** (option 3), with the honest label.
4. **Hints from the place card, the tour, the click card and links** (option 4), plus immutable
   caching (option 6).
5. If time allows: nearby-search reuse (option 5) and the `det` number (option 7).

Rules that hold for all of it:

- **Never an open proxy.** The page still sends only numbers in fixed ranges: `ra`, `dec`, `fov`,
  and now `hint` (0 or 1) and maybe `det` (1 to 6). Every IRSA address is still built by the service.
- **Gentle.** Still 8 requests at a time for the whole process. Predicted and seed work give way to
  watched work, stop on 503, and have hard caps. Cancelling should lower the total load on a
  normal day.
- **Honest.** Predicted data is never drawn. Nothing is labelled "fetched live" unless it was
  fetched for this request. A picture always carries its release and fetch date. A reused patch
  shows empty sky where its exposures do not reach, as the frame already does. The count of
  exposures found is exact, or says "at least".
- **Private.** Hints carry no more than a normal request: a position. The User-Agent to IRSA stays
  `sima-sky-viewer/1.0`.

## Expected speed-up

| Case | Today | After | Evidence |
|---|---|---|---|
| Tour stop or top place (about 170 spots) | 24–50 s calm, 77–203 s busy | Under 1 s | A cached patch answers in under 0.01 s; first-look files are 100–300 KB |
| A nudge inside a held 12′ patch, or a wider field | Same as a new spot | Under 1 s | Same; `panTo` already does this for the set on screen |
| A spot the user reaches after two abandoned ones | Waits behind them: one or two full fetches, 1–8 min | No extra wait | `MAX_RUNNING = 2`, nothing is cancelled today |
| A place outside the seed, card read for 15 s before the click | 24–50 s calm | About 10–35 s calm; the search (10–25 s) is usually done | Search timings above |
| A random spot far from anything | 24–203 s | No change | Nothing predicts it. Only option 8 would help its search |

The last row matters: **prediction does not help a spot nobody could foresee.** The loading words
and the sky-map preview remain the answer there.

These are estimates from measured step times. They are not measured end to end; the test plan
below does that.

## How to measure success

### Numbers to record

The service already logs each patch (`Patch.finish`). Add to that line and to a small counter file:

- **Time to first look**, per real request, split into: from cache, reused, hinted, cold.
- **Hit rate**: share of real requests answered from the seed, by reuse, or by a hint that was
  already under way.
- **Waste**: predicted cutouts that no real request used within an hour, as a share of all cutouts.
  Target: under 20%.
- **IRSA load**: requests per hour and the 503 rate, before and after. Target: no higher 503 rate.
- **Queue wait**: seconds a watched patch waited for a worker. Target: 0.

No personal data is needed for any of these. Positions of unseeded spots should not be logged with
anything that identifies a visitor.

### A simple test plan

1. **Unit tests, no network** (`scripts/test_live.py`, `scripts/test_prebake.py`): the queue order;
   a patch pauses when nobody polls; a hint expires; hint caps; coverage reuse geometry (inside,
   edge, outside, across RA 0, near a pole); bad `hint` and `det` values get 400.
2. **Replay script, no IRSA**: point the service at a stub that answers after fixed delays and
   503s one time in five. Replay three scripted sessions: a tour, three quick drops, a place card
   read for 15 s. Compare time to first look with the features off and on.
3. **One real run, calm hour**: seed 5 tour stops. Then time the same 5 from the page, plus 3 nudges
   and 2 unseeded places with a 15 s card read. Record the table above. Keep it to this one run.
4. **Honesty check in the smoke test**: with hints on, open a place card and assert that the patch
   square, the frame label and `S.source` do not change until "Look with the frame" is pressed. For
   a seeded spot, assert the label carries the fetch date and not the word "live".

## Build plan

| # | Task | Files | Lane |
|---|---|---|---|
| 1 | Priority slot gate: `fetch` takes a priority; watched before predicted before seed | `scripts/prebake.py`, `scripts/test_prebake.py` | A |
| 2 | `fetch_plan` takes `keep_going()`, checked between batches; a stopped plan returns what it has | `scripts/prebake.py`, `scripts/test_prebake.py` | A |
| 3 | Service queue with three classes; `Patch.last_seen` set by every status read; pause when unwatched; resume when asked again | `scripts/live.py`, `scripts/test_live.py` | A |
| 4 | Coverage reuse: an index of finished patches (position, cutout size); `Service.request` answers from a covering patch | `scripts/live.py`, `scripts/test_live.py` | A |
| 5 | Honest source words: `catalogue.from` and the `live` block say "fetched ahead on <date>" or "cut from a wider patch" where true | `scripts/live.py`, `docs/data-format.md`, `docs/live-service.md` | A |
| 6 | Seed script: reads `src/data/places.json` and `src/data/tours.ts` stops, asks the service at 12′ as seed work, one at a time; `--export` writes the static seed folder and `index.json` | new `scripts/seed_live.py`, `scripts/test_seed_live.py`, `package.json` (script entry) | A, integrator for `package.json` |
| 7 | `hint=1` route: caps, 20 s life, first look only, off while IRSA is busy | `scripts/live.py`, `scripts/test_live.py`, `docs/live-service.md` | A |
| 8 | Immutable cache header for finished files | `scripts/live.py` | A |
| 9 | Page: check the seed index, then the service; label seeded and reused patches with their fetch date | `src/viewer/load.ts`, `src/viewer/frame.ts`, `src/core/types.ts` (`LiveStatus` gains fields: needs the integrator) | D, integrator |
| 10 | Page: `hintAt(ra, dec, fov)` that sends and renews a hint and never touches `S` | `src/viewer/load.ts` (or a new `src/viewer/hint.ts`) | D |
| 11 | Hints from the place card and the tour's next stop | `src/shell/places/panels.ts` | G |
| 12 | Hint from the "Move the frame here" card | `src/sky/sky.ts` | C |
| 13 | Workspace frames use the same reuse and labels | `src/workspace/patches.ts` | workspace owner |
| 14 | Counters and the log line; replay script with a stub archive | `scripts/live.py`, new `scripts/replay_live.py` | A |
| 15 | Smoke test: hints change nothing on screen; seeded label wording | `tests/` smoke flows | F |
| 16 | Optional: nearby-search reuse with "at least" count; `det` number | `scripts/prebake.py`, `scripts/live.py`, `src/viewer/load.ts` | A, D |

Tasks 1 to 4 and 8 change no contract and can ship alone. Tasks 9 to 13 cross lanes: the sky and
places lanes should call one function from lane D (`hintAt`) rather than calling the service
themselves. Task 9 changes `LiveStatus` in `src/core/types.ts`, which needs the integrator's yes
(AGENTS.md rule 7). Task 6 adds a new script file; say so to the integrator.

## What is still unknown

- Whether IRSA limits busy replies per client (already an open question in `live-service.md`).
- A region search form that IRSA accepts. Not proven: the search services were down when I tried.
- The size of a full exposure index for DR1 (option 8).
- How long people really read a place card. The lead times above are guesses until the counters
  in "How to measure success" exist.
- Whether the quick-release collection (`spherex_qr3`) still grows. If it does, seeds need a
  refresh on a schedule, and the fetch date on the label matters even more.
