(()=>{
'use strict';

const Catalog = window.HyakusenCatalog;
const Drive = window.HyakusenDrive;
const Vault = window.MangaVault;
const CLIENT_ID_KEY = 'hyakusenGoogleOAuthClientId';

const $ = (id) => document.getElementById(id);
const ui = {
  collection: $('collectionSelect'),
  edition: $('editionSelect'),
  clientId: $('googleClientId'),
  connect: $('connectDriveBtn'),
  status: $('driveStatus'),
  list: $('hyakusenList'),
  title: $('listTitle'),
  summary: $('listSummary')
};

let collectionList = [];
let driveMatches = new Map();
let driveChecked = false;
let tokenController = null;
let checkSerial = 0;

function setTheme() {
  try {
    document.documentElement.dataset.theme = localStorage.getItem('mangaReaderTheme') === 'light' ? 'light' : 'dark';
  } catch (_) {
    document.documentElement.dataset.theme = 'dark';
  }
}

function setStatus(message, tone = '') {
  ui.status.textContent = message || '';
  if (tone) ui.status.dataset.tone = tone;
  else delete ui.status.dataset.tone;
}

function text(value) {
  return String(value ?? '').trim();
}

function currentCollection() {
  return collectionList.find((item) => item.collectionId === ui.collection.value) || null;
}

function currentEntries() {
  const collection = currentCollection();
  if (!collection) return [];
  return Catalog.entriesForCollection(collection.collectionId, Number(ui.edition.value));
}

function clearSelect(select, placeholder) {
  select.replaceChildren();
  const option = document.createElement('option');
  option.value = '';
  option.textContent = placeholder;
  select.append(option);
}

function renderCollections() {
  collectionList = Catalog.collections();
  ui.collection.replaceChildren();
  if (!collectionList.length) {
    clearSelect(ui.collection, '百選データ未登録');
    clearSelect(ui.edition, '—');
    ui.collection.disabled = true;
    ui.edition.disabled = true;
    renderList();
    return;
  }
  ui.collection.disabled = false;
  for (const item of collectionList) {
    const option = document.createElement('option');
    option.value = item.collectionId;
    option.textContent = item.collectionLabel;
    ui.collection.append(option);
  }
  renderEditions({ preferLatest: true });
}

function renderEditions({ preferLatest = false } = {}) {
  const collection = currentCollection();
  ui.edition.replaceChildren();
  if (!collection) {
    clearSelect(ui.edition, '—');
    ui.edition.disabled = true;
    renderList();
    return;
  }
  ui.edition.disabled = false;
  const previous = Number(ui.edition.value);
  for (const edition of collection.editions) {
    const option = document.createElement('option');
    option.value = String(edition);
    option.textContent = edition === collection.latestEdition ? `第${edition}版（最新版）` : `第${edition}版`;
    ui.edition.append(option);
  }
  const target = preferLatest || !collection.editions.includes(previous) ? collection.latestEdition : previous;
  ui.edition.value = String(collection.editions.includes(target) ? target : collection.editions[0]);
  driveMatches = new Map();
  driveChecked = false;
  renderList();
}

function rowState(entry) {
  if (!driveChecked) return 'unverified';
  return driveMatches.has(entry.driveFileName) ? 'available' : 'missing';
}

function createRow(entry) {
  const state = rowState(entry);
  const file = driveMatches.get(entry.driveFileName) || null;
  const row = document.createElement(state === 'available' ? 'button' : 'div');
  row.className = 'hyakusenRow';
  row.dataset.driveState = state;
  if (row instanceof HTMLButtonElement) row.type = 'button';

  const number = document.createElement('div');
  number.className = 'hyakusenNumber';
  number.textContent = String(entry.number);

  const citation = document.createElement('div');
  citation.className = 'hyakusenCitation';
  citation.textContent = Catalog.formatCaseCitation(entry.case);

  const fileName = document.createElement('div');
  fileName.className = 'hyakusenFile';
  fileName.textContent = state === 'available' ? entry.driveFileName : state === 'missing' ? `${entry.driveFileName} · 未保存` : `${entry.driveFileName} · 未確認`;

  row.append(number, citation, fileName);
  if (state === 'available' && file && text(file.webViewLink)) {
    row.setAttribute('aria-label', `${Catalog.labelForEntry(entry)}をGoogle Driveで開く`);
    row.addEventListener('click', () => {
      window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
    });
  }
  return row;
}

function renderList() {
  ui.list.replaceChildren();
  const collection = currentCollection();
  const entries = currentEntries();
  if (!collection || !entries.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = collection ? 'この版の百選データは未登録です。' : '百選データ未登録';
    ui.list.append(empty);
    ui.title.textContent = '収録判例';
    ui.summary.textContent = '';
    return;
  }

  const edition = Number(ui.edition.value);
  ui.title.textContent = `${collection.collectionLabel} 第${edition}版`;
  const availableCount = driveChecked ? entries.filter((entry) => driveMatches.has(entry.driveFileName)).length : 0;
  ui.summary.textContent = driveChecked ? `${availableCount} / ${entries.length} PDF保存済み` : `${entries.length}判例 · Drive未確認`;
  for (const entry of entries) ui.list.append(createRow(entry));
}

function resetAuthorization() {
  checkSerial += 1;
  if (tokenController) tokenController.clear();
  tokenController = null;
  driveMatches = new Map();
  driveChecked = false;
  renderList();
}

function saveClientId() {
  const value = text(ui.clientId.value);
  try {
    if (value) localStorage.setItem(CLIENT_ID_KEY, value);
    else localStorage.removeItem(CLIENT_ID_KEY);
  } catch (_) {}
  resetAuthorization();
}

function loadClientId() {
  try {
    ui.clientId.value = localStorage.getItem(CLIENT_ID_KEY) || '';
  } catch (_) {
    ui.clientId.value = '';
  }
}

async function checkDrive({ requestToken = false } = {}) {
  const entries = currentEntries();
  const collection = currentCollection();
  if (!collection || !entries.length) {
    setStatus('百選データ未登録のため、Drive照合はまだ実行できません。', 'warn');
    return;
  }
  const clientId = text(ui.clientId.value);
  if (!clientId) {
    setStatus('Google OAuth Client IDを入力してください。', 'warn');
    ui.clientId.focus();
    return;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
    setStatus('Google認証ライブラリを読み込めませんでした。ネットワーク接続を確認して再度お試しください。', 'warn');
    return;
  }
  if (!tokenController) {
    try {
      tokenController = Drive.createTokenController({ clientId, googleApi: window.google });
    } catch (error) {
      setStatus(error && error.message ? error.message : 'Google認証を開始できませんでした。', 'warn');
      return;
    }
  }

  let accessToken = tokenController.getAccessToken();
  if (!accessToken && requestToken) {
    setStatus('Google Driveへの読み取り専用アクセスを確認しています…');
    try {
      accessToken = await tokenController.requestAccessToken();
    } catch (error) {
      setStatus(`Google Driveに接続できませんでした: ${error && error.message ? error.message : '認証エラー'}`, 'warn');
      return;
    }
  }
  if (!accessToken) {
    driveMatches = new Map();
    driveChecked = false;
    renderList();
    return;
  }

  const serial = ++checkSerial;
  ui.connect.disabled = true;
  setStatus('Drive上の百選PDF名を確認しています…');
  try {
    const files = await Drive.listPdfMetadata(accessToken, { nameHint: collection.shortLabel });
    if (serial !== checkSerial) return;
    driveMatches = Drive.matchDriveFiles(entries, files);
    driveChecked = true;
    renderList();
    setStatus(`Drive確認済み · ${driveMatches.size} / ${entries.length}件のPDFが完全一致しました。`, 'ok');
  } catch (error) {
    if (serial !== checkSerial) return;
    driveMatches = new Map();
    driveChecked = false;
    renderList();
    setStatus(`Drive確認に失敗しました: ${error && error.message ? error.message : 'APIエラー'}。再接続してください。`, 'warn');
    tokenController.clear();
    tokenController = null;
  } finally {
    if (serial === checkSerial) ui.connect.disabled = false;
  }
}

function bindControls() {
  ui.collection.addEventListener('change', () => {
    renderEditions({ preferLatest: true });
    checkDrive();
  });
  ui.edition.addEventListener('change', () => {
    driveMatches = new Map();
    driveChecked = false;
    renderList();
    checkDrive();
  });
  ui.clientId.addEventListener('change', saveClientId);
  ui.connect.addEventListener('click', async () => {
    const clientId = text(ui.clientId.value);
    try {
      if (clientId) localStorage.setItem(CLIENT_ID_KEY, clientId);
    } catch (_) {}
    if (tokenController && tokenController.getAccessToken() === null) tokenController = null;
    await checkDrive({ requestToken: true });
  });
  window.addEventListener('pagehide', () => {
    checkSerial += 1;
    if (tokenController) tokenController.clear();
    tokenController = null;
    driveMatches = new Map();
  });
}

function boot() {
  setTheme();
  const session = Vault && Vault.loadSession();
  if (!session || !session.user || !session.user.id) {
    window.location.replace('index.html');
    return;
  }
  const activeVault = Vault.loadActive();
  if (!activeVault || !activeVault.rawKey) {
    window.location.replace('sync.html');
    return;
  }
  loadClientId();
  bindControls();
  renderCollections();
  if (!collectionList.length) setStatus('百選データ未登録です。収録一覧を追加するとDrive照合を利用できます。');
  document.documentElement.classList.remove('auth-pending');
}

boot();
})();
