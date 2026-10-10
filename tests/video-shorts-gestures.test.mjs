import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../video-shorts-page.js', import.meta.url), 'utf8');

test('vertical swipes navigate entries; horizontal movement never seeks', () => {
  assert.match(page, /handlePointerDown/);
  assert.match(page, /Math\.abs\(dy\)/);
  assert.match(page, /goTo\(queueIndex \+ \(dy > 0 \? -1 : 1\), 'vertical-swipe'\)/);
  assert.match(page, /Math\.abs\(dx\)[\s\S]{0,240}history\.back/);
  assert.doesNotMatch(page, /activeVideo\.currentTime\s*[+-]=\s*dx/);
});

test('video hold pauses only during the hold and long-press scrubbing uses a paused duplicate preview', () => {
  assert.match(page, /beginScrub/);
  assert.match(page, /endScrub/);
  assert.match(page, /shortsScrubPreview/);
  assert.match(page, /const source = activeVideo\.currentSrc \|\| activeVideo\.src/);
  assert.match(page, /heldWasPlaying/);
  assert.match(page, /if \(gestureState\.heldWasPlaying\)[\s\S]{0,220}activeVideo\.play\(\)/);
});

test('early swipes are recorded only for vertical-swipe exits within five seconds', () => {
  assert.match(page, /recordEarlySwipe/);
  assert.match(page, /reason\s*===\s*['"]vertical-swipe['"]/);
  assert.match(page, /EARLY_SWIPE_MS\s*=\s*5000/);
});
