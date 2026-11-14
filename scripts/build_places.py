#!/usr/bin/env python3
"""Fetch a sourced, reproducible places catalogue. See docs/places.md."""
from __future__ import annotations
import csv
import hashlib
import io
import json
import math
from pathlib import Path
import re
import statistics
import time
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path.home() / ".cache/sima-rebuild/places"
UA = "sima-sky-viewer/1.0"
TAP = "https://simbad.harvard.edu/simbad/sim-tap/sync"
NGC = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv"
WGSN = "https://www.pas.rochester.edu/~emamajek/WGSN/IAU-CSN.txt"
ARABIC = "https://en.wikipedia.org/wiki/List_of_Arabic_star_names"
SESSION = requests.Session()
SESSION.headers["User-Agent"] = UA
LAST_REQUEST = 0.0

def fetch(url, params=None):
    global LAST_REQUEST
    key = hashlib.sha256((url + json.dumps(params, sort_keys=True)).encode()).hexdigest()
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / (key + ".raw")
    if path.exists():
        return path.read_text()
    missing = CACHE / (key + ".missing")
    if missing.exists():
        response = requests.Response()
        response.status_code = 404
        raise requests.HTTPError("Cached missing page: "+url, response=response)
    for attempt in range(4):
        time.sleep(max(0, 1.2 - (time.monotonic() - LAST_REQUEST)))
        LAST_REQUEST = time.monotonic()
        try:
            r = SESSION.get(url, params=params, timeout=180)
            if r.status_code == 404:
                missing.write_text(url)
                r.raise_for_status()
            r.raise_for_status()
            r.encoding = "utf-8"
            value = r.text
            path.write_text(value)
            (CACHE / (key + ".request.json")).write_text(json.dumps({"url":url,"params":params}, indent=2))
            return value
        except requests.RequestException as exc:
            if isinstance(exc, requests.HTTPError) and exc.response.status_code < 500 and exc.response.status_code != 429:
                raise
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))

def tap(query):
    data = json.loads(fetch(TAP, {"request":"doQuery","lang":"adql","format":"json","query":query}))
    return [dict(zip([m["name"] for m in data["metadata"]], row)) for row in data["data"]]

def number(value):
    try:
        n = float(value)
        return n if math.isfinite(n) else None
    except (TypeError, ValueError):
        return None

def distance_middle(rows):
    """Median of positive listed distances, in light-years; extremes are not errors."""
    values = []
    for row in rows:
        n = number(row.get("distance"))
        scale = {"pc":3.261563777, "kpc":3261.563777, "Mpc":3261563.777}.get(row.get("unit"))
        if n is not None and n > 0 and scale:
            values.append(n * scale)
    if not values:
        return None
    middle = statistics.median(values)
    return {"ly":round(middle, 3), "low":round(min(values), 3), "high":round(max(values), 3),
            "disagree":(max(values)-min(values))/middle > .3, "measurements":len(values)}

def clean(value):
    return re.sub(r"\s+", " ", re.sub(r"\[\s*\d+\s*\]", "", value or "")).strip()

def source(name, url):
    return {"name":name, "url":url}

KINDS = {
 "star":"Star", "nearby-star":"Nearby star", "fast-star":"Fast-moving star",
 "brown-dwarf":"Brown dwarf", "variable-star":"Changing star",
 "open-cluster":"Open star cluster", "globular-cluster":"Globular star cluster",
 "emission-nebula":"Glowing gas cloud", "reflection-nebula":"Cloud reflecting starlight",
 "dark-nebula":"Dark dust cloud", "planetary-nebula":"Shell shed by a dying star",
 "supernova-remnant":"Remains of an exploded star", "spiral-galaxy":"Spiral galaxy",
 "elliptical-galaxy":"Elliptical galaxy", "galaxy":"Galaxy",
}
FIELDS = "b.oid,b.main_id,b.ra,b.dec,b.otype,b.pmra,b.pmdec,b.plx_value,b.sp_type,b.nbref,f.V,f.K"
TARGETS = {"NAME Barnard's star":"barnard", "* eps Ind B":"eps-indi-b",
 "WISE J085510.83-071442.5":"wise-0855", "V* RW Aur":"rw-aur", "V* R Dra":"r-dra"}

