(()=>{
'use strict';
const HOME_LAYOUT_KEY = 'mangaReaderHomeCards';
const STATUTES_CARD_MIGRATION_KEY = 'mangaReaderHomeStatutesCardAddedV1';
const LEGACY_DEFAULT_CARD_IDS = ['bookshelf'];
const DEFAULT_CARD_IDS = ['manga','video','statutes'];
const CARD_CATALOG = Object.freeze({
  manga: Object.freeze({ id: 'manga', title: '漫画', kind: 'internal', href: 'manga.html', badge: 'APP' }),
  video: Object.freeze({ id: 'video', title: '動画', kind: 'internal', href: 'video.html', badge: 'APP' }),
  statutes: Object.freeze({ id: 'statutes', title: '逐条集', kind: 'internal', href: 'statutes.html', badge: 'APP' }),
});
const isKnownCard = (id) => Object.prototype.hasOwnProperty.call(CARD_CATALOG, id);
// Home navigation is fixed. Vault-restored legacy card layouts must not hide routes.
function normalizeLayout() { return DEFAULT_CARD_IDS.slice(); }
function isLegacyDefaultLayout() { return false; }
function addCard() { return DEFAULT_CARD_IDS.slice(); }
function removeCard() { return DEFAULT_CARD_IDS.slice(); }
function moveCard() { return DEFAULT_CARD_IDS.slice(); }
function hiddenCardIds() { return []; }
function loadLayout() { return DEFAULT_CARD_IDS.slice(); }
function saveLayout() { return DEFAULT_CARD_IDS.slice(); }
const api = { HOME_LAYOUT_KEY, LEGACY_DEFAULT_CARD_IDS, DEFAULT_CARD_IDS, CARD_CATALOG, normalizeLayout, isLegacyDefaultLayout, addCard, removeCard, moveCard, hiddenCardIds, loadLayout, saveLayout };
if (typeof window !== 'undefined') window.MangaReaderHome = api;
if (typeof module !== 'undefined') module.exports = api;
})();
