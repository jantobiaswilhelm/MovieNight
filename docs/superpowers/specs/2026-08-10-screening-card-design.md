# The Screening Card — Design

**Date:** 2026-08-10
**Status:** Approved, ready for planning
**Follows:** `2026-08-10-announcement-embed-design.md`

## Problem

A movie night currently produces three messages after the announcement:

1. `movieStarter` posts "Movie Night is Starting NOW!" at `scheduled_at`
2. `ratingNotifier` posts a separate "Time to Rate!" card with buttons at
   `started_at + runtime - 10min`
3. `/start` (admin) posts its own starting embed — *with* rating buttons
   attached immediately, inconsistent with the other two

The rating card is thin: a title, a sentence, a thumbnail, ten buttons. Ratings
themselves vanish into ephemeral replies — you rate, nobody sees it, nothing on
screen moves. The channel accumulates dead messages that say nothing about how
the night actually went.

## Goal

One message per screening that tells the whole story: it announces the start,
becomes the rating card when the credits roll, fills in live as people vote, and
settles into a permanent verdict.

Editing rather than posting is safe here specifically because the audience is
already present — they are in voice watching the film. That is *not* true at
start time, which is why state 1 is still a real posted message with a role ping.

## The three states

One message, edited in place. Colors progress green → yellow → gold.

### State 1 — NOW PLAYING (posted fresh, pings the role)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🔴 NOW PLAYING           ┌──────────┐  ┃   #57F287 green
┃ The Help (2011)          │  poster  │  ┃
┃                          └──────────┘  ┃
┃ 2h 26m · ends ~21:26                   ┃
┃ 🎟 emy · jani · sam · lea              ┃
┃                                        ┃
┃ Rating opens when the credits roll     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

No buttons. Rating isn't open yet.

### State 2 — RATE IT (same message, edited on every vote)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ ⭐ RATE IT               ┌──────────┐  ┃   #FEE75C yellow
┃ The Help (2011)          │  poster  │  ┃
┃                          └──────────┘  ┃
┃ ████████░░  8.2 · 4 of 6 rated         ┃
┃                                        ┃
┃ emy 9 · jani 7.5 · sam 8 · lea 8.5     ┃
┃ "better than i expected" — emy         ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
[1][2][3][4][5]  [6][7][8][9][10]
```

### State 3 — THE VERDICT (settles 24h after rating opened)

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🏆 THE VERDICT           ┌──────────┐  ┃   #E0A23A gold
┃ The Help (2011)          │  poster  │  ┃
┃                          └──────────┘  ┃
┃ ████████░░  8.2/10 · 6 of us           ┃
┃                                        ┃
┃ ▲ jani 9.5          ▼ sam 6            ┃
┃ TMDB says 7.8 — we liked it more       ┃
┃                                        ┃
┃ "better than i expected" — emy         ┃
┃ ─────────── [backdrop] ───────────     ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

Buttons stay live in state 3 so latecomers can still rate — the card just stops
looking urgent.

## Design decisions

**The meter** (`████████░░`, 10 blocks, filled = `Math.round(avg)`) gives the
score a shape you read before the number, and it is the one element present in
states 2 and 3 — the card visibly fills up over the night.

**"4 of 6 rated"** — the denominator is the RSVP attendee count from
`movie_attendance`. This is the first time attendance and ratings touch. With
zero attendees it degrades to plain `4 rated`.

**"TMDB says 7.8 — we liked it more"** costs nothing; `tmdb_rating` is already
on the row. Renders as *more* / *less* / *dead on* (within 0.2).

**Individual scores are shown** (`emy 9 · jani 7.5`). Explicitly chosen: it is
the socially interesting part. Scores render without a trailing `.0`.

**The average shows live**, not blind-until-settled. Explicitly chosen, with
the anchoring trade-off understood.

## Timing change

Rating currently opens at `started_at + runtime - 10min` ("The movie is almost
over!"). It moves to `started_at + runtime` — when the film actually ends.
`getMoviesReadyForRatingNotification` drops its `- 10`, and the state-1 copy
promises "when the credits roll" rather than a timestamp.

## Architecture

### New module: `bot/src/utils/screeningCard.js`

Pure, mirroring `announcementEmbed.js` — no database, no client. Exports:

- `buildScreeningCard(view)` → `EmbedBuilder`
- `buildScreeningComponents(view)` → rating button rows, or `[]` in state 1
- `toScreeningView(row, extras)` → view
- `screeningState(row)` → `'playing' | 'rating' | 'settled'`
- `ratingMeter(avg)` → the 10-block bar

State is **derived, not stored**:

| State | Condition |
|---|---|
| `playing` | `rating_prompt_sent_at IS NULL` |
| `rating` | set, less than 24h ago |
| `settled` | set, 24h or more ago |

### Schema

One column, following the existing idempotent `ALTER TABLE` pattern:

```
movie_nights.starting_message_id VARCHAR(20)
```

`message_id` already holds the *announcement* message. This holds the
*screening* message, so both can be edited independently.

### Refresh triggers

A shared `refreshScreeningCard(client, movieNightId)` in
`bot/src/utils/screeningMessage.js`, mirroring `announcementMessage.js`
including its 10008/10003 swallowing. Called from:

| Trigger | Transition |
|---|---|
| `movieStarter` / `/start` | posts state 1, stores `starting_message_id` |
| `ratingNotifier` | state 1 → 2, edits in place |
| Rating button → comment modal | re-render tally |
| `/rate` command | re-render tally |
| Web rating (new `movie_rating` NOTIFY) | re-render tally |
| Settle sweep (on `ratingNotifier`'s cron) | state 2 → 3 |

The web path needs a new `movie_rating` NOTIFY carrying the movie id, wired into
the existing `startNotifyListener` map in `events/ready.js` alongside
`movie_reschedule` and `movie_cancel`. Without it, ratings submitted on the
website leave the Discord card stale.

### Replaced

`createStartingNowEmbed` and `createRatingAvailableEmbed` are superseded and
removed. `createRatingButtons` is kept and reused as-is. `createRatingPromptEmbed`
is already dead code with no callers anywhere — removed in passing.

`/start` stops attaching rating buttons at start time, matching `movieStarter`.

## Degradation

| Situation | Behavior |
|---|---|
| No ratings yet in state 2 | Empty meter, "Nobody's rated yet" |
| No attendees RSVP'd | `4 rated` instead of `4 of 6 rated` |
| No `tmdb_rating` | Comparison line omitted |
| Fewer than 3 ratings | High/low line omitted |
| All ratings equal | High/low line omitted |
| No comments | Quote line omitted |
| No runtime | Existing `COALESCE(runtime, 90)` applies |
| No backdrop | State 3 renders without the wide image |
| Over 15 raters | First 15, then `+N more` |

## Testing

`node --test` is now established. `screeningCard.js` is pure, so every row of
the degradation table above is a unit test, plus `ratingMeter` and the
state-derivation function. Target ~30 tests.

The database and Discord paths get a manual checklist, as before.

## Risk

| Risk | Mitigation |
|---|---|
| Edit is silent; card buried if the channel was chatty | Accepted — the audience is in voice. Revisit if it bites. |
| Rating storm causes many rapid edits | Discord rate-limits edits per message; discord.js queues. Low volume in practice (~6 raters). |
| Web ratings leave the card stale | New `movie_rating` NOTIFY |
| `/start` and `movieStarter` diverge again | Both call one shared post-the-card helper |
