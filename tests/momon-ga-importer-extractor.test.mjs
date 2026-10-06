import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const fixture = fs.readFileSync(new URL('./fixtures/momon-ga-detail.html', import.meta.url), 'utf8');
const sourceUrl = 'https://momon-ga.com/fanzine/mo1277143/';
const script = fs.readFileSync(new URL('../extensions/momon-ga-importer/extractor.js', import.meta.url), 'utf8');
const context = { self: {}, URL };
vm.runInNewContext(script, context);

// The fixture is deliberately small enough for this dependency-free DOM adapter.
// Extraction still receives ordinary querySelector/querySelectorAll, textContent,
// and getAttribute interfaces; no HTML parsing exists in production code.
function parseFixture(html) {
  const root = { tag: 'root', attributes: {}, children: [], text: '' };
  const stack = [root];
  for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
    if (token.startsWith('</')) { stack.pop(); continue; }
    if (token.startsWith('<!')) continue;
    if (token.startsWith('<')) {
      const tag = /^<([\w-]+)/.exec(token)?.[1]?.toLowerCase();
      if (!tag) continue;
      const attributes = Object.fromEntries([...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value]));
      const node = { tag, attributes, children: [], text: '' };
      stack.at(-1).children.push(node);
      if (!token.endsWith('/>') && !['img', 'link', 'meta', 'br'].includes(tag)) stack.push(node);
    } else stack.at(-1).text += token;
  }
  function descendants(node) { return node.children.flatMap(child => [child, ...descendants(child)]); }
  function matches(node, selector) {
    if (selector.startsWith('#')) return node.attributes.id === selector.slice(1);
    if (selector.startsWith('.')) return node.attributes.class?.split(/\s+/).includes(selector.slice(1));
    if (selector === 'link[rel="canonical"]') return node.tag === 'link' && node.attributes.rel === 'canonical';
    return node.tag === selector;
  }
  function decorate(node) {
    Object.defineProperties(node, {
      textContent: { get: () => node.text + node.children.map(child => child.textContent).join('') },
      querySelectorAll: { value(selector) {
        let matchesSoFar = [node];
        for (const part of selector.split(/\s+/)) matchesSoFar = matchesSoFar.flatMap(parent => descendants(parent).filter(child => matches(child, part)));
        return matchesSoFar;
      } },
      querySelector: { value(selector) { return node.querySelectorAll(selector)[0] || null; } },
      getAttribute: { value(name) { return node.attributes[name] ?? null; } },
    });
    node.children.forEach(decorate);
  }
  decorate(root);
  return root;
}

function extract(html = fixture, pageUrl = sourceUrl) {
  return context.self.MomonGaExtractor.extract(parseFixture(html), pageUrl);
}

test('extracts the supplied work and all 26 gallery pages in DOM order', () => {
  const { candidate, errors } = extract();
  assert.deepEqual(Array.from(errors), []);
  assert.equal(candidate.schemaVersion, 1);
  assert.equal(candidate.title, 'あの子は嘘つき娘');
  assert.equal(candidate.author, 'いちはや');
  assert.equal(candidate.circleName, 'squeezecandyheaven');
  assert.equal(candidate.sourceWork, 'オリジナル');
  assert.equal(candidate.sourceUrl, sourceUrl);
  assert.deepEqual(Array.from(candidate.tags), ['C94', 'fingering', 'incest', 'lolicon', 'niece', 'schoolgirl uniform', 'sole female', 'sole male']);
  assert.deepEqual(Array.from(candidate.pages), Array.from({ length: 26 }, (_, index) => `https://z2.momon-ga.me/galleries/1277143/${index + 1}.webp`));
  assert.equal(candidate.fallbackPagePattern, null);
});

test('missing metadata reports errors and keeps image pages intact for correction', () => {
  const html = fixture.replace(/<div id="post-tag">[\s\S]*?<\/div>\s*<div id="post-hentai">/, '<div id="post-hentai">');
  const { candidate, errors } = extract(html);
  assert.ok(errors.length);
  assert.equal(candidate.author, '');
  assert.equal(candidate.pages.length, 26);
});

test('invalid canonical falls back to normalized page URL while retaining identity query', () => {
  const html = fixture.replace(sourceUrl, 'https://other.example/fanzine/mo1277143/');
  const { candidate, errors } = extract(html, `${sourceUrl}?id=42&utm_source=feed&fbclid=tracker#section`);
  assert.deepEqual(Array.from(errors), []);
  assert.equal(candidate.sourceUrl, `${sourceUrl}?id=42`);
});

test('valid canonical is preferred and normalized', () => {
  const html = fixture.replace(sourceUrl, `${sourceUrl}?work=7&utm_campaign=mail#top`);
  const { candidate, errors } = extract(html, 'https://momon-ga.com/fanzine/mo8888/');
  assert.deepEqual(Array.from(errors), []);
  assert.equal(candidate.sourceUrl, `${sourceUrl}?work=7`);
});

test('duplicate content tags are kept once in DOM order', () => {
  const html = fixture.replace('>C94</a>', '>C94</a><a href="/tag/c94/" rel="tag">C94</a>');
  const { candidate, errors } = extract(html);
  assert.deepEqual(Array.from(errors), []);
  assert.deepEqual(Array.from(candidate.tags), ['C94', 'fingering', 'incest', 'lolicon', 'niece', 'schoolgirl uniform', 'sole female', 'sole male']);
});

test('multiple authors report a row error while retaining pages for review', () => {
  const html = fixture.replace('>いちはや</a>', '>いちはや</a><a href="/cartoonist/other/" rel="tag">別作者</a>');
  const { candidate, errors } = extract(html);
  assert.ok(errors.some(message => /複数.*作者/.test(message)));
  assert.equal(candidate.author, 'いちはや');
  assert.equal(candidate.pages.length, 26);
});

const image = page => `https://z2.momon-ga.me/galleries/1277143/${page}.webp`;
for (const [name, mutate] of [
  ['duplicate image URL', html => html.replace(image(2), image(1))],
  ['mixed gallery IDs', html => html.replace(image(2), 'https://z2.momon-ga.me/galleries/8888/2.webp')],
  ['out-of-order page', html => html.replace(image(2), '__SECOND_PAGE__').replace(image(3), image(2)).replace('__SECOND_PAGE__', image(3))],
  ['missing page number', html => html.replace(image(2), 'https://z2.momon-ga.me/galleries/1277143/4.webp')],
  ['untrusted image host', html => html.replace(image(2), 'https://evil-momon-ga.me/galleries/1277143/2.webp')],
]) {
  test(`${name} reports a row error and no importable pages`, () => {
    const { candidate, errors } = extract(mutate(fixture));
    assert.ok(errors.length, name);
    assert.deepEqual(Array.from(candidate.pages), []);
  });
}
