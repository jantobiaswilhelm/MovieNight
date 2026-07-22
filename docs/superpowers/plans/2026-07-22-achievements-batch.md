# Achievements Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 19 new rating-triggered achievements — Explorer (variety), Consensus (Oracle/Prophet), higher milestones (250/500), and 11 hidden cult-movie badges.

**Architecture:** All badges hook into the existing rating flow. A migration seeds the new rows idempotently; `getAchievementProgress` gains a few aggregate metrics; `checkAndUnlockAchievements` gains unlock branches; the rating checker takes the movie's `tmdb_id` to award secret cult badges; and the Achievements page gets a new "Explorer" category + icon-map entries. No new event hooks.

**Tech Stack:** Express + `pg` (raw parameterized SQL, domain-split models with barrel export), React + Vite (plain CSS). No test framework — verify via `node --check`/import checks and a manual pass on the deployed Railway site.

**Reference spec:** `docs/superpowers/specs/2026-07-22-achievements-batch-design.md`

---

## File Structure

**Modify:**
- `backend/src/config/migrate.js` — idempotent seed of 19 new `achievements` rows.
- `backend/src/models/achievements.js` — extend `getAchievementProgress` with genre/language/decade/oldest-year/oracle metrics.
- `backend/src/services/achievementChecker.js` — new unlock branches + `MOVIE_BADGES` map + `tmdbId` param on `checkRatingAchievements`.
- `backend/src/routes/movies.js` — pass `movie.tmdb_id` into `checkRatingAchievements` (~line 277).
- `frontend/src/pages/AchievementsPage.jsx` — add `explorer` category + `ICON_MAP` entries.

**Temporary (deleted after use):**
- `backend/resolve-cult-ids.mjs` — one-off TMDB id resolver (Task 4).

---

## Task 1: Seed the 19 new achievements

**Files:**
- Modify: `backend/src/config/migrate.js` (after the existing seed `if` block that ends at ~line 480)

- [ ] **Step 1: Add an idempotent insert for the new rows**

The existing seed only runs when the table is empty (`migrate.js:454-480`). Add this **immediately after** that `if (...) { ... }` block (after line 480, before the `// Notifications table` comment), inside the same transaction. `ON CONFLICT (code) DO NOTHING` makes it safe on every run and lands the new rows on the already-populated production DB. Note SQL apostrophe escaping (`''`).

