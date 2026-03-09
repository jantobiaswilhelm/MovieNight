// Per-user throttle for autocomplete TMDB searches
const lastCall = new Map();
const THROTTLE_MS = 1000;

export function shouldThrottle(userId) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < THROTTLE_MS) return true;
  lastCall.set(userId, now);
  return false;
}