def sql_strings(items):
    return ",".join("'"+s.replace("'", "''")+"'" for s in items)

def parse_wgsn(text):
    rows = []
    for line in text.splitlines():
        if not line or line[0] in "#$":
            continue
        a = line.split()
        if len(a) < 16 or not re.search(r"\d{4}-\d\d-\d\d", line):
            continue
        # Fixed-width columns are defined by the file's own header.
        idx = next(i for i, x in enumerate(a) if re.fullmatch(r"\d{4}-\d\d-\d\d", x))
        rows.append({"name":line[:18].strip(), "ra":float(a[idx-2]),
                     "dec":float(a[idx-1])})
    return rows

def parse_arabic(text):
    soup = BeautifulSoup(text, "html.parser")
    output, identified = {}, {}
    for table in soup.select("table.wikitable"):
        spans = {}
        for tr in table.select("tr"):
            cells, col = [], 0
            for td in tr.find_all(["th", "td"], recursive=False):
                while col in spans:
                    value, count = spans[col]
                    cells.append(value)
                    if count == 1: del spans[col]
                    else: spans[col] = (value, count-1)
                    col += 1
                value = clean(td.get_text(" ", strip=True))
                cells.append(value)
                if int(td.get("rowspan", 1)) > 1:
                    spans[col] = (value, int(td["rowspan"])-1)
                col += 1
            if len(cells) >= 5 and cells[0] != "Common name":
                facts = {"transliteration":cells[1], "meaning":cells[2], "arabic":cells[3]}
                # Link titles retain sourced spellings such as Suhail (star).
                first = tr.find(["th", "td"])
                variants = [re.sub(r" \(star\)$", "", a["title"])
                            for a in first.select('a[title$=" (star)"]')]
                if variants:
                    facts["transliteration"] = "; ".join(dict.fromkeys([cells[1]] + variants))
                for variant in variants:
                    identified.setdefault(variant.casefold(), facts)
                output[cells[0].casefold()] = facts
                # Some historical names identify several stars in the last column.
                # Match those exact linked names too; direct common-name rows win.
                last = tr.find_all(["th", "td"], recursive=False)[-1]
                for a in last.select("a[title]"):
                    identified.setdefault(a["title"].casefold(), facts)
    return identified | output

def ngc_name(s):
    return re.sub(r"^(NGC|IC)0*(\d+)", lambda m:m[1]+" "+str(int(m[2])), s)

def galaxy_kind(hubble):
    h = hubble.strip()
    if re.match(r"^(S[A-B]?|SAB)[abcdm]",h) or re.match(r"^S[abcdm]",h):
        return "spiral-galaxy"
    if re.match(r"^E[0-7+?: -]*$",h) or h.startswith("cD"):
        return "elliptical-galaxy"
    return "galaxy"

def kind_of(row, ngc=None):
    if ngc:
        t = ngc["Type"]
        if t == "G":return galaxy_kind(ngc["Hubble"])
        # Cl+N contains both a cluster and nebulosity. Let SIMBAD distinguish
        # a nebula record from its embedded cluster instead of forcing OCl.
        if t == "Cl+N" and row["otype"].strip() in {"HII","EmO","ISM","SFR","MoC","RNe"}:
            return kind_of(row)
        mapping = {"OCl":"open-cluster","GCl":"globular-cluster","Cl+N":"open-cluster",
                   "HII":"emission-nebula","EmN":"emission-nebula","Neb":"emission-nebula",
                   "RfN":"reflection-nebula","DrkN":"dark-nebula","PN":"planetary-nebula",
                   "SNR":"supernova-remnant"}
        if t in mapping:return mapping[t]
    t = row["otype"].strip()
    if t in {"BD*","BD?"}:return "brown-dwarf"
    if t in {"OpC","Cl*","As*"}:return "open-cluster"
    if t == "GlC":return "globular-cluster"
    if t in {"HII","EmO","ISM","SFR","MoC"}:return "emission-nebula"
    if t == "RNe":return "reflection-nebula"
    if t == "DNe":return "dark-nebula"
    if t == "PN":return "planetary-nebula"
    if t == "SNR":return "supernova-remnant"
    if t in {"G","LIN","Sy1","Sy2","AGN","QSO","Bla","GiG","GiP","rG","H2G","SBG","EmG"}:
        return "galaxy"
    if t in {"V*","Mi*","LP*","RR*","Ce*","dS*","Or*","TT*","EB*","Er*","BY*","RS*","Pu*","Ro*","Ir*","bC*","cC*","a2*","El*","gD*","WV*"}:
        return "variable-star"
    if math.hypot(number(row.get("pmra")) or 0, number(row.get("pmdec")) or 0) > 1000:
        return "fast-star"
    if (number(row.get("plx_value")) or 0) >= 100:
        return "nearby-star"
    return "star"

