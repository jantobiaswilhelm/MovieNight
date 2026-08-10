import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Announcement embed colors, keyed to lifecycle state.
const COLOR_SCHEDULED = 0x5865F2; // blurple — matches the rest of the bot
const COLOR_STARTED = 0x57F287;   // green — matches createStartingNowEmbed
const COLOR_CANCELLED = 0x99AAB5; // grey

const OVERVIEW_MAX = 300;
const ATTENDEE_MAX = 15;

// movie_nights.title already carries "(YYYY)" (see announce.js), while
// release_year holds the same value separately. Rendering both duplicates it,
// so pull the year out of the title when it's there and prefer that.
// Only a bare 4-digit group counts, so "Blade Runner (Final Cut)" survives.
const YEAR_SUFFIX = /\s*\((\d{4})\)\s*$/;

export const splitTitleYear = (title, releaseYear) => {
  const match = title?.match(YEAR_SUFFIX);
  if (match) {
    return { name: title.replace(YEAR_SUFFIX, '').trim(), year: parseInt(match[1], 10) };
  }
  return { name: title ?? '', year: releaseYear ?? null };
};

export const formatRuntime = (minutes) => {
  if (!minutes || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
};

export const truncateOverview = (text, max = OVERVIEW_MAX) => {
  const clean = text?.trim();
  if (!clean) return null;
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.replace(/[.,;:!?]$/, '')}…`;
};

export const formatAttendees = (attendees = []) => {
  if (attendees.length === 0) return 'Nobody yet — be the first';
  const names = attendees.map((a) => a.username);
  if (names.length <= ATTENDEE_MAX) return names.join(' · ');
  const shown = names.slice(0, ATTENDEE_MAX).join(' · ');
  return `${shown} **+${names.length - ATTENDEE_MAX} more**`;
};
