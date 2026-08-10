# Rich Announcement Embed — Design

**Date:** 2026-08-10
**Status:** Approved, ready for planning

## Problem

The movie night announcement is the most-seen thing the bot produces, and it shows
almost nothing. Today's embed (`bot/src/utils/embeds.js:3`) renders a title, the
string "Get ready for movie night!", a timestamp, the poster, and "Announced by X".

Meanwhile `/announce` already fetches and stores the overview, tagline, TMDB score,
genres, runtime, backdrop, IMDb id, collection name, original language, and the
**trailer URL** (`bot/src/commands/announce.js:77-90`). All of it lands in
`movie_nights` and none of it is ever displayed. The `movie_attendance` table
exists and only the web writes to it.

So the bulk of this work is display, not data collection.

## Goal

Turn the announcement into something you can decide from without leaving the
channel: what the film is, how long it runs, when it ends, what it scores, where
the trailer is — and who else is coming.

## Scope

**In scope:**

- One shared embed builder used by all announcement surfaces
- Trailer + TMDB + IMDb + Website link buttons
- An "I'm in" RSVP button writing to `movie_attendance`, with a live-updating
  attendee list
- Re-rendering the posted message on RSVP, reschedule, start, and cancel

**Out of scope (explicitly declined):**

- Credits, cast, director, age rating, streaming providers — these need extra
  TMDB calls and new columns
- Rewatch history ("this server watched it in Mar 2024, avg 8.2")
- Reminder / "notify me" buttons
- Any change to the web UI

**No database migration is required.** Every column this design reads already
exists in `movie_nights` (`backend/src/config/migrate.js:100-112`) and in
`pending_announcements` (`:213-234`), and `movie_attendance` is already created
(`:249-255`).

### Known data gap

`pending_announcements` has no `tagline` column, so web-triggered and marathon
announcements render without a tagline while `/announce` renders with one. This
is an accepted cosmetic inconsistency, not a blocker — the tagline block is
conditional and simply doesn't render. Adding the column later is a one-line
`ALTER TABLE` following the existing idempotent pattern.

## The embed

```
@MovieNight — movie night is set 🎬
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ 🎬 MOVIE NIGHT                                 ┃  author line
┃ The Help (2011)             ┌──────────┐       ┃  title → TMDB page
┃ "Change begins with         │  poster  │       ┃  thumbnail
┃  a whisper."                └──────────┘       ┃  tagline, italic
┃                                                ┃
┃ An aspiring author during the civil rights     ┃  overview, ~300 chars
┃ era decides to write a book detailing the      ┃  word-boundary cut
┃ African American maids' point of view…         ┃
┃                                                ┃
┃ 🗓 Sunday, 3 August 2025 19:00 · in 3 days     ┃  <t:X:F> · <t:X:R>
┃                                                ┃
┃ ⏱ Runtime    ⭐ TMDB      🎭 Genres            ┃  three inline fields
┃ 2h 26m       7.8/10       Drama · History      ┃
┃ ends ~21:26                                    ┃
┃                                                ┃
┃ 🎟 Going (4)                                   ┃  non-inline
┃ emy · jani · sam · lea                         ┃
┃ ────────── [ backdrop, wide ] ─────────────    ┃  setImage
┃ Announced by emy                    · today    ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
[ ✅ I'm in ] [ ▶ Trailer ] [ TMDB ] [ IMDb ] [ Website ]
```

Five buttons is exactly Discord's per-row limit — one row, no spillover.

### Layout decisions

- **Poster moves to `setThumbnail`.** It currently occupies `setImage`, which
  leaves no room for text. The **backdrop** — fetched and stored today, never
  once displayed — takes the big slot.
- **`ends ~21:26`** is computed as `scheduled_at + runtime`. This is the single
  most decision-useful field to add and costs nothing.
- **Timestamps stay native** (`<t:X:F>`, `<t:X:R>`) so every viewer sees their
  own timezone.
- **Colors by state:** announced `0x5865F2` (blurple, current), started
  `0x57F287` (green, matches `createStartingNowEmbed`), cancelled `0x99AAB5`
  (grey).
- **Author line** carries `MOVIE NIGHT`, or the marathon name when the
  announcement belongs to a marathon (preserving today's behavior at
  `announcementProcessor.js:142`).

### Degradation

Every block is conditional. Nothing renders as an empty field.

