"""Tests for seed_live.py with the IRSA work stubbed out (no network).

Run: python -m unittest discover -s scripts -p 'test_*.py'
"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import live  # noqa: E402
import prebake as pb  # noqa: E402
import seed_live  # noqa: E402

PLACES = {"places": [
    {"id": "barnard", "ra": 269.452, "dec": 4.693, "tier": 0, "names": {"common": "Barnard's Star"}},
    {"id": "vega", "ra": 279.2347, "dec": 38.7837, "tier": 0, "names": {"common": "Vega"}},
    {"id": "m42", "ra": 83.822, "dec": -5.391, "tier": 1, "size": {"major": 30}},
    {"id": "faint", "ra": 10.0, "dec": 10.0, "tier": 3},
    {"id": "tour-only", "ra": 20.0, "dec": -20.0, "tier": 4, "size": {"major": 2}},
]}
TOURS = "stops: [ { place: 'tour-only', say: [] }, { place: 'vega', say: [] }, { place: 'gone', say: [] } ]"
TARGETS = "export const TARGETS = [\n  {\n    key: 'barnard',\n  },\n];"


class TestSpots(unittest.TestCase):
    def test_tours_first_then_top_tiers_without_shipped_targets(self):
        got = seed_live.spots(PLACES, TOURS, TARGETS)
        self.assertEqual([s["id"] for s in got], ["tour-only", "vega", "m42"])
        self.assertEqual([s["fov"] for s in got], [12, 12, 48])  # 12' at least; M42 asks 39' -> 48'
        self.assertEqual(got[1]["name"], "Vega")
        self.assertEqual((got[1]["ra"], got[1]["dec"]), (279.235, 38.784))  # rounded as the service does

    def test_the_real_lists_parse(self):
        got = seed_live.load_spots()
        ids = [s["id"] for s in got]
        self.assertGreater(len(got), 100)
        self.assertEqual(len(ids), len(set(ids)))
        for key in ("barnard", "wise-0855", "eps-indi-b", "rw-aur", "r-dra"):
            self.assertNotIn(key, ids)
        self.assertTrue(all(s["fov"] in live.FOVS and s["fov"] >= 12 for s in got))


class TestSeedAndExport(unittest.TestCase):
    """Seeds two spots against a stub archive, then exports the static seed."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.saved = live.Patch._run, live.Patch.run_catalog
        asked = self.asked = []

        def fake_run(patch):
            st = patch.snapshot()
            asked.append((st["ra"], st["dec"], st["fov"], patch.klass, pb._Gate._level(pb.current_priority())))
            doc = {"size": live.cutout_size(st["fov"]), "frames": [{}, {}],
                   "catalogue": live.patch_catalogue(st["ra"], st["dec"], st["ahead"]),
                   "live": {"id": patch.id, "step": "full", "fetched": "2026-11-15T03:00:00Z", "found": 9,
                            "windows": 2, "ahead": st["ahead"]}}
            out = patch.dir / "full"
            out.mkdir(parents=True, exist_ok=True)
            (out / "frames.json").write_text(json.dumps(doc))
            (out / "frames.bin.gz").write_bytes(pb.gzip_bytes(b"\0" * 8))
            patch.set(full=f"/api/patch/{patch.id}/full/", state="ready")
            patch.finish()

        live.Patch._run = fake_run

        def fake_catalog(patch):
            patch.dir.mkdir(parents=True, exist_ok=True)
            (patch.dir / "catalog.json").write_text("{}")
            patch.set(catalog=f"/api/patch/{patch.id}/catalog.json")
        live.Patch.run_catalog = fake_catalog

    def tearDown(self):
        live.Patch._run, live.Patch.run_catalog = self.saved
        self.tmp.cleanup()

    def test_seed_one_at_a_time_then_export(self):
        svc = live.Service(self.root / "live")
        todo = [{"id": "vega", "name": "Vega", "ra": 279.235, "dec": 38.784, "fov": 12},
                {"id": "near-vega", "name": "near", "ra": 279.235, "dec": 38.80, "fov": 6},  # 1' away
                {"id": "far", "name": "far", "ra": 100.0, "dec": 0.0, "fov": 12}]
        lines = []
        tally = seed_live.seed(svc, todo, poll=0.01, say=lines.append)
        self.assertEqual(tally, {"ready": 2, "held": 1})
        self.assertEqual(len(self.asked), 2)                      # the nudge reused Vega's patch
        self.assertTrue(all(a[3] == "seed" for a in self.asked))  # seed work, not watched
        self.assertTrue(all(a[4] == pb.SEED for a in self.asked))  # at the lowest priority
        self.assertIn("near-vega", lines[1])

        out = self.root / "seed-out"
        res = seed_live.export(live.Service(self.root / "live", max_running=0), todo, out)
        self.assertEqual((res["patches"], res["spots"], res["missing"]), (2, 3, []))
        index = json.loads((out / "index.json").read_text())
        self.assertEqual(index["version"], 1)
        self.assertEqual(index["releases"], live.releases())
        vega = next(e for e in index["patches"] if "vega" in e["places"])
        self.assertEqual(vega["places"], ["vega", "near-vega"])
        self.assertEqual(vega["fetched"], "2026-11-15T03:00:00Z")
        self.assertEqual((vega["fov"], vega["size"]), (12, live.cutout_size(12)))
        for f in seed_live.FILES:
            self.assertTrue((out / vega["id"] / "full" / f).exists())
        self.assertTrue((out / vega["id"] / "catalog.json").exists())
        doc = json.loads((out / vega["id"] / "full" / "frames.json").read_text())
        self.assertTrue(doc["live"]["ahead"])
        self.assertIn("chosen ahead of time", doc["catalogue"]["from"])

    def test_export_skips_spots_not_fetched(self):
        res = seed_live.export(live.Service(self.root / "live", max_running=0),
                               [{"id": "x", "name": "x", "ra": 1.0, "dec": 1.0, "fov": 12}], self.root / "o")
        self.assertEqual(res, {"patches": 0, "spots": 0, "missing": ["x"]})
        self.assertEqual(json.loads((self.root / "o" / "index.json").read_text())["patches"], [])


if __name__ == "__main__":
    unittest.main()
