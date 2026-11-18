import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');

function presentationHarness() {
  const optionsSeen = [];
  const calls = [];
  const cards = [];
  const createElement = tag => {
    const el = {
      tag, dataset: {}, children: [], events: {}, attributes: {},
      classList: { add(...classes) { el.classes = [...(el.classes || []), ...classes]; } },
      append(...children) { el.children.push(...children); },
      setAttribute(name, value) { el.attributes[name] = value; },
      addEventListener(event, handler) { el.events[event] = handler; },
    };
    return el;
  };
  const root = {
    MangaReaderVideoCard: {
      create(media, options) {
        optionsSeen.push({ media, options });
        const element = createElement('article');
        cards.push(element);
        return element;
      },
    },
    MangaReaderVideoThumbnailRenderer: { render() {} },
  };
  vm.runInNewContext(read('video-library-view.js'), { window: root });
  const state = {
    meta: { a: { favorite: true } }, folders: [{ id: 'folder', name: 'Folder' }],
    baseVideos: [{ id: 'a' }], view: 'card', seriesSelecting: false,
    seriesSelected: new Set(), expandedSeries: new Set(),
    customValues: { a: { p: 4 } },
    customDefinitions: { properties: { p: { id: 'p', name: 'Rating', order: 1 } } },
  };
  const a = { id: 'a', title: 'Sample', url: 'https://example.test/watch',
    tags: ['tag'], folderId: 'folder', favorite: true, seriesId: 'series',
    watchStatus: 'watching', openCount: 2, embedPage: true };
  const b = { id: 'b', title: 'Next', seriesId: 'series', url: 'https://example.test/video.mp4' };
  const videos = [a, b];
  const renderer = root.MangaReaderVideoLibraryView.createCardRenderer({
    documentRef: { createElement, createTextNode: value => ({ text: value }) },
    data: {
      displayTitle: video => video.title, videoEntryKind: video => video.url.endsWith('.mp4') ? 'direct' : 'bookmark',
      deriveService: () => '', isDirectVideoUrl: url => url.endsWith('.mp4'),
    },
    customProperties: { formatValue: (_property, value) => String(value) },
    state, effectiveVideos: () => videos,
    folderName: id => state.folders.find(x => x.id === id)?.name || '',
    canReadProtectedData: () => true,
    actions: {
      openVideo(id) { calls.push(['open', id]); },
      toggleFavorite(id, value) { calls.push(['favorite', id, value]); },
      removeSeries(ids) { calls.push(['remove-series', ...ids]); },
      selectVideo(id, value) { calls.push(['select-video', id, value]); },
      selectSeries(ids, value) { calls.push(['select-series', ...ids, value]); },
      toggleSeries(id, value) { calls.push(['expand', id, value]); },
    },
  });
  return { renderer, state, a, b, optionsSeen, calls, cards };
}

test('video card factory preserves metadata, bookmark embed routing, and library-owned actions', () => {
  const h = presentationHarness();
  const card = h.renderer.createCard(h.a);
  const config = h.optionsSeen[0].options;
  assert.equal(card.dataset.videoId, 'a');
  assert.equal(config.bookmark, true);
  assert.equal(config.openHref, null); // embedded bookmarks route through the player
  assert.deepEqual([...config.customLabels], ['Rating: 4']);
  assert.deepEqual(config.tags, ['tag']);
  assert.ok(config.metadata.includes('Folder'));
  assert.ok(config.metadata.includes('視聴中'));
  assert.ok(config.metadata.includes('2回'));
  config.onOpen();
  config.menuActions[0].onSelect();
  config.menuActions[1].onSelect();
  assert.deepEqual(h.calls, [['open', 'a'], ['favorite', 'a', false], ['remove-series', 'a']]);
  assert.equal(h.state.meta.a.favorite, true, 'the view must not mutate library metadata');
  assert.equal(h.state.seriesSelected.size, 0);
});

test('series controls delegate selection and expansion without mutating library state', () => {
  const h = presentationHarness();
  h.state.seriesSelecting = true;
  h.renderer.createCard(h.a);
  const selection = h.cards[0].children[0].children[0];
  selection.checked = true;
  selection.events.change();
  const section = h.renderer.createSeriesCard({ id: 'series', videos: [h.a, h.b] });
  const heading = section.children[0];
  const toggle = heading.children[0];
  toggle.events.click();
  const all = heading.children[1].children[0];
  all.checked = true;
  all.events.change();
  assert.deepEqual(h.calls, [
    ['select-video', 'a', true],
    ['expand', 'series', true],
    ['select-series', 'a', 'b', true],
  ]);
  assert.equal(h.state.seriesSelected.size, 0);
  assert.equal(h.state.expandedSeries.size, 0);
});

test('video library has one canonical filtering path for render and return navigation', () => {
  const source = read('video-library.js');
  assert.equal((source.match(/Data\.filterVideos\(scoped/g) || []).length, 1);
  assert.ok((source.match(/filterVisibleVideos\(scoped\)/g) || []).length >= 4);
  assert.match(source, /View\.createCardRenderer/);
  assert.match(source, /function createCard\(video\) \{ return cardRenderer\.createCard\(video\); \}/);
  assert.doesNotMatch(read('video-library-view.js'), /\b(?:localStorage|sessionStorage|MangaVault|markLocalChangesPending|runVaultSync)\b/);
});

test('global video events skip detached list presentation while preserving pending sync', () => {
  const source = read('video-library.js');
  assert.match(source, /function isListMounted\(\) \{ return dom\.section\?\.isConnected === true; \}/);
  assert.match(source, /if \(isListMounted\(\)\) render\(\);\s*resumePendingLocalSync\(\)/);
  assert.match(source, /if \(!canReadProtectedData\(\) \|\| !dom\.results \|\| !isListMounted\(\)\) return/);
  assert.match(source, /event\.detail\?\.page !== 'video' \|\| !isListMounted\(\)/);
});
