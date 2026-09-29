(function initCityDaysArcadeGames(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CityDaysArcadeGames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createArcadeGames() {
  'use strict';

  const PLAY_COST = 300;
  const PLAY_DURATION = 5;
  const PRIZE_CATALOG = Object.freeze([
    Object.freeze({ id:'mame-doll', name:'まめ柴ぬいぐるみ', position:12, color:'#d99c74' }),
    Object.freeze({ id:'soda-cat', name:'クリームソーダ猫', position:27, color:'#73b8a4' }),
    Object.freeze({ id:'star-rabbit', name:'星うさぎ', position:42, color:'#a99ad2' }),
    Object.freeze({ id:'pudding-bear', name:'プリンくま', position:58, color:'#e6c56c' }),
    Object.freeze({ id:'melon-frog', name:'メロンかえる', position:73, color:'#83aa68' }),
    Object.freeze({ id:'night-owl', name:'よるふくろう', position:88, color:'#7189ac' })
  ]);
  const prizeById = new Map(PRIZE_CATALOG.map((prize) => [prize.id, prize]));
  const clampInteger = (value, max) => Number.isSafeInteger(value) && value >= 0 ? Math.min(value, max) : 0;

  function createProgress() {
    return { plays:0, wins:0, prizes:Object.fromEntries(PRIZE_CATALOG.map(({ id }) => [id, 0])), activePlay:false };
  }

  function normalizeProgress(value) {
    const result = createProgress();
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    result.plays = clampInteger(value.plays, 1000000);
    result.wins = Math.min(result.plays, clampInteger(value.wins, result.plays));
    let remainingPrizes = result.wins;
    for (const { id } of PRIZE_CATALOG) {
      result.prizes[id] = Math.min(remainingPrizes, clampInteger(value.prizes?.[id], 100000));
      remainingPrizes -= result.prizes[id];
    }
    result.activePlay = value.activePlay === true;
    return result;
  }

  function startPlay(progress, cash) {
    const normalized = normalizeProgress(progress);
    if (!Number.isSafeInteger(cash) || cash < 0) return { ok:false, reason:'invalid-cash' };
    if (normalized.activePlay) return { ok:false, reason:'play-in-progress' };
    if (cash < PLAY_COST) return { ok:false, reason:'insufficient-funds' };
    normalized.activePlay = true;
    return { ok:true, progress:normalized, cashRemaining:Math.floor(cash) - PLAY_COST, cost:PLAY_COST };
  }

  function resolvePlay(progress, stopPosition, randomValue) {
    const normalized = normalizeProgress(progress);
    if (!normalized.activePlay) return { ok:false, reason:'no-active-play' };
    if (!Number.isFinite(stopPosition) || stopPosition < 0 || stopPosition > 100 ||
        !Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      return { ok:false, reason:'invalid-input' };
    }

    const target = PRIZE_CATALOG.reduce((nearest, prize) =>
      Math.abs(prize.position - stopPosition) < Math.abs(nearest.position - stopPosition) ? prize : nearest);
    const offset = Math.abs(target.position - stopPosition);
    const successChance = Math.max(0, .82 - offset * .075);
    const won = offset <= 10 && randomValue < successChance;
    normalized.plays += 1;
    normalized.activePlay = false;
    if (won) {
      normalized.wins += 1;
      normalized.prizes[target.id] = Math.min(100000, normalized.prizes[target.id] + 1);
    }
    return { ok:true, progress:normalized, won, prize:won ? { ...target } : null, successChance };
  }

  function listCollection(progress) {
    const normalized = normalizeProgress(progress);
    return PRIZE_CATALOG.map((prize) => ({ ...prize, count:normalized.prizes[prize.id] }));
  }

  return Object.freeze({ PLAY_COST, PLAY_DURATION, PRIZE_CATALOG, createProgress, normalizeProgress, startPlay, resolvePlay, listCollection });
});
