import { Router } from 'express';

const router = Router();

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

// Search movies
router.get('/search', async (req, res) => {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'query parameter is required' });
  }

  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: 'TMDB API key not configured' });
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
    );

    if (!response.ok) {
      console.error('TMDB API error:', response.status);
      return res.status(502).json({ error: 'TMDB API error' });
    }

    const data = await response.json();

    const results = data.results.slice(0, 10).map(movie => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date ? movie.release_date.split('-')[0] : null,
      overview: movie.overview,
      posterPath: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
      rating: movie.vote_average ? parseFloat(movie.vote_average.toFixed(1)) : null,
      releaseDate: movie.release_date
    }));

    res.json(results);
  } catch (err) {
    console.error('TMDB search error:', err);
    res.status(500).json({ error: 'Failed to search movies' });
  }
});

// Get movie details
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: 'TMDB API key not configured' });
  }

  try {
    const [detailsResponse, videosResponse] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`),
      fetch(`${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}`)
    ]);

    if (!detailsResponse.ok) {
      if (detailsResponse.status === 404) {
        return res.status(404).json({ error: 'Movie not found' });
      }
      return res.status(502).json({ error: 'TMDB API error' });
    }

    const movie = await detailsResponse.json();

    // Get trailer URL
    let trailerUrl = null;
    if (videosResponse.ok) {
      const videosData = await videosResponse.json();
      const trailer = videosData.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official) ||
                      videosData.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                      videosData.results?.find(v => v.type === 'Teaser' && v.site === 'YouTube');
      if (trailer) {
        trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
      }
    }

    res.json({
      id: movie.id,
      title: movie.title,
      year: movie.release_date ? parseInt(movie.release_date.split('-')[0]) : null,
      overview: movie.overview,
      posterPath: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
      backdropPath: movie.backdrop_path ? `${TMDB_BACKDROP_BASE}${movie.backdrop_path}` : null,
      rating: movie.vote_average ? parseFloat(movie.vote_average.toFixed(1)) : null,
      releaseDate: movie.release_date,
      runtime: movie.runtime || null,
      genres: movie.genres?.map(g => g.name).join(', ') || null,
      tagline: movie.tagline || null,
      imdbId: movie.imdb_id || null,
      originalLanguage: movie.original_language || null,
      collectionName: movie.belongs_to_collection?.name || null,
      trailerUrl
    });
  } catch (err) {
    console.error('TMDB details error:', err);
    res.status(500).json({ error: 'Failed to get movie details' });
  }
});

// Get recommended movies with details
router.get('/:id/similar', async (req, res) => {
  const { id } = req.params;

  if (!TMDB_API_KEY) {
    return res.status(500).json({ error: 'TMDB API key not configured' });
  }

  try {
    // Use recommendations endpoint for better accuracy (based on user behavior patterns)
    const similarResponse = await fetch(
      `${TMDB_BASE_URL}/movie/${id}/recommendations?api_key=${TMDB_API_KEY}&page=1`
    );

    if (!similarResponse.ok) {
      if (similarResponse.status === 404) {
        return res.status(404).json({ error: 'Movie not found' });
      }
      return res.status(502).json({ error: 'TMDB API error' });
    }

    const similarData = await similarResponse.json();

    // Take top 6 similar movies and fetch their details (for imdb_id and trailer)
    const similarMovies = similarData.results.slice(0, 6);

    const detailedMovies = await Promise.all(
      similarMovies.map(async (movie) => {
        try {
          const [detailsRes, videosRes] = await Promise.all([
            fetch(`${TMDB_BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}`),
            fetch(`${TMDB_BASE_URL}/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}`)
          ]);

          let imdbId = null;
          let trailerUrl = null;

          if (detailsRes.ok) {
            const details = await detailsRes.json();
            imdbId = details.imdb_id || null;
          }

          if (videosRes.ok) {
            const videosData = await videosRes.json();
            const trailer = videosData.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube' && v.official) ||
                           videosData.results?.find(v => v.type === 'Trailer' && v.site === 'YouTube') ||
                           videosData.results?.find(v => v.type === 'Teaser' && v.site === 'YouTube');
            if (trailer) {
              trailerUrl = `https://www.youtube.com/watch?v=${trailer.key}`;
            }
          }

          return {
            id: movie.id,
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : null,
            posterPath: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
            imdbId,
            trailerUrl
          };
        } catch {
          // If individual movie fetch fails, return basic info
          return {
            id: movie.id,
            title: movie.title,
            year: movie.release_date ? movie.release_date.split('-')[0] : null,
            posterPath: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
            imdbId: null,
            trailerUrl: null
          };
        }
      })
    );

    res.json(detailedMovies);
  } catch (err) {
    console.error('TMDB similar movies error:', err);
    res.status(500).json({ error: 'Failed to fetch similar movies' });
  }
});

export default router;
