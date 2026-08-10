# Rich Announcement Embed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the TMDB data the bot already stores — tagline, overview, score, genres, runtime, backdrop, trailer — in the movie night announcement, and add an RSVP button that live-updates an attendee list.

**Architecture:** One pure embed builder (`bot/src/utils/announcementEmbed.js`) takes a plain "view" object and returns an `EmbedBuilder` + button rows. All four announcement surfaces map their database row into that view, so they cannot drift apart. A second helper re-renders an already-posted message when state changes (RSVP, reschedule, start, cancel).

**Tech Stack:** Node 20+ ESM, discord.js v14, pg (raw SQL), `node --test` (built in, no new packages).

**Spec:** `docs/superpowers/specs/2026-08-10-announcement-embed-design.md`

**No database migration is required.** Every column already exists.

---

## Background the engineer needs

**This is a monorepo of three services** sharing one PostgreSQL database: `bot/`
(discord.js), `backend/` (Express), `frontend/` (React). The bot and backend
never call each other over HTTP — they both talk to the database directly. You
are working almost entirely in `bot/`.

**There are four places an announcement gets posted**, and today each builds its
embed slightly differently:

1. `bot/src/commands/announce.js` — the `/announce` slash command
2. `bot/src/jobs/announcementProcessor.js` — drains the `pending_announcements`
   queue that the website writes into
3. The same processor's marathon branch — a film that belongs to a marathon
4. `processBingeAnnouncement` in that file — one embed for a whole binge evening

**Two traps that will cost you an hour if you don't know them:**

- **`movie_nights.title` already contains the year.** `announce.js:75` stores
  `"The Help (2011)"`, not `"The Help"`. There is *also* a `release_year`
  column. Naively rendering `` `${title} (${releaseYear})` `` gives you
  `The Help (2011) (2011)`. Task 1 builds a helper to handle this.
- **`tmdb_rating` is a `DECIMAL(3,1)`, and the `pg` driver returns DECIMALs as
  JavaScript strings, not numbers.** `rating.toFixed(1)` throws. Always
  `Number(rating)` first.

**There is no test framework in this repo.** Task 1 adds a `test` script using
Node's *built-in* runner — no new dependencies. Only the pure builder functions
are unit tested; anything touching the database or Discord is verified by the
manual checklist in Task 12. Keep `announcementEmbed.js` free of database and
`client` imports so the test file never opens a pg connection pool.

---

## File structure

| File | Responsibility |
|---|---|
| **Create** `bot/src/utils/announcementEmbed.js` | Pure functions: view → embed + buttons. No I/O. |
| **Create** `bot/src/utils/announcementEmbed.test.js` | Unit tests for the above |
| **Create** `bot/src/utils/announcementMessage.js` | Re-render an already-posted message. Touches DB + Discord. |
| **Create** `bot/src/handlers/attendance/handleRsvpButton.js` | RSVP button interaction |
| **Create** `bot/src/handlers/attendance/index.js` | Barrel export |
| **Modify** `bot/src/models/index.js` | 4 new query functions |
| **Modify** `bot/src/commands/announce.js` | Reorder create/send; use new builder |
| **Modify** `bot/src/jobs/announcementProcessor.js` | Same reorder; both branches |
| **Modify** `bot/src/utils/embeds.js` | Delete `createAnnouncementEmbed`; binge embed gains buttons |
| **Modify** `bot/src/handlers/index.js` | Export the RSVP handler |
| **Modify** `bot/src/events/interactionCreate.js` | Route `rsvp_` |
| **Modify** `bot/src/jobs/movieStarter.js` | Refresh message on start |
| **Modify** `bot/src/jobs/rescheduleNotifier.js` | Refresh message on reschedule |
| **Modify** `bot/src/jobs/cancelNotifier.js` | Grey out the original message |
| **Modify** `backend/src/models/movies.js` | Add `messageId` to cancel payload |
| **Modify** `backend/src/routes/movies.js` | Pass it |
| **Modify** `bot/package.json` | Add `test` script |

`bot/src/utils/embeds.js` is already a 250-line grab-bag of eight unrelated
builders. The announcement builder is the one about to grow, so it moves out.
Everything else in that file stays exactly where it is.

---

## Task 1: Pure formatting helpers

**Files:**
- Create: `bot/src/utils/announcementEmbed.js`
- Create: `bot/src/utils/announcementEmbed.test.js`
- Modify: `bot/package.json`

- [ ] **Step 1: Add the test script**

In `bot/package.json`, add one line to `scripts`:

```json
  "scripts": {
    "start": "node src/index.js",
    "dev": "node --watch src/index.js",
    "deploy": "node src/deploy-commands.js",
    "test": "node --test \"src/**/*.test.js\""
  },
```

The glob must be explicit and quoted. `node --test src/` treats every `.js`
under `src/` as a test file, which means it *executes* `src/index.js` and the
bot dies with `FATAL: DISCORD_TOKEN environment variable is not set`. Quoting
leaves the globbing to Node rather than the shell, so it behaves the same in
PowerShell and bash.

- [ ] **Step 2: Write the failing test**

Create `bot/src/utils/announcementEmbed.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  splitTitleYear,
  formatRuntime,
  truncateOverview,
  formatAttendees
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `Cannot find module .../announcementEmbed.js`

- [ ] **Step 4: Write the helpers**

Create `bot/src/utils/announcementEmbed.js`:

```js
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Announcement embed colors, keyed to lifecycle state.
const COLOR_SCHEDULED = 0x5865F2; // blurple — matches the rest of the bot
const COLOR_STARTED = 0x57F287;   // green — matches createStartingNowEmbed
const COLOR_CANCELLED = 0x99AAB5; // grey

const OVERVIEW_MAX = 300;
const ATTENDEE_MAX = 15;

// movie_nights.title already carries "(YYYY)" (see announce.js), while
// release_year holds the same value separately. Rendering both duplicates it,
// so pull the year out of the title when it's there and prefer that.
// Only a bare 4-digit group counts, so "Blade Runner (Final Cut)" survives.
const YEAR_SUFFIX = /\s*\((\d{4})\)\s*$/;

export const splitTitleYear = (title, releaseYear) => {
  const match = title?.match(YEAR_SUFFIX);
  if (match) {
    return { name: title.replace(YEAR_SUFFIX, '').trim(), year: parseInt(match[1], 10) };
  }
  return { name: title ?? '', year: releaseYear ?? null };
};

export const formatRuntime = (minutes) => {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
};

