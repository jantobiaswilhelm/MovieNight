/**
 * Format a date string for display.
 * @param {string} dateStr
 * @param {'long'|'short'} variant - 'long' includes weekday + time, 'short' is compact
 */
export function formatDate(dateStr, variant = 'short') {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (variant === 'long') {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  }
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format minutes into a human-readable runtime string.
 */
export function formatRuntime(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * Get full language name from ISO 639-1 code.
 */
export function getLanguageName(code) {
  const languages = {
    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
    ja: 'Japanese', ko: 'Korean', zh: 'Chinese', pt: 'Portuguese', ru: 'Russian',
    hi: 'Hindi', ar: 'Arabic', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian',
    da: 'Danish', fi: 'Finnish', pl: 'Polish', tr: 'Turkish', th: 'Thai'
  };
  return languages[code] || code?.toUpperCase();
}

/**
 * Get Discord avatar URL for a user.
 * Returns the CDN URL if avatar exists, default avatar otherwise, or null.
 */
export function getAvatarUrl(discordId, avatar) {
  if (!discordId) return null;
  if (avatar) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${parseInt(discordId) % 5}.png`;
}
