# Movie Marathons — Back-to-back Binge (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the **back-to-back binge** cadence — a whole marathon watched in one sitting, films staggered by runtime + a break, posted to Discord as a **single kickoff embed** listing the full evening, with **N real `movie_night` rows** created behind it so ratings/attendance/stats work unchanged.

**Architecture:** Binge reuses everything Plan 1 built, forking at two points. The **wizard** gains a Back-to-back cadence mode: instead of one-date-per-interval, it staggers each film's `scheduled_at` by the previous film's runtime + a break, and launches with `cadence_type='binge'`. The **bot** forks: `marathonProcessor` detects a binge marathon and, when its doors time nears, queues **one** kickoff `pending_announcement` (flagged `marathon_binge`) and marks all its items scheduled at once; `announcementProcessor` detects that flag and posts the binge kickoff embed (built from all the marathon's items), then creates one `movie_night` per film (the first carries the kickoff message, the rest are silent) and back-links each item. No collision logic, per spec.

**Tech Stack:** Express + `pg` (raw parameterized SQL), Discord.js v14 `EmbedBuilder` + node-cron, React 18 + Vite (the routed wizard from Plans 1–2), shared PostgreSQL.

> **Design source of truth — MOCKUPS.** Per the user: **the mockups ARE the design source of truth; always check them.** For this plan: `docs/superpowers/mockups/movie-marathons/05-discord-announcements.html` (the binge kickoff embed — ribbon + "N films · one sitting" + doors description + a time-stamped lineup) and `03-wizard-schedule.html` (the "Back-to-back" cadence mode card). Every UI/embed task ends by matching the relevant mockup. Mockup wins over this plan — flag conflicts before building.

> **Testing note (repo reality):** No test framework/linter/CI (see `CLAUDE.md`). Verify via `node --check` / module-load, `npm run build`, and **Railway** for the live DB + bot (local Postgres/bot usually aren't running). The migration is additive/idempotent and runs on `npm start` at deploy.

> **Buttons note:** Mockups 05 show "Count me in" / "I'm in" buttons, but the **current** weekly announcement embed (Plan 1, `createAnnouncementEmbed`) posts **no interactive buttons** — attendance is handled elsewhere. To stay consistent, the binge embed also ships **without** custom buttons in this plan; adding attend-buttons to both cadences is out of scope here.

---

## Scope

**In this plan (Plan 3):** binge cadence in the wizard (runtime-staggered dates, break control), the `marathon_binge` announcement flag, the single kickoff embed, and the bot fork that creates N `movie_night` rows from one kickoff. Browse/detail already render "Back-to-back" for `cadence_type==='binge'` (built in Plan 1) — no change there.

**Deferred (Plan 4):** home-page "On the calendar" agenda + inline scheduler. No home-page changes here.

---

## File Structure

**Backend**
- Modify `backend/src/config/migrate.js` — add nullable `marathon_binge BOOLEAN` to `pending_announcements` (column-existence check, before the final COMMIT).

**Bot**
- Modify `bot/src/models/index.js` — add `getMarathonItemsByMarathon`, `markAllMarathonItemsScheduled`, `createBingeKickoffPendingAnnouncement`.
- Modify `bot/src/utils/embeds.js` — add `createBingeAnnouncementEmbed`.
- Modify `bot/src/jobs/marathonProcessor.js` — fork binge marathons to the kickoff path.
- Modify `bot/src/jobs/announcementProcessor.js` — detect `marathon_binge` → `processBingeAnnouncement` (post embed + create N movie_nights + back-link + complete).

**Frontend**
- Modify `frontend/src/pages/MarathonWizardPage.jsx` — enable Back-to-back mode; runtime-staggered autofill; break control; launch with the chosen cadence.

---

## Task 1: Migration — `marathon_binge` column

**Files:**
- Modify: `backend/src/config/migrate.js` (in the marathon `pending_announcements` column loop added in Plan 1)

- [ ] **Step 1: Add the column to the marathon PA column list**

In `backend/src/config/migrate.js`, find the `marathonPaCols` array (added in Plan 1) and add one entry:

```js
    const marathonPaCols = [
      { name: 'marathon_id', type: 'INTEGER' },
      { name: 'marathon_item_id', type: 'INTEGER' },
      { name: 'marathon_name', type: 'VARCHAR(255)' },
      { name: 'marathon_position', type: 'INTEGER' },
      { name: 'marathon_total', type: 'INTEGER' },
      { name: 'marathon_binge', type: 'BOOLEAN' }
    ];
```

The existing loop already does a column-existence check + `ALTER TABLE ... ADD COLUMN` per entry, so this is picked up automatically and is idempotent.

- [ ] **Step 2: Verify + commit**

Run: `cd backend && node --check src/config/migrate.js` → no output (pass). (Applies on the next Railway deploy; local Postgres isn't running.)

```bash
git add backend/src/config/migrate.js
git commit -m "db(marathons): add marathon_binge column to pending_announcements"
```

---

## Task 2: Bot model helpers for binge

**Files:**
- Modify: `bot/src/models/index.js` (append near the other marathon helpers from Plan 1)

- [ ] **Step 1: Add the helpers**

Append to `bot/src/models/index.js`:

```js
// All items of a marathon in play order (for building the binge embed + rows).
export const getMarathonItemsByMarathon = async (marathonId) => {
  const result = await pool.query(
    `SELECT * FROM marathon_items WHERE marathon_id = $1 ORDER BY position ASC`,
    [marathonId]
  );
  return result.rows;
};

// Mark every still-pending item scheduled in one shot (binge queues the whole night at once).
export const markAllMarathonItemsScheduled = async (marathonId) => {
  await pool.query(
    `UPDATE marathon_items SET status = 'scheduled' WHERE marathon_id = $1 AND status = 'pending'`,
    [marathonId]
  );
};

// Queue ONE kickoff announcement for a binge marathon. Carries marathon_binge=true
// so the announcement processor knows to expand it into the whole evening.
// firstItem seeds the thumbnail/title; the processor reads all items for the lineup.
export const createBingeKickoffPendingAnnouncement = async (firstItem, marathon, total) => {
  const result = await pool.query(
    `INSERT INTO pending_announcements
       (guild_id, channel_id, user_id, title, image_url, backdrop_url, description,
        tmdb_id, imdb_id, tmdb_rating, genres, runtime, release_year, trailer_url,
        scheduled_at, marathon_id, marathon_name, marathon_total, marathon_binge)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     RETURNING *`,
    [
      marathon.guild_id, null, marathon.created_by, marathon.name, firstItem.image_url,
      firstItem.backdrop_url, firstItem.description, firstItem.tmdb_id, firstItem.imdb_id,
      firstItem.tmdb_rating, firstItem.genres, firstItem.runtime, firstItem.release_year,
      firstItem.trailer_url, firstItem.scheduled_at, marathon.id, marathon.name, total, true
    ]
  );
  try { await pool.query('NOTIFY movie_announcement'); } catch (err) {
    console.error('Failed to NOTIFY movie_announcement:', err.message);
  }
  return result.rows[0];
};
```

- [ ] **Step 2: Verify + commit**

Run: `cd bot && node -e "import('./src/models/index.js').then(m=>console.log(typeof m.getMarathonItemsByMarathon, typeof m.markAllMarathonItemsScheduled, typeof m.createBingeKickoffPendingAnnouncement))"`
Expected: `function function function`

```bash
git add bot/src/models/index.js
git commit -m "feat(marathons): bot model helpers for binge kickoff"
```

---

## Task 3: Binge kickoff embed builder

**Files:**
- Modify: `bot/src/utils/embeds.js`

- [ ] **Step 1: Add the builder**

Append to `bot/src/utils/embeds.js` (uses the same `EmbedBuilder` import already at the top). Each film's start time is its own `scheduled_at` (the wizard already staggered them by runtime), rendered with a Discord timestamp so it localizes per viewer:

```js
// Binge kickoff: one embed for the whole evening. items = ordered marathon_items
// (each with scheduled_at + runtime). Mirrors mockup 05 (ribbon + "N films · one
// sitting" + doors line + a time-stamped lineup).
export const createBingeAnnouncementEmbed = (marathonName, items, announcerName) => {
  const doors = items[0]?.scheduled_at ? new Date(items[0].scheduled_at) : new Date();
  const doorsTs = Math.floor(doors.getTime() / 1000);

  const runtimeStr = (m) => {
    if (!m) return '';
    const h = Math.floor(m / 60), min = m % 60;
    return ` · ${h ? `${h}h ` : ''}${min}m`;
  };

  const lineup = items.map((it) => {
    const ts = it.scheduled_at ? Math.floor(new Date(it.scheduled_at).getTime() / 1000) : null;
    const when = ts ? `<t:${ts}:t>` : '—';
    const year = it.release_year ? ` (${it.release_year})` : '';
    return `**${when}** — ${it.title}${year}${runtimeStr(it.runtime)}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setAuthor({ name: marathonName })
    .setTitle(`${items.length} films · one sitting`)
    .setDescription(`Doors <t:${doorsTs}:F>. We run straight through with short breaks.\n\n${lineup}`)
    .setColor(0xD4663A)
    .setFooter({ text: `Marathon started by ${announcerName}` })
    .setTimestamp();

  if (items[0]?.image_url) embed.setThumbnail(items[0].image_url);
  return embed;
};
```

- [ ] **Step 2: Verify + commit**

Run: `cd bot && node -e "import('./src/utils/embeds.js').then(m=>console.log(typeof m.createBingeAnnouncementEmbed))"` → `function`.

```bash
git add bot/src/utils/embeds.js
git commit -m "feat(marathons): binge kickoff embed builder"
```

---

## Task 4: `marathonProcessor` binge fork

**Files:**
- Modify: `bot/src/jobs/marathonProcessor.js`

- [ ] **Step 1: Import the new helpers**

Replace the model import block at the top of `bot/src/jobs/marathonProcessor.js` with:

```js
import {
  getActiveMarathons, getNextPendingMarathonItem, countMarathonItems,
  createMarathonPendingAnnouncement, markMarathonItemScheduled,
  advanceMarathonPosition, completeMarathonIfDone,
  getMarathonItemsByMarathon, markAllMarathonItemsScheduled,
  createBingeKickoffPendingAnnouncement
} from '../models/index.js';
```

- [ ] **Step 2: Fork binge marathons in the loop**

In `processMarathons`, replace the per-marathon body (the `try { const item = await getNextPendingMarathonItem(...) ... }` block) with a version that forks on `cadence_type`:

```js
      try {
        if (marathon.cadence_type === 'binge') {
          // Whole evening at once: queue a single kickoff when doors near.
          const items = await getMarathonItemsByMarathon(marathon.id);
          const pending = items.filter((it) => it.status === 'pending');
          if (pending.length === 0) { await completeMarathonIfDone(marathon.id); continue; }
          const doors = pending[0].scheduled_at;
          if (!doors) continue;
          const due = new Date(doors).getTime() - Date.now() <= ANNOUNCE_LEAD_MS;
          if (!due) continue;

          await createBingeKickoffPendingAnnouncement(pending[0], marathon, items.length);
          await markAllMarathonItemsScheduled(marathon.id);
          await advanceMarathonPosition(marathon.id, items.length);
          logger.info(`Queued BINGE kickoff for marathon ${marathon.id} (${items.length} films)`);
          continue;
        }

        // Interval (weekly) — one film per pass, as before.
        const item = await getNextPendingMarathonItem(marathon.id);
        if (!item) { await completeMarathonIfDone(marathon.id); continue; }
        if (!item.scheduled_at) continue;
        const due = new Date(item.scheduled_at).getTime() - Date.now() <= ANNOUNCE_LEAD_MS;
        if (!due) continue;

        const total = await countMarathonItems(marathon.id);
        await createMarathonPendingAnnouncement(item, marathon, total);
        await markMarathonItemScheduled(item.id);
        await advanceMarathonPosition(marathon.id, item.position + 1);
        logger.info(`Queued marathon ${marathon.id} · item ${item.id} (${item.title})`);
      } catch (err) {
        logger.error(`Error advancing marathon ${marathon.id}`, err);
      }
```

> `markAllMarathonItemsScheduled` flips every pending item to `scheduled`, so the next cron pass finds nothing pending and won't re-queue the kickoff (idempotent). `completeMarathonIfDone` only completes once no item's `scheduled_at` is still in the future, i.e. after the binge night passes.

- [ ] **Step 3: Verify + commit**

Run: `cd bot && node --check src/jobs/marathonProcessor.js` → no output (pass).

```bash
git add bot/src/jobs/marathonProcessor.js
git commit -m "feat(marathons): marathonProcessor binge fork (single kickoff)"
```

---

## Task 5: `announcementProcessor` binge expansion

**Files:**
- Modify: `bot/src/jobs/announcementProcessor.js`

- [ ] **Step 1: Import the item fetch helper**

Extend the model import at the top of `bot/src/jobs/announcementProcessor.js` to include `getMarathonItemsByMarathon` and the binge embed builder:

```js
import {
  getPendingAnnouncements, markAnnouncementProcessed, createMovieNight, findOrCreateUser,
  linkMarathonItemMovieNight, completeMarathonIfDone, getMarathonItemsByMarathon
} from '../models/index.js';
import { createAnnouncementEmbed, createBingeAnnouncementEmbed } from '../utils/embeds.js';
```

> The existing file imports only `createAnnouncementEmbed` from embeds — replace that import line with the two-name version above.

- [ ] **Step 2: Route binge kickoffs to a dedicated handler**

At the **top of `processAnnouncement`** (right after `const scheduledAt = ...; const announcerName = ...;`), add an early fork:

```js
  // Binge kickoff: one embed for the whole evening, N movie_nights behind it.
  if (announcement.marathon_binge) {
    return processBingeAnnouncement(client, announcement, channel, announcerName);
  }
```

- [ ] **Step 3: Add the binge handler**

Add this function to `bot/src/jobs/announcementProcessor.js` (below `processAnnouncement`):

```js
async function processBingeAnnouncement(client, announcement, channel, announcerName) {
  const items = await getMarathonItemsByMarathon(announcement.marathon_id);
  if (items.length === 0) {
    await markAnnouncementProcessed(announcement.id, 'failed');
    return;
  }

  const embed = createBingeAnnouncementEmbed(announcement.marathon_name, items, announcerName);
  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const reply = await channel.send({ content, embeds: [embed] });

  // One movie_night per film. The first carries the kickoff message; the rest
  // are "silent" (no message of their own) but are still real, ratable nights.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const movieNight = await createMovieNight(
      it.release_year ? `${it.title} (${it.release_year})` : it.title,
      new Date(it.scheduled_at),
      announcement.user_id,
      announcement.guild_id,
      channel.id,
      i === 0 ? reply.id : null,
      it.image_url,
      {
        description: it.description,
        tmdbId: it.tmdb_id,
        tmdbRating: it.tmdb_rating,
        genres: it.genres,
        runtime: it.runtime,
        releaseYear: it.release_year,
        backdropUrl: it.backdrop_url,
        imdbId: it.imdb_id,
        trailerUrl: it.trailer_url
      },
      announcement.is_test || false
    );
    await linkMarathonItemMovieNight(it.id, movieNight.id);
  }

  await completeMarathonIfDone(announcement.marathon_id);
  await markAnnouncementProcessed(announcement.id, 'processed');
  logger.info(`Processed BINGE kickoff: ${announcement.marathon_name} (${items.length} films)`);
}
```

> Reuses the same channel-resolution the weekly path already did (the caller `drainPendingAnnouncements` resolved `channel` before calling `processAnnouncement`). `createMovieNight` returns the row (`RETURNING *`), so `movieNight.id` is available for back-linking. `completeMarathonIfDone` leaves the marathon `active` until the binge night has passed, then completes it on a later pass.

- [ ] **Step 4: Verify + commit**

Run: `cd bot && node --check src/jobs/announcementProcessor.js` → no output (pass).

```bash
git add bot/src/jobs/announcementProcessor.js
git commit -m "feat(marathons): announcementProcessor expands binge kickoff into N movie_nights"
```

---

## Task 6: Wizard — Back-to-back cadence mode

**Files:**
- Modify: `frontend/src/pages/MarathonWizardPage.jsx`

**Reference mockup:** `03-wizard-schedule.html` — the cadence panel's two mode cards ("Spread out" / "Back-to-back"). Back-to-back replaces the Daily/Weekly/Custom interval controls with a single doors time + a break, and stacks each film after the previous by its runtime.

- [ ] **Step 1: Add binge state**

In `MarathonWizardPage.jsx`, add cadence-mode + break state near the other cadence hooks (`repeat`, `customN`, ...):

```jsx
  const [cadenceMode, setCadenceMode] = useState('interval');  // 'interval' | 'binge'
  const [breakMin, setBreakMin] = useState(15);