| Situation | Behavior |
|---|---|
| Manual title, no TMDB pick | Title, When, Going, Website button only |
| No trailer URL | ▶ Trailer button omitted |
| No `imdb_id` | IMDb button omitted |
| No `tmdb_id` | Title is plain text, TMDB button omitted |
| No backdrop | Poster promoted back to `setImage` |
| No runtime | Runtime field and the `ends ~` line both omitted |
| No attendees yet | `🎟 Going` reads *"Nobody yet — be the first"* |
| 22 attendees | First 15 names, then `+7 more` |
| No `FRONTEND_URL` | Website button omitted (current behavior) |

### Discord limits to respect

- Field value ≤ 1024 chars → drives attendee truncation
- Description ≤ 4096 chars → overview capped at 300, never close
- 5 buttons per action row → exactly filled
- Embed total ≤ 6000 chars

## Architecture

### New module: `bot/src/utils/announcementEmbed.js`

`embeds.js` is already a 250-line grab-bag of eight unrelated builders. The
announcement builder is the one about to grow, so it moves out on its own rather
than making that file worse. Everything else in `embeds.js` stays untouched.

The module has one well-defined input — an **announcement view**, a plain object
that both call sites map their database row into:

```js
{
  id, title, releaseYear, scheduledAt, startedAt,
  imageUrl, backdropUrl,
  description, tagline, tmdbId, tmdbRating, genres, runtime, imdbId, trailerUrl,
  announcerName,
  marathonName, marathonPosition, marathonTotal,   // optional
  attendees                                        // [{ username }]
}
```

Exports:

- `buildAnnouncementEmbed(view)` → `EmbedBuilder`
- `buildAnnouncementComponents(view)` → `ActionRowBuilder[]`
- `toAnnouncementView(row, extras)` → view (row-to-view adapter)

Both builders are **pure functions of the view** — no database, no Discord
client, no environment reads beyond `FRONTEND_URL`. That is what makes them
testable and what lets four different call sites produce an identical embed.

There is no `status` column on `movie_nights`. State is derived: `startedAt`
non-null means the night has started. This is why the view carries `startedAt`
rather than a status string.

### The id-ordering problem

Buttons need `movie_night.id` in their `customId`, but both call sites currently
**send the message first and create the row second** (`announce.js:106-128`,
`announcementProcessor.js:152-178`). The order has to flip.

New sequence, both sites:

1. `createMovieNight(..., messageId: null)` → returns the row with its id
2. Build embed + components from that row
3. Send / `editReply`
4. `updateMovieNightMessage(id, messageId, channelId)`

`/announce` additionally needs `deferReply()` first, since step 1 now happens
before the reply.

**Failure handling:** if step 3 throws, the row from step 1 is an orphan with no
message. Delete it and mark the announcement `failed`. This preserves the
queue's exactly-once guarantee — the current code has the mirror-image risk
(message sent, insert fails, orphan message in channel) and handles it less well.

### New model functions — `bot/src/models/index.js`

Per the `// SHARED` / `// PARALLEL` convention in CLAUDE.md:

- `updateMovieNightMessage(movieNightId, messageId, channelId)` — bot-only
- `getMovieNightForAnnouncement(movieNightId)` — bot-only; one row with every
  field the view needs, plus `announced_by_name`, plus marathon context
- `toggleAttendance(movieNightId, userId)` — `// PARALLEL to
  backend/src/models/attendance.js` — intentionally differs: the bot resolves
  the user via `findOrCreateUser(discord_id)` first, the web already holds an
  internal `user_id`
- `getAttendees(movieNightId)` — `// PARALLEL` — bot returns usernames ordered
  by `created_at` for display; the web returns full user objects

### RSVP interaction

New handler `bot/src/handlers/attendance/handleRsvpButton.js`, exported through
`handlers/index.js`, routed in `interactionCreate.js` on the `rsvp_` prefix
alongside the existing `rate_` branch.

Flow:

1. Parse `movieNightId` from `rsvp_<id>`
2. `findOrCreateUser(interaction.user.id, username, avatar)`
3. `toggleAttendance(movieNightId, user.id)`
4. Re-read the night + attendees, rebuild the view
5. `interaction.update({ embeds, components })`

`interaction.update` is the right primitive here: it edits the message the button
lives on, atomically, with no channel fetch and no permission check. Two people
clicking at once each re-read from the database, so the last write reflects
database truth either way — no lost updates, worst case a redundant identical
render.

