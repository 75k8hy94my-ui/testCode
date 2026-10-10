import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const gallery = require('../public-drive-gallery-source.js');
const pageSource = fs.readFileSync(new URL('../public-drive-gallery.js', import.meta.url), 'utf8');
const folderId = '1AbcDE_fgHIJkLMnOPqRsTUvW';
const apiKey = 'AIzaExampleBrowserRestrictedKey00001';
const cached = gallery.createCache(folderId, [{ id: 'image_000000001', name: '風景.jpg' }]);

function fakeElement() {
  const callbacks = new Map();
  return {
    callbacks, children: [], dataset: {}, hidden: false, value: '', textContent: '', disabled: false,
    classList: { add() {}, remove() {} },
    addEventListener(event, callback) { callbacks.set(event, callback); },
    replaceChildren(...children) { this.children = children; },
    append(...children) { this.children.push(...children); },
    prepend(...children) { this.children.unshift(...children); },
    setAttribute() {}, removeAttribute() {}, focus() {}, remove() {}
  };
}
function makePage({ guest = false } = {}) {
  const ids = [
    'driveSyncStatus', 'driveGalleryForm', 'driveFolder', 'driveApiKey', 'driveLoad',
    'driveCancel', 'driveRefresh', 'driveGalleryStatus', 'driveGalleryCount',
    'driveGalleryGrid', 'driveGalleryEmpty', 'driveViewer', 'driveViewerImage',
    'driveViewerTitle', 'driveViewerPosition', 'driveViewerPrev', 'driveViewerNext',
    'driveViewerOriginal', 'driveViewerMessage', 'driveViewerClose'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, fakeElement()]));
  elements.driveViewer.hidden = true;
  elements.driveRefresh.disabled = true;
  let driveCalls = 0;
  let cloudSaves = 0;
  let encryptedWrites = 0;
  const cacheSource = { ...gallery, async listPublicImages() {
    driveCalls++;
    return [{ id: 'image_000000002', name: '新.jpg', mimeType: 'image/jpeg' }];
  }};
  const active = guest ? null : { rawKey: new Uint8Array(32).fill(7) };
  const window = {
    TestCodeGuest: { isActive: () => guest },
    PublicDriveGallery: cacheSource,
    PublicDriveGalleryVault: {
      validateSettings: () => {},
      decryptSettings: async () => ({ folderId, apiKey, cache: cached }),
      encryptSettings: async (_key, data) => {
        encryptedWrites++;
        return { type: 'testcode-drive-gallery-settings', version: 1, iv: 'AAAAAAAAAAAAAAAA',
          ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA', testCachedCount: data.cache?.images?.length ?? -1 };
      }
    },
    MangaVault: {
      loadSession: () => ({ refresh_token: 'session' }),
      loadActive: () => active,
      ensureSession: async () => {},
      savePayload: async () => { cloudSaves++; }
    },
    MangaVaultPayload: {
      DATA_KEYS: { driveGalleryEncrypted: 'encryptedDriveSettings' },
      buildFromLocalStorage: () => ({ driveGalleryEncrypted: { ciphertext: 'encrypted' } })
    },
    MANGA_READER_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'public' },
    location: { search: '', replace() {} },
    addEventListener() {}
  };
  const localStorage = { setItem() {} };
  const document = {
    getElementById: id => elements[id],
    createElement: () => fakeElement(),
    createDocumentFragment: () => fakeElement(),
    addEventListener() {},
    documentElement: { classList: { remove() {} } },
    body: { classList: { add() {}, remove() {} } }
  };
  vm.runInNewContext(pageSource, { window, document, localStorage, location: window.location,
    AbortController, URLSearchParams, Date, Uint8Array, TextEncoder, setTimeout, clearTimeout });
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { elements, settle, stats: () => ({ driveCalls, cloudSaves, encryptedWrites }) };
}

test('opening cached gallery and saving unchanged settings never queries Drive API', async () => {
  const page = makePage();
  await page.settle();
  assert.equal(page.stats().driveCalls, 0);
  assert.equal(page.elements.driveGalleryCount.textContent, '1枚');
  assert.match(page.elements.driveGalleryStatus.textContent, /Drive APIは呼び出していません/);
  await page.elements.driveGalleryForm.callbacks.get('submit')({ preventDefault() {} });
  assert.equal(page.stats().driveCalls, 0);
  assert.equal(page.stats().cloudSaves, 1);
});
test('explicit refresh uses Drive API once and writes new encrypted manifest to Vault', async () => {
  const page = makePage();
  await page.settle();
  assert.equal(page.stats().driveCalls, 0);
  await page.elements.driveRefresh.callbacks.get('click')();
  assert.equal(page.stats().driveCalls, 1);
  assert.equal(page.stats().cloudSaves, 1);
  assert.equal(page.elements.driveGalleryCount.textContent, '1枚');
  assert.match(page.elements.driveGalleryStatus.textContent, /Driveから最新の一覧を取得/);
});

test('guest can display public Drive images without an unlocked Vault or cloud persistence', async () => {
  const page = makePage({ guest: true });
  await page.settle();
  page.elements.driveFolder.value = folderId;
  page.elements.driveApiKey.value = apiKey;
  await page.elements.driveGalleryForm.callbacks.get('submit')({ preventDefault() {} });
  await page.settle();

  assert.equal(page.stats().driveCalls, 1);
  assert.equal(page.stats().cloudSaves, 0);
  assert.equal(page.stats().encryptedWrites, 0);
  assert.equal(page.elements.driveGalleryCount.textContent, '1枚');
  assert.equal(page.elements.driveGalleryGrid.children.length, 1);
});
