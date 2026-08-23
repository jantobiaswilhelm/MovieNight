import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatWatchTime,
  pageCountFor,
  buildPagerButtons,
  buildHistoryEmbed,
  safeImageUrl,
  fitEntries,
  buildStatsEmbed,
  buildRangeButtons,
  rangeLabel,
  sinceForRange,
  buildMyRatingsEmbed,
  buildSortSelect,
  DESCRIPTION_LIMIT,
  MY_RATINGS_PAGE_SIZE
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

// ── /stats ──────────────────────────────────────────────────────────────────

const NOW = new Date(2026, 7, 23, 20, 0, 0);

const stats = {
  total_movies: '38',
  total_raters: '9',
  overall_avg_rating: '7.8',
  total_ratings: '214'
};

const topMovies = [
  { id: 1, title: 'Dune: Part Two', release_year: 2024, avg_rating: '8.4', rating_count: '5', backdrop_url: 'https://img/dune-bd.jpg' },
  { id: 2, title: 'Arrival', release_year: 2016, avg_rating: '8.2', rating_count: '4', backdrop_url: null },
  { id: 3, title: 'Sicario', release_year: 2015, avg_rating: '7.4', rating_count: '6', backdrop_url: null }
];

const topRaters = [
  { discord_id: '1', username: 'kira', rating_count: '38', avg_rating: '7.2', attended_count: 34 },
  { discord_id: '2', username: 'sam', rating_count: '31', avg_rating: '8.1', attended_count: 28 }
];

const statsArgs = { stats, topMovies, topRaters, watchMinutes: 4920, regulars: 9, range: 'all' };

test('buildStatsEmbed leads with the five headline numbers', () => {
  const text = buildStatsEmbed(statsArgs).data.description;
  assert.match(text, /38/);
  assert.match(text, /214/);
  assert.match(text, /7\.8/);
  assert.match(text, /82h/);
  assert.match(text, /9/);
});

test('buildStatsEmbed medals the top three and meters their scores', () => {
  const text = buildStatsEmbed(statsArgs).data.description;
  assert.match(text, /🥇.*Dune: Part Two/);
  assert.match(text, /🥈.*Arrival/);
  assert.match(text, /🥉.*Sicario/);
  assert.match(text, /████████░░/);
});

test('buildStatsEmbed shows how often each rater actually turned up', () => {
  const text = buildStatsEmbed(statsArgs).data.description;
  assert.match(text, /kira/);
  assert.match(text, /38 ratings/);
  assert.match(text, /34 nights/);
});

test('buildStatsEmbed uses the top film backdrop as the banner', () => {
  assert.equal(buildStatsEmbed(statsArgs).data.image.url, 'https://img/dune-bd.jpg');
});

test('buildStatsEmbed skips the banner rather than sending a bad URL', () => {
  const embed = buildStatsEmbed({ ...statsArgs, topMovies: [{ ...topMovies[0], backdrop_url: 'nope' }] });
  assert.equal(embed.data.image, undefined);
});

test('buildStatsEmbed survives a guild that has watched nothing', () => {
  const embed = buildStatsEmbed({
    stats: { total_movies: '0', total_raters: '0', overall_avg_rating: '0', total_ratings: '0' },
    topMovies: [], topRaters: [], watchMinutes: 0, regulars: 0, range: 'all'
  });
  assert.match(embed.data.description, /Nothing rated yet|No ratings/i);
});

test('rangeLabel names the window being shown', () => {
  assert.match(rangeLabel('all'), /All time/i);
  assert.match(rangeLabel('month'), /month/i);
  assert.match(rangeLabel('year'), /year/i);
});

test('sinceForRange bounds the month and year, and leaves all time unbounded', () => {
  assert.equal(sinceForRange('all', NOW), null);
  assert.deepEqual(sinceForRange('month', NOW), new Date(2026, 7, 1));
  assert.deepEqual(sinceForRange('year', NOW), new Date(2026, 0, 1));
});

test('sinceForRange treats an unknown range as all time rather than throwing', () => {
  assert.equal(sinceForRange('nonsense', NOW), null);
});

