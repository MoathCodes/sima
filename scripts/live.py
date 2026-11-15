#!/usr/bin/env python3
"""Live SPHEREx frames for any coordinate: a small web service. Defined in docs/live-service.md.

A web page cannot call IRSA itself (no CORS headers), so this service searches, downloads and packs
real SPHEREx cutouts in the same format as public/data/ (docs/data-format.md). It imports
scripts/prebake.py for all of that and adds only the web part, with Python's standard library.

Routes (GET):
  /api/patch?ra=<deg>&dec=<deg>&fov=<3|6|12|24|48> start or find the patch; answers its status
  /api/patch/<id>                                   status of a patch by id
  /api/patch/<id>/<first|full>/frames.json          a step's frames (same format as public/data)
  /api/patch/<id>/<first|full>/frames.bin.gz
  /api/patch/<id>/catalog.json                      Gaia DR3 and CatWISE2020 sources in the patch
  /api/health                                       {"ok": true, ...}

Run:  python scripts/live.py [--host 127.0.0.1] [--port 8765] [--allow-origin URL ...] [--cache DIR]
"""

from __future__ import annotations

import argparse
import datetime as _dt
import hashlib
import json
import math
import os
import queue
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prebake as pb  # noqa: E402

# ---------------------------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------------------------

FOVS = (3, 6, 12, 24, 48)          # field sizes the viewer offers (arcmin)
ROUND_DEG = 3                      # positions are rounded to 0.001 deg (3.6", about half a pixel)
LIVE_PER_DET = 2                   # exposures per detector per visit
# A 48' cutout is 16 times the pixels of a 12' one (about 3.6 MB from IRSA, 1.3 MB to the page),
# so the widest field keeps one exposure per detector per visit: half the downloads.
WIDE_FOV = 48
WIDE_PER_DET = 1
LIVE_MAX_FRAMES = 48               # exposures per patch
MAX_RUNNING = 2                    # patches fetched at once
MAX_QUEUED = 8                     # patches waiting; more gets 503 busy
RETRY_FAILED_AFTER = 30            # seconds before a failed patch may be tried again
RETRY_SEARCH_AFTER = 3             # the same after NASA's search did not answer (the page's Retry)
EMPTY_TTL = pb.SEARCH_TTL          # an empty spot is searched again after this long
CATALOG_LIMIT = 5000               # rows per catalogue in catalog.json, brightest first
DEFAULT_ORIGINS = ["http://localhost:5173"]
# Detectors whose oldest and newest exposures are asked first. The viewer opens on 2.0 um
# (detector 3), so that pair is likeliest to be the first look it shows.
FIRST_DETS = (3, 2, 4, 1, 5, 6)
# Watching and pausing (docs/research/prediction.md, option 1). A patch is watched while a page
# asked for its status in the last WATCH_SECS (the page asks every 1.5 s). Unwatched, it finishes
# the cutouts under way and pauses; a first look not yet written may start FIRST_GRACE more
# cutouts. Asked again, it carries on: searches and cutouts are cached on disk.
WATCH_SECS = 5.0
FIRST_GRACE = 4
# Classes of work: a page asks (watched), or the seed job fetches ahead (seed).
CLASSES = ("watched", "seed")
HELD_RESCAN = 60                   # seconds between rereads of the finished patches on disk

ID_RE = re.compile(r"[0-9a-f]{16}")


def releases() -> list[str]:
    return list(pb.RELEASES)


# ---------------------------------------------------------------------------------------------
# Input checks and cache keys (pure)
# ---------------------------------------------------------------------------------------------

class BadRequest(ValueError):
    pass


def _number(qs: dict, name: str) -> float:
    vals = qs.get(name)
    if not vals:
        raise BadRequest(f"missing {name}")
    if len(vals) != 1:
        raise BadRequest(f"{name} given more than once")
    text = vals[0].strip()
    if len(text) > 32 or not re.fullmatch(r"[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?", text):
        raise BadRequest(f"{name} is not a number")
    v = float(text)
    if not math.isfinite(v):
        raise BadRequest(f"{name} is not a finite number")
    return v