export const truncateOverview = (text, max = OVERVIEW_MAX) => {
  const clean = text?.trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[.,;:!?]$/, '')}…`;
};

export const formatAttendees = (attendees = []) => {
  if (attendees.length === 0) return 'Nobody yet — be the first';
  const names = attendees.map((a) => a.username);
  if (names.length <= ATTENDEE_MAX) return names.join(' · ');
  const shown = names.slice(0, ATTENDEE_MAX).join(' · ');
  return `${shown} **+${names.length - ATTENDEE_MAX} more**`;
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 14 tests passing

- [ ] **Step 6: Commit**

```bash
git add bot/package.json bot/src/utils/announcementEmbed.js bot/src/utils/announcementEmbed.test.js
git commit -m "feat(bot): announcement embed formatting helpers + node --test setup"
```

---

## Task 2: The embed builder

**Files:**
- Modify: `bot/src/utils/announcementEmbed.js`
- Modify: `bot/src/utils/announcementEmbed.test.js`

- [ ] **Step 1: Write the failing test**

Append to `bot/src/utils/announcementEmbed.test.js`. Also add
`buildAnnouncementEmbed` to the existing import at the top of the file.

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `buildAnnouncementEmbed is not a function`

- [ ] **Step 3: Write the builder**

Append to `bot/src/utils/announcementEmbed.js`:

```js
/**
 * Build the announcement embed from a view object. Pure — no database, no
 * Discord client, no environment reads. Every block is conditional so a movie
 * with no TMDB match degrades to title + time + RSVP rather than a shell of
 * empty fields.
 *
 * @param {object} view - see toAnnouncementView for the shape
 */
