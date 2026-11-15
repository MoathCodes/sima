"""Tests for the pure parts of prebake.py. Run: python -m unittest discover -s scripts -p 'test_*.py'

No test reaches the internet: the one network test talks to a local server.
"""

import gzip
import io
import json
import math
import struct
import sys
import tempfile
import threading
import time
import unittest
import warnings
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

sys.path.insert(0, str(Path(__file__).resolve().parent))
import prebake as pb  # noqa: E402

warnings.simplefilter("ignore")


def wkb_polygon(points, srid=4326):
    """PostGIS extended WKB (little-endian) of a closed polygon, as hex."""
    ring = list(points) + [points[0]]
    b = struct.pack("<BI", 1, 3 | 0x20000000) + struct.pack("<I", srid) + struct.pack("<I", 1)
    b += struct.pack("<I", len(ring))
    for x, y in ring:
        b += struct.pack("<dd", x, y)
    return b.hex().upper()


def tan_header(ra0, dec0, nx, ny, scale=6.15 / 3600, rot=0.0, crpix=None):
    h = fits.Header()
    h["NAXIS"] = 2
    h["NAXIS1"], h["NAXIS2"] = nx, ny
    h["CTYPE1"], h["CTYPE2"] = "RA---TAN", "DEC--TAN"
    h["CRVAL1"], h["CRVAL2"] = ra0, dec0
    cx, cy = crpix or ((nx + 1) / 2, (ny + 1) / 2)
    h["CRPIX1"], h["CRPIX2"] = cx, cy
    c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
    h["CD1_1"], h["CD1_2"] = -scale * c, scale * s
    h["CD2_1"], h["CD2_2"] = scale * s, scale * c
    return h


class TestGeometry(unittest.TestCase):
    def test_move_barnard_ten_years(self):
        cat = pb.TARGETS["barnard"]["catalogue"]
        ra, dec = pb.move(cat["ra"], cat["dec"], cat["ep"], cat["pmra"], cat["pmdec"], 2026.0)
        d = pb.sep_arcsec(cat["ra"], cat["dec"], ra, dec)
        self.assertAlmostEqual(d, 10.0 * math.hypot(cat["pmra"], cat["pmdec"]) / 1000, delta=0.05)
        self.assertGreater(dec, cat["dec"])  # Barnard's Star moves north

    def test_year_mjd_round_trip(self):
        self.assertAlmostEqual(pb.mjd_to_year(51544.5), 2000.0)
        self.assertAlmostEqual(pb.mjd_to_year(pb.CATWISE_EPOCH_MJD), 2015.4018, places=3)
        self.assertAlmostEqual(pb.year_to_mjd(pb.mjd_to_year(60900.25)), 60900.25)

    def test_tan_project_round_trip(self):
        ra, dec = pb.tan_deproject(*pb.tan_project(10.2, -45.1, 10.0, -45.0), 10.0, -45.0)
        self.assertAlmostEqual(float(ra), 10.2, places=9)
        self.assertAlmostEqual(float(dec), -45.1, places=9)

    def test_decode_poly(self):
        pts = [(269.1, 4.7), (-87.4, 4.71), (-87.43, 1.2), (269.07, 1.25)]
        corners = pb.decode_poly(wkb_polygon(pts))
        self.assertEqual(len(corners), 4)
        self.assertAlmostEqual(corners[1][0], 272.6)  # longitudes wrapped into 0..360
        self.assertAlmostEqual(corners[3][1], 1.25)

    def test_detector_pixel_from_corners(self):
        w = WCS(tan_header(120.0, 30.0, 2040, 2040, rot=17.0))
        edges = np.array([[-0.5, -0.5], [2039.5, -0.5], [2039.5, 2039.5], [-0.5, 2039.5]])
        corners = [tuple(c) for c in w.all_pix2world(edges, 0)]
        for x, y in [(10.0, 20.0), (1020.0, 1500.0), (2030.0, 5.0)]:
            ra, dec = w.all_pix2world([[x, y]], 0)[0]
            ex, ey = pb.detector_pixel(corners, ra, dec)
            self.assertAlmostEqual(ex, x, delta=0.1)
            self.assertAlmostEqual(ey, y, delta=0.1)

    def test_fit_plain_tan_exact_for_tan(self):
        # Same tangent point: exact.
        _, err = pb.fit_plain_tan(WCS(tan_header(200.0, 60.0, 64, 65, rot=-33.0)), 64, 65)
        self.assertLess(err, 1e-4)
        # Tangent point far outside the cutout (as in a real cutout): tiny, recorded mismatch.
        h = tan_header(200.0, 60.0, 64, 65, rot=-33.0, crpix=(-500.0, 900.0))
        w = WCS(h)
        wcs, err = pb.fit_plain_tan(w, 64, 65)
        self.assertLess(err, 0.05)
        # The fitted mapping reproduces astropy at an arbitrary pixel.
        x, y = 12.3, 50.7
        ra, dec = w.all_pix2world([[x, y]], 0)[0]
        cd = np.array(wcs["cd"]).reshape(2, 2)
        xi, eta = cd @ np.array([x - wcs["crpix"][0], y - wcs["crpix"][1]])
        ra2, dec2 = pb.tan_deproject(xi, eta, *wcs["crval"])
        self.assertLess(pb.sep_arcsec(ra, dec, ra2, dec2), 0.05)


