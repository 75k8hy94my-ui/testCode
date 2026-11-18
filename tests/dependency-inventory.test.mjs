import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDependencies, renderReport } from '../scripts/report-dependencies.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('inventory follows real HTML, dynamic loader, API and storage boundaries', () => {
  const report = inspectDependencies(ROOT);
  assert.ok(report.pages['reader.html'].includes('reader-runtime.js'));
  assert.ok(!report.pages['reader.html'].includes('manga-list-route.js'));
  assert.ok(report.pages['video.html'].includes('home-profile-spa.js'));
  assert.ok(report.pages['statutes.html'].includes('statutes-page.css'));
  assert.ok(report.pages['statutes.html'].includes('statutes-page-interactions.js'));
  assert.ok(report.dynamic['video-list-route.js'].includes('video-library-view.js'));
  assert.ok(report.dynamic['video-list-route.js'].includes('video-library.css'));
  assert.ok(report.globalDefinitions.MangaReaderVideoLibraryView.includes('video-library-view.js'));
  assert.ok(report.storageKeys['video-library.js'].includes('mangaReaderVideos'));
  assert.ok(report.events['video-library.js'].listens.includes('manga-video-list-route-detach'));
  assert.ok(Array.isArray(report.explicitCycles));
});

test('inventory documents limits and includes a usable report', () => {
  const report = renderReport(inspectDependencies(ROOT));
  assert.match(report, /not a complete runtime call graph/);
  assert.match(report, /reader\.html/);
  assert.match(report, /video-library-view\.js/);
});
