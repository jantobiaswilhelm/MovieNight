const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';

const poster = (p) => (p ? `${TMDB_IMAGE_BASE}${p}` : null);
const yearOf = (d) => (d ? parseInt(d.split('-')[0]) : null);

export const isTmdbConfigured = () => Boolean(TMDB_API_KEY);

// Full movie detail — same shape GET /api/tmdb/:id has always returned.
export const getMovieDetail = async (id) => {
  const [detailsRes, videosRes] = await Promise.all([
    fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`),
    fetch(`${TMDB_BASE_URL}/movie/${id}/videos?api_key=${TMDB_API_KEY}`)
  ]);
  if (!detailsRes.ok) {
    const err = new Error('TMDB movie fetch failed');
    err.status = detailsRes.status;
    throw err;
  }
  const movie = await detailsRes.json();
  let trailerUrl = null;
  if (videosRes.ok) {
    const v = await videosRes.json();
    const t = v.results?.find((x) => x.type === 'Trailer' && x.site === 'YouTube' && x.official) ||
              v.results?.find((x) => x.type === 'Trailer' && x.site === 'YouTube') ||
              v.results?.find((x) => x.type === 'Teaser' && x.site === 'YouTube');
    if (t) trailerUrl = `https://www.youtube.com/watch?v=${t.key}`;
  }
  return {
    id: movie.id,
    title: movie.title,
    year: yearOf(movie.release_date),
    overview: movie.overview,
    posterPath: poster(movie.poster_path),
    backdropPath: movie.backdrop_path ? `${TMDB_BACKDROP_BASE}${movie.backdrop_path}` : null,
    rating: movie.vote_average ? parseFloat(movie.vote_average.toFixed(1)) : null,
    releaseDate: movie.release_date,
    runtime: movie.runtime || null,
    genres: movie.genres?.map((g) => g.name).join(', ') || null,
    tagline: movie.tagline || null,
    imdbId: movie.imdb_id || null,
    originalLanguage: movie.original_language || null,
    collectionId: movie.belongs_to_collection?.id || null,
    collectionName: movie.belongs_to_collection?.name || null,
    trailerUrl
  };
};

// Search people (actors/directors) by name.
export const searchPeople = async (query) => {
  const res = await fetch(
    `${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`
  );
  if (!res.ok) { const e = new Error('TMDB person search failed'); e.status = res.status; throw e; }
  const data = await res.json();
  return (data.results || []).slice(0, 8).map((p) => ({
    id: p.id,
    name: p.name,
    profilePath: poster(p.profile_path),
    department: p.known_for_department || null,
    knownFor: (p.known_for || []).map((k) => k.title || k.name).filter(Boolean).slice(0, 3).join(', ')
  }));
};

// A person's movies. role='directing' → their directed films; else acting roles.
// Returns preview items (deduped, newest first).
export const getPersonMovies = async (personId, role = 'acting') => {
  const res = await fetch(`${TMDB_BASE_URL}/person/${personId}/movie_credits?api_key=${TMDB_API_KEY}`);
  if (!res.ok) { const e = new Error('TMDB person credits failed'); e.status = res.status; throw e; }
  const data = await res.json();
  const rows = role === 'directing'
    ? (data.crew || []).filter((c) => c.job === 'Director')
    : (data.cast || []);
  const seen = new Set();
  return rows
    .filter((m) => m.id && !seen.has(m.id) && seen.add(m.id))
    .filter((m) => m.release_date)                          // drop unreleased/dateless
    .sort((a, b) => (b.release_date || '').localeCompare(a.release_date || ''))
    .slice(0, 24)
    .map((m) => ({ tmdbId: m.id, title: m.title, year: yearOf(m.release_date), posterPath: poster(m.poster_path) }));
};

// The franchise/collection a movie belongs to, in release order.
export const getMovieCollection = async (movieId) => {
  const detail = await getMovieDetail(movieId);
  if (!detail.collectionId) return { name: null, parts: [] };
  const res = await fetch(`${TMDB_BASE_URL}/collection/${detail.collectionId}?api_key=${TMDB_API_KEY}`);
  if (!res.ok) { const e = new Error('TMDB collection failed'); e.status = res.status; throw e; }
  const data = await res.json();
  const parts = (data.parts || [])
    .filter((m) => m.release_date)
    .sort((a, b) => (a.release_date || '').localeCompare(b.release_date || ''))
    .map((m) => ({ tmdbId: m.id, title: m.title, year: yearOf(m.release_date), posterPath: poster(m.poster_path) }));
  return { name: data.name || detail.collectionName, parts };
};
