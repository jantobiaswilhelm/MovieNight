import fetch from 'node-fetch';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

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
    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}`
    );

    if (!response.ok) {
      return null;
    }

    const movie = await response.json();

    return {
      id: movie.id,
      title: movie.title,
      year: movie.release_date ? movie.release_date.split('-')[0] : null,
      overview: movie.overview,
      posterPath: movie.poster_path ? `${TMDB_IMAGE_BASE}${movie.poster_path}` : null,
      rating: movie.vote_average,
      releaseDate: movie.release_date,
      runtime: movie.runtime,
      genres: movie.genres?.map(g => g.name) || []
    };
  } catch (err) {
    console.error('TMDB details error:', err);
    return null;
  }
};