def valid_magnitude(v, band):
    n = number(v)
    return n if n is not None and -5 <= n <= 30 else None

def resolve(names):
    output = {}
    original = {clean(candidate):n for n in names for candidate in (n, "NAME "+n)}
    names = sorted(original)
    for i in range(0,len(names),120):
        query = ("SELECT "+FIELDS+",i.id FROM ident i JOIN basic b ON i.oidref=b.oid "
                 "LEFT JOIN allfluxes f ON f.oidref=b.oid WHERE i.id IN ("+sql_strings(names[i:i+120])+")")
        for row in tap(query):
            output[original[clean(row["id"])]] = row
    return output

def build():
    arabic = parse_arabic(fetch(ARABIC))
    wgsn = parse_wgsn(fetch(WGSN))
    ngc = list(csv.DictReader(io.StringIO(fetch(NGC)), delimiter=";"))
    allowed = {"G","OCl","GCl","Cl+N","HII","EmN","Neb","RfN","DrkN","PN","SNR"}
    ngc = [r for r in ngc if r["Type"] in allowed]
    ngc.sort(key=lambda r:(not bool(r["M"]),not bool(r["Common names"]),
             number(r["V-Mag"]) or number(r["B-Mag"]) or 99,r["Name"]))
    # Include rare cloud kinds, not only the many bright galaxies.
    chosen = {r["Name"]:r for r in ngc[:1550]}
    for r in ngc:
        if r["Type"] in {"RfN","DrkN","SNR"}:chosen[r["Name"]] = r
    names = [ngc_name(n) for n in sorted(chosen)] + ["M 45"] + list(TARGETS)
    # Official names resolve through SIMBAD, so all shipped positions share one frame.
    names += [r["name"] for r in wgsn]
    resolved = resolve(names)
    rows = {r["oid"]:r for r in resolved.values()}
    bright = tap("SELECT TOP 1000 "+FIELDS+" FROM basic b JOIN allfluxes f ON b.oid=f.oidref "
                 "WHERE f.V < 6.5 AND f.V > -5 ORDER BY V,oid")
    for condition, limit in [("b.otype='BD*'",100),
            ("b.plx_value>100",100),("(b.pmra*b.pmra+b.pmdec*b.pmdec)>1000000",100),
            ("b.otype IN ('Mi*','TT*','Ce*','RR*')",100),("b.otype='DNe'",30)]:
        bright += tap("SELECT TOP "+str(limit)+" "+FIELDS+" FROM basic b LEFT JOIN allfluxes f ON b.oid=f.oidref WHERE "+condition+" ORDER BY nbref DESC,oid")
    rows.update({r["oid"]:r for r in bright if r["ra"] is not None and r["dec"] is not None})
    by_ngc = {resolved[ngc_name(n)]["oid"]:r for n,r in chosen.items() if ngc_name(n) in resolved}
    by_wgsn = {resolved[r["name"]]["oid"]:r for r in wgsn if r["name"] in resolved}
    target_ids = {resolved[n]["oid"]:key for n,key in TARGETS.items() if n in resolved}
    if len(target_ids) != 5:raise ValueError("A required target did not resolve: "+str(set(TARGETS)-set(resolved)))
    ids, distances = {}, {}
    oids = sorted(rows)
    for i in range(0,len(oids),300):
        group = ",".join(map(str,oids[i:i+300]))
        for r in tap("SELECT oidref,ids FROM ids WHERE oidref IN ("+group+")"):
            ids[r["oidref"]] = r["ids"].split("|")
        for r in tap("SELECT oidref,dist,unit,bibcode FROM mesDistance WHERE oidref IN ("+group+")"):
            distances.setdefault(r["oidref"],[]).append({"distance":r["dist"],"unit":(r["unit"] or "").strip()})
    sources = [source("SIMBAD (CDS)", "https://simbad.harvard.edu/simbad/"),
        source("OpenNGC (CC BY-SA 4.0)", "https://github.com/mattiaverga/OpenNGC"),
        source("IAU WGSN (CC BY)",WGSN),
        source("Wikipedia: Arabic star names (CC BY-SA 4.0)",ARABIC)]
    places=[]
    for oid,r in sorted(rows.items()):
        if r["ra"] is None or r["dec"] is None:continue
        n = by_ngc.get(oid)
        official = by_wgsn.get(oid)
        aliases = [clean(x) for x in ids.get(oid,[]) if x.startswith(("NAME ","M ","NGC ","IC ","HD ","HIP ","* ","V* ","GJ ","WISE "))]
        common = official["name"] if official else None
        if n and n["Common names"]:common=n["Common names"].split(",")[0]
        if not common:
            common=next((a[5:] for a in aliases if a.startswith("NAME ")),None)
        if n and n["M"]:
            aliases.append("M "+str(int(n["M"])))
        aliases=[re.sub(r"^(NAME |V\* |\* )","",a) for a in aliases]
        if oid in target_ids:
            common = {"barnard":"Barnard's Star","eps-indi-b":"Epsilon Indi B",
                      "wise-0855":"WISE 0855−0714","rw-aur":"RW Aurigae",
                      "r-dra":"R Draconis"}[target_ids[oid]]
        names_obj={"catalogue":sorted(set(aliases + [clean(r["main_id"])]))}
        if common:names_obj["common"]=common
        a = arabic.get((common or "").casefold())
        if a:names_obj.update({k:v for k,v in a.items() if v})
        kind=kind_of(r,n)
        p={"id":target_ids.get(oid,"simbad-"+str(oid)), "simbad":clean(r["main_id"]),
           "names":names_obj,"kind":kind,"ra":round(r["ra"],8),"dec":round(r["dec"],8),
           "tier":4,"sources":{"names":[0],"kind":([0,1] if n and n["Type"] == "Cl+N" else [1 if n else 0]),"position":[0]}}
        if official:p["sources"]["names"].append(2)
        if n:p["sources"]["names"].append(1)
        if a:
            for k in a:p["sources"][k]=[3]
        for band,val,src in [("V",n["V-Mag"] if n else r.get("V"),1 if n else 0),
                             ("K",r.get("K"),0)]:
            mag=valid_magnitude(val,band)
            if mag is not None:
                p["magnitude"]={"value":mag,"band":band};p["sources"]["magnitude"]=[src];break
        if n and number(n["MajAx"]) and float(n["MajAx"])>0:
            p["size"]={"major":float(n["MajAx"]),"unit":"arcmin"}
            if number(n["MinAx"]):p["size"]["minor"]=float(n["MinAx"])
            p["sources"]["size"]=[1]
        if n and n["Hubble"]:
            p["morphology"]=n["Hubble"];p["sources"]["morphology"]=[1]
        if r.get("pmra") is not None and r.get("pmdec") is not None:
            p["properMotion"]={"ra":r["pmra"],"dec":r["pmdec"]}
            p["sources"]["properMotion"]=[0]
            motion=math.hypot(r["pmra"],r["pmdec"])/1000
            if motion >= 1:
                p["inSpherex"]=f"Catalogue motion: {motion:.2f}″ per year. Compare dates to check for movement; this is not a SPHEREx measurement."
                p["sources"]["inSpherex"]=[0]
        d=distance_middle(distances.get(oid,[]))
        if d:p["distance"]=d;p["sources"]["distance"]=[0]
        if n and n["M"]:p["tier"]=1
        elif common:p["tier"]=2
        elif (p.get("magnitude",{}).get("value",99)<5):p["tier"]=3
        if oid in target_ids:p["tier"]=1
        places.append(p)
    # Editorial ranking affects dots only; no scientific fact is inferred from it.
    famous = "Sirius Canopus Arcturus Vega Capella Rigel Procyon Betelgeuse Achernar Hadar Altair Aldebaran Antares Spica Pollux Fomalhaut Deneb Regulus Polaris".split()
    famous_m = {1,13,16,27,31,33,42,44,45,51,57,63,64,81,82,87,101,104}
    top = [p for p in places if p["names"].get("common") in famous or
           any(re.fullmatch(r"M\s*("+ "|".join(map(str,sorted(famous_m)))+")",a) for a in p["names"]["catalogue"]) or p["id"] in target_ids.values()]
    for p in top[:42]:p["tier"]=0
    enrich(places,sources)
    places.sort(key=lambda p:(p["tier"],p["id"]))
    if len(places)<2289:raise ValueError(f"Only {len(places)} places")
    if set(p["kind"] for p in places)!=set(KINDS):raise ValueError("Missing kinds: "+str(set(KINDS)-set(p["kind"] for p in places)))
    data={"version":1,"frame":"ICRS/J2000","kinds":KINDS,"sources":sources,"places":places}
    path=ROOT/"src/data/places.json"
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(data,ensure_ascii=False,separators=(",",":"))+"\n")
    from collections import Counter
    print(len(places),"places;",path.stat().st_size,"bytes")
    print("Kinds:",dict(Counter(p["kind"] for p in places)))
    print("Tiers:",dict(Counter(p["tier"] for p in places)))

