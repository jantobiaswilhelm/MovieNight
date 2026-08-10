# Screening Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three post-announcement messages into one screening card that announces the start, becomes the rating card when the credits roll, fills in live as people vote, and settles into a permanent verdict.

**Architecture:** A pure builder (`bot/src/utils/screeningCard.js`) renders three states from a view object; state is derived from `rating_prompt_sent_at`, never stored. A shared refresh helper re-renders the posted message. Mirrors the `announcementEmbed.js` / `announcementMessage.js` pair built in the previous milestone.

**Tech Stack:** Node 20+ ESM, discord.js v14, pg, `node --test`.

**Spec:** `docs/superpowers/specs/2026-08-10-screening-card-design.md`

---

## Background the engineer needs

Read `docs/superpowers/plans/2026-08-10-rich-announcement-embed.md` first if you
haven't — this plan follows its patterns exactly, and the two traps it documents
still apply:

- **`movie_nights.title` already contains the year.** Reuse `splitTitleYear`
  from `announcementEmbed.js` rather than re-deriving it.
- **`pg` returns `DECIMAL` as a string.** `ratings.score` is `DECIMAL`, and
  `tmdb_rating` is `DECIMAL(3,1)`. Always `Number()` first.

**Three existing message paths get unified:**

| Path | Today | After |
|---|---|---|
| `movieStarter` (cron) | posts "Starting NOW", no buttons | posts the card, stores its id |
| `/start` (admin) | posts its own embed *with* buttons | posts the same card via the same helper |
| `ratingNotifier` (cron) | posts a *second* "Time to Rate!" message | **edits** the card in place |

**Two timing changes that must move together.** Rating opens at
`started_at + runtime - 10min` in two places — `getMoviesReadyForRatingNotification`
(`bot/src/models/index.js:695`) and the web gate
(`backend/src/routes/movies.js:298`). Both move to `+ runtime`. If you change
only one, web users can rate before the Discord card opens.

---

## File structure

| File | Responsibility |
|---|---|
| **Create** `bot/src/utils/screeningCard.js` | Pure: view → embed + buttons, 3 states |
| **Create** `bot/src/utils/screeningCard.test.js` | Unit tests |
| **Create** `bot/src/utils/screeningMessage.js` | Post + refresh the card (DB + Discord) |
| **Modify** `backend/src/config/migrate.js` | 2 new columns |
| **Modify** `bot/src/models/index.js` | 4 new query functions, 1 timing fix |
| **Modify** `bot/src/jobs/movieStarter.js` | Post via shared helper |
| **Modify** `bot/src/commands/start.js` | Same helper; stop attaching buttons |
| **Modify** `bot/src/jobs/ratingNotifier.js` | Edit in place + settle sweep |
| **Modify** `bot/src/handlers/rating/handleRatingCommentModal.js` | Refresh after save |
| **Modify** `bot/src/commands/rate.js` | Refresh after save |
| **Modify** `backend/src/models/ratings.js` | `notifyRating` |
| **Modify** `backend/src/routes/movies.js` | Call it; widen the gate |
| **Modify** `bot/src/events/ready.js` | Listen for `movie_rating` |
| **Modify** `bot/src/utils/embeds.js` | Remove 3 superseded builders |

---

## Task 1: Pure formatting helpers

**Files:**
- Create: `bot/src/utils/screeningCard.js`
- Create: `bot/src/utils/screeningCard.test.js`

- [ ] **Step 1: Write the failing test**

Create `bot/src/utils/screeningCard.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `Cannot find module .../screeningCard.js`

- [ ] **Step 3: Write the helpers**

Create `bot/src/utils/screeningCard.js`:

```js
import { EmbedBuilder } from 'discord.js';
import { splitTitleYear, formatRuntime } from './announcementEmbed.js';
import { createRatingButtons } from './embeds.js';

// Lifecycle colors: green while playing, yellow while rating is open, gold once
// the verdict is in. The gold matches the marathon mockup palette.
const COLOR_PLAYING = 0x57F287;
const COLOR_RATING = 0xFEE75C;
const COLOR_SETTLED = 0xE0A23A;

