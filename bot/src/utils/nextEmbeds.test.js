import test from 'node:test';
import assert from 'node:assert/strict';
import {
  progressMeter,
  monthGrid,
  formatCadence,
  buildUpcomingEmbed,
  buildCalendarEmbed,
  buildMarathonsEmbed,
  buildEmptyEmbed,
  buildViewButtons
} from './nextEmbeds.js';

// A Sunday-ending month: August 2026 starts on a Saturday.
const NOW = new Date(2026, 7, 23, 20, 0, 0);

const movie = (overrides = {}) => ({
  id: 1,
  title: 'Dune: Part Two',
  scheduled_at: new Date(2026, 7, 27, 20, 0, 0),
  image_url: 'https://img/dune.jpg',
  runtime: 166,
  genres: 'Sci-Fi, Adventure',
  release_year: 2024,
  tmdb_id: 693134,
  attendee_count: 3,
  marathon_name: null,
  marathon_position: null,
  marathon_total: null,
  ...overrides
});

test('progressMeter fills blocks proportional to the fraction watched', () => {
  assert.equal(progressMeter(2, 5), '████░░░░░░');
  assert.equal(progressMeter(5, 5), '██████████');
  assert.equal(progressMeter(0, 5), '░░░░░░░░░░');
});

test('progressMeter treats an empty marathon as no progress, not a divide by zero', () => {
  assert.equal(progressMeter(0, 0), '░░░░░░░░░░');
});

test('monthGrid pads the first week so the 1st lands on its weekday', () => {
  const grid = monthGrid(2026, 7, new Set(), NOW);
  const [header, firstWeek] = grid.split('\n');
  assert.equal(header, ' Mo  Tu  We  Th  Fr  Sa  Su ');
  // 1 Aug 2026 is a Saturday: five empty cells lead the row.
  assert.equal(firstWeek, ' '.repeat(20) + '  1   2 ');
});

test('monthGrid brackets film nights and dots today', () => {
  const grid = monthGrid(2026, 7, new Set(['2026-7-27']), NOW);
  assert.match(grid, /\[27\]/);
  assert.match(grid, /·23·/);
});

test('monthGrid lets the film marker win when a film falls on today', () => {
  const grid = monthGrid(2026, 7, new Set(['2026-7-23']), NOW);
  assert.match(grid, /\[23\]/);
  assert.doesNotMatch(grid, /·23·/);
});

test('formatCadence names a binge but does not invent an interval', () => {
  assert.equal(formatCadence('binge'), '🍿 Binge · back-to-back');
  assert.equal(formatCadence('interval'), '📆 Scheduled run');
  assert.equal(formatCadence(null), null);
});

test('buildUpcomingEmbed lists each film with runtime, genres and attendance', () => {
  const embed = buildUpcomingEmbed([movie()], NOW);
  const text = embed.data.description;
  assert.match(text, /\*\*1\. Dune: Part Two\*\* \(2024\)/);
  assert.match(text, /2h 46m · Sci-Fi, Adventure/);
  assert.match(text, /3 attending/);
});

test('buildUpcomingEmbed tags a film that belongs to a marathon', () => {
  const embed = buildUpcomingEmbed(
    [movie({ marathon_name: 'Villeneuve Marathon', marathon_position: 1, marathon_total: 5 })],
    NOW
  );
  // position is 0-based in the table, so item 1 reads as film 2 of 5.
  assert.match(embed.data.description, /🍿 Villeneuve Marathon \(2\/5\)/);
});

test('buildUpcomingEmbed badges a film already underway rather than counting down to it', () => {
  const started = movie({ scheduled_at: new Date(2026, 7, 23, 19, 0, 0) });
  const embed = buildUpcomingEmbed([started], NOW);
  assert.match(embed.data.description, /🔴 On now/);
});

test('buildUpcomingEmbed hangs the next poster off the embed', () => {
  const embed = buildUpcomingEmbed([movie(), movie({ id: 2, image_url: 'https://img/other.jpg' })], NOW);
  assert.equal(embed.data.thumbnail.url, 'https://img/dune.jpg');
});

test('buildUpcomingEmbed omits the attendance line when nobody has said yes', () => {
  const embed = buildUpcomingEmbed([movie({ attendee_count: 0 })], NOW);
  assert.doesNotMatch(embed.data.description, /attending/);
});

