import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPostable, buildDevlogEmbed, MAX_AGE_DAYS } from './devlogEmbed.js';

const NOW = new Date('2026-10-20T18:00:00Z');
const entry = (over) => ({ id: 'e1', date: '2026-10-20', title: 'Title', discord: true, ...over });

test('pickPostable keeps only flagged entries with an id', () => {
  const out = pickPostable([
    entry({ id: 'a' }),
    entry({ id: 'b', discord: false }),
    entry({ id: 'c', discord: undefined }),
    entry({ id: '' }),
  ], NOW);
  assert.deepEqual(out.map((e) => e.id), ['a']);
});

test('pickPostable skips entries older than the age limit', () => {
  const old = new Date(NOW.getTime() - (MAX_AGE_DAYS + 1) * 864e5).toISOString().slice(0, 10);
  const out = pickPostable([entry({ id: 'new' }), entry({ id: 'old', date: old })], NOW);
  assert.deepEqual(out.map((e) => e.id), ['new']);
});

test('pickPostable orders oldest first and tolerates junk input', () => {
  const out = pickPostable([entry({ id: 'later', date: '2026-10-19' }), entry({ id: 'earlier', date: '2026-10-12' })], NOW);
  assert.deepEqual(out.map((e) => e.id), ['earlier', 'later']);
  assert.deepEqual(pickPostable(null, NOW), []);
  assert.deepEqual(pickPostable([null, entry({ date: 'not a date' })], NOW), []);
});

test('buildDevlogEmbed renders summary, bullets and a link to /devlog', () => {
  const embed = buildDevlogEmbed(
    entry({ summary: 'One line.', items: ['First', 'Second'] }),
    'https://movienight.example/'
  ).toJSON();
  assert.equal(embed.title, 'Title');
  assert.equal(embed.description, 'One line.\n\n• First\n• Second');
  assert.equal(embed.url, 'https://movienight.example/devlog');
});

test('buildDevlogEmbed works without bullets or a site url', () => {
  const embed = buildDevlogEmbed(entry({ summary: 'Only this.' }), undefined).toJSON();
  assert.equal(embed.description, 'Only this.');
  assert.equal(embed.url, undefined);
});