const METER_BLOCKS = 10;
const RATER_MAX = 15;
const COMMENT_MAX = 120;
const SETTLE_AFTER_MS = 24 * 60 * 60 * 1000;

// A 10-block bar so the score has a shape you read before the number.
export const ratingMeter = (avg) => {
  const n = Number(avg);
  const safe = Number.isFinite(n) ? n : 0;
  const filled = Math.max(0, Math.min(METER_BLOCKS, Math.round(safe)));
  return '█'.repeat(filled) + '░'.repeat(METER_BLOCKS - filled);
};

// pg hands back DECIMAL as a string. 8.0 reads better as "8"; 7.5 must keep
// its half.
export const formatScore = (score) => {
  const n = Number(score);
  if (score === null || score === undefined || score === '' || !Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export const averageScore = (ratings = []) => {
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + Number(r.score), 0) / ratings.length;
};

// State is derived, never stored: no prompt yet = playing, recent prompt =
// rating, old prompt = settled.
export const screeningState = (row, now = Date.now()) => {
  if (!row?.rating_prompt_sent_at) return 'playing';
  const opened = new Date(row.rating_prompt_sent_at).getTime();
  return now - opened >= SETTLE_AFTER_MS ? 'settled' : 'rating';
};

export const tmdbComparison = (ourAvg, tmdbRating) => {
  if (ourAvg === null || ourAvg === undefined || !tmdbRating) return null;
  const theirs = Number(tmdbRating);
  const ours = Number(ourAvg);
  if (!Number.isFinite(theirs) || !Number.isFinite(ours)) return null;
  const diff = ours - theirs;
  const verdict = Math.abs(diff) < 0.2
    ? 'dead on'
    : diff > 0 ? 'we liked it more' : 'we liked it less';
  return `TMDB says ${theirs.toFixed(1)} — ${verdict}`;
};

export const formatRaters = (ratings = []) => {
  if (ratings.length === 0) return "Nobody's rated yet";
  const parts = ratings.map((r) => `${r.username} ${formatScore(r.score)}`);
  if (parts.length <= RATER_MAX) return parts.join(' · ');
  const shown = parts.slice(0, RATER_MAX).join(' · ');
  return `${shown} **+${parts.length - RATER_MAX} more**`;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 17 new tests (57 total with the announcement suite)

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/screeningCard.js bot/src/utils/screeningCard.test.js
git commit -m "feat(bot): screening card formatting helpers"
```

---

## Task 2: The card builder

**Files:**
- Modify: `bot/src/utils/screeningCard.js`
- Modify: `bot/src/utils/screeningCard.test.js`

- [ ] **Step 1: Write the failing test**

Append to `bot/src/utils/screeningCard.test.js`, adding `buildScreeningCard` to
the import at the top.

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `buildScreeningCard is not a function`

- [ ] **Step 3: Write the builder**

Append to `bot/src/utils/screeningCard.js`:

```js
/**
 * Render the screening card for one of three states. Pure — no database, no
 * Discord client. One message carries all three over the course of a night.
 *
 * @param {object} view - see toScreeningView for the shape
 */
export const buildScreeningCard = (view) => {
  const {
    title, releaseYear, imageUrl, backdropUrl, runtime, startedAt,
    tmdbRating, state, ratings = [], attendees = [], attendeeCount = 0
  } = view;

  const { name, year } = splitTitleYear(title, releaseYear);
  const heading = year ? `${name} (${year})` : name;

  const author = state === 'playing'
    ? '🔴 NOW PLAYING'
    : state === 'rating' ? '⭐ RATE IT' : '🏆 THE VERDICT';

  const color = state === 'playing'
    ? COLOR_PLAYING
    : state === 'rating' ? COLOR_RATING : COLOR_SETTLED;

  const embed = new EmbedBuilder()
    .setAuthor({ name: author })
    .setTitle(heading)
    .setColor(color)
    .setTimestamp();

  const parts = [];

  if (state === 'playing') {
    const runtimeText = formatRuntime(runtime);
    if (runtimeText) {
      const endTs = Math.floor((new Date(startedAt).getTime() + runtime * 60_000) / 1000);
      parts.push(`${runtimeText} · ends ~<t:${endTs}:t>`);
    }
    if (attendees.length) {
      parts.push(`🎟 ${attendees.map((a) => a.username).join(' · ')}`);
    }
    parts.push('Rating opens when the credits roll');
  } else {
    const avg = averageScore(ratings);

    if (avg === null) {
      parts.push(`${ratingMeter(0)}  Nobody's rated yet`);
    } else if (state === 'settled') {
      parts.push(`${ratingMeter(avg)}  **${formatScore(avg.toFixed(1))}/10** · ${ratings.length} of us`);
    } else {
      const denominator = attendeeCount > 0 ? ` of ${attendeeCount}` : '';
      parts.push(`${ratingMeter(avg)}  **${formatScore(avg.toFixed(1))}** · ${ratings.length}${denominator} rated`);
    }

    if (state === 'settled') {
      // High and low only say something when there's a spread and enough
      // voters for it to mean anything.
      if (ratings.length >= 3) {
        const sorted = [...ratings].sort((a, b) => Number(b.score) - Number(a.score));
        const high = sorted[0];
        const low = sorted[sorted.length - 1];
        if (Number(high.score) !== Number(low.score)) {
          parts.push(`▲ ${high.username} ${formatScore(high.score)}          ▼ ${low.username} ${formatScore(low.score)}`);
        }
      }
      const comparison = tmdbComparison(avg, tmdbRating);
      if (comparison) parts.push(comparison);
    } else {
      parts.push(formatRaters(ratings));
    }

    const commented = ratings.filter((r) => r.comment?.trim());
    if (commented.length) {
      const { comment, username } = commented[0];
      const text = comment.trim();
      const shown = text.length > COMMENT_MAX ? `${text.slice(0, COMMENT_MAX - 1)}…` : text;
      parts.push(`"${shown}" — ${username}`);
    }
  }

  embed.setDescription(parts.join('\n\n'));

  if (imageUrl) embed.setThumbnail(imageUrl);
  // The backdrop is the reward for a finished night — verdict state only.
  if (state === 'settled' && backdropUrl) embed.setImage(backdropUrl);

  return embed;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 17 new tests (74 total)

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/screeningCard.js bot/src/utils/screeningCard.test.js
git commit -m "feat(bot): three-state screening card builder"
```

---

## Task 3: Components and the view adapter

**Files:**
- Modify: `bot/src/utils/screeningCard.js`
- Modify: `bot/src/utils/screeningCard.test.js`

- [ ] **Step 1: Write the failing test**

Append, adding `buildScreeningComponents` and `toScreeningView` to the import.

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `buildScreeningComponents is not a function`

- [ ] **Step 3: Write them**

Append to `bot/src/utils/screeningCard.js`:

```js
/**
 * Rating buttons, or [] while the movie is still playing. They stay live in the
 * settled state on purpose — someone who missed the night can still rate.
 */
export const buildScreeningComponents = (view) => {
  if (view.state === 'playing') return [];
  return createRatingButtons(view.id);
};

/**
 * Map a movie_nights row (plus its ratings and attendees) to a card view.
 * `attendee_count` arrives from pg's COUNT as a string.
 */
export const toScreeningView = (row, extras = {}) => ({
  id: row.id,
  title: row.title,
  releaseYear: row.release_year ?? null,
  imageUrl: row.image_url ?? null,
  backdropUrl: row.backdrop_url ?? null,
  runtime: row.runtime ?? null,
  startedAt: row.started_at ?? null,
  tmdbRating: row.tmdb_rating ?? null,
  state: extras.state ?? screeningState(row),
  ratings: extras.ratings ?? [],
  attendees: extras.attendees ?? [],
  attendeeCount: Number(extras.attendeeCount ?? row.attendee_count ?? 0)
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 5 new tests (79 total)

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/screeningCard.js bot/src/utils/screeningCard.test.js
git commit -m "feat(bot): screening card components and view adapter"
```

---

## Task 4: Migration

**Files:**
- Modify: `backend/src/config/migrate.js`

- [ ] **Step 1: Add the columns to the existing tmdbColumns loop**

`migrate.js:100-112` already has an idempotent add-column loop for
`movie_nights`. Add two entries to that array, after `trailer_url`:

```js
      { name: 'trailer_url', type: 'VARCHAR(500)' },
      { name: 'starting_message_id', type: 'VARCHAR(20)' },
      { name: 'card_settled_at', type: 'TIMESTAMP' }
```

`message_id` already holds the *announcement* message; `starting_message_id`
holds the *screening card*, so the two can be edited independently.
`card_settled_at` is the claim marker for the settle sweep — without it the
sweep would re-edit every settled card on every cron tick, forever.

- [ ] **Step 2: Run the migration**

Run: `cd backend && npm run db:migrate`
Expected: completes without error. Safe to re-run — the loop checks
`information_schema.columns` first.

- [ ] **Step 3: Verify the columns exist**

Run:
```bash
cd backend && node -e "
import('./src/config/database.js').then(async ({ default: pool }) => {
  const r = await pool.query(\"SELECT column_name FROM information_schema.columns WHERE table_name='movie_nights' AND column_name IN ('starting_message_id','card_settled_at')\");
  console.log(r.rows.map(x => x.column_name).sort().join(', '));
  process.exit(0);
});"
```
Expected: `card_settled_at, starting_message_id`

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/migrate.js
git commit -m "feat(db): add starting_message_id and card_settled_at to movie_nights"
```

---

## Task 5: Model functions and the timing change

**Files:**
- Modify: `bot/src/models/index.js`

- [ ] **Step 1: Move the rating window to the end of the movie**

Replace `getMoviesReadyForRatingNotification` (`bot/src/models/index.js:686`):

```js
export const getMoviesReadyForRatingNotification = async () => {
  // Movies that have started, haven't been prompted yet, and have now run their
  // full length. Rating opens when the credits roll — the audience is still in
  // voice, so editing the card in place reaches them.
  const result = await pool.query(
    `SELECT * FROM movie_nights
     WHERE started_at IS NOT NULL
       AND rating_prompt_sent_at IS NULL
       AND CURRENT_TIMESTAMP >= started_at + INTERVAL '1 minute' * COALESCE(runtime, 90)
     ORDER BY started_at ASC`
  );
  return result.rows;
};
```

- [ ] **Step 2: Add the new queries**

Add next to `getAttendees` in `bot/src/models/index.js`:

```js
// Attach the screening card's message to the movie night, so later state
// transitions can find and edit it.
export const updateStartingMessageId = async (movieNightId, messageId) => {
  const result = await pool.query(
    `UPDATE movie_nights SET starting_message_id = $2 WHERE id = $1 RETURNING *`,
    [movieNightId, messageId]
  );
  return result.rows[0];
};

// Everything the screening card needs about the movie itself, plus how many
// people RSVP'd (the denominator in "4 of 6 rated").
export const getScreeningRow = async (movieNightId) => {
  const result = await pool.query(
    `SELECT mn.*,
            (SELECT COUNT(*) FROM movie_attendance WHERE movie_night_id = mn.id) AS attendee_count
     FROM movie_nights mn
     WHERE mn.id = $1`,
    [movieNightId]
  );
  return result.rows[0];
};

// Cards whose rating window has aged out and that haven't been settled yet.
// card_settled_at is the claim marker — without it this would re-edit every
// settled card on every tick.
export const getMoviesToSettle = async () => {
  const result = await pool.query(
    `SELECT * FROM movie_nights
     WHERE rating_prompt_sent_at IS NOT NULL
       AND card_settled_at IS NULL
       AND starting_message_id IS NOT NULL
       AND CURRENT_TIMESTAMP >= rating_prompt_sent_at + INTERVAL '24 hours'
     ORDER BY rating_prompt_sent_at ASC`
  );
  return result.rows;
};

// Atomically claim a card for settling, mirroring markRatingPromptSent.
export const markCardSettled = async (movieNightId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET card_settled_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND card_settled_at IS NULL
     RETURNING *`,
    [movieNightId]
  );
  return result.rows[0];
};
```

- [ ] **Step 3: Verify syntax**

Run: `cd bot && node --check src/models/index.js`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add bot/src/models/index.js
git commit -m "feat(bot): screening card queries; rating opens at end of runtime"
```

---

## Task 6: Post and refresh helpers

**Files:**
- Create: `bot/src/utils/screeningMessage.js`

- [ ] **Step 1: Write the helper**

Create `bot/src/utils/screeningMessage.js`:

```js
import {
  getScreeningRow,
  getRatingsForMovie,
  getAttendees,
  updateStartingMessageId
} from '../models/index.js';
import {
  buildScreeningCard,
  buildScreeningComponents,
  toScreeningView
} from './screeningCard.js';
import { createLogger } from './logger.js';

const logger = createLogger('screeningMessage');

const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

const MOVIE_NIGHT_ROLE_ID = process.env.MOVIE_NIGHT_ROLE_ID;

// Load the row plus everything the card renders from, in one place so the post
// and refresh paths can't drift.
async function loadView(movieNightId, stateOverride) {
  const row = await getScreeningRow(movieNightId);
  if (!row) return null;
  const [ratings, attendees] = await Promise.all([
    getRatingsForMovie(movieNightId),
    getAttendees(movieNightId)
  ]);
  return { row, view: toScreeningView(row, { ratings, attendees, state: stateOverride }) };
}

/**
 * Post the screening card for a movie that just started, and remember its
 * message id. This is a real new message with a role ping — at start time the
 * audience is scattered, so an edit would reach nobody.
 */
export const postScreeningCard = async (movieNightId, channel) => {
  const loaded = await loadView(movieNightId, 'playing');
  if (!loaded) return null;

  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const message = await channel.send({
    content,
    embeds: [buildScreeningCard(loaded.view)],
    components: buildScreeningComponents(loaded.view)
  });

  await updateStartingMessageId(movieNightId, message.id);
  logger.info(`Posted screening card for movie ${movieNightId}`);
  return message;
};

/**
 * Re-render the screening card from current state. Safe to call for a movie
 * with no card (nothing happens) and for a deleted message.
 */
export const refreshScreeningCard = async (client, movieNightId, stateOverride) => {
  try {
    const loaded = await loadView(movieNightId, stateOverride);
    if (!loaded?.row?.starting_message_id || !loaded.row.channel_id) return;

    const channel = await client.channels.fetch(loaded.row.channel_id).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    const message = await channel.messages
      .fetch(loaded.row.starting_message_id)
      .catch(() => null);
    if (!message) {
      logger.info(`Screening card for movie ${movieNightId} is gone — nothing to refresh`);
      return;
    }

    await message.edit({
      embeds: [buildScreeningCard(loaded.view)],
      components: buildScreeningComponents(loaded.view)
    });
    logger.info(`Refreshed screening card for movie ${movieNightId}`);
  } catch (err) {
    if (err?.code === UNKNOWN_MESSAGE || err?.code === UNKNOWN_CHANNEL) {
      logger.info(`Screening card for movie ${movieNightId} no longer exists — skipping`);
      return;
    }
    logger.error(`Failed to refresh screening card for movie ${movieNightId}`, err);
  }
};
```

- [ ] **Step 2: Verify syntax**

Run: `cd bot && node --check src/utils/screeningMessage.js`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add bot/src/utils/screeningMessage.js
git commit -m "feat(bot): post and refresh helpers for the screening card"
```

---

## Task 7: Wire the two start paths

**Files:**
- Modify: `bot/src/jobs/movieStarter.js`
- Modify: `bot/src/commands/start.js`

- [ ] **Step 1: Replace the embed in movieStarter**

In `bot/src/jobs/movieStarter.js`, replace the `createStartingNowEmbed` import
(line 3) with:

```js
import { postScreeningCard } from '../utils/screeningMessage.js';
```

Then replace the channel/send block (the `if (channel) { ... } else { ... }`)
with:

```js
          const channel = await client.channels.fetch(movie.channel_id).catch(() => null);

          if (channel) {
            await postScreeningCard(movie.id, channel);
            logger.info(`Started movie night: ${movie.title} (ID: ${movie.id})`);
          } else {
            logger.error(`Could not find channel ${movie.channel_id} for movie ${movie.id}`);
          }
```

The `refreshAnnouncementMessage(client, movie.id)` call added in the previous
milestone stays exactly where it is — that updates the *announcement*, which is
a different message.

- [ ] **Step 2: Replace the embed in /start**

In `bot/src/commands/start.js`, replace the import on line 3:

```js
import { postScreeningCard } from '../utils/screeningMessage.js';
```

Then replace the "Send the starting now announcement" block (lines 66-73) with:

```js
    // Post the screening card in the movie's own channel via the shared helper,
    // so a manual start looks identical to an automatic one. /start no longer
    // attaches rating buttons — rating opens when the credits roll.
    const channel = await client.channels
      .fetch(movie.channel_id || interaction.channelId)
      .catch(() => null);

    if (!channel?.isTextBased?.()) {
      return interaction.reply({
        content: 'Started, but I could not find the channel to post in.',
        ephemeral: true
      });
    }

    await postScreeningCard(movieId, channel);

    await interaction.reply({
      content: `Started **${movie.title}**.`,
      ephemeral: true
    });
```

`postScreeningCard` takes only `(movieNightId, channel)` — it needs no client,
since the channel object can send on its own.

- [ ] **Step 3: Verify syntax**

Run: `cd bot && node --check src/jobs/movieStarter.js && node --check src/commands/start.js`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add bot/src/jobs/movieStarter.js bot/src/commands/start.js
git commit -m "feat(bot): both start paths post the shared screening card"
```

---

## Task 8: Rating notifier edits in place, plus the settle sweep

**Files:**
- Modify: `bot/src/jobs/ratingNotifier.js`

- [ ] **Step 1: Replace the file**

Replace `bot/src/jobs/ratingNotifier.js` entirely:

```js
import cron from 'node-cron';
import {
  getMoviesReadyForRatingNotification,
  markRatingPromptSent,
  getMoviesToSettle,
  markCardSettled
} from '../models/index.js';
import { refreshScreeningCard } from '../utils/screeningMessage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ratingNotifier');

const CRON_EVERY_MINUTE = '* * * * *';

// Open rating on every movie whose runtime has elapsed. This edits the existing
// screening card rather than posting a new message: the audience is still in
// voice when the credits roll, so they're looking at the channel already.
async function openRatingWindows(client) {
  const moviesReady = await getMoviesReadyForRatingNotification();

  for (const movie of moviesReady) {
    try {
      // Claim first so overlapping ticks can't double-fire.
      const claimed = await markRatingPromptSent(movie.id);
      if (!claimed) continue;

      await refreshScreeningCard(client, movie.id, 'rating');
      logger.info(`Opened rating for: ${movie.title} (ID: ${movie.id})`);
    } catch (err) {
      logger.error(`Error opening rating for movie ${movie.id}`, err);
    }
  }
}

// Flip aged-out cards to the verdict state. Buttons stay live afterwards, so a
// latecomer can still rate — the card just stops looking urgent.
async function settleAgedCards(client) {
  const toSettle = await getMoviesToSettle();

  for (const movie of toSettle) {
    try {
      const claimed = await markCardSettled(movie.id);
      if (!claimed) continue;

      await refreshScreeningCard(client, movie.id, 'settled');
      logger.info(`Settled screening card for: ${movie.title} (ID: ${movie.id})`);
    } catch (err) {
      logger.error(`Error settling card for movie ${movie.id}`, err);
    }
  }
}

export const startRatingNotifierJob = (client) => {
  cron.schedule(CRON_EVERY_MINUTE, async () => {
    try {
      await openRatingWindows(client);
      await settleAgedCards(client);
    } catch (err) {
      logger.error('Error in rating notifier job', err);
    }
  });

  logger.info('Rating notifier job scheduled (opens rating at end of runtime, settles after 24h)');
};
```

- [ ] **Step 2: Verify syntax**

Run: `cd bot && node --check src/jobs/ratingNotifier.js`
Expected: no output

- [ ] **Step 3: Commit**

```bash
git add bot/src/jobs/ratingNotifier.js
git commit -m "feat(bot): rating opens by editing the card; settle sweep for verdicts"
```

---

## Task 9: Refresh the card when a rating lands

**Files:**
- Modify: `bot/src/handlers/rating/handleRatingCommentModal.js`
- Modify: `bot/src/commands/rate.js`

- [ ] **Step 1: Refresh after the button/modal path**

In `bot/src/handlers/rating/handleRatingCommentModal.js`, add the import:

```js
import { refreshScreeningCard } from '../../utils/screeningMessage.js';
```

Then, immediately after `await upsertRating(movieId, user.id, score, comment);`,
add:

```js
    // Tick the live tally on the screening card. Non-fatal: the rating is
    // already saved, so a Discord hiccup must not fail the interaction.
    refreshScreeningCard(interaction.client, movieId).catch((err) =>
      logger.error(`Failed to refresh card for movie ${movieId}`, err)
    );
```

Deliberately not awaited — the user gets their ephemeral confirmation
immediately and the card catches up a moment later.

- [ ] **Step 2: Refresh after /rate**

In `bot/src/commands/rate.js`, add the import:

```js
import { refreshScreeningCard } from '../utils/screeningMessage.js';
```

Then, immediately after the `await upsertRating(movieId, user.id, score, comment);`
call at line 99, add:

```js
    refreshScreeningCard(interaction.client, movieId).catch((err) =>
      logger.error(`Failed to refresh card for movie ${movieId}`, err)
    );
```

- [ ] **Step 3: Verify syntax**

Run: `cd bot && node --check src/handlers/rating/handleRatingCommentModal.js && node --check src/commands/rate.js`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add bot/src/handlers/rating/handleRatingCommentModal.js bot/src/commands/rate.js
git commit -m "feat(bot): screening card tally updates when a rating lands"
```

---

## Task 10: Web ratings reach the card

Without this, a rating submitted on the website leaves the Discord card stale.

**Files:**
- Modify: `backend/src/models/ratings.js`
- Modify: `backend/src/routes/movies.js`
- Modify: `bot/src/events/ready.js`

- [ ] **Step 1: Add the NOTIFY**

Add to `backend/src/models/ratings.js`, following `notifyReschedule` in
`movies.js`:

```js
// Signal the bot to re-render the Discord screening card after a web rating.
// Payload is the movie id.
export const notifyRating = async (movieId) => {
  await pool.query("SELECT pg_notify('movie_rating', $1)", [String(movieId)]);
};
```

- [ ] **Step 2: Widen the web rating gate and fire the NOTIFY**

In `backend/src/routes/movies.js`, change the buffer at line 298 so the web
opens rating at the same moment Discord does:

```js
    // Rating opens when the credits roll. Must stay in step with the bot's
    // getMoviesReadyForRatingNotification, or the web opens before the card does.
    const RATING_BUFFER_MINUTES = 0;
```

Then, immediately after `const rating = await db.upsertRating(...)` at line 310:

```js
    // Tell the bot to update the Discord card. Non-fatal.
    try {
      await db.notifyRating(parseInt(id));
    } catch (err) {
      console.error('Failed to send movie_rating NOTIFY:', err.message);
    }
```

- [ ] **Step 3: Listen for it**

In `bot/src/events/ready.js`, add the import:

```js
import { refreshScreeningCard } from '../utils/screeningMessage.js';
```

Then add one entry to the `startNotifyListener` map (line 89-93):

```js
  startNotifyListener({
    movie_announcement: () => processPendingAnnouncements(client),
    movie_reschedule: (payload) => postRescheduleNote(client, payload),
    movie_cancel: (payload) => postCancelNote(client, payload),
    movie_rating: (payload) => refreshScreeningCard(client, parseInt(payload, 10))
  });
```

- [ ] **Step 4: Verify syntax**

Run: `cd bot && node --check src/events/ready.js && cd ../backend && node --check src/models/ratings.js && node --check src/routes/movies.js`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/ratings.js backend/src/routes/movies.js bot/src/events/ready.js
git commit -m "feat: web ratings refresh the Discord screening card"
```

---

## Task 11: Remove the superseded builders and verify

**Files:**
- Modify: `bot/src/utils/embeds.js`

- [ ] **Step 1: Confirm nothing imports them**

Run: `cd bot && grep -rn "createStartingNowEmbed\|createRatingAvailableEmbed\|createRatingPromptEmbed" src/ --include=*.js | grep -v "utils/embeds.js"`

Expected: **exactly one match**, a comment in `announcementEmbed.js` that reads
`// green — matches createStartingNowEmbed`. Change that comment to
`// green — matches the screening card's playing state`.

Any *other* match is a live call site — fix it before deleting anything.

- [ ] **Step 2: Delete the three builders**

From `bot/src/utils/embeds.js`, delete these functions entirely:

- `createRatingPromptEmbed` — dead code, no callers anywhere even before this work
- `createStartingNowEmbed` — replaced by the card's playing state
- `createRatingAvailableEmbed` — replaced by the card's rating state

Keep `createRatingButtons` — the card uses it.

- [ ] **Step 3: Full verification**

Run: `cd bot && npm test`
Expected: 79 tests passing

Run every changed module through an import smoke test:
```bash
cd bot && DATABASE_URL="postgres://u:p@localhost:5432/none" node -e "
const files=['commands/start.js','commands/rate.js','events/ready.js','jobs/movieStarter.js','jobs/ratingNotifier.js','utils/embeds.js','utils/screeningCard.js','utils/screeningMessage.js','handlers/index.js'];
(async()=>{let bad=0;for(const f of files){try{await import('./src/'+f)}catch(e){console.error('FAIL '+f+': '+e.message);bad++}}console.log(bad?bad+' failed':'all import cleanly');process.exit(bad?1:0)})();"
```
Expected: `all import cleanly`

**Note:** `/start`'s reply changed but its *signature* didn't, so
`npm run deploy` is not required.

- [ ] **Step 4: Manual checklist**

Use `is_test` movie nights.

- [ ] `/start` a movie → green NOW PLAYING card, poster, runtime, end time, RSVP names, **no buttons**
- [ ] Only one message posts (no separate "Starting NOW")
- [ ] Wait for runtime to elapse (or set a 1-minute runtime) → the same message turns yellow, gains buttons, says "Nobody's rated yet"
- [ ] Click a rating button, submit the modal → meter fills, average appears, your name and score listed
- [ ] Rate again with a different score → tally updates, no duplicate entry
- [ ] Second user rates → both names, average recomputes, "2 of N rated"
- [ ] Add a comment → it appears quoted under the scores
- [ ] `/rate` with a half point (7.5) → renders as `7.5`, not `7.50` or `8`
- [ ] Rate from the website → the Discord card updates within a second
- [ ] Try rating from the website *before* the movie ends → refused, same moment Discord opens
- [ ] Force settle: `UPDATE movie_nights SET rating_prompt_sent_at = NOW() - INTERVAL '25 hours' WHERE id = <id>` → within a minute the card turns gold, shows ▲/▼ and the TMDB comparison, gains the backdrop
- [ ] Buttons still work in the settled state
- [ ] Settled card is not re-edited on subsequent ticks (check the log — "Settled" should appear once)
- [ ] Delete the card message, then rate → info log, no crash
- [ ] A movie with no `tmdb_rating` → no comparison line
- [ ] A movie with 2 ratings settling → no ▲/▼ line

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/embeds.js bot/src/utils/announcementEmbed.js
git commit -m "refactor(bot): drop the superseded starting and rating embeds"
```

---

## Done

```bash
git checkout master
git merge --no-ff feat/screening-card
```
