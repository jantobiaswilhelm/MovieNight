import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateIntParams, validateGuildId } from '../middleware/validate.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';
import * as tmdb from '../services/tmdb.js';
import * as curator from '../services/curator.js';
import * as suggestions from '../services/marathonSuggestions.js';

const router = Router();

// Owner-or-admin guard for mutations.
const canManage = (marathon, user) =>
  marathon.created_by === user.id || isAdmin(user.discord_id);

// TMDB detail (services/tmdb.getMovieDetail) → addMarathonItem/Bulk input shape.
const detailToItem = (d) => ({
  tmdbId: d.id, title: d.title, imageUrl: d.posterPath, backdropUrl: d.backdropPath,
  description: d.overview, tmdbRating: d.rating, genres: d.genres, runtime: d.runtime,
  releaseYear: d.year, tagline: d.tagline, imdbId: d.imdbId,
  originalLanguage: d.originalLanguage, trailerUrl: d.trailerUrl
});

// GET /api/marathons — browse list for the guild.
router.get('/', validateGuildId, optionalAuth, async (req, res) => {
  try {
    const marathons = await db.getMarathons(req.guildId);
    const withOwner = marathons.map((m) => ({
      ...m,
      is_owner: req.user ? canManage(m, req.user) : false
    }));
    res.json(withOwner);
  } catch (err) {
    console.error('Error fetching marathons:', err);
    res.status(500).json({ error: 'Failed to fetch marathons' });
  }
});

// GET /api/marathons/curate — is the "describe a vibe" path available?
// Registered before /:id so the static "curate" segment isn't read as an id.
router.get('/curate', validateGuildId, optionalAuth, (req, res) => {
  res.json({ available: curator.isCurationAvailable() });
});

// POST /api/marathons/curate — body: { prompt } → resolved TMDB preview lineup for review.
router.post('/curate', validateGuildId, authenticateToken, async (req, res) => {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return res.status(400).json({ error: 'A prompt is required' });
  }
  if (!curator.isCurationAvailable()) {
    return res.status(503).json({ error: 'AI curation is not configured' });
  }
  try {
    const items = await curator.curateLineup(prompt.trim().slice(0, 300));
    if (items.length === 0) return res.status(502).json({ error: 'No films could be resolved — try rephrasing' });
    res.json(items);
  } catch (err) {
    console.error('Error curating marathon:', err);
    res.status(err.status || 500).json({ error: err.message ? `Curation failed — ${err.message}` : 'Failed to curate' });
  }
});

// GET /api/marathons/:id — marathon + its items.
router.get('/:id', validateGuildId, validateIntParams('id'), optionalAuth, async (req, res) => {
  try {
    const marathon = await db.getMarathonById(parseInt(req.params.id));
    if (!marathon || marathon.guild_id !== req.guildId) {
      return res.status(404).json({ error: 'Marathon not found' });
    }
    const items = await db.getMarathonItems(marathon.id);
    const isOwner = req.user ? canManage(marathon, req.user) : false;
    res.json({ ...marathon, items, is_owner: isOwner });
  } catch (err) {
    console.error('Error fetching marathon:', err);
    res.status(500).json({ error: 'Failed to fetch marathon' });
  }
});

// POST /api/marathons — create a draft.
router.post('/', validateGuildId, authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }
  if (name.length > 255) {
    return res.status(400).json({ error: 'Name too long (max 255 characters)' });
  }
  try {
    const marathon = await db.createMarathon(req.guildId, req.user.id, name.trim(), description || null);
    res.json(marathon);
  } catch (err) {
    console.error('Error creating marathon:', err);
    res.status(500).json({ error: 'Failed to create marathon' });
  }
});

// Helper: load marathon and enforce guild + management rights.
const loadManageable = async (req, res) => {
  const marathon = await db.getMarathonById(parseInt(req.params.id));
  if (!marathon || marathon.guild_id !== req.guildId) {
    res.status(404).json({ error: 'Marathon not found' });
    return null;
  }
  if (!canManage(marathon, req.user)) {
    res.status(403).json({ error: 'Not allowed' });
    return null;
  }
  return marathon;
};

