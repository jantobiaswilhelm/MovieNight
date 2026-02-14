import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { authenticateToken } from '../middleware/auth.js';
import * as db from '../models/index.js';

const router = Router();

// Configure multer for file uploads (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// TMDB API config
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Helper to search TMDB and get movie details
async function searchAndGetMovie(title, year) {
  if (!TMDB_API_KEY) return null;

  try {
    // Search with year for better accuracy
    const searchUrl = year
      ? `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}&include_adult=false`
      : `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;

    const searchResponse = await fetch(searchUrl);
    if (!searchResponse.ok) return null;

    const searchData = await searchResponse.json();
    if (!searchData.results || searchData.results.length === 0) {
      // Try without year if no results
      if (year) {
        const fallbackUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;
        const fallbackResponse = await fetch(fallbackUrl);
        if (!fallbackResponse.ok) return null;
        const fallbackData = await fallbackResponse.json();
        if (!fallbackData.results || fallbackData.results.length === 0) return null;
        searchData.results = fallbackData.results;
      } else {
        return null;
      }
    }

    // Get the first (best) match
    const movie = searchData.results[0];

    // Get full details
    const detailsResponse = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}`);
    if (!detailsResponse.ok) return null;

    const details = await detailsResponse.json();

    return {
      tmdbId: details.id,
      title: details.title,
      imageUrl: details.poster_path ? `${TMDB_IMAGE_BASE}${details.poster_path}` : null,
      releaseYear: details.release_date ? parseInt(details.release_date.split('-')[0]) : null,
      runtime: details.runtime || null,
      genres: details.genres?.map(g => g.name).join(', ') || null
    };
  } catch (err) {
    console.error('TMDB search error:', err);
    return null;
  }
}

// Helper to add delay between API calls to avoid rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Get user's personal movies
router.get('/', authenticateToken, async (req, res) => {
  const { sort = 'newest' } = req.query;

  try {
    const movies = await db.getUserPersonalMovies(req.user.id, sort);
    res.json(movies);
  } catch (err) {
    console.error('Error fetching personal movies:', err);
    res.status(500).json({ error: 'Failed to fetch personal movies' });
  }
});

// Add a personal movie
router.post('/', authenticateToken, async (req, res) => {
  const { tmdb_id, title, image_url, release_year, runtime, genres, score, comment, watched_at } = req.body;

  if (!tmdb_id || !title) {
    return res.status(400).json({ error: 'tmdb_id and title are required' });
  }

  if (score !== undefined && score !== null && (score < 1 || score > 10)) {
    return res.status(400).json({ error: 'score must be between 1 and 10' });
  }

  try {
    const movie = await db.addPersonalMovie(req.user.id, {
      tmdbId: tmdb_id,
      title,
      imageUrl: image_url,
      releaseYear: release_year,
      runtime,
      genres,
      score: score || null,
      comment: comment || null,
      watchedAt: watched_at || null
    });
    res.json(movie);
  } catch (err) {
    console.error('Error adding personal movie:', err);
    res.status(500).json({ error: 'Failed to add personal movie' });
  }
});