class TestWindows(unittest.TestCase):
    def test_gap_rule(self):
        t = [100.0, 101.0, 130.0, 175.0, 176.0, 400.0]
        self.assertEqual(pb.group_windows(t), [0, 0, 0, 1, 1, 2])

    def test_gap_exactly_40_days_stays(self):
        self.assertEqual(pb.group_windows([0.0, 40.0, 80.5]), [0, 0, 1])

    def test_unsorted_input(self):
        self.assertEqual(pb.group_windows([400.0, 100.0, 101.0]), [1, 0, 0])

    def test_monthly(self):
        # MJD 60900 = 2025-08-13; 60920 = 2025-09-02; 60925 = 2025-09-07
        self.assertEqual(pb.group_windows([60900.0, 60920.0, 60925.0], monthly=True), [0, 1, 1])

    def test_empty(self):
        self.assertEqual(pb.group_windows([]), [])


def fake_exps(windows=3, per_win=6, dets=(1, 2), lam0=1.0, bw=0.01, step=0.004):
    """Exposures with wavelengths drifting within each window, like SPHEREx steps."""
    out = []
    for w in range(windows):
        for d in dets:
            for k in range(per_win):
                out.append({"id": f"w{w}d{d}k{k}", "det": d, "t": 1000.0 + 180 * w + k,
                            "lamEst": lam0 + d + k * step + 0.001 * w, "bwEst": bw})
    return out


class TestPlan(unittest.TestCase):
    def test_caps_and_groups(self):
        exps = fake_exps()
        p = pb.plan(exps, per_det=4, max_frames=96)
        self.assertEqual(p["perDet"], 4)
        self.assertEqual(p["windows"], [0, 1, 2])
        self.assertEqual(len(p["groups"]), 6)
        for (w, d), g in p["groups"].items():
            self.assertTrue(all(e["win"] == w and e["det"] == d for e in g))
            self.assertEqual(len(g), 6)  # picks first, then every backup

    def test_lowers_per_det_then_drops_windows(self):
        exps = fake_exps(windows=5, per_win=6, dets=(1, 2, 3, 4, 5, 6))
        p = pb.plan(exps, per_det=4, max_frames=40)
        self.assertEqual(p["perDet"], 1)  # 5 windows x 6 dets x 1 = 30 <= 40; 2 would be 60
        p = pb.plan(exps, per_det=4, max_frames=20)
        self.assertEqual(p["perDet"], 1)
        self.assertLessEqual(len(p["windows"]) * 6, 20)
        self.assertEqual(p["windows"][0], 0)
        self.assertEqual(p["windows"][-1], 4)  # evenly spaced, keeping both ends

    def test_same_colour_picks(self):
        exps = fake_exps(windows=3, per_win=6, dets=(1,))
        p = pb.plan(exps, per_det=2, max_frames=96)
        aims = p["aims"][1]
        self.assertEqual(len(aims), 2)
        picks = {w: [e["lamEst"] for e in p["groups"][(w, 1)][:2]] for w in range(3)}
        for w in range(1, 3):  # every window's first pick matches window 0's in colour
            self.assertLessEqual(abs(picks[w][0] - picks[0][0]), 0.5 * 0.01)

    def test_colour_order_prefers_coverage(self):
        exps = [
            {"lamEst": 1.000, "bwEst": 0.01, "win": 0}, {"lamEst": 1.001, "bwEst": 0.01, "win": 1},
            {"lamEst": 1.002, "bwEst": 0.01, "win": 2}, {"lamEst": 1.100, "bwEst": 0.01, "win": 0},
        ]
        aims = pb.colour_order(exps, 2)
        self.assertLess(abs(aims[0] - 1.001), 0.0015)
        self.assertAlmostEqual(aims[1], 1.100)

    def test_order_group_backups_by_closeness(self):
        g = [{"lamEst": v, "t": i} for i, v in enumerate([1.0, 1.5, 1.2, 1.05])]
        out = pb.order_group(g, [1.0], 1)
        self.assertEqual([e["lamEst"] for e in out], [1.0, 1.05, 1.2, 1.5])


