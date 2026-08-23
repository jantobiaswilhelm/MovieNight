import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { splitTitleYear } from './announcementEmbed.js';
import { ratingMeter } from './screeningCard.js';
import { buildId } from './customId.js';

// The four commands that predate the bot's current look: /history, /stats,
// /myratings and /top10. Same data they always showed, in the shape /next and
// the screening cards established — a meter you read before the number, a
// poster, and timestamps the reader sees in their own timezone.

const COLOR = 0x5865F2;
const COLOR_GOLD = 0xE0A23A;

// Discord rejects a description over this. Every builder here that renders a
// list the user controls the length of has to budget against it rather than
// trust a page size — one pathological comment can blow a page on its own.
export const DESCRIPTION_LIMIT = 4096;
const DESCRIPTION_BUDGET = 3900;

export const HISTORY_PAGE_SIZE = 5;

const unixSeconds = (value) => Math.floor(new Date(value).getTime() / 1000);

/**
 * Only hand discord.js something it will accept as an image.
 *
 * setThumbnail/setImage validate their argument and throw, which would take the
 * whole command down over one bad row. Poster URLs come from TMDB today, but
 * they are stored as plain text and reach the database through the web API too,
 * so a malformed one is a data problem, not an impossibility. A missing
 * thumbnail is a far better outcome than a command that won't render.
 */
export const safeImageUrl = (url) => {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};

export const formatWatchTime = (minutes) => {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (!hours) return `${mins}m`;
  return mins ? `${hours}h ${mins}m` : `${hours}h`;
};

export const pageCountFor = (totalRows, pageSize) => {
  const total = Math.max(0, Number(totalRows) || 0);
  const size = Math.max(1, Number(pageSize) || 1);
  return Math.max(1, Math.ceil(total / size));
};

/**
 * Join list entries until the budget runs out, then say what was dropped.
 *
 * A page size bounds the row count, not the character count — a single long
 * comment can still overflow. This is the backstop that keeps the embed
 * renderable no matter what someone typed.
 */
export const fitEntries = (entries, budget = DESCRIPTION_BUDGET) => {
  const kept = [];
  let used = 0;

  for (const entry of entries) {
    const cost = entry.length + 2;
    if (used + cost > budget) break;
    kept.push(entry);
    used += cost;
  }

  const dropped = entries.length - kept.length;
  if (dropped > 0) kept.push(`_…and ${dropped} more that wouldn't fit_`);
  return kept.join('\n\n');
};

/**
 * Newer/Older buttons for a paged view.
 *
 * Both stay visible at the edges of the range and go disabled instead of
 * disappearing, so the embed doesn't change height as you page through it.
 * `extra` rides along in the id — that is how a sort survives a page turn.
 */
export const buildPagerButtons = (view, page, pageCount, extra = []) => {
  const previous = Math.max(1, page - 1);
  const next = Math.min(pageCount, page + 1);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId(view, previous, ...extra))
      .setLabel('Newer')
      .setEmoji('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(buildId(view, next, ...extra))
      .setLabel('Older')
      .setEmoji('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount)
  );

  return [row];
};

const scoreLine = (avgRating, ratingCount) => {
  const score = Number(avgRating);
  if (!Number.isFinite(score) || !ratingCount) return '_not rated_';
  const shown = Number.isInteger(score) ? String(score) : score.toFixed(1);
  const votes = ratingCount === 1 ? '1 vote' : `${ratingCount} votes`;
  return `${ratingMeter(score)} **${shown}** · ${votes}`;
};

export const buildHistoryEmbed = (nights, { page = 1, pageCount = 1, pageSize = HISTORY_PAGE_SIZE, watchMinutes = null } = {}) => {
  const embed = new EmbedBuilder()
    .setTitle('🎭 Movie Night History')
    .setColor(COLOR);

  if (!nights.length) {
    embed.setDescription('No movie nights yet — nothing to look back on.');
    return embed;
  }

  const firstIndex = (page - 1) * pageSize;
  const entries = nights.map((night, index) => {
    const { name, year } = splitTitleYear(night.title, night.release_year);
    const stamp = unixSeconds(night.scheduled_at);
    const attended = night.attendee_count > 0
      ? ` · ${night.attendee_count} attended`
      : '';

    return [
      `**${firstIndex + index + 1}. ${name}**${year ? ` (${year})` : ''}`,
      `${scoreLine(night.avg_rating, night.rating_count)}${attended}`,
      `<t:${stamp}:D>`
    ].join('\n');
  });

  embed.setDescription(fitEntries(entries));

  const poster = nights.map((night) => safeImageUrl(night.image_url)).find(Boolean);
  if (poster) embed.setThumbnail(poster);

  const total = nights[0]?.total_count ?? nights.length;
  const parts = [`Page ${page} of ${pageCount}`, `${total} nights`];
  if (watchMinutes !== null) parts.push(`${formatWatchTime(watchMinutes)} watched together`);
  embed.setFooter({ text: parts.join(' · ') });

  return embed;
};

