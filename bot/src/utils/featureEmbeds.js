import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { splitTitleYear, formatRuntime } from './announcementEmbed.js';
import { buildId } from './customId.js';
import { fitEntries, safeImageUrl } from './commandEmbeds.js';

// The features that lived only on the website until now: the suggestion board,
// wishlists, and a single marathon's running order.

const COLOR = 0x5865F2;

// Discord allows at most 25 options in a select menu, and 100 characters per
// label. Both are hard limits — exceeding either is rejected outright.
export const BOARD_SELECT_MAX = 25;
const LABEL_MAX = 100;

const unixSeconds = (value) => Math.floor(new Date(value).getTime() / 1000);

const truncateLabel = (text) =>
  text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX - 1)}…` : text;

// The board stores signed votes, so a film the room dislikes can sit below zero.
// Showing "▲ -2" would be nonsense.
const formatScore = (score) => {
  const n = Number(score) || 0;
  if (n < 0) return `▼ ${Math.abs(n)}`;
  return `▲ ${n}`;
};

export const buildBoardEmbed = (suggestions) => {
  const embed = new EmbedBuilder()
    .setTitle('🗳️ The Suggestion Board')
    .setColor(COLOR);

  if (!suggestions.length) {
    embed.setDescription('Nothing on the board yet — add a film with `/board suggest:`.');
    return embed;
  }

  const entries = suggestions.map((row) => {
    const { name, year } = splitTitleYear(row.title, row.release_year);

    const meta = [
      formatRuntime(row.runtime),
      row.genres,
      row.suggested_by_name ? `suggested by ${row.suggested_by_name}` : null,
      row.user_vote === 1 ? '✅ you voted' : null
    ].filter(Boolean).join(' · ');

    const booked = row.status === 'scheduled' && row.scheduled_at
      ? `\n📅 scheduled for <t:${unixSeconds(row.scheduled_at)}:F>`
      : '';

    return `${formatScore(row.score)} · **${name}**${year ? ` (${year})` : ''}\n${meta}${booked}`;
  });

  const unvoted = suggestions.filter((row) => row.user_vote !== 1).length;
  const header = [
    `${suggestions.length} on the board`,
    unvoted ? `${unvoted} you haven't voted on` : null
  ].filter(Boolean).join(' · ');

  embed.setDescription(`${header}\n\n${fitEntries(entries, 3700)}`);

  const poster = suggestions.map((row) => safeImageUrl(row.image_url)).find(Boolean);
  if (poster) embed.setThumbnail(poster);

  return embed;
};

/**
 * The vote menu.
 *
 * One select rather than a button per film: a board can hold far more than the
 * five buttons an action row allows, and the menu names each film so you know
 * what you are voting for. Selecting one you already backed takes the vote away.
 */
export const buildBoardComponents = (suggestions) => {
  if (!suggestions.length) return [];

  const options = suggestions.slice(0, BOARD_SELECT_MAX).map((row) => {
    const { name, year } = splitTitleYear(row.title, row.release_year);
    return {
      label: truncateLabel(`${name}${year ? ` (${year})` : ''}`),
      value: String(row.id),
      description: truncateLabel(`${formatScore(row.score)}${row.suggested_by_name ? ` · from ${row.suggested_by_name}` : ''}`),
      emoji: row.user_vote === 1 ? '✅' : '▲'
    };
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildId('boardvote'))
    .setPlaceholder('Vote for a film — pick again to take it back')
    .addOptions(options);

  return [new ActionRowBuilder().addComponents(menu)];
};

// ── /wishlist ───────────────────────────────────────────────────────────────

const STAR_MAX = 5;

export const stars = (importance) => {
  const n = Math.max(0, Math.min(STAR_MAX, Math.round(Number(importance) || 0)));
  return '★'.repeat(n) + '☆'.repeat(STAR_MAX - n);
};

/**
 * Pick a film, weighted by priority — the site's "spin the wheel", in chat.
 *
 * `roll` is injected rather than drawn here so the behaviour is testable: the
 * caller supplies a random integer in [0, totalWeight). Weight is priority, with
 * an unset priority worth 1 rather than 0 — otherwise a film with no stars could
 * never be picked at all, which is not what "random" should mean.
 */
export const pickWeighted = (films, roll) => {
  if (!films.length) return null;

  const weightOf = (film) => Math.max(1, Math.min(STAR_MAX, Math.round(Number(film.importance) || 0)));

  let remaining = roll;
  for (const film of films) {
    remaining -= weightOf(film);
    if (remaining < 0) return film;
  }

  // Only reachable if the roll exceeded the total weight; the last film is the
  // honest answer rather than null, which callers would read as "empty list".
  return films[films.length - 1];
};

export const totalWeight = (films) =>
  films.reduce((sum, film) => sum + Math.max(1, Math.min(STAR_MAX, Math.round(Number(film.importance) || 0))), 0);

export const buildWishlistEmbed = (films, { username = 'Your', scope = 'me' } = {}) => {
  const isGuild = scope === 'guild';

  const embed = new EmbedBuilder()
    .setTitle(isGuild ? '🎯 The server wishlist' : `🎯 ${username}'s Wishlist`)
    .setColor(COLOR);

  if (!films.length) {
    embed.setDescription(isGuild
      ? 'Nothing on the server wishlist yet.'
      : 'Nothing on your wishlist yet — add films on the website.');
    return embed;
  }

  const entries = films.map((film) => {
    const { name, year } = splitTitleYear(film.title, film.release_year);

    const meta = [
      formatRuntime(film.runtime),
      film.genres,
      isGuild
        ? (film.wanted_by > 1 ? `${film.wanted_by} people want it` : film.wanted_by_names)
        : (film.also_wanted_by > 0 ? `also on ${film.also_wanted_by} other list${film.also_wanted_by === 1 ? '' : 's'}` : null)
    ].filter(Boolean).join(' · ');

    return `${stars(film.importance)} **${name}**${year ? ` (${year})` : ''}\n${meta}`;
  });

  embed.setDescription(fitEntries(entries, 3700));

  const poster = films.map((film) => safeImageUrl(film.image_url)).find(Boolean);
  if (poster) embed.setThumbnail(poster);

  embed.setFooter({ text: `${films.length} film${films.length === 1 ? '' : 's'}` });
  return embed;
};

export const buildWishlistComponents = (scope = 'me') => {
  const other = scope === 'guild' ? 'me' : 'guild';

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildId('wishpick', scope))
      .setLabel('Pick one for me')
      .setEmoji('🎲')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(buildId('wishlist', other))
      .setLabel(other === 'guild' ? 'Server wishlist' : 'My wishlist')
      .setEmoji(other === 'guild' ? '👥' : '🎯')
      .setStyle(ButtonStyle.Secondary)
  );

  return [row];
};

export { COLOR };