class TestFlags(unittest.TestCase):
    def test_new_style(self):
        h = fits.Header()
        h["MSKN0000"], h["MSKM0000"] = "TRANSIENT", 1
        h["MSKN0021"], h["MSKM0021"] = "SOURCE", 2 ** 21
        h["MSKN0007"], h["MSKM0007"] = "DICHROIC", 128
        bits = pb.flag_bits(h)
        self.assertEqual(bits[0], "TRANSIENT")
        self.assertEqual(bits[21], "SOURCE")
        self.assertEqual(bits[29], "SATELLITE_HALO")  # added: no header names it
        m = pb.bad_mask(bits)
        self.assertTrue(m & 1)
        self.assertTrue(m & 128)
        self.assertFalse(m & (1 << 21))  # SOURCE is not bad
        self.assertTrue(m & (1 << 29))

    def test_old_style(self):
        h = fits.Header()
        h["MP_HOT"] = 10
        h["MP_FULLSAMPLE"] = 12
        bits = pb.flag_bits(h)
        self.assertEqual(bits[10], "HOT")
        m = pb.bad_mask(bits)
        self.assertTrue(m & (1 << 10))
        self.assertFalse(m & (1 << 12))  # informational

    def test_bad_list_excludes_informational(self):
        for name in ("SOURCE", "FULLSAMPLE", "PHANMISS"):
            self.assertNotIn(name, pb.BAD_FLAG_NAMES)


def wave_hdu():
    X = np.array([1, 256, 511, 766, 1021, 1275, 1530, 1785, 2040], dtype=np.int32)
    Y = np.array([1, 36, 71, 105, 140, 141, 379, 617, 855, 1091, 1326, 1564, 1802, 2040], dtype=np.int32)
    yy, xx = np.meshgrid(Y, X, indexing="ij")
    V = np.stack([1.6 + 0.0003 * yy + 0.00001 * xx, 0.05 + 0.000002 * yy], axis=-1).astype(np.float32)
    cols = [fits.Column("X", "9J", array=X[None, :], dim="(9)"),
            fits.Column("Y", "14J", array=Y[None, :], dim="(14)"),
            fits.Column("VALUES", "252E", array=V[None, ...], dim="(2,9,14)")]
    return fits.BinTableHDU.from_columns(cols, name="WCS-WAVE")


def image_header_with_wave(crpix1w=-1602.0, crpix2w=-290.0):
    h = tan_header(268.3, 3.6, 64, 64)
    h["WCSAXESW"] = 2
    for i in (1, 2):
        h[f"CRPIX{i}W"] = crpix1w if i == 1 else crpix2w
        h[f"CDELT{i}W"] = 1
        h[f"CRVAL{i}W"] = 1
        h[f"CTYPE{i}W"] = "WAVE-TAB"
        h[f"CUNIT{i}W"] = "um"
        h[f"PS{i}_0W"] = "WCS-WAVE"
        h[f"PS{i}_1W"] = "VALUES"
    h["PS1_2W"], h["PS2_2W"] = "X", "Y"
    h["PV1_3W"], h["PV2_3W"] = 1, 2
    return h


class TestWave(unittest.TestCase):
    def test_parse_tail_bytes(self):
        bio = io.BytesIO()
        fits.HDUList([fits.PrimaryHDU(), wave_hdu()]).writeto(bio)
        blob = bio.getvalue()[-pb.WAVE_TAIL_BYTES:]
        X, Y, V = pb.parse_wave_table(blob)
        self.assertEqual(V.shape, (14, 9, 2))
        self.assertEqual(X[-1], 2040)

    def test_matches_astropy_lookup(self):
        tab_hdu = wave_hdu()
        bio = io.BytesIO()
        fits.HDUList([fits.PrimaryHDU(), tab_hdu]).writeto(bio)
        tab = pb.parse_wave_table(bio.getvalue())
        h = image_header_with_wave()
        hl = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(header=h, name="IMAGE"), tab_hdu])
        w = WCS(h, fobj=hl, key="W")
        for x, y in [(0.0, 0.0), (31.5, 31.5), (63.0, 10.0)]:
            lam_a, bw_a = (float(v) for v in w.pixel_to_world_values(x, y))
            px = 1 + ((x + 1) - h["CRPIX1W"])
            py = 1 + ((y + 1) - h["CRPIX2W"])
            lam, bw = pb.wave_at(tab, px, py)
            self.assertAlmostEqual(lam, lam_a, places=6)
            self.assertAlmostEqual(bw, bw_a, places=6)