### Message lifecycle

New helper `bot/src/utils/announcementMessage.js`:

```js
refreshAnnouncementMessage(client, movieNightId)
```

Reads `channel_id` + `message_id` from the row, fetches the message, re-renders.
Discord errors `10008` (Unknown Message) and `10003` (Unknown Channel) are logged
at info level and swallowed — a deleted announcement is normal, not an error.

Wired into:

| Event | Result |
|---|---|
| RSVP click | Going list updates (via `interaction.update`, not this helper) |
| `movieStarter` | Green, `🔴 STARTED`, RSVP button removed, link buttons kept, Going list frozen. The separate "Starting NOW" message is unchanged. |
| `rescheduleNotifier` | New time re-rendered in place. The separate notification message is unchanged. |
| `cancelNotifier` | Grey, title struck through, all buttons removed — see caveat below |

None of these jobs currently touch the original message — they only post new ones.
This adds one call each.

#### Cancellation — decided: extend the payload

**Decision:** take the payload variant below. A cancelled film that still shows a
working "I'm in" button is the exact failure this whole design exists to avoid,
and the cost is one line in the backend's delete path.

`refreshAnnouncementMessage` reads `channel_id` + `message_id` from the row, but
on cancellation **the row is already deleted** before the bot is notified. The
`movie_cancel` NOTIFY payload carries only `channelId` and `title`
(`cancelNotifier.js:19`), so there is nothing to fetch and nothing to edit.

Fix: add `messageId` to the `movie_cancel` payload in the backend's delete path,
and give `cancelNotifier` a direct render (grey, struck title, no buttons, no
database read) instead of routing through `refreshAnnouncementMessage`. This is
the only backend file this design touches.

**Rejected alternative:** drop cancellation from the lifecycle. The
announcement then stays live-looking after a cancellation, with the separate
"has been cancelled" note below it as the only signal — which is today's
behavior, so nothing regresses. The RSVP button on that stale embed would 404
against a deleted row, so the handler must reply ephemerally with "this movie
night no longer exists" when the row is missing. **That guard is required in
either variant.**

### Binge kickoff

`createBingeAnnouncementEmbed` keeps its distinct lineup shape and gains the same
button row. Its RSVP is bound to the marathon rather than a single film:
**one click marks attendance for every film in the evening**, which is what "I'm
in" means for a binge. Link buttons point at the first film.

### Deployment note

No slash command signatures change, so `cd bot && npm run deploy` is **not**
required for this work.

## Testing

The repo has no test framework. Verification is therefore twofold.

**Optional but recommended:** `buildAnnouncementEmbed` and
`buildAnnouncementComponents` are pure functions with no dependencies, which
makes them testable via Node's built-in runner (`node --test`) with **zero new
packages**. A single `announcementEmbed.test.js` covering the degradation table
above is high value for low cost. Flagged as a decision for the implementation
plan, not assumed.

**Manual checklist**, run against `is_test` movie nights:

1. `/announce` with a TMDB pick → full embed, all five buttons
2. `/announce` with a typed title → degraded embed, Website button only
3. Click "I'm in" → name appears, count increments, no flicker
4. Click again → name disappears
5. Two users click within a second → both names present
6. A film with no trailer → four buttons, no gap
7. A film with no backdrop → poster fills the big slot
8. Web-triggered announcement → identical to `/announce` apart from tagline
9. Marathon film → author ribbon + `Film 2 of 6` preserved
10. Binge kickoff → lineup intact, RSVP covers all films
11. `/reschedule` → original embed shows the new time
12. Movie starts → green, STARTED, RSVP gone
13. Delete the message, then trigger a refresh → logged at info, no crash
14. Cancel a night from the web, then click "I'm in" on the stale embed →
    ephemeral "this movie night no longer exists", no unhandled rejection

## Risk

| Risk | Mitigation |
|---|---|
| Reordering create/send breaks the announcement queue | Delete-orphan-on-send-failure; the claim logic in `claimPendingAnnouncement` is untouched |
| Embed exceeds a Discord limit on an outlier film | Overview capped at 300, attendees capped at 15 + overflow |
| Four call sites drift apart again | Single pure builder, single view shape; call sites only map rows |
| `refreshAnnouncementMessage` throws on deleted messages | 10008/10003 swallowed at info level |
