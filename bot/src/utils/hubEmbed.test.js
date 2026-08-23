import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHubEmbed, buildHubComponents, DESTINATIONS } from './hubEmbed.js';

const nextUp = {
  title: 'Dune: Part Two',
  release_year: 2024,
  scheduled_at: new Date(2026, 7, 27, 20, 0, 0),
  image_url: 'https://img/dune.jpg',
  attendee_count: 3,
  marathon_name: 'Villeneuve Marathon',
  marathon_position: 2,
  marathon_total: 5
};

const topSuggestion = { id: 1, title: 'The Thing', release_year: 1982, score: 4 };

const stats = { total_movies: '38', total_ratings: '214', overall_avg_rating: '7.8' };

test('buildHubEmbed leads with what is on next', () => {
  const text = buildHubEmbed({ nextUp, topSuggestion, stats, watchMinutes: 4920 }).data.description;
  assert.match(text, /Dune: Part Two/);
  assert.match(text, /3 attending/);
  assert.match(text, /Villeneuve Marathon \(3\/5\)/);
});

test('buildHubEmbed mentions what leads the board', () => {
  const text = buildHubEmbed({ nextUp, topSuggestion, stats }).data.description;
  assert.match(text, /The Thing/);
  assert.match(text, /4/);
});

test('buildHubEmbed degrades one line at a time', () => {
  const noNext = buildHubEmbed({ nextUp: null, topSuggestion, stats }).data.description;
  assert.doesNotMatch(noNext, /Up next/);
  assert.match(noNext, /The Thing/);

  const noBoard = buildHubEmbed({ nextUp, topSuggestion: null, stats }).data.description;
  assert.match(noBoard, /Dune: Part Two/);
  assert.doesNotMatch(noBoard, /board/i);
});

test('buildHubEmbed still renders when the server has done nothing at all', () => {
  const embed = buildHubEmbed({ nextUp: null, topSuggestion: null, stats: null });
  assert.ok(embed.data.description.length > 0);
  assert.match(embed.data.description, /Nothing scheduled/i);
});

test('buildHubEmbed summarises the server when there are stats to summarise', () => {
  const embed = buildHubEmbed({ nextUp, topSuggestion, stats, watchMinutes: 4920 });
  assert.match(embed.data.footer.text, /38 nights/);
  assert.match(embed.data.footer.text, /82h/);
});

test('buildHubComponents lists every destination in one menu', () => {
  const [row] = buildHubComponents();
  const [menu] = row.components;
  assert.equal(menu.data.custom_id, 'mn:hub');
  assert.equal(menu.options.length, DESTINATIONS.length);
  assert.ok(DESTINATIONS.length <= 25, 'a select menu takes at most 25 options');
});

test('every hub destination names a view the router can actually render', async () => {
  const { RENDERERS } = await import('../handlers/views/index.js');
  for (const destination of DESTINATIONS) {
    assert.ok(RENDERERS[destination.view], `hub offers "${destination.view}" but nothing renders it`);
  }
});

test('hub option labels and descriptions stay inside Discord limits', () => {
  const [row] = buildHubComponents();
  for (const option of row.components[0].options) {
    assert.ok(option.data.label.length <= 100);
    assert.ok((option.data.description ?? '').length <= 100);
  }
});
