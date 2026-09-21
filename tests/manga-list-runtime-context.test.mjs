import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

async function load(path) {
  const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
  const self = {};
  Function('self', source)(self);
  return { source, self };
}

const names = [
  'getState', 'setState', 'getElements',
  'persistItems', 'persistFolders', 'persistAuthorCards', 'persistAll', 'scheduleCloudSync',
  'openReader', 'accessMedia', 'renderDashboard', 'renderAuthorDashboard',
  'getVisibleItems', 'appendFolderPreview', 'createStaticCard', 'loadLocalCover',
  'getCoverSourceCache', 'setupFeedImage', 'makeHeartIcon', 'moveItemInList',
  'moveFolderInList', 'rememberReaderReturnView', 'closeSavedList',
  'setReadingListContext', 'flashStatus', 'navigateReaderScreen', 'switchListTab',
  'openItem', 'renderList', 'updateBulkEditButton', 'shelfVisibleItems',
  'unreadOrderItems', 'itemDisplayTitle', 'itemSubtext', 'readingRecordText',
  'itemPageCountText'
];

test('manga runtime context exposes only frozen callback accessors', async () => {
  const { source, self } = await load('manga-list-runtime-context.js');
  const deps = Object.fromEntries(names.map((name) => [name, () => name]));
  const context = self.MangaListRuntimeContextFactory.create(deps);
  assert.deepEqual(Object.keys(context), names);
  assert.ok(Object.isFrozen(self.MangaListRuntimeContextFactory));
  assert.ok(Object.isFrozen(context));
  assert.throws(() => self.MangaListRuntimeContextFactory.create({}), TypeError);
  assert.doesNotMatch(source, /savedVideos|localStorage|sessionStorage|document|window|MangaVault|VPN|addEventListener|setTimeout/);
});

test('manga runtime context does not retain mutable state or DOM values', async () => {
  const { self } = await load('manga-list-runtime-context.js');
  const state = { savedItems: [] };
  const elements = { savedListItems: {} };
  const context = self.MangaListRuntimeContextFactory.create({
    ...Object.fromEntries(names.map((name) => [name, () => name === 'getState' ? state : name === 'getElements' ? elements : null]))
  });
  assert.equal(context.getState(), state);
  assert.equal(context.getElements(), elements);
  assert.equal(Object.prototype.hasOwnProperty.call(context, 'savedItems'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(context, 'savedVideos'), false);
});