def parse_patch_query(query: str) -> tuple[float, float, int]:
    """Check ?ra=&dec=&fov= and return the rounded (ra, dec, fov). Raises BadRequest."""
    qs = parse_qs(query, keep_blank_values=True, max_num_fields=20)
    ra = _number(qs, "ra")
    dec = _number(qs, "dec")
    fov = _number(qs, "fov") if "fov" in qs else 12.0
    if not 0 <= ra <= 360:
        raise BadRequest("ra must be between 0 and 360 degrees")
    if not -90 <= dec <= 90:
        raise BadRequest("dec must be between -90 and 90 degrees")
    if fov not in FOVS:
        raise BadRequest("fov must be 3, 6, 12, 24 or 48 arcminutes")
    return round_position(ra, dec) + (int(fov),)


def round_position(ra: float, dec: float) -> tuple[float, float]:
    ra = round(ra % 360.0, ROUND_DEG)
    if ra >= 360.0:
        ra = 0.0
    dec = round(dec, ROUND_DEG)
    return ra + 0.0, dec + 0.0


def patch_id(ra: float, dec: float, fov: int, rels: list[str]) -> str:
    """Cache key: rounded position, field size and release list. A new release gives new keys."""
    text = f"{ra:.{ROUND_DEG}f},{dec:.{ROUND_DEG}f},{int(fov)},{'+'.join(rels)}"
    return hashlib.sha1(text.encode()).hexdigest()[:16]


def cutout_size(fov: int) -> float:
    return round(fov / 60 + pb.CUTOUT_MARGIN_DEG, 2)


def per_det(fov: int) -> int:
    """Exposures kept per detector per visit for a field size."""
    return WIDE_PER_DET if fov >= WIDE_FOV else LIVE_PER_DET


def first_look_groups(p: dict) -> list[tuple]:
    """The groups of the oldest and the newest visit (up to 12): asked first, oldest and newest of
    one detector side by side, detectors in FIRST_DETS order."""
    if not p["windows"]:
        return []
    ends = (p["windows"][0], p["windows"][-1])
    rank = {d: i for i, d in enumerate(FIRST_DETS)}
    found = [g for g in p["groups"] if g[0] in ends]
    return sorted(found, key=lambda g: (rank.get(g[1], len(rank)), g[0]))


def first_look(got: dict, p: dict) -> list:
    """The frames of a first look, once one detector has a picture at the oldest and the newest
    visit (enough to blink); [] before. All frames kept so far at those two visits, by date."""
    if not p["windows"]:
        return []
    old, new = p["windows"][0], p["windows"][-1]
    if not any(got.get((old, d)) and got.get((new, d)) for (_, d) in got):
        return []
    frames = [r for (w, _), rs in got.items() if w in (old, new) for r in rs]
    return sorted(frames, key=lambda r: (r[0]["mjd"], r[0]["det"]))


def search_limits(started: float) -> dict:
    """How long the search step may try: read timeout per try, waits between tries, and a
    deadline `pb.SEARCH_BUDGET` seconds after it started."""
    return {"timeout": pb.SEARCH_TIMEOUT, "waits": pb.SEARCH_WAITS, "deadline": started + pb.SEARCH_BUDGET}


def minutes(seconds: float) -> str:
    """75 -> "1 min 15 s", 40 -> "40 s"."""
    s = int(round(seconds))
    return f"{s // 60} min {s % 60} s" if s >= 60 else f"{s} s"


def allowed_origin(origin: str | None, allowed: list[str]) -> str | None:
    if origin and origin in allowed:
        return origin
    return None


def patch_catalogue(ra: float, dec: float, ahead: bool = False) -> dict:
    """The 'catalogue' block of a patch: a fixed position, not a catalogue object. `ahead`: the
    seed job chose the spot (a tour stop or a listed place), not a user."""
    who = ("Patch centre chosen ahead of time for a tour stop or a listed place" if ahead
           else "Patch centre asked for in the viewer")
    return {"ra": ra, "dec": dec, "ep": 2016.0, "pmra": 0.0, "pmdec": 0.0, "parallax": None,
            "from": f"{who} (a position, not a catalogue object)"}


