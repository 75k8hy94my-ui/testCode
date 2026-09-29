(function initCityDaysLibraryReading(root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.CityDaysLibraryReading = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createLibraryReadingApi() {
  "use strict";

  const MAX_LOANS = 3;
  const CHAPTERS_PER_BOOK = 3;
  const BOOKS = Object.freeze([
    Object.freeze({ id:"wakaba-kitchen-basics", title:"はじめての家庭料理", skill:"cooking", skillGain:3, completionFun:0 }),
    Object.freeze({ id:"home-sewing", title:"暮らしの手芸", skill:"craft", skillGain:3, completionFun:0 }),
    Object.freeze({ id:"gentle-walking", title:"やさしい健康ウォーキング", skill:"exercise", skillGain:3, completionFun:0 }),
    Object.freeze({ id:"rainy-platform", title:"雨の停留所", skill:null, skillGain:0, completionFun:12 })
  ]);
  const BOOK_BY_ID = new Map(BOOKS.map((book) => [book.id, book]));

  function createProgress() {
    return { loans:[], completedBookIds:[] };
  }

  function normalizeProgress(value) {
    const source = value && typeof value === "object" ? value : {};
    const loans = [];
    const seenLoans = new Set();
    for (const entry of Array.isArray(source.loans) ? source.loans : []) {
      if (!entry || typeof entry !== "object" || !BOOK_BY_ID.has(entry.bookId) || seenLoans.has(entry.bookId)) continue;
      if (loans.length >= MAX_LOANS) break;
      const rawChapters = entry.chaptersRead;
      const chaptersRead = Number.isInteger(rawChapters) && rawChapters >= 0 && rawChapters <= CHAPTERS_PER_BOOK
        ? rawChapters
        : 0;
      loans.push({ bookId:entry.bookId, chaptersRead });
      seenLoans.add(entry.bookId);
    }
    const completedBookIds = [];
    const seenCompleted = new Set();
    for (const id of Array.isArray(source.completedBookIds) ? source.completedBookIds : []) {
      if (typeof id !== "string" || !BOOK_BY_ID.has(id) || seenCompleted.has(id)) continue;
      completedBookIds.push(id);
      seenCompleted.add(id);
    }
    return { loans, completedBookIds };
  }

  function failure(progress, reason) {
    return { ok:false, reason, progress:normalizeProgress(progress) };
  }

  function borrow(progress, bookId) {
    const current = normalizeProgress(progress);
    if (!BOOK_BY_ID.has(bookId)) return failure(current,"unknown-book");
    if (current.loans.some((loan) => loan.bookId === bookId)) return failure(current,"already-borrowed");
    if (current.loans.length >= MAX_LOANS) return failure(current,"loan-limit");
    return { ok:true, progress:{ ...current, loans:[...current.loans,{ bookId, chaptersRead:0 }] } };
  }

  function readChapter(progress, bookId) {
    const current = normalizeProgress(progress);
    const loan = current.loans.find((entry) => entry.bookId === bookId);
    if (!loan) return failure(current,"not-borrowed");
    if (loan.chaptersRead >= CHAPTERS_PER_BOOK) return failure(current,"book-complete");
    const book = BOOK_BY_ID.get(bookId);
    const chapter = loan.chaptersRead + 1;
    const bookComplete = chapter === CHAPTERS_PER_BOOK;
    const firstCompletion = bookComplete && !current.completedBookIds.includes(bookId);
    const completionReward = firstCompletion
      ? { skill:book.skill, skillGain:book.skillGain, fun:book.completionFun }
      : null;
    return {
      ok:true,
      chapter,
      chaptersRead:chapter,
      bookComplete,
      completionReward,
      progress:{
        ...current,
        loans:current.loans.map((entry) => entry.bookId === bookId ? { bookId, chaptersRead:chapter } : entry),
        completedBookIds:firstCompletion ? [...current.completedBookIds,bookId] : current.completedBookIds
      }
    };
  }

  function returnBook(progress, bookId) {
    const current = normalizeProgress(progress);
    if (!current.loans.some((loan) => loan.bookId === bookId)) return failure(current,"not-borrowed");
    return { ok:true, progress:{ ...current, loans:current.loans.filter((loan) => loan.bookId !== bookId) } };
  }

  return Object.freeze({ BOOKS, createProgress, normalizeProgress, borrow, readChapter, returnBook });
});
