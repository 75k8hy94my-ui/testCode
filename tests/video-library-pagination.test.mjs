import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../video-library-pagination.js', import.meta.url), 'utf8');
const window = {};
vm.runInNewContext(source, { window });
const library = fs.readFileSync(new URL('../video-library.js', import.meta.url), 'utf8');
const route = fs.readFileSync(new URL('../video-list-route.js', import.meta.url), 'utf8');

test('video return counts series boxes and falls back when the old page no longer contains the target', () => {
  const boxes = Array.from({ length: 25 }, (_, index) => ({ kind: 'video', video: { id: index + 1 } }));
  boxes.push({ kind: 'series', id: 'series-a', videos: [{ id: 'other' }, { id: 'target' }] });
  const { resolveVideoReturn, containsVideo } = window.VideoLibraryPagination;
  const result = resolveVideoReturn(boxes, 'target', 1);
  assert.equal(result.page, 2);
  assert.equal(result.seriesId, 'series-a');
  assert.equal(containsVideo(boxes.slice(0, 25), 'target'), false);
  assert.equal(containsVideo(boxes.slice(25), 'target'), true);
  assert.equal(resolveVideoReturn(boxes, 'missing', 2), null);
  assert.equal(resolveVideoReturn(boxes, '2', 99).page, 1);
});

test('video return honors a preferred page that still contains the target', () => {
  const boxes = Array.from({ length: 26 }, (_, index) => ({ kind: 'video', video: { id: index === 25 ? 1 : index + 1 } }));
  const { resolveVideoReturn } = window.VideoLibraryPagination;
  assert.equal(resolveVideoReturn(boxes, '1', 2).page, 2);
  assert.equal(resolveVideoReturn(boxes, '1', null).page, 1);
});

test('video pagination uses the 25-item manga page size and clamps valid pages', () => {
  const videos = Array.from({ length: 26 }, (_, index) => ({ id: String(index + 1) }));
  const first = window.VideoLibraryPagination.derive(videos, 1);
  const last = window.VideoLibraryPagination.derive(videos, 2);

  assert.equal(first.totalPages, 2);
  assert.equal(first.page, 1);
  assert.equal(first.items.length, 25);
  assert.equal(last.page, 2);
  assert.deepEqual(Array.from(last.items, (video) => video.id), ['26']);
});

test('video pagination keeps one logical page for zero items and clamps after filtering', () => {
  const empty = window.VideoLibraryPagination.derive([], 9);
  const single = window.VideoLibraryPagination.derive([{ id: 'one' }], 1);
  const filtered = window.VideoLibraryPagination.derive(Array.from({ length: 25 }, (_, i) => i), 2);

  assert.equal(empty.totalPages, 1);
  assert.equal(empty.page, 1);
  assert.deepEqual(Array.from(empty.items), []);
  assert.equal(single.totalPages, 1);
  assert.equal(single.page, 1);
  assert.equal(single.items.length, 1);
  assert.equal(single.hasMultiplePages, false);
  assert.equal(filtered.totalPages, 1);
  assert.equal(filtered.page, 1);
  assert.equal(filtered.items.length, 25);
});

test('video library paginates 25 boxes (single videos or series) with manga pager controls and slide animation', () => {
  assert.match(library, /const displayItems = Data\.groupVideosBySeries\(videos\)/);
  assert.match(library, /Pagination\.derive\(displayItems, state\.page, Pagination\.PAGE_SIZE\)/);
  assert.match(library, /pageModel\.items\.forEach\(item => grid\.append\(item\.kind === 'series' \? createSeriesCard\(item\) : createCard\(item\.video\)\)\)/);
  assert.match(fs.readFileSync(new URL('../video-library-view.js', import.meta.url), 'utf8'), /id="videoLibraryPagination" class="bookshelf-pagination vl-pagination"/);
  assert.match(fs.readFileSync(new URL('../video-library-view.js', import.meta.url), 'utf8'), /videoLibraryPrevPage/);
  assert.match(fs.readFileSync(new URL('../video-library-view.js', import.meta.url), 'utf8'), /videoLibraryNextPage/);
  assert.match(fs.readFileSync(new URL('../video-library-view.js', import.meta.url), 'utf8'), /videoLibraryPageLabel/);
  assert.match(library, /duration: 300/);
  assert.match(library, /state\.page = pageModel\.page/);
  assert.match(library, /dom\.pagination\.hidden = !pageModel\.hasMultiplePages/);
});

test('video route loads shared swipe events and pagination logic before its library', () => {
  assert.ok(route.indexOf('manga-list-pagination-events.js') < route.indexOf('video-library.js'));
  assert.ok(route.indexOf('video-library-pagination.js') < route.indexOf('video-library.js'));
  assert.match(library, /swipeSurface: dom\.results/);
  assert.match(library, /allowSwipeTarget\(node\).*vl-open/);
});