// A back-to-back marathon announces its WHOLE evening in one Discord post, and
// marks every item 'scheduled' as it does (bot enqueueBingeMarathonAtomic). A
// film added afterwards lands as 'pending', which makes the processor fire a
// second kickoff and re-announce the entire lineup. So: no adding after the
// evening has gone out.
const bingeAlreadyAnnounced = (marathon, items) =>
  marathon.cadence_type === 'binge' && items.some((it) => it.status === 'scheduled');

// Shared by both add routes. Returns an error string, or null when adding is OK.
const blockedFromAdding = async (marathon) => {
  const items = await db.getMarathonItems(marathon.id);
  if (bingeAlreadyAnnounced(marathon, items)) {
    return 'This back-to-back night has already been announced to Discord — its whole lineup went out in one post, so films can’t be added now.';
  }
  return null;
};

// Called after a successful add. A completed marathon has to go back to active
// or the bot never picks the new films up (getActiveMarathons filters on it).
const reviveIfCompleted = async (marathon) => {
  suggestions.invalidateSuggestions(marathon.id);
  if (marathon.status === 'completed') await db.setMarathonStatus(marathon.id, 'active');
};

// GET /api/marathons/:id/suggestions — what else fits this marathon?
// Derived from the lineup itself (shared franchise / director / cast, pooled
// TMDB recommendations). Aggregated server-side because doing it in the browser
// would be three TMDB round-trips per film in the lineup.
router.get('/:id/suggestions', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const items = await db.getMarathonItems(marathon.id);
    const blocked = await blockedFromAdding(marathon);
    if (blocked) return res.status(409).json({ error: blocked });
    res.json(await suggestions.buildSuggestions(marathon, items));
  } catch (err) {
    console.error('Error building marathon suggestions:', err);
    res.status(502).json({ error: 'Could not reach TMDB for suggestions' });
  }
});

// POST /api/marathons/:id/items — append a film (tmdb_data carries metadata).
router.post('/:id/items', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { tmdb_data } = req.body;
  if (!tmdb_data || !tmdb_data.title) {
    return res.status(400).json({ error: 'tmdb_data with a title is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const blocked = await blockedFromAdding(marathon);
    if (blocked) return res.status(409).json({ error: blocked });
    const item = await db.addMarathonItem(marathon.id, tmdb_data);
    await reviveIfCompleted(marathon);
    res.json(item);
  } catch (err) {
    console.error('Error adding marathon item:', err);
    res.status(500).json({ error: 'Failed to add item' });
  }
});

// POST /api/marathons/:id/items/bulk — body: { tmdb_ids: [int, ...] }
// Enriches each id to full metadata server-side so source-built films carry the
// same genres/runtime/trailer as manually-added ones.
router.post('/:id/items/bulk', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { tmdb_ids } = req.body;
  if (!Array.isArray(tmdb_ids) || tmdb_ids.length === 0) {
    return res.status(400).json({ error: 'tmdb_ids array is required' });
  }
  const ids = tmdb_ids.filter((n) => Number.isInteger(n)).slice(0, 30);
  if (ids.length === 0) return res.status(400).json({ error: 'No valid tmdb_ids' });
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const blocked = await blockedFromAdding(marathon);
    if (blocked) return res.status(409).json({ error: blocked });
    const details = await Promise.all(ids.map((tid) => tmdb.getMovieDetail(tid).catch(() => null)));
    const movies = details.filter(Boolean).map(detailToItem);
    if (movies.length === 0) return res.status(502).json({ error: 'Could not resolve any films from TMDB' });
    const items = await db.addMarathonItemsBulk(marathon.id, movies);
    await reviveIfCompleted(marathon);
    res.json(items);
  } catch (err) {
    console.error('Error bulk-adding marathon items:', err);
    res.status(500).json({ error: 'Failed to add items' });
  }
});

// DELETE /api/marathons/:id/items/:itemId
router.delete('/:id/items/:itemId', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    await db.removeMarathonItem(marathon.id, parseInt(req.params.itemId));
    res.json({ success: true });
  } catch (err) {
    console.error('Error removing marathon item:', err);
    res.status(500).json({ error: 'Failed to remove item' });
  }
});

