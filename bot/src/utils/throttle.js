// Per-user throttle for autocomplete TMDB searches
const lastCall = new Map();
const THROTTLE_MS = 1000;

// Clean up stale entries every 5 minutes to prevent unbounded growth
setInterval(() => {
  const now = Date.now();
  for (const [userId, timestamp] of lastCall) {
    if (now - timestamp > 60 * 1000) {
      lastCall.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref();

export function shouldThrottle(userId) {
  const now = Date.now();
  const last = lastCall.get(userId) || 0;
  if (now - last < THROTTLE_MS) return true;
  lastCall.set(userId, now);
  return false;
}
