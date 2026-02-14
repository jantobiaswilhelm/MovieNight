import { Router } from 'express';
import * as db from '../models/index.js';

const router = Router();

// Get all collections for a guild
router.get('/', async (req, res) => {
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const collections = await db.getCollections(guild_id);
    res.json(collections);
  } catch (err) {
    console.error('Error fetching collections:', err);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

// Get movies in a specific collection
router.get('/:name', async (req, res) => {
  const { name } = req.params;
  const { guild_id } = req.query;

  if (!guild_id) {
    return res.status(400).json({ error: 'guild_id is required' });
  }

  try {
    const movies = await db.getCollectionMovies(guild_id, decodeURIComponent(name));
    res.json(movies);
  } catch (err) {
    console.error('Error fetching collection movies:', err);
    res.status(500).json({ error: 'Failed to fetch collection movies' });
  }
});

export default router;
