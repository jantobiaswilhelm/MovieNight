import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ratingMeter,
  formatScore,
  screeningState,
  tmdbComparison,
  formatRaters,
  averageScore,
  buildScreeningCard,
  buildScreeningComponents,
  toScreeningView
} from './screeningCard.js';

test('ratingMeter fills blocks proportional to the score', () => {
  assert.equal(ratingMeter(8.2), '████████░░');
  assert.equal(ratingMeter(10), '██████████');
  assert.equal(ratingMeter(0), '░░░░░░░░░░');
});

test('ratingMeter rounds to the nearest block', () => {
  assert.equal(ratingMeter(7.5), '████████░░');
  assert.equal(ratingMeter(7.4), '███████░░░');
});

test('ratingMeter clamps out-of-range input', () => {
  assert.equal(ratingMeter(99), '██████████');
  assert.equal(ratingMeter(-5), '░░░░░░░░░░');
  assert.equal(ratingMeter(null), '░░░░░░░░░░');
});

test('formatScore drops a trailing .0 but keeps halves', () => {
  assert.equal(formatScore('8.0'), '8');
  assert.equal(formatScore('7.5'), '7.5');
  assert.equal(formatScore(9), '9');
});

test('formatScore returns null for junk', () => {
  assert.equal(formatScore(null), null);
  assert.equal(formatScore('abc'), null);
});

test('averageScore averages DECIMAL strings from pg', () => {
  assert.equal(averageScore([{ score: '9' }, { score: '7.5' }, { score: '8' }]), 8.166666666666666);
});

test('averageScore returns null with no ratings', () => {
  assert.equal(averageScore([]), null);
});

test('screeningState is playing before the prompt is sent', () => {
  assert.equal(screeningState({ rating_prompt_sent_at: null }), 'playing');
});

test('screeningState is rating within 24h of the prompt', () => {
  const now = Date.parse('2025-08-03T22:00:00Z');
  assert.equal(screeningState({ rating_prompt_sent_at: '2025-08-03T21:26:00Z' }, now), 'rating');
});

test('screeningState settles 24h after the prompt', () => {
  const now = Date.parse('2025-08-04T22:00:00Z');
  assert.equal(screeningState({ rating_prompt_sent_at: '2025-08-03T21:26:00Z' }, now), 'settled');
});

test('tmdbComparison says we liked it more when we scored higher', () => {
  assert.equal(tmdbComparison(8.2, '7.8'), 'TMDB says 7.8 — we liked it more');
});

test('tmdbComparison says we liked it less when we scored lower', () => {
  assert.equal(tmdbComparison(6.0, '7.8'), 'TMDB says 7.8 — we liked it less');
});

test('tmdbComparison calls a near-tie dead on', () => {
  assert.equal(tmdbComparison(7.9, '7.8'), 'TMDB says 7.8 — dead on');
});

test('tmdbComparison returns null without a TMDB score', () => {
  assert.equal(tmdbComparison(8.2, null), null);
  assert.equal(tmdbComparison(null, '7.8'), null);
});

test('formatRaters lists name and score', () => {
  assert.equal(
    formatRaters([{ username: 'emy', score: '9' }, { username: 'jani', score: '7.5' }]),
    'emy 9 · jani 7.5'
  );
});

test('formatRaters invites the first rating when empty', () => {
  assert.equal(formatRaters([]), "Nobody's rated yet");
});

test('formatRaters caps at 15 and counts the rest', () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ username: `u${i}`, score: '8' }));
  const result = formatRaters(many);
  assert.ok(result.includes('u14 8'));
  assert.ok(!result.includes('u15 8'));
  assert.ok(result.includes('+5 more'));
});

// --- buildScreeningCard ---

const BASE = {
  id: 42,
  title: 'The Help (2011)',
  releaseYear: 2011,
  imageUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
  runtime: 146,
  startedAt: new Date('2025-08-03T19:00:00Z'),
  tmdbRating: '7.8',
  attendeeCount: 6,
  attendees: [{ username: 'emy' }, { username: 'jani' }, { username: 'sam' }, { username: 'lea' }],
  ratings: []
};

const RATED = [
  { username: 'emy', score: '9', comment: 'better than i expected' },
  { username: 'jani', score: '7.5', comment: null },
  { username: 'sam', score: '8', comment: null },
  { username: 'lea', score: '8.5', comment: null }
];

test('playing state is green and names who is in', () => {
  const data = buildScreeningCard({ ...BASE, state: 'playing' }).data;
  assert.equal(data.color, 0x57F287);
  assert.equal(data.author.name, '🔴 NOW PLAYING');
  assert.equal(data.title, 'The Help (2011)');
  assert.ok(data.description.includes('2h 26m'));
  assert.ok(data.description.includes('emy · jani · sam · lea'));
  assert.ok(data.description.includes('credits roll'));
});

test('playing state computes the end time from runtime', () => {
  const data = buildScreeningCard({ ...BASE, state: 'playing' }).data;
  // 19:00 UTC + 146 min = 21:26 UTC = epoch 1754256360
  assert.ok(data.description.includes('<t:1754256360:t>'));
});

test('playing state shows the poster and no backdrop', () => {
  const data = buildScreeningCard({ ...BASE, state: 'playing' }).data;
  assert.equal(data.thumbnail.url, BASE.imageUrl);
  assert.equal(data.image, undefined);
});

