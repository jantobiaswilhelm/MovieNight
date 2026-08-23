import test from 'node:test';
import assert from 'node:assert/strict';
import { buildId, parseId, VIEWS, MAX_CUSTOM_ID } from './customId.js';

test('builds and parses a round trip', () => {
  assert.equal(buildId('history', 2), 'mn:history:2');
  assert.deepEqual(parseId('mn:history:2'), { view: 'history', args: ['2'] });
});

test('carries several arguments in order', () => {
  assert.equal(buildId('myratings', 3, 'score'), 'mn:myratings:3:score');
  assert.deepEqual(parseId('mn:myratings:3:score'), { view: 'myratings', args: ['3', 'score'] });
});

test('a view with no arguments parses to an empty list', () => {
  assert.deepEqual(parseId('mn:hub'), { view: 'hub', args: [] });
});

test('ignores ids outside the namespace rather than claiming them', () => {
  assert.equal(parseId('rsvp_14'), null);
  assert.equal(parseId('rate_8_14'), null);
  assert.equal(parseId('next_view:calendar:5'), null);
});

test('rejects an unknown view instead of guessing one', () => {
  assert.equal(parseId('mn:nonsense:1'), null);
});

test('survives malformed input without throwing', () => {
  for (const bad of ['', 'mn', 'mn:', ':::', null, undefined, 42, {}]) {
    assert.equal(parseId(bad), null);
  }
});

test('refuses to build an id Discord would truncate', () => {
  assert.throws(() => buildId('board', 'x'.repeat(MAX_CUSTOM_ID)), /too long/i);
});

test('refuses to build an id for a view that is not registered', () => {
  assert.throws(() => buildId('nonsense', 1), /unknown view/i);
});

test('rejects an argument containing the separator, which would reparse wrongly', () => {
  assert.throws(() => buildId('board', 'a:b'), /separator/i);
});

test('every registered view round trips', () => {
  for (const view of VIEWS) {
    assert.deepEqual(parseId(buildId(view)), { view, args: [] });
  }
});
