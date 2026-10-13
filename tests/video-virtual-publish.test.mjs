import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Publish from '../video-virtual-publish.js';
import Edit from '../video-virtual-edit.js';
import Data from '../video-data.js';

const read = (name) => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const sourceVideo = { id: 'source', title: '動画A', url: 'https://files.test/a.mp4?access=abc', addedAt: 1, updatedAt: 1 };
const anotherVideo = { id: 'second', title: '動画B', url: 'https://files.test/b.mp4', addedAt: 2, updatedAt: 2 };
const clips = [
  { sourceVideoId: 'source', startSeconds: 0, endSeconds: 10 },
  { sourceVideoId: 'source', startSeconds: 10, endSeconds: 25, rotation: 90 },
  { sourceVideoId: 'second', startSeconds: 2, endSeconds: 8, rotation: -90 },
];

function fixture({ guest = false, markPending = () => true, sync = async () => true } = {}) {
  const map = new Map(Object.entries({
    mangaReaderVideos: JSON.stringify([sourceVideo, anotherVideo]),
    mangaReaderVideoMeta: JSON.stringify({ source: { title: '動画A', favorite: true } }),
  }));
  let next = 0;
  const storage = {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, value); },
    removeItem(key) { map.delete(key); },
  };
  const publisher = Publish.createPublisher({
    storage, canAccess: () => true, isGuest: () => guest, markPending, sync,
    now: () => 1234000, generateId: () => 'v-test-' + (++next),
    routeBase: 'https://example.test/testCode/video-virtual-editor.html',
  });
  const state = () => ({
    videos: JSON.parse(storage.getItem('mangaReaderVideos')),
    meta: JSON.parse(storage.getItem('mangaReaderVideoMeta')),
  });
  return { publisher, state, storage };
}

test('all three publish modes store virtual time instructions, not actual media copies', async () => {
  const { publisher, state } = fixture();
  const edit = Edit.createEdit(clips);
  const a = await publisher.publish({ mode: 'new', edit, title: '完成動画' });
  assert.equal(a.count, 1);
  assert.equal(a.synced, true);
  const publication = publisher.inspect(a.ids[0]);
  assert.deepEqual(publication.edit.clips, clips);
  const s = state();
  assert.equal(s.videos.length, 3);
  assert.equal(s.videos[0].title, '完成動画');
  assert.equal(s.videos[0].url, 'https://example.test/testCode/video-virtual-player.html?video=' + a.ids[0]);
  assert.equal(Data.videoUrlIdentity(s.videos[0].url) !== Data.videoUrlIdentity(sourceVideo.url), true);
  assert.equal(s.videos.find((video) => video.id === sourceVideo.id).url, sourceVideo.url);
});

test('split publish creates distinct library videos and preserves each clip rotation', async () => {
  const { publisher, state } = fixture();
  const result = await publisher.publish({ mode: 'split', title: 'サンプル', edit: Edit.createEdit(clips) });
  assert.equal(result.count, 3);
  const s = state();
  assert.equal(s.videos.length, 5);
  assert.equal(new Set(s.videos.map((video) => Data.videoUrlIdentity(video.url))).size, s.videos.length,
    'library URL deduplication must not merge split outputs');
  result.ids.forEach((id, index) => {
    const part = publisher.inspect(id);
    assert.equal(part.kind, 'split');
    assert.deepEqual(part.edit.clips, [clips[index]]);
    assert.match(s.videos.find((video) => video.id === id).title, new RegExp('分割' + (index + 1)));
  });
  assert.deepEqual(s.videos.find((video) => video.id === 'source'), sourceVideo);
});