// ── /stats ──────────────────────────────────────────────────────────────────

const RANGES = [
  { key: 'all', label: 'All time', emoji: '🗓️' },
  { key: 'month', label: 'This month', emoji: '📅' },
  { key: 'year', label: 'This year', emoji: '📆' }
];

export const rangeLabel = (range) =>
  RANGES.find((r) => r.key === range)?.label ?? 'All time';

/**
 * The lower bound for a range, or null for "everything".
 *
 * Takes `now` rather than reading the clock so the boundaries are testable, and
 * returns a local-midnight Date — the column is a naive TIMESTAMP, so the
 * comparison happens in whatever zone the database and bot share.
 */
export const sinceForRange = (range, now = new Date()) => {
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === 'year') return new Date(now.getFullYear(), 0, 1);
  return null;
};

export const buildRangeButtons = (current) => {
  const row = new ActionRowBuilder().addComponents(
    RANGES.map((range) => new ButtonBuilder()
      .setCustomId(buildId('stats', range.key))
      .setLabel(range.label)
      .setEmoji(range.emoji)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(range.key === current))
  );
  return [row];
};

const MEDALS = ['🥇', '🥈', '🥉'];

export const buildStatsEmbed = ({ stats, topMovies = [], topRaters = [], watchMinutes = 0, regulars = 0, range = 'all' } = {}) => {
  const embed = new EmbedBuilder()
    .setTitle('📊 Movie Night Stats')
    .setColor(COLOR);

  const sections = [
    [
      `🎬 **${stats.total_movies}** nights`,
      `⭐ **${stats.total_ratings}** ratings`,
      `📈 **${stats.overall_avg_rating}** average`,
      `⏱️ **${formatWatchTime(watchMinutes)}** watched`,
      `👥 **${regulars}** regulars`
    ].join('  ·  ')
  ];

  if (topMovies.length) {
    const rows = topMovies.map((movie, index) => {
      const { name, year } = splitTitleYear(movie.title, movie.release_year);
      const medal = MEDALS[index] ?? `**${index + 1}.**`;
      const score = Number(movie.avg_rating);
      return `${medal} **${name}**${year ? ` (${year})` : ''}\n${ratingMeter(score)} ${score.toFixed(1)} · ${movie.rating_count} votes`;
    });
    sections.push(['**🏆 Best rated**', ...rows].join('\n'));
  } else {
    sections.push('**🏆 Best rated**\n_Nothing rated yet._');
  }

  if (topRaters.length) {
    const rows = topRaters.map((rater) => {
      const attended = rater.attended_count > 0 ? ` · ${rater.attended_count} nights` : '';
      return `**${rater.username}** — ${rater.rating_count} ratings · avg ${rater.avg_rating}${attended}`;
    });
    sections.push(['**🎙️ Most active**', ...rows].join('\n'));
  }

  embed.setDescription(sections.join('\n\n'));
  embed.setFooter({ text: rangeLabel(range) });

  const backdrop = topMovies.map((movie) => safeImageUrl(movie.backdrop_url)).find(Boolean);
  if (backdrop) embed.setImage(backdrop);

  return embed;
};

// ── /myratings ──────────────────────────────────────────────────────────────

// Eight rows leaves headroom for eight comments inside the description budget.
// The budget is still enforced on top of it — a page size bounds how many rows
// there are, not how long any one of them is.
export const MY_RATINGS_PAGE_SIZE = 8;

const COMMENT_MAX = 140;

export const SORTS = [
  { key: 'recent', label: 'Most recent first', emoji: '🕒' },
  { key: 'score', label: 'Highest rated first', emoji: '⭐' }
];

export const buildSortSelect = (view, page, current) => {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildId(view, page))
    .setPlaceholder('Sort…')
    .addOptions(SORTS.map((sort) => ({
      label: sort.label,
      value: sort.key,
      emoji: sort.emoji,
      default: sort.key === current
    })));

  return [new ActionRowBuilder().addComponents(menu)];
};

