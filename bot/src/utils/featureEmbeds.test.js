import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBoardEmbed,
  buildBoardComponents,
  BOARD_SELECT_MAX,
  stars,
  pickWeighted,
  buildWishlistEmbed,
  buildWishlistComponents
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

// ── /wishlist ───────────────────────────────────────────────────────────────

const want = (overrides = {}) => ({
  id: 1,
  title: 'The Thing',
  release_year: 1982,
  image_url: 'https://img/thing.jpg',
  runtime: 109,
  genres: 'Horror, Sci-Fi',
  importance: 5,
  also_wanted_by: 1,
  ...overrides
});

test('stars renders the 1-5 priority as a filled bar', () => {
  assert.equal(stars(5), '★★★★★');
  assert.equal(stars(3), '★★★☆☆');
  assert.equal(stars(1), '★☆☆☆☆');
});

test('stars clamps anything outside the range the column allows', () => {
  assert.equal(stars(0), '☆☆☆☆☆');
  assert.equal(stars(99), '★★★★★');
  assert.equal(stars(null), '☆☆☆☆☆');
});

test('buildWishlistEmbed lists films by priority and flags shared wants', () => {
  const text = buildWishlistEmbed([want(), want({ id: 2, title: 'Heat', importance: 3, also_wanted_by: 0 })], { username: 'kira' }).data.description;
  assert.match(text, /★★★★★ \*\*The Thing\*\* \(1982\)/);
  assert.match(text, /also on 1/);
  assert.match(text, /★★★☆☆ \*\*Heat\*\*/);
});

test('buildWishlistEmbed switches to the server view when told to', () => {
  const embed = buildWishlistEmbed([want({ wanted_by: 3, wanted_by_names: 'kira, sam, ana' })], { scope: 'guild' });
  assert.match(embed.data.title, /server/i);
  assert.match(embed.data.description, /3 people/);
});

test('buildWishlistEmbed handles an empty list in either scope', () => {
  assert.match(buildWishlistEmbed([], { username: 'kira' }).data.description, /nothing on/i);
  assert.match(buildWishlistEmbed([], { scope: 'guild' }).data.description, /nothing on/i);
});

test('buildWishlistEmbed stays inside the description limit', () => {
  const many = Array.from({ length: 300 }, (_, i) => want({ id: i, title: `A Long Film Title ${i}` }));
  assert.ok(buildWishlistEmbed(many, { username: 'kira' }).data.description.length <= 4096);
});

test('pickWeighted favours higher priorities but can reach every film', () => {
  const films = [want({ id: 1, importance: 5 }), want({ id: 2, importance: 1 })];
  // Total weight is 6: rolls 0-4 land on the five-star film, 5 on the one-star.
  assert.equal(pickWeighted(films, 0).id, 1);
  assert.equal(pickWeighted(films, 4).id, 1);
  assert.equal(pickWeighted(films, 5).id, 2);
});

test('pickWeighted is total across the whole range of the roll', () => {
  const films = [want({ id: 1, importance: 2 }), want({ id: 2, importance: 3 })];
  for (let roll = 0; roll < 5; roll++) {
    assert.ok(pickWeighted(films, roll), `roll ${roll} picked nothing`);
  }
});

test('pickWeighted returns null for an empty list rather than undefined', () => {
  assert.equal(pickWeighted([], 0), null);
});

test('pickWeighted treats a missing priority as the lowest weight, not zero', () => {
  const films = [want({ id: 1, importance: null })];
  assert.equal(pickWeighted(films, 0).id, 1);
});

test('buildWishlistComponents offers the picker and the other scope', () => {
  const [row] = buildWishlistComponents('me');
  const ids = row.components.map((b) => b.data.custom_id);
  assert.deepEqual(ids, ['mn:wishpick:me', 'mn:wishlist:guild']);
});

test('buildWishlistComponents flips the scope button when showing the server list', () => {
  const [row] = buildWishlistComponents('guild');
  assert.deepEqual(row.components.map((b) => b.data.custom_id), ['mn:wishpick:guild', 'mn:wishlist:me']);
});
