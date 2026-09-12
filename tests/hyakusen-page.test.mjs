import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../hyakusen.html', import.meta.url), 'utf8').catch(() => '');
const spa = await readFile(new URL('../home-profile-spa.js', import.meta.url), 'utf8').catch(() => '');
const shellCss = await readFile(new URL('../home-profile-shell.css', import.meta.url), 'utf8').catch(() => '');
const page = await readFile(new URL('../hyakusen-page.js', import.meta.url), 'utf8').catch(() => '');
const surface = html + '\n' + spa;

test('Hyakusen page is authenticated, vault-gated, and loads only read-only Drive integration modules', () => {
  assert.match(html, /<html[^>]*class="auth-pending"/);
  assert.match(surface, /https:\/\/accounts\.google\.com\/gsi\/client/);
  for (const script of ['supabase-config.js', 'vault-session.js', 'hyakusen-catalog.js', 'hyakusen-drive.js', 'hyakusen-page.js']) {
    assert.match(surface, new RegExp(script.replace('.', '\\.')));
  }
  assert.match(page, /Vault\.loadSession\(\)/);
  assert.match(page, /window\.location\.replace\('index\.html'\)/);
  assert.match(page, /Vault\.loadActive\(\)/);
  assert.match(page, /window\.location\.replace\('sync\.html'\)/);
});

test('Hyakusen page exposes collection, edition, OAuth client id, Drive connect, and numbered-list controls', () => {
  for (const id of ['collectionSelect', 'editionSelect', 'googleClientId', 'connectDriveBtn', 'driveStatus', 'hyakusenList']) {
    assert.match(spa, new RegExp(`id="${id}"`));
  }
  assert.match(html, /href="index-search\.html"/);
  assert.match(spa, /Google Driveに接続/);
  assert.match(spa, /百選データ未登録|判例百選/);
});

test('OAuth client id may persist locally but access tokens never do', () => {
  assert.match(page, /hyakusenGoogleOAuthClientId/);
  assert.match(page, /localStorage\.setItem\(CLIENT_ID_KEY/);
  assert.doesNotMatch(page, /localStorage\.setItem\([^\n]*(?:access.?token|refresh.?token)/i);
  assert.doesNotMatch(page, /sessionStorage\.setItem\([^\n]*(?:access.?token|refresh.?token)/i);
  assert.doesNotMatch(page, /MangaVault.*(?:access.?token|refresh.?token)/i);
});

test('Drive availability distinguishes exact matches and keeps unavailable rows dimmed and non-clickable', () => {
  assert.match(page, /Drive\.matchDriveFiles\(/);
  assert.match(page, /data-drive-state|dataset\.driveState/);
  assert.match(shellCss, /\[data-drive-state="(?:missing|unverified)"\][^{]*\{[^}]*opacity/s);
  assert.match(page, /window\.open\([^,]+,[^,]+,[^)]*noopener/i);
  assert.match(page, /webViewLink/);
});

test('empty authoritative catalog shows a data-not-registered state instead of fabricated cases', () => {
  assert.match(page, /百選データ未登録/);
  assert.match(page, /Catalog\.collections\(\)/);
});
