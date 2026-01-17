import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

export const searchMovies = async (query, limit = 10) => {
  if (!TMDB_API_KEY) {
    console.warn('TMDB_API_KEY not set, movie search disabled');
    return [];
  }

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
    );

    if (!response.ok) {
      console.error('TMDB API error:', response.status);
      return [];
    }

    const data = await response.json();

    return data.results.slice(0, limit).map(movie => ({
      id: movie.id,
      title: movie.title,
      year: movie.release_date ? movie.release_date.split('-')[0] : null,
      overview: movie.overview,
      posterPath: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
      rating: movie.vote_average,
      releaseDate: movie.release_date
    }));
  } catch (err) {
    console.error('TMDB search error:', err);
    return [];
  }
};

export const getMovieDetails = async (tmdbId) => {
  if (!TMDB_API_KEY) {
    return null;
  }

  try {
    // Fetch movie details and videos in parallel
    const [detailsResponse, videosResponse] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`),
      fetch(`${TMDB_BASE_URL}/movie/${tmdbId}/videos?api_key=${TMDB_API_KEY}`)
    ]);

    if (!detailsResponse.ok) {
      return null;
    }

    const movie = await detailsResponse.json();

    // Get trailer URL
    let trailerUrl = null;
    if (videosResponse.ok) {
      const videosData = await videosResponse.json();
      // Find official trailer, or any trailer, or teaser
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
    };
  } catch (err) {
    console.error('TMDB details error:', err);
    return null;
  }
};