def cutout_bytes(nx=8, ny=6, with_psf=True):
    img = np.arange(nx * ny, dtype=np.float32).reshape(ny, nx)
    flags = np.zeros((ny, nx), dtype=np.int32)
    flags[0, 0] = 1
    flags[1, 1] = 2 ** 21
    var = np.full((ny, nx), 4e-4, dtype=np.float32)
    zodi = np.full((ny, nx), 0.25, dtype=np.float32)
    hdus = [fits.PrimaryHDU(), fits.ImageHDU(img, name="IMAGE"), fits.ImageHDU(flags, name="FLAGS"),
            fits.ImageHDU(var, name="VARIANCE"), fits.ImageHDU(zodi, name="ZODI")]
    if with_psf:
        hdus.append(fits.BinTableHDU.from_columns([fits.Column("A", "1089D", array=np.zeros((5, 1089)))], name="EPSF"))
    bio = io.BytesIO()
    fits.HDUList(hdus).writeto(bio)
    return bio.getvalue(), img, flags


class TestCutoutParsing(unittest.TestCase):
    def test_complete(self):
        blob, img, flags = cutout_bytes()
        hdus, done = pb.scan_hdus(blob)
        self.assertTrue(done)
        np.testing.assert_array_equal(hdus["IMAGE"][1], img)
        np.testing.assert_array_equal(hdus["FLAGS"][1], flags)

    def test_stops_only_when_all_four_arrived(self):
        blob, _, _ = cutout_bytes()
        hdus, done = pb.scan_hdus(blob[:2880 * 3])
        self.assertFalse(done)
        # Find the shortest prefix that is complete: it must end before the PSF table.
        n = 2880
        while not pb.scan_hdus(blob[:n])[1]:
            n += 2880
        self.assertLess(n, len(blob))
        self.assertEqual(set(pb.scan_hdus(blob[:n])[0]), set(pb.WANTED_HDUS))


class TestPack(unittest.TestCase):
    def test_round_trip(self):
        rng = np.random.default_rng(1)
        frames = []
        for k, (w, h) in enumerate([(64, 64), (65, 64), (3, 2)]):
            flags = rng.integers(0, 2 ** 31, size=(h, w), dtype=np.int64).astype(np.uint32)
            pix = rng.normal(0.2, 0.02, size=(h, w)).astype(np.float16)
            pix[0, 0] = np.nan
            frames.append(({"id": f"f{k}", "w": w, "h": h, "offset": -1}, flags, pix, {21: "SOURCE"}))
        entries, bits, raw = pb.pack(frames, {29: "SATELLITE_HALO"})
        self.assertEqual(bits, {"21": "SOURCE", "29": "SATELLITE_HALO"})
        data = gzip.decompress(pb.gzip_bytes(raw))
        self.assertEqual(data, raw)
        for e, (_, flags, pix, _) in zip(entries, frames):
            n = e["w"] * e["h"]
            f2 = np.frombuffer(data[e["offset"]:e["offset"] + 4 * n], "<u4").reshape(e["h"], e["w"])
            p2 = np.frombuffer(data[e["offset"] + 4 * n:e["offset"] + 6 * n], "<f2").reshape(e["h"], e["w"])
            np.testing.assert_array_equal(f2, flags)
            np.testing.assert_array_equal(np.isnan(p2), np.isnan(pix))
            np.testing.assert_array_equal(p2[~np.isnan(p2)], pix[~np.isnan(pix)])
        self.assertEqual(entries[-1]["offset"] + 6 * 3 * 2, len(raw))

    def test_gzip_is_deterministic(self):
        self.assertEqual(pb.gzip_bytes(b"abc" * 100), pb.gzip_bytes(b"abc" * 100))

    def test_renumber_windows(self):
        es = [{"window": 3}, {"window": 1}, {"window": 3}]
        self.assertEqual(pb.renumber_windows(es), 2)
        self.assertEqual([e["window"] for e in es], [1, 0, 1])


