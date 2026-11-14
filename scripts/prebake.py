#!/usr/bin/env python3
"""Download real SPHEREx exposures of the five challenge targets into public/data/.

The file format is defined in docs/data-format.md. In short, for each target:

  public/data/<key>/frames.json    settings and one entry per exposure
  public/data/<key>/frames.bin.gz  flags (uint32) and pixels (float16, IMAGE minus ZODI) of every exposure
  public/data/manifest.json        which targets have data

Everything comes fresh from public archives:

  - NASA/IPAC IRSA: one TAP query per release finds the exposures (as in IRSA's SPHEREx tutorial
    notebook), cutouts come from the Level 2 file address + ?center=ra,dec&size=deg, and each
    detector's wavelength table is read from the last few kilobytes of one Level 2 file.
  - ESA Gaia archive (Gaia DR3) and IRSA (CatWISE2020) for the neighbours of each target.

Usage:
  python scripts/prebake.py --plan          # search and plan only
  python scripts/prebake.py                 # all five targets
  python scripts/prebake.py barnard         # one target

scripts/live.py imports the functions below and writes the same format for any coordinate.
"""

from __future__ import annotations

import argparse
import csv
import datetime as _dt
import gzip
import hashlib
import io
import json
import math
import os
import random
import re
import struct
import sys
import threading
import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.wcs import WCS, FITSFixedWarning

warnings.simplefilter("ignore", FITSFixedWarning)
warnings.filterwarnings("ignore", module="astropy.wcs")

# ---------------------------------------------------------------------------------------------
# Configuration. New data releases arrive often: add the collection to RELEASES and run again.
# ---------------------------------------------------------------------------------------------

# IRSA image collections searched, oldest first. Checked against IRSA's list on 2026-11-14:
# spherex_dr1, spherex_dr1_deep, spherex_dr1_cal, spherex_qr3, spherex_qr3_deep.
RELEASES = ["spherex_dr1", "spherex_qr3"]
# Deep-field collections, searched only for targets marked deep=True (fields near the ecliptic poles).
DEEP_RELEASES = ["spherex_dr1_deep", "spherex_qr3_deep"]

IRSA = "https://irsa.ipac.caltech.edu/"
IRSA_TAP = "https://irsa.ipac.caltech.edu/TAP/sync"
GAIA_TAP = "https://gea.esac.esa.int/tap-server/tap/sync"
VIZIER = "https://vizier.cfa.harvard.edu/viz-bin/asu-tsv"

USER_AGENT = "sima-sky-viewer/1.0"
MAX_CONCURRENT = 8                      # requests to outside services at a time, whole process
RETRY_STATUS = {429, 500, 502, 503, 504}
RETRY_WAITS = [2, 4, 8, 15, 30, 60]     # seconds before each retry (plus a little jitter)
TIMEOUT = (20, 180)                     # connect, read (seconds)

CACHE_DIR = Path(os.environ.get("SIMA_CACHE", Path.home() / ".cache" / "sima-rebuild" / "irsa"))
SEARCH_TTL = 12 * 3600                  # a search is reused for this long (seconds)
COLLECTIONS_TTL = 24 * 3600             # IRSA's collection list is reused for a day
NEIGHBOUR_TTL = 30 * 24 * 3600          # catalogue rows do not change

WINDOW_GAP_DAYS = 40                    # a new visit window starts after a gap this long
PER_DET_PER_WINDOW = 4                  # exposures kept per detector per window
MAX_FRAMES_PER_TARGET = 96
EDGE_PX = 5                             # skip an exposure if the target is this close to the cutout edge
CUTOUT_MARGIN_DEG = 0.01                # cutout side = field width + this
PLAN_SAME_COLOUR = 0.3                  # plan aims within this many channel widths
WCS_GRID = 9                            # plain-TAN fit grid (9 x 9 across the cutout)

NEIGHBOUR_REACH_ARCSEC = 30.0           # neighbours that come this close to the target's track
NEIGHBOUR_DATES = 20                    # dates checked between the first and last exposure
TARGET_MATCH_ARCSEC = {"gaia": 2.0, "catwise": 4.0}
CATWISE_EPOCH_MJD = 57170.0             # CatWISE2020 ra_pm/dec_pm epoch

# A pixel with any of these flags is not used for measuring. SOURCE only says a known star is there;
# FULLSAMPLE and PHANMISS are informational. See docs/data-format.md, "Bad flags".
BAD_FLAG_NAMES = [
    "TRANSIENT", "OVERFLOW", "SUR_ERROR", "NONFUNC", "DICHROIC", "MISSING_DATA", "HOT", "COLD",
    "NONLINEAR", "PERSIST", "OUTLIER", "CROSSTALK", "GHOST", "GHOST_FPA", "GHOST_EXT", "STREAK",
    "BLOOM", "SNOWBALL", "HALO", "SATELLITE_HALO",
]
# Bits that no file header names (Table 16 of the SPHEREx Explanatory Supplement v2.0).
EXTRA_FLAG_BITS = {29: "SATELLITE_HALO"}

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "data"

# Catalogue values centre each cutout. Each value's source is in "from".
TARGETS = {
    "barnard": {
        "label": "Barnard's Star",
        "catalogue": {
            "ra": 269.44850252543836, "dec": 4.739420051112412, "ep": 2016.0,
            "pmra": -801.5509783684709, "pmdec": 10362.394206546573, "parallax": 546.975939730948,
            "from": "Gaia DR3 4472832130942575872 (ESA Gaia archive, gaiadr3.gaia_source)",
        },
        "fov": 6,
    },
    "eps-indi-b": {
        "label": "Epsilon Indi B",
        "catalogue": {
            "ra": 331.07645259656397, "dec": -56.79381206688221, "ep": 2016.0,
            "pmra": 3981.97666296105, "pmdec": -2466.8318147663504, "parallax": 270.6580324694526,
            "from": "Gaia DR3 6412596012146801152 (ESA Gaia archive, gaiadr3.gaia_source)",
        },
        "fov": 12,
    },
    "wise-0855": {
        "label": "WISE 0855−0714",
        "catalogue": {
            "ra": 133.787082, "dec": -7.244433, "ep": 2014.0,
            "pmra": -8118.0, "pmdec": 680.0, "parallax": 449.0,
            "from": "SPEC 7.1 rule 6 (too cold for Gaia); checked against CatWISE2020, which lists it "
                    "three times near this track",
        },
        "fov": 6,
    },
    "rw-aur": {
        "label": "RW Aurigae",
        "catalogue": {
            "ra": 76.95608119552952, "dec": 30.401204589097233, "ep": 2016.0,
            "pmra": 2.6406431770317083, "pmdec": -27.397582540455325, "parallax": 6.406249329219477,
            "from": "Gaia DR3 156430822114424576 (ESA Gaia archive, gaiadr3.gaia_source)",
        },
        "fov": 6,
    },
    "r-dra": {
        "label": "R Draconis",
        "catalogue": {
            "ra": 248.1673783672889, "dec": 66.75500674547219, "ep": 2016.0,
            "pmra": -20.642811719160797, "pmdec": 6.148818852711324, "parallax": 1.2509180143740992,
            "from": "Gaia DR3 1648328016354496384 (ESA Gaia archive, gaiadr3.gaia_source)",
        },
        "fov": 12,
        "deep": True,
        "monthly": True,
        "max_frames": 150,
    },
}

# ---------------------------------------------------------------------------------------------
# Logging and small helpers
# ---------------------------------------------------------------------------------------------

