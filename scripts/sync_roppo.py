#!/usr/bin/env python3
import argparse, calendar, json, re, time, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

LAW_CATALOG = {
    '321CONSTITUTION': '日本国憲法',
    '129AC0000000089': '民法',
    '140AC0000000045': '刑法',
    '408AC0000000109': '民事訴訟法',
    '323AC0000000131': '刑事訴訟法',
    '405AC0000000088': '行政手続法',
    '337AC0000000139': '行政事件訴訟法',
    '426AC0000000068': '行政不服審査法',
    '322AC0000000125': '国家賠償法',
    '417AC0000000086': '会社法',
}
KANJI_DIGITS = {'〇':0,'零':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}
KANJI_UNITS = {'十':10,'百':100,'千':1000,'万':10000}
KANJI_NUM_RE = r'[〇零一二三四五六七八九十百千万]+'

def kanji_number_to_int(value: str) -> int:
    if not value:
        raise ValueError('empty kanji number')
    if all(ch in KANJI_DIGITS for ch in value):
        return int(''.join(str(KANJI_DIGITS[ch]) for ch in value))
    total = section = number = 0
    for ch in value:
        if ch in KANJI_DIGITS:
            number = KANJI_DIGITS[ch]
        elif ch == '万':
            section += number
            if section == 0:
                section = 1
            total += section * 10000
            section = number = 0
        else:
            unit = KANJI_UNITS[ch]
            if number == 0:
                number = 1
            section += number * unit
            number = 0
    return total + section + number

def normalize_article_references(text: str) -> str:
    value = str(text or '')
    value = re.sub(rf'第({KANJI_NUM_RE})条', lambda m: f'第{kanji_number_to_int(m.group(1))}条', value)
    value = re.sub(rf'(条の)({KANJI_NUM_RE})', lambda m: f'{m.group(1)}{kanji_number_to_int(m.group(2))}', value)
    value = re.sub(rf'(前|次)({KANJI_NUM_RE})条', lambda m: f'{m.group(1)}{kanji_number_to_int(m.group(2))}条', value)
    return value

def direct_child_text(node, tag):
    child = node.find(tag)
    return ''.join(child.itertext()).strip() if child is not None else ''

def paragraph_text(paragraph):
    chunks = []
    for child in list(paragraph):
        if child.tag == 'ParagraphNum':
            continue
        value = ''.join(child.itertext()).strip()
        if value:
            chunks.append(value)
    return normalize_article_references('\n'.join(chunks))

def parse_law_xml(xml_text: str, law_id: str):
    root = ET.fromstring(xml_text)
    law_name = (root.findtext('.//LawTitle') or LAW_CATALOG.get(law_id, '')).strip()
    law_number = (root.findtext('.//LawNum') or '').strip()
    articles = []
    for index, article in enumerate(root.findall('.//Article')):
        raw_title = direct_child_text(article, 'ArticleTitle') or article.get('Num') or str(index + 1)
        number = normalize_article_references(raw_title)
        caption = direct_child_text(article, 'ArticleCaption')
        paragraphs = []
        for p_index, paragraph in enumerate([c for c in list(article) if c.tag == 'Paragraph']):
            raw_num = (paragraph.get('Num') or direct_child_text(paragraph, 'ParagraphNum') or str(p_index + 1)).strip()
            normalized_num = str(int(raw_num)) if raw_num.isdigit() else str(p_index + 1)
            text = paragraph_text(paragraph)
            if text:
                paragraphs.append({'number': normalized_num, 'text': text})
        if not paragraphs:
            body = normalize_article_references(''.join(article.itertext()).strip())
            if body:
                paragraphs = [{'number': '1', 'text': body}]
        if paragraphs:
            key_num = article.get('Num') or str(index + 1)
            articles.append({'key': f'Article_{key_num}', 'number': number, 'caption': caption, 'paragraphs': paragraphs})
    return {'schemaVersion': 1, 'lawId': law_id, 'lawName': law_name, 'lawNumber': law_number, 'articles': articles}

def add_one_month(dt: datetime) -> datetime:
    year = dt.year + (1 if dt.month == 12 else 0)
    month = 1 if dt.month == 12 else dt.month + 1
    day = min(dt.day, calendar.monthrange(year, month)[1])
    return dt.replace(year=year, month=month, day=day)

def is_stale(last_synced_at: str | None, now: datetime | None = None) -> bool:
    if not last_synced_at:
        return True
    now = now or datetime.now(timezone.utc)
    last = datetime.fromisoformat(last_synced_at.replace('Z', '+00:00'))
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now >= add_one_month(last)

def fetch_xml(law_id: str, attempts: int = 4) -> str:
    url = f'https://laws.e-gov.go.jp/api/1/lawdata/{law_id}'
    last_error = None
    for attempt in range(1, attempts + 1):
        req = urllib.request.Request(url, headers={'User-Agent': 'testCode-roppo-sync/1.0', 'Accept': 'application/xml,text/xml,*/*'})
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                return response.read().decode('utf-8')
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code not in {404, 408, 429, 500, 502, 503, 504} or attempt == attempts:
                raise
        except urllib.error.URLError as error:
            last_error = error
            if attempt == attempts:
                raise
        delay = attempt * 2
        print(f'Retrying {law_id} after {last_error} ({attempt}/{attempts}) in {delay}s...')
        time.sleep(delay)
    raise last_error

def load_metadata(path: Path):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}

def sync(output_dir: Path, force: bool = False) -> bool:
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = output_dir / 'metadata.json'
    metadata = load_metadata(metadata_path)
    now = datetime.now(timezone.utc)
    if not force and not is_stale(metadata.get('lastSyncedAt'), now):
        print(f"Roppo data is fresh: {metadata.get('lastSyncedAt')}")
        return False
    synced_at = now.isoformat().replace('+00:00', 'Z')
    laws_meta = []
    for law_id, fallback_name in LAW_CATALOG.items():
        print(f'Fetching {fallback_name} ({law_id})...')
        parsed = parse_law_xml(fetch_xml(law_id), law_id)
        parsed['syncedAt'] = synced_at
        (output_dir / f'{law_id}.json').write_text(json.dumps(parsed, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
        laws_meta.append({'lawId': law_id, 'lawName': parsed['lawName'], 'articles': len(parsed['articles'])})
    metadata_path.write_text(json.dumps({'schemaVersion': 1, 'lastSyncedAt': synced_at, 'source': 'e-Gov 法令API v1', 'laws': laws_meta}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return True

def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', default='data/roppo')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args(argv)
    changed = sync(Path(args.output_dir), force=args.force)
    print('updated' if changed else 'no update needed')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