def offset_arcmin(ra0: float, dec0: float, ra: float, dec: float) -> tuple[float, float]:
    """Offset of (ra, dec) from (ra0, dec0) in arcmin: x east, y north (fine for a degree or two).
    The same as the page's surround.ts `offsetArcmin`."""
    dra = ((ra - ra0) % 360 + 540) % 360 - 180
    return dra * math.cos(math.radians(dec0)) * 60, (dec - dec0) * 60


def covers(held: dict, ra: float, dec: float, fov: int) -> bool:
    """True when a held patch's cutouts hold the whole asked field: the page's surround.ts `covers`
    without its one-pixel slack. `held` has ra, dec, fov (its cutout side is cutout_size(fov)).
    A held patch is used only up to 2 steps wider than asked (at least 12'), so a small field never
    downloads a 48' patch's 6 MB."""
    if held["fov"] > max(12, 2 * fov):
        return False
    side = cutout_size(held["fov"]) * 60 - pb.CUTOUT_MARGIN_DEG * 60
    x, y = offset_arcmin(held["ra"], held["dec"], ra, dec)
    reach = side / 2 - fov / 2
    return abs(x) <= reach and abs(y) <= reach


def catalog_radius(fov: int) -> float:
    """Circle that holds the whole square patch, plus 30" (deg)."""
    return fov / 60 / 2 * math.sqrt(2) + 30 / 3600


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------------------------------------------------------------------------------------
# Jobs
# ---------------------------------------------------------------------------------------------