// Import from Letterboxd CSV
router.post('/import/letterboxd', authenticateToken, upload.fields([
  { name: 'ratings', maxCount: 1 },
  { name: 'diary', maxCount: 1 },
  { name: 'reviews', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files;

    if (!files || (!files.ratings && !files.diary)) {
      return res.status(400).json({ error: 'Please upload at least a ratings.csv or diary.csv file' });
    }

    // Parse CSV files
    const parseOptions = {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true
    };

    // Build a map of movies to import
    // Key: "title|year", Value: { title, year, rating, watchedAt, review }
    const moviesMap = new Map();

    // Parse ratings.csv - has: Date, Name, Year, Letterboxd URI, Rating
    if (files.ratings) {
      const ratingsContent = files.ratings[0].buffer.toString('utf-8');
      const ratingsData = parse(ratingsContent, parseOptions);

      for (const row of ratingsData) {
        const title = row.Name || row.name || row.Title || row.title;
        const year = row.Year || row.year;
        const rating = row.Rating || row.rating;

        if (!title) continue;

        const key = `${title}|${year || ''}`;
        const existing = moviesMap.get(key) || { title, year: year ? parseInt(year) : null };

        if (rating) {
          // Convert Letterboxd 0.5-5 scale to 1-10 scale
          existing.rating = Math.round(parseFloat(rating) * 2);
        }

        moviesMap.set(key, existing);
      }
    }

    // Parse diary.csv - has: Date, Name, Year, Letterboxd URI, Rating, Rewatch, Tags, Watched Date
    if (files.diary) {
      const diaryContent = files.diary[0].buffer.toString('utf-8');
      const diaryData = parse(diaryContent, parseOptions);

      for (const row of diaryData) {
        const title = row.Name || row.name || row.Title || row.title;
        const year = row.Year || row.year;
        const rating = row.Rating || row.rating;
        const watchedDate = row['Watched Date'] || row.watched_date || row.Date || row.date;

        if (!title) continue;

        const key = `${title}|${year || ''}`;
        const existing = moviesMap.get(key) || { title, year: year ? parseInt(year) : null };

        if (rating && !existing.rating) {
          existing.rating = Math.round(parseFloat(rating) * 2);
        }

        if (watchedDate && !existing.watchedAt) {
          existing.watchedAt = watchedDate;
        }

        moviesMap.set(key, existing);
      }
    }

    // Parse reviews.csv - has: Date, Name, Year, Letterboxd URI, Rating, Rewatch, Review, Tags
    if (files.reviews) {
      const reviewsContent = files.reviews[0].buffer.toString('utf-8');
      const reviewsData = parse(reviewsContent, parseOptions);

      for (const row of reviewsData) {
        const title = row.Name || row.name || row.Title || row.title;
        const year = row.Year || row.year;
        const review = row.Review || row.review;

        if (!title) continue;

        const key = `${title}|${year || ''}`;
        const existing = moviesMap.get(key);

        if (existing && review) {
          existing.review = review;
        }
      }
    }

    // Import movies
    const results = {
      total: moviesMap.size,
      imported: 0,
      skipped: 0,
      failed: []
    };

    for (const [key, movieData] of moviesMap) {
      try {
        // Search TMDB for the movie
        const tmdbMovie = await searchAndGetMovie(movieData.title, movieData.year);

        if (!tmdbMovie) {
          results.failed.push({ title: movieData.title, year: movieData.year, reason: 'Not found on TMDB' });
          results.skipped++;
          continue;
        }

        // Add to personal movies
        await db.addPersonalMovie(req.user.id, {
          tmdbId: tmdbMovie.tmdbId,
          title: tmdbMovie.title,
          imageUrl: tmdbMovie.imageUrl,
          releaseYear: tmdbMovie.releaseYear,
          runtime: tmdbMovie.runtime,
          genres: tmdbMovie.genres,
          score: movieData.rating || null,
          comment: movieData.review || null,
          watchedAt: movieData.watchedAt || null
        });

        results.imported++;

        // Add small delay to avoid TMDB rate limiting (40 requests per 10 seconds)
        await delay(250);
      } catch (err) {
        console.error(`Error importing ${movieData.title}:`, err);
        results.failed.push({ title: movieData.title, year: movieData.year, reason: 'Import error' });
        results.skipped++;
      }
    }

    res.json(results);
  } catch (err) {
    console.error('Error importing from Letterboxd:', err);
    res.status(500).json({ error: 'Failed to import from Letterboxd' });
  }
});

// Update a personal movie
router.put('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { score, comment, watched_at } = req.body;

  if (score !== undefined && score !== null && (score < 1 || score > 10)) {
    return res.status(400).json({ error: 'score must be between 1 and 10' });
  }

  try {
    const movie = await db.updatePersonalMovie(parseInt(id), req.user.id, {
      score: score !== undefined ? score : undefined,
      comment: comment !== undefined ? comment : undefined,
      watchedAt: watched_at !== undefined ? watched_at : undefined
    });

    if (!movie) {
      return res.status(404).json({ error: 'Personal movie not found or not owned by user' });
    }

    res.json(movie);
  } catch (err) {
    console.error('Error updating personal movie:', err);
    res.status(500).json({ error: 'Failed to update personal movie' });
  }
});

// Delete a personal movie
router.delete('/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const movie = await db.deletePersonalMovie(parseInt(id), req.user.id);

    if (!movie) {
      return res.status(404).json({ error: 'Personal movie not found or not owned by user' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting personal movie:', err);
    res.status(500).json({ error: 'Failed to delete personal movie' });
  }
});

export default router;
