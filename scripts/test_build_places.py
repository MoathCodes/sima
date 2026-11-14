"""Unit checks are offline. --live independently rechecks 30 SIMBAD positions."""
import json
import math
import random
import re
from bs4 import BeautifulSoup
import sys
import unittest
import build_places as b

class Parsing(unittest.TestCase):
    def test_distance_median_not_midrange(self):
        d=b.distance_middle([{"distance":x,"unit":"pc"} for x in [1,2,9]])
        self.assertAlmostEqual(d["ly"],6.523,places=3)
        self.assertTrue(d["disagree"])
        self.assertEqual(d["measurements"],3)

    def test_even_and_mixed_units(self):
        d=b.distance_middle([{"distance":1000,"unit":"pc"},{"distance":2,"unit":"kpc"}])
        self.assertAlmostEqual(d["ly"],1500*3.261563777,places=3)

    def test_distance_missing(self):
        self.assertIsNone(b.distance_middle([{"distance":None,"unit":"pc"},{"distance":-1,"unit":"pc"},
                                             {"distance":4,"unit":"unknown"}]))

    def test_distance_disagreement_boundary(self):
        self.assertFalse(b.distance_middle([{"distance":100,"unit":"pc"}])["disagree"])

    def test_numbers(self):
        for value in ["",None,"NaN","inf","--"]:
            self.assertIsNone(b.number(value))
        self.assertEqual(b.number("2.5"),2.5)

    def test_variable_kind_does_not_infer_variability_from_emission(self):
        for otype in ["Be*","Y*O","Ae*"]:
            self.assertEqual(b.kind_of({"otype":otype}),"star")
        for otype in ["bC*","cC*","a2*","El*","gD*","WV*"]:
            self.assertEqual(b.kind_of({"otype":otype}),"variable-star")

    def test_bad_magnitude(self):
        for value in ["",None,-99,99,"nan"]:
            self.assertIsNone(b.valid_magnitude(value,"V"))
        self.assertEqual(b.valid_magnitude(-1.46,"V"),-1.46)
        self.assertEqual(b.valid_magnitude(0,"V"),0)

    def test_galaxy_shapes(self):
        for h in ["S0","SA0","Irr",""]:
            self.assertEqual(b.galaxy_kind(h),"galaxy")
        for h in ["Sb","SABc","SBb","Scd","SAc"]:
            self.assertEqual(b.galaxy_kind(h),"spiral-galaxy")
        for h in ["E","E3","cD"]:
            self.assertEqual(b.galaxy_kind(h),"elliptical-galaxy")

    def test_ngc_identifier(self):
        self.assertEqual(b.ngc_name("NGC0459"),"NGC 459")
        self.assertEqual(b.ngc_name("IC0010"),"IC 10")

    def test_wgsn_columns(self):
        row="Aldebaran         Aldebaran         HR 1457      alf   α     Tau _    04359+1631  0.87  V  21421  29139  68.980163  16.509302 2016-06-30 "
        self.assertEqual(b.parse_wgsn(row)[0]["name"],"Aldebaran")
        self.assertAlmostEqual(b.parse_wgsn(row)[0]["dec"],16.509302)

    def test_short_lead_keeps_subject(self):
        content = BeautifulSoup('<div><p>Polaris is the North Star.</p><p>It is bright. It is nearby.</p></div>', 'html.parser').div
        self.assertEqual(b.introduction(content), 'Polaris is the North Star. It is bright.')
        for pronoun in ['It', 'This', 'They', 'These']:
            self.assertIsNone(b.introduction(BeautifulSoup(f'<div><p>{pronoun} is bright.</p></div>', 'html.parser').div))

    def test_combined_cluster_nebula_uses_simbad(self):
        for otype, kind in [('HII','emission-nebula'), ('RNe','reflection-nebula'), ('OpC','open-cluster'), ('Cl*','open-cluster')]:
            self.assertEqual(b.kind_of({'otype':otype}, {'Type':'Cl+N'}), kind)
        self.assertEqual(b.kind_of({'otype':'OpC'}, {'Type':'Neb'}), 'emission-nebula')

    def test_arabic_identification_links(self):
        html = '<table class="wikitable"><tr><td><a title="Suhail (star)">Alsuhail</a></td><td>Suhayl</td><td>Glorious</td><td>سهيل</td><td>سّهَيْل</td><td>any of: <a title="Canopus">Canopus</a>, <a title="Lambda Velorum">Lambda Velorum</a></td></tr></table>'
        rows = b.parse_arabic(html)
        self.assertEqual(rows['suhail'], rows['canopus'])
        self.assertEqual(rows['canopus']['transliteration'], 'Suhayl; Suhail')
        self.assertEqual(rows['canopus'], rows['alsuhail'])

    def test_arabic_rowspan(self):
        html='<table class="wikitable"><tr><td>A</td><td rowspan="2">trans</td><td rowspan="2">meaning</td><td rowspan="2">ع</td><td rowspan="2">ع</td><td>one</td></tr><tr><td>B</td><td>two</td></tr></table>'
        rows=b.parse_arabic(html)
        self.assertEqual(rows["a"],rows["b"])

