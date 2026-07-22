# Achievements Batch — Design Spec

**Created:** 2026-07-22
**Status:** Approved design, pending implementation plan
**Scope:** Feature B of the "make MovieNight more fun" effort (Feature A shipped; Feature C = MovieNight Wrapped, still queued).

---

## Goal

Add a batch of new achievements that reward what players already do — rating movies — using
metadata the app already stores. Four groups, **all rating-triggered** so they plug into the
existing `checkAndUnlockAchievements` / `checkRatingAchievements` flow with no new event hooks:

1. **Explorer** (new category) — variety-of-movies badges.
2. **Consensus** — the flip side of the existing "Hot Take".
3. **Higher milestones** — the rating-count ladder currently caps at 100; add 250 and 500.
4. **Secret cult badges** — hidden badges unlocked by rating specific "so bad it's good" / cult films.

Non-goals: no participation badges (follows/attendance) and no board "Trendsetter" — those need
new trigger hooks in other routes and are out of scope for this batch.

---

## Achievement catalog

All new rows go in the `achievements` table (`code, name, description, icon, category, points, is_hidden`).
`icon` is a string mapped to a Lucide glyph by `ICON_MAP` on the Achievements page.

### Group 1 — Explorer (category `explorer`, visible)
| code | name | description | icon | points |
|---|---|---|---|---|
| `genre_hopper` | Genre Hopper | Rate movies across 10 different genres | `list` | 40 |
| `polyglot` | Polyglot | Rate movies in 5 different languages | `globe` | 40 |
| `time_traveler` | Time Traveler | Rate a film released before 1970 | `clock` | 25 |
| `decade_hopper` | Decade Hopper | Rate movies from 5 different decades | `calendar` | 40 |

### Group 2 — Consensus (category `special`, visible)
| code | name | description | icon | points |
|---|---|---|---|---|
| `oracle` | The Oracle | Rate a movie within 0.5 of the group average | `eye` | 20 |
| `prophet` | Prophet | Match the group average on 10 different movies | `eye` | 60 |

"Group average" = the average of all ratings for that movie, counting only movies with **3+ ratings**
(same threshold the existing `hot_take` uses). "Within 0.5" = `ABS(user_score - group_avg) <= 0.5`.

### Group 3 — Milestones (category `ratings`, visible)
| code | name | description | icon | points |
|---|---|---|---|---|
| `ratings_250` | Film Fanatic | Rate 250 movies | `trophy` | 300 |
| `ratings_500` | Silver Screen Sage | Rate 500 movies | `award` | 500 |

### Group 4 — Secret cult badges (category `special`, `is_hidden = true`)
Unlocked when the rated movie's `tmdb_id` matches. Hidden until unlocked (like the existing
`night_owl` / `early_adopter`). Points 30 each.

| code | name | movie (year) | tmdb_id |
|---|---|---|---|
| `cult_the_room` | So Bad It's Good | The Room (2003) | **verify** (likely 17473) |
| `cult_troll_2` | Best Worst Movie | Troll 2 (1990) | **verify** |
| `cult_plan_9` | Ed Would Be Proud | Plan 9 from Outer Space (1959) | **verify** |
| `cult_birdemic` | Shock and Terror | Birdemic: Shock and Terror (2010) | **verify** |
| `cult_sharknado` | There's a Shark in the Sky | Sharknado (2013) | **verify** |
| `cult_cats` | Jellicle Choice | Cats (2019) | **verify** |
| `cult_wicker_man` | Not the Bees! | The Wicker Man (2006) | **verify** |
| `cult_battlefield_earth` | Crushing Defeat | Battlefield Earth (2000) | **verify** |
| `cult_lebowski` | The Dude Abides | The Big Lebowski (1998) | **verify** (likely 115) |
| `cult_holy_grail` | 'Tis But a Scratch | Monty Python and the Holy Grail (1975) | **verify** (likely 762) |
| `cult_airplane` | Surely You Can't Be Serious | Airplane! (1980) | **verify** (likely 813) |

**tmdb_id resolution:** exact ids MUST be confirmed at build time (the backend has `TMDB_API_KEY`;
query `GET /search/movie?query=…&year=…`, or check themoviedb.org). Match on `tmdb_id` — never on
title (titles vary / collide). Store the resolved ids in the `MOVIE_BADGES` map (see below).

---

## Backend changes

### 1. Migration — seed the new rows idempotently
`backend/src/config/migrate.js`. The existing achievement seed only inserts when the table is empty,
so new badges must be added with an **always-run upsert** so they land on the live database:

```sql
INSERT INTO achievements (code, name, description, icon, category, points, is_hidden)
VALUES
  ('genre_hopper', 'Genre Hopper', 'Rate movies across 10 different genres', 'list', 'explorer', 40, false),
  ... all 19 new rows ...
ON CONFLICT (code) DO NOTHING;
```

Place it right after the existing seed block, inside the same transaction. `ON CONFLICT (code) DO NOTHING`
makes it safe to run every migration.