class TestMakeFrame(unittest.TestCase):
    def test_frame_from_cutout(self):
        nx = ny = 64
        h = image_header_with_wave()
        h["MJD-AVG"] = 61000.0
        h["DATE-AVG"] = "2025-11-21T00:00:00.000"
        h["XPOSURE"] = 113.58
        h["DETECTOR"] = 3
        h["OMEGA_MEDIAN"] = 37.86
        h["EXTNAME"] = "IMAGE"
        h.add_history("[CALIB] spectral_wcs test-calib-0001")
        img = np.full((ny, nx), 1.0, dtype=np.float32)
        flags = np.zeros((ny, nx), dtype=np.int32)
        flags[:2, :] = 1  # TRANSIENT on two rows
        fh = fits.Header()
        fh["MSKN0000"] = "TRANSIENT"
        hl = fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(img, header=h, name="IMAGE"),
                           fits.ImageHDU(flags, header=fh, name="FLAGS"),
                           fits.ImageHDU(np.full((ny, nx), 4e-4, np.float32), name="VARIANCE"),
                           fits.ImageHDU(np.full((ny, nx), 0.3, np.float32), name="ZODI")])
        bio = io.BytesIO()
        hl.writeto(bio)
        w = WCS(h)
        ra, dec = w.all_pix2world([[31.5, 31.5]], 0)[0]
        cat = {"ra": float(ra), "dec": float(dec), "ep": pb.mjd_to_year(61000.0), "pmra": 0.0, "pmdec": 0.0}
        tab_bio = io.BytesIO()
        fits.HDUList([fits.PrimaryHDU(), wave_hdu()]).writeto(tab_bio)
        tab = pb.parse_wave_table(tab_bio.getvalue())
        pb._wave_mem["wave-D3-test-calib-0001"] = tab
        exp = {"id": "X_1D3", "det": 3, "t": 61000.0, "release": "spherex_dr1", "pipeline": "l2b-v27-2026-228",
               "url": "https://example.invalid/x.fits", "win": 0}
        (entry, f, pix, bits), why = pb.make_frame(exp, bio.getvalue(), cat, "cut")
        self.assertEqual(why, "")
        self.assertEqual((entry["w"], entry["h"]), (64, 64))
        self.assertAlmostEqual(entry["zodi"], 0.3, places=5)
        self.assertAlmostEqual(entry["sigma"], 0.02, places=4)
        self.assertAlmostEqual(entry["badFrac"], 2 / 64, places=3)
        self.assertAlmostEqual(float(pix[10, 10]), 0.7, places=3)  # IMAGE minus ZODI
        self.assertLess(entry["wcsErr"], 0.01)
        lam, _ = pb.wave_at(tab, 1 + (32.5 - h["CRPIX1W"]), 1 + (32.5 - h["CRPIX2W"]))
        self.assertAlmostEqual(entry["lam"], round(lam, 5), places=5)
        # A target near the edge is refused.
        ra, dec = w.all_pix2world([[2.0, 30.0]], 0)[0]
        cat.update({"ra": float(ra), "dec": float(dec)})
        res, why = pb.make_frame(exp, bio.getvalue(), cat, "cut")
        self.assertIsNone(res)
        self.assertIn("edge", why)


class TestNeighbours(unittest.TestCase):
    def test_select(self):
        track = {"ra": 100.0, "dec": 0.0, "ep": 2016.0, "pmra": 0.0, "pmdec": 3600.0}  # 3.6"/yr north
        mjd0, mjd1 = pb.year_to_mjd(2025.5), pb.year_to_mjd(2026.5)
        on_path = 0.0 + 3.6 * 10.0 / 3600  # where the target is in 2026.0
        rows = [
            {"id": "self", "ra": 100.0, "dec": 0.0, "ep": 2016.0, "pmra": 0.0, "pmdec": 3600.0, "mag": 12.0},
            {"id": "near", "ra": 100.0, "dec": on_path + 20 / 3600, "ep": 2016.0, "pmra": None, "pmdec": None, "mag": 15.0},
            {"id": "far", "ra": 100.0, "dec": on_path + 90 / 3600, "ep": 2016.0, "pmra": 0.0, "pmdec": 0.0, "mag": 15.0},
            {"id": "nomag", "ra": 100.0, "dec": on_path, "ep": 2016.0, "pmra": 0.0, "pmdec": 0.0, "mag": None},
        ]
        out = pb.select_neighbours(rows, "gaia", track, mjd0, mjd1)
        ids = {n["id"]: n for n in out}
        self.assertEqual(set(ids), {"self", "near"})
        self.assertTrue(ids["self"]["target"])
        self.assertNotIn("target", ids["near"])
        self.assertEqual(ids["near"]["pmra"], 0.0)


