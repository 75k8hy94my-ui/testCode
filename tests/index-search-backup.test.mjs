import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('index search page loads the v3 backup format and dedicated backup bridge', () => {
  const html = read('index-search.html');
  assert.match(html, /<script src="backup-format\.js"><\/script>/);
  assert.match(html, /<script src="index-search-backup\.js"><\/script>/);
  assert.ok(html.indexOf('backup-format.js') < html.indexOf('index-search-backup.js'));
});

test('backup bridge exports existing vault data plus portable plaintext index books only on user download', () => {
  const source = read('index-search-backup.js');
  assert.match(source, /MangaReaderBackup\.createBackup/);
  assert.match(source, /MangaVaultPayload\.buildFromLocalStorage/);
  assert.match(source, /IndexSearchPage\.getBooks\(\)/);
  assert.match(source, /normalizePortableIndexBook/);
  assert.match(source, /new Blob/);
  assert.match(source, /URL\.createObjectURL/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(indexBooks|matterEntries|caseEntries|statuteEntries)/i);
});

test('restore validates the complete package, assigns fresh identities and encrypts every restored book before cache persistence', () => {
  const source = read('index-search-backup.js');
  assert.match(source, /migrateBackupPackage/);
  assert.match(source, /LegalIndexSchema\.validateBookFile/);
  assert.match(source, /crypto\.randomUUID\(\)/);
  assert.match(source, /LegalIndexSchema\.createIndexBookChunk/);
  assert.match(source, /EncryptedChunkCrypto\.encryptChunk/);
  assert.match(source, /revision:\s*0/);
  assert.match(source, /pendingAction:\s*['"]upsert['"]/);
  assert.match(source, /cache\.put/);
});

test('restore replaces old corpus with revisioned tombstones and retains rollback snapshots', () => {
  const source = read('index-search-backup.js');
  assert.match(source, /previousVaultPayload/);
  assert.match(source, /previousCacheRecords/);
  assert.match(source, /pendingAction:\s*['"]delete['"]/);
  assert.match(source, /MangaVault\.savePayload/);
  assert.match(source, /MangaVaultPayload\.applyToLocalStorage/);
  assert.match(source, /restoreCacheSnapshot/);
  assert.match(source, /IndexSearchPage\.reload\(\)/);
  assert.match(source, /IndexSearchPage\.sync\(\)/);
});

test('backup bridge is syntactically valid classic JavaScript', () => {
  new vm.Script(read('index-search-backup.js'), { filename: 'index-search-backup.js' });
});