_log_lock = threading.Lock()


def log(*parts):
    with _log_lock:
        stamp = time.strftime("%H:%M:%S")
        print(f"[{stamp}]", *parts, file=sys.stderr, flush=True)


def mjd_to_year(mjd: float) -> float:
    """Decimal Julian year (2000.0 = MJD 51544.5)."""
    return 2000.0 + (mjd - 51544.5) / 365.25


def year_to_mjd(year: float) -> float:
    return 51544.5 + (year - 2000.0) * 365.25


def move(ra: float, dec: float, ep: float, pmra: float, pmdec: float, year: float):
    """Position at decimal year `year`, moved along the catalogue motion (mas/yr, pmra times cos dec)."""
    dt = year - ep
    dec2 = dec + pmdec * dt / 3.6e6
    cosd = math.cos(math.radians((dec + dec2) / 2))
    ra2 = (ra + pmra * dt / 3.6e6 / max(cosd, 1e-9)) % 360.0
    return ra2, dec2


def target_at(cat: dict, mjd: float):
    return move(cat["ra"], cat["dec"], cat["ep"], cat.get("pmra", 0.0), cat.get("pmdec", 0.0),
                mjd_to_year(mjd))


def sep_arcsec(ra1, dec1, ra2, dec2):
    """Angular separation in arcsec (haversine). Works on numbers or numpy arrays."""
    r1, d1, r2, d2 = map(np.radians, (ra1, dec1, ra2, dec2))
    s = np.sin((d2 - d1) / 2) ** 2 + np.cos(d1) * np.cos(d2) * np.sin((r2 - r1) / 2) ** 2
    return np.degrees(2 * np.arcsin(np.sqrt(np.clip(s, 0, 1)))) * 3600.0


def tan_project(ra, dec, ra0, dec0):
    """Gnomonic standard coordinates (xi east, eta north), degrees."""
    a, d, a0, d0 = map(np.radians, (ra, dec, ra0, dec0))
    cosc = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - a0)
    xi = np.cos(d) * np.sin(a - a0) / cosc
    eta = (np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - a0)) / cosc
    return np.degrees(xi), np.degrees(eta)


def tan_deproject(xi, eta, ra0, dec0):
    x, y, d0 = np.radians(xi), np.radians(eta), np.radians(dec0)
    rho = np.hypot(x, y)
    c = np.arctan(rho)
    with np.errstate(invalid="ignore", divide="ignore"):
        dec = np.where(rho == 0, d0, np.arcsin(np.cos(c) * np.sin(d0) + y * np.sin(c) * np.cos(d0) / np.where(rho == 0, 1, rho)))
        ra = np.radians(ra0) + np.arctan2(x * np.sin(c), rho * np.cos(d0) * np.cos(c) - y * np.sin(d0) * np.sin(c))
    return np.degrees(ra) % 360.0, np.degrees(dec)


# ---------------------------------------------------------------------------------------------
# Network: every outside request goes through fetch(), at most MAX_CONCURRENT at a time
# ---------------------------------------------------------------------------------------------

_sem = threading.BoundedSemaphore(MAX_CONCURRENT)
_local = threading.local()
_last_retry = 0.0  # time.time() of the last retry wait, any request


def retrying(within: float = 20.0) -> bool:
    """True when some request waited to retry a busy or failed reply in the last `within` s."""
    return time.time() - _last_retry < within


class FetchError(Exception):
    pass


def _session() -> requests.Session:
    s = getattr(_local, "session", None)
    if s is None:
        s = requests.Session()
        s.headers["User-Agent"] = USER_AGENT
        _local.session = s
    return s


def fetch(url: str, *, params=None, data=None, headers=None, stop=None, what: str = "",
          waits: list[float] | None = None) -> tuple[int, bytes]:
    """GET (or POST when `data` is given). Busy replies and dropped connections are retried after
    each wait in `waits` (default RETRY_WAITS). `stop(buffer)` may end a download early once enough
    bytes have arrived. Returns (status, body). Raises FetchError for any other failure."""
    global _last_retry
    waits = RETRY_WAITS if waits is None else waits
    last = ""
    for attempt in range(len(waits) + 1):
        if attempt:
            wait = waits[attempt - 1] * (1 + 0.25 * random.random())
            log(f"  retry {attempt} in {wait:.0f}s ({last}) {what or url[:100]}")
            _last_retry = time.time()
            time.sleep(wait)
        with _sem:
            try:
                method = "POST" if data is not None else "GET"
                with _session().request(method, url, params=params, data=data, headers=headers,
                                        stream=True, timeout=TIMEOUT) as r:
                    if r.status_code in RETRY_STATUS:
                        last = f"HTTP {r.status_code}"
                        continue
                    if r.status_code >= 400:
                        raise FetchError(f"HTTP {r.status_code} for {what or url[:120]}")
                    buf = bytearray()
                    for chunk in r.iter_content(65536):
                        buf += chunk
                        if stop is not None and stop(buf):
                            break
                    return r.status_code, bytes(buf)
            except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError) as e:
                last = type(e).__name__
                continue
    raise FetchError(f"gave up after {len(waits) + 1} tries ({last}): {what or url[:120]}")


def _cache_path(*parts: str) -> Path:
    p = CACHE_DIR.joinpath(*parts)
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _write_atomic(path: Path, blob: bytes):
    tmp = path.with_name(path.name + f".{os.getpid()}.{threading.get_ident()}.tmp")
    tmp.write_bytes(blob)
    os.replace(tmp, path)


def _fresh(path: Path, ttl: float | None) -> bool:
    return path.exists() and (ttl is None or time.time() - path.stat().st_mtime < ttl)


def tap(service: str, adql: str, *, ttl: float | None = SEARCH_TTL, what: str = "") -> list[dict]:
    """Run one synchronous ADQL query and return rows as dicts (strings). Cached on disk for `ttl`."""
    key = hashlib.sha1((service + "\n" + adql).encode()).hexdigest()
    path = _cache_path("tap", key + ".csv")
    if _fresh(path, ttl):
        body = path.read_bytes()
    else:
        form = {"QUERY": adql, "FORMAT": "csv"}
        if "gea.esac" in service:
            form.update({"REQUEST": "doQuery", "LANG": "ADQL"})
        _, body = fetch(service, data=form, what=what or "TAP query")
        head = body[:300].lstrip()
        if head.startswith(b"<") or b"ERROR" in head[:100].upper():
            raise FetchError(f"TAP error from {service}: {body[:400]!r}")
        _write_atomic(path, body)
    return list(csv.DictReader(io.StringIO(body.decode("utf-8"))))


# ---------------------------------------------------------------------------------------------
# Search: one TAP query per release
# ---------------------------------------------------------------------------------------------

_POLY_RE = re.compile(r"l2b-v\d+-\d{4}-\d{3}")


def decode_poly(hexwkb: str) -> list[tuple[float, float]]:
    """The plane table's footprint is PostGIS extended WKB (hex): a polygon of 5 points, the last
    repeating the first. Returns the 4 corners as (ra, dec), in the order of pixels
    (0,0), (2039,0), (2039,2039), (0,2039) of the detector."""
    b = bytes.fromhex(hexwkb)
    order = "<" if b[0] == 1 else ">"
    gtype = struct.unpack(order + "I", b[1:5])[0]
    off = 5
    if gtype & 0x20000000:  # SRID present
        off += 4
    nrings = struct.unpack(order + "I", b[off:off + 4])[0]
    off += 4
    if nrings < 1:
        raise ValueError("empty polygon")
    npts = struct.unpack(order + "I", b[off:off + 4])[0]
    off += 4
    vals = struct.unpack(order + "%dd" % (2 * npts), b[off:off + 16 * npts])
    pts = [(vals[2 * i] % 360.0, vals[2 * i + 1]) for i in range(npts)]
    if len(pts) > 1 and pts[0] == pts[-1]:
        pts = pts[:-1]
    return pts[:4]


