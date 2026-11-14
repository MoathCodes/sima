#!/usr/bin/env python3
"""Live SPHEREx frames for any coordinate: a small web service. Defined in docs/live-service.md.

A web page cannot call IRSA itself (no CORS headers), so this service searches, downloads and packs
real SPHEREx cutouts in the same format as public/data/ (docs/data-format.md). It imports
scripts/prebake.py for all of that and adds only the web part, with Python's standard library.

Routes (GET):
  /api/patch?ra=<deg>&dec=<deg>&fov=<3|6|12>       start or find the patch; answers its status
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

FOVS = (3, 6, 12)                  # field sizes the viewer offers (arcmin)
ROUND_DEG = 3                      # positions are rounded to 0.001 deg (3.6", about half a pixel)
LIVE_PER_DET = 2                   # exposures per detector per visit
LIVE_MAX_FRAMES = 48               # exposures per patch
MAX_RUNNING = 2                    # patches fetched at once
MAX_QUEUED = 8                     # patches waiting; more gets 503 busy
RETRY_FAILED_AFTER = 30            # seconds before a failed patch may be tried again
EMPTY_TTL = pb.SEARCH_TTL          # an empty spot is searched again after this long
CATALOG_LIMIT = 5000               # rows per catalogue in catalog.json, brightest first
DEFAULT_ORIGINS = ["http://localhost:5173"]
# Retry waits (seconds) for first-look cutouts: short and capped, so one exposure that IRSA keeps
# answering "busy" does not hold up the first look. Everything else uses prebake.RETRY_WAITS.
FIRST_LOOK_WAITS = [1, 2, 3, 5, 5, 5, 5, 5, 5, 5]

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
        raise BadRequest("fov must be 3, 6 or 12 arcminutes")
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


def first_look_groups(p: dict) -> list[tuple]:
    """One exposure per detector at the oldest and the newest visit (up to 12)."""
    if not p["windows"]:
        return []
    ends = {p["windows"][0], p["windows"][-1]}
    return [g for g in p["groups"] if g[0] in ends]


def allowed_origin(origin: str | None, allowed: list[str]) -> str | None:
    if origin and origin in allowed:
        return origin
    return None


def patch_catalogue(ra: float, dec: float) -> dict:
    """The 'catalogue' block of a patch: a fixed position, not a catalogue object."""
    return {"ra": ra, "dec": dec, "ep": 2016.0, "pmra": 0.0, "pmdec": 0.0, "parallax": None,
            "from": "Patch centre typed by the user (a position, not a catalogue object)"}


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

    def __init__(self, service: "Service", pid: str, ra: float, dec: float, fov: int, rels: list[str]):
        self.svc = service
        self.id = pid
        self.dir = service.root / pid
        self.lock = threading.Lock()
        self.status = {
            "id": pid, "state": "queued", "found": 0, "done": 0, "total": 0, "kept": 0,
            "releases": [], "error": "", "warning": "", "first": None, "full": None,
            "catalog": None, "catalogError": "",
            "ra": ra, "dec": dec, "fov": fov, "searched": rels,
        }
        self.started = time.time()
        self.finished = 0.0
        self.timings: dict[str, float] = {}
        self.cat_started = False
        self.cat_failed = 0.0

    def snapshot(self) -> dict:
        with self.lock:
            return dict(self.status)

    def set(self, **kw):
        with self.lock:
            self.status.update(kw)

    # -- the work ---------------------------------------------------------------------------

    def run(self):
        t0 = time.time()
        st = self.snapshot()
        ra, dec, fov, rels = st["ra"], st["dec"], st["fov"], st["searched"]
        cat = patch_catalogue(ra, dec)
        size = cutout_size(fov)
        try:
            self.set(state="searching")
            exps, counts, _ = pb.search(ra, dec, rels, check_retired=False)
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
            p = pb.plan(exps, LIVE_PER_DET, LIVE_MAX_FRAMES)
            groups = first_look_groups(p)
            self.set(state="first", done=0, total=len(groups), kept=0)
            frames, _ = pb.fetch_plan(p, cat, size, limit=1, groups=set(groups), waits=FIRST_LOOK_WAITS,
                                      on_progress=lambda d, t: self.set(done=d, total=t, kept=d))
            self.timings["first"] = time.time() - t0
            if frames:
                self.write_step("first", frames, p, cat, fov, size, len(exps), 1)
            planned = sum(min(p["perDet"], len(g)) for g in p["groups"].values())
            self.set(state="rest", done=0, total=planned, kept=0)
            frames, _ = pb.fetch_plan(p, cat, size,
                                      on_progress=lambda d, t: self.set(done=d, total=t, kept=d))
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
            "live": {"id": self.id, "step": step, "fetched": now_iso(), "found": found, "windows": nwin},
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
        pb.log(f"patch {self.id} {st['state']} ra={st['ra']} dec={st['dec']} fov={st['fov']} "
               f"found={st['found']} kept={st['kept']} "
               + " ".join(f"{k}={v:.1f}s" for k, v in self.timings.items()))
        if st["state"] in ("ready", "empty"):
            self.dir.mkdir(parents=True, exist_ok=True)
            st["timings"] = {k: round(v, 1) for k, v in self.timings.items()}
            pb._write_atomic(self.dir / "status.json", json.dumps(st).encode())

    def run_catalog(self):
        st = self.snapshot()
        ra, dec, fov = st["ra"], st["dec"], st["fov"]
        try:
            r = catalog_radius(fov)
            with ThreadPoolExecutor(max_workers=2) as pool:
                fg = pool.submit(pb.gaia_rows, ra, dec, r, CATALOG_LIMIT)
                fc = pool.submit(pb.catwise_rows, ra, dec, r, CATALOG_LIMIT)
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
    def __init__(self, root: Path, max_running: int = MAX_RUNNING, max_queued: int = MAX_QUEUED):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.patches: dict[str, Patch] = {}
        self.lock = threading.Lock()
        self.queue: queue.Queue[Patch] = queue.Queue()
        self.max_queued = max_queued
        self.cat_queue: queue.Queue[Patch] = queue.Queue()
        for _ in range(max_running):
            threading.Thread(target=self._worker, args=(self.queue, "run"), daemon=True).start()
        threading.Thread(target=self._worker, args=(self.cat_queue, "run_catalog"), daemon=True).start()

    @staticmethod
    def _worker(q: queue.Queue, method: str):
        while True:
            p = q.get()
            try:
                getattr(p, method)()
            finally:
                q.task_done()

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

    def request(self, ra: float, dec: float, fov: int) -> dict:
        """Find or start the patch. Raises Busy when too many are waiting."""
        rels = releases()
        pid = patch_id(ra, dec, fov, rels)
        with self.lock:
            p = self.patches.get(pid)
            if p is not None:
                st = p.snapshot()
                if st["state"] == "failed" and time.time() - p.finished > RETRY_FAILED_AFTER:
                    p = None
                elif st["state"] in ("ready", "empty") and not p.dir.exists():
                    p = None  # cache folder was deleted
                else:
                    self._ensure_catalog(p, st)
                    return st
            disk = self._from_disk(pid)
            if disk is not None:
                if not disk.get("catalog"):
                    p = Patch(self, pid, ra, dec, fov, rels)
                    p.status.update({k: v for k, v in disk.items() if k in p.status})
                    p.finished = time.time()
                    self.patches[pid] = p
                    self._ensure_catalog(p, p.snapshot())
                    return p.snapshot()
                return {k: v for k, v in disk.items() if k != "timings"}
            if self.queue.qsize() >= self.max_queued:
                raise Busy()
            p = Patch(self, pid, ra, dec, fov, rels)
            self.patches[pid] = p
            self.queue.put(p)
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
        with self.lock:
            p = self.patches.get(pid)
        if p is not None:
            return p.snapshot()
        st = self._from_disk(pid)
        return None if st is None else {k: v for k, v in st.items() if k != "timings"}

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
        self.send_header("Cache-Control", "public, max-age=3600")
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
            self._json(200, {"ok": True, "releases": releases(), "fovs": list(FOVS)})
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
