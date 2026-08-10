import { EmbedBuilder } from 'discord.js';
import { splitTitleYear, formatRuntime } from './announcementEmbed.js';
import { createRatingButtons } from './embeds.js';

// Lifecycle colors: green while playing, yellow while rating is open, gold once
// the verdict is in. The gold matches the marathon mockup palette.
const COLOR_PLAYING = 0x57F287;
const COLOR_RATING = 0xFEE75C;
const COLOR_SETTLED = 0xE0A23A;

const METER_BLOCKS = 10;
const RATER_MAX = 15;
const COMMENT_MAX = 120;
const SETTLE_AFTER_MS = 24 * 60 * 60 * 1000;

// A 10-block bar so the score has a shape you read before the number.
export const ratingMeter = (avg) => {
  const n = Number(avg);
  const safe = Number.isFinite(n) ? n : 0;
  const filled = Math.max(0, Math.min(METER_BLOCKS, Math.round(safe)));
  return '█'.repeat(filled) + '░'.repeat(METER_BLOCKS - filled);
};

// pg hands back DECIMAL as a string. 8.0 reads better as "8"; 7.5 must keep
// its half.
export const formatScore = (score) => {
  const n = Number(score);
  if (score === null || score === undefined || score === '' || !Number.isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export const averageScore = (ratings = []) => {
  if (ratings.length === 0) return null;
  return ratings.reduce((sum, r) => sum + Number(r.score), 0) / ratings.length;
};

// State is derived, never stored: no prompt yet = playing, recent prompt =
// rating, old prompt = settled.
export const screeningState = (row, now = Date.now()) => {
  if (!row?.rating_prompt_sent_at) return 'playing';
  const opened = new Date(row.rating_prompt_sent_at).getTime();
  return now - opened >= SETTLE_AFTER_MS ? 'settled' : 'rating';
};

export const tmdbComparison = (ourAvg, tmdbRating) => {
  if (ourAvg === null || ourAvg === undefined || !tmdbRating) return null;
  const theirs = Number(tmdbRating);
  const ours = Number(ourAvg);
  if (!Number.isFinite(theirs) || !Number.isFinite(ours)) return null;
  const diff = ours - theirs;
  const verdict = Math.abs(diff) < 0.2
    ? 'dead on'
    : diff > 0 ? 'we liked it more' : 'we liked it less';
  return `TMDB says ${theirs.toFixed(1)} — ${verdict}`;
};

export const formatRaters = (ratings = []) => {
  if (ratings.length === 0) return "Nobody's rated yet";
  const parts = ratings.map((r) => `${r.username} ${formatScore(r.score)}`);
  if (parts.length <= RATER_MAX) return parts.join(' · ');
  const shown = parts.slice(0, RATER_MAX).join(' · ');
  return `${shown} **+${parts.length - RATER_MAX} more**`;
};