test('overwrite retains the original MP4 and restoration is reversible', async () => {
  const { publisher, state } = fixture();
  const edit = Edit.createEdit(clips);
  const result = await publisher.publish({ mode: 'overwrite', targetId: 'source', title: '回転版', edit });
  assert.deepEqual(result.ids, ['source']);
  assert.equal(state().videos.length, 2, 'overwriting must never create a second card');
  assert.equal(state().videos[0].url, sourceVideo.url);
  assert.equal(state().meta.source.favorite, true);
  assert.equal(publisher.inspect('source').kind, 'overwrite');
  const restored = await publisher.restore('source');
  assert.equal(restored.count, 1);
  assert.equal(publisher.get('source'), null);
  assert.equal(state().videos[0].url, sourceVideo.url);
  assert.equal(state().meta.source.favorite, true);
  assert.equal(state().meta.source.virtualPublishedEdit, null, 'restoration tombstone prevents stale metadata merger from resurrecting the edit');
  assert.rejects(() => publisher.restore('source'), /元動画に戻せる/);
});

test('overwriting a previously published video can restore the prior edited version', async () => {
  const { publisher, state } = fixture();
  const original = Edit.createEdit([clips[0]]);
  const first = await publisher.publish({ mode: 'new', title: '初回の編集版', edit: original });
  assert.equal(publisher.inspect(first.ids[0]).kind, 'new');
  assert.ok(publisher.listOverwriteTargets().some((item) => item.id === first.ids[0]));
  await publisher.publish({ mode: 'overwrite', title: '再編集', targetId: first.ids[0], edit: Edit.createEdit(clips) });
  assert.equal(publisher.inspect(first.ids[0]).kind, 'overwrite');
  assert.equal(state().meta[first.ids[0]].virtualPublishedPrevious.kind, 'new');
  await publisher.restore(first.ids[0]);
  assert.equal(publisher.inspect(first.ids[0]).kind, 'new');
  assert.deepEqual(publisher.inspect(first.ids[0]).edit.clips, [clips[0]]);
  assert.match(state().videos.find((video) => video.id === first.ids[0]).url, /video-virtual-player/);
  assert.equal(state().videos.length, 3);
});

test('source URL changes prevent playing obsolete virtual edits', async () => {
  const { publisher, storage } = fixture();
  const result = await publisher.publish({ mode: 'new', edit: Edit.createEdit(clips), title: '公開' });
  const videos = JSON.parse(storage.getItem('mangaReaderVideos'));
  videos.find((video) => video.id === 'source').url = 'https://files.test/changed.mp4';
  storage.setItem('mangaReaderVideos', JSON.stringify(videos));
  assert.throws(() => publisher.inspect(result.ids[0]), /元動画のURLが変更/);
});

test('pending marker failure cannot modify library and synchronization failure retains local edits', async () => {
  const denied = fixture({ markPending: () => false });
  const first = denied.state();
  await assert.rejects(() => denied.publisher.publish({ mode: 'new', title: '失敗', edit: Edit.createEdit(clips) }), /未同期マーカー/);
  assert.deepEqual(denied.state(), first);
  const offline = fixture({ sync: async () => { throw new Error('network'); } });
  const result = await offline.publisher.publish({ mode: 'new', title: 'オフライン', edit: Edit.createEdit(clips) });
  assert.equal(result.localSaved, true);
  assert.equal(result.synced, false);
  assert.equal(result.syncError, 'network');
  assert.equal(offline.state().videos.length, 3);
});

test('publication UI, original player routing and edited player are connected', () => {
  const editor = read('video-virtual-editor.html');
  const player = read('video-virtual-player.html');
  const ui = read('video-virtual-publish-ui.js');
  const entry = read('video-player-page.js');
  const virtual = read('video-virtual-player-page.js');
  assert.ok(editor.indexOf('video-virtual-publish.js') < editor.indexOf('video-virtual-editor.js'));
  assert.ok(editor.indexOf('video-virtual-editor.js') < editor.indexOf('video-virtual-publish-ui.js'));
  assert.ok(player.indexOf('video-virtual-publish.js') < player.indexOf('video-virtual-player-page.js'));
  assert.match(ui, /data-publish-new/);
  assert.match(ui, /data-publish-clips/);
  assert.match(ui, /data-publish-overwrite/);
  assert.match(entry, /virtualPublishedEdit/);
  assert.match(entry, /video-virtual-player\.html/);
  assert.match(virtual, /data-restore/);
  assert.match(virtual, /Publish\.createPublisher\(\)\.restore\(publishedVideoId\)/);
});