// Number(null) is 0 and Number('') is 0, so an absent average would otherwise
// render as a room that scored the film zero. Absence has to be checked before
// coercion, not after it.
const toScore = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatScore = (value) => {
  const n = toScore(value);
  if (n === null) return null;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

export const buildMyRatingsEmbed = (ratings, { page = 1, pageCount = 1, sort = 'recent', username = 'Your' } = {}) => {
  const embed = new EmbedBuilder()
    .setTitle(`⭐ ${username}'s Ratings`)
    .setColor(COLOR);

  if (!ratings.length) {
    embed.setDescription('No ratings yet — watch something and rate it.');
    return embed;
  }

  const entries = ratings.map((row) => {
    const { name, year } = splitTitleYear(row.title, row.release_year);
    const score = Number(row.score);
    const community = formatScore(row.community_avg);

    const meta = [
      `${ratingMeter(score)} **${formatScore(score)}**`,
      community ? `server ${community}` : null,
      `<t:${unixSeconds(row.scheduled_at)}:D>`
    ].filter(Boolean).join(' · ');

    const lines = [`**${name}**${year ? ` (${year})` : ''}`, meta];

    if (row.comment) {
      const trimmed = row.comment.length > COMMENT_MAX
        ? `${row.comment.slice(0, COMMENT_MAX - 1)}…`
        : row.comment;
      lines.push(`> ${trimmed}`);
    }

    return lines.join('\n');
  });

  embed.setDescription(fitEntries(entries));

  const poster = ratings.map((row) => safeImageUrl(row.image_url)).find(Boolean);
  if (poster) embed.setThumbnail(poster);

  const total = ratings[0]?.total_count ?? ratings.length;
  const sortLabel = SORTS.find((s) => s.key === sort)?.label ?? SORTS[0].label;
  embed.setFooter({ text: `Page ${page} of ${pageCount} · ${total} rated · ${sortLabel}` });

  return embed;
};

// ── /top10 ──────────────────────────────────────────────────────────────────

const gapOf = (row) => {
  const mine = toScore(row.score);
  const room = toScore(row.community_avg);
  if (mine === null || room === null) return null;
  return Math.round((mine - room) * 10) / 10;
};

/**
 * The film this member disagreed with the room about most, in either direction.
 * Null when nothing has a room average to compare against.
 */
export const biggestHotTake = (rows) => {
  let winner = null;
  let widest = 0;

  for (const row of rows) {
    const gap = gapOf(row);
    if (gap === null) continue;
    if (Math.abs(gap) > widest) {
      widest = Math.abs(gap);
      winner = row;
    }
  }

  return winner;
};

const formatGap = (gap) => {
  if (gap === null || gap === 0) return null;
  return gap > 0 ? `▲ ${gap}` : `▼ ${Math.abs(gap)}`;
};

export const buildTop10Embed = (rows, { username = 'Your' } = {}) => {
  const embed = new EmbedBuilder()
    .setTitle(`🏆 ${username}'s Top 10`)
    .setColor(COLOR_GOLD);

  if (!rows.length) {
    embed.setDescription(`${username} hasn't rated enough films yet — a film needs three ratings before it can rank.`);
    return embed;
  }

  const entries = rows.map((row, index) => {
    const { name, year } = splitTitleYear(row.title, row.release_year);
    const medal = MEDALS[index] ?? `**${index + 1}.**`;
    const score = Number(row.score);
    const community = formatScore(row.community_avg);
    const gap = formatGap(gapOf(row));

    const meta = [
      `${ratingMeter(score)} **${formatScore(score)}**`,
      community ? `server ${community}` : null,
      gap
    ].filter(Boolean).join(' · ');

    return `${medal} **${name}**${year ? ` (${year})` : ''}\n${meta}`;
  });

  embed.setDescription(fitEntries(entries));

  const poster = rows.map((row) => safeImageUrl(row.image_url)).find(Boolean);
  if (poster) embed.setThumbnail(poster);

  const hotTake = biggestHotTake(rows);
  if (hotTake) {
    const gap = Math.abs(gapOf(hotTake));
    const direction = gapOf(hotTake) > 0 ? 'above' : 'below';
    embed.setFooter({ text: `Biggest hot take: ${hotTake.title}, ${gap} ${direction} the room` });
  }

  return embed;
};

export { COLOR, COLOR_GOLD };