test('buildCalendarEmbed plots the current month and spills into the next', () => {
  const embed = buildCalendarEmbed(
    [movie(), movie({ id: 2, title: 'Arrival', scheduled_at: new Date(2026, 8, 2, 20, 0, 0) })],
    NOW
  );
  const text = embed.data.description;
  assert.match(text, /August 2026/);
  assert.match(text, /September 2026/);
  assert.match(text, /\*\*27 Aug\*\* — Dune: Part Two/);
  assert.match(text, /\*\*02 Sep\*\* — Arrival/);
});

test('buildCalendarEmbed says how many films sit beyond the plotted window', () => {
  const embed = buildCalendarEmbed(
    [movie(), movie({ id: 2, title: 'Sicario', scheduled_at: new Date(2026, 11, 5, 20, 0, 0) })],
    NOW
  );
  assert.match(embed.data.description, /1 more further ahead/);
  assert.doesNotMatch(embed.data.description, /December 2026/);
});

const marathon = (overrides = {}) => ({
  id: 7,
  name: 'Villeneuve Marathon',
  cadence_type: 'interval',
  item_count: 5,
  watched_count: 2,
  next_item: { title: 'Dune: Part Two', scheduled_at: new Date(2026, 7, 27, 20, 0, 0).toISOString() },
  ...overrides
});

test('buildMarathonsEmbed shows progress and what is next', () => {
  const embed = buildMarathonsEmbed([marathon()]);
  const text = embed.data.description;
  assert.match(text, /\*\*Villeneuve Marathon\*\*/);
  assert.match(text, /████░░░░░░ 2\/5 watched/);
  assert.match(text, /Next: \*\*Dune: Part Two\*\*/);
  assert.match(text, /📆 Scheduled run/);
});

test('buildMarathonsEmbed admits when the next film has no date yet', () => {
  const embed = buildMarathonsEmbed([marathon({ next_item: { title: 'Enemy', scheduled_at: null } })]);
  assert.match(embed.data.description, /Next: \*\*Enemy\*\* — no date yet/);
});

test('buildMarathonsEmbed reports a marathon with nothing left to watch', () => {
  const embed = buildMarathonsEmbed([marathon({ watched_count: 5, next_item: null })]);
  assert.match(embed.data.description, /Every film watched/);
});

test('buildEmptyEmbed points at a running marathon that has not been scheduled', () => {
  const embed = buildEmptyEmbed({
    marathons: [marathon({ next_item: { title: 'Dune: Part Two', scheduled_at: null } })],
    suggestions: []
  });
  const text = embed.data.description;
  assert.match(text, /Nothing on the schedule/);
  assert.match(text, /Villeneuve Marathon/);
  assert.match(text, /Dune: Part Two/);
  assert.match(text, /\/announce/);
});

test('buildEmptyEmbed falls back to what the board already wants', () => {
  const embed = buildEmptyEmbed({
    marathons: [],
    suggestions: [
      { id: 1, title: 'The Thing', release_year: 1982, score: 4 },
      { id: 2, title: 'Heat', release_year: 1995, score: 2 }
    ]
  });
  const text = embed.data.description;
  assert.match(text, /Most wanted on the board/);
  assert.match(text, /▲ 4 · The Thing \(1982\)/);
  assert.match(text, /▲ 2 · Heat \(1995\)/);
});

test('buildEmptyEmbed skips the board section when nothing is suggested', () => {
  const embed = buildEmptyEmbed({ marathons: [], suggestions: [] });
  assert.doesNotMatch(embed.data.description, /Most wanted/);
});

test('buildViewButtons offers the two views you are not looking at', () => {
  const [row] = buildViewButtons('next', { count: 5, hasMovies: true, hasMarathons: true });
  const ids = row.components.map((b) => b.data.custom_id);
  assert.deepEqual(ids, ['mn:calendar:5', 'mn:marathons:5']);
});

test('buildViewButtons carries the requested count so a view swap keeps it', () => {
  const [row] = buildViewButtons('calendar', { count: 10, hasMovies: true, hasMarathons: true });
  const ids = row.components.map((b) => b.data.custom_id);
  assert.deepEqual(ids, ['mn:next:10', 'mn:marathons:10']);
});

test('buildViewButtons disables the views that have nothing to show', () => {
  const [row] = buildViewButtons('next', { count: 5, hasMovies: false, hasMarathons: false });
  assert.deepEqual(row.components.map((b) => b.data.disabled), [true, true]);
});