```

- [ ] **Step 2: Runtime-staggered autofill for binge**

Replace the existing `autofill` function with one that branches on `cadenceMode` (interval logic is unchanged; binge stacks each film after the previous by runtime + break):

```jsx
  const autofill = () => {
    if (cadenceMode === 'binge') {
      let cursor = new Date(start).getTime();
      setItems((prev) => prev.map((it) => {
        const at = toLocalInput(new Date(cursor));
        cursor += ((it.runtime || 120) + breakMin) * 60000;   // next film after runtime + break
        return { ...it, scheduled_at: at };
      }));
      return;
    }
    const base = new Date(start);
    const stepMs = stepDays() * 864e5;
    setItems((prev) => prev.map((it, i) => ({
      ...it, scheduled_at: toLocalInput(new Date(base.getTime() + i * stepMs))
    })));
  };
```

- [ ] **Step 3: Launch with the chosen cadence + fix the label**

In `launch`, change the hardcoded `'interval'` to `cadenceMode`:

```jsx
      await api.launchMarathon(marathonId, cadenceMode,
        items.map((i) => ({ id: i.id, scheduled_at: new Date(i.scheduled_at).toISOString() })));
```

Update `cadenceLabel` to cover binge:

```jsx
  const cadenceLabel = cadenceMode === 'binge' ? 'Back-to-back'
    : repeat === 'daily' ? 'Daily'
    : repeat === 'weekly' ? 'Weekly'
    : `Every ${customN} ${customUnit}${customN > 1 ? 's' : ''}`;
