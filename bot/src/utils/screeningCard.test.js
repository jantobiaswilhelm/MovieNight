import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ratingMeter,
  formatScore,
  screeningState,
  tmdbComparison,
  formatRaters,
  averageScore
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
