const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const GUILD_ID = import.meta.env.VITE_GUILD_ID;

const getToken = () => localStorage.getItem('token');

const fetchAPI = async (endpoint, options = {}) => {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
};

// Auth
export const getMe = () => fetchAPI('/auth/me');

export const getLoginUrl = () => `${API_URL}/auth/discord`;

// Movies
export const getMovies = (limit = 20, offset = 0) =>
  fetchAPI(`/api/movies?guild_id=${GUILD_ID}&limit=${limit}&offset=${offset}`);

export const getMovie = (id) => fetchAPI(`/api/movies/${id}`);

export const submitRating = (movieId, score) =>
  fetchAPI(`/api/movies/${movieId}/ratings`, {
    method: 'POST',
    body: JSON.stringify({ score })
  });

export const getMyRating = (movieId) =>
  fetchAPI(`/api/movies/${movieId}/ratings/me`);

// Ratings
export const getMyRatings = (limit = 20) =>
  fetchAPI(`/api/ratings/me?limit=${limit}`);

export const getUserRatings = (userId, limit = 20) =>
  fetchAPI(`/api/ratings/user/${userId}?limit=${limit}`);

// Stats
export const getStats = (month = null) => {
  const params = new URLSearchParams({ guild_id: GUILD_ID });
  if (month) params.append('month', month);
  return fetchAPI(`/api/stats?${params}`);
};

export const getMyStats = () => fetchAPI('/api/stats/me');

export const getUserStats = (userId) => fetchAPI(`/api/stats/user/${userId}`);

// Voting
export const getActiveVoting = () =>
  fetchAPI(`/api/voting/active?guild_id=${GUILD_ID}`);

export const createVotingSession = (scheduledAt) =>
  fetchAPI('/api/voting', {
    method: 'POST',
    body: JSON.stringify({ scheduled_at: scheduledAt, guild_id: GUILD_ID })
  });

export const closeVotingSession = (sessionId, createMovie = true) =>
  fetchAPI(`/api/voting/${sessionId}/close`, {
    method: 'POST',
    body: JSON.stringify({ create_movie: createMovie })
  });

export const deleteVotingSession = (sessionId) =>
  fetchAPI(`/api/voting/${sessionId}`, {
    method: 'DELETE'
  });

export const submitSuggestion = (sessionId, title, imageUrl, tmdbData = null) =>
  fetchAPI(`/api/voting/${sessionId}/suggestions`, {
    method: 'POST',
    body: JSON.stringify({ title, image_url: imageUrl, tmdb_data: tmdbData })
  });

export const castVote = (suggestionId) =>
  fetchAPI(`/api/voting/suggestions/${suggestionId}/vote`, {
    method: 'POST'
  });

export const removeVote = (suggestionId) =>
  fetchAPI(`/api/voting/suggestions/${suggestionId}/vote`, {
    method: 'DELETE'
  });

// Admin
export const checkAdmin = () => fetchAPI('/api/admin/check');

export const deleteMovie = (movieId) =>
  fetchAPI(`/api/admin/movies/${movieId}`, {
    method: 'DELETE'
  });

export const deleteSuggestion = (suggestionId) =>
  fetchAPI(`/api/admin/suggestions/${suggestionId}`, {
    method: 'DELETE'
  });

// Wishlists
export const getMyWishlist = (sort = 'importance') =>
  fetchAPI(`/api/wishlists/me?guild_id=${GUILD_ID}&sort=${sort}`);

export const getGuildWishlist = (sort = 'importance') =>
  fetchAPI(`/api/wishlists/guild?guild_id=${GUILD_ID}&sort=${sort}`);

export const addToWishlist = (movieData) =>
  fetchAPI('/api/wishlists', {
    method: 'POST',
    body: JSON.stringify({ ...movieData, guild_id: GUILD_ID })
  });

export const updateWishlistImportance = (id, importance) =>
  fetchAPI(`/api/wishlists/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ importance })
  });

export const removeFromWishlist = (id) =>
  fetchAPI(`/api/wishlists/${id}`, {
    method: 'DELETE'
  });

// TMDB
export const searchTMDB = (query) =>
  fetchAPI(`/api/tmdb/search?query=${encodeURIComponent(query)}`);

export const getTMDBMovie = (id) =>
  fetchAPI(`/api/tmdb/${id}`);

export const getSimilarMovies = (tmdbId) =>
  fetchAPI(`/api/tmdb/${tmdbId}/similar`);

// Announce from wishlist
export const announceFromWishlist = (wishlistId, scheduledAt) =>
  fetchAPI('/api/wishlists/announce', {
    method: 'POST',
    body: JSON.stringify({ wishlist_id: wishlistId, scheduled_at: scheduledAt })
  });

// Direct movie announcement
export const announceMovie = (tmdbData, scheduledAt) =>
  fetchAPI('/api/movies/announce', {
    method: 'POST',
    body: JSON.stringify({ tmdb_data: tmdbData, scheduled_at: scheduledAt, guild_id: GUILD_ID })
  });

// Attendance
export const toggleAttendance = (movieId) =>
  fetchAPI(`/api/movies/${movieId}/attend`, {
    method: 'POST'
  });

export const getNextMovieWithAttendees = () =>
  fetchAPI(`/api/movies/next/with-attendees?guild_id=${GUILD_ID}`);

export const getUpcomingMoviesWithAttendees = (limit = 10) =>
  fetchAPI(`/api/movies/upcoming/with-attendees?guild_id=${GUILD_ID}&limit=${limit}`);

// Profile
export const getMyProfileStats = () =>
  fetchAPI(`/api/stats/me/profile?guild_id=${GUILD_ID}`);

export const getUserProfileStats = (userId) =>
  fetchAPI(`/api/stats/user/${userId}/profile?guild_id=${GUILD_ID}`);

export const getMyFavoriteMovies = () =>
  fetchAPI('/api/stats/me/favorites');

export const setFavoriteMovie = (position, movieData) =>
  fetchAPI('/api/stats/me/favorites', {
    method: 'POST',
    body: JSON.stringify({ position, ...movieData })
  });

export const removeFavoriteMovie = (position) =>
  fetchAPI(`/api/stats/me/favorites/${position}`, {
    method: 'DELETE'
  });

export const getMyRatedMoviesForFavorites = () =>
  fetchAPI('/api/stats/me/rated-movies');

// Guild Users
export const getGuildUsers = () =>
  fetchAPI(`/api/stats/users?guild_id=${GUILD_ID}`);
