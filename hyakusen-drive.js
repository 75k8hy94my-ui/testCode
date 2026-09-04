(()=>{
'use strict';

const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_FIELDS = 'nextPageToken,files(id,name,mimeType,trashed,webViewLink)';

const text = (value) => String(value ?? '').trim();

function escapeDriveQueryLiteral(value) {
  return text(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildFilesListUrl({ nameHint = '', pageToken = '' } = {}) {
  const url = new URL(DRIVE_FILES_URL);
  let q = "mimeType = 'application/pdf' and trashed = false";
  if (text(nameHint)) q += ` and name contains '${escapeDriveQueryLiteral(nameHint)}'`;
  url.searchParams.set('q', q);
  url.searchParams.set('spaces', 'drive');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('fields', DRIVE_FIELDS);
  if (text(pageToken)) url.searchParams.set('pageToken', text(pageToken));
  return url.toString();
}

function matchDriveFiles(entries, files) {
  const expected = new Set((Array.isArray(entries) ? entries : []).map((entry) => text(entry && entry.driveFileName)).filter(Boolean));
  const matches = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    if (!file || file.trashed === true || file.mimeType !== 'application/pdf') continue;
    const name = text(file.name);
    if (!expected.has(name) || matches.has(name)) continue;
    matches.set(name, file);
  }
  return matches;
}

async function errorMessage(response) {
  try {
    const body = await response.json();
    return body && body.error && body.error.message ? body.error.message : `Google Drive API ${response.status || 'error'}`;
  } catch (_) {
    return `Google Drive API ${response.status || 'error'}`;
  }
}

async function listPdfMetadata(accessToken, { nameHint = '', fetchImpl = globalThis.fetch } = {}) {
  const token = text(accessToken);
  if (!token) throw new Error('Google Drive access token is required');
  if (typeof fetchImpl !== 'function') throw new Error('fetch implementation is required');
  const files = [];
  let pageToken = '';
  do {
    const response = await fetchImpl(buildFilesListUrl({ nameHint, pageToken }), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response || !response.ok) throw new Error(await errorMessage(response || {}));
    const body = await response.json();
    if (body && Array.isArray(body.files)) files.push(...body.files);
    pageToken = text(body && body.nextPageToken);
  } while (pageToken);
  return files;
}

function createTokenController({ clientId, googleApi, now = Date.now } = {}) {
  const id = text(clientId);
  if (!id) throw new Error('Google OAuth Client ID is required');
  const oauth2 = googleApi && googleApi.accounts && googleApi.accounts.oauth2;
  if (!oauth2 || typeof oauth2.initTokenClient !== 'function') throw new Error('Google Identity Services is not ready');
  if (typeof now !== 'function') throw new Error('now must be a function');

  let accessToken = null;
  let expiresAt = 0;
  let pending = null;

  const tokenClient = oauth2.initTokenClient({
    client_id: id,
    scope: DRIVE_METADATA_SCOPE,
    include_granted_scopes: false,
    callback(response) {
      if (!pending) return;
      const current = pending;
      pending = null;
      if (!response || response.error || !text(response.access_token)) {
        current.reject(new Error(response && (response.error_description || response.error) ? response.error_description || response.error : 'Google authorization failed'));
        return;
      }
      accessToken = text(response.access_token);
      const expiresIn = Math.max(0, Number(response.expires_in || 0));
      expiresAt = expiresIn ? Number(now()) + Math.max(0, expiresIn - 30) * 1000 : Number.POSITIVE_INFINITY;
      current.resolve(accessToken);
    },
    error_callback(error) {
      if (!pending) return;
      const current = pending;
      pending = null;
      current.reject(new Error(error && error.message ? error.message : 'Google authorization was interrupted'));
    }
  });

  function getAccessToken() {
    if (!accessToken) return null;
    if (Number(now()) >= expiresAt) {
      accessToken = null;
      expiresAt = 0;
      return null;
    }
    return accessToken;
  }

  function requestAccessToken() {
    if (pending) return pending.promise;
    const existing = getAccessToken();
    if (existing) return Promise.resolve(existing);
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    pending = { promise, resolve: resolvePromise, reject: rejectPromise };
    try {
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (error) {
      const current = pending;
      pending = null;
      current.reject(error);
    }
    return promise;
  }

  function clear() {
    accessToken = null;
    expiresAt = 0;
    pending = null;
  }

  return { requestAccessToken, getAccessToken, clear };
}

const api = {
  DRIVE_METADATA_SCOPE,
  buildFilesListUrl,
  matchDriveFiles,
  listPdfMetadata,
  createTokenController
};

if (typeof window !== 'undefined') window.HyakusenDrive = api;
if (typeof module !== 'undefined') module.exports = api;
})();
