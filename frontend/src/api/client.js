const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const GUILD_ID = import.meta.env.VITE_GUILD_ID;

const getToken = () => localStorage.getItem('token');

const clearTokens = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
};

// Single-flight refresh: if several requests 401 at once, they share one refresh
// call rather than stampeding /auth/refresh.
let refreshPromise = null;
const refreshAccessToken = () => {
  const refreshToken = localStorage.getItem('refreshToken');
  if (!refreshToken) return Promise.resolve(null);
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('refresh failed'))))
      .then((data) => {
        localStorage.setItem('token', data.token);
        if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
        return data.token;
      })
      .catch(() => {
        clearTokens();
        return null;
      })
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
};

const fetchAPI = async (endpoint, options = {}, retried = false) => {
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
    // Access token likely expired — refresh once and retry transparently.
    if (response.status === 401 && !retried && localStorage.getItem('refreshToken')) {
      const newToken = await refreshAccessToken();
      if (newToken) return fetchAPI(endpoint, options, true);
    }
    if (response.status === 401) {
      // No refresh possible — clear tokens and let AuthContext handle logout.
      clearTokens();
    }
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    const err = new Error(error.error || 'Request failed');
    err.status = response.status;
    throw err;
  }

  return response.json();
};

// Auth
export const getMe = () => fetchAPI('/auth/me');

export const getLoginUrl = () => `${API_URL}/auth/discord`;

export const exchangeAuthCode = (code) =>
  fetchAPI('/auth/exchange', {
    method: 'POST',
    body: JSON.stringify({ code })
  });

// Revoke all tokens server-side (bumps token_version). Best-effort from logout.
export const logoutRequest = () =>
  fetchAPI('/auth/logout', { method: 'POST' });

// Movies
export const getMovies = (limit = 20, offset = 0) =>
  fetchAPI(`/api/movies?guild_id=${GUILD_ID}&limit=${limit}&offset=${offset}`);

export const getMovie = (id) => fetchAPI(`/api/movies/${id}`);

export const rescheduleMovie = (id, scheduledAt) =>
  fetchAPI(`/api/movies/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ scheduled_at: scheduledAt, guild_id: GUILD_ID })
  });

// Cancel an upcoming movie night (host or admin). Bot posts a Discord note.
export const cancelMovie = (id) =>
  fetchAPI(`/api/movies/${id}?guild_id=${GUILD_ID}`, { method: 'DELETE' });

export const submitRating = (movieId, score, comment = null) =>
  fetchAPI(`/api/movies/${movieId}/ratings`, {
    method: 'POST',
    body: JSON.stringify({ score, comment })
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

export const getOnThisDay = () =>
  fetchAPI(`/api/stats/on-this-day?guild_id=${GUILD_ID}`);

export const getMyStats = () => fetchAPI('/api/stats/me');

export const getUserStats = (userId) => fetchAPI(`/api/stats/user/${userId}`);

// Suggestion board
export const getBoard = () =>
  fetchAPI(`/api/board?guild_id=${GUILD_ID}`);

export const addSuggestion = (title, imageUrl, tmdbData = null) =>
  fetchAPI(`/api/board/suggestions?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ title, image_url: imageUrl, tmdb_data: tmdbData })
  });

export const setSuggestionVote = (suggestionId, vote) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/vote?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ vote })
  });

export const clearSuggestionVote = (suggestionId) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/vote?guild_id=${GUILD_ID}`, {
    method: 'DELETE'
  });

export const announceSuggestion = (suggestionId, scheduledAt) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}/announce?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ scheduled_at: scheduledAt })
  });

export const deleteSuggestion = (suggestionId) =>
  fetchAPI(`/api/board/suggestions/${suggestionId}?guild_id=${GUILD_ID}`, {
    method: 'DELETE'
  });

// Admin
export const checkAdmin = () => fetchAPI('/api/admin/check');

export const deleteMovie = (movieId) =>
  fetchAPI(`/api/admin/movies/${movieId}`, {
    method: 'DELETE'
  });

// Admin Settings (Test Mode)
export const getGuildChannels = () =>
  fetchAPI(`/api/admin/channels?guild_id=${GUILD_ID}`);

export const getGuildSettings = () =>
  fetchAPI(`/api/admin/settings?guild_id=${GUILD_ID}`);

export const updateGuildSettings = (settings) =>
  fetchAPI('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify({ guild_id: GUILD_ID, ...settings })
  });

export const deleteTestMovies = () =>
  fetchAPI(`/api/admin/test-movies?guild_id=${GUILD_ID}`, {
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

export const searchTMDBPerson = (query) =>
  fetchAPI(`/api/tmdb/person?query=${encodeURIComponent(query)}`);

export const getPersonMovies = (personId, role = 'acting') =>
  fetchAPI(`/api/tmdb/person/${personId}/movies?role=${role}`);

export const getMovieCollection = (tmdbId) =>
  fetchAPI(`/api/tmdb/${tmdbId}/collection`);

export const getSimilarMovies = (tmdbId) =>
  fetchAPI(`/api/tmdb/${tmdbId}/similar`);

export const getMovieCredits = (tmdbId) =>
  fetchAPI(`/api/tmdb/${tmdbId}/credits`);

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

// Random Comments for homepage ticker
export const getRandomComments = (limit = 10) =>
  fetchAPI(`/api/stats/comments/random?guild_id=${GUILD_ID}&limit=${limit}`);

// Personal Movies
export const getPersonalMovies = (sort = 'newest') =>
  fetchAPI(`/api/personal-movies?sort=${sort}`);

export const addPersonalMovie = (data) =>
  fetchAPI('/api/personal-movies', {
    method: 'POST',
    body: JSON.stringify(data)
  });

export const updatePersonalMovie = (id, data) =>
  fetchAPI(`/api/personal-movies/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

