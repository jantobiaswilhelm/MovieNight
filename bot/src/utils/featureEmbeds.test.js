import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoardEmbed,
  buildBoardComponents,
  BOARD_SELECT_MAX
} from './featureEmbeds.js';

const suggestion = (overrides = {}) => ({
  id: 1,
  title: 'The Thing',
  release_year: 1982,
  image_url: 'https://img/thing.jpg',
  runtime: 109,
  genres: 'Horror, Sci-Fi',
  status: 'open',
  scheduled_at: null,
  suggested_by_name: 'kira',
  suggested_by_discord_id: '111',
  score: 4,
  user_vote: 0,
  ...overrides
});

test('buildBoardEmbed ranks suggestions with their score', () => {
  const text = buildBoardEmbed([
    suggestion(),
    suggestion({ id: 2, title: 'Heat', release_year: 1995, score: 2, suggested_by_name: 'sam' })
  ]).data.description;
  assert.match(text, /▲ 4 · \*\*The Thing\*\* \(1982\)/);
  assert.match(text, /▲ 2 · \*\*Heat\*\* \(1995\)/);
  assert.match(text, /suggested by kira/);
});

test('buildBoardEmbed marks the ones you already voted for', () => {
  const text = buildBoardEmbed([suggestion({ user_vote: 1 })]).data.description;
  assert.match(text, /you voted/i);
});

test('buildBoardEmbed counts what the viewer has not voted on', () => {
  const embed = buildBoardEmbed([
    suggestion({ id: 1, user_vote: 1 }),
    suggestion({ id: 2, user_vote: 0 }),
    suggestion({ id: 3, user_vote: 0 })
  ]);
  assert.match(embed.data.description, /2 you haven't voted on/);
});

test('buildBoardEmbed says when a suggestion is already booked in', () => {
  const text = buildBoardEmbed([
    suggestion({ status: 'scheduled', scheduled_at: new Date(2026, 7, 27) })
  ]).data.description;
  assert.match(text, /scheduled/i);
});

test('buildBoardEmbed handles a negative score without pretending it is positive', () => {
  const text = buildBoardEmbed([suggestion({ score: -2 })]).data.description;
  assert.match(text, /▼ 2/);
});

test('buildBoardEmbed handles an empty board', () => {
  const embed = buildBoardEmbed([]);
  assert.match(embed.data.description, /nothing on the board/i);
});

test('buildBoardEmbed stays inside the description limit on a huge board', () => {
  const many = Array.from({ length: 200 }, (_, i) => suggestion({ id: i, title: `A Long Film Title ${i}`, genres: 'Drama, Thriller, Mystery' }));
  assert.ok(buildBoardEmbed(many).data.description.length <= 4096);
});

test('buildBoardComponents offers a vote menu naming each film', () => {
  const [row] = buildBoardComponents([suggestion(), suggestion({ id: 2, title: 'Heat' })]);
  const [menu] = row.components;
  assert.equal(menu.data.custom_id, 'mn:boardvote');
  assert.deepEqual(menu.options.map((o) => o.data.value), ['1', '2']);
  assert.match(menu.options[0].data.label, /The Thing/);
});

test('buildBoardComponents respects the 25-option cap Discord imposes', () => {
  const many = Array.from({ length: 40 }, (_, i) => suggestion({ id: i, title: `Film ${i}` }));
  const [row] = buildBoardComponents(many);
  assert.equal(row.components[0].options.length, BOARD_SELECT_MAX);
  assert.ok(BOARD_SELECT_MAX <= 25);
});

test('buildBoardComponents drops the menu entirely on an empty board', () => {
  assert.deepEqual(buildBoardComponents([]), []);
});

test('buildBoardComponents keeps option labels inside the 100-character cap', () => {
  const [row] = buildBoardComponents([suggestion({ title: 'T'.repeat(300) })]);
  assert.ok(row.components[0].options[0].data.label.length <= 100);
});
