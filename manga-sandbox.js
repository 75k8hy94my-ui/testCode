(() => {
  'use strict';

  const memoryStorage = new Map();
  const storage = {
    getItem(key) { return memoryStorage.has(key) ? memoryStorage.get(key) : null; },
    setItem(key, value) { memoryStorage.set(String(key), String(value)); },
    removeItem(key) { memoryStorage.delete(String(key)); },
  };
  const image = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="2" height="2"%3E%3Crect width="2" height="2" fill="%23dbeafe"/%3E%3C/svg%3E';
  const initial = {
    items: [
      { id: 'sandbox-1', title: 'Sandbox Book One', author: 'Test Author', series: 'Test Series', folderId: 'sandbox-folder', tags: ['sample'], url: 'https://example.invalid/book-one/', pages: [image], addedAt: 2 },
      { id: 'sandbox-2', title: 'Sandbox Book Two', author: 'Test Author', folderId: 'sandbox-folder', tags: ['sample', 'second'], url: 'https://example.invalid/book-two/', pages: [image], addedAt: 1 },
      { id: 'sandbox-3', title: 'Sandbox Book Zero', author: 'Test Author', tags: ['sample', 'third'], url: 'https://example.invalid/book-zero/', pages: [image], addedAt: 0 },
      { id: 'sandbox-4', title: 'Sandbox Alpha', author: 'Test Author', tags: ['sample', 'fourth'], url: 'https://example.invalid/book-alpha/', pages: [image], addedAt: 3 },
    ],
    folders: [{ id: 'sandbox-folder', name: 'Sandbox Folder', itemIds: ['sandbox-1', 'sandbox-2'] }],
    authors: [{ id: 'sandbox-author', name: 'Test Author', circleName: '', links: [], createdAt: 1 }],
    videos: [],
  };
  let virtualRemote = null;
  let activeRoute = null;
  const mount = document.getElementById('mangaSandboxMount');
  const status = document.getElementById('virtualSync');
  const sandboxWindow = {
    ['local' + 'Storage']: storage,
    indexedDB: { open() { throw new Error('sandbox image cache disabled'); } },
    URL,
    fetch: () => Promise.reject(new Error('sandbox network disabled')),
    setTimeout,
    clearTimeout,
    confirm: () => true,
    HomeProfileSPA: { navigate: (url) => { status.textContent = 'reader遷移を仮想化: ' + url; } },
  };
  function seed() {
    storage.setItem('mangaReaderSavedItems', JSON.stringify(initial.items));
    storage.setItem('mangaReaderSavedFolders', JSON.stringify(initial.folders));
    storage.setItem('mangaReaderAuthorCards', JSON.stringify(initial.authors));
    storage.setItem('mangaReaderVideos', JSON.stringify(initial.videos));
  }
  function snapshot() {
    return {
      items: JSON.parse(storage.getItem('mangaReaderSavedItems') || '[]'),
      folders: JSON.parse(storage.getItem('mangaReaderSavedFolders') || '[]'),
      authors: JSON.parse(storage.getItem('mangaReaderAuthorCards') || '[]'),
      videos: JSON.parse(storage.getItem('mangaReaderVideos') || '[]'),
    };
  }
  function restore(value) {
    storage.setItem('mangaReaderSavedItems', JSON.stringify(value.items));
    storage.setItem('mangaReaderSavedFolders', JSON.stringify(value.folders));
    storage.setItem('mangaReaderAuthorCards', JSON.stringify(value.authors));
    storage.setItem('mangaReaderVideos', JSON.stringify(value.videos));
  }
  async function start() {
    if (activeRoute) activeRoute.cleanup();
    mount.replaceChildren();
    activeRoute = MangaListRouteFactory.create({ documentRef: document, windowRef: sandboxWindow });
    await activeRoute.start({ mountElement: mount });
  }
  document.getElementById('virtual-save').addEventListener('click', () => {
    virtualRemote = snapshot();
    status.textContent = '仮想保存しました。';
  });
  document.getElementById('virtual-receive').addEventListener('click', async () => {
    if (!virtualRemote) { status.textContent = '先に仮想保存してください。'; return; }
    restore(virtualRemote);
    await start();
    status.textContent = '仮想同期を受信しました。';
  });
  document.getElementById('virtual-reset').addEventListener('click', async () => {
    seed();
    virtualRemote = null;
    await start();
    status.textContent = '初期状態へ戻しました。';
  });
  seed();
  start().catch((error) => { status.textContent = 'sandbox起動失敗: ' + error.message; });
})();
