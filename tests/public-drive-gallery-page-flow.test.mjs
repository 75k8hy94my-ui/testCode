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
function makePage({ guest = false, accessAllowed = true, ensureSession, decryptSettings } = {}) {
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
  let redirects = 0;
  let allowed = accessAllowed;
  const windowEvents = new Map();
  const documentEvents = new Map();
  const bodyClasses = new Set();
  const cacheSource = { ...gallery, async listPublicImages() {
    driveCalls++;
    return [{ id: 'image_000000002', name: '新.jpg', mimeType: 'image/jpeg' }];
  }};
  const active = guest ? null : { rawKey: new Uint8Array(32).fill(7) };
  const window = {
    TestCodeGuest: { isActive: () => guest },
    MangaReaderMediaAccess: { canReadProtectedData: () => allowed, syncUi() {} },
    PublicDriveGallery: cacheSource,
    PublicDriveGalleryVault: {
      validateSettings: () => {},
      decryptSettings: decryptSettings || (async () => ({ folderId, apiKey, cache: cached })),
      encryptSettings: async (_key, data) => {
        encryptedWrites++;
        return { type: 'testcode-drive-gallery-settings', version: 1, iv: 'AAAAAAAAAAAAAAAA',
          ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA', testCachedCount: data.cache?.images?.length ?? -1 };
      }
    },
    MangaVault: {
      loadSession: () => ({ refresh_token: 'session' }),
      loadActive: () => active,
      ensureSession: ensureSession || (async () => {}),
      markLocalChangesPending: () => true,
      savePayload: async () => { cloudSaves++; }
    },
    MangaVaultPayload: {
      DATA_KEYS: { driveGalleryEncrypted: 'encryptedDriveSettings' },
      buildFromLocalStorage: () => ({ driveGalleryEncrypted: { ciphertext: 'encrypted' } })
    },
    MANGA_READER_SUPABASE: { url: 'https://example.supabase.co', publishableKey: 'public' },
    location: { search: '', replace() { redirects++; } },
    addEventListener(event, callback) { windowEvents.set(event, callback); }
  };
  const localStorage = { setItem() {} };
  const document = {
    getElementById: id => elements[id],
    createElement: () => fakeElement(),
    createDocumentFragment: () => fakeElement(),
    addEventListener(event, callback) { documentEvents.set(event, callback); },
    documentElement: { classList: { remove() {} } },
    body: { classList: { add(name) { bodyClasses.add(name); }, remove(name) { bodyClasses.delete(name); } } }
  };
  vm.runInNewContext(pageSource, { window, document, localStorage, location: window.location,
    AbortController, URLSearchParams, Date, Uint8Array, TextEncoder, setTimeout, clearTimeout });
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
  return { elements, settle, windowEvents, documentEvents, bodyClasses,
    setAccessAllowed(value) { allowed = value; },
    stats: () => ({ driveCalls, cloudSaves, encryptedWrites, redirects }) };
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

test('authenticated Drive gallery does not decrypt or fetch protected settings without VPN access', async () => {
  const page = makePage({ accessAllowed: false });
  await page.settle();
  assert.equal(page.stats().driveCalls, 0);
  assert.equal(page.elements.driveApiKey.value, '');
  assert.equal(page.elements.driveGalleryGrid.children.length, 0);
  assert.match(page.elements.driveSyncStatus.textContent, /VPN/);
});

test('temporary session refresh failures stay on the gallery and can be retried', async () => {
  let attempts = 0;
  const page = makePage({ ensureSession: async () => {
    if (++attempts === 1) throw new Error('network unavailable');
  }});
  await page.settle();
  assert.equal(page.stats().redirects, 0);
  assert.match(page.elements.driveSyncStatus.textContent, /通信|ネットワーク|再試行/);

  page.documentEvents.get('manga-reader-vpn-status')();
  await page.settle();
  assert.equal(attempts, 2);
  assert.equal(page.elements.driveGalleryCount.textContent, '1枚');
});

test('VPN loss closes the Drive viewer and releases the scroll lock', async () => {
  const page = makePage();
  await page.settle();
  page.elements.driveGalleryGrid.children[0].children[0].callbacks.get('click')();
  assert.equal(page.bodyClasses.has('driveViewerOpen'), true);

  page.setAccessAllowed(false);
  page.documentEvents.get('manga-reader-vpn-status')();
  assert.equal(page.elements.driveViewer.hidden, true);
  assert.equal(page.bodyClasses.has('driveViewerOpen'), false);
});

test('late Drive settings decryption cannot restore protected UI after VPN loss', async () => {
  let finishDecrypt;
  const page = makePage({ decryptSettings: () => new Promise(resolve => { finishDecrypt = resolve; }) });
  for (let i = 0; i < 10 && !finishDecrypt; i++) await page.settle();
  assert.equal(typeof finishDecrypt, 'function');

  page.setAccessAllowed(false);
  page.documentEvents.get('manga-reader-vpn-status')();
  finishDecrypt({ folderId, apiKey, cache: cached });
  await page.settle();

  assert.equal(page.elements.driveApiKey.value, '');
  assert.equal(page.elements.driveGalleryGrid.children.length, 0);
  assert.equal(page.elements.driveGalleryCount.textContent, '');
  assert.equal(page.stats().driveCalls, 0);
});