// PUT /api/marathons/:id/reorder — body: { item_ids: [id, id, ...] }
router.put('/:id/reorder', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { item_ids } = req.body;
  if (!Array.isArray(item_ids)) {
    return res.status(400).json({ error: 'item_ids array is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const items = await db.reorderMarathonItems(marathon.id, item_ids);
    res.json(items);
  } catch (err) {
    console.error('Error reordering marathon:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

// PUT /api/marathons/:id/items/:itemId — body: { scheduled_at }
router.put('/:id/items/:itemId', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  const { scheduled_at } = req.body;
  // null / '' clears the date → the film becomes "TBD" (unscheduled). Any value
  // that is present must still be a valid date.
  const hasDate = scheduled_at !== null && scheduled_at !== undefined && scheduled_at !== '';
  if (hasDate && isNaN(new Date(scheduled_at).getTime())) {
    return res.status(400).json({ error: 'scheduled_at must be a valid date or null' });
  }
  if (hasDate && new Date(scheduled_at) <= new Date()) {
    return res.status(400).json({
      error: 'That date has passed — use “Already watched” to log a film you’ve already seen.'
    });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const current = await db.getMarathonItemById(marathon.id, parseInt(req.params.itemId));
    if (current?.status === 'watched') {
      return res.status(409).json({ error: 'That film is logged as already watched — undo that first to give it a new date.' });
    }
    const item = await db.updateMarathonItemDate(marathon.id, parseInt(req.params.itemId), hasDate ? new Date(scheduled_at) : null);
    res.json(item);
  } catch (err) {
    console.error('Error updating item date:', err);
    res.status(500).json({ error: 'Failed to update date' });
  }
});

// GET /api/marathons/:id/items/:itemId/matches — past screenings of this film,
// offered when logging it as already watched.
router.get('/:id/items/:itemId/matches', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.getMarathonItemById(marathon.id, parseInt(req.params.itemId));
    if (!item) return res.status(404).json({ error: 'Film not found in this marathon' });
    res.json(await db.findPastNightsForFilm(marathon.guild_id, item.tmdb_id, item.title));
  } catch (err) {
    console.error('Error finding past screenings for marathon item:', err);
    res.status(500).json({ error: 'Failed to look up past screenings' });
  }
});

// POST /api/marathons/:id/items/:itemId/watched — body: { watched_at, movie_night_id? }
// Logs a film the group watched outside the roll-out: it stops being announced,
// counts towards progress, and points at the real screening when we found one.
router.post('/:id/items/:itemId/watched', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  const { watched_at, movie_night_id } = req.body;
  const when = new Date(watched_at);
  if (!watched_at || isNaN(when.getTime())) {
    return res.status(400).json({ error: 'watched_at must be a valid date' });
  }
  if (when > new Date()) {
    return res.status(400).json({ error: 'That date is in the future — a film can only be marked watched after it played.' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.getMarathonItemById(marathon.id, parseInt(req.params.itemId));
    if (!item) return res.status(404).json({ error: 'Film not found in this marathon' });
    // A film the bot has already taken is off limits, and 'scheduled' is the whole
    // test. enqueueMarathonItemAtomic marks the item 'scheduled' when it queues the
    // announcement and linkMarathonItemMovieNight only back-links later, so the
    // status covers the entire period the bot owns the film. Don't also refuse on
    // scheduled_movie_night_id: this feature sets that field too, so it would tell
    // someone re-logging their own film that Discord had posted it.
    if (item.status === 'scheduled') {
      return res.status(409).json({ error: 'The bot has already posted this film to Discord — the marathon is tracking it.' });
    }
    let nightId = null;
    if (movie_night_id !== undefined && movie_night_id !== null && movie_night_id !== '') {
      const wanted = Number(movie_night_id);
      if (!Number.isInteger(wanted)) {
        return res.status(400).json({ error: 'movie_night_id must be a whole number' });
      }
      // Validated by membership in the same candidate list the panel offered, which
      // pins down guild, film and pastness in one query — and we store the row's own
      // id, never the client's value.
      const candidates = await db.findPastNightsForFilm(marathon.guild_id, item.tmdb_id, item.title);
      const match = candidates.find((n) => n.id === wanted);
      if (!match) {
        return res.status(400).json({ error: 'That movie night is not a past screening of this film.' });
      }
      nightId = match.id;
    }
    const updated = await db.markMarathonItemWatched(marathon.id, item.id, when, nightId);
    if (!updated) {
      // The statement carries the same invariant this route checked, so an empty
      // result means the film changed underneath us. Tell "gone" apart from
      // "claimed" — answering 409 for a deleted film would be a plain lie.
      const still = await db.getMarathonItemById(marathon.id, item.id);
      if (!still) return res.status(404).json({ error: 'Film not found in this marathon' });
      return res.status(409).json({ error: 'That film changed while you were logging it — reload the marathon and try again.' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Error marking marathon item watched:', err);
    res.status(500).json({ error: 'Failed to mark the film watched' });
  }
});

// DELETE /api/marathons/:id/items/:itemId/watched — undo, putting the film back
// in the queue as TBD.
router.delete('/:id/items/:itemId/watched', validateGuildId, validateIntParams('id', 'itemId'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const itemId = parseInt(req.params.itemId);
    const item = await db.unmarkMarathonItemWatched(marathon.id, itemId);
    // Marking the last film watched completes a marathon, so undoing has to revive
    // it or the bot will never look at this film again (getActiveMarathons filters
    // on status). Runs before the branch below so a repeat undo can still repair a
    // marathon the bot completed in between, and it is SQL-guarded rather than
    // reading marathon.status — that read predates the write above.
    await db.reviveCompletedMarathon(marathon.id);
    if (!item) {
      // The model guards on status = 'watched', so an empty result means either
      // "no such film here" or "already not watched". Tell those apart: a
      // double-clicked undo should not read as an error.
      const existing = await db.getMarathonItemById(marathon.id, itemId);
      if (!existing) return res.status(404).json({ error: 'Film not found in this marathon' });
      return res.json(existing);
    }
    res.json(item);
  } catch (err) {
    console.error('Error undoing marathon watched mark:', err);
    res.status(500).json({ error: 'Failed to undo' });
  }
});

// POST /api/marathons/:id/launch — body: { cadence_type, items: [{ id, scheduled_at }] }
router.post('/:id/launch', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { cadence_type, items } = req.body;
  if (!['interval', 'binge'].includes(cadence_type)) {
    return res.status(400).json({ error: 'cadence_type must be interval or binge' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required' });
  }
  for (const it of items) {
    // A film may launch with no date (TBD) — only require an id, and validate any
    // date that IS provided. Undated films just won't roll out until dated.
    if (!it.id) {
      return res.status(400).json({ error: 'Each item needs an id' });
    }
    if (it.scheduled_at && isNaN(new Date(it.scheduled_at).getTime())) {
      return res.status(400).json({ error: 'scheduled_at must be a valid date or null' });
    }
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const normalized = items.map((it) => ({ id: it.id, scheduled_at: it.scheduled_at ? new Date(it.scheduled_at) : null }));
    // A past date isn't a schedule — the processor would see the film as due and
    // announce it the moment the marathon launches. Name the film, since a draft
    // put together over several days can easily have its first date fall behind.
    const now = new Date();
    const stale = normalized.find((it) => it.scheduled_at && it.scheduled_at <= now);
    if (stale) {
      const existing = await db.getMarathonItems(marathon.id);
      const film = existing.find((it) => it.id === stale.id);
      return res.status(400).json({
        error: `${film ? `“${film.title}”` : 'One film'} is dated in the past — pick a future date, or launch it as TBD.`
      });
    }
    const updated = await db.launchMarathon(marathon.id, cadence_type, normalized);
    res.json(updated);
  } catch (err) {
    console.error('Error launching marathon:', err);
    res.status(500).json({ error: 'Failed to launch' });
  }
});

// POST /api/marathons/:id/pause  and  /resume
router.post('/:id/pause', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const updated = await db.setMarathonStatus(marathon.id, 'paused');
    res.json(updated);
  } catch (err) {
    console.error('Error pausing marathon:', err);
    res.status(500).json({ error: 'Failed to pause' });
  }
});

router.post('/:id/resume', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const updated = await db.setMarathonStatus(marathon.id, 'active');
    res.json(updated);
  } catch (err) {
    console.error('Error resuming marathon:', err);
    res.status(500).json({ error: 'Failed to resume' });
  }
});

// DELETE /api/marathons/:id
router.delete('/:id', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    await db.deleteMarathon(marathon.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting marathon:', err);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

export default router;