export const deletePersonalMovie = (id) =>
  fetchAPI(`/api/personal-movies/${id}`, {
    method: 'DELETE'
  });

export const importLetterboxd = async (files) => {
  const token = localStorage.getItem('token');
  const formData = new FormData();

  if (files.ratings) formData.append('ratings', files.ratings);
  if (files.diary) formData.append('diary', files.diary);
  if (files.reviews) formData.append('reviews', files.reviews);

  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
  const response = await fetch(`${API_URL}/api/personal-movies/import/letterboxd`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Import failed' }));
    throw new Error(error.error || 'Import failed');
  }

  return response.json();
};

// ============================================
// RATING REACTIONS
// ============================================

export const addReaction = (ratingId, emoji) =>
  fetchAPI(`/api/ratings/${ratingId}/reactions`, {
    method: 'POST',
    body: JSON.stringify({ emoji })
  });

export const removeReaction = (ratingId, emoji) =>
  fetchAPI(`/api/ratings/${ratingId}/reactions/${encodeURIComponent(emoji)}`, {
    method: 'DELETE'
  });

export const getReactions = (ratingId) =>
  fetchAPI(`/api/ratings/${ratingId}/reactions`);

// ============================================
// COLLECTIONS
// ============================================

export const getCollections = () =>
  fetchAPI(`/api/collections?guild_id=${GUILD_ID}`);

export const getCollectionMovies = (collectionName) =>
  fetchAPI(`/api/collections/${encodeURIComponent(collectionName)}?guild_id=${GUILD_ID}`);

// ============================================
// CUSTOM LISTS
// ============================================

export const getMyLists = () =>
  fetchAPI('/api/lists/me');

export const getPublicLists = () =>
  fetchAPI(`/api/lists/public?guild_id=${GUILD_ID}`);

export const createList = (name, description, isPublic = true) =>
  fetchAPI('/api/lists', {
    method: 'POST',
    body: JSON.stringify({ name, description, is_public: isPublic, guild_id: GUILD_ID })
  });

export const getList = (listId) =>
  fetchAPI(`/api/lists/${listId}`);

