"""Tests for the pure parts of live.py and its routes, with the IRSA work stubbed out (no network).

Run: python -m unittest discover -s scripts -p 'test_*.py'
"""

import json
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import live  # noqa: E402
import prebake as pb  # noqa: E402


class TestInput(unittest.TestCase):
    def test_valid_and_rounded(self):
        self.assertEqual(live.parse_patch_query("ra=217.4291&dec=-62.6804&fov=12"), (217.429, -62.68, 12))
        self.assertEqual(live.parse_patch_query("ra=180&dec=60&fov=6.0"), (180.0, 60.0, 6))
        self.assertEqual(live.parse_patch_query("ra=1e2&dec=+5&fov=3"), (100.0, 5.0, 3))

    def test_default_fov(self):
        self.assertEqual(live.parse_patch_query("ra=10&dec=10")[2], 12)

    def test_wraps_ra(self):
        self.assertEqual(live.parse_patch_query("ra=360&dec=0&fov=6")[0], 0.0)
        self.assertEqual(live.parse_patch_query("ra=359.9996&dec=0&fov=6")[0], 0.0)

    def test_negative_zero(self):
        ra, dec, _ = live.parse_patch_query("ra=0&dec=-0.0001&fov=6")
        self.assertEqual(str(dec), "0.0")

    def test_rejects(self):
        bad = [
            "", "ra=10", "dec=10", "ra=abc&dec=1", "ra=nan&dec=1", "ra=inf&dec=1", "ra=1&dec=1&fov=5",
            "ra=-1&dec=0", "ra=361&dec=0", "ra=1&dec=90.5", "ra=1&dec=-91", "ra=1&ra=2&dec=0",
            "ra=0x10&dec=0", "ra=" + "1" * 40 + "&dec=0", "ra=1&dec=1&fov=12; rm",
            "ra=http://evil.example/&dec=0",
        ]
        for q in bad:
            with self.assertRaises(live.BadRequest, msg=q):
                live.parse_patch_query(q)


class TestKeys(unittest.TestCase):
    def test_patch_id(self):
        rels = ["spherex_dr1", "spherex_qr3"]
        a = live.patch_id(217.429, -62.68, 12, rels)
        self.assertRegex(a, r"^[0-9a-f]{16}$")
        self.assertEqual(a, live.patch_id(*live.round_position(217.42904, -62.68001), 12, rels))
        self.assertNotEqual(a, live.patch_id(217.429, -62.68, 6, rels))
        self.assertNotEqual(a, live.patch_id(217.429, -62.68, 12, rels + ["spherex_dr2"]))
        self.assertNotEqual(a, live.patch_id(217.430, -62.68, 12, rels))

    def test_sizes(self):
        self.assertEqual(live.cutout_size(6), 0.11)
        self.assertEqual(live.cutout_size(12), 0.21)
        self.assertEqual(live.cutout_size(3), 0.06)
        self.assertAlmostEqual(live.catalog_radius(12), 0.1 * 2 ** 0.5 + 30 / 3600)

    def test_first_look_groups(self):
        p = {"windows": [0, 2, 5], "groups": {(0, 1): [], (0, 4): [], (2, 1): [], (5, 1): [], (5, 6): []}}
        # Oldest and newest of one detector side by side, detector 3's neighbours first.
        self.assertEqual(live.first_look_groups(p), [(0, 4), (0, 1), (5, 1), (5, 6)])
        p["groups"][(0, 3)] = p["groups"][(5, 3)] = []
        self.assertEqual(live.first_look_groups(p)[:2], [(0, 3), (5, 3)])
        self.assertEqual(live.first_look_groups({"windows": [], "groups": {}}), [])
        one = {"windows": [3], "groups": {(3, 2): [], (3, 5): []}}
        self.assertEqual(sorted(live.first_look_groups(one)), [(3, 2), (3, 5)])

    def test_first_look_waits_for_one_detector_at_both_ends(self):
        p = {"windows": [0, 2, 5]}

        def fr(mjd, det):
            return ({"mjd": mjd, "det": det},)

        got = {(0, 1): [fr(10, 1)], (0, 3): [], (2, 3): [fr(50, 3)], (5, 3): [fr(90, 3)]}
        self.assertEqual(live.first_look(got, p), [])
        got[(0, 3)].append(fr(11, 3))
        self.assertEqual(live.first_look(got, p), [fr(10, 1), fr(11, 3), fr(90, 3)])
        self.assertEqual(live.first_look({(4, 2): [fr(1, 2)]}, {"windows": [4]}), [fr(1, 2)])
        self.assertEqual(live.first_look({}, {"windows": []}), [])

    def test_origin(self):
        allowed = ["http://localhost:5173", "https://sima.example"]
        self.assertEqual(live.allowed_origin("https://sima.example", allowed), "https://sima.example")
        self.assertIsNone(live.allowed_origin("https://evil.example", allowed))
        self.assertIsNone(live.allowed_origin(None, allowed))

    def test_limits(self):
        self.assertEqual(live.LIVE_PER_DET, 2)
        self.assertEqual(live.LIVE_MAX_FRAMES, 48)
        self.assertEqual(live.MAX_RUNNING, 2)
        self.assertEqual(live.MAX_QUEUED, 8)
        self.assertEqual(pb.MAX_CONCURRENT, 8)