```

- [ ] **Step 4: Enable the Back-to-back mode card + conditional controls**

In the schedule panel (the `mara-panel` block), replace the two mode `<button>`s so both are enabled and toggle `cadenceMode`, and gate the interval controls (Repeat seg + custom) behind `cadenceMode === 'interval'`, showing a break input for binge. Replace the `.mara-modes` block and the Repeat/custom controls with:

```jsx
              <div className="mara-modes">
                <button type="button" className={`mara-mode ${cadenceMode === 'interval' ? 'sel' : ''}`}
                  onClick={() => setCadenceMode('interval')}>
                  <span className="ic"><Icon name="calendar-clock" size={18} /></span>
                  <h4>Spread out</h4><p>One film per interval, over time</p>
                </button>
                <button type="button" className={`mara-mode ${cadenceMode === 'binge' ? 'sel' : ''}`}
                  onClick={() => setCadenceMode('binge')}>
                  <span className="ic"><Icon name="film" size={18} /></span>
                  <h4>Back-to-back</h4><p>All in one sitting, by runtime</p>
                </button>
              </div>

              {cadenceMode === 'interval' && (
                <>
                  <label className="mara-label">Repeat</label>
                  <div className="mara-seg">
                    {['daily', 'weekly', 'custom'].map((r) => (
                      <button key={r} type="button" className={repeat === r ? 'on' : ''} onClick={() => setRepeat(r)}>
                        {r[0].toUpperCase() + r.slice(1)}
                      </button>
                    ))}
                  </div>

                  {repeat === 'custom' && (
                    <div className="mara-field">
                      <label className="mara-label">Every</label>
                      <div className="mara-inrow">
                        <input type="number" min="1" value={customN}
                               onChange={(e) => setCustomN(Math.max(1, parseInt(e.target.value) || 1))} style={{ maxWidth: 90 }} />
                        <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}>
                          <option value="day">day(s)</option>
                          <option value="week">week(s)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}

              {cadenceMode === 'binge' && (
                <div className="mara-field">
                  <label className="mara-label">Break between films (min)</label>
                  <input type="number" min="0" value={breakMin}
                         onChange={(e) => setBreakMin(Math.max(0, parseInt(e.target.value) || 0))} style={{ maxWidth: 110 }} />
                </div>
              )}
```

> The existing "Starts" `datetime-local` (bound to `start`) doubles as the **doors** time for binge — no change needed. The "Auto-fill dates" button already calls `autofill`, which now branches. The existing `mara-mode.disabled` CSS is no longer applied (both modes are enabled); leave the rule in place, it's harmless.

- [ ] **Step 5: Verify (build + mockup fidelity)**

Run: `cd frontend && npm run build` → exits 0.
Then **open `03-wizard-schedule.html`** and confirm: both cadence mode cards are selectable; picking **Back-to-back** hides the Daily/Weekly/Custom controls and shows the break input; Auto-fill stacks the films' times by runtime (each later than the last by roughly its runtime + break). Render the page to confirm visually.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/MarathonWizardPage.jsx
git commit -m "feat(marathons): back-to-back binge cadence in the wizard"
```

---

## Final verification (on Railway)

- [ ] Deploy; `marathon_binge` column is added on `npm start`.
- [ ] Create a 2-film **Back-to-back** marathon, doors ~now (test mode), 15-min break; launch. Confirm each film's `scheduled_at` is staggered by runtime + break.
- [ ] Within the lead window, `marathonProcessor` queues **one** kickoff (`pending_announcements` row with `marathon_binge=true`); all items flip to `scheduled`.
- [ ] `announcementProcessor` posts **one** kickoff embed (ribbon + "2 films · one sitting" + doors line + time-stamped lineup) and creates **2** `movie_night` rows (first with the kickoff `message_id`, second with `NULL`); both `marathon_items.scheduled_movie_night_id` set.
- [ ] Rate/attend each film via the web — works as normal `movie_night`s.
- [ ] After both scheduled times pass, the marathon flips to `completed` on the next cron pass.
- [ ] Confirm a **weekly** marathon still rolls out one-at-a-time (interval path untouched).

---

## Self-Review

**Spec coverage (spec §4.5, §6 back-to-back, §11 binge open item):**
- Binge cadence template — runtime-staggered dates + break → Task 6 (`autofill` binge branch) ✓
- Whole lineup queued at launch/near-date rather than one-at-a-time → Task 4 (marathonProcessor binge fork queues one kickoff, marks all scheduled) ✓
- Single kickoff embed listing the full evening with computed start times → Task 3 (`createBingeAnnouncementEmbed`) + Task 5 (posts it once) ✓
- N `movie_night` rows still created (films 2..N "silent", direct insert) → Task 5 (`processBingeAnnouncement` loops, first carries message, rest `NULL`) ✓
- Each film ratable/attendable as a normal movie_night → Task 5 (real `createMovieNight` rows + back-link) ✓
- `pending_announcements` carries the binge flag → Task 1 (`marathon_binge`) + Task 2 (kickoff insert) ✓
- No collision logic (nothing added) ✓

**Deferred by design:** attend buttons on embeds (neither cadence has them today); home calendar/scheduler (Plan 4).

**Placeholder scan:** none — all steps carry concrete code.

**Type/name consistency:** `cadence_type='binge'` written by the wizard `launch` (Task 6) ↔ read by `marathonProcessor` fork (Task 4) ↔ `marathon_binge` PA flag (Tasks 1–2) ↔ `announcement.marathon_binge` fork in `processAnnouncement` (Task 5). `createBingeKickoffPendingAnnouncement(firstItem, marathon, total)` (Task 2) inserts `marathon_binge=true`; `getMarathonItemsByMarathon(marathonId)` (Task 2) feeds both `createBingeAnnouncementEmbed(marathonName, items, announcerName)` (Task 3) and the movie_night loop (Task 5). `markAllMarathonItemsScheduled` + `advanceMarathonPosition(id, items.length)` keep the kickoff idempotent.