export const updateList = (listId, data) =>
  fetchAPI(`/api/lists/${listId}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });

export const deleteList = (listId) =>
  fetchAPI(`/api/lists/${listId}`, {
    method: 'DELETE'
  });

export const addListItem = (listId, item) =>
  fetchAPI(`/api/lists/${listId}/items`, {
    method: 'POST',
    body: JSON.stringify(item)
  });

export const removeListItem = (listId, itemId) =>
  fetchAPI(`/api/lists/${listId}/items/${itemId}`, {
    method: 'DELETE'
  });

// ============================================
// ACHIEVEMENTS
// ============================================

export const getAllAchievements = () =>
  fetchAPI('/api/achievements');

export const getMyAchievements = () =>
  fetchAPI(`/api/achievements/me?guild_id=${GUILD_ID}`);

export const getUserAchievements = (userId) =>
  fetchAPI(`/api/achievements/user/${userId}`);

// ============================================
// NOTIFICATIONS
// ============================================

export const getNotifications = (limit = 20, offset = 0) =>
  fetchAPI(`/api/notifications?limit=${limit}&offset=${offset}`);

export const getUnreadNotificationCount = () =>
  fetchAPI('/api/notifications/unread/count');

export const markNotificationRead = (notificationId) =>
  fetchAPI(`/api/notifications/${notificationId}/read`, {
    method: 'PUT'
  });

export const markAllNotificationsRead = () =>
  fetchAPI('/api/notifications/read-all', {
    method: 'PUT'
  });

// ============================================
// SOCIAL - FOLLOWS
// ============================================

export const getMyFollowers = () =>
  fetchAPI('/api/social/followers');

export const getMyFollowing = () =>
  fetchAPI('/api/social/following');

export const followUser = (userId) =>
  fetchAPI(`/api/social/follow/${userId}`, {
    method: 'POST'
  });

export const unfollowUser = (userId) =>
  fetchAPI(`/api/social/follow/${userId}`, {
    method: 'DELETE'
  });

export const getFollowStatus = (userId) =>
  fetchAPI(`/api/social/following/${userId}`);

// ============================================
// SOCIAL - ACTIVITY FEED
// ============================================

export const getActivityFeed = (limit = 20, offset = 0) =>
  fetchAPI(`/api/social/feed?guild_id=${GUILD_ID}&limit=${limit}&offset=${offset}`);

export const getUserActivity = (userId, limit = 20) =>
  fetchAPI(`/api/social/activity/${userId}?limit=${limit}`);

// ============================================
// SOCIAL - SHARED WISHLISTS
// ============================================

export const getSharedWishlists = () =>
  fetchAPI(`/api/social/wishlists?guild_id=${GUILD_ID}`);

export const createSharedWishlist = (name, description, isCollaborative = false) =>
  fetchAPI('/api/social/wishlists', {
    method: 'POST',
    body: JSON.stringify({ name, description, is_collaborative: isCollaborative, guild_id: GUILD_ID })
  });

export const getSharedWishlist = (wishlistId) =>
  fetchAPI(`/api/social/wishlists/${wishlistId}`);

export const addSharedWishlistItem = (wishlistId, item) =>
  fetchAPI(`/api/social/wishlists/${wishlistId}/items`, {
    method: 'POST',
    body: JSON.stringify(item)
  });

export const removeSharedWishlistItem = (wishlistId, itemId) =>
  fetchAPI(`/api/social/wishlists/${wishlistId}/items/${itemId}`, {
    method: 'DELETE'
  });

export const addSharedWishlistMember = (wishlistId, userId, canEdit = false) =>
  fetchAPI(`/api/social/wishlists/${wishlistId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, can_edit: canEdit })
  });

export const removeSharedWishlistMember = (wishlistId, userId) =>
  fetchAPI(`/api/social/wishlists/${wishlistId}/members/${userId}`, {
    method: 'DELETE'
  });

// ── Marathons ──────────────────────────────────────────────────────────────
export const getMarathons = () =>
  fetchAPI(`/api/marathons?guild_id=${GUILD_ID}`);

export const getMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}?guild_id=${GUILD_ID}`);

export const createMarathon = (name, description) =>
  fetchAPI(`/api/marathons?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ name, description })
  });

export const addMarathonItem = (id, tmdbData) =>
  fetchAPI(`/api/marathons/${id}/items?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ tmdb_data: tmdbData })
  });

export const removeMarathonItem = (id, itemId) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}?guild_id=${GUILD_ID}`, { method: 'DELETE' });

export const reorderMarathonItems = (id, itemIds) =>
  fetchAPI(`/api/marathons/${id}/reorder?guild_id=${GUILD_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ item_ids: itemIds })
  });

export const updateMarathonItemDate = (id, itemId, scheduledAt) =>
  fetchAPI(`/api/marathons/${id}/items/${itemId}?guild_id=${GUILD_ID}`, {
    method: 'PUT',
    body: JSON.stringify({ scheduled_at: scheduledAt })
  });

export const launchMarathon = (id, cadenceType, items) =>
  fetchAPI(`/api/marathons/${id}/launch?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ cadence_type: cadenceType, items })
  });

export const pauseMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}/pause?guild_id=${GUILD_ID}`, { method: 'POST' });

export const resumeMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}/resume?guild_id=${GUILD_ID}`, { method: 'POST' });

export const deleteMarathon = (id) =>
  fetchAPI(`/api/marathons/${id}?guild_id=${GUILD_ID}`, { method: 'DELETE' });

export const bulkAddMarathonItems = (id, tmdbIds) =>
  fetchAPI(`/api/marathons/${id}/items/bulk?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ tmdb_ids: tmdbIds })
  });

export const getCurateStatus = () =>
  fetchAPI(`/api/marathons/curate?guild_id=${GUILD_ID}`);

export const curateMarathon = (prompt) =>
  fetchAPI(`/api/marathons/curate?guild_id=${GUILD_ID}`, {
    method: 'POST',
    body: JSON.stringify({ prompt })
  });