def search_adql(ra: float, dec: float, release: str) -> str:
    return (
        "SELECT o.observationid, p.energy_bandpassname, p.time_bounds_lower, p.time_bounds_upper, "
        "p.time_exposure, p.poly, a.uri "
        "FROM spherex.artifact a "
        "JOIN spherex.plane p ON a.planeid = p.planeid "
        "JOIN spherex.observation o ON p.obsid = o.obsid "
        f"WHERE o.collection = '{release}' AND a.producttype = 'science' "
        f"AND 1 = CONTAINS(POINT('ICRS', {ra:.6f}, {dec:.6f}), p.poly)"
    )


def parse_search_row(row: dict, release: str) -> dict | None:
    m = re.search(r"D(\d)$", row.get("energy_bandpassname", ""))
    uri = row.get("uri", "")
    if not m or not uri.endswith(".fits"):
        return None
    det = int(m.group(1))
    obsid = row["observationid"]
    t0, t1 = float(row["time_bounds_lower"]), float(row["time_bounds_upper"])
    pm = _POLY_RE.search(uri)
    try:
        corners = decode_poly(row["poly"])
    except Exception:
        corners = None
    return {
        "id": f"{obsid}D{det}",
        "obsid": obsid,
        "det": det,
        "release": release,
        "url": IRSA + uri.lstrip("/"),
        "pipeline": pm.group(0) if pm else "",
        "t": (t0 + t1) / 2,
        "exptime": float(row["time_exposure"]) if row.get("time_exposure") else None,
        "corners": corners,
    }


def search_release(ra: float, dec: float, release: str, ttl: float | None = SEARCH_TTL) -> list[dict]:
    rows = tap(IRSA_TAP, search_adql(ra, dec, release), ttl=ttl, what=f"search {release}")
    out = [e for e in (parse_search_row(r, release) for r in rows) if e]
    return out


def search(ra: float, dec: float, releases: list[str], ttl: float | None = SEARCH_TTL,
           check_retired: bool = True):
    """All releases at once, one TAP query each, in parallel. An exposure found in more than one
    release is kept from the first release in the list. Returns (exposures sorted by time,
    {release: count}, [warnings]). With check_retired=False the caller checks empty releases itself
    (release_note), so a slow collection-list query does not hold up the search."""
    found: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=len(releases)) as pool:
        futs = {pool.submit(search_release, ra, dec, r, ttl): r for r in releases}
        for f in as_completed(futs):
            found[futs[f]] = f.result()
    seen, exps = set(), []
    for r in releases:
        for e in found[r]:
            if e["id"] not in seen:
                seen.add(e["id"])
                exps.append(e)
    exps.sort(key=lambda e: (e["t"], e["det"]))
    counts = {r: len(found[r]) for r in releases}
    notes = [n for n in (release_note(r) for r, c in counts.items() if c == 0) if n] if check_retired else []
    return exps, counts, notes


def irsa_collections() -> list[str]:
    rows = tap(IRSA_TAP, "SELECT DISTINCT collection FROM spherex.observation", ttl=COLLECTIONS_TTL,
               what="SPHEREx collection list")
    return sorted(r["collection"] for r in rows)


def release_note(release: str) -> str:
    """When a release found nothing, say so if IRSA no longer lists it (retired)."""
    try:
        now = irsa_collections()
    except FetchError as e:
        return f"{release} returned nothing; IRSA's collection list could not be read ({e})"
    if release in now:
        return ""
    note = f"{release} returned nothing and IRSA no longer lists it; IRSA now lists: {', '.join(now)}"
    log("WARNING:", note)
    return note


# ---------------------------------------------------------------------------------------------
# Visits and windows
# ---------------------------------------------------------------------------------------------

def group_windows(times: list[float], gap_days: float = WINDOW_GAP_DAYS, monthly: bool = False) -> list[int]:
    """Window index for each time (MJD). A new window starts after a gap of more than `gap_days`;
    with monthly=True each calendar month (UTC) is a window. Indexes count from 0 in time order."""
    if not times:
        return []
    order = sorted(range(len(times)), key=lambda i: times[i])
    win = [0] * len(times)
    if monthly:
        keys = {}
        for i in order:
            d = _dt.datetime(1858, 11, 17) + _dt.timedelta(days=times[i])
            k = (d.year, d.month)
            keys.setdefault(k, len(keys))
            win[i] = keys[k]
        return win
    w, prev = 0, None
    for i in order:
        if prev is not None and times[i] - prev > gap_days:
            w += 1
        win[i] = w
        prev = times[i]
    return win


# ---------------------------------------------------------------------------------------------
# Wavelength: each detector's lookup table (WCS-WAVE), read from the end of one Level 2 file
# ---------------------------------------------------------------------------------------------

WAVE_TAIL_BYTES = 4 * 2880  # WCS-WAVE is the last extension: one header block and one data block


def parse_wave_table(blob: bytes):
    """Find the WCS-WAVE binary table in the last bytes of a Level 2 file. Returns (X, Y, VALUES)
    with VALUES shaped (len(Y), len(X), 2): [..., 0] wavelength, [..., 1] bandwidth, in um."""
    i = blob.rfind(b"EXTNAME = 'WCS-WAVE'")
    if i < 0:
        raise ValueError("no WCS-WAVE extension in the bytes read")
    s = blob.rfind(b"XTENSION=", 0, i)
    if s < 0:
        raise ValueError("WCS-WAVE header starts before the bytes read")
    hdu = fits.BinTableHDU.fromstring(blob[s:])
    X = np.asarray(hdu.data["X"][0], float)
    Y = np.asarray(hdu.data["Y"][0], float)
    V = np.asarray(hdu.data["VALUES"][0], float)
    if V.shape != (len(Y), len(X), 2):
        raise ValueError(f"unexpected WCS-WAVE shape {V.shape}")
    return X, Y, V


_wave_mem: dict[str, tuple] = {}
_wave_lock = threading.Lock()


def wave_table(url: str, det: int, key: str):
    """The wavelength table of detector `det` under `key` (a release for planning, or a calibration
    id for exact values). Read once with a byte-range request on `url` and kept on disk."""
    name = f"wave-D{det}-{re.sub(r'[^A-Za-z0-9_.-]', '_', key)}"
    with _wave_lock:
        if name in _wave_mem:
            return _wave_mem[name]
    path = _cache_path("wave", name + ".npz")
    if path.exists():
        z = np.load(path)
        tab = (z["X"], z["Y"], z["V"])
    else:
        _, blob = fetch(url, headers={"Range": f"bytes=-{WAVE_TAIL_BYTES}"}, what=f"wavelength table D{det} {key}")
        tab = parse_wave_table(blob)
        bio = io.BytesIO()
        np.savez(bio, X=tab[0], Y=tab[1], V=tab[2])
        _write_atomic(path, bio.getvalue())
    with _wave_lock:
        _wave_mem[name] = tab
    return tab