def fake_run(self):
    """Stands in for Patch.run: goes through the states and writes small files."""
    self.set(state="searching")
    self.set(found=3, state="first", total=1, done=1, kept=1)
    for step in ("first", "full"):
        out = self.dir / step
        out.mkdir(parents=True, exist_ok=True)
        (out / "frames.json").write_text(json.dumps({"frames": [], "live": {"step": step}}))
        (out / "frames.bin.gz").write_bytes(pb.gzip_bytes(b"\0" * 6))
        self.set(**{step: f"/api/patch/{self.id}/{step}/"})
    self.set(state="ready", releases=["spherex_dr1"])
    self.finish()


def fake_catalog(self):
    self.dir.mkdir(parents=True, exist_ok=True)
    (self.dir / "catalog.json").write_text(json.dumps({"rows": [{"cat": "gaia", "id": "Gaia DR3 1"}]}))
    self.set(catalog=f"/api/patch/{self.id}/catalog.json")


class TestServer(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._run, self._cat = live.Patch.run, live.Patch.run_catalog
        live.Patch.run, live.Patch.run_catalog = fake_run, fake_catalog
        self.srv = live.make_server("127.0.0.1", 0, Path(self.tmp.name), ["http://localhost:5173"])
        self.base = f"http://127.0.0.1:{self.srv.server_address[1]}"
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        live.Patch.run, live.Patch.run_catalog = self._run, self._cat
        self.tmp.cleanup()

    def get(self, path, origin=None):
        req = urllib.request.Request(self.base + path, headers={"Origin": origin} if origin else {})
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def wait_ready(self, q):
        for _ in range(100):
            code, _, body = self.get("/api/patch?" + q)
            st = json.loads(body)
            if st["state"] == "ready" and st.get("catalog"):
                return st
            time.sleep(0.02)
        self.fail(f"not ready: {st}")

    def test_health(self):
        code, _, body = self.get("/api/health")
        self.assertEqual(code, 200)
        self.assertTrue(json.loads(body)["ok"])

    def test_bad_input(self):
        code, _, body = self.get("/api/patch?ra=400&dec=0&fov=12")
        self.assertEqual(code, 400)
        self.assertIn("ra", json.loads(body)["error"])

    def test_flow_files_and_catalog(self):
        st = self.wait_ready("ra=217.429&dec=-62.68&fov=12")
        pid = st["id"]
        self.assertEqual(st["first"], f"/api/patch/{pid}/first/")
        code, h, body = self.get(f"/api/patch/{pid}/full/frames.json")
        self.assertEqual(code, 200)
        self.assertTrue(h["Content-Type"].startswith("application/json"))
        code, h, body = self.get(f"/api/patch/{pid}/first/frames.bin.gz")
        self.assertEqual(code, 200)
        self.assertEqual(body[:2], b"\x1f\x8b")
        self.assertNotIn("Content-Encoding", h)
        code, _, body = self.get(f"/api/patch/{pid}/catalog.json")
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(body)["rows"][0]["cat"], "gaia")
        code, _, body = self.get(f"/api/patch/{pid}")
        self.assertEqual(json.loads(body)["state"], "ready")
        # Finished patches survive a restart: a new service reads status.json from disk.
        svc = live.Service(Path(self.tmp.name) / "live", max_running=0)
        self.assertEqual(svc.status(pid)["state"], "ready")
        self.assertEqual(svc.request(217.429, -62.68, 12)["state"], "ready")

    def test_unknown_and_traversal(self):
        for path in ["/api/patch/0123456789abcdef", "/api/patch/0123456789abcdef/full/frames.json",
                     "/api/patch/../../etc/passwd", "/api/patch/0123456789abcdef/full/../../x",
                     "/api/patch/0123456789ABCDEF/full/frames.json", "/api/other", "/"]:
            code, _, _ = self.get(path)
            self.assertEqual(code, 404, path)

    def test_cors(self):
        _, h, _ = self.get("/api/health", origin="http://localhost:5173")
        self.assertEqual(h.get("Access-Control-Allow-Origin"), "http://localhost:5173")
        _, h, _ = self.get("/api/health", origin="https://evil.example")
        self.assertNotIn("Access-Control-Allow-Origin", h)

    def test_only_get(self):
        req = urllib.request.Request(self.base + "/api/patch?ra=1&dec=1", method="POST", data=b"x")
        with self.assertRaises(urllib.error.HTTPError) as cm:
            urllib.request.urlopen(req, timeout=5)
        self.assertEqual(cm.exception.code, 405)


class TestBusy(unittest.TestCase):
    def test_queue_limit(self):
        with tempfile.TemporaryDirectory() as tmp:
            svc = live.Service(Path(tmp), max_running=0, max_queued=2)  # no workers: jobs stay queued
            orig = live.Patch.run_catalog
            live.Patch.run_catalog = lambda self: None
            try:
                svc.cat_queue = __import__("queue").Queue()  # catalog jobs are not counted
                self.assertEqual(svc.request(1.0, 1.0, 12)["state"], "queued")
                self.assertEqual(svc.request(2.0, 1.0, 12)["state"], "queued")
                self.assertEqual(svc.request(1.0, 1.0, 12)["state"], "queued")  # same patch: no new job
                with self.assertRaises(live.Busy):
                    svc.request(3.0, 1.0, 12)
            finally:
                live.Patch.run_catalog = orig


if __name__ == "__main__":
    unittest.main()
