import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HomeLayout = require('../home-layout.js');
const read = (file) => fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');

const homeHtml = read('home.html');
const homeJs = read('home.js');
const index = read('index.html');
const reader = read('reader.html');
const study = read('study.html');
const payload = read('vault-payload.js');
const backup = read('backup-format.js');
const cards = read('home-cards.js');
const localCards = read('home-local-cards.js');

// Canonical entry / vault gate.
assert.ok(index.includes("window.location.replace('home.html')"));
assert.ok(!index.includes('function goReader('));
assert.ok(reader.includes("const vaultUrl = 'home.html';"));
assert.ok(study.includes("window.location.replace('home.html')"));
assert.ok(homeJs.includes('MangaVault.loadActive()'));
assert.ok(homeJs.includes('MangaVaultGate.createController'));
assert.ok(homeHtml.includes('id="vaultGateHost"'));
assert.ok(homeHtml.includes('id="recoveryContinueBtn"'));
assert.ok(homeHtml.includes('復旧キーを保存した'));

// Three independent synced profiles plus local-only override.
const defaults = HomeLayout.createDefaultHome();
assert.deepEqual(Object.keys(defaults.layouts), ['mobile', 'tablet', 'desktop']);
const moved = HomeLayout.moveCard(defaults, 'mobile', 'apps', 0);
assert.notDeepEqual(moved.layouts.mobile, defaults.layouts.mobile);
assert.deepEqual(moved.layouts.tablet, defaults.layouts.tablet);
assert.deepEqual(moved.layouts.desktop, defaults.layouts.desktop);
assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: 'desktop' }), 'desktop');
assert.ok(payload.includes("home: 'mangaReaderHome'"));
assert.ok(backup.includes('normalizeHome'));
assert.ok(!payload.includes('mangaReaderHomeDeviceProfileOverride'));

// Editable shell remains reachable independently of card content.
assert.ok(homeHtml.indexOf('id="homeEditBtn"') < homeHtml.indexOf('id="homeGrid"'));
for (const method of ['addCard', 'removeCard', 'moveCard', 'resizeCard', 'updateCardSettings', 'resetProfile']) {
  assert.ok(homeJs.includes('MangaHomeLayout.' + method));
}
assert.ok(homeJs.includes('setTimeout(flushCloudSave,750)'));
assert.ok(homeJs.includes('MangaVault.savePayload(MangaVaultPayload.buildFromLocalStorage())'));
assert.ok(homeJs.includes('PROFILE_OVERRIDE_KEY'));

// Curated card registry and three local cards.
assert.ok(cards.includes('createRegistry'));
assert.ok(cards.includes('このカードは現在利用できません'));
for (const type of ['continue', 'today-study', 'apps']) assert.ok(localCards.includes("type:'" + type + "'"));
assert.ok(localCards.includes("reader.html?item="));
assert.ok(localCards.includes('nextReviewAt'));

// Continue target wins over normal reader resume, and navigation back to Home exists.
assert.ok(reader.includes("new URL(location.href).searchParams.get('item')"));
assert.ok(reader.includes('openItem(requestedItem, false)'));
assert.ok(reader.includes('resumedOnLoad ? null : localStorage.getItem(LAST_URL_KEY)'));
assert.ok(reader.includes('id="homeBtn"'));
assert.ok(reader.includes('id="mobileNavHome"'));
assert.ok(study.includes('id="studyNavAppHome"'));
assert.ok(study.includes("window.location.href='home.html'"));
assert.ok(study.includes('history.pushState'));
assert.ok(study.includes('history.replaceState'));

console.log('Home core requirement verification passed');
