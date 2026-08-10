import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTitleYear,
  formatRuntime,
  truncateOverview,
  formatAttendees
} from './announcementEmbed.js';

test('splitTitleYear pulls the year out of a title that embeds it', () => {
  assert.deepEqual(splitTitleYear('The Help (2011)', 2011), { name: 'The Help', year: 2011 });
});

test('splitTitleYear falls back to release_year when the title has none', () => {
  assert.deepEqual(splitTitleYear('The Help', 2011), { name: 'The Help', year: 2011 });
});

test('splitTitleYear returns a null year when neither source has one', () => {
  assert.deepEqual(splitTitleYear('Some Home Video', null), { name: 'Some Home Video', year: null });
});

test('splitTitleYear does not eat parentheses that are not years', () => {
  assert.deepEqual(splitTitleYear('Blade Runner (Final Cut)', 1982), {
    name: 'Blade Runner (Final Cut)',
    year: 1982
  });
});

test('formatRuntime renders hours and minutes', () => {
  assert.equal(formatRuntime(146), '2h 26m');
});

test('formatRuntime omits minutes on a whole hour', () => {
  assert.equal(formatRuntime(120), '2h');
});

test('formatRuntime renders a sub-hour runtime', () => {
  assert.equal(formatRuntime(47), '47m');
});

test('formatRuntime returns null for missing or zero runtime', () => {
  assert.equal(formatRuntime(null), null);
  assert.equal(formatRuntime(0), null);
});

test('truncateOverview leaves short text alone', () => {
  assert.equal(truncateOverview('A short plot.'), 'A short plot.');
});

test('truncateOverview cuts on a word boundary and appends an ellipsis', () => {
  const long = 'word '.repeat(100).trim();
  const result = truncateOverview(long);
  assert.ok(result.length <= 301, `expected <=301 chars, got ${result.length}`);
  assert.ok(result.endsWith('…'));
  assert.ok(!result.includes('wor…'), 'must not cut mid-word');
});

test('truncateOverview returns null for empty input', () => {
  assert.equal(truncateOverview(null), null);
  assert.equal(truncateOverview('   '), null);
});

test('formatAttendees invites the first RSVP when the list is empty', () => {
  assert.equal(formatAttendees([]), 'Nobody yet — be the first');
});

test('formatAttendees joins names with a middot', () => {
  assert.equal(
    formatAttendees([{ username: 'emy' }, { username: 'jani' }]),
    'emy · jani'
  );
});

test('formatAttendees caps the list at 15 and counts the rest', () => {
  const many = Array.from({ length: 22 }, (_, i) => ({ username: `user${i}` }));
  const result = formatAttendees(many);
  assert.ok(result.includes('user14'));
  assert.ok(!result.includes('user15'));
  assert.ok(result.includes('+7 more'));
});
