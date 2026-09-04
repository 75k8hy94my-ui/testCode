import test from 'node:test';
import assert from 'node:assert/strict';
import driveApi from '../hyakusen-drive.js';

const {
  DRIVE_METADATA_SCOPE,
  buildFilesListUrl,
  matchDriveFiles,
  listPdfMetadata,
  createTokenController
} = driveApi;

const entries = [
  { driveFileName: '民法Ⅱ14.pdf' },
  { driveFileName: '民法Ⅱ15.pdf' }
];

test('Drive scope is metadata-readonly and never broader', () => {
  assert.equal(DRIVE_METADATA_SCOPE, 'https://www.googleapis.com/auth/drive.metadata.readonly');
});

test('Drive list URL requests only PDF metadata, excludes trash, and can narrow by collection name', () => {
  const url = new URL(buildFilesListUrl({ nameHint: '民法Ⅱ', pageToken: 'next-token' }));
  assert.equal(url.origin + url.pathname, 'https://www.googleapis.com/drive/v3/files');
  const q = url.searchParams.get('q');
  assert.match(q, /mimeType = 'application\/pdf'/);
  assert.match(q, /trashed = false/);
  assert.match(q, /name contains '民法Ⅱ'/);
  assert.equal(url.searchParams.get('pageToken'), 'next-token');
  assert.equal(url.searchParams.get('spaces'), 'drive');
  assert.equal(url.searchParams.get('pageSize'), '1000');
  assert.equal(url.searchParams.get('fields'), 'nextPageToken,files(id,name,mimeType,trashed,webViewLink)');
});

test('Drive query escapes apostrophes in name hints', () => {
  const url = new URL(buildFilesListUrl({ nameHint: "民法'Ⅱ" }));
  assert.match(url.searchParams.get('q'), /name contains '民法\\'Ⅱ'/);
});

test('availability requires exact filename and PDF mime type', () => {
  const matched = matchDriveFiles(entries, [
    { id: 'ok', name: '民法Ⅱ14.pdf', mimeType: 'application/pdf', trashed: false, webViewLink: 'https://drive.google.com/file/d/ok/view' },
    { id: 'similar', name: '民法Ⅱ14 copy.pdf', mimeType: 'application/pdf', trashed: false, webViewLink: 'https://drive.google.com/file/d/similar/view' },
    { id: 'wrong-type', name: '民法Ⅱ15.pdf', mimeType: 'text/plain', trashed: false, webViewLink: 'https://drive.google.com/file/d/wrong/view' },
    { id: 'trashed', name: '民法Ⅱ15.pdf', mimeType: 'application/pdf', trashed: true, webViewLink: 'https://drive.google.com/file/d/trash/view' }
  ]);
  assert.equal(matched.get('民法Ⅱ14.pdf').id, 'ok');
  assert.equal(matched.has('民法Ⅱ15.pdf'), false);
});

test('duplicate exact filenames resolve deterministically to the first returned file', () => {
  const matched = matchDriveFiles([{ driveFileName: '民法Ⅱ14.pdf' }], [
    { id: 'first', name: '民法Ⅱ14.pdf', mimeType: 'application/pdf', trashed: false },
    { id: 'second', name: '民法Ⅱ14.pdf', mimeType: 'application/pdf', trashed: false }
  ]);
  assert.equal(matched.get('民法Ⅱ14.pdf').id, 'first');
});

test('listPdfMetadata follows pagination and sends bearer token without requesting file bodies', async () => {
  const calls = [];
  const responses = [
    { nextPageToken: 'p2', files: [{ id: '1', name: '民法Ⅱ14.pdf', mimeType: 'application/pdf', trashed: false, webViewLink: 'view-1' }] },
    { files: [{ id: '2', name: '民法Ⅱ15.pdf', mimeType: 'application/pdf', trashed: false, webViewLink: 'view-2' }] }
  ];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    const body = responses.shift();
    return { ok: true, async json() { return body; } };
  };

  const files = await listPdfMetadata('token-123', { nameHint: '民法Ⅱ', fetchImpl });
  assert.deepEqual(files.map((file) => file.id), ['1', '2']);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer token-123');
  assert.equal(new URL(calls[1].url).searchParams.get('pageToken'), 'p2');
  assert.ok(calls.every((call) => call.options.method === 'GET'));
});

test('token controller keeps access token only in memory and uses the readonly scope', async () => {
  let config = null;
  let override = null;
  const fakeGoogle = {
    accounts: {
      oauth2: {
        initTokenClient(value) {
          config = value;
          return {
            requestAccessToken(valueOverride) {
              override = valueOverride;
              config.callback({ access_token: 'temporary-token', expires_in: 3600, scope: DRIVE_METADATA_SCOPE });
            }
          };
        }
      }
    }
  };

  const controller = createTokenController({ clientId: 'client-id.apps.googleusercontent.com', googleApi: fakeGoogle, now: () => 1000 });
  const token = await controller.requestAccessToken();
  assert.equal(config.client_id, 'client-id.apps.googleusercontent.com');
  assert.equal(config.scope, DRIVE_METADATA_SCOPE);
  assert.equal(token, 'temporary-token');
  assert.equal(controller.getAccessToken(), 'temporary-token');
  assert.equal(override.prompt, '');
  controller.clear();
  assert.equal(controller.getAccessToken(), null);
  assert.equal('refreshToken' in controller, false);
});