class Patch:
    """One patch: its status and the work that fills it. States: queued, searching, first, rest,
    ready, empty, failed."""

    def __init__(self, service: "Service", pid: str, ra: float, dec: float, fov: int, rels: list[str],
                 klass: str = "watched"):
        self.svc = service
        self.id = pid
        self.dir = service.root / pid
        self.lock = threading.Lock()
        self.status = {
            "id": pid, "state": "queued", "found": 0, "done": 0, "total": 0, "kept": 0,
            "releases": [], "error": "", "warning": "", "first": None, "full": None,
            "catalog": None, "catalogError": "",
            "ra": ra, "dec": dec, "fov": fov, "searched": rels,
            # The search step: the try under way (both releases are asked in parallel, so the
            # higher of the two), how many tries are allowed and how many seconds it may take.
            "searchTry": 0, "searchTries": len(pb.SEARCH_WAITS) + 1, "searchBudget": pb.SEARCH_BUDGET,
            "searchTimedOut": False,
            # Fetched ahead by the seed job rather than for a page that asked.
            "ahead": klass == "seed",
        }
        self.klass = klass
        self.last_seen = time.time() if klass == "watched" else 0.0
        self.grace = FIRST_GRACE
        self.queued_at = time.time()
        self.search_started = 0.0
        self.started = time.time()
        self.finished = 0.0
        self.timings: dict[str, float] = {}
        self.cat_started = False
        self.cat_failed = 0.0
        self.retry_after = RETRY_FAILED_AFTER

    def snapshot(self) -> dict:
        with self.lock:
            st = dict(self.status)
            # Seconds the search has been waiting on NASA's archive, while it searches.
            st["searchElapsed"] = (round(time.time() - self.search_started, 1)
                                   if st["state"] == "searching" and self.search_started else 0)
        # NASA's archive answered busy lately and requests wait to be asked again.
        st["retrying"] = st["state"] in ("searching", "first", "rest") and pb.retrying()
        return st

    def set(self, **kw):
        with self.lock:
            self.status.update(kw)

    # -- watching ---------------------------------------------------------------------------

    def touch(self):
        """A page asked about this patch: it is watched for the next WATCH_SECS."""
        self.last_seen = time.time()
        self.grace = FIRST_GRACE

    def watched(self) -> bool:
        return time.time() - self.last_seen < WATCH_SECS

    def wanted(self) -> bool:
        """Someone waits for it: a page is watching, or the seed job asked for it."""
        return self.klass == "seed" or self.watched()

    def priority(self) -> int:
        """Priority of its requests for the shared slots (prebake._Gate), asked again while waiting."""
        return pb.WATCHED if self.watched() else pb.SEED

    def keep_going(self) -> bool:
        """Asked before each cutout starts: carry on while wanted; else let a first look not yet
        written start a few more cutouts, then pause."""
        if self.wanted():
            return True
        if not self.status["first"] and self.grace > 0:
            self.grace -= 1
            return True
        return False

    # -- the work ---------------------------------------------------------------------------

    def run(self):
        self.timings["wait"] = time.time() - self.queued_at
        with pb.priority(self.priority):
            self._run()

    def _run(self):
        t0 = time.time()
        st = self.snapshot()
        ra, dec, fov, rels = st["ra"], st["dec"], st["fov"], st["searched"]
        cat = patch_catalogue(ra, dec, st["ahead"])
        size = cutout_size(fov)
        try:
            self.search_started = time.time()
            self.set(state="searching")
            tries: dict[str, int] = {}

            def on_try(n, _of):
                # Both releases search in parallel; the status shows the later of the two.
                with self.lock:
                    tries[threading.current_thread().name] = n
                    self.status["searchTry"] = max(tries.values())

            try:
                exps, counts, _ = pb.search(ra, dec, rels, check_retired=False,
                                            on_try=on_try, **search_limits(self.search_started))
            except pb.FetchError as e:
                took = time.time() - self.search_started
                pb.log(f"patch {self.id} search gave up after {took:.0f}s: {e}")
                self.retry_after = RETRY_SEARCH_AFTER
                silent = str(e).startswith(("no answer within", "gave up after"))
                n = self.snapshot()["searchTry"]
                self.set(state="failed", searchTimedOut=silent,
                         error=(f"NASA’s search did not answer within {minutes(took)} "
                                f"({n} {'try' if n == 1 else 'tries'})") if silent
                         else f"NASA’s search failed: {e}"[:300])
                self.finish()
                return
            self.timings["search"] = time.time() - t0
            self.set(found=len(exps))
            empty = [r for r, c in counts.items() if c == 0]
            if empty:
                threading.Thread(target=self.check_retired, args=(empty,), daemon=True).start()
            if not exps:
                self.set(state="empty")
                self.finish()
                return
            pb.load_plan_tables(exps)
            for e in exps:
                pb.estimate_lam(e, ra, dec)
            p = pb.plan(exps, per_det(fov), LIVE_MAX_FRAMES)
            planned = sum(min(p["perDet"], len(g)) for g in p["groups"].values())
            # After a pause the first look may already be written: carry on with the rest.
            self.set(state="rest" if self.snapshot()["first"] else "first", done=0, total=planned, kept=0)

            def on_frame(got):
                # The first look goes out as soon as it can blink; the rest keeps coming.
                if "first" in self.timings:
                    return
                first = first_look(got, p)
                if first:
                    self.timings["first"] = time.time() - t0
                    self.write_step("first", first, p, cat, fov, size, len(exps), p["perDet"])
                    self.set(state="rest")

            report: dict = {}
            frames, _ = pb.fetch_plan(p, cat, size, ahead=first_look_groups(p), on_frame=on_frame,
                                      on_progress=lambda d, t: self.set(done=d, total=t, kept=d),
                                      keep_going=self.keep_going, report=report)
            if report.get("stopped"):
                # Nobody watches it any more: what it fetched stays on disk for when it is asked again.
                self.set(state="paused")
                self.svc.count("paused")
                self.finish()
                return
            self.timings["full"] = time.time() - t0
            if not frames:
                self.set(state="failed", error="no exposure could be downloaded")
                self.finish()
                return
            self.write_step("full", frames, p, cat, fov, size, len(exps), p["perDet"])
            self.set(state="ready")
        except Exception as e:  # noqa: BLE001 - reported to the viewer, which then simulates
            pb.log(f"patch {self.id} failed: {type(e).__name__}: {e}")
            self.set(state="failed", error=f"{type(e).__name__}: {e}"[:300])
        self.finish()

    def check_retired(self, empty: list[str]):
        """A release that found nothing: say so in `warning` if IRSA no longer lists it."""
        notes = [n for n in (pb.release_note(r) for r in empty) if n]
        if notes:
            self.set(warning="; ".join(notes))

    def write_step(self, step: str, frames, p, cat, fov, size, found, per_det):
        entries, bits, raw = pb.pack(frames)
        nwin = pb.renumber_windows(entries)
        doc = {
            "catalogue": cat,
            "fov": fov,
            "size": size,
            "units": "MJy/sr, zodiacal light model (ZODI) subtracted",
            "flagBits": bits,
            "badFlags": pb.BAD_FLAG_NAMES,
            "perDetPerWindow": per_det,
            "monthly": False,
            "frames": entries,
            "live": {"id": self.id, "step": step, "fetched": now_iso(), "found": found, "windows": nwin,
                     "ahead": bool(self.status["ahead"])},
        }
        out = self.dir / step
        out.mkdir(parents=True, exist_ok=True)
        pb._write_atomic(out / "frames.bin.gz", pb.gzip_bytes(raw))
        pb._write_atomic(out / "frames.json", (json.dumps(doc, ensure_ascii=False) + "\n").encode())
        rels = sorted({e["release"] for e in entries})
        self.set(**{step: f"/api/patch/{self.id}/{step}/", "releases": rels, "kept": len(entries)})

    def finish(self):
        self.finished = time.time()
        st = self.snapshot()
        pb.log(f"patch {self.id} {st['state']} {self.klass} ra={st['ra']} dec={st['dec']} fov={st['fov']} "
               f"found={st['found']} kept={st['kept']} "
               + " ".join(f"{k}={v:.1f}s" for k, v in self.timings.items())
               + f" | {self.svc.counts_line()}")
        if st["state"] in ("ready", "empty"):
            self.dir.mkdir(parents=True, exist_ok=True)
            st["timings"] = {k: round(v, 1) for k, v in self.timings.items()}
            pb._write_atomic(self.dir / "status.json", json.dumps(st).encode())
            if st["state"] == "ready":
                self.svc.hold(st)

    def run_catalog(self):
        st = self.snapshot()
        ra, dec, fov = st["ra"], st["dec"], st["fov"]
        try:
            r = catalog_radius(fov)
            with ThreadPoolExecutor(max_workers=2) as pool:
                fg = pool.submit(pb.carry(pb.gaia_rows), ra, dec, r, CATALOG_LIMIT)
                fc = pool.submit(pb.carry(pb.catwise_rows), ra, dec, r, CATALOG_LIMIT)
                g_rows, g_src = fg.result()
                c_rows, c_src = fc.result()
            rows = []
            for name, src in (("gaia", g_rows), ("catwise", c_rows)):
                for x in src:
                    if x["ra"] is None or x["dec"] is None or x["mag"] is None:
                        continue
                    rows.append({"cat": name, "id": x["id"], "ra": round(x["ra"], 7), "dec": round(x["dec"], 7),
                                 "ep": x["ep"], "pmra": round(x["pmra"] or 0.0, 3),
                                 "pmdec": round(x["pmdec"] or 0.0, 3), "mag": round(x["mag"], 3)})
            doc = {
                "id": self.id, "ra": ra, "dec": dec, "fov": fov, "radius": round(r, 5),
                "generated": now_iso(),
                "from": {"gaia": g_src, "catwise": c_src},
                "capped": {"gaia": len(g_rows) >= CATALOG_LIMIT, "catwise": len(c_rows) >= CATALOG_LIMIT},
                "limit": CATALOG_LIMIT,
                "rows": rows,
            }
            self.dir.mkdir(parents=True, exist_ok=True)
            pb._write_atomic(self.dir / "catalog.json", (json.dumps(doc, ensure_ascii=False) + "\n").encode())
            self.set(catalog=f"/api/patch/{self.id}/catalog.json", catalogError="")
            pb.log(f"patch {self.id} catalog: {len(rows)} rows")
        except Exception as e:  # noqa: BLE001
            pb.log(f"patch {self.id} catalog failed: {type(e).__name__}: {e}")
            self.cat_failed = time.time()
            self.cat_started = False
            self.set(catalogError=f"{type(e).__name__}: {e}"[:300])


