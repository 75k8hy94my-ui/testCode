#!/usr/bin/env python3
"""Embed official ArticleCaption values into statutes-data/*.json at build time.

The browser never contacts e-Gov. Existing law body text and chapter fields stay intact.
"""
import json
import pathlib
import re
import time
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1] / "statutes-data"
FW = str.maketrans("0123456789", "０１２３４５６７８９")

def article_key(label):
    raw = label.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    m = re.fullmatch(r"(\d+)条((?:の\d+)*)", raw)
    return (m.group(1) + m.group(2).replace("の", "_")) if m else None

def captions_for_law(law_id):
    url = "https://laws.e-gov.go.jp/api/1/lawdata/" + law_id
    req = urllib.request.Request(url, headers={"User-Agent": "testCode-statute-captions/1.0"})
    with urllib.request.urlopen(req, timeout=100) as response:
        root = ET.fromstring(response.read())
    code = root.findtext("./Result/Code")
    if code != "0":
        raise RuntimeError(f"lawdata {law_id}: response code {code}")
    provision = root.find("./ApplData/LawFullText/Law/LawBody/MainProvision")
    if provision is None:
        raise RuntimeError(f"lawdata {law_id}: missing MainProvision")
    result = {}
    for article in provision.iter("Article"):
        key = article.get("Num")
        caption = article.findtext("ArticleCaption")
        if not key or not caption:
            continue
        caption = caption.strip().removeprefix("（").removesuffix("）").strip()
        if caption:
            result[key] = caption
    return result

def main():
    total = 0
    for path in sorted(ROOT.glob("*.json")):
        data = json.loads(path.read_text(encoding="utf-8"))
        law_id = data.get("id")
        if not law_id:
            raise RuntimeError(f"{path}: missing law ID")
        official = captions_for_law(law_id)
        found = 0
        inherited = ""
        previous_chapter = None
        for row in data["articles"]:
            key = article_key(row[0])
            if key is None:
                # Don't guess a caption for supplementary or irregular numbering.
                continue
            if row[1] != previous_chapter:
                inherited = ""
                previous_chapter = row[1]
            if row[2].strip() == "削除":
                caption = ""
            else:
                direct = official.get(key, "")
                if direct:
                    inherited = direct
                caption = direct or inherited
            if len(row) > 3:
                row[3] = caption
            else:
                row.append(caption)
            if caption:
                found += 1
        path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        total += found
        print(f"{path.name}: {found}/{len(data['articles'])} official captions", flush=True)
        time.sleep(.3)
    print(f"Embedded {total} official article captions.", flush=True)

if __name__ == "__main__":
    main()
