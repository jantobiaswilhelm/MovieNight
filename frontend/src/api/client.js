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

export const submitSuggestion = (sessionId, title, imageUrl) =>
  fetchAPI(`/api/voting/${sessionId}/suggestions`, {
    method: 'POST',
    body: JSON.stringify({ title, image_url: imageUrl })
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
