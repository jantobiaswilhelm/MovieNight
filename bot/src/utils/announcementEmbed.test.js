import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTitleYear,
  formatRuntime,
  truncateOverview,
  formatAttendees,
  buildAnnouncementEmbed
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

// --- buildAnnouncementEmbed ---

const FULL_VIEW = {
  id: 42,
  title: 'The Help (2011)',
  releaseYear: 2011,
  scheduledAt: new Date('2025-08-03T19:00:00Z'),
  startedAt: null,
  imageUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
  description: 'An aspiring author during the civil rights era decides to write a book.',
  tagline: 'Change begins with a whisper.',
  tmdbId: 300,
  tmdbRating: '7.8',
  genres: 'Drama, History',
  runtime: 146,
  imdbId: 'tt1454029',
  trailerUrl: 'https://www.youtube.com/watch?v=abc',
  announcerName: 'emy',
  attendees: [{ username: 'emy' }, { username: 'jani' }]
};

test('buildAnnouncementEmbed renders the title once, with the year', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  assert.equal(data.title, 'The Help (2011)');
});

test('buildAnnouncementEmbed links the title to TMDB', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  assert.equal(data.url, 'https://www.themoviedb.org/movie/300');
});

test('buildAnnouncementEmbed puts tagline, overview and time in the description', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  assert.ok(data.description.includes('Change begins with a whisper.'));
  assert.ok(data.description.includes('An aspiring author'));
  assert.ok(data.description.includes('<t:1754247600:F>'));
  assert.ok(data.description.includes('<t:1754247600:R>'));
});

test('buildAnnouncementEmbed computes the end time from runtime', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  const runtimeField = data.fields.find((f) => f.name.includes('Runtime'));
  assert.ok(runtimeField.value.includes('2h 26m'));
  // 19:00 UTC + 146 min = 21:26 UTC = epoch 1754256360
  assert.ok(runtimeField.value.includes('<t:1754256360:t>'));
});

test('buildAnnouncementEmbed formats a DECIMAL rating that arrives as a string', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  const rating = data.fields.find((f) => f.name.includes('TMDB'));
  assert.equal(rating.value, '7.8/10');
});

test('buildAnnouncementEmbed shows the attendee list with a count', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  const going = data.fields.find((f) => f.name.includes('Going'));
  assert.equal(going.name, '🎟 Going (2)');
  assert.equal(going.value, 'emy · jani');
});

test('buildAnnouncementEmbed uses backdrop as image and poster as thumbnail', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  assert.equal(data.image.url, FULL_VIEW.backdropUrl);
  assert.equal(data.thumbnail.url, FULL_VIEW.imageUrl);
});

test('buildAnnouncementEmbed promotes the poster to image when there is no backdrop', () => {
  const data = buildAnnouncementEmbed({ ...FULL_VIEW, backdropUrl: null }).data;
  assert.equal(data.image.url, FULL_VIEW.imageUrl);
  assert.equal(data.thumbnail, undefined);
});

test('buildAnnouncementEmbed degrades to bare essentials for a manual title', () => {
  const data = buildAnnouncementEmbed({
    id: 7,
    title: 'Some Home Video',
    scheduledAt: new Date('2025-08-03T19:00:00Z'),
    announcerName: 'jani',
    attendees: []
  }).data;

  assert.equal(data.title, 'Some Home Video');
  assert.equal(data.url, undefined);
  assert.equal(data.image, undefined);
  // Only the Going field survives — no empty Runtime/TMDB/Genres shells.
  assert.equal(data.fields.length, 1);
  assert.ok(data.fields[0].name.includes('Going'));
});

test('buildAnnouncementEmbed turns green once the movie has started', () => {
  const data = buildAnnouncementEmbed({ ...FULL_VIEW, startedAt: new Date() }).data;
  assert.equal(data.color, 0x57F287);
  assert.ok(data.description.includes('STARTED'));
});

test('buildAnnouncementEmbed strikes the title and greys out when cancelled', () => {
  const data = buildAnnouncementEmbed({ ...FULL_VIEW, cancelled: true }).data;
  assert.equal(data.color, 0x99AAB5);
  assert.equal(data.title, '~~The Help (2011)~~');
  assert.ok(data.description.includes('cancelled'));
  // No point offering a Going list for a night that isn't happening.
  assert.equal(data.fields.find((f) => f.name.includes('Going')), undefined);
});

test('buildAnnouncementEmbed carries marathon context in the author line', () => {
  const data = buildAnnouncementEmbed({
    ...FULL_VIEW,
    marathonName: "Emy's Chastain Marathon",
    marathonPosition: 2,
    marathonTotal: 6
  }).data;
  assert.equal(data.author.name, "Emy's Chastain Marathon");
  const field = data.fields.find((f) => f.name === 'Marathon');
  assert.equal(field.value, 'Film 2 of 6');
});

test('buildAnnouncementEmbed defaults the author line to Movie Night', () => {
  const data = buildAnnouncementEmbed(FULL_VIEW).data;
  assert.equal(data.author.name, 'Movie Night');
});
