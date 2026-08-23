import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWatchTime,
  pageCountFor,
  buildPagerButtons,
  buildHistoryEmbed,
  safeImageUrl,
  fitEntries
} from './commandEmbeds.js';

const night = (overrides = {}) => ({
  id: 1,
  title: 'Dune: Part Two',
  release_year: 2024,
  image_url: 'https://img/dune.jpg',
  scheduled_at: new Date(2026, 7, 27, 20, 0, 0),
  runtime: 166,
  avg_rating: '8.4',
  rating_count: 5,
  attendee_count: 4,
  total_count: 38,
  ...overrides
});

test('formatWatchTime reads as hours once there are enough of them', () => {
  assert.equal(formatWatchTime(4920), '82h');
  assert.equal(formatWatchTime(80), '1h 20m');
  assert.equal(formatWatchTime(45), '45m');
  assert.equal(formatWatchTime(0), '0m');
});

test('formatWatchTime drops a bare zero minutes from a whole number of hours', () => {
  assert.equal(formatWatchTime(120), '2h');
});

test('pageCountFor never reports zero pages, so "Page 1 of 0" cannot happen', () => {
  assert.equal(pageCountFor(0, 5), 1);
  assert.equal(pageCountFor(38, 5), 8);
  assert.equal(pageCountFor(5, 5), 1);
  assert.equal(pageCountFor(6, 5), 2);
});

test('buildHistoryEmbed lists a night with its meter, votes and attendance', () => {
  const text = buildHistoryEmbed([night()], { page: 1, pageCount: 8 }).data.description;
  assert.match(text, /1\. Dune: Part Two\*\* \(2024\)/);
  assert.match(text, /████████░░/);
  assert.match(text, /8\.4/);
  assert.match(text, /5 votes/);
  assert.match(text, /4 attended/);
});

test('buildHistoryEmbed numbers rows continuing across pages', () => {
  const text = buildHistoryEmbed([night({ title: 'Heat' })], { page: 3, pageCount: 8, pageSize: 5 }).data.description;
  assert.match(text, /\*\*11\. Heat\*\*/);
});

test('buildHistoryEmbed says a night went unrated instead of scoring it zero', () => {
  const text = buildHistoryEmbed([night({ avg_rating: null, rating_count: 0 })], { page: 1, pageCount: 1 }).data.description;
  assert.match(text, /not rated/i);
  assert.doesNotMatch(text, /0\.0/);
});

test('buildHistoryEmbed hangs the newest poster off the embed', () => {
  const embed = buildHistoryEmbed([night({ image_url: null }), night({ id: 2, image_url: 'https://img/heat.jpg' })], { page: 1, pageCount: 1 });
  assert.equal(embed.data.thumbnail.url, 'https://img/heat.jpg');
});

test('safeImageUrl passes real URLs and rejects anything discord.js would throw on', () => {
  assert.equal(safeImageUrl('https://image.tmdb.org/t/p/w500/x.jpg'), 'https://image.tmdb.org/t/p/w500/x.jpg');
  assert.equal(safeImageUrl('http://example.com/a.png'), 'http://example.com/a.png');
  for (const bad of ['poster.jpg', '', 'javascript:alert(1)', 'data:image/png;base64,xx', null, undefined, 42]) {
    assert.equal(safeImageUrl(bad), null);
  }
});

test('a malformed poster costs the thumbnail, not the whole embed', () => {
  const embed = buildHistoryEmbed([night({ image_url: 'not-a-url' })], { page: 1, pageCount: 1 });
  assert.equal(embed.data.thumbnail, undefined);
  assert.match(embed.data.description, /Dune: Part Two/);
});

test('fitEntries drops what will not fit and says how much it dropped', () => {
  const entries = Array.from({ length: 40 }, (_, i) => `entry ${i} ` + 'x'.repeat(200));
  const text = fitEntries(entries);
  assert.ok(text.length <= 4096, `expected under the limit, got ${text.length}`);
  assert.match(text, /and \d+ more that wouldn't fit/);
});

test('fitEntries keeps everything when everything fits', () => {
  const text = fitEntries(['one', 'two', 'three']);
  assert.equal(text, 'one\n\ntwo\n\nthree');
});

test('buildHistoryEmbed reports the watch time it was given', () => {
  const embed = buildHistoryEmbed([night()], { page: 1, pageCount: 1, watchMinutes: 4920 });
  assert.match(embed.data.footer.text, /82h/);
});

test('buildHistoryEmbed handles a guild that has watched nothing', () => {
  const embed = buildHistoryEmbed([], { page: 1, pageCount: 1 });
  assert.match(embed.data.description, /No movie nights yet/i);
});

test('buildPagerButtons disables Newer on the first page', () => {
  const [row] = buildPagerButtons('history', 1, 8);
  assert.deepEqual(row.components.map((b) => b.data.disabled), [true, false]);
  assert.deepEqual(row.components.map((b) => b.data.custom_id), ['mn:history:1', 'mn:history:2']);
});

test('buildPagerButtons disables Older on the last page', () => {
  const [row] = buildPagerButtons('history', 8, 8);
  assert.deepEqual(row.components.map((b) => b.data.disabled), [false, true]);
  assert.deepEqual(row.components.map((b) => b.data.custom_id), ['mn:history:7', 'mn:history:8']);
});

test('buildPagerButtons disables both when everything fits on one page', () => {
  const [row] = buildPagerButtons('history', 1, 1);
  assert.deepEqual(row.components.map((b) => b.data.disabled), [true, true]);
});

test('buildPagerButtons carries extra arguments so a sort survives paging', () => {
  const [row] = buildPagerButtons('myratings', 2, 5, ['score']);
  assert.deepEqual(row.components.map((b) => b.data.custom_id), ['mn:myratings:1:score', 'mn:myratings:3:score']);
});
