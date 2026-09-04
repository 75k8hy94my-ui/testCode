const KANJI_DIGITS = new Map([['〇',0],['零',0],['一',1],['二',2],['三',3],['四',4],['五',5],['六',6],['七',7],['八',8],['九',9]]);
const SMALL_UNITS = new Map([['十',10],['百',100],['千',1000]]);
const LARGE_UNITS = new Map([['万',10000],['億',100000000],['兆',1000000000000]]);

export function kanjiNumberToArabic(value) {
  const source = String(value ?? '').normalize('NFKC');
  if (/^\d+$/.test(source)) return source;
  if (![...source].every((ch) => KANJI_DIGITS.has(ch) || SMALL_UNITS.has(ch) || LARGE_UNITS.has(ch))) return source;
  if (![...source].some((ch) => SMALL_UNITS.has(ch) || LARGE_UNITS.has(ch))) {
    return [...source].map((ch) => KANJI_DIGITS.get(ch)).join('');
  }
  let total = 0, section = 0, digit = 0;
  for (const ch of source) {
    if (KANJI_DIGITS.has(ch)) { digit = KANJI_DIGITS.get(ch); continue; }
    if (SMALL_UNITS.has(ch)) {
      const unit = SMALL_UNITS.get(ch);
      section += (digit || 1) * unit;
      digit = 0;
      continue;
    }
    if (LARGE_UNITS.has(ch)) {
      section += digit;
      total += (section || 1) * LARGE_UNITS.get(ch);
      section = 0;
      digit = 0;
    }
  }
  return String(total + section + digit);
}

const NUM = '[〇零一二三四五六七八九十百千万億兆0-9０-９]+';
export function normalizeLegalReferences(value) {
  let text = String(value ?? '').normalize('NFKC');
  text = text.replace(new RegExp(`第(${NUM})条((?:の${NUM})*)`, 'g'), (_, base, suffix) => {
    const rest = suffix.replace(new RegExp(`の(${NUM})`, 'g'), (_m, n) => `の${kanjiNumberToArabic(n)}`);
    return `第${kanjiNumberToArabic(base)}条${rest}`;
  });
  text = text.replace(new RegExp(`第(${NUM})(項|号)`, 'g'), (_m, n, unit) => `第${kanjiNumberToArabic(n)}${unit}`);
  return text;
}

function isNode(value) { return value && typeof value === 'object' && typeof value.tag === 'string' && Array.isArray(value.children); }
function childNodes(node, tag) { return isNode(node) ? node.children.filter((c) => isNode(c) && c.tag === tag) : []; }
function extractText(node) {
  if (typeof node === 'string') return node;
  if (!isNode(node) || node.tag === 'Rt') return '';
  return node.children.map(extractText).join('');
}
function walk(node, callback) {
  if (!isNode(node)) return;
  callback(node);
  node.children.forEach((child) => { if (isNode(child)) walk(child, callback); });
}
function cleanCaption(value) {
  return normalizeLegalReferences(String(value ?? '').trim())
    .replace(/^[（(]\s*|\s*[）)]$/g, '')
    .trim();
}
function paragraphText(node) {
  const pieces = node.children
    .filter((child) => !(isNode(child) && (child.tag === 'ParagraphNum' || child.tag === 'ParagraphCaption')))
    .map(extractText)
    .map((v) => normalizeLegalReferences(v).trim())
    .filter(Boolean);
  return pieces.join('\n');
}

export function convertLawTree(root, meta, syncedAt = new Date().toISOString()) {
  const articles = [];
  walk(root, (node) => {
    if (node.tag !== 'Article') return;
    const attrNum = String(node.attr?.Num ?? '').normalize('NFKC');
    const articleTitle = childNodes(node, 'ArticleTitle').map(extractText).join('').trim();
    const normalizedTitle = normalizeLegalReferences(articleTitle || (attrNum ? `第${attrNum}条` : ''));
    const rawCaption = childNodes(node, 'ArticleCaption').map(extractText).join('').trim();
    const caption = rawCaption ? cleanCaption(rawCaption) : '';
    const paragraphs = childNodes(node, 'Paragraph').map((paragraph, index) => {
      const rawNum = String(paragraph.attr?.Num ?? index + 1).normalize('NFKC');
      return { num: kanjiNumberToArabic(rawNum), text: paragraphText(paragraph) };
    }).filter((paragraph) => paragraph.text);
    if (!paragraphs.length) return;
    const num = attrNum ? kanjiNumberToArabic(attrNum) : normalizedTitle.replace(/^第|条.*$/g, '');
    articles.push({
      key: `Article_${num || articles.length + 1}`,
      num: num || String(articles.length + 1),
      number: normalizedTitle || `第${num}条`,
      caption,
      paragraphs,
      bodyText: paragraphs.map((paragraph) => paragraph.text).join('\n')
    });
  });
  return {
    schemaVersion: 1,
    lawId: meta.id,
    lawName: meta.name,
    lawNumber: meta.lawNumber || '',
    source: 'e-Gov 法令API v2',
    syncedAt,
    articles
  };
}

export function createMetadata(laws, syncedAt = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    lastSyncedAt: syncedAt,
    laws: Object.fromEntries(laws.map((law) => [law.lawId, { syncedAt, articleCount: law.articles.length }]))
  };
}