class Busy(Exception):
    pass


class Service:
    """Patches by id, a queue in three classes (a page watching first, then seed work, then work
    nobody watches, which is dropped and paused), and an index of finished patches, so a spot
    inside one is answered from it (coverage reuse)."""

    def __init__(self, root: Path, max_running: int = MAX_RUNNING, max_queued: int = MAX_QUEUED):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.patches: dict[str, Patch] = {}
        self.lock = threading.Lock()
        self.waiting: list[Patch] = []
        self.wake = threading.Condition(self.lock)
        self.max_queued = max_queued
        self.count_lock = threading.Lock()
        self.counts = {"cached": 0, "reused": 0, "started": 0, "seeded": 0, "paused": 0, "resumed": 0}
        self.held: dict[str, dict] = {}
        self.held_at = 0.0
        self._load_held()
        self.cat_queue: queue.Queue[Patch] = queue.Queue()
        for _ in range(max_running):
            threading.Thread(target=self._runner, daemon=True).start()
        threading.Thread(target=self._cat_worker, daemon=True).start()

    # -- queue ------------------------------------------------------------------------------

    def _enqueue(self, p: Patch):
        """Under self.lock."""
        p.queued_at = time.time()
        p.set(state="queued")
        self.waiting.append(p)
        self.wake.notify()

    def _next(self) -> Patch:
        """The next patch to run: watched first, then seed work, oldest first in each. One nobody
        watches any more is set aside as paused (it starts again when asked)."""
        with self.lock:
            while True:
                for p in [q for q in self.waiting if not q.wanted()]:
                    self.waiting.remove(p)
                    p.set(state="paused")
                    self.count("paused")
                if self.waiting:
                    p = min(self.waiting, key=lambda q: (0 if q.watched() else 1, q.queued_at))
                    self.waiting.remove(p)
                    return p
                self.wake.wait(1.0)

    def _runner(self):
        while True:
            p = self._next()
            try:
                p.run()
            except Exception as e:  # noqa: BLE001 - run() reports its own; this is a last guard
                pb.log(f"patch {p.id} runner: {type(e).__name__}: {e}")

    def _cat_worker(self):
        while True:
            p = self.cat_queue.get()
            try:
                with pb.priority(p.priority):
                    p.run_catalog()
            finally:
                self.cat_queue.task_done()

    # -- counters ---------------------------------------------------------------------------

    def count(self, what: str):
        with self.count_lock:
            self.counts[what] = self.counts.get(what, 0) + 1

    def counts_line(self) -> str:
        return " ".join(f"{k}={v}" for k, v in self.counts.items())

    # -- coverage reuse ---------------------------------------------------------------------

    def _load_held(self):
        """The index of finished patches on disk, for coverage reuse. Read again every HELD_RESCAN s,
        so patches another process wrote (the seed job) are found too."""
        self.held_at = time.time()
        rels = releases()
        for path in self.root.glob("*/status.json"):
            try:
                st = json.loads(path.read_text())
            except (OSError, json.JSONDecodeError):
                continue
            if st.get("state") == "ready" and st.get("full") and st.get("searched") == rels:
                self.held[st["id"]] = {k: st[k] for k in ("id", "ra", "dec", "fov")}

    def hold(self, st: dict):
        """A patch finished: index it for reuse."""
        if st.get("full") and st.get("searched") == releases():
            self.held[st["id"]] = {k: st[k] for k in ("id", "ra", "dec", "fov")}

    def covering(self, ra: float, dec: float, fov: int, skip: str = "") -> str | None:
        """The id of a finished patch whose cutouts hold the asked field: the narrowest, then the
        nearest. None if there is none."""
        if time.time() - self.held_at > HELD_RESCAN:
            self._load_held()
        found = [h for h in self.held.values() if h["id"] != skip and covers(h, ra, dec, fov)]
        if not found:
            return None
        best = min(found, key=lambda h: (h["fov"], math.hypot(*offset_arcmin(h["ra"], h["dec"], ra, dec))))
        return best["id"]

    # -- requests ---------------------------------------------------------------------------

    def _from_disk(self, pid: str) -> dict | None:
        path = self.root / pid / "status.json"
        if not path.exists():
            return None
        try:
            st = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError):
            return None
        if st.get("state") == "empty" and time.time() - path.stat().st_mtime > EMPTY_TTL:
            return None
        if (self.root / pid / "catalog.json").exists():
            st["catalog"] = f"/api/patch/{pid}/catalog.json"
        return st

    def _known(self, pid: str, watch: bool) -> dict | None:
        """Status of a patch held in memory or on disk, or None (unknown, or may be tried again).
        A page asking (`watch`) keeps it watched and wakes a paused one. Under self.lock."""
        p = self.patches.get(pid)
        if p is not None:
            if watch:
                p.touch()
            st = p.snapshot()
            if st["state"] == "failed" and time.time() - p.finished > p.retry_after:
                return None
            if st["state"] in ("ready", "empty") and not p.dir.exists():
                del self.patches[pid]
                self.held.pop(pid, None)
                return None  # cache folder was deleted
            if st["state"] == "paused" and p.wanted():
                self.count("resumed")
                self._enqueue(p)
                st = p.snapshot()
            self._ensure_catalog(p, st)
            return st
        disk = self._from_disk(pid)
        if disk is None:
            return None
        if not disk.get("catalog") and disk.get("state") in ("ready", "empty"):
            p = Patch(self, pid, disk["ra"], disk["dec"], disk["fov"], disk.get("searched", releases()))
            p.status.update({k: v for k, v in disk.items() if k in p.status})
            p.finished = time.time()
            self.patches[pid] = p
            self._ensure_catalog(p, p.snapshot())
            return p.snapshot()
        return {k: v for k, v in disk.items() if k != "timings"}

    def request(self, ra: float, dec: float, fov: int, klass: str = "watched") -> dict:
        """Find or start the patch. A finished patch that holds the field answers instead of a new
        fetch (`reused: true`, with that patch's own id, centre and field). `klass` "seed" is work
        nobody waits for (the seed job). Raises Busy when too many are waiting."""
        rels = releases()
        pid = patch_id(ra, dec, fov, rels)
        watch = klass == "watched"
        with self.lock:
            p = self.patches.get(pid)
            if p is not None and klass == "seed":
                p.klass = "seed"  # the seed job waits for it too: no pause when a page leaves
            st = self._known(pid, watch)
            if st is not None:
                self.count("cached")
                return st
            cover = self.covering(ra, dec, fov, skip=pid)
            if cover is not None:
                st = self._known(cover, watch)
                if st is not None and st.get("state") == "ready":
                    self.count("reused")
                    pb.log(f"patch {cover} reused for fov={fov} | {self.counts_line()}")
                    return dict(st, reused=True)
                self.held.pop(cover, None)
            if watch and sum(1 for q in self.waiting if q.klass == "watched") >= self.max_queued:
                raise Busy()
            p = Patch(self, pid, ra, dec, fov, rels, klass=klass)
            self.patches[pid] = p
            self.count("seeded" if klass == "seed" else "started")
            self._enqueue(p)
            self._ensure_catalog(p, p.snapshot())
            return p.snapshot()

    def _ensure_catalog(self, p: Patch, st: dict):
        """Start the catalogue query once; after a failure, again when next asked, after a pause."""
        if st.get("catalog") or p.cat_started:
            return
        if st.get("catalogError") and time.time() - p.cat_failed < RETRY_FAILED_AFTER:
            return
        p.cat_started = True
        self.cat_queue.put(p)

    def status(self, pid: str) -> dict | None:
        """Status by id. A page reading it keeps the patch watched, and wakes it if it paused."""
        with self.lock:
            return self._known(pid, True)

    def file(self, pid: str, *parts: str) -> Path | None:
        path = self.root.joinpath(pid, *parts)
        return path if path.is_file() else None