test('rating state shows the meter, average and denominator', () => {
  const data = buildScreeningCard({ ...BASE, state: 'rating', ratings: RATED }).data;
  assert.equal(data.color, 0xFEE75C);
  assert.equal(data.author.name, '⭐ RATE IT');
  assert.ok(data.description.includes('████████░░'));
  assert.ok(data.description.includes('8.3'));
  assert.ok(data.description.includes('4 of 6 rated'));
});

test('rating state lists individual scores', () => {
  const data = buildScreeningCard({ ...BASE, state: 'rating', ratings: RATED }).data;
  assert.ok(data.description.includes('emy 9 · jani 7.5 · sam 8 · lea 8.5'));
});

test('rating state quotes the most recent comment', () => {
  const data = buildScreeningCard({ ...BASE, state: 'rating', ratings: RATED }).data;
  assert.ok(data.description.includes('"better than i expected" — emy'));
});

test('rating state with no votes yet shows an empty meter', () => {
  const data = buildScreeningCard({ ...BASE, state: 'rating', ratings: [] }).data;
  assert.ok(data.description.includes('░░░░░░░░░░'));
  assert.ok(data.description.includes("Nobody's rated yet"));
});

test('rating state drops the denominator when nobody RSVPd', () => {
  const data = buildScreeningCard({
    ...BASE, state: 'rating', ratings: RATED, attendeeCount: 0
  }).data;
  assert.ok(data.description.includes('4 rated'));
  assert.ok(!data.description.includes('of 0'));
});

test('settled state is gold and scores out of ten', () => {
  const data = buildScreeningCard({ ...BASE, state: 'settled', ratings: RATED }).data;
  assert.equal(data.color, 0xE0A23A);
  assert.equal(data.author.name, '🏆 THE VERDICT');
  assert.ok(data.description.includes('8.3/10'));
  assert.ok(data.description.includes('4 of us'));
});

test('settled state shows high and low', () => {
  const data = buildScreeningCard({ ...BASE, state: 'settled', ratings: RATED }).data;
  assert.ok(data.description.includes('▲ emy 9'));
  assert.ok(data.description.includes('▼ jani 7.5'));
});

test('settled state compares us to TMDB', () => {
  const data = buildScreeningCard({ ...BASE, state: 'settled', ratings: RATED }).data;
  assert.ok(data.description.includes('TMDB says 7.8 — we liked it more'));
});

test('settled state omits high/low with fewer than three ratings', () => {
  const data = buildScreeningCard({
    ...BASE, state: 'settled', ratings: RATED.slice(0, 2)
  }).data;
  assert.ok(!data.description.includes('▲'));
});

test('settled state omits high/low when every score is identical', () => {
  const same = [
    { username: 'emy', score: '8' },
    { username: 'jani', score: '8' },
    { username: 'sam', score: '8' }
  ];
  const data = buildScreeningCard({ ...BASE, state: 'settled', ratings: same }).data;
  assert.ok(!data.description.includes('▲'));
});

test('settled state adds the backdrop', () => {
  const data = buildScreeningCard({ ...BASE, state: 'settled', ratings: RATED }).data;
  assert.equal(data.image.url, BASE.backdropUrl);
  assert.equal(data.thumbnail.url, BASE.imageUrl);
});

test('settled state omits the TMDB line when the movie has no score', () => {
  const data = buildScreeningCard({
    ...BASE, state: 'settled', ratings: RATED, tmdbRating: null
  }).data;
  assert.ok(!data.description.includes('TMDB says'));
});

test('a long comment is truncated', () => {
  const long = 'x'.repeat(200);
  const data = buildScreeningCard({
    ...BASE, state: 'rating', ratings: [{ username: 'emy', score: '8', comment: long }]
  }).data;
  assert.ok(data.description.includes('…'));
  assert.ok(!data.description.includes('x'.repeat(130)));
});

test('a movie with no runtime still renders', () => {
  const data = buildScreeningCard({ ...BASE, state: 'playing', runtime: null }).data;
  assert.equal(data.title, 'The Help (2011)');
  assert.ok(!data.description.includes('ends ~'));
});

// --- components + view ---

test('no rating buttons while the movie is still playing', () => {
  assert.deepEqual(buildScreeningComponents({ id: 42, state: 'playing' }), []);
});

test('rating buttons appear once rating is open', () => {
  const rows = buildScreeningComponents({ id: 42, state: 'rating' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].components[0].data.custom_id, 'rate_42_1');
  assert.equal(rows[1].components[4].data.custom_id, 'rate_42_10');
});

test('rating buttons stay live after settling so latecomers can rate', () => {
  const rows = buildScreeningComponents({ id: 42, state: 'settled' });
  assert.equal(rows.length, 2);
});

test('toScreeningView maps a row and derives its state', () => {
  const view = toScreeningView(
    {
      id: 42,
      title: 'The Help (2011)',
      release_year: 2011,
      image_url: 'https://image.tmdb.org/t/p/w500/p.jpg',
      backdrop_url: 'https://image.tmdb.org/t/p/w1280/b.jpg',
      runtime: 146,
      started_at: '2025-08-03T19:00:00Z',
      tmdb_rating: '7.8',
      rating_prompt_sent_at: null,
      attendee_count: '6'
    },
    { attendees: [{ username: 'emy' }], ratings: [] }
  );
  assert.equal(view.state, 'playing');
  assert.equal(view.attendeeCount, 6);
  assert.equal(view.tmdbRating, '7.8');
  assert.deepEqual(view.attendees, [{ username: 'emy' }]);
});

test('toScreeningView lets an explicit state override the derived one', () => {
  const view = toScreeningView(
    { id: 1, title: 'X', rating_prompt_sent_at: null },
    { state: 'settled' }
  );
  assert.equal(view.state, 'settled');
});
