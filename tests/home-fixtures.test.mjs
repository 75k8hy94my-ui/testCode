import test from 'node:test';
import assert from 'node:assert/strict';
import homeFixtures from '../game/home-fixtures.js';

test('all fixed home furniture exposes one shared visual, collision, and interaction definition', () => {
  const fixtures = homeFixtures.FIXTURES;
  for (const id of ['bed','dining-table','low-table','sofa','tv','kitchen','closet','shower','pet','entry']) {
    const fixture = fixtures.find((value) => value.id === id);
    assert.ok(fixture, id + ' fixture should be defined');
    assert.ok(fixture.visuals.length > 0, id + ' should render from fixture geometry');
    if (fixture.interaction) assert.ok(Number.isFinite(fixture.interaction.x) && Number.isFinite(fixture.interaction.y));
    for (const visual of fixture.visuals.filter((value) => value.solid === true)) {
      assert.ok(fixture.collisions.some((collision) => homeFixtures.containsVisual(collision, visual)), id + ' visual extents need matching collision coverage');
    }
  }
});

test('dividers use the same centerline and thickness for their drawn stroke and collision capsule', () => {
  const dividers = homeFixtures.FIXTURES.filter((fixture) => fixture.id.startsWith('divider-'));
  assert.equal(dividers.length, 2);
  for (const divider of dividers) {
    const visual = divider.visuals.find((value) => value.kind === 'line');
    const collision = divider.collisions.find((value) => value.kind === 'segment');
    assert.deepEqual(collision?.from, visual?.from);
    assert.deepEqual(collision?.to, visual?.to);
    assert.equal(collision?.thickness, visual?.thickness);
  }
});

test('decorative and entry floor visuals remain non-solid and the television approach stays open', () => {
  const entry = homeFixtures.FIXTURES.find((fixture) => fixture.id === 'entry');
  assert.ok(entry.visuals.every((visual) => visual.solid === false));
  const tv = homeFixtures.FIXTURES.find((fixture) => fixture.id === 'tv');
  assert.equal(homeFixtures.collidesCircle(tv.interaction.x, tv.interaction.y, 10, homeFixtures.ALL_COLLIDERS), false);
});


test('decorative entry cannot shadow the actionable exit at the shared doorway', () => {
  const entry = homeFixtures.FIXTURES.find((fixture) => fixture.id === 'entry');
  const exit = homeFixtures.FIXTURES.find((fixture) => fixture.id === 'exit');
  assert.equal(entry?.interaction, null);
  assert.ok(exit?.interaction);
  assert.equal(exit.interaction.x, 390);
  assert.equal(exit.interaction.y, 438);
  assert.equal(exit.interaction.range, 62);
});