def wave_at(tab, px: float, py: float) -> tuple[float, float]:
    """Wavelength and bandwidth (um) at full-detector pixel (px, py), 1-based (FITS -TAB rule:
    index vectors X, Y, bilinear interpolation of VALUES). Matches astropy's lookup exactly."""
    X, Y, V = tab
    fx = float(np.interp(px, X, np.arange(len(X)), left=np.nan, right=np.nan))
    fy = float(np.interp(py, Y, np.arange(len(Y)), left=np.nan, right=np.nan))
    if not (math.isfinite(fx) and math.isfinite(fy)):
        # Outside the control points: extrapolate from the edge cell.
        fx = _extrap_index(px, X)
        fy = _extrap_index(py, Y)
    ix = int(min(max(math.floor(fx), 0), len(X) - 2))
    iy = int(min(max(math.floor(fy), 0), len(Y) - 2))
    tx, ty = fx - ix, fy - iy
    v = ((1 - tx) * (1 - ty) * V[iy, ix] + tx * (1 - ty) * V[iy, ix + 1]
         + (1 - tx) * ty * V[iy + 1, ix] + tx * ty * V[iy + 1, ix + 1])
    return float(v[0]), float(v[1])


def _extrap_index(p, grid):
    if p < grid[0]:
        return (p - grid[0]) / (grid[1] - grid[0])
    if p > grid[-1]:
        return len(grid) - 1 + (p - grid[-1]) / (grid[-1] - grid[-2])
    return float(np.interp(p, grid, np.arange(len(grid))))


def detector_pixel(corners, ra: float, dec: float):
    """Estimate where (ra, dec) falls on the 2040 x 2040 detector (0-based pixels) from the search
    footprint: corners are the outer edges of pixels (0,0), (2039,0), (2039,2039), (0,2039).
    A projective map in the tangent plane; within a few pixels across and ~10 along the detector."""
    if not corners or len(corners) != 4:
        return None
    ra0 = float(np.mean([c[0] for c in corners]))
    if max(c[0] for c in corners) - min(c[0] for c in corners) > 180:
        ra0 = float(np.degrees(np.arctan2(np.mean([np.sin(np.radians(c[0])) for c in corners]),
                                          np.mean([np.cos(np.radians(c[0])) for c in corners]))) % 360)
    dec0 = float(np.mean([c[1] for c in corners]))
    src = [tan_project(c[0], c[1], ra0, dec0) for c in corners]
    dst = [(-0.5, -0.5), (2039.5, -0.5), (2039.5, 2039.5), (-0.5, 2039.5)]
    H = _homography(src, dst)
    u, v = tan_project(ra, dec, ra0, dec0)
    p = H @ np.array([u, v, 1.0])
    return float(p[0] / p[2]), float(p[1] / p[2])


def _homography(src, dst):
    A, b = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); b.append(v)
    h = np.linalg.solve(np.array(A, float), np.array(b, float))
    return np.append(h, 1.0).reshape(3, 3)


def estimate_lam(exp: dict, ra: float, dec: float):
    """Wavelength at the target before any pixels are downloaded: footprint -> detector pixel ->
    the detector's table for that release. Sets exp['px'], exp['py'], exp['lamEst'], exp['bwEst']."""
    pix = detector_pixel(exp.get("corners"), ra, dec)
    if pix is None:
        return None
    tab = wave_table(exp["url"], exp["det"], "plan-" + exp["release"])
    lam, bw = wave_at(tab, pix[0] + 1, pix[1] + 1)
    exp["px"], exp["py"], exp["lamEst"], exp["bwEst"] = pix[0], pix[1], lam, bw
    return lam, bw


def load_plan_tables(exps: list[dict]):
    """Read the wavelength table of each (detector, release) once, in parallel."""
    first = {}
    for e in exps:
        first.setdefault((e["det"], e["release"]), e)
    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as pool:
        list(pool.map(lambda e: wave_table(e["url"], e["det"], "plan-" + e["release"]), first.values()))


# ---------------------------------------------------------------------------------------------
# Planning: the same colour in every pass
# ---------------------------------------------------------------------------------------------

def colour_order(exps: list[dict], n: int, same: float = PLAN_SAME_COLOUR) -> list[float]:
    """Wavelengths to aim for, for one detector. The first is found (within `same` channel widths)
    in the most windows; each next one is found in the most windows and lies farthest from those
    already chosen. Exposures need 'lamEst', 'bwEst' and 'win'."""
    cands = [e for e in exps if e.get("lamEst") is not None]
    if not cands:
        return []
    lams = np.array([e["lamEst"] for e in cands])
    bws = np.array([e["bwEst"] for e in cands])
    wins = np.array([e["win"] for e in cands])
    cover = []
    for i in range(len(cands)):
        near = np.abs(lams - lams[i]) <= same * bws[i]
        cover.append(len(set(wins[near].tolist())))
    cover = np.array(cover)
    chosen: list[float] = []
    while len(chosen) < n:
        best, best_key = None, None
        for i in range(len(cands)):
            if chosen:
                dist = min(abs(lams[i] - c) for c in chosen) / bws[i]
                if dist <= 2 * same:  # already represented
                    continue
            else:
                dist = 0.0
            key = (int(cover[i]), dist, -lams[i])
            if best_key is None or key > best_key:
                best, best_key = i, key
        if best is None:
            break
        chosen.append(float(lams[best]))
    return chosen


def order_group(group: list[dict], aims: list[float], n: int) -> list[dict]:
    """One window's exposures of one detector, in the order to try: for each aimed wavelength the
    closest exposure not yet taken, then backups by closeness to any aim."""
    left = [e for e in group]
    picks = []
    for lam in aims[:n]:
        withlam = [e for e in left if e.get("lamEst") is not None]
        if not withlam:
            break
        e = min(withlam, key=lambda e: (abs(e["lamEst"] - lam), e["t"]))
        picks.append(e)
        left.remove(e)

    def closeness(e):
        if e.get("lamEst") is None or not aims:
            return (1e9, e["t"])
        return (min(abs(e["lamEst"] - a) for a in aims[:max(n, 1)]), e["t"])

    return picks + sorted(left, key=closeness)


def plan(exps: list[dict], per_det: int = PER_DET_PER_WINDOW, max_frames: int = MAX_FRAMES_PER_TARGET,
         monthly: bool = False, gap_days: float = WINDOW_GAP_DAYS):
    """Group into windows and order each (window, detector) group. Exposures need 't', 'det' and,
    for colour matching, 'lamEst'/'bwEst'. Returns a dict:
      groups: {(win, det): [exposures in the order to try]}
      perDet: exposures to keep per detector per window (lowered to respect max_frames)
      windows: kept window indexes (evenly spaced ones dropped if still too many)
      aims: {det: [wavelengths]}"""
    wins = group_windows([e["t"] for e in exps], gap_days, monthly)
    for e, w in zip(exps, wins):
        e["win"] = w
    by_det: dict[int, list[dict]] = {}
    for e in exps:
        by_det.setdefault(e["det"], []).append(e)
    nwin = (max(wins) + 1) if wins else 0
    sizes: dict[tuple, int] = {}
    for e in exps:
        sizes[(e["win"], e["det"])] = sizes.get((e["win"], e["det"]), 0) + 1

    def count(k, windows):
        return sum(min(k, n) for (w, _), n in sizes.items() if w in windows)

    windows = list(range(nwin))
    k = per_det
    while k > 1 and count(k, windows) > max_frames:
        k -= 1
    if count(k, windows) > max_frames:
        # Even one per detector is too many: keep evenly spaced windows.
        for keep in range(len(windows), 0, -1):
            idx = sorted(set(int(round(x)) for x in np.linspace(0, nwin - 1, keep)))
            if count(k, idx) <= max_frames:
                windows = idx
                break
    aims = {d: colour_order([e for e in g if e["win"] in windows], k) for d, g in by_det.items()}
    groups = {}
    for (w, d) in sorted(sizes):
        if w not in windows:
            continue
        g = sorted([e for e in by_det[d] if e["win"] == w], key=lambda e: e["t"])
        groups[(w, d)] = order_group(g, aims.get(d, []), k)
    return {"groups": groups, "perDet": k, "windows": windows, "aims": aims}


