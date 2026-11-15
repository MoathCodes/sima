#!/usr/bin/env python3
"""Fetch the tour stops and the top places ahead of time, into the live service's cache, and
export them as static files for any web host. Plan: docs/research/prediction.md, option 3.

Which spots: every tour stop (src/data/tours.ts) and every tier 0 and tier 1 place
(src/data/places.json), less the five shipped targets (their pictures ship with the app). Each is
fetched at 12' (or the place's own field when it is wider), so it also serves smaller fields and
nudges near it (live.py coverage reuse).

How: the script runs the live service's own code in this process, as seed work: one spot at a
time, lowest priority, at most 4 requests at a time, holding back after any busy reply. If a
live service runs on the same cache, its pages still go first there, and it finds the seeded
patches on disk within a minute.

Run (from the repo root, with the .venv of scripts/requirements.txt):

  python scripts/seed_live.py --list                  # the spots, no network
  python scripts/seed_live.py [--limit N] [--only id,id] [--cache DIR]
  python scripts/seed_live.py --export DIR            # the static seed: DIR/index.json and
                                                      # DIR/<id>/full/{frames.json,frames.bin.gz}

The export goes outside public/ and outside git (default `seed-out/`, ignored): upload it to a
bucket and build the page with VITE_SEED_BASE (docs/live-service.md, "Seed").
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import live  # noqa: E402
import prebake as pb  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PLACES = ROOT / "src" / "data" / "places.json"
TOURS = ROOT / "src" / "data" / "tours.ts"
TARGETS = ROOT / "src" / "core" / "targets.ts"
EXPORT_DIR = ROOT / "seed-out"
SEED_FOV = 12          # arcmin: a 12' patch also serves 3' and 6' fields near its centre
MAX_TIER = 1
SPOT_TIMEOUT = 15 * 60  # seconds one spot may take before the script moves on
CATALOG_WAIT = 120      # seconds a finished spot waits for its catalog.json (Gaia, CatWISE)
POLL = 2.0
FILES = ("frames.json", "frames.bin.gz")


def frame_fov(place: dict) -> int:
    """The field the page opens a place at (shell/objects.ts `frameFov`)."""
    size = place.get("size") or {}
    want = size["major"] * 1.3 if size.get("major") else 6
    return next((f for f in live.FOVS if f >= want), 48)


def shipped_keys(text: str) -> set[str]:
    return set(re.findall(r"^\s*key:\s*'([^']+)'", text, re.M))


def tour_ids(text: str) -> list[str]:
    return re.findall(r"place:\s*'([^']+)'", text)


def spots(places: dict, tours_ts: str, targets_ts: str, max_tier: int = MAX_TIER) -> list[dict]:
    """Tour stops first (in tour order), then tier 0 and 1 places; no repeats, no shipped targets.
    Each: id, name, ra, dec, fov (the seed's field: 12' or the place's own when wider)."""
    by_id = {p["id"]: p for p in places["places"]}
    skip = shipped_keys(targets_ts)
    order = [i for i in tour_ids(tours_ts) if i in by_id]
    order += [p["id"] for p in places["places"] if p.get("tier", 9) <= max_tier]
    out, seen = [], set()
    for pid in order:
        if pid in seen or pid in skip:
            continue
        seen.add(pid)
        p = by_id[pid]
        ra, dec = live.round_position(float(p["ra"]), float(p["dec"]))
        name = (p.get("names") or {}).get("common") or pid
        out.append({"id": pid, "name": name, "ra": ra, "dec": dec, "fov": max(SEED_FOV, frame_fov(p))})
    return out


def load_spots() -> list[dict]:
    return spots(json.loads(PLACES.read_text()), TOURS.read_text(), TARGETS.read_text())


def seed(svc: live.Service, todo: list[dict], timeout: float = SPOT_TIMEOUT, poll: float = POLL,
         say=print) -> dict:
    """Ask for each spot as seed work, one at a time, and wait for it. Returns counts by outcome."""
    tally: dict[str, int] = {}
    for n, s in enumerate(todo, 1):
        t0 = time.time()
        st = svc.request(s["ra"], s["dec"], s["fov"], klass="seed")
        reused = bool(st.get("reused"))
        pid = st["id"]
        while st["state"] not in ("ready", "empty", "failed"):
            if time.time() - t0 > timeout:
                st = dict(st, state="timeout")
                break
            time.sleep(poll)
            # Read without watching: a page's read would lift it to watched priority.
            st = svc.status(pid, watch=False) or dict(st, state="failed")
        # The catalogue goes into the export too: give it a little longer.
        t1 = time.time()
        while (st["state"] == "ready" and not st.get("catalog") and not st.get("catalogError")
               and time.time() - t1 < CATALOG_WAIT):
            time.sleep(poll)
            st = svc.status(pid, watch=False) or st
        how = "held" if reused else st["state"]
        tally[how] = tally.get(how, 0) + 1
        say(f"[{n}/{len(todo)}] {s['id']} ({s['name']}) {s['fov']}': {how} in {time.time() - t0:.0f}s"
            + (f" ({st.get('error')})" if st.get("error") else ""))
    return tally


def export(svc: live.Service, todo: list[dict], out: Path) -> dict:
    """Copy the finished patch that holds each spot to `out` and write `out/index.json`."""
    out.mkdir(parents=True, exist_ok=True)
    entries: dict[str, dict] = {}
    missing = []
    for s in todo:
        pid = svc.covering(s["ra"], s["dec"], s["fov"])
        if pid is None:
            missing.append(s["id"])
            continue
        if pid not in entries:
            src = svc.root / pid / "full"
            doc = json.loads((src / "frames.json").read_text())
            dst = out / pid / "full"
            dst.mkdir(parents=True, exist_ok=True)
            for f in FILES:
                shutil.copyfile(src / f, dst / f)
            cat = svc.root / pid / "catalog.json"
            if cat.exists():
                shutil.copyfile(cat, out / pid / "catalog.json")
            h = svc.held[pid]
            entries[pid] = {"id": pid, "ra": h["ra"], "dec": h["dec"], "fov": h["fov"], "size": doc["size"],
                            "fetched": doc["live"]["fetched"], "frames": len(doc["frames"]),
                            "found": doc["live"]["found"], "places": []}
        entries[pid]["places"].append(s["id"])
    index = {"version": 1, "made": live.now_iso(), "releases": live.releases(),
             "patches": sorted(entries.values(), key=lambda e: (e["ra"], e["dec"]))}
    pb._write_atomic(out / "index.json", (json.dumps(index, ensure_ascii=False, indent=1) + "\n").encode())
    return {"patches": len(entries), "spots": len(todo) - len(missing), "missing": missing}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Fetch tour stops and top places ahead (docs/live-service.md, Seed)")
    ap.add_argument("--cache", default=None, help=f"the live service's cache folder (default {pb.CACHE_DIR})")
    ap.add_argument("--list", action="store_true", help="print the spots and stop (no network)")
    ap.add_argument("--only", default="", help="comma-separated place ids")
    ap.add_argument("--limit", type=int, default=0, help="only the first N spots")
    ap.add_argument("--max-fov", type=int, default=48, choices=live.FOVS,
                    help="leave out places whose field is wider (a 48' patch is about 6 MB)")
    ap.add_argument("--export", nargs="?", const=str(EXPORT_DIR), default=None, metavar="DIR",
                    help=f"write the static seed for spots already fetched (default {EXPORT_DIR.name}/)")
    ap.add_argument("--timeout", type=float, default=SPOT_TIMEOUT, help="seconds per spot")
    args = ap.parse_args(argv)
    if args.cache:
        pb.CACHE_DIR = Path(args.cache).expanduser()
    todo = load_spots()
    if args.only:
        want = {x.strip() for x in args.only.split(",") if x.strip()}
        todo = [s for s in todo if s["id"] in want]
    todo = [s for s in todo if s["fov"] <= args.max_fov]
    if args.limit:
        todo = todo[: args.limit]
    if args.list:
        for s in todo:
            print(f"{s['id']}\t{s['ra']:.3f}\t{s['dec']:+.3f}\t{s['fov']}'\t{s['name']}")
        print(f"{len(todo)} spots", file=sys.stderr)
        return 0
    if args.export is not None:
        svc = live.Service(pb.CACHE_DIR / "live", max_running=0)
        res = export(svc, todo, Path(args.export))
        print(f"exported {res['patches']} patches for {res['spots']} of {len(todo)} spots to {args.export}"
              + (f"; not fetched yet: {', '.join(res['missing'][:10])}"
                 + (" …" if len(res["missing"]) > 10 else "") if res["missing"] else ""))
        return 0
    svc = live.Service(pb.CACHE_DIR / "live")
    pb.log(f"seeding {len(todo)} spots into {svc.root}")
    tally = seed(svc, todo, timeout=args.timeout)
    pb.log(f"seed done: {tally} | {svc.counts_line()}")
    # A request NASA never answers can keep a worker thread for many minutes, and Python waits for
    # pool threads at exit. Every finished patch is already on disk, so leave at once.
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(0)


if __name__ == "__main__":
    sys.exit(main())