def introduction(content):
    # Keep the first prose paragraph even when it is short. Continue into the
    # next paragraph for two sentences, so a pronoun keeps its named subject.
    sentences = []
    for p in content.find_all("p"):
        if p.find_parent("table"):
            continue
        text = clean(p.get_text(" ", strip=True))
        if not text:
            continue
        sentences.extend(re.split(r"(?<=[.!?])\s+", text))
        if len(sentences) >= 2:
            break
    excerpt = " ".join(sentences[:2])
    # Never ship an orphaned pronoun when the source itself lacks a lead.
    if re.match(r"^(It|Its|This|That|They|Their|These|Those|He|She)\b", excerpt, re.I):
        return None
    return excerpt or None

def enrich(places,sources):
    # Only exact article titles from named entries; never fuzzy-join sky objects.
    selected = [p for p in places if p["tier"] == 0]
    selected += [p for p in places if p["id"] in TARGETS.values() and p not in selected]
    for p in selected:
        title = p["names"].get("common")
        if not title:
            title = {"barnard":"Barnard's Star","eps-indi-b":"Epsilon Indi B",
                     "wise-0855":"WISE 0855−0714","rw-aur":"RW Aurigae","r-dra":"R Draconis"}.get(p["id"])
        if not title:continue
        url = "https://simple.wikipedia.org/wiki/"+quote(title.replace(" ","_"))
        try:
            html = fetch(url)
            soup = BeautifulSoup(html,"html.parser")
            content = soup.select_one(".mw-parser-output")
            if not content:continue
            paragraph = introduction(content)
            # An exact word can name an unrelated topic (for example a beehive).
            # Do not attach that topic's text or Wikidata label to a sky object.
            if not paragraph or not re.search(r"\b(star|stars|galaxy|galaxies|nebula|cluster|constellation|brown dwarf)\b",paragraph,re.I):
                print("No astronomical introduction:",title,flush=True)
                continue
            if paragraph:
                p["text"] = paragraph
                idx=len(sources)
                sources.append(source("Simple English Wikipedia (CC BY-SA 4.0)",url))
                p["sources"]["text"]=[idx]
            # Page-linked Wikidata identity supplies the Arabic label.
            link=soup.select_one('a[href*="wikidata.org/wiki/Special:EntityPage/"]')
            if link:
                entity=link["href"].split("#")[0].rstrip("/").split("/")[-1]
                wdurl="https://www.wikidata.org/wiki/Special:EntityData/"+entity+".json"
                data=json.loads(fetch(wdurl))["entities"][entity]
                ar=data.get("labels",{}).get("ar",{}).get("value")
                if ar and not p["names"].get("arabic"):
                    p["names"]["arabic"]=ar
                    idx=len(sources)
                    sources.append(source("Wikidata (CC0)","https://www.wikidata.org/wiki/"+entity))
                    p["sources"]["arabic"]=[idx]
        except requests.HTTPError as e:
            if e.response.status_code != 404:raise
            print("No Simple English article:",title,flush=True)

if __name__ == "__main__":
    build()
