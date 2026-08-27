import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop video destination deep-links directly to the video list', () => {
  const rail = read('app-desktop-rail.js');
  assert.match(rail, /desktopNavVideo/);
  assert.match(rail, /reader\.html#screen=video-list/);
});

test('reader startup honors an explicit screen route before resume and default-list logic', () => {
  const reader = read('reader.html');
  assert.match(reader, /const requestedScreenOnLoad = getReaderScreenFromLocation\(\);/);
  assert.match(reader, /if \(!requestedScreenOnLoad\) \{[\s\S]*localStorage\.getItem\(LAST_URL_KEY\)/);
  assert.match(reader, /if \(!requestedScreenOnLoad && !resumedOnLoad\) openSavedList\(true\);/);
});

test('reader location parser recognizes the video-list route', () => {
  const reader = read('reader.html');
  assert.match(reader, /'video-list': els\.savedListOverlay/);
  assert.match(reader, /if \(currentReaderScreen === 'video-list'\)\s*\{\s*switchListTab\('video'\);/);
});

test('direct saved-list routes hydrate the bookshelf before showing the manga tab', () => {
  const reader = read('reader.html');
  assert.match(reader, /else if \(currentReaderScreen === 'saved-list'\)\s*\{\s*renderSavedList\(\);\s*switchListTab\('manga'\);/);
});

test('direct author-card routes hydrate author cards and derived authors', () => {
  const reader = read('reader.html');
  assert.match(reader, /else if \(currentReaderScreen === 'author-cards'\)\s*\{[\s\S]*syncAuthorCardsFromSavedItems\(\);[\s\S]*renderAuthorCards\(\);/);
});

test('author cards no longer expose a redundant close button', () => {
  const reader = read('reader.html');
  assert.doesNotMatch(reader, /id=['"]closeAuthorCardBtn['"]/);
  assert.doesNotMatch(reader, /closeAuthorCardBtn:/);
  assert.doesNotMatch(reader, /els\.closeAuthorCardBtn\.addEventListener/);
});
