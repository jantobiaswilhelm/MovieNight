import { Router } from 'express';
import { validateGuildId, parsePagination } from '../middleware/validate.js';
import * as db from '../models/index.js';

const router = Router();

// Get all collections for a guild
router.get('/', validateGuildId, parsePagination, async (req, res) => {
  try {
    const collections = await db.getCollections(req.guildId, req.pagination.limit, req.pagination.offset);
    res.json(collections);
  } catch (err) {
    console.error('Error fetching collections:', err);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Get movies in a specific collection
router.get('/:name', validateGuildId, parsePagination, async (req, res) => {
  const { name } = req.params;

  try {
    const movies = await db.getCollectionMovies(req.guildId, decodeURIComponent(name), req.pagination.limit, req.pagination.offset);
    res.json(movies);
  } catch (err) {
    console.error('Error fetching collection movies:', err);
    res.status(500).json({ error: 'Failed to fetch collection movies' });
  }
});

export default router;