class _Flaky(BaseHTTPRequestHandler):
    hits = 0

    def do_GET(self):
        type(self).hits += 1
        if type(self).hits < 3:
            self.send_response(503)
            self.end_headers()
            return
        body = b"SIMPLE  = ok" + b"x" * 200000
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *a):
        pass


class TestFetch(unittest.TestCase):
    def test_retries_busy_and_stops_early(self):
        srv = ThreadingHTTPServer(("127.0.0.1", 0), _Flaky)
        th = threading.Thread(target=srv.serve_forever, daemon=True)
        th.start()
        old = pb.RETRY_WAITS
        pb.RETRY_WAITS = [0.01, 0.01, 0.01]
        try:
            url = f"http://127.0.0.1:{srv.server_address[1]}/x"
            status, body = pb.fetch(url, stop=lambda b: len(b) >= 1000)
            self.assertEqual(status, 200)
            self.assertEqual(_Flaky.hits, 3)
            self.assertLess(len(body), 200000)
            self.assertTrue(pb.retrying())
        finally:
            pb.RETRY_WAITS = old
            srv.shutdown()
            srv.server_close()


class _Silent(BaseHTTPRequestHandler):
    """Takes the request and never answers in time (IRSA's TAP service on a bad day)."""
    hits = 0

    def do_POST(self):
        type(self).hits += 1
        time.sleep(2)

    do_GET = do_POST

    def log_message(self, *a):
        pass


class TestSearchBudget(unittest.TestCase):
    def setUp(self):
        _Silent.hits = 0
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), _Silent)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.srv.server_address[1]}/tap"

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def test_read_timeout_retries_then_gives_up_by_the_deadline(self):
        heard = []
        t0 = time.time()
        with self.assertRaises(pb.FetchError) as cm:
            pb.fetch(self.url, data={"QUERY": "x"}, timeout=(1, 0.3), waits=[0.05, 0.05, 0.05],
                     deadline=t0 + 0.9, on_try=lambda n, of: heard.append((n, of)))
        took = time.time() - t0
        self.assertLess(took, 1.6)               # never past the deadline (plus a little)
        self.assertIn("no answer within", str(cm.exception))
        self.assertGreaterEqual(len(heard), 2)   # tried again after a read timeout
        self.assertEqual(heard[0], (1, 4))
        self.assertEqual([n for n, _ in heard], list(range(1, len(heard) + 1)))

    def test_without_deadline_every_try_is_used(self):
        heard = []
        with self.assertRaises(pb.FetchError) as cm:
            pb.fetch(self.url, timeout=(1, 0.2), waits=[0.01, 0.01], on_try=lambda n, of: heard.append(n))
        self.assertEqual(heard, [1, 2, 3])
        self.assertIn("gave up after 3 tries", str(cm.exception))

    def test_long_wait_is_not_started_past_the_deadline(self):
        t0 = time.time()
        with self.assertRaises(pb.FetchError):
            pb.fetch(self.url, timeout=(1, 0.2), waits=[30], deadline=t0 + 5)
        self.assertLess(time.time() - t0, 2)     # did not sleep 30 s
        self.assertEqual(_Silent.hits, 1)

    def test_search_budget_is_a_few_minutes(self):
        tries = len(pb.SEARCH_WAITS) + 1
        worst = tries * pb.SEARCH_TIMEOUT[1] + sum(pb.SEARCH_WAITS)
        self.assertLessEqual(pb.SEARCH_BUDGET, 180)
        self.assertGreaterEqual(worst, pb.SEARCH_BUDGET)  # the budget, not the tries, is the cap
        self.assertLess(pb.SEARCH_TIMEOUT[1], pb.TIMEOUT[1])


