import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (file) => fs.readFileSync(file, 'utf8');
const write = (file, value) => fs.writeFileSync(file, value);
const run = (args, expectSuccess = true) => {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if ((result.status === 0) !== expectSuccess) {
    throw new Error(`unexpected result: node ${args.join(' ')} status=${result.status}`);
  }
};
function countOf(source, needle) {
  return source.split(needle).length - 1;
}
function replaceOnce(file, before, after) {
  const source = read(file);
  const count = countOf(source, before);
  if (count !== 1) throw new Error(`${file}: expected exactly one match for ${JSON.stringify(before)}, found ${count}`);
  write(file, source.replace(before, after));
}
function replaceAllChecked(file, before, after, minCount = 1) {
  const source = read(file);
  const count = countOf(source, before);
  if (count < minCount) throw new Error(`${file}: expected at least ${minCount} matches for ${JSON.stringify(before)}, found ${count}`);
  write(file, source.split(before).join(after));
}

// RED: update the old locked-vault expectation and add the new routing contract
// before changing production code.
{
  const file = 'tests/study-page.test.mjs';
  const source = read(file);
  const before = 'sync\\.html';
  if (countOf(source, before) !== 1) throw new Error('study auth routing expectation was not found exactly once');
  write(file, source.replace(before, 'home\\.html'));
}
{
  const file = 'tests/static-regression.test.mjs';
  let source = read(file);
  const marker = "test('authenticated app routing uses Home and direct Continue targets'";
  if (source.includes(marker)) throw new Error('Task 5 routing regression test already exists');
  source += `\n\ntest('authenticated app routing uses Home and direct Continue targets',()=>{\n  const index=read('index.html'),reader=read('reader.html'),study=read('study.html');\n  assert.ok(!index.includes('function goReader('));\n  assert.ok(index.includes(\"function goHome() { window.location.replace('home.html'); }\"));\n  assert.ok(reader.includes(\"const vaultUrl = 'home.html';\"));\n  assert.ok(study.includes(\"window.location.replace('home.html')\"));\n  assert.ok(reader.includes('id=\"homeBtn\"'));\n  assert.ok(reader.includes('id=\"mobileNavHome\"'));\n  assert.ok(reader.includes(\"window.location.href='home.html'\"));\n  assert.ok(study.includes('id=\"studyNavAppHome\"'));\n  assert.ok(study.includes(\"window.location.href='home.html'\"));\n  assert.ok(reader.includes(\"new URL(location.href).searchParams.get('item')\"));\n  assert.ok(reader.includes('savedItems.find((item) => item.id === requestedItemId)'));\n  assert.ok(reader.includes('openItem(requestedItem, false)'));\n  assert.ok(reader.includes('resumedOnLoad ? null : localStorage.getItem(LAST_URL_KEY)'));\n});\n`;
  write(file, source);
}
run(['--test', 'tests/static-regression.test.mjs', 'tests/study-page.test.mjs'], false);

// GREEN: account authentication always continues to Home.
replaceOnce(
  'index.html',
  "    function goReader() { window.location.replace('reader.html'); }",
  "    function goHome() { window.location.replace('home.html'); }"
);
replaceAllChecked('index.html', 'goReader();', 'goHome();', 3);
if (read('index.html').includes('goReader')) throw new Error('index.html still contains goReader');

// Locked protected pages now use Home as the vault gate.
replaceOnce('reader.html', "  const vaultUrl = 'sync.html';", "  const vaultUrl = 'home.html';");
replaceOnce('study.html', "window.location.replace('sync.html')", "window.location.replace('home.html')");

// Reader: visible Home actions on both the top bar and mobile utility menu.
replaceOnce(
  'reader.html',
  '  <div id="topbar">\n    <button class="ctrlBtn" id="themeBtn"',
  '  <div id="topbar">\n    <button class="ctrlBtn" id="homeBtn" type="button" title="Homeへ戻る">Home</button>\n    <button class="ctrlBtn" id="themeBtn"'
);
replaceOnce(
  'reader.html',
  '<div id="mobileUtilityMenu" role="menu" aria-label="その他の操作" hidden>\n  <button id="mobileNavLinks" type="button" role="menuitem">リンク管理</button>',
  '<div id="mobileUtilityMenu" role="menu" aria-label="その他の操作" hidden>\n  <button id="mobileNavHome" type="button" role="menuitem">Home</button>\n  <button id="mobileNavLinks" type="button" role="menuitem">リンク管理</button>'
);
replaceOnce(
  'reader.html',
  "  els.safeModeBtn.addEventListener('click', toggleSafeMode);",
  "  document.getElementById('homeBtn').addEventListener('click', () => { window.location.href='home.html'; });\n  document.getElementById('mobileNavHome').addEventListener('click', () => { window.location.href='home.html'; });\n  els.safeModeBtn.addEventListener('click', toggleSafeMode);"
);

// Reader: a Continue-card item query wins over ordinary last-item resume.
replaceOnce(
  'reader.html',
  "  let resumedOnLoad = false;\n  try {\n    const raw = localStorage.getItem(LAST_URL_KEY);",
  "  let resumedOnLoad = false;\n  const requestedItemId = new URL(location.href).searchParams.get('item');\n  const requestedItem = requestedItemId && savedItems.find((item) => item.id === requestedItemId);\n  if (requestedItem) { openItem(requestedItem, false); resumedOnLoad = true; }\n  try {\n    const raw = resumedOnLoad ? null : localStorage.getItem(LAST_URL_KEY);"
);

// Study: add an app-level Home destination while preserving its existing
// internal 学習ホーム route and browser-history routing.
replaceOnce(
  'study.html',
  'grid-template-columns:repeat(5,minmax(0,1fr))',
  'grid-template-columns:repeat(6,minmax(0,1fr))'
);
replaceOnce(
  'study.html',
  '<nav id="studyBottomNav" aria-label="学習ナビ">',
  '<nav id="studyBottomNav" aria-label="学習ナビ"><button class="studyNavBtn" id="studyNavAppHome" type="button" aria-label="アプリHome"><svg class="navIcon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h8"/></svg><span>アプリ</span></button>'
);
replaceOnce(
  'study.html',
  "all('[data-route]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.route)));",
  "$('studyNavAppHome').onclick=()=>{window.location.href='home.html'};all('[data-route]').forEach(b=>b.addEventListener('click',()=>route(b.dataset.route)));"
);

run(['--test', 'tests/static-regression.test.mjs', 'tests/study-page.test.mjs'], true);
run(['--test', 'tests/home-page.test.mjs'], true);
