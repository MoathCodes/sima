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


class TestFieldSizes(unittest.TestCase):
    def test_wide_fields(self):
        self.assertEqual(live.parse_patch_query("ra=10&dec=10&fov=24")[2], 24)
        self.assertEqual(live.parse_patch_query("ra=10&dec=10&fov=48")[2], 48)
        with self.assertRaises(live.BadRequest):
            live.parse_patch_query("ra=10&dec=10&fov=96")
        self.assertEqual(live.cutout_size(24), 0.41)
        self.assertEqual(live.cutout_size(48), 0.81)
        self.assertEqual(live.per_det(12), 2)
        self.assertEqual(live.per_det(24), 2)
        self.assertEqual(live.per_det(48), 1)


class TestSearchBudget(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.svc = live.Service(Path(self.tmp.name), max_running=0)
        self.svc.cat_queue = __import__("queue").Queue()  # no catalogue queries reach the network
        self._search = live.pb.search

    def tearDown(self):
        live.pb.search = self._search
        self.tmp.cleanup()

    def test_limits_and_words(self):
        lim = live.search_limits(1000.0)
        self.assertEqual(lim["deadline"], 1000.0 + live.pb.SEARCH_BUDGET)
        self.assertEqual(lim["timeout"], live.pb.SEARCH_TIMEOUT)
        self.assertEqual(live.minutes(40), "40 s")
        self.assertEqual(live.minutes(100), "1 min 40 s")

    def test_status_carries_try_and_elapsed_while_searching(self):
        go = threading.Event()
        seen = {}

        def slow(ra, dec, rels, **kw):
            seen.update(kw)
            kw["on_try"](1, 4)
            kw["on_try"](3, 4)
            go.wait(5)
            return [], {r: 0 for r in rels}, []

        live.pb.search = slow
        p = live.Patch(self.svc, "0123456789abcdef", 10.0, 10.0, 12, ["spherex_dr1"])
        th = threading.Thread(target=p.run, daemon=True)
        th.start()
        for _ in range(100):
            st = p.snapshot()
            if st["searchTry"] == 3:
                break
            time.sleep(0.01)
        self.assertEqual(st["state"], "searching")
        self.assertEqual(st["searchTry"], 3)
        self.assertEqual(st["searchTries"], len(live.pb.SEARCH_WAITS) + 1)
        self.assertGreaterEqual(st["searchElapsed"], 0)
        self.assertIn("deadline", seen)
        go.set()
        th.join(5)
        self.assertEqual(p.snapshot()["state"], "empty")
        self.assertEqual(p.snapshot()["searchElapsed"], 0)

    def test_silent_search_fails_honestly_and_can_be_retried_at_once(self):
        def silent(ra, dec, rels, **kw):
            kw["on_try"](4, 4)
            raise live.pb.FetchError("no answer within the time allowed (ReadTimeout): search spherex_dr1")

        live.pb.search = silent
        st = self.svc.request(10.0, 10.0, 12)
        p = self.svc.patches[st["id"]]
        p.run()
        st = p.snapshot()
        self.assertEqual(st["state"], "failed")
        self.assertTrue(st["searchTimedOut"])
        self.assertIn("NASA’s search did not answer within", st["error"])
        self.assertIn("(4 tries)", st["error"])
        # Retry: asked again a few seconds later, the patch starts over (not 30 s later).
        self.assertEqual(self.svc.request(10.0, 10.0, 12)["state"], "failed")
        p.finished -= live.RETRY_SEARCH_AFTER + 0.1
        self.assertEqual(self.svc.request(10.0, 10.0, 12)["state"], "queued")

    def test_other_search_errors_say_what_failed(self):
        def broken(ra, dec, rels, **kw):
            raise live.pb.FetchError("TAP error from IRSA: b'<VOTABLE ERROR'")

        live.pb.search = broken
        p = live.Patch(self.svc, "0123456789abcdef", 10.0, 10.0, 12, ["spherex_dr1"])
        p.run()
        st = p.snapshot()
        self.assertFalse(st["searchTimedOut"])
        self.assertTrue(st["error"].startswith("NASA’s search failed: TAP error"))


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


def held(ra, dec, fov, pid="aaaaaaaaaaaaaaaa"):
    return {"id": pid, "ra": ra, "dec": dec, "fov": fov}


class TestCoverage(unittest.TestCase):
    """A finished patch answers for a field its cutouts hold (prediction.md, option 2)."""

    def test_inside_edge_outside(self):
        h = held(100.0, 20.0, 12)                 # cutout 0.21 deg = 12.6', usable 12.0'
        self.assertTrue(live.covers(h, 100.0, 20.0, 12))
        self.assertTrue(live.covers(h, 100.0, 20.0, 6))
        self.assertTrue(live.covers(h, 100.0, 20.0 + 2.99 / 60, 6))   # 3' + 3' = 6' = half the side
        self.assertFalse(live.covers(h, 100.0, 20.0 + 3.1 / 60, 6))
        self.assertTrue(live.covers(h, 100.0, 20.0 + 4.49 / 60, 3))
        self.assertFalse(live.covers(h, 100.0, 20.0 + 4.6 / 60, 3))
        self.assertFalse(live.covers(h, 100.0, 20.0 + 0.5 / 60, 12))
        self.assertFalse(live.covers(h, 100.0, 20.0, 24))

    def test_across_ra_zero_and_near_a_pole(self):
        self.assertTrue(live.covers(held(359.98, 0.0, 12), 0.02, 0.0, 6))   # 2.4' across RA 0
        self.assertFalse(live.covers(held(359.9, 0.0, 12), 0.1, 0.0, 6))    # 12' across RA 0
        # Near the pole a degree of RA is short: 1 deg of RA at dec 89.9 is about 0.1'.
        self.assertTrue(live.covers(held(10.0, 89.9, 12), 11.0, 89.9, 6))
        self.assertFalse(live.covers(held(10.0, 60.0, 12), 11.0, 60.0, 6))

    def test_small_fields_never_take_the_widest(self):
        self.assertFalse(live.covers(held(10.0, 10.0, 48), 10.0, 10.0, 6))   # 6 MB for a 6' field
        self.assertTrue(live.covers(held(10.0, 10.0, 24), 10.0, 10.0, 12))
        self.assertTrue(live.covers(held(10.0, 10.0, 12), 10.0, 10.0, 3))
        self.assertFalse(live.covers(held(10.0, 10.0, 24), 10.0, 10.0, 3))


def write_ready(root: Path, pid, ra, dec, fov, ahead=False):
    """A finished patch on disk, as Patch.finish leaves it."""
    d = root / pid
    (d / "full").mkdir(parents=True)
    (d / "full" / "frames.json").write_text("{}")
    (d / "catalog.json").write_text("{}")
    st = {"id": pid, "state": "ready", "found": 3, "done": 1, "total": 1, "kept": 1, "releases": [],
          "error": "", "warning": "", "first": f"/api/patch/{pid}/first/", "full": f"/api/patch/{pid}/full/",
          "catalog": None, "catalogError": "", "ra": ra, "dec": dec, "fov": fov,
          "searched": live.releases(), "ahead": ahead}
    (d / "status.json").write_text(json.dumps(st))


class QuietService(unittest.TestCase):
    """A Service with no workers and no catalogue queries: jobs stay where the test puts them."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self._cat = live.Patch.run_catalog
        live.Patch.run_catalog = lambda self: None

    def service(self, **kw):
        svc = live.Service(self.root, max_running=0, **kw)
        svc.cat_queue = __import__("queue").Queue()
        return svc

    def tearDown(self):
        live.Patch.run_catalog = self._cat
        self.tmp.cleanup()


class TestReuse(QuietService):
    def test_nudge_and_smaller_field_reuse_a_finished_patch(self):
        write_ready(self.root, "1111111111111111", 100.0, 20.0, 12, ahead=True)
        svc = self.service()
        st = svc.request(100.0, 20.02, 6)                 # 1.2' away, 6' field
        self.assertTrue(st["reused"])
        self.assertEqual(st["id"], "1111111111111111")
        self.assertEqual((st["ra"], st["dec"], st["fov"]), (100.0, 20.0, 12))  # its own centre and field
        self.assertEqual(st["state"], "ready")
        self.assertTrue(st["ahead"])
        self.assertEqual(svc.counts["reused"], 1)
        self.assertEqual(svc.waiting, [])                 # nothing new was started
        st = svc.request(100.0, 20.2, 6)                  # 12' away: a new patch
        self.assertNotIn("reused", st)
        self.assertEqual(st["state"], "queued")
        self.assertFalse(st["ahead"])

    def test_exact_patch_wins_and_a_deleted_one_is_not_reused(self):
        write_ready(self.root, "1111111111111111", 100.0, 20.0, 12)
        svc = self.service()
        import shutil
        shutil.rmtree(self.root / "1111111111111111")
        self.assertEqual(svc.request(100.0, 20.0, 6)["state"], "queued")
        self.assertNotIn("1111111111111111", svc.held)

    def test_finished_patches_are_indexed_as_they_finish(self):
        svc = self.service()
        self.assertIsNone(svc.covering(50.0, 5.0, 6))
        svc.hold({"id": "2222222222222222", "ra": 50.0, "dec": 5.0, "fov": 12, "full": "x",
                  "searched": live.releases()})
        self.assertEqual(svc.covering(50.0, 5.01, 6), "2222222222222222")
        svc.hold({"id": "3333333333333333", "ra": 60.0, "dec": 5.0, "fov": 12, "full": "x",
                  "searched": ["spherex_old"]})
        self.assertIsNone(svc.covering(60.0, 5.0, 6))  # another release list: not reused


class TestQueue(QuietService):
    def test_watched_first_then_seed_and_unwatched_ones_pause(self):
        svc = self.service()
        seed = svc.request(1.0, 1.0, 12, klass="seed")["id"]
        gone = svc.request(2.0, 1.0, 12)["id"]
        watched = svc.request(3.0, 1.0, 12)["id"]
        svc.patches[gone].last_seen -= live.WATCH_SECS + 1    # its page went away
        self.assertEqual(svc._next().id, watched)
        self.assertEqual(svc._next().id, seed)
        self.assertEqual(svc.patches[gone].snapshot()["state"], "paused")
        self.assertEqual(svc.waiting, [])
        # Asked again (a status read), it is queued again.
        self.assertEqual(svc.status(gone)["state"], "queued")
        self.assertEqual(svc._next().id, gone)
        self.assertEqual(svc.counts["paused"], 1)
        self.assertEqual(svc.counts["resumed"], 1)

    def test_seed_work_does_not_fill_the_busy_limit(self):
        svc = self.service(max_queued=1)
        svc.request(1.0, 1.0, 12, klass="seed")
        svc.request(2.0, 1.0, 12, klass="seed")
        svc.request(3.0, 1.0, 12)
        with self.assertRaises(live.Busy):
            svc.request(4.0, 1.0, 12)

    def test_keep_going(self):
        svc = self.service()
        p = svc.patches[svc.request(1.0, 1.0, 12)["id"]]
        self.assertTrue(p.keep_going())
        self.assertEqual(p.priority(), live.pb.WATCHED)
        p.last_seen -= live.WATCH_SECS + 1
        self.assertEqual(p.priority(), live.pb.SEED)
        # No first look yet: a few more cutouts may start, then it pauses.
        self.assertEqual([p.keep_going() for _ in range(live.FIRST_GRACE + 2)],
                         [True] * live.FIRST_GRACE + [False, False])
        p.touch()
        self.assertTrue(p.keep_going())
        p.last_seen -= live.WATCH_SECS + 1
        p.set(first="/api/patch/x/first/")
        self.assertFalse(p.keep_going())                    # first look out: pause at once
        s = svc.patches[svc.request(2.0, 1.0, 12, klass="seed")["id"]]
        s.last_seen -= live.WATCH_SECS + 1
        self.assertTrue(s.keep_going())                     # the seed job waits for it


class TestPauseAndResume(QuietService):
    """A whole run against a stub archive: the page leaves, the patch pauses, comes back, finishes."""

    def setUp(self):
        super().setUp()
        self.saved = {k: getattr(live.pb, k) for k in ("search", "load_plan_tables", "estimate_lam", "plan",
                                                        "download_cutout", "make_frame", "pack",
                                                        "renumber_windows")}
        self.downloads = []
        exps = [{"id": f"e{w}{d}{i}", "t": 60000.0 + 200 * w, "det": d, "url": f"u{w}{d}{i}", "release": "r"}
                for w in range(2) for d in range(1, 7) for i in range(3)]
        groups = {}
        for e in exps:
            groups.setdefault((int((e["t"] - 60000) // 200), e["det"]), []).append(e)
        live.pb.search = lambda ra, dec, rels, **kw: (exps, {r: len(exps) for r in rels}, [])
        live.pb.load_plan_tables = lambda exps: None
        live.pb.estimate_lam = lambda e, ra, dec: None
        live.pb.plan = lambda exps, per, mx: {"groups": groups, "perDet": 2, "windows": [0, 1]}
        self.gate = threading.Event()
        self.gate.set()

        def download(url, waits=None):
            self.gate.wait(5)
            self.downloads.append(url)
            time.sleep(0.01)
            return b""
        live.pb.download_cutout = download
        live.pb.make_frame = lambda e, body, cat, url: (({"mjd": e["t"], "det": e["det"]}, b""), "")
        live.pb.pack = lambda frames: ([{"release": "r"} for _ in frames], {}, b"")
        live.pb.renumber_windows = lambda entries: 2

    def tearDown(self):
        for k, v in self.saved.items():
            setattr(live.pb, k, v)
        super().tearDown()

    def test_unwatched_patch_pauses_and_carries_on_when_asked_again(self):
        svc = self.service()
        pid = svc.request(10.0, 10.0, 12)["id"]
        p = svc.patches[pid]
        self.gate.clear()
        th = threading.Thread(target=svc._runner, daemon=True)
        th.start()
        for _ in range(200):
            if p.snapshot()["state"] in ("first", "rest"):
                break
            time.sleep(0.01)
        p.last_seen -= live.WATCH_SECS + 1                   # the page aimed elsewhere
        p.grace = 0
        self.gate.set()
        for _ in range(300):
            if p.snapshot()["state"] == "paused":
                break
            time.sleep(0.01)
        st = p.snapshot()
        self.assertEqual(st["state"], "paused")
        self.assertLess(len(self.downloads), 24)             # it stopped before the whole plan
        self.assertLessEqual(len(self.downloads), live.pb.MAX_CONCURRENT)  # only those under way
        self.assertIsNone(st["full"])
        n = len(self.downloads)
        time.sleep(0.2)
        self.assertEqual(len(self.downloads), n)              # nothing more while nobody watches
        self.assertEqual(svc.status(pid)["state"], "queued")  # the page is back
        for _ in range(500):
            if p.snapshot()["state"] == "ready":
                break
            time.sleep(0.01)
        st = p.snapshot()
        self.assertEqual(st["state"], "ready")
        self.assertTrue((self.root / pid / "full" / "frames.json").exists())
        self.assertEqual(svc.covering(10.0, 10.0, 6), pid)    # indexed for reuse
        doc = json.loads((self.root / pid / "full" / "frames.json").read_text())
        self.assertFalse(doc["live"]["ahead"])
        self.assertIn("asked for in the viewer", doc["catalogue"]["from"])

    def test_seed_patch_says_it_was_fetched_ahead(self):
        svc = self.service()
        pid = svc.request(20.0, 10.0, 12, klass="seed")["id"]
        p = svc.patches[pid]
        p.last_seen -= live.WATCH_SECS + 1                   # nobody watches: it still runs
        threading.Thread(target=svc._runner, daemon=True).start()
        for _ in range(500):
            if p.snapshot()["state"] == "ready":
                break
            time.sleep(0.01)
        self.assertEqual(p.snapshot()["state"], "ready")
        self.assertEqual(len(self.downloads), 24)
        doc = json.loads((self.root / pid / "full" / "frames.json").read_text())
        self.assertTrue(doc["live"]["ahead"])
        self.assertIn("chosen ahead of time", doc["catalogue"]["from"])
        st = json.loads((self.root / pid / "status.json").read_text())
        self.assertTrue(st["ahead"])


class TestCacheHeaders(TestServer):
    def test_finished_files_are_immutable(self):
        st = self.wait_ready("ra=217.429&dec=-62.68&fov=12")
        code, headers, _ = self.get(st["full"] + "frames.json")
        self.assertEqual(code, 200)
        self.assertIn("immutable", headers["Cache-Control"])
        code, headers, _ = self.get("/api/patch/" + st["id"])
        self.assertEqual(headers["Cache-Control"], "no-store")
        counts = json.loads(self.get("/api/health")[2])["counts"]
        self.assertGreaterEqual(counts["started"], 1)


if __name__ == "__main__":
    unittest.main()