test('buildRangeButtons disables the range you are already looking at', () => {
  const [row] = buildRangeButtons('month');
  const byId = Object.fromEntries(row.components.map((b) => [b.data.custom_id, b.data.disabled]));
  assert.equal(byId['mn:stats:month'], true);
  assert.equal(byId['mn:stats:all'], false);
  assert.equal(byId['mn:stats:year'], false);
});

// ── /myratings ──────────────────────────────────────────────────────────────
//
// The command this replaces concatenated every rating into one description with
// no cap. Discord rejects a description over 4096 characters, so it threw
// outright at 81 plain ratings — far fewer once people leave comments. These
// are the tests that keep it fixed.

const rating = (overrides = {}) => ({
  id: 1,
  score: '8.5',
  comment: null,
  movie_night_id: 10,
  title: 'Dune: Part Two',
  release_year: 2024,
  image_url: 'https://img/dune.jpg',
  scheduled_at: new Date(2026, 7, 27),
  community_avg: '8.4',
  total_count: 47,
  ...overrides
});

test('buildMyRatingsEmbed stays inside the description limit however many rows it is handed', () => {
  const many = Array.from({ length: 200 }, (_, i) => rating({
    id: i,
    title: `A Fairly Long Movie Title Number ${i}`,
    comment: 'x'.repeat(300)
  }));
  const embed = buildMyRatingsEmbed(many, { page: 1, pageCount: 25, username: 'kira' });
  assert.ok(
    embed.data.description.length <= DESCRIPTION_LIMIT,
    `description was ${embed.data.description.length}, over the ${DESCRIPTION_LIMIT} limit`
  );
});

test('buildMyRatingsEmbed survives a single pathological comment', () => {
  const embed = buildMyRatingsEmbed([rating({ comment: 'y'.repeat(9000) })], { page: 1, pageCount: 1, username: 'kira' });
  assert.ok(embed.data.description.length <= DESCRIPTION_LIMIT);
});

test('buildMyRatingsEmbed shows the score against the room', () => {
  const text = buildMyRatingsEmbed([rating()], { page: 1, pageCount: 6, username: 'kira' }).data.description;
  assert.match(text, /Dune: Part Two/);
  assert.match(text, /8\.5/);
  assert.match(text, /server 8\.4/);
});

test('buildMyRatingsEmbed quotes a comment it was given', () => {
  const text = buildMyRatingsEmbed([rating({ comment: 'Best sound design in years' })], { page: 1, pageCount: 1, username: 'kira' }).data.description;
  assert.match(text, /Best sound design in years/);
});

test('buildMyRatingsEmbed copes with a film nobody else rated', () => {
  const text = buildMyRatingsEmbed([rating({ community_avg: null })], { page: 1, pageCount: 1, username: 'kira' }).data.description;
  assert.match(text, /Dune: Part Two/);
  assert.doesNotMatch(text, /server null/);
});

test('buildMyRatingsEmbed handles someone who has rated nothing', () => {
  const embed = buildMyRatingsEmbed([], { page: 1, pageCount: 1, username: 'kira' });
  assert.match(embed.data.description, /no ratings yet/i);
});

test('MY_RATINGS_PAGE_SIZE is small enough that a full page of comments still fits', () => {
  const full = Array.from({ length: MY_RATINGS_PAGE_SIZE }, (_, i) => rating({ id: i, comment: 'z'.repeat(200) }));
  const embed = buildMyRatingsEmbed(full, { page: 1, pageCount: 3, username: 'kira' });
  assert.ok(embed.data.description.length <= DESCRIPTION_LIMIT);
  assert.doesNotMatch(embed.data.description, /wouldn't fit/);
});

test('buildSortSelect marks the sort currently in effect', () => {
  const [row] = buildSortSelect('myratings', 2, 'score');
  const [menu] = row.components;
  assert.equal(menu.data.custom_id, 'mn:myratings:2');
  const chosen = menu.options.filter((o) => o.data.default).map((o) => o.data.value);
  assert.deepEqual(chosen, ['score']);
});
