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

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
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
  fetchAPI(`/api/ratings/${ratingId}/reactions/${emoji}`, {
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
