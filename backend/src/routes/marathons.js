import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateIntParams, validateGuildId } from '../middleware/validate.js';
import { isAdmin } from '../utils/admin.js';
import * as db from '../models/index.js';
import * as tmdb from '../services/tmdb.js';
import * as curator from '../services/curator.js';

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
    res.status(err.status || 500).json({ error: 'Failed to curate' });
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

// POST /api/marathons/:id/items — append a film (tmdb_data carries metadata).
router.post('/:id/items', validateGuildId, validateIntParams('id'), authenticateToken, async (req, res) => {
  const { tmdb_data } = req.body;
  if (!tmdb_data || !tmdb_data.title) {
    return res.status(400).json({ error: 'tmdb_data with a title is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.addMarathonItem(marathon.id, tmdb_data);
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
    const details = await Promise.all(ids.map((tid) => tmdb.getMovieDetail(tid).catch(() => null)));
    const movies = details.filter(Boolean).map(detailToItem);
    if (movies.length === 0) return res.status(502).json({ error: 'Could not resolve any films from TMDB' });
    const items = await db.addMarathonItemsBulk(marathon.id, movies);
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
  if (!scheduled_at || isNaN(new Date(scheduled_at).getTime())) {
    return res.status(400).json({ error: 'Valid scheduled_at is required' });
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const item = await db.updateMarathonItemDate(marathon.id, parseInt(req.params.itemId), new Date(scheduled_at));
    res.json(item);
  } catch (err) {
    console.error('Error updating item date:', err);
    res.status(500).json({ error: 'Failed to update date' });
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
    if (!it.id || !it.scheduled_at || isNaN(new Date(it.scheduled_at).getTime())) {
      return res.status(400).json({ error: 'Each item needs an id and a valid scheduled_at' });
    }
  }
  try {
    const marathon = await loadManageable(req, res);
    if (!marathon) return;
    const normalized = items.map((it) => ({ id: it.id, scheduled_at: new Date(it.scheduled_at) }));
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
