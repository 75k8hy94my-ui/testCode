import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import Data from '../video-data.js';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('existing URL records classify without a storage migration', () => {
  assert.equal(Data.videoEntryKind({ url: 'https://cdn.example.com/clip.mp4?sig=1' }), 'direct');
  assert.equal(Data.videoEntryKind({ url: 'https://example.com/video/111.html' }), 'bookmark');
  assert.equal(Data.videoEntryKind({ url: 'https://www.example.com/v/123' }), 'bookmark');
  assert.equal(Data.videoEntryKind({ a: 'example', b: '123' }), 'bookmark');
  assert.equal(Data.videoEntryKind({ url: 'https://example.com/video/111.html' }, { virtualPublishedEdit: { clips: [] } }), 'direct');
  assert.equal(Data.videoEntryKind({ url: 'javascript:alert(1)' }), 'direct');
  assert.equal(Data.deriveService('https://www.example.com/video/111.html'), 'example.com');
});

test('kind filters combine with visibility and existing search filters', () => {
  const videos = [
    { id: 'direct', url: 'https://cdn.example.com/a.mp4', title: 'Clip' },
    { id: 'bookmark', url: 'https://example.com/video/111.html', title: 'Article' },
    { id: 'hidden', url: 'https://example.com/hide.html', hidden: true, title: 'Hidden' },
    { id: 'published', url: 'https://example.com/player.html', title: 'Edit' },
  ];
  const videoMeta = { published: { virtualPublishedEdit: {} } };
  const ids = (kind, extra = {}) => Data.filterVideos(videos, { kind, videoMeta, ...extra }).map((v) => v.id);
  assert.deepEqual(ids('all'), ['direct', 'bookmark', 'published']);
  assert.deepEqual(ids('direct'), ['direct', 'published']);
  assert.deepEqual(ids('bookmark'), ['bookmark']);
  assert.deepEqual(ids('bookmark', { query: 'article' }), ['bookmark']);
  assert.deepEqual(ids('bookmark', { showHidden: true }), ['hidden']);
});

class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.className = '';
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.hidden = false;
    this.textContent = '';
  }
  append(...children) { children.forEach((child) => { child.parentNode = this; this.children.push(child); }); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
}
const findClass = (node, name) => node.className.split(/\s+/).includes(name)
  ? node : node.children.map((child) => findClass(child, name)).find(Boolean);

test('bookmark card has no thumbnail, preserves original URL, domain, edit menu, and tags', () => {
  const window = {};
  vm.runInNewContext(read('video-card.js'), { window });
  const documentRef = { createElement: (tag) => new Element(tag) };
  const url = 'https://example.com/video/111.html?foo=bar#part';
  let thumbs = 0;
  const options = {
    documentRef, layout: 'grid', bookmark: true, openHref: url,
    title: 'Watch on site', serviceLabel: 'example.com',
    tags: ['study'], customLabels: ['Rating: 4'], editHref: 'video-edit.html?id=a',
    thumbnailRenderer: { render() { thumbs += 1; } },
  };
  const card = window.MangaReaderVideoCard.create({ id: 'a', url, title: 'Watch on site' }, options);
  assert.match(card.className, /videoCard--bookmark/);
  assert.equal(findClass(card, 'videoCardThumb'), undefined);
  assert.equal(thumbs, 0);
  assert.equal(findClass(card, 'videoCardBookmarkDomain').textContent, 'example.com');
  assert.equal(findClass(card, 'videoCardTitle').href, url);
  assert.equal(findClass(card, 'videoCardMenuEdit').href, 'video-edit.html?id=a');
  assert.ok(findClass(card, 'videoCardLabel--tag'));
  assert.ok(findClass(card, 'videoCardLabel--custom'));

  const direct = window.MangaReaderVideoCard.create({ id: 'b', url: 'https://example.com/b.mp4' }, {
    ...options, bookmark: false, openHref: null,
  });
  assert.ok(findClass(direct, 'videoCardThumb'));
  assert.equal(thumbs, 1);
});

test('list applies the kind selector and opens bookmark anchors without player routing', () => {
  const library = read('video-library.js');
  const routing = read('video-routing-fix.js');
  const css = read('video-card.css');
  assert.match(library, /id="videoLibraryKind"/);
  assert.match(library, /videoMeta: state\.meta/);
  assert.match(library, /bookmark: isBookmark, openHref: isBookmark \? video\.url : null/);
  assert.match(library, /state\.kind = dom\.kind\.value; state\.page = 1; savePrefs\(\); render\(\)/);
  const branch = routing.slice(routing.indexOf('function handleEnhancedOpen'), routing.indexOf("document.addEventListener('click', handleEnhancedOpen"));
  assert.ok(branch.indexOf("card.classList.contains('videoCard--bookmark')") > -1);
  assert.ok(branch.indexOf("card.classList.contains('videoCard--bookmark')") < branch.indexOf('event.preventDefault()'));
  assert.match(branch, /recordOpen\(base\);\s*return;/);
  assert.match(css, /#videoLibraryResults \.videoCard--bookmark \.videoCardTitle::after/);
  assert.match(css, /\.vl-grid\.compact \.vl-card\.videoCard--bookmark/);
});
