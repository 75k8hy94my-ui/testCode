import test from 'node:test';
import assert from 'node:assert/strict';
import { statusMessageDuration } from '../status-message.js';

test('cloud sync errors remain visible long enough to be noticed', () => {
  assert.equal(statusMessageDuration('cloud-sync-error'), 10000);
});
