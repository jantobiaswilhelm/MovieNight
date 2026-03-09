export function sanitizeUrl(url) {
  if (!url) return '#';
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol)) return url;
  } catch {
    // invalid URL
  }
  return '#';
}

export function sanitizeImdbId(imdbId) {
  if (!imdbId) return null;
  return /^tt\d+$/.test(imdbId) ? imdbId : null;
}

export function sanitizeImageUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (['https:', 'http:'].includes(parsed.protocol)) return url;
  } catch {
    // invalid URL
  }
  return null;
}
