import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
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

export { COLOR, COLOR_GOLD };
