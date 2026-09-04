import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');

test('desktop app pages use the shared 920px content width', () => {
  const rail = read('app-desktop-rail.js');
  assert.match(rail, /--app-desktop-content-max:\s*920px/);

  const indexSearch = read('index-search.html');
  assert.match(indexSearch, /\.indexShell\{width:min\(100% - 24px,920px\)/);

  const hyakusen = read('hyakusen.html');
  assert.match(hyakusen, /\.shell\{width:min\(920px,100%\)/);
});

test('study desktop views expand to the same 920px content width', () => {
  const studyData = read('study-data.js');
  assert.match(studyData, /studyDesktopLayoutStyles/);
  assert.match(studyData, /@media \(min-width: 900px\)/);
  assert.match(studyData, /body\.top-level-nav\s*\{[^}]*padding-left:\s*144px/);
  assert.match(studyData, /body\.top-level-nav #studyApp\s*\{[^}]*width:\s*min\(100%,\s*920px\)/);
  assert.match(studyData, /\.lessonLauncher,\s*\.quizShell\s*\{[^}]*width:\s*100%/);
  assert.match(studyData, /\.lessonLauncher,\s*\.quizShell\s*\{[^}]*max-width:\s*920px/);
});
