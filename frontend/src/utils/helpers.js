/**
 * Format a date string for display.
 * @param {string} dateStr
 * @param {'long'|'short'|'time'} variant - 'long' includes weekday + time,
 *   'short' is compact, 'time' is the clock time alone
 */
export function formatDate(dateStr, variant = 'short') {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (variant === 'time') {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
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
 * Handles days for large values.
 */
export function formatRuntime(minutes) {
  if (!minutes) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Format minutes into watchtime string (alias for formatRuntime with '0h' default).
 */
export function formatWatchtime(minutes) {
  if (!minutes) return '0h';
  return formatRuntime(minutes);
}

/**
 * Format a YYYY-MM month string to "Month Year".
 */
export function formatMonth(monthStr) {
  if (!monthStr) return 'This Month';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Format a Date object to "Month Year".
 */
export function formatMonthYear(date) {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Format a date string to a relative time string (e.g., "5 minutes ago").
 */
export function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
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