# ---------------------------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------------------------

FILE_RE = re.compile(r"/api/patch/([0-9a-f]{16})/(first|full)/(frames\.json|frames\.bin\.gz)")
STATUS_RE = re.compile(r"/api/patch/([0-9a-f]{16})")
CATALOG_RE = re.compile(r"/api/patch/([0-9a-f]{16})/catalog\.json")


class Handler(BaseHTTPRequestHandler):
    server_version = "sima-live/1.0"

    def version_string(self):
        return self.server_version
    service: Service = None  # set by make_server
    origins: list[str] = DEFAULT_ORIGINS

    def log_message(self, fmt, *args):
        pb.log("http", self.address_string(), fmt % args)

    def _cors(self):
        o = allowed_origin(self.headers.get("Origin"), self.origins)
        if o:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")

    def _json(self, code: int, obj, cache: str = "no-store"):
        body = (json.dumps(obj) + "\n").encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", cache)
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path, ctype: str):
        body = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        # A step's files never change once written, and a new release list gives new ids.
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Max-Age", "86400")
        self.end_headers()

    def do_POST(self):
        self._json(405, {"error": "only GET"})

    do_PUT = do_DELETE = do_PATCH = do_POST

    def do_GET(self):
        try:
            self._get()
        except BrokenPipeError:
            pass
        except Exception as e:  # noqa: BLE001
            pb.log(f"http error: {type(e).__name__}: {e}")
            self._json(500, {"error": "internal error"})

    def _get(self):
        u = urlsplit(self.path)
        path = u.path.rstrip("/") or "/"
        if path == "/api/health":
            self._json(200, {"ok": True, "releases": releases(), "fovs": list(FOVS),
                             "counts": dict(self.service.counts)})
            return
        if path == "/api/patch":
            try:
                ra, dec, fov = parse_patch_query(u.query)
            except BadRequest as e:
                self._json(400, {"error": str(e)})
                return
            try:
                self._json(200, self.service.request(ra, dec, fov))
            except Busy:
                self._json(503, {"error": "busy", "state": "busy"})
            return
        m = FILE_RE.fullmatch(path)
        if m:
            f = self.service.file(m.group(1), m.group(2), m.group(3))
            if f is None:
                self._json(404, {"error": "not ready"})
                return
            ctype = "application/json; charset=utf-8" if m.group(3).endswith(".json") else "application/octet-stream"
            self._file(f, ctype)
            return
        m = CATALOG_RE.fullmatch(path)
        if m:
            f = self.service.file(m.group(1), "catalog.json")
            if f is not None:
                self._file(f, "application/json; charset=utf-8")
                return
            st = self.service.status(m.group(1))
            if st is None:
                self._json(404, {"error": "unknown patch"})
            elif st.get("catalogError"):
                self._json(502, {"state": "failed", "error": st["catalogError"]})
            else:
                self._json(202, {"state": "pending"})
            return
        m = STATUS_RE.fullmatch(path)
        if m:
            st = self.service.status(m.group(1))
            if st is None:
                self._json(404, {"error": "unknown patch"})
            else:
                self._json(200, st)
            return
        self._json(404, {"error": "not found"})