export const buildAnnouncementEmbed = (view) => {
  const {
    title, releaseYear, scheduledAt, startedAt, cancelled = false,
    imageUrl, backdropUrl, description, tagline,
    tmdbId, tmdbRating, genres, runtime,
    announcerName, marathonName, marathonPosition, marathonTotal,
    attendees = []
  } = view;

  const { name, year } = splitTitleYear(title, releaseYear);
  const heading = year ? `${name} (${year})` : name;
  const when = new Date(scheduledAt);
  const startTs = Math.floor(when.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setAuthor({ name: marathonName || 'Movie Night' })
    .setTitle(cancelled ? `~~${heading}~~` : heading)
    .setColor(cancelled ? COLOR_CANCELLED : startedAt ? COLOR_STARTED : COLOR_SCHEDULED)
    .setFooter({ text: `Announced by ${announcerName || 'Website'}` })
    .setTimestamp();

  if (tmdbId && !cancelled) {
    embed.setURL(`https://www.themoviedb.org/movie/${tmdbId}`);
  }

  const parts = [];
  if (tagline) parts.push(`*"${tagline}"*`);
  const overview = truncateOverview(description);
  if (overview) parts.push(overview);

  if (cancelled) {
    parts.push('**This movie night has been cancelled.**');
  } else if (startedAt) {
    parts.push(`🔴 **STARTED** · <t:${startTs}:F>`);
  } else {
    parts.push(`🗓 <t:${startTs}:F> · <t:${startTs}:R>`);
  }
  embed.setDescription(parts.join('\n\n'));

  const runtimeText = formatRuntime(runtime);
  if (runtimeText) {
    const endTs = Math.floor((when.getTime() + runtime * 60_000) / 1000);
    embed.addFields({
      name: '⏱ Runtime',
      value: `${runtimeText}\nends ~<t:${endTs}:t>`,
      inline: true
    });
  }

  // pg returns DECIMAL as a string — Number() before toFixed or this throws.
  if (tmdbRating) {
    embed.addFields({
      name: '⭐ TMDB',
      value: `${Number(tmdbRating).toFixed(1)}/10`,
      inline: true
    });
  }

  if (genres) {
    embed.addFields({
      name: '🎭 Genres',
      value: genres.split(',').map((g) => g.trim()).filter(Boolean).join(' · '),
      inline: true
    });
  }

  if (marathonName && marathonPosition && marathonTotal) {
    embed.addFields({
      name: 'Marathon',
      value: `Film ${marathonPosition} of ${marathonTotal}`,
      inline: true
    });
  }

  if (!cancelled) {
    embed.addFields({
      name: `🎟 Going (${attendees.length})`,
      value: formatAttendees(attendees),
      inline: false
    });
  }

  // The backdrop is the wide cinematic slot; the poster sits beside the text.
  // With no backdrop the poster takes the big slot, as it did before this change.
  if (backdropUrl) {
    embed.setImage(backdropUrl);
    if (imageUrl) embed.setThumbnail(imageUrl);
  } else if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 27 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/announcementEmbed.js bot/src/utils/announcementEmbed.test.js
git commit -m "feat(bot): rich announcement embed builder"
```

---

## Task 3: The button row

**Files:**
- Modify: `bot/src/utils/announcementEmbed.js`
- Modify: `bot/src/utils/announcementEmbed.test.js`

Note: the Website button reads `process.env.FRONTEND_URL`, so the tests set and
restore it explicitly rather than depending on the developer's `.env`.

- [ ] **Step 1: Write the failing test**

Append to `bot/src/utils/announcementEmbed.test.js`, adding
`buildAnnouncementComponents` to the import at the top.

```js
// --- buildAnnouncementComponents ---

const withFrontendUrl = (url, fn) => {
  const previous = process.env.FRONTEND_URL;
  if (url === null) delete process.env.FRONTEND_URL;
  else process.env.FRONTEND_URL = url;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.FRONTEND_URL;
    else process.env.FRONTEND_URL = previous;
  }
};

const labelsOf = (rows) =>
  rows.length === 0 ? [] : rows[0].components.map((c) => c.data.label);

test('buildAnnouncementComponents renders all five buttons in one row', () => {
  const rows = withFrontendUrl('https://movienight.test', () =>
    buildAnnouncementComponents(FULL_VIEW)
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(labelsOf(rows), ["I'm in", 'Trailer', 'TMDB', 'IMDb', 'Website']);
});

test('buildAnnouncementComponents never exceeds the 5-button row limit', () => {
  const rows = withFrontendUrl('https://movienight.test', () =>
    buildAnnouncementComponents(FULL_VIEW)
  );
  assert.ok(rows[0].components.length <= 5);
});

test('buildAnnouncementComponents binds the RSVP button to the movie night id', () => {
  const rows = withFrontendUrl(null, () => buildAnnouncementComponents(FULL_VIEW));
  assert.equal(rows[0].components[0].data.custom_id, 'rsvp_42');
});

test('buildAnnouncementComponents builds the IMDb URL from the id', () => {
  const rows = withFrontendUrl(null, () => buildAnnouncementComponents(FULL_VIEW));
  const imdb = rows[0].components.find((c) => c.data.label === 'IMDb');
  assert.equal(imdb.data.url, 'https://www.imdb.com/title/tt1454029/');
});

test('buildAnnouncementComponents omits buttons whose data is missing', () => {
  const rows = withFrontendUrl(null, () =>
    buildAnnouncementComponents({ ...FULL_VIEW, trailerUrl: null, imdbId: null })
  );
  assert.deepEqual(labelsOf(rows), ["I'm in", 'TMDB']);
});

test('buildAnnouncementComponents drops the RSVP button once started', () => {
  const rows = withFrontendUrl(null, () =>
    buildAnnouncementComponents({ ...FULL_VIEW, startedAt: new Date() })
  );
  assert.deepEqual(labelsOf(rows), ['Trailer', 'TMDB', 'IMDb']);
});

test('buildAnnouncementComponents returns no rows at all when cancelled', () => {
  const rows = withFrontendUrl('https://movienight.test', () =>
    buildAnnouncementComponents({ ...FULL_VIEW, cancelled: true })
  );
  assert.deepEqual(rows, []);
});

test('buildAnnouncementComponents returns no rows when nothing is left to show', () => {
  const rows = withFrontendUrl(null, () =>
    buildAnnouncementComponents({
      id: 7,
      startedAt: new Date(),
      tmdbId: null,
      imdbId: null,
      trailerUrl: null
    })
  );
  assert.deepEqual(rows, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `buildAnnouncementComponents is not a function`

- [ ] **Step 3: Write the component builder**

Append to `bot/src/utils/announcementEmbed.js`:

```js
/**
 * Build the button row for an announcement. Exactly five buttons at most, which
 * is Discord's per-row limit, so this never needs a second row. Buttons whose
 * underlying data is missing are omitted rather than rendered dead.
 *
 * Returns [] when there is nothing to show, so callers can spread it into
 * `components` unconditionally.
 */
export const buildAnnouncementComponents = (view) => {
  const { id, tmdbId, imdbId, trailerUrl, startedAt, cancelled = false } = view;
  if (cancelled) return [];

  const buttons = [];

  // RSVP disappears once the movie is under way — you can't opt into a
  // screening that already started.
  if (!startedAt) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`rsvp_${id}`)
        .setLabel("I'm in")
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    );
  }

  if (trailerUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Trailer')
        .setEmoji('▶️')
        .setURL(trailerUrl)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (tmdbId) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('TMDB')
        .setURL(`https://www.themoviedb.org/movie/${tmdbId}`)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (imdbId) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('IMDb')
        .setURL(`https://www.imdb.com/title/${imdbId}/`)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (process.env.FRONTEND_URL) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Website')
        .setURL(process.env.FRONTEND_URL)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (buttons.length === 0) return [];
  return [new ActionRowBuilder().addComponents(...buttons)];
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 35 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/announcementEmbed.js bot/src/utils/announcementEmbed.test.js
git commit -m "feat(bot): announcement button row with trailer, TMDB, IMDb links"
```

---

## Task 4: The row-to-view adapter

This is the seam that keeps four call sites identical. `movie_nights` rows and
`pending_announcements` rows use the same column names for the fields we care
about, so one adapter serves both.

**Files:**
- Modify: `bot/src/utils/announcementEmbed.js`
- Modify: `bot/src/utils/announcementEmbed.test.js`

- [ ] **Step 1: Write the failing test**

Append to `bot/src/utils/announcementEmbed.test.js`, adding `toAnnouncementView`
to the import at the top.

```js
// --- toAnnouncementView ---

const DB_ROW = {
  id: 42,
  title: 'The Help (2011)',
  release_year: 2011,
  scheduled_at: '2025-08-03T19:00:00.000Z',
  started_at: null,
  image_url: 'poster.jpg',
  backdrop_url: 'backdrop.jpg',
  description: 'An aspiring author.',
  tagline: 'Change begins with a whisper.',
  tmdb_id: 300,
  tmdb_rating: '7.8',
  genres: 'Drama, History',
  runtime: 146,
  imdb_id: 'tt1454029',
  trailer_url: 'https://youtu.be/abc',
  announced_by_name: 'emy'
};

test('toAnnouncementView maps snake_case columns to the view', () => {
  const view = toAnnouncementView(DB_ROW);
  assert.equal(view.id, 42);
  assert.equal(view.releaseYear, 2011);
  assert.equal(view.backdropUrl, 'backdrop.jpg');
  assert.equal(view.trailerUrl, 'https://youtu.be/abc');
  assert.equal(view.announcerName, 'emy');
});

test('toAnnouncementView defaults attendees to an empty list', () => {
  assert.deepEqual(toAnnouncementView(DB_ROW).attendees, []);
});

test('toAnnouncementView lets extras override the row', () => {
  const view = toAnnouncementView(DB_ROW, {
    attendees: [{ username: 'jani' }],
    marathonName: 'Chastain',
    marathonPosition: 2,
    marathonTotal: 6,
    cancelled: true
  });
  assert.deepEqual(view.attendees, [{ username: 'jani' }]);
  assert.equal(view.marathonName, 'Chastain');
  assert.equal(view.cancelled, true);
});

test('toAnnouncementView falls back to Website for an announcer-less row', () => {
  const { announced_by_name, ...anonymous } = DB_ROW;
  assert.equal(toAnnouncementView(anonymous).announcerName, 'Website');
});

test('toAnnouncementView produces a view the embed builder accepts', () => {
  const data = buildAnnouncementEmbed(toAnnouncementView(DB_ROW)).data;
  assert.equal(data.title, 'The Help (2011)');
  assert.equal(data.fields.find((f) => f.name.includes('TMDB')).value, '7.8/10');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd bot && npm test`
Expected: FAIL — `toAnnouncementView is not a function`

- [ ] **Step 3: Write the adapter**

Append to `bot/src/utils/announcementEmbed.js`:

```js
/**
 * Map a database row to an announcement view. Works for both `movie_nights`
 * rows and `pending_announcements` rows — they share column names for
 * everything the embed reads.
 *
 * Note: `pending_announcements` has no `tagline` column, so web-triggered
 * announcements simply render without one. The block is conditional.
 *
 * @param {object} row
 * @param {object} [extras] - attendees, marathon context, cancelled flag
 */
export const toAnnouncementView = (row, extras = {}) => ({
  id: extras.id ?? row.id,
  title: row.title,
  releaseYear: row.release_year ?? null,
  scheduledAt: row.scheduled_at,
  startedAt: row.started_at ?? null,
  cancelled: extras.cancelled ?? false,
  imageUrl: row.image_url ?? null,
  backdropUrl: row.backdrop_url ?? null,
  description: row.description ?? null,
  tagline: row.tagline ?? null,
  tmdbId: row.tmdb_id ?? null,
  tmdbRating: row.tmdb_rating ?? null,
  genres: row.genres ?? null,
  runtime: row.runtime ?? null,
  imdbId: row.imdb_id ?? null,
  trailerUrl: row.trailer_url ?? null,
  announcerName: extras.announcerName ?? row.announced_by_name ?? 'Website',
  marathonName: extras.marathonName ?? row.marathon_name ?? null,
  marathonPosition: extras.marathonPosition ?? row.marathon_position ?? null,
  marathonTotal: extras.marathonTotal ?? row.marathon_total ?? null,
  attendees: extras.attendees ?? []
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd bot && npm test`
Expected: PASS — 40 tests passing

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/announcementEmbed.js bot/src/utils/announcementEmbed.test.js
git commit -m "feat(bot): row-to-view adapter for announcement embeds"
```

---

## Task 5: Model functions

**Files:**
- Modify: `bot/src/models/index.js`

The bot already has `getAttendeeDiscordIds` (line ~413) for pinging attendees on
reschedule. We need three more. Follow the `// SHARED` / `// PARALLEL` comment
convention documented in `CLAUDE.md` — every function that also exists in
`backend/src/models/` carries a comment naming its twin and the reason for any
difference.

- [ ] **Step 1: Add the functions**

Add to `bot/src/models/index.js`, next to the existing `getAttendeeDiscordIds`:

```js
// Attach the posted message to the movie night. The announcement flow creates
// the row before sending, because the RSVP button needs the row id in its
// customId — so message_id is filled in a beat later.
export const updateMovieNightMessage = async (movieNightId, messageId, channelId) => {
  const result = await pool.query(
    `UPDATE movie_nights
     SET message_id = $2, channel_id = COALESCE($3, channel_id)
     WHERE id = $1
     RETURNING *`,
    [movieNightId, messageId, channelId ?? null]
  );
  return result.rows[0];
};

// PARALLEL to backend/src/models/attendance.js (toggleAttendance) — intentionally
// differs: the bot resolves the Discord user to an internal id via
// findOrCreateUser first, while the web already holds req.user.id.
// Returns true if the user is now attending, false if they just withdrew.
export const toggleAttendance = async (movieNightId, userId) => {
  const existing = await pool.query(
    'SELECT id FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightId, userId]
  );

  if (existing.rows.length > 0) {
    await pool.query(
      'DELETE FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
      [movieNightId, userId]
    );
    return false;
  }

  // ON CONFLICT guards the race where two clicks land at once — the UNIQUE
  // constraint on (movie_night_id, user_id) makes the second a no-op.
  await pool.query(
    `INSERT INTO movie_attendance (movie_night_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (movie_night_id, user_id) DO NOTHING`,
    [movieNightId, userId]
  );
  return true;
};

// PARALLEL to backend/src/models/attendance.js (getAttendees) — intentionally
// differs: the bot needs only usernames in RSVP order for the embed field,
// while the web returns full user objects with avatars.
export const getAttendees = async (movieNightId) => {
  const result = await pool.query(
    `SELECT u.username
     FROM movie_attendance ma
     JOIN users u ON ma.user_id = u.id
     WHERE ma.movie_night_id = $1
     ORDER BY ma.created_at ASC`,
    [movieNightId]
  );
  return result.rows;
};

// Everything the announcement embed needs in one round trip: the movie night,
// its announcer, and marathon context when the film belongs to one.
// marathon_items links back via scheduled_movie_night_id.
export const getMovieNightForAnnouncement = async (movieNightId) => {
  const result = await pool.query(
    `SELECT mn.*,
            u.username AS announced_by_name,
            m.name AS marathon_name,
            mi.position AS marathon_position,
            (SELECT COUNT(*) FROM marathon_items WHERE marathon_id = m.id) AS marathon_total
     FROM movie_nights mn
     LEFT JOIN users u ON mn.announced_by = u.id
     LEFT JOIN marathon_items mi ON mi.scheduled_movie_night_id = mn.id
     LEFT JOIN marathons m ON mi.marathon_id = m.id
     WHERE mn.id = $1`,
    [movieNightId]
  );
  return result.rows[0];
};
```

- [ ] **Step 2: Verify the bot still boots**

Run: `cd bot && node --check src/models/index.js`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add bot/src/models/index.js
git commit -m "feat(bot): attendance toggle, attendee list, and announcement row queries"
```

---

## Task 6: Rewire `/announce`

The RSVP button's `customId` needs `movie_night.id`, but this command currently
replies *first* and inserts *second* (`announce.js:106-128`). The order has to
flip: defer, insert, build, edit, then patch the message id back onto the row.

**Files:**
- Modify: `bot/src/commands/announce.js:97-146`

- [ ] **Step 1: Replace the try block**

In `bot/src/commands/announce.js`, replace the entire `try { ... } catch { ... }`
block at lines 97-145 with:

```js
  // Defer first: creating the movie night before replying takes us past
  // Discord's 3-second interaction window on a slow database.
  await interaction.deferReply();

  let movieNight;
  try {
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Create the row BEFORE sending, because the RSVP button needs its id.
    // message_id is null for a beat and patched in below.
    movieNight = await createMovieNight(
      title,
      scheduledAt,
      user.id,
      interaction.guildId,
      interaction.channelId,
      null,
      imageUrl,
      tmdbData
    );

    const view = toAnnouncementView(movieNight, {
      announcerName: interaction.user.username,
      attendees: []
    });

    const reply = await interaction.editReply({
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });

    await updateMovieNightMessage(movieNight.id, reply.id, interaction.channelId);

    // Rating buttons are sent automatically when the movie starts.
  } catch (err) {
    logger.error('Error creating movie night', err);

    // If the row was created but the reply failed, it's an orphan with no
    // message — drop it rather than leaving a phantom night in /history.
    if (movieNight) {
      await deleteMovieNight(movieNight.id).catch((cleanupErr) =>
        logger.error(`Failed to clean up orphan movie night ${movieNight.id}`, cleanupErr)
      );
    }

    await interaction.editReply({
      content: 'There was an error creating the movie night.',
      embeds: [],
      components: []
    }).catch(() => {});
  }
```

- [ ] **Step 2: Update the imports**

Replace lines 2-3 of `bot/src/commands/announce.js`:

```js
import { findOrCreateUser, createMovieNight, updateMovieNightMessage, deleteMovieNight } from '../models/index.js';
import { buildAnnouncementEmbed, buildAnnouncementComponents, toAnnouncementView } from '../utils/announcementEmbed.js';
```

The old `import { createAnnouncementEmbed } from '../utils/embeds.js';` is gone —
nothing else in this file uses `embeds.js`.

- [ ] **Step 3: Check the early-return error paths still work**

The two early `interaction.reply({ ephemeral: true })` calls for a bad date
(line 55) and a failed TMDB fetch (line 69) run **before** `deferReply()`, so
they are unchanged and still correct. Confirm by reading lines 47-95 — no edits
needed there.

- [ ] **Step 4: Verify syntax**

Run: `cd bot && node --check src/commands/announce.js`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add bot/src/commands/announce.js
git commit -m "feat(bot): /announce posts the rich embed with RSVP and link buttons"
```

---

## Task 7: Rewire the announcement queue processor

Same reorder, for the website-triggered path. This one is more delicate because
the queue has an exactly-once guarantee: `claimPendingAnnouncement` atomically
claims a row so a crash or a second bot instance can't double-post.

**Files:**
- Modify: `bot/src/jobs/announcementProcessor.js:123-190`

- [ ] **Step 1: Replace `processAnnouncement`**

Replace the whole `processAnnouncement` function (lines 123-190) with:

```js
async function processAnnouncement(client, announcement, channel) {
  const scheduledAt = new Date(announcement.scheduled_at);
  const announcerName = announcement.username || 'Website';

  // Binge kickoff: one embed for the whole evening, N movie_nights behind it.
  if (announcement.marathon_binge) {
    return processBingeAnnouncement(client, announcement, channel, announcerName);
  }

  // Create the row BEFORE sending — the RSVP button needs its id in the
  // customId. message_id is patched on immediately after the send.
  const movieNight = await createMovieNight(
    announcement.title,
    scheduledAt,
    announcement.user_id,
    announcement.guild_id,
    channel.id,
    null,
    announcement.image_url,
    {
      description: announcement.description,
      tmdbId: announcement.tmdb_id,
      tmdbRating: announcement.tmdb_rating,
      genres: announcement.genres,
      runtime: announcement.runtime,
      releaseYear: announcement.release_year,
      backdropUrl: announcement.backdrop_url,
      imdbId: announcement.imdb_id,
      trailerUrl: announcement.trailer_url
    },
    announcement.is_test || false
  );

  const view = toAnnouncementView(movieNight, {
    announcerName,
    attendees: [],
    marathonName: announcement.marathon_name ?? null,
    marathonPosition: announcement.marathon_position ?? null,
    marathonTotal: announcement.marathon_total ?? null
  });

  let reply;
  try {
    const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
    reply = await channel.send({
      content,
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });
  } catch (err) {
    // The row exists but no message does. Delete it so /history doesn't show a
    // night nobody was told about, then let the caller mark this failed.
    await deleteMovieNight(movieNight.id).catch((cleanupErr) =>
      logger.error(`Failed to clean up orphan movie night ${movieNight.id}`, cleanupErr)
    );
    throw err;
  }

  await updateMovieNightMessage(movieNight.id, reply.id, channel.id);

  // Back-link the marathon item and complete the marathon if this was the last film.
  if (announcement.marathon_item_id) {
    await linkMarathonItemMovieNight(announcement.marathon_item_id, movieNight.id);
    await completeMarathonIfDone(announcement.marathon_id);
  }

  await markAnnouncementProcessed(announcement.id, 'processed');

  logger.info(`Processed announcement: ${announcement.title} (ID: ${announcement.id})`);
}
```

Note the marathon ribbon and progress field are no longer bolted on after the
fact (old lines 141-148) — they travel through the view and are rendered by the
shared builder, so `/announce` and the web path produce identical markup.

- [ ] **Step 2: Update the imports**

Replace lines 2-7 of `bot/src/jobs/announcementProcessor.js`:

```js
import {
  getPendingAnnouncements, claimPendingAnnouncement, markAnnouncementProcessed,
  createMovieNight, findOrCreateUser, updateMovieNightMessage, deleteMovieNight,
  linkMarathonItemMovieNight, completeMarathonIfDone, getMarathonItemsByMarathon
} from '../models/index.js';
import { createBingeAnnouncementEmbed } from '../utils/embeds.js';
import {
  buildAnnouncementEmbed, buildAnnouncementComponents, toAnnouncementView
} from '../utils/announcementEmbed.js';
```

- [ ] **Step 3: Verify syntax**

Run: `cd bot && node --check src/jobs/announcementProcessor.js`
Expected: no output

- [ ] **Step 4: Commit**

```bash
git add bot/src/jobs/announcementProcessor.js
git commit -m "feat(bot): web-triggered announcements use the shared rich embed"
```

---

## Task 8: The RSVP button

**Files:**
- Create: `bot/src/handlers/attendance/handleRsvpButton.js`
- Create: `bot/src/handlers/attendance/index.js`
- Modify: `bot/src/handlers/index.js`
- Modify: `bot/src/events/interactionCreate.js:54-62`

- [ ] **Step 1: Write the handler**

Create `bot/src/handlers/attendance/handleRsvpButton.js`:

```js
import {
  findOrCreateUser,
  toggleAttendance,
  getAttendees,
  getMovieNightForAnnouncement
} from '../../models/index.js';
import {
  buildAnnouncementEmbed,
  buildAnnouncementComponents,
  toAnnouncementView
} from '../../utils/announcementEmbed.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleRsvpButton');

/**
 * Toggle the clicker's attendance and re-render the announcement in place.
 *
 * interaction.update edits the message the button lives on, atomically, with no
 * channel fetch and no permission check. Two people clicking at once each
 * re-read the attendee list from the database first, so whoever writes last
 * still renders the truth — no lost RSVPs, worst case a redundant render.
 */
export async function handleRsvpButton(interaction) {
  const movieNightId = parseInt(interaction.customId.split('_')[1], 10);

  if (!movieNightId) {
    return interaction.reply({ content: 'Invalid RSVP button.', ephemeral: true });
  }

  try {
    const movie = await getMovieNightForAnnouncement(movieNightId);

    // Cancelled nights delete their row, but the message may still be sitting
    // in the channel with a live-looking button.
    if (!movie || movie.guild_id !== interaction.guildId) {
      return interaction.reply({
        content: 'This movie night no longer exists.',
        ephemeral: true
      });
    }

    if (movie.started_at) {
      return interaction.reply({
        content: 'This movie has already started.',
        ephemeral: true
      });
    }

    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    const nowAttending = await toggleAttendance(movieNightId, user.id);
    const attendees = await getAttendees(movieNightId);

    const view = toAnnouncementView(movie, { attendees });

    await interaction.update({
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });

    logger.info(
      `${interaction.user.username} ${nowAttending ? 'joined' : 'left'} movie night ${movieNightId}`
    );
  } catch (err) {
    logger.error('Error handling RSVP button', err);
    const message = { content: 'There was an error updating your RSVP.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }
}
```

- [ ] **Step 2: Add the barrel exports**

Create `bot/src/handlers/attendance/index.js`:

```js
export { handleRsvpButton } from './handleRsvpButton.js';
```

Replace `bot/src/handlers/index.js` with:

```js
export { handleRatingButton, handleRatingCommentModal } from './rating/index.js';
export { handleRsvpButton } from './attendance/index.js';
```

- [ ] **Step 3: Route the interaction**

In `bot/src/events/interactionCreate.js`, add `handleRsvpButton` to the import
at line 2-5:

```js
import {
  handleRatingButton,
  handleRatingCommentModal,
  handleRsvpButton
} from '../handlers/index.js';
```

Then replace the button block at lines 55-62:

```js
  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('rate_')) {
      await handleRatingButton(interaction);
    } else if (customId.startsWith('rsvp_')) {
      await handleRsvpButton(interaction);
    }
    return;
  }
```

- [ ] **Step 4: Verify syntax**

Run: `cd bot && node --check src/handlers/attendance/handleRsvpButton.js && node --check src/events/interactionCreate.js`
Expected: no output

- [ ] **Step 5: Verify end to end**

Start the bot (`cd bot && npm run dev`), run `/announce` on any film, click
**I'm in**. Your name appears under `🎟 Going (1)`. Click again — it disappears.
No new message is posted either time.

- [ ] **Step 6: Commit**

```bash
git add bot/src/handlers bot/src/events/interactionCreate.js
git commit -m "feat(bot): RSVP button toggles attendance and live-updates the embed"
```

---

## Task 9: Re-render on start and reschedule

**Files:**
- Create: `bot/src/utils/announcementMessage.js`
- Modify: `bot/src/jobs/movieStarter.js`
- Modify: `bot/src/jobs/rescheduleNotifier.js`

- [ ] **Step 1: Write the refresh helper**

Create `bot/src/utils/announcementMessage.js`:

```js
import { getMovieNightForAnnouncement, getAttendees } from '../models/index.js';
import {
  buildAnnouncementEmbed,
  buildAnnouncementComponents,
  toAnnouncementView
} from './announcementEmbed.js';
import { createLogger } from './logger.js';

const logger = createLogger('announcementMessage');

// Discord API error codes for things that are normal, not failures: someone
// deleted the announcement, or the channel is gone.
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

/**
 * Re-render an already-posted announcement from current database state.
 * Safe to call for a movie night that has no message (nothing happens).
 */
export const refreshAnnouncementMessage = async (client, movieNightId) => {
  try {
    const movie = await getMovieNightForAnnouncement(movieNightId);
    if (!movie?.message_id || !movie.channel_id) return;

    const channel = await client.channels.fetch(movie.channel_id).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    const message = await channel.messages.fetch(movie.message_id).catch(() => null);
    if (!message) {
      logger.info(`Announcement message for movie ${movieNightId} is gone — nothing to refresh`);
      return;
    }

    const attendees = await getAttendees(movieNightId);
    const view = toAnnouncementView(movie, { attendees });

    await message.edit({
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });

    logger.info(`Refreshed announcement for movie ${movieNightId}`);
  } catch (err) {
    if (err?.code === UNKNOWN_MESSAGE || err?.code === UNKNOWN_CHANNEL) {
      logger.info(`Announcement for movie ${movieNightId} no longer exists — skipping refresh`);
      return;
    }
    logger.error(`Failed to refresh announcement for movie ${movieNightId}`, err);
  }
};
```

- [ ] **Step 2: Refresh when the movie starts**

In `bot/src/jobs/movieStarter.js`, add the import after line 3:

```js
import { refreshAnnouncementMessage } from '../utils/announcementMessage.js';
```

Then, immediately after the `scheduleVoicePresenceSnapshot(...)` call (line 53),
add:

```js
          // Grey the RSVP button out of the original announcement and mark it
          // STARTED. The separate "Starting NOW" message below is unchanged.
          await refreshAnnouncementMessage(client, movie.id);
```

- [ ] **Step 3: Refresh when the movie is rescheduled**

In `bot/src/jobs/rescheduleNotifier.js`, add the import after line 2:

```js
import { refreshAnnouncementMessage } from '../utils/announcementMessage.js';
```

Then add one line immediately before the final `logger.info(...)` at line 37:

```js
  // Put the new time into the original announcement too, so someone scrolling
  // back doesn't read a stale date.
  await refreshAnnouncementMessage(client, movieId);
```

- [ ] **Step 4: Verify syntax**

Run: `cd bot && node --check src/utils/announcementMessage.js && node --check src/jobs/movieStarter.js && node --check src/jobs/rescheduleNotifier.js`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/announcementMessage.js bot/src/jobs/movieStarter.js bot/src/jobs/rescheduleNotifier.js
git commit -m "feat(bot): re-render the announcement on start and reschedule"
```

---

## Task 10: Grey out cancelled announcements

On cancellation the movie night row is **already deleted** before the bot hears
about it, and the `movie_cancel` NOTIFY payload carries only `channelId` and
`title` — so there is nothing to look up. The payload needs the message id.

This is the only backend change in the whole plan.

**Files:**
- Modify: `backend/src/models/movies.js:175-179`
- Modify: `backend/src/routes/movies.js:207-213`
- Modify: `bot/src/jobs/cancelNotifier.js`

- [ ] **Step 1: Add `messageId` to the notification payload**

In `backend/src/models/movies.js`, replace `notifyCancel` (lines 175-179):

```js
// Signal the bot to post a "cancelled" note and grey out the original
// announcement. The movie row is already gone by the time the bot handles this,
// so the channel, title and message id all travel in the payload.
export const notifyCancel = async (channelId, title, messageId = null) => {
  await pool.query(
    "SELECT pg_notify('movie_cancel', $1)",
    [JSON.stringify({ channelId, title, messageId })]
  );
};
```

- [ ] **Step 2: Pass the message id from the route**

In `backend/src/routes/movies.js`, replace line 209. The `movie` row is fetched
at line 190, before the delete, so `movie.message_id` is still available:

```js
        await db.notifyCancel(movie.channel_id, movie.title, movie.message_id);
```

- [ ] **Step 3: Grey out the original message**

Replace `bot/src/jobs/cancelNotifier.js` entirely:

```js
import { createLogger } from '../utils/logger.js';
import { buildAnnouncementEmbed } from '../utils/announcementEmbed.js';

const logger = createLogger('cancelNotifier');

/**
 * Post a cancellation note when a movie night is cancelled from the web, and
 * grey out the original announcement so its RSVP button can't be clicked.
 * Triggered by the backend's `movie_cancel` NOTIFY. The movie row is already
 * deleted, so the payload carries channel id, title and message id as JSON —
 * there is nothing left to look up in the database.
 */
export const postCancelNote = async (client, payload) => {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    logger.error(`Bad movie_cancel payload: ${payload}`);
    return;
  }

  const { channelId, title, messageId } = data || {};
  if (!channelId || !title) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.error(`Could not find text channel ${channelId} for cancellation`);
    return;
  }

  // Strike through the original announcement and strip its buttons. Built from
  // the payload alone, since the row is gone.
  if (messageId) {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      const embed = buildAnnouncementEmbed({
        title,
        scheduledAt: new Date(),
        cancelled: true,
        announcerName: 'Website'
      });
      await message.edit({ embeds: [embed], components: [] }).catch((err) =>
        logger.error(`Could not grey out cancelled announcement ${messageId}`, err)
      );
    }
  }

  await channel.send(`**${title}** has been cancelled.`);
  logger.info(`Posted cancellation note for "${title}"`);
};
```

- [ ] **Step 4: Verify syntax**

Run: `cd bot && node --check src/jobs/cancelNotifier.js && cd ../backend && node --check src/models/movies.js && node --check src/routes/movies.js`
Expected: no output

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/movies.js backend/src/routes/movies.js bot/src/jobs/cancelNotifier.js
git commit -m "feat: grey out the original announcement when a movie night is cancelled"
```

---

## Task 11: Binge kickoff buttons

The binge embed keeps its distinct lineup shape — it lists a whole evening, so
the single-film layout doesn't fit. It gains the same button row, with one
difference: **RSVP covers every film in the marathon**, because "I'm in" for a
binge means the evening, not one title.

**Files:**
- Modify: `bot/src/models/index.js`
- Modify: `bot/src/utils/embeds.js:23-50`
- Modify: `bot/src/jobs/announcementProcessor.js` (binge branch)
- Modify: `bot/src/handlers/attendance/handleRsvpButton.js`
- Modify: `bot/src/events/interactionCreate.js`

- [ ] **Step 1: Add the marathon-wide toggle**

Add to `bot/src/models/index.js`, below `toggleAttendance`:

```js
// "I'm in" on a binge kickoff means the whole evening, so attendance toggles
// across every film in the marathon at once. The user's state on the first film
// decides the direction, so a half-toggled marathon converges to all-or-nothing.
export const toggleMarathonAttendance = async (marathonId, userId) => {
  const items = await pool.query(
    `SELECT scheduled_movie_night_id AS id
     FROM marathon_items
     WHERE marathon_id = $1 AND scheduled_movie_night_id IS NOT NULL
     ORDER BY position ASC`,
    [marathonId]
  );
  const movieNightIds = items.rows.map((r) => r.id);
  if (movieNightIds.length === 0) return { attending: false, count: 0 };

  const existing = await pool.query(
    'SELECT id FROM movie_attendance WHERE movie_night_id = $1 AND user_id = $2',
    [movieNightIds[0], userId]
  );
  const attending = existing.rows.length === 0;

  if (attending) {
    await pool.query(
      `INSERT INTO movie_attendance (movie_night_id, user_id)
       SELECT unnest($1::int[]), $2
       ON CONFLICT (movie_night_id, user_id) DO NOTHING`,
      [movieNightIds, userId]
    );
  } else {
    await pool.query(
      'DELETE FROM movie_attendance WHERE movie_night_id = ANY($1::int[]) AND user_id = $2',
      [movieNightIds, userId]
    );
  }

  return { attending, count: movieNightIds.length };
};

// Attendees of a binge = attendees of its first film, which the marathon-wide
// toggle keeps in sync with all the others.
export const getMarathonAttendees = async (marathonId) => {
  const result = await pool.query(
    `SELECT DISTINCT u.username, MIN(ma.created_at) AS joined_at
     FROM marathon_items mi
     JOIN movie_attendance ma ON ma.movie_night_id = mi.scheduled_movie_night_id
     JOIN users u ON ma.user_id = u.id
     WHERE mi.marathon_id = $1
     GROUP BY u.username
     ORDER BY joined_at ASC`,
    [marathonId]
  );
  return result.rows;
};

// The guild that owns a marathon, for validating a binge RSVP click. Joins the
// creator so the kickoff embed can be rebuilt with its original footer —
// `marathons` stores created_by (a user id), not a name.
export const getMarathonById = async (marathonId) => {
  const result = await pool.query(
    `SELECT m.*, u.username AS created_by_name
     FROM marathons m
     LEFT JOIN users u ON m.created_by = u.id
     WHERE m.id = $1`,
    [marathonId]
  );
  return result.rows[0];
};
```

- [ ] **Step 2: Give the binge embed a Going field and buttons**

In `bot/src/utils/embeds.js`, change the signature of
`createBingeAnnouncementEmbed` (line 23) to accept attendees, and add a field
before the `if (items[0]?.image_url)` line:

```js
export const createBingeAnnouncementEmbed = (marathonName, items, announcerName, attendees = []) => {
```

Add immediately before `if (items[0]?.image_url) embed.setThumbnail(...)`:

```js
  embed.addFields({
    name: `🎟 Going (${attendees.length})`,
    value: formatAttendees(attendees),
    inline: false
  });
```

Reuse `formatAttendees` rather than inlining a `join` — it already handles the
empty case and the 15-name cap, and a binge is exactly where a long list shows
up. Add this import at the top of `bot/src/utils/embeds.js`:

```js
import { formatAttendees } from './announcementEmbed.js';
```

Then add a components builder at the end of the same file:

```js
// Binge kickoff buttons. RSVP is keyed to the marathon, not a single film —
// "I'm in" for a binge means the whole evening. Link buttons point at the
// first film, which is the one people are deciding about.
export const createBingeComponents = (marathonId, firstItem) => {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`rsvp_binge_${marathonId}`)
      .setLabel("I'm in")
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  ];

  if (firstItem?.trailer_url) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Trailer')
        .setEmoji('▶️')
        .setURL(firstItem.trailer_url)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (firstItem?.tmdb_id) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('TMDB')
        .setURL(`https://www.themoviedb.org/movie/${firstItem.tmdb_id}`)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (process.env.FRONTEND_URL) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Website')
        .setURL(process.env.FRONTEND_URL)
        .setStyle(ButtonStyle.Link)
    );
  }

  return [new ActionRowBuilder().addComponents(...buttons)];
};
```

- [ ] **Step 3: Send the buttons with the binge kickoff**

In `bot/src/jobs/announcementProcessor.js`, inside `processBingeAnnouncement`,
replace the two lines that build and send the embed (currently lines 199-201):

```js
  const embed = createBingeAnnouncementEmbed(announcement.marathon_name, items, announcerName);
  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const reply = await channel.send({
    content,
    embeds: [embed],
    components: createBingeComponents(announcement.marathon_id, items[0])
  });
```

And add `createBingeComponents` to the `embeds.js` import in that file:

```js
import { createBingeAnnouncementEmbed, createBingeComponents } from '../utils/embeds.js';
```

- [ ] **Step 4: Handle the binge RSVP**

In `bot/src/events/interactionCreate.js`, the `rsvp_` branch already catches
`rsvp_binge_...` because of the shared prefix — routing needs no change. The
handler splits on it instead.

At the top of `handleRsvpButton` in
`bot/src/handlers/attendance/handleRsvpButton.js`, insert before the existing
`const movieNightId = ...` line:

```js
  if (interaction.customId.startsWith('rsvp_binge_')) {
    return handleBingeRsvp(interaction);
  }
```

Add this function to the same file, below `handleRsvpButton`:

```js
/**
 * RSVP for a whole binge evening. Rebuilds the kickoff embed rather than the
 * single-film one, because a binge lists the entire lineup.
 */
async function handleBingeRsvp(interaction) {
  const marathonId = parseInt(interaction.customId.replace('rsvp_binge_', ''), 10);

  if (!marathonId) {
    return interaction.reply({ content: 'Invalid RSVP button.', ephemeral: true });
  }

  const marathon = await getMarathonById(marathonId);
  if (!marathon || marathon.guild_id !== interaction.guildId) {
    return interaction.reply({
      content: 'This marathon no longer exists.',
      ephemeral: true
    });
  }

  const user = await findOrCreateUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.avatar
  );

  const { attending, count } = await toggleMarathonAttendance(marathonId, user.id);
  const attendees = await getMarathonAttendees(marathonId);
  const items = await getMarathonItemsByMarathon(marathonId);

  await interaction.update({
    embeds: [
      createBingeAnnouncementEmbed(
        marathon.name,
        items,
        marathon.created_by_name || 'Website',
        attendees
      )
    ],
    components: createBingeComponents(marathonId, items[0])
  });

  logger.info(
    `${interaction.user.username} ${attending ? 'joined' : 'left'} marathon ${marathonId} (${count} films)`
  );
}
```

Extend that file's imports to cover the new calls:

```js
import {
  findOrCreateUser,
  toggleAttendance,
  getAttendees,
  getMovieNightForAnnouncement,
  toggleMarathonAttendance,
  getMarathonAttendees,
  getMarathonById,
  getMarathonItemsByMarathon
} from '../../models/index.js';
import { createBingeAnnouncementEmbed, createBingeComponents } from '../../utils/embeds.js';
```

**`handleBingeRsvp` has no `try/catch` of its own, by design** — it must be
called from *inside* `handleRsvpButton`'s existing `try` block so its errors are
caught and reported by the handler that's already there. Place the delegating
lines as the first statement **after** `try {`, not before it:

```js
export async function handleRsvpButton(interaction) {
  try {
    if (interaction.customId.startsWith('rsvp_binge_')) {
      return await handleBingeRsvp(interaction);
    }

    const movieNightId = parseInt(interaction.customId.split('_')[1], 10);
    if (!movieNightId) {
      return interaction.reply({ content: 'Invalid RSVP button.', ephemeral: true });
    }

    // ...the rest of the existing body, unchanged...
```

Two things to get right here:

- **`return await`, not a bare `return`.** A bare `return` resolves the promise
  outside the `try`, so a rejection escapes the catch and surfaces as an
  unhandled rejection.
- **The `movieNightId` parse moves inside the `try`.** In Task 8 it sat above
  it. It has to move, and the binge branch has to come first, because
  `'rsvp_binge_5'.split('_')[1]` is `'binge'` — `parseInt` gives `NaN`, and a
  binge click would be rejected as "Invalid RSVP button" before ever reaching
  the branch.

- [ ] **Step 5: Verify syntax**

Run: `cd bot && node --check src/utils/embeds.js && node --check src/handlers/attendance/handleRsvpButton.js && node --check src/jobs/announcementProcessor.js && npm test`
Expected: no output from the checks, 40 tests still passing

- [ ] **Step 6: Commit**

```bash
git add bot/src/utils/embeds.js bot/src/models/index.js bot/src/handlers/attendance/handleRsvpButton.js bot/src/jobs/announcementProcessor.js
git commit -m "feat(bot): binge kickoff gains RSVP across the whole evening plus link buttons"
```

---

## Task 12: Remove the dead builder and verify

**Files:**
- Modify: `bot/src/utils/embeds.js:3-18`

- [ ] **Step 1: Confirm nothing still imports the old builder**

Run: `cd bot && grep -rn "createAnnouncementEmbed" src/`
Expected: **no matches.** If anything matches, that call site was missed in
Tasks 6-7 — fix it before deleting.

- [ ] **Step 2: Delete `createAnnouncementEmbed`**

Remove lines 3-18 of `bot/src/utils/embeds.js` (the whole
`export const createAnnouncementEmbed = ...` function). Leave every other
builder in that file untouched.

- [ ] **Step 3: Confirm the bot boots**

Run: `cd bot && npm test && node --check src/index.js`
Expected: 40 tests passing, no syntax errors

Then start it: `cd bot && npm run dev`
Expected: the usual startup log, no import errors.

**Note:** `npm run deploy` is **not** needed. No slash command signature changed.

- [ ] **Step 4: Work the manual checklist**

Use `is_test` movie nights so you don't pollute real stats. Tick each:

- [ ] `/announce` with a TMDB pick → tagline, overview, runtime + end time, TMDB score, genres, backdrop image, poster thumbnail, five buttons
- [ ] `/announce` with a typed title (don't pick from autocomplete) → title, time, Going, Website button only. No empty fields.
- [ ] Click **I'm in** → your name appears, count goes to 1, no new message posted
- [ ] Click again → your name disappears, count returns to 0
- [ ] Two people click within a second → both names present
- [ ] A film with no trailer on TMDB → four buttons, no gap
- [ ] A film with no backdrop → poster fills the big image slot, no thumbnail
- [ ] Announce from the website → identical to `/announce`, minus the tagline (`pending_announcements` has no tagline column — expected)
- [ ] A marathon film → marathon name in the author line, `Film 2 of 6` field
- [ ] A binge kickoff → lineup intact, one RSVP covering all films
- [ ] `/reschedule` → the **original** embed shows the new time
- [ ] Movie starts → original turns green, reads STARTED, RSVP button gone, link buttons remain
- [ ] Cancel from the web → original goes grey with a struck title and no buttons
- [ ] Delete an announcement message, then `/reschedule` that movie → info log, no crash
- [ ] Click **I'm in** on a cancelled night's stale embed → ephemeral "no longer exists", no unhandled rejection

- [ ] **Step 5: Commit**

```bash
git add bot/src/utils/embeds.js
git commit -m "refactor(bot): drop the superseded plain announcement embed"
```

---

## Done

Merge with:

```bash
git checkout master
git merge --no-ff feat/rich-announcement-embed -m "Merge feat/rich-announcement-embed: rich announcements with trailer links and RSVP"
```