class Catalogue(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((b.ROOT/"src/data/places.json").read_text())
        cls.places=cls.data["places"]

    def test_size_and_kinds(self):
        self.assertGreaterEqual(len(self.places),2289)
        self.assertEqual(set(p["kind"] for p in self.places),set(b.KINDS))
        self.assertEqual(len(b.KINDS),15)
        self.assertEqual(len({p["id"] for p in self.places}),len(self.places))
        self.assertLessEqual(sum(p["tier"]==0 for p in self.places),45)

    def test_required_targets(self):
        self.assertTrue(set(b.TARGETS.values()) <= {p["id"] for p in self.places})

    def test_search_data(self):
        text=json.dumps([p["names"] for p in self.places],ensure_ascii=False).casefold().replace(" ","")
        for term in ["shepherd","الدبران","m104"]:
            self.assertIn(term,text)

    def test_all_texts_keep_subject(self):
        for p in self.places:
            self.assertIsNone(re.match(r'^(It|Its|This|That|They|Their|These|Those|He|She)\b', p.get('text',''), re.I), p['id'])
        polaris = next(p for p in self.places if p['names'].get('common') == 'Polaris')
        self.assertTrue(polaris['text'].startswith('Polaris'))

    def test_famous_nebulae_and_clusters(self):
        for alias in ['M 8','M 16','M 17','M 20','M 42','M 43','NGC 2070','M 44','M 45']:
            p = next(p for p in self.places if alias in p['names']['catalogue'])
            self.assertEqual(p['kind'], 'open-cluster' if alias in ['M 44','M 45'] else 'emission-nebula', alias)

    def test_star_transliterations(self):
        for common, terms in [('Canopus',['Suhail','Suhayl']), ('Aldebaran',['ad-Dabarān']), ('Vega',['an-Nisr']), ('Altair',['an-Nisr'])]:
            p = next(p for p in self.places if p['names'].get('common') == common)
            for term in terms:
                self.assertIn(term, p['names']['transliteration'])
            self.assertEqual(p['sources']['transliteration'], [3])

    def test_sombrero_snapshot(self):
        p=next(p for p in self.places if "M 104" in p["names"]["catalogue"])
        self.assertAlmostEqual(p["distance"]["ly"]/1e6,36.76,places=2)
        self.assertAlmostEqual(p["distance"]["low"]/1e6,28.02,places=2)
        self.assertAlmostEqual(p["distance"]["high"]/1e6,70.78,places=2)
        self.assertTrue(p["distance"]["disagree"])

    def test_no_unrelated_beehive_text(self):
        p=next(p for p in self.places if "M 44" in p["names"]["catalogue"])
        self.assertNotIn("honey",p.get("text",""))
        self.assertNotEqual(p["names"].get("arabic"),"قفير")

    def test_fact_sources(self):
        for p in self.places:
            self.assertTrue(-90<=p["dec"]<=90 and 0<=p["ra"]<360)
            for fact in ["names","kind","position"]+[k for k in
                ["magnitude","size","distance","morphology","properMotion","text","inSpherex"] if k in p]:
                self.assertTrue(p["sources"].get(fact),(p["id"],fact))
            for fact in ["arabic","meaning","transliteration"]:
                if fact in p["names"]:self.assertTrue(p["sources"].get(fact),(p["id"],fact))
            for refs in p["sources"].values():
                for ref in refs:
                    self.assertTrue(self.data["sources"][ref]["url"].startswith("https://"))

def live_check():
    data=json.loads((b.ROOT/"src/data/places.json").read_text())
    sample=random.Random(20261114).sample(data["places"],30)
    # Different query from the build: main IDs, positions only.
    rows=b.tap("SELECT main_id,ra,dec FROM basic WHERE main_id IN ("+
               b.sql_strings([p["simbad"] for p in sample])+")")
    positions={b.clean(r["main_id"]):r for r in rows}
    worst=0
    for p in sample:
        r=positions[p["simbad"]]
        a,d,x,y=map(math.radians,[p["ra"],p["dec"],r["ra"],r["dec"]])
        h=math.sin((d-y)/2)**2+math.cos(d)*math.cos(y)*math.sin((a-x)/2)**2
        arcsec=math.degrees(2*math.asin(min(1,math.sqrt(h))))*3600
        assert arcsec<=1,(p["id"],arcsec)
        worst=max(worst,arcsec)
    print(f"30/30 SIMBAD positions within 1 arcsecond; largest offset {worst:.6f} arcseconds.")

if __name__=="__main__":
    if "--live" in sys.argv:
        live_check()
    else:unittest.main()
