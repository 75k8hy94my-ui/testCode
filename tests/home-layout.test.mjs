import test from 'node:test';
import assert from 'node:assert/strict';
import HomeLayout from '../home-layout.js';

const types = (home, profile) => home.layouts[profile].cards.map((card) => card.type);

test('home defaults create independent mobile tablet and desktop profiles', () => {
  const home = HomeLayout.createDefaultHome();
  assert.deepEqual(Object.keys(home.layouts), ['mobile', 'tablet', 'desktop']);
  assert.deepEqual(types(home, 'mobile'), ['continue', 'today-study', 'apps']);
  assert.notEqual(home.layouts.mobile.cards, home.layouts.tablet.cards);
});

test('editing one profile does not mutate other profiles or input', () => {
  const before = HomeLayout.createDefaultHome();
  const after = HomeLayout.moveCard(before, 'mobile', 'apps', 0);
  assert.equal(after.layouts.mobile.cards[0].id, 'apps');
  assert.deepEqual(after.layouts.tablet, before.layouts.tablet);
  assert.deepEqual(before, HomeLayout.createDefaultHome());
});

test('settings and size are profile-local and an explicit empty profile stays empty', () => {
  const before = HomeLayout.createDefaultHome();
  const changed = HomeLayout.updateCardSettings(
    HomeLayout.resizeCard(before, 'tablet', 'continue', 'large'),
    'tablet', 'continue', { sample: true }
  );
  assert.equal(changed.layouts.tablet.cards.find((x) => x.id === 'continue').size, 'large');
  assert.deepEqual(changed.layouts.tablet.cards.find((x) => x.id === 'continue').settings, { sample: true });
  assert.deepEqual(changed.layouts.mobile, before.layouts.mobile);
  const empty = HomeLayout.normalizeHome({ version: 1, layouts: { mobile: { cards: [] } } });
  assert.deepEqual(empty.layouts.mobile.cards, []);
});

test('profile override wins over automatic classification', () => {
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: 'desktop' }), 'desktop');
  assert.equal(HomeLayout.resolveProfile({ width: 390, maxTouchPoints: 5, override: null }), 'mobile');
  assert.equal(HomeLayout.resolveProfile({ width: 820, maxTouchPoints: 5, override: null }), 'tablet');
  assert.equal(HomeLayout.resolveProfile({ width: 1440, maxTouchPoints: 0, override: null }), 'desktop');
});

test('add remove move resize and reset keep normalized independent state', () => {
  let home = HomeLayout.createDefaultHome();
  home = HomeLayout.addCard(home, 'mobile', { id: 'weather', type: 'weather', size: 'small', settings: { city: 'Tokyo' } });
  assert.equal(home.layouts.mobile.cards.at(-1).type, 'weather');
  home = HomeLayout.resizeCard(home, 'mobile', 'weather', 'large');
  assert.equal(home.layouts.mobile.cards.at(-1).size, 'large');
  home = HomeLayout.removeCard(home, 'mobile', 'weather');
  assert.equal(home.layouts.mobile.cards.some((x) => x.id === 'weather'), false);
  home = HomeLayout.resetProfile(HomeLayout.moveCard(home, 'mobile', 'apps', 0), 'mobile');
  assert.deepEqual(types(home, 'mobile'), ['continue', 'today-study', 'apps']);
});