class TestFetchPlan(unittest.TestCase):
    def test_ahead_goes_first_and_frames_are_heard(self):
        exps = {g: [{"id": f"{g[0]}-{g[1]}-{i}", "t": 60000.0 + g[0], "url": "u"} for i in range(2)]
                for g in [(0, 1), (0, 3), (1, 1), (1, 3)]}
        p = {"groups": exps, "perDet": 2}
        asked, heard = [], []
        saved = pb.download_cutout, pb.make_frame, pb.MAX_CONCURRENT
        pb.download_cutout = lambda url, waits=None: b""
        pb.make_frame = lambda e, body, cat, url: (asked.append(e["id"]) or ({"mjd": e["t"], "det": 1},), "")
        pb.MAX_CONCURRENT = 1  # one at a time, so the asking order shows
        try:
            cat = {"ra": 0.0, "dec": 0.0, "ep": 2016.0, "pmra": 0.0, "pmdec": 0.0}
            frames, _ = pb.fetch_plan(p, cat, 0.1, ahead=[(1, 3), (0, 3)],
                                      on_frame=lambda got: heard.append(sum(map(len, got.values()))))
        finally:
            pb.download_cutout, pb.make_frame, pb.MAX_CONCURRENT = saved
        self.assertEqual(asked[:3], ["1-3-0", "0-3-0", "0-1-0"])
        self.assertEqual(len(frames), 8)
        self.assertEqual(heard, list(range(1, 9)))


class TestConfig(unittest.TestCase):
    def test_release_list(self):
        self.assertEqual(pb.RELEASES, ["spherex_dr1", "spherex_qr3"])
        self.assertTrue(all(r.endswith("_deep") for r in pb.DEEP_RELEASES))
        self.assertEqual(pb.releases_for(pb.TARGETS["r-dra"]), pb.RELEASES + pb.DEEP_RELEASES)

    def test_targets_have_sourced_catalogue(self):
        for key, cfg in pb.TARGETS.items():
            cat = cfg["catalogue"]
            for k in ("ra", "dec", "ep", "pmra", "pmdec", "parallax", "from"):
                self.assertIn(k, cat, key)
            self.assertIn(cfg["fov"], (3, 6, 12))

    def test_search_adql(self):
        q = pb.search_adql(1.5, -2.25, "spherex_dr1")
        self.assertIn("o.collection = 'spherex_dr1'", q)
        self.assertIn("CONTAINS(POINT('ICRS', 1.500000, -2.250000), p.poly)", q)

    def test_parse_search_row(self):
        row = {"observationid": "2025W35_1A_0511_1", "energy_bandpassname": "SPHEREx-D2",
               "time_bounds_lower": "60914.6", "time_bounds_upper": "60914.7", "time_exposure": "113.58",
               "poly": wkb_polygon([(1, 1), (2, 1), (2, 2), (1, 2)]),
               "uri": "ibe/data/spherex/dr1/level2/2025W35_1A/l2b-v27-2026-230/2/level2_2025W35_1A_0511_1D2_spx_l2b-v27-2026-230.fits"}
        e = pb.parse_search_row(row, "spherex_dr1")
        self.assertEqual(e["id"], "2025W35_1A_0511_1D2")
        self.assertEqual(e["det"], 2)
        self.assertEqual(e["pipeline"], "l2b-v27-2026-230")
        self.assertTrue(e["url"].startswith("https://irsa.ipac.caltech.edu/ibe/data/spherex/dr1/"))
        self.assertAlmostEqual(e["t"], 60914.65)


class TestShippedData(unittest.TestCase):
    """Checks the committed files in public/data against the format, where they exist."""

    def test_manifest_and_frames(self):
        man_path = pb.OUT_DIR / "manifest.json"
        if not man_path.exists():
            self.skipTest("no shipped data")
        man = json.loads(man_path.read_text())
        self.assertEqual(man["version"], 1)
        for key, t in man["targets"].items():
            d = json.loads((pb.OUT_DIR / key / "frames.json").read_text())
            gz = (pb.OUT_DIR / key / "frames.bin.gz").read_bytes()
            self.assertEqual(len(gz), t["bytes"], key)
            self.assertEqual(len(d["frames"]), t["frames"], key)
            raw = gzip.decompress(gz)
            last = d["frames"][-1]
            self.assertEqual(last["offset"] + 6 * last["w"] * last["h"], len(raw), key)
            self.assertEqual(sorted({f["window"] for f in d["frames"]}), list(range(t["windows"])), key)
            mjds = [f["mjd"] for f in d["frames"]]
            self.assertEqual(mjds, sorted(mjds), key)


