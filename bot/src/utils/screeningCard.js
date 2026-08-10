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

/**
 * Render the screening card for one of three states. Pure — no database, no
 * Discord client. One message carries all three over the course of a night.
 *
 * @param {object} view - see toScreeningView for the shape
 */
export const buildScreeningCard = (view) => {
  const {
    title, releaseYear, imageUrl, backdropUrl, runtime, startedAt,
    tmdbRating, state, ratings = [], attendees = [], attendeeCount = 0
  } = view;

  const { name, year } = splitTitleYear(title, releaseYear);
  const heading = year ? `${name} (${year})` : name;

  const author = state === 'playing'
    ? '🔴 NOW PLAYING'
    : state === 'rating' ? '⭐ RATE IT' : '🏆 THE VERDICT';

  const color = state === 'playing'
    ? COLOR_PLAYING
    : state === 'rating' ? COLOR_RATING : COLOR_SETTLED;

  const embed = new EmbedBuilder()
    .setAuthor({ name: author })
    .setTitle(heading)
    .setColor(color)
    .setTimestamp();

  const parts = [];

  if (state === 'playing') {
    const runtimeText = formatRuntime(runtime);
    if (runtimeText) {
      const endTs = Math.floor((new Date(startedAt).getTime() + runtime * 60_000) / 1000);
      parts.push(`${runtimeText} · ends ~<t:${endTs}:t>`);
    }
    if (attendees.length) {
      parts.push(`🎟 ${attendees.map((a) => a.username).join(' · ')}`);
    }
    parts.push('Rating opens when the credits roll');
  } else {
    const avg = averageScore(ratings);

    if (avg === null) {
      parts.push(`${ratingMeter(0)}  Nobody's rated yet`);
    } else if (state === 'settled') {
      parts.push(`${ratingMeter(avg)}  **${formatScore(avg.toFixed(1))}/10** · ${ratings.length} of us`);
    } else {
      const denominator = attendeeCount > 0 ? ` of ${attendeeCount}` : '';
      parts.push(`${ratingMeter(avg)}  **${formatScore(avg.toFixed(1))}** · ${ratings.length}${denominator} rated`);
    }

    if (state === 'settled') {
      // High and low only say something when there's a spread and enough
      // voters for it to mean anything.
      if (ratings.length >= 3) {
        const sorted = [...ratings].sort((a, b) => Number(b.score) - Number(a.score));
        const high = sorted[0];
        const low = sorted[sorted.length - 1];
        if (Number(high.score) !== Number(low.score)) {
          parts.push(`▲ ${high.username} ${formatScore(high.score)}          ▼ ${low.username} ${formatScore(low.score)}`);
        }
      }
      const comparison = tmdbComparison(avg, tmdbRating);
      if (comparison) parts.push(comparison);
    } else {
      parts.push(formatRaters(ratings));
    }

    const commented = ratings.filter((r) => r.comment?.trim());
    if (commented.length) {
      const { comment, username } = commented[0];
      const text = comment.trim();
      const shown = text.length > COMMENT_MAX ? `${text.slice(0, COMMENT_MAX - 1)}…` : text;
      parts.push(`"${shown}" — ${username}`);
    }
  }

  embed.setDescription(parts.join('\n\n'));

  if (imageUrl) embed.setThumbnail(imageUrl);
  // The backdrop is the reward for a finished night — verdict state only.
  if (state === 'settled' && backdropUrl) embed.setImage(backdropUrl);

  return embed;
};

/**
 * Rating buttons, or [] while the movie is still playing. They stay live in the
 * settled state on purpose — someone who missed the night can still rate.
 */
export const buildScreeningComponents = (view) => {
  if (view.state === 'playing') return [];
  return createRatingButtons(view.id);
};

/**
 * Map a movie_nights row (plus its ratings and attendees) to a card view.
 * `attendee_count` arrives from pg's COUNT as a string.
 */
export const toScreeningView = (row, extras = {}) => ({
  id: row.id,
  title: row.title,
  releaseYear: row.release_year ?? null,
  imageUrl: row.image_url ?? null,
  backdropUrl: row.backdrop_url ?? null,
  runtime: row.runtime ?? null,
  startedAt: row.started_at ?? null,
  tmdbRating: row.tmdb_rating ?? null,
  state: extras.state ?? screeningState(row),
  ratings: extras.ratings ?? [],
  attendees: extras.attendees ?? [],
  attendeeCount: Number(extras.attendeeCount ?? row.attendee_count ?? 0)
});
