import { splitTitleYear } from '../../utils/helpers';
import { sanitizeImageUrl, sanitizeUrl } from '../../utils/sanitizeUrl';

/**
 * The screening drawer speaks one film shape, whatever it was opened from.
 * These map the two shapes the app has: TMDB details (camelCase, from
 * /api/tmdb/:id) and database rows (snake_case: movie nights, board
 * suggestions, wishlist items).
 */

export const filmFromTmdb = (m) => ({
  title: m.title,
  year: m.releaseYear || m.year || null,
  posterUrl: sanitizeImageUrl(m.posterPath),
  backdropUrl: sanitizeImageUrl(m.backdropPath),
  overview: m.overview || null,
  tagline: m.tagline || null,
  runtime: m.runtime || null,
  rating: m.rating || null,
  genres: m.genres || null,
  trailerUrl: sanitizeUrl(m.trailerUrl),
  tmdbId: m.id || null,
  imdbId: m.imdbId || null,
});

export const filmFromRow = (r) => {
  const { name, year } = splitTitleYear(r.title, r.release_year);
  return {
    title: name,
    year,
    posterUrl: sanitizeImageUrl(r.image_url),
    backdropUrl: sanitizeImageUrl(r.backdrop_url),
    overview: r.description || null,
    tagline: r.tagline || null,
    runtime: r.runtime || null,
    rating: r.tmdb_rating || null,
    genres: r.genres || null,
    trailerUrl: sanitizeUrl(r.trailer_url),
    tmdbId: r.tmdb_id || null,
    imdbId: r.imdb_id || null,
  };
};