# ---------------------------------------------------------------------------------------------
# Cutouts: stream until IMAGE, FLAGS, VARIANCE and ZODI have arrived, then stop
# ---------------------------------------------------------------------------------------------

WANTED_HDUS = ("IMAGE", "FLAGS", "VARIANCE", "ZODI")


def scan_hdus(buf: bytes, want=WANTED_HDUS):
    """Read FITS headers and data from the start of `buf` as far as they are complete. Returns
    ({name: (header, array)}, done) where done means every name in `want` is complete."""
    out, off, n = {}, 0, len(buf)
    while off + 2880 <= n:
        end = None
        pos = off
        while pos + 2880 <= n:
            block = buf[pos:pos + 2880]
            for c in range(0, 2880, 80):
                if block[c:c + 8] == b"END     ":
                    end = pos + c
                    break
            pos += 2880
            if end is not None:
                break
        if end is None:
            break
        hlen = ((end - off) // 2880 + 1) * 2880
        hdr = fits.Header.fromstring(buf[off:end + 80].decode("ascii", "replace"))
        naxis = hdr.get("NAXIS", 0)
        bitpix = hdr.get("BITPIX", 8)
        nel = 0
        if naxis:
            nel = 1
            for k in range(naxis):
                nel *= hdr.get(f"NAXIS{k + 1}", 0)
        nbytes = abs(bitpix) // 8 * nel + hdr.get("PCOUNT", 0)
        dlen = ((nbytes + 2879) // 2880) * 2880
        name = hdr.get("EXTNAME", "PRIMARY" if off == 0 else "")
        if off + hlen + nbytes > n:
            break
        if name in want and naxis == 2:
            dt = {8: ">u1", 16: ">i2", 32: ">i4", 64: ">i8", -32: ">f4", -64: ">f8"}[bitpix]
            arr = np.frombuffer(buf[off + hlen:off + hlen + abs(bitpix) // 8 * nel], dtype=dt)
            arr = arr.reshape(hdr["NAXIS2"], hdr["NAXIS1"])
            if bitpix > 0 and (hdr.get("BZERO", 0) or hdr.get("BSCALE", 1) != 1):
                arr = arr * hdr.get("BSCALE", 1) + hdr.get("BZERO", 0)
            out[name] = (hdr, arr)
        off += hlen + dlen
        if all(w in out for w in want):
            return out, True
    return out, all(w in out for w in want)


def cutout_url(exp: dict, ra: float, dec: float, size: float) -> str:
    return f"{exp['url']}?center={ra:.6f},{dec:.6f}&size={size:.2f}"


def download_cutout(url: str, waits: list[float] | None = None) -> bytes:
    """The first part of a cutout (primary header, IMAGE, FLAGS, VARIANCE, ZODI). Cached on disk."""
    path = _cache_path("cut", hashlib.sha1(url.encode()).hexdigest() + ".fits")
    if path.exists():
        return path.read_bytes()
    state = {"next": 2880 * 20}

    def stop(buf):
        if len(buf) < state["next"]:
            return False
        state["next"] = len(buf) + 2880 * 8
        return scan_hdus(bytes(buf))[1]

    _, body = fetch(url, stop=stop, what="cutout " + url.rsplit("/", 1)[-1][:60], waits=waits)
    if not body.startswith(b"SIMPLE"):
        raise FetchError(f"not a FITS file: {body[:200]!r}")
    hdus, done = scan_hdus(body)
    if not done:
        raise FetchError(f"cutout incomplete ({len(body)} bytes, have {sorted(hdus)})")
    _write_atomic(path, body)
    return body


# ---------------------------------------------------------------------------------------------
# One frame: from a cutout to the stored entry and bytes
# ---------------------------------------------------------------------------------------------

def flag_bits(flags_header) -> dict[int, str]:
    """Flag bit number -> name from a FLAGS header. Newer files: MSKNnnnn = name (MSKMnnnn = mask);
    older files: MP_<name> = bit. Plus EXTRA_FLAG_BITS."""
    bits = {}
    for k in flags_header.keys():
        if k.startswith("MSKN") and k[4:].isdigit():
            bits[int(k[4:])] = str(flags_header[k]).strip()
        elif k.startswith("MP_"):
            try:
                bits[int(flags_header[k])] = k[3:]
            except (TypeError, ValueError):
                pass
    for b, name in EXTRA_FLAG_BITS.items():
        bits.setdefault(b, name)
    return bits


def bad_mask(bits: dict[int, str]) -> int:
    m = 0
    for b, name in bits.items():
        if name in BAD_FLAG_NAMES:
            m |= 1 << b
    return m


def spectral_calib(image_header) -> str:
    for line in image_header.get("HISTORY", []):
        m = re.search(r"\[CALIB\]\s+spectral_wcs\s+(\S+)", str(line))
        if m:
            return m.group(1)
    return ""


def fit_plain_tan(w: WCS, nx: int, ny: int, grid: int = WCS_GRID):
    """Fit a plain gnomonic projection to the pipeline WCS (TAN-SIP) over a grid across the cutout.
    Pixel (0, 0) is the centre of the first stored pixel. Returns (wcs dict, worst mismatch in arcsec)."""
    cx, cy = (nx - 1) / 2, (ny - 1) / 2
    ra0, dec0 = (float(v) for v in w.all_pix2world([[cx, cy]], 0)[0])
    gx, gy = np.meshgrid(np.linspace(0, nx - 1, grid), np.linspace(0, ny - 1, grid))
    gx, gy = gx.ravel(), gy.ravel()
    sky = w.all_pix2world(np.column_stack([gx, gy]), 0)
    xi, eta = tan_project(sky[:, 0], sky[:, 1], ra0, dec0)
    A = np.column_stack([gx - cx, gy - cy])
    c1, *_ = np.linalg.lstsq(A, xi, rcond=None)
    c2, *_ = np.linalg.lstsq(A, eta, rcond=None)
    cd = [float(c1[0]), float(c1[1]), float(c2[0]), float(c2[1])]
    pxi = cd[0] * (gx - cx) + cd[1] * (gy - cy)
    peta = cd[2] * (gx - cx) + cd[3] * (gy - cy)
    pra, pdec = tan_deproject(pxi, peta, ra0, dec0)
    err = float(np.max(sep_arcsec(pra, pdec, sky[:, 0], sky[:, 1])))
    return {"crval": [ra0, dec0], "crpix": [cx, cy], "cd": cd}, err


def make_frame(exp: dict, body: bytes, cat: dict, cutout: str):
    """Turn a downloaded cutout into (entry, flags uint32 array, pixels float16 array, flag bits).
    Returns (None, reason) when the exposure cannot be used."""
    hdus, done = scan_hdus(body)
    if not done:
        return None, "incomplete cutout"
    ih, img = hdus["IMAGE"]
    fh, flg = hdus["FLAGS"]
    _, var = hdus["VARIANCE"]
    _, zod = hdus["ZODI"]
    ny, nx = img.shape
    w = WCS(ih)
    mjd = float(ih.get("MJD-AVG", exp["t"]))
    tra, tdec = target_at(cat, mjd)
    x, y = (float(v) for v in w.all_world2pix([[tra, tdec]], 0)[0])
    if not (EDGE_PX <= x <= nx - 1 - EDGE_PX and EDGE_PX <= y <= ny - 1 - EDGE_PX):
        return None, f"target {x:.1f},{y:.1f} within {EDGE_PX} px of the {nx}x{ny} cutout edge"
    det = int(ih.get("DETECTOR", exp["det"]))
    calib = spectral_calib(ih) or exp["id"]
    tab = wave_table(exp["url"], det, calib)
    px = ih.get("CRVAL1W", 1) + ih.get("CDELT1W", 1) * ((x + 1) - ih.get("CRPIX1W", 1))
    py = ih.get("CRVAL2W", 1) + ih.get("CDELT2W", 1) * ((y + 1) - ih.get("CRPIX2W", 1))
    lam, bw = wave_at(tab, px, py)
    wcs, wcs_err = fit_plain_tan(w, nx, ny)
    bits = flag_bits(fh)
    bad = bad_mask(bits)
    flags = flg.astype(np.int64).astype(np.uint32)
    image = img.astype(np.float64)
    zodi = zod.astype(np.float64)
    pix = image - zodi
    finite = np.isfinite(pix)
    pix = np.where(finite, np.clip(pix, -65504, 65504), np.nan).astype(np.float16)
    isbad = (flags & np.uint32(bad)) != 0
    usable = finite & ~isbad & np.isfinite(var)
    sigma = float(np.sqrt(np.median(var[usable]))) if usable.any() else None
    zmed = float(np.nanmedian(zodi)) if np.isfinite(zodi).any() else None
    entry = {
        "id": exp["id"],
        "det": det,
        "mjd": round(mjd, 6),
        "dateObs": str(ih.get("DATE-AVG", "")),
        "release": exp["release"],
        "pipeline": exp["pipeline"],
        "url": exp["url"],
        "cutout": cutout,
        "exptime": float(ih.get("XPOSURE", exp.get("exptime") or 0)),
        "w": int(nx),
        "h": int(ny),
        "offset": 0,
        "lam": round(lam, 5),
        "bw": round(bw, 5),
        "wcs": {
            "crval": [round(wcs["crval"][0], 8), round(wcs["crval"][1], 8)],
            "crpix": [wcs["crpix"][0], wcs["crpix"][1]],
            "cd": [float(f"{c:.10g}") for c in wcs["cd"]],
        },
        "wcsErr": round(wcs_err, 4),
        "zodi": None if zmed is None else round(zmed, 5),
        "sigma": None if sigma is None else round(sigma, 5),
        "omega": None if ih.get("OMEGA_MEDIAN") is None else round(float(ih["OMEGA_MEDIAN"]), 4),
        "badFrac": round(float(isbad.mean()), 4),
        "window": exp["win"],
    }
    if exp.get("lamEst") is not None:
        exp["lamErr"] = (exp["lamEst"] - lam) / bw
    return (entry, flags, pix, bits), ""


# ---------------------------------------------------------------------------------------------
# Downloading a plan: up to perDet good frames per group, backups when one fails
# ---------------------------------------------------------------------------------------------

def fetch_plan(p: dict, cat: dict, size: float, *, limit: int | None = None, groups=None,
               on_progress=None, waits: list[float] | None = None, ahead=None, on_frame=None):
    """Download frames for the plan `p`. Returns (list of frame tuples, list of skip notes).
    `groups` limits which (win, det) groups are filled, `limit` overrides perDet and `waits` the
    retry schedule of the cutout downloads. `ahead` lists groups whose first exposure is asked
    before all others, in that order. `on_frame(got)` hears every kept frame, with the frames kept
    so far by group."""
    want = limit if limit is not None else p["perDet"]
    todo = {g: list(c) for g, c in p["groups"].items() if groups is None or g in groups}
    got: dict[tuple, list] = {g: [] for g in todo}
    skipped = []
    total = sum(min(want, len(c)) for c in todo.values())
    done = [0]

    def one(e):
        tra, tdec = target_at(cat, e["t"])
        url = cutout_url(e, tra, tdec, size)
        try:
            body = download_cutout(url, waits)
            res, why = make_frame(e, body, cat, url)
        except Exception as ex:  # noqa: BLE001 - any failure moves on to a backup
            return e, None, f"{type(ex).__name__}: {ex}"
        return e, res, why

    with ThreadPoolExecutor(max_workers=MAX_CONCURRENT) as pool:
        while True:
            batch = []
            for g, cands in todo.items():
                need = want - len(got[g])
                while need > 0 and cands:
                    batch.append((g, cands.pop(0)))
                    need -= 1
            if not batch:
                break
            if ahead:
                lead, seen = [], set()
                for g in ahead:
                    item = next((x for x in batch if x[0] == g), None)
                    if item is not None and g not in seen:
                        seen.add(g)
                        lead.append(item)
                batch = lead + [x for x in batch if not any(x is y for y in lead)]
            futs = {pool.submit(one, e): g for g, e in batch}
            for f in as_completed(futs):
                g = futs[f]
                e, res, why = f.result()
                if res is None:
                    skipped.append(f"{e['id']}: {why}")
                    log(f"  skip {e['id']}: {why}")
                    continue
                got[g].append(res)
                done[0] += 1
                if on_progress:
                    on_progress(done[0], total)
                if on_frame:
                    on_frame(got)
    frames = [r for g in got.values() for r in g]
    frames.sort(key=lambda r: (r[0]["mjd"], r[0]["det"]))
    return frames, skipped


def pack(frames, extra_bits: dict[int, str] | None = None):
    """Frame tuples -> (entries with offsets, flagBits, raw bytes). Flags then pixels, little-endian."""
    entries, chunks, off = [], [], 0
    bits: dict[int, str] = dict(extra_bits or {})
    for entry, flags, pix, fb in frames:
        e = dict(entry)
        e["offset"] = off
        a = flags.astype("<u4").tobytes()
        b = pix.astype("<f2").tobytes()
        chunks += [a, b]
        off += len(a) + len(b)
        entries.append(e)
        bits.update(fb)
    return entries, {str(k): bits[k] for k in sorted(bits)}, b"".join(chunks)


def gzip_bytes(raw: bytes) -> bytes:
    bio = io.BytesIO()
    with gzip.GzipFile(fileobj=bio, mode="wb", compresslevel=9, mtime=0) as g:
        g.write(raw)
    return bio.getvalue()


def renumber_windows(entries: list[dict]):
    """Windows that kept frames, counted again from 0 in time order."""
    order = sorted({e["window"] for e in entries})
    remap = {w: i for i, w in enumerate(order)}
    for e in entries:
        e["window"] = remap[e["window"]]
    return len(order)


# ---------------------------------------------------------------------------------------------
# Neighbours: Gaia DR3 and CatWISE2020 sources near the target's path
# ---------------------------------------------------------------------------------------------

def _f(v):
    try:
        x = float(v)
        return x if math.isfinite(x) else None
    except (TypeError, ValueError):
        return None


def gaia_rows(ra, dec, radius_deg, limit: int | None = None):
    """Gaia DR3 rows in a circle (brightest `limit` when given), at epoch 2016.0. Returns (rows, service)."""
    top = f"TOP {int(limit)} " if limit else ""
    order = " ORDER BY phot_g_mean_mag" if limit else ""
    adql = (f"SELECT {top}designation, ra, dec, pmra, pmdec, phot_g_mean_mag FROM gaiadr3.gaia_source "
            f"WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {radius_deg:.5f}))"
            f"{order}")
    try:
        rows = tap(GAIA_TAP, adql, ttl=NEIGHBOUR_TTL, what="Gaia DR3 neighbours")
        src = "ESA Gaia archive TAP (gaiadr3.gaia_source)"
        out = [{"id": r["designation"], "ra": _f(r["ra"]), "dec": _f(r["dec"]), "pmra": _f(r["pmra"]),
                "pmdec": _f(r["pmdec"]), "mag": _f(r["phot_g_mean_mag"])} for r in rows]
    except FetchError as e:
        log("  Gaia archive failed, trying VizieR:", e)
        rows = vizier("I/355/gaiadr3", ra, dec, radius_deg, "DR3Name,RA_ICRS,DE_ICRS,pmRA,pmDE,Gmag",
                      limit, "Gmag")
        src = "VizieR at CfA (I/355/gaiadr3)"
        out = [{"id": r["DR3Name"], "ra": _f(r["RA_ICRS"]), "dec": _f(r["DE_ICRS"]), "pmra": _f(r["pmRA"]),
                "pmdec": _f(r["pmDE"]), "mag": _f(r["Gmag"])} for r in rows]
    for r in out:
        r["ep"] = 2016.0
    return out, src


def catwise_rows(ra, dec, radius_deg, limit: int | None = None):
    """CatWISE2020 rows in a circle (brightest in W1 `limit` when given), positions at MJD 57170,
    motions converted to mas/yr. Returns (rows, service)."""
    top = f"TOP {int(limit)} " if limit else ""
    order = " ORDER BY w1mpro_pm" if limit else ""
    adql = (f"SELECT {top}source_name, ra_pm, dec_pm, pmra, pmdec, w1mpro_pm, w2mpro_pm FROM catwise_2020 "
            f"WHERE 1 = CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra:.6f}, {dec:.6f}, {radius_deg:.5f}))"
            f"{order}")
    ep = round(mjd_to_year(CATWISE_EPOCH_MJD), 4)
    try:
        rows = tap(IRSA_TAP, adql, ttl=NEIGHBOUR_TTL, what="CatWISE2020 neighbours")
        src = "IRSA TAP (catwise_2020)"
        out = []
        for r in rows:
            w1, w2 = _f(r["w1mpro_pm"]), _f(r["w2mpro_pm"])
            out.append({"id": "CWISE " + r["source_name"].strip(), "ra": _f(r["ra_pm"]), "dec": _f(r["dec_pm"]),
                        "pmra": None if _f(r["pmra"]) is None else _f(r["pmra"]) * 1000,
                        "pmdec": None if _f(r["pmdec"]) is None else _f(r["pmdec"]) * 1000,
                        "mag": w1 if w1 is not None else w2})
    except FetchError as e:
        log("  IRSA CatWISE failed, trying VizieR:", e)
        rows = vizier("II/365/catwise", ra, dec, radius_deg, "Name,RAPMdeg,DEPMdeg,pmRA,pmDE,W1mproPM,W2mproPM",
                      limit, "W1mproPM")
        src = "VizieR at CfA (II/365/catwise)"
        out = []
        for r in rows:
            w1, w2 = _f(r["W1mproPM"]), _f(r["W2mproPM"])
            out.append({"id": "CWISE " + r["Name"].strip(), "ra": _f(r["RAPMdeg"]), "dec": _f(r["DEPMdeg"]),
                        "pmra": None if _f(r["pmRA"]) is None else _f(r["pmRA"]) * 1000,
                        "pmdec": None if _f(r["pmDE"]) is None else _f(r["pmDE"]) * 1000,
                        "mag": w1 if w1 is not None else w2})
    for r in out:
        r["ep"] = ep
    return out, src


def vizier(cat, ra, dec, radius_deg, cols, limit=None, sort=None):
    """VizieR at CfA, the fallback when the ESA or IRSA service fails. Tab-separated rows as dicts."""
    params = {"-source": cat, "-c": f"{ra:.6f} {dec:+.6f}", "-c.rd": f"{radius_deg:.5f}", "-out": cols,
              "-out.max": str(int(limit)) if limit else "unlimited"}
    if sort:
        params["-sort"] = sort
    _, body = fetch(VIZIER, params=params, what=f"VizieR {cat}")
    lines = [ln for ln in body.decode("utf-8", "replace").splitlines() if ln and not ln.startswith("#")]
    if len(lines) < 3:
        # The CfA mirror sometimes answers with column definitions and no rows even where the
        # catalogue has sources (CatWISE2020, 2026-11-14). An empty field and a failed mirror look
        # the same here, so this counts as a failure, never as "no neighbours".
        raise FetchError(f"VizieR returned no rows for {cat}")
    names = [c.strip() for c in lines[0].split("\t")]
    return [dict(zip(names, (v.strip() for v in ln.split("\t")))) for ln in lines[3:] if "\t" in ln]


def select_neighbours(rows: list[dict], cat_name: str, track_cat: dict, mjd0: float, mjd1: float,
                      reach: float = NEIGHBOUR_REACH_ARCSEC, ndates: int = NEIGHBOUR_DATES):
    """Rows that come within `reach` arcsec of the target's track between mjd0 and mjd1 (each moved
    with its own motion), plus the target's own entries (within 2", CatWISE 4", of the track at the
    entry's own epoch). Rows without a magnitude are left out."""
    years = [mjd_to_year(m) for m in np.linspace(mjd0, mjd1, ndates)]
    track = [move(track_cat["ra"], track_cat["dec"], track_cat["ep"], track_cat.get("pmra", 0),
                  track_cat.get("pmdec", 0), y) for y in years]
    match = TARGET_MATCH_ARCSEC[cat_name]
    out = []
    for r in rows:
        if r["ra"] is None or r["dec"] is None or r["mag"] is None:
            continue
        pmra, pmdec = r["pmra"] or 0.0, r["pmdec"] or 0.0
        tr = move(track_cat["ra"], track_cat["dec"], track_cat["ep"], track_cat.get("pmra", 0),
                  track_cat.get("pmdec", 0), r["ep"])
        is_target = sep_arcsec(r["ra"], r["dec"], tr[0], tr[1]) <= match
        near = False
        if not is_target:
            for y, (tra, tdec) in zip(years, track):
                nra, ndec = move(r["ra"], r["dec"], r["ep"], pmra, pmdec, y)
                if sep_arcsec(nra, ndec, tra, tdec) <= reach:
                    near = True
                    break
        if not (is_target or near):
            continue
        n = {"cat": cat_name, "id": r["id"], "ra": round(r["ra"], 7), "dec": round(r["dec"], 7), "ep": r["ep"],
             "pmra": round(pmra, 3), "pmdec": round(pmdec, 3), "mag": round(r["mag"], 3)}
        if is_target:
            n["target"] = True
        out.append(n)
    out.sort(key=lambda n: (n["cat"], n["mag"]))
    return out


def neighbours_for(track_cat: dict, mjd0: float, mjd1: float):
    """Gaia DR3 and CatWISE2020 neighbours of a track. Returns (list, {cat: service})."""
    pts = [move(track_cat["ra"], track_cat["dec"], track_cat["ep"], track_cat.get("pmra", 0),
                track_cat.get("pmdec", 0), y)
           for y in [mjd_to_year(mjd0), mjd_to_year(mjd1), 2016.0, mjd_to_year(CATWISE_EPOCH_MJD)]]
    ra0 = float(np.degrees(np.arctan2(np.mean(np.sin(np.radians([p[0] for p in pts]))),
                                      np.mean(np.cos(np.radians([p[0] for p in pts])))))) % 360
    dec0 = float(np.mean([p[1] for p in pts]))
    span = max(sep_arcsec(ra0, dec0, p[0], p[1]) for p in pts)
    # Reach plus room for a neighbour's own motion over ~11 years at up to 6"/yr.
    radius = (span + NEIGHBOUR_REACH_ARCSEC + 70.0) / 3600.0
    with ThreadPoolExecutor(max_workers=2) as pool:
        fg = pool.submit(gaia_rows, ra0, dec0, radius)
        fc = pool.submit(catwise_rows, ra0, dec0, radius)
        g_rows, g_src = fg.result()
        c_rows, c_src = fc.result()
    out = (select_neighbours(g_rows, "gaia", track_cat, mjd0, mjd1)
           + select_neighbours(c_rows, "catwise", track_cat, mjd0, mjd1))
    return out, {"gaia": g_src, "catwise": c_src}


# ---------------------------------------------------------------------------------------------
# One target
# ---------------------------------------------------------------------------------------------

def releases_for(cfg: dict) -> list[str]:
    return RELEASES + (DEEP_RELEASES if cfg.get("deep") else [])


def mid_position(cat: dict, exps: list[dict] | None = None, year: float | None = None):
    if exps:
        return target_at(cat, float(np.median([e["t"] for e in exps])))
    return move(cat["ra"], cat["dec"], cat["ep"], cat.get("pmra", 0), cat.get("pmdec", 0), year or 2026.0)


def search_target(cat: dict, releases: list[str]):
    """Search at the target's position in the middle of the survey so far, then keep exposures whose
    footprint holds the target at their own date."""
    ra, dec = mid_position(cat)
    exps, counts, notes = search(ra, dec, releases)
    return exps, counts, notes


def bake(key: str, plan_only: bool = False) -> dict | None:
    cfg = TARGETS[key]
    cat = cfg["catalogue"]
    fov = cfg["fov"]
    size = round(fov / 60 + CUTOUT_MARGIN_DEG, 2)
    releases = releases_for(cfg)
    t0 = time.time()
    log(f"{key}: searching {', '.join(releases)}")
    exps, counts, notes = search_target(cat, releases)
    log(f"{key}: found {len(exps)} exposures ({', '.join(f'{r} {n}' for r, n in counts.items())}) "
        f"in {time.time() - t0:.0f}s")
    if not exps:
        log(f"{key}: nothing found")
        return None
    load_plan_tables(exps)
    for e in exps:
        tra, tdec = target_at(cat, e["t"])
        estimate_lam(e, tra, tdec)
    p = plan(exps, PER_DET_PER_WINDOW, cfg.get("max_frames", MAX_FRAMES_PER_TARGET), cfg.get("monthly", False))
    planned = sum(min(p["perDet"], len(g)) for g in p["groups"].values())
    log(f"{key}: {len(p['windows'])} windows, {p['perDet']} per detector per window, {planned} planned")
    for d in sorted(p["aims"]):
        log(f"  D{d} aims: {', '.join(f'{a:.4f}' for a in p['aims'][d])} um")
    if plan_only:
        return {"key": key, "found": len(exps), "planned": planned, "windows": len(p["windows"])}
    frames, skipped = fetch_plan(p, cat, size, on_progress=lambda d, t: (d % 10 == 0 or d == t) and log(f"  {key}: {d}/{t}"))
    if not frames:
        log(f"{key}: no usable frames")
        return None
    entries, bits, raw = pack(frames)
    nwin = renumber_windows(entries)
    errs = [e["lamErr"] for e in exps if "lamErr" in e]
    if errs:
        log(f"{key}: wavelength estimate vs file: median {np.median(np.abs(errs)):.3f}, "
            f"max {np.max(np.abs(errs)):.3f} channel widths ({len(errs)} exposures)")
    mjds = [e["mjd"] for e in entries]
    log(f"{key}: neighbours")
    try:
        neigh, neigh_from = neighbours_for(cat, min(mjds), max(mjds))
    except FetchError as e:
        log(f"{key}: neighbours not fetched: {e}")
        neigh, neigh_from = None, None
    doc = {
        "catalogue": {k: cat[k] for k in ("ra", "dec", "ep", "pmra", "pmdec", "parallax", "from")},
        "fov": fov,
        "size": size,
        "units": "MJy/sr, zodiacal light model (ZODI) subtracted",
        "flagBits": bits,
        "badFlags": BAD_FLAG_NAMES,
        "perDetPerWindow": p["perDet"],
        "monthly": bool(cfg.get("monthly", False)),
        "frames": entries,
    }
    if neigh is not None:
        doc["neighbours"] = neigh
        doc["neighboursFrom"] = neigh_from
    gz = gzip_bytes(raw)
    out = OUT_DIR / key
    out.mkdir(parents=True, exist_ok=True)
    (out / "frames.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    (out / "frames.bin.gz").write_bytes(gz)
    rel = sorted({e["release"] for e in entries}, key=lambda r: releases.index(r) if r in releases else 99)
    log(f"{key}: {len(entries)} frames, {nwin} windows, {len(gz) / 1e6:.2f} MB, "
        f"{len(skipped)} skipped, {time.time() - t0:.0f}s")
    return {
        "path": f"data/{key}/",
        "label": cfg["label"],
        "frames": len(entries),
        "bytes": len(gz),
        "releases": rel,
        "windows": nwin,
        "notes": notes,
    }


def write_manifest(results: dict[str, dict]):
    path = OUT_DIR / "manifest.json"
    old = {}
    if path.exists():
        try:
            old = json.loads(path.read_text()).get("targets", {})
        except json.JSONDecodeError:
            old = {}
    targets = {k: v for k, v in old.items() if k in TARGETS}
    for k, v in results.items():
        targets[k] = {kk: vv for kk, vv in v.items() if kk != "notes"}
    collections = sorted({r for k in targets for r in releases_for(TARGETS[k])},
                         key=lambda r: (RELEASES + DEEP_RELEASES).index(r))
    doc = {
        "version": 1,
        "generated": _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "NASA/IPAC Infrared Science Archive (IRSA), SPHEREx Level 2 spectral images",
        "collections": collections,
        "targets": {k: targets[k] for k in TARGETS if k in targets},
    }
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")


def main(argv=None):
    global CACHE_DIR
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("targets", nargs="*", help=f"target keys (default: all): {', '.join(TARGETS)}")
    ap.add_argument("--plan", action="store_true", help="search and plan only, download nothing")
    ap.add_argument("--cache", help=f"cache folder (default {CACHE_DIR})")
    args = ap.parse_args(argv)
    if args.cache:
        CACHE_DIR = Path(args.cache).expanduser()
    keys = args.targets or list(TARGETS)
    for k in keys:
        if k not in TARGETS:
            ap.error(f"unknown target {k!r}")
    results = {}
    for k in keys:
        r = bake(k, plan_only=args.plan)
        if r and not args.plan:
            results[k] = r
            write_manifest({k: r})
        elif r:
            log(json.dumps(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