def make_server(host: str, port: int, cache: Path, origins: list[str]) -> ThreadingHTTPServer:
    service = Service(cache / "live")
    handler = type("BoundHandler", (Handler,), {"service": service, "origins": list(origins)})
    srv = ThreadingHTTPServer((host, port), handler)
    srv.daemon_threads = True
    return srv


def main(argv=None):
    ap = argparse.ArgumentParser(description="Live SPHEREx frames for any coordinate (docs/live-service.md)")
    ap.add_argument("--host", default=os.environ.get("SIMA_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("SIMA_PORT", "8765")))
    ap.add_argument("--allow-origin", action="append", default=None,
                    help="page origin allowed to call the service (repeat for more); default http://localhost:5173")
    ap.add_argument("--cache", default=os.environ.get("SIMA_CACHE"), help=f"cache folder (default {pb.CACHE_DIR})")
    args = ap.parse_args(argv)
    if args.cache:
        pb.CACHE_DIR = Path(args.cache).expanduser()
    origins = args.allow_origin
    if origins is None:
        env = os.environ.get("SIMA_ALLOW_ORIGIN", "")
        origins = [o.strip() for o in env.split(",") if o.strip()] or DEFAULT_ORIGINS
    srv = make_server(args.host, args.port, pb.CACHE_DIR, origins)
    pb.log(f"live service on http://{args.host}:{args.port}/api/  cache {pb.CACHE_DIR}  "
           f"origins {', '.join(origins)}  releases {', '.join(releases())}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