```js
    // Newer achievements — added idempotently so they land on existing databases.
    await client.query(`
      INSERT INTO achievements (code, name, description, icon, category, points, is_hidden) VALUES
        ('genre_hopper', 'Genre Hopper', 'Rate movies across 10 different genres', 'list', 'explorer', 40, false),
        ('polyglot', 'Polyglot', 'Rate movies in 5 different languages', 'globe', 'explorer', 40, false),
        ('time_traveler', 'Time Traveler', 'Rate a film released before 1970', 'clock', 'explorer', 25, false),
        ('decade_hopper', 'Decade Hopper', 'Rate movies from 5 different decades', 'calendar', 'explorer', 40, false),
        ('oracle', 'The Oracle', 'Rate a movie within 0.5 of the group average', 'eye', 'special', 20, false),
        ('prophet', 'Prophet', 'Match the group average on 10 different movies', 'eye', 'special', 60, false),
        ('ratings_250', 'Film Fanatic', 'Rate 250 movies', 'trophy', 'ratings', 300, false),
        ('ratings_500', 'Silver Screen Sage', 'Rate 500 movies', 'award', 'ratings', 500, false),
        ('cult_the_room', 'So Bad It''s Good', 'Rate The Room (2003)', 'film', 'special', 30, true),
        ('cult_troll_2', 'Best Worst Movie', 'Rate Troll 2 (1990)', 'film', 'special', 30, true),
        ('cult_plan_9', 'Ed Would Be Proud', 'Rate Plan 9 from Outer Space (1959)', 'film', 'special', 30, true),
        ('cult_birdemic', 'Shock and Terror', 'Rate Birdemic: Shock and Terror (2010)', 'film', 'special', 30, true),
        ('cult_sharknado', 'There''s a Shark in the Sky', 'Rate Sharknado (2013)', 'film', 'special', 30, true),
        ('cult_cats', 'Jellicle Choice', 'Rate Cats (2019)', 'film', 'special', 30, true),
        ('cult_wicker_man', 'Not the Bees!', 'Rate The Wicker Man (2006)', 'film', 'special', 30, true),
        ('cult_battlefield_earth', 'Crushing Defeat', 'Rate Battlefield Earth (2000)', 'film', 'special', 30, true),
        ('cult_lebowski', 'The Dude Abides', 'Rate The Big Lebowski (1998)', 'film', 'special', 30, true),
        ('cult_holy_grail', '''Tis But a Scratch', 'Rate Monty Python and the Holy Grail (1975)', 'film', 'special', 30, true),
        ('cult_airplane', 'Surely You Can''t Be Serious', 'Rate Airplane! (1980)', 'film', 'special', 30, true)
      ON CONFLICT (code) DO NOTHING
    `);
```

- [ ] **Step 2: Verify the file parses**

Run:
```bash
node --check backend/src/config/migrate.js
```
Expected: no output, exit 0 (syntax valid). The insert itself runs automatically on `npm start` / `npm run db:migrate` against the live DB — no local DB needed here.

- [ ] **Step 3: Commit**

```bash
git add backend/src/config/migrate.js
git commit -m "feat(achievements): seed 19 new achievement rows"
```

---

## Task 2: Extend `getAchievementProgress` with new metrics

**Files:**
- Modify: `backend/src/models/achievements.js` (the `getAchievementProgress` function, currently ~lines 48-73)

- [ ] **Step 1: Replace `getAchievementProgress` with the extended version**

This adds three queries to the existing `Promise.all` (genres via `regexp_split_to_table`; language/decade/oldest-year in one scan; oracle count mirroring the hot-take subquery with `<= 0.5`) and returns the new fields. Replace the whole function:

```js
export const getAchievementProgress = async (userId, guildId) => {
  // Get various stats for progress calculation
  const [ratingCount, streak, avgRating, watchtime, hotTakeCount, genres, metadata, oracle] = await Promise.all([
    pool.query('SELECT COUNT(*)::integer as count FROM ratings WHERE user_id = $1', [userId]),
    pool.query('SELECT current_streak, longest_streak FROM users WHERE id = $1', [userId]),
    pool.query('SELECT AVG(score) as avg FROM ratings WHERE user_id = $1', [userId]),
    pool.query(`SELECT COALESCE(SUM(mn.runtime), 0)::integer as minutes
                FROM ratings r JOIN movie_nights mn ON r.movie_night_id = mn.id
                WHERE r.user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::integer as count FROM (
                  SELECT r.id FROM ratings r
                  JOIN (SELECT movie_night_id, AVG(score) as avg FROM ratings GROUP BY movie_night_id HAVING COUNT(*) >= 3) ma
                  ON r.movie_night_id = ma.movie_night_id
                  WHERE r.user_id = $1 AND ABS(r.score - ma.avg) >= 3
                ) hot`, [userId]),
    pool.query(`SELECT COUNT(DISTINCT TRIM(g))::integer as count
                FROM ratings r
                JOIN movie_nights mn ON r.movie_night_id = mn.id
                CROSS JOIN LATERAL regexp_split_to_table(COALESCE(mn.genres, ''), ',') AS g
                WHERE r.user_id = $1 AND TRIM(g) <> ''`, [userId]),
    pool.query(`SELECT
                  COUNT(DISTINCT NULLIF(mn.original_language, ''))::integer as language_count,
                  COUNT(DISTINCT FLOOR(mn.release_year / 10.0))::integer as decade_count,
                  MIN(mn.release_year) as oldest_year
                FROM ratings r JOIN movie_nights mn ON r.movie_night_id = mn.id
                WHERE r.user_id = $1`, [userId]),
    pool.query(`SELECT COUNT(*)::integer as count FROM (
                  SELECT r.id FROM ratings r
                  JOIN (SELECT movie_night_id, AVG(score) as avg FROM ratings GROUP BY movie_night_id HAVING COUNT(*) >= 3) ma
                  ON r.movie_night_id = ma.movie_night_id
                  WHERE r.user_id = $1 AND ABS(r.score - ma.avg) <= 0.5
                ) oracle`, [userId])
  ]);

  const oldestYear = metadata.rows[0].oldest_year;

  return {
    rating_count: ratingCount.rows[0].count,
    current_streak: streak.rows[0]?.current_streak || 0,
    longest_streak: streak.rows[0]?.longest_streak || 0,
    avg_rating: parseFloat(avgRating.rows[0]?.avg || 0),
    watchtime_minutes: watchtime.rows[0].minutes,
    hot_take_count: hotTakeCount.rows[0].count,
    genre_count: genres.rows[0].count,
    language_count: metadata.rows[0].language_count,
    decade_count: metadata.rows[0].decade_count,
    oldest_year: oldestYear,
    has_pre_1970: oldestYear != null && oldestYear < 1970,
    oracle_count: oracle.rows[0].count
  };
};
```

Notes: `FLOOR(release_year / 10.0)` buckets by decade; `COUNT(DISTINCT …)` ignores NULLs so no-metadata movies are naturally excluded. `NULLIF(original_language, '')` treats empty strings as absent.

- [ ] **Step 2: Verify the module imports cleanly**

Run:
```bash
cd backend && node -e "import('./src/models/index.js').then(m => console.log('getAchievementProgress:', typeof m.getAchievementProgress)).catch(e => { console.error(e); process.exit(1); })"
```
Expected: `getAchievementProgress: function` (the `pg` Pool is lazy — no live DB required).

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/achievements.js
git commit -m "feat(achievements): add genre/language/decade/oracle progress metrics"
```

---

## Task 3: Add unlock branches for milestones, explorer, and consensus

**Files:**
- Modify: `backend/src/services/achievementChecker.js` (`checkAndUnlockAchievements`, before its `return unlockedAchievements;`)

- [ ] **Step 1: Add the new branches**

In `checkAndUnlockAchievements`, insert this block right before the final `return unlockedAchievements;`. It reuses the exact `unlockAchievement` + push-if-returned pattern already used in that function:

```js
  // Rating count milestones (higher tiers)
  if (progress.rating_count >= 250) {
    const achievement = await db.unlockAchievement(userId, 'ratings_250');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.rating_count >= 500) {
    const achievement = await db.unlockAchievement(userId, 'ratings_500');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Explorer — variety of movies
  if (progress.genre_count >= 10) {
    const achievement = await db.unlockAchievement(userId, 'genre_hopper');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.language_count >= 5) {
    const achievement = await db.unlockAchievement(userId, 'polyglot');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.decade_count >= 5) {
    const achievement = await db.unlockAchievement(userId, 'decade_hopper');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.has_pre_1970) {
    const achievement = await db.unlockAchievement(userId, 'time_traveler');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Consensus — matching the group average
  if (progress.oracle_count >= 1) {
    const achievement = await db.unlockAchievement(userId, 'oracle');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.oracle_count >= 10) {
    const achievement = await db.unlockAchievement(userId, 'prophet');
    if (achievement) unlockedAchievements.push(achievement);
  }
```

- [ ] **Step 2: Verify the module imports cleanly**

Run:
```bash
cd backend && node -e "import('./src/services/achievementChecker.js').then(m => console.log('ok:', typeof m.checkAndUnlockAchievements)).catch(e => { console.error(e); process.exit(1); })"
```
Expected: `ok: function`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/achievementChecker.js
git commit -m "feat(achievements): unlock branches for milestones, explorer, consensus"
```

---

## Task 4: Secret cult-movie badges

**Files:**
- Create (temporary): `backend/resolve-cult-ids.mjs`
- Modify: `backend/src/services/achievementChecker.js` (`checkRatingAchievements`)
- Modify: `backend/src/routes/movies.js` (~line 277 call site)

- [ ] **Step 1: Write the TMDB id resolver**

Create `backend/resolve-cult-ids.mjs`. It searches TMDB for each film and prints ready-to-paste `MOVIE_BADGES` lines. It reads `TMDB_API_KEY` from the backend `.env` via Node's `--env-file`:

```js
// Temporary one-off. Run:  cd backend && node --env-file=.env resolve-cult-ids.mjs
const KEY = process.env.TMDB_API_KEY;
const FILMS = [
  ['cult_the_room', 'The Room', 2003],
  ['cult_troll_2', 'Troll 2', 1990],
  ['cult_plan_9', 'Plan 9 from Outer Space', 1959],
  ['cult_birdemic', 'Birdemic: Shock and Terror', 2010],
  ['cult_sharknado', 'Sharknado', 2013],
  ['cult_cats', 'Cats', 2019],
  ['cult_wicker_man', 'The Wicker Man', 2006],
  ['cult_battlefield_earth', 'Battlefield Earth', 2000],
  ['cult_lebowski', 'The Big Lebowski', 1998],
  ['cult_holy_grail', 'Monty Python and the Holy Grail', 1975],
  ['cult_airplane', 'Airplane!', 1980],
];
for (const [code, title, year] of FILMS) {
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${KEY}&query=${encodeURIComponent(title)}&year=${year}`;
  const res = await fetch(url);
  const data = await res.json();
  const hit = data.results?.[0];
  console.log(`  ${hit?.id}: '${code}', // ${hit?.title} (${(hit?.release_date || '').slice(0, 4)})`);
}
```

- [ ] **Step 2: Run it and sanity-check the output**

Run:
```bash
cd backend && node --env-file=.env resolve-cult-ids.mjs
```
Expected: 11 lines like `  17473: 'cult_the_room', // The Room (2003)`. **Sanity-check each printed title/year matches the intended film** (known-good anchors: The Big Lebowski = 115, Monty Python and the Holy Grail = 762, Airplane! = 813, The Room = 17473). If any line looks wrong (mismatched title/year), fix that film's search in the script and re-run. Keep the printed lines for Step 3.

- [ ] **Step 3: Add the `MOVIE_BADGES` map and update `checkRatingAchievements`**

In `backend/src/services/achievementChecker.js`, add the map near the top (after the import), pasting the ids from Step 2:

```js
// Secret cult-movie badges, keyed by TMDB id (resolved via resolve-cult-ids.mjs).
const MOVIE_BADGES = {
  // paste the 11 lines printed by resolve-cult-ids.mjs, e.g.:
  // 17473: 'cult_the_room',
};
```

Then change `checkRatingAchievements` to accept `tmdbId` and check the map. Replace its signature and add the branch before `return unlockedAchievements;`:

```js
export const checkRatingAchievements = async (userId, score, tmdbId = null) => {
  const unlockedAchievements = [];

  // Perfect 10
  if (score === 10) {
    const achievement = await db.unlockAchievement(userId, 'perfect_ten');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Tough crowd (1 rating)
  if (score === 1) {
    const achievement = await db.unlockAchievement(userId, 'tough_crowd');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Night owl (after midnight local - we'll approximate with UTC)
  const hour = new Date().getUTCHours();
  if (hour >= 0 && hour < 5) {
    const achievement = await db.unlockAchievement(userId, 'night_owl');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Secret cult-movie badge
  if (tmdbId && MOVIE_BADGES[tmdbId]) {
    const achievement = await db.unlockAchievement(userId, MOVIE_BADGES[tmdbId]);
    if (achievement) unlockedAchievements.push(achievement);
  }

  return unlockedAchievements;
};
```

- [ ] **Step 4: Pass the movie's tmdb_id at the call site**

In `backend/src/routes/movies.js` (~line 277), the rating handler already has the `movie` object loaded. Change:

```js
        checkRatingAchievements(req.user.id, score)
```
to:
```js
        checkRatingAchievements(req.user.id, score, movie.tmdb_id)
```

- [ ] **Step 5: Delete the temporary resolver and verify**

```bash
rm backend/resolve-cult-ids.mjs
cd backend && node -e "import('./src/services/achievementChecker.js').then(m => console.log('ok:', typeof m.checkRatingAchievements)).catch(e => { console.error(e); process.exit(1); })"
```
Expected: `ok: function`. Confirm `MOVIE_BADGES` has 11 numeric-keyed entries and the resolver file is gone.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/achievementChecker.js backend/src/routes/movies.js
git commit -m "feat(achievements): secret cult-movie badges by tmdb_id"
```

---

## Task 5: Frontend — Explorer category + icons

**Files:**
- Modify: `frontend/src/pages/AchievementsPage.jsx` (`ICON_MAP` ~line 8, `CATEGORY_ORDER` ~line 25, `CATEGORY_META` ~line 27)

- [ ] **Step 1: Add the new category to the order and meta**

Change `CATEGORY_ORDER` (currently `['ratings', 'streaks', 'watchtime', 'collections', 'special']`) to include `explorer` before `special`:

```js
const CATEGORY_ORDER = ['ratings', 'streaks', 'watchtime', 'collections', 'explorer', 'special'];
```

Update `CATEGORY_META` — add `explorer` and bump `special` to `07`:

```js
const CATEGORY_META = {
  ratings:     { num: '02', label: 'Ratings' },
  streaks:     { num: '03', label: 'Streaks' },
  watchtime:   { num: '04', label: 'Watchtime' },
  collections: { num: '05', label: 'Collections' },
  explorer:    { num: '06', label: 'Explorer' },
  special:     { num: '07', label: 'Special' },
};
```

- [ ] **Step 2: Add icon-map entries for the new glyphs**

The `Icon` registry has no globe/target/compass, so map the new `icon` strings to existing glyphs. Add these keys to `ICON_MAP` (keep the existing entries):

```js
  list: 'list',
  globe: 'pin',
  calendar: 'calendar',
  eye: 'eye',
```

(`clock`, `trophy`, `award`, `film` are already mapped and used by the new rows.)

- [ ] **Step 3: Verify the build**

Run:
```bash
cd frontend && npx vite build
```
Expected: build succeeds, no errors referencing AchievementsPage.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AchievementsPage.jsx
git commit -m "feat(achievements): Explorer category and icon map entries"
```

---

## Final verification (after all tasks)

- [ ] Deploy to Railway (migrations run automatically on `npm start`). On the Achievements page, confirm the new **Explorer** section renders with the four badges and correct icons, milestones/consensus badges appear under Ratings/Special, and hidden cult badges are not shown until unlocked.
- [ ] Rate a movie and confirm the relevant badges unlock (e.g., rating a 10 still gives Perfect 10; rating a movie in a new genre/language/decade progresses Explorer badges; rating a cult film in the map unlocks its secret badge).
- [ ] Confirm no regression to existing achievements (First Blood, streaks, hot take, etc. still fire).