class TestPriorityGate(unittest.TestCase):
    """The shared request slots go to watched work first (docs/research/prediction.md, option 1)."""

    def setUp(self):
        self.saved = pb.MAX_CONCURRENT, pb._last_retry
        pb._last_retry = 0.0

    def tearDown(self):
        pb.MAX_CONCURRENT, pb._last_retry = self.saved

    def _queue_up(self, prios):
        """Holds the only slot, lines up one thread per priority, then lets them go one by one."""
        pb.MAX_CONCURRENT = 1
        order = []
        held = pb._gate.acquire(pb.WATCHED)
        threads = []
        for name, prio in prios:
            def go(name=name, prio=prio):
                lvl = pb._gate.acquire(prio)
                order.append(name)
                pb._gate.release(lvl)
            t = threading.Thread(target=go, daemon=True)
            t.start()
            threads.append(t)
            for _ in range(200):  # in line before the next one comes
                if len(pb._gate.waiting) == len(threads):
                    break
                time.sleep(0.005)
        return order, threads, held

    def test_watched_before_seed_then_arrival(self):
        order, threads, held = self._queue_up([("seed-1", pb.SEED), ("watched", pb.WATCHED),
                                               ("seed-2", pb.SEED), ("predicted", pb.PREDICTED)])
        pb._gate.release(held)
        for t in threads:
            t.join(5)
        self.assertEqual(order, ["watched", "predicted", "seed-1", "seed-2"])

    def test_priority_can_rise_while_waiting(self):
        level = {"v": pb.SEED}
        order, threads, held = self._queue_up([("other", pb.SEED), ("promoted", lambda: level["v"])])
        level["v"] = pb.WATCHED  # a page started watching it
        pb._gate.release(held)
        for t in threads:
            t.join(5)
        self.assertEqual(order, ["promoted", "other"])

    def test_low_work_holds_back_after_busy_and_is_capped(self):
        pb.MAX_CONCURRENT = 8
        pb._last_retry = time.time()  # a busy reply just now
        got = []
        t = threading.Thread(target=lambda: got.append(pb._gate.acquire(pb.SEED)), daemon=True)
        t.start()
        t.join(0.6)
        self.assertEqual(got, [])                       # seed waits after a busy reply
        lvl = pb._gate.acquire(pb.WATCHED)               # watched work does not
        pb._gate.release(lvl)
        pb._last_retry = 0.0
        t.join(5)
        self.assertEqual(got, [pb.SEED])
        pb._gate.release(got[0])
        lows = [pb._gate.acquire(pb.SEED) for _ in range(pb.LOW_SLOTS)]
        extra = []
        t = threading.Thread(target=lambda: extra.append(pb._gate.acquire(pb.SEED)), daemon=True)
        t.start()
        t.join(0.6)
        self.assertEqual(extra, [])                      # at most LOW_SLOTS for low work
        for lvl in lows:
            pb._gate.release(lvl)
        t.join(5)
        pb._gate.release(extra[0])
        self.assertEqual((pb._gate.used, pb._gate.low), (0, 0))

    def test_priority_is_carried_into_pools(self):
        seen = []
        with pb.priority(pb.SEED):
            run = pb.carry(lambda: seen.append(pb.current_priority()))
        threading.Thread(target=run).start()
        time.sleep(0.05)
        self.assertEqual(seen, [pb.SEED])
        self.assertEqual(pb.current_priority(), pb.WATCHED)


class TestFetchPlanStops(unittest.TestCase):
    def test_keep_going_stops_new_cutouts_and_says_so(self):
        exps = {(w, d): [{"id": f"{w}-{d}-{i}", "t": 60000.0 + w, "url": "u"} for i in range(3)]
                for w in range(2) for d in range(1, 7)}
        p = {"groups": exps, "perDet": 2}
        asked = []
        saved = pb.download_cutout, pb.make_frame, pb.MAX_CONCURRENT
        pb.download_cutout = lambda url, waits=None: b""
        pb.make_frame = lambda e, body, cat, url: (asked.append(e["id"]) or ({"mjd": e["t"], "det": 1},), "")
        pb.MAX_CONCURRENT = 1
        calls = {"n": 0}

        def keep_going():
            calls["n"] += 1
            return calls["n"] <= 5

        try:
            cat = {"ra": 0.0, "dec": 0.0, "ep": 2016.0, "pmra": 0.0, "pmdec": 0.0}
            report = {}
            frames, skipped = pb.fetch_plan(p, cat, 0.1, keep_going=keep_going, report=report)
            whole, _ = pb.fetch_plan(p, cat, 0.1, report=(full := {}))
        finally:
            pb.download_cutout, pb.make_frame, pb.MAX_CONCURRENT = saved
        self.assertTrue(report["stopped"])
        self.assertEqual(len(frames), 4)        # 1 batch check + 4 cutouts, then no more
        self.assertEqual(skipped, [])           # cutouts not asked are not "skipped"
        self.assertFalse(full["stopped"])
        self.assertEqual(len(whole), 24)


if __name__ == "__main__":
    unittest.main()
