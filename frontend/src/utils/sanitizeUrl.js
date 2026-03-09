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