### 2. Extend the progress query
`backend/src/models/achievements.js` — `getAchievementProgress(userId, guildId)` currently returns
`rating_count, current_streak, longest_streak, avg_rating, watchtime_minutes, hot_take_count`.
Add these fields via extra queries in its `Promise.all` (over the user's rated movies joined to `movie_nights`):

- `genre_count` — distinct genres. Genres are a comma-separated string, so split them:
  ```sql
  SELECT COUNT(DISTINCT TRIM(g)) AS genre_count
  FROM ratings r
  JOIN movie_nights mn ON r.movie_night_id = mn.id
  CROSS JOIN LATERAL regexp_split_to_table(COALESCE(mn.genres, ''), ',') AS g
  WHERE r.user_id = $1 AND TRIM(g) <> ''
  ```
- `language_count` — `COUNT(DISTINCT mn.original_language)` where not null/empty.
- `decade_count` — `COUNT(DISTINCT FLOOR(mn.release_year / 10))` where release_year not null.
- `oldest_year` — `MIN(mn.release_year)` where not null (→ `has_pre_1970 = oldest_year != null && oldest_year < 1970`).
- `oracle_count` — mirror the existing `hot_take_count` subquery but with `ABS(r.score - ma.avg) <= 0.5`:
  ```sql
  SELECT COUNT(*)::integer AS count FROM (
    SELECT r.id FROM ratings r
    JOIN (SELECT movie_night_id, AVG(score) AS avg FROM ratings GROUP BY movie_night_id HAVING COUNT(*) >= 3) ma
      ON r.movie_night_id = ma.movie_night_id
    WHERE r.user_id = $1 AND ABS(r.score - ma.avg) <= 0.5
  ) oracle
  ```

Note: this follows the file's existing "one query per metric in a `Promise.all`" pattern. (The known
perf item P-5 already flags consolidating these — out of scope here; stay consistent with the pattern.)

### 3. Checker branches
`backend/src/services/achievementChecker.js`:

In `checkAndUnlockAchievements`, add branches after the existing ones:
- `rating_count >= 250` → `ratings_250`; `>= 500` → `ratings_500`
- `genre_count >= 10` → `genre_hopper`
- `language_count >= 5` → `polyglot`
- `decade_count >= 5` → `decade_hopper`
- `has_pre_1970` → `time_traveler`
- `oracle_count >= 1` → `oracle`; `>= 10` → `prophet`

Each uses the same `db.unlockAchievement(userId, code)` + push-if-returned pattern as existing branches.

### 4. Secret cult badges — pass the movie into the rating checker
`checkRatingAchievements` currently takes `(userId, score)`. Change to `(userId, score, tmdbId)` and add:

```js
const MOVIE_BADGES = {
  17473: 'cult_the_room',   // resolved tmdb_id → achievement code
  // …all 11, with verified ids…
};
// inside checkRatingAchievements:
if (tmdbId && MOVIE_BADGES[tmdbId]) {
  const achievement = await db.unlockAchievement(userId, MOVIE_BADGES[tmdbId]);
  if (achievement) unlockedAchievements.push(achievement);
}
```

Update the single call site — `backend/src/routes/movies.js` (~line 277) — to pass the movie's tmdb_id:
`checkRatingAchievements(req.user.id, score, movie.tmdb_id)`. The `movie` object is already loaded in that handler.

---

## Frontend changes

`frontend/src/pages/AchievementsPage.jsx`:

1. **New category.** Add `explorer` to `CATEGORY_ORDER` (between `collections` and `special`) and to
   `CATEGORY_META`: `explorer: { num: '06', label: 'Explorer' }`, and bump `special` to `num: '07'`.
2. **Icon map.** The `Icon` registry has no globe/target/compass, so add `ICON_MAP` entries mapping the
   new `icon` strings to existing glyphs:
   - `list: 'list'` (Genre Hopper)
   - `globe: 'pin'` (Polyglot — MapPin is the closest geographic glyph)
   - `calendar: 'calendar'` (Decade Hopper)
   - `eye: 'eye'` (Oracle / Prophet)
   - `clock`, `trophy`, `award`, `film` already resolve.

No other UI work — hidden cult badges already render correctly (the page filters `!is_hidden || unlocked_at`,
matching the existing hidden badges), and unlock notifications/activity logging already fire for any
newly-returned achievement.

---

## Error handling
Achievement checks are already wrapped in try/catch at the call site in `movies.js` (a failure logs and
does not block the rating). New queries follow that same safety. Missing metadata (null genres/language/
release_year) is filtered out in SQL, so movies without TMDB data simply don't count toward those badges.

## Testing
- **Backend logic:** the metadata/oracle SQL can't be unit-tested without a DB (local Postgres usually off).
  Verify by `node`-importing the models/checker (syntax/exports) and by a manual check on the deployed site:
  rate movies and confirm the expected badges unlock on the Achievements page.
- **tmdb_id resolution:** before shipping, confirm each of the 11 ids resolves to the right film via TMDB.
- **Frontend:** render the Achievements page and confirm the new **Explorer** section appears with correct
  icons, and that secret badges stay hidden until unlocked.

## Files touched
- `backend/src/config/migrate.js` — seed 17 new achievement rows (ON CONFLICT DO NOTHING).
- `backend/src/models/achievements.js` — extend `getAchievementProgress` with genre/language/decade/oldest/oracle.
- `backend/src/services/achievementChecker.js` — new unlock branches + `MOVIE_BADGES` map + tmdbId param.
- `backend/src/routes/movies.js` — pass `movie.tmdb_id` to `checkRatingAchievements`.
- `frontend/src/pages/AchievementsPage.jsx` — new `explorer` category + `ICON_MAP` entries.
