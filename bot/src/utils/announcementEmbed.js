import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// Announcement embed colors, keyed to lifecycle state.
const COLOR_SCHEDULED = 0x5865F2; // blurple — matches the rest of the bot
const COLOR_STARTED = 0x57F287;   // green — matches the screening card's playing state
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

/**
 * Build the announcement embed from a view object. Pure — no database, no
 * Discord client, no environment reads. Every block is conditional so a movie
 * with no TMDB match degrades to title + time + RSVP rather than a shell of
 * empty fields.
 *
 * @param {object} view - see toAnnouncementView for the shape
 */
export const buildAnnouncementEmbed = (view) => {
  const {
    title, releaseYear, scheduledAt, startedAt, cancelled = false,
    imageUrl, backdropUrl, description, tagline,
    tmdbId, tmdbRating, genres, runtime,
    announcerName, marathonName, marathonPosition, marathonTotal,
    attendees = []
  } = view;

  const { name, year } = splitTitleYear(title, releaseYear);
  const heading = year ? `${name} (${year})` : name;
  const when = new Date(scheduledAt);
  const startTs = Math.floor(when.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setAuthor({ name: marathonName || 'Movie Night' })
    .setTitle(cancelled ? `~~${heading}~~` : heading)
    .setColor(cancelled ? COLOR_CANCELLED : startedAt ? COLOR_STARTED : COLOR_SCHEDULED)
    .setFooter({ text: `Announced by ${announcerName || 'Website'}` })
    .setTimestamp();

  if (tmdbId && !cancelled) {
    embed.setURL(`https://www.themoviedb.org/movie/${tmdbId}`);
  }

  const parts = [];
  if (tagline) parts.push(`*"${tagline}"*`);
  const overview = truncateOverview(description);
  if (overview) parts.push(overview);

  if (cancelled) {
    parts.push('**This movie night has been cancelled.**');
  } else if (startedAt) {
    parts.push(`🔴 **STARTED** · <t:${startTs}:F>`);
  } else {
    parts.push(`🗓 <t:${startTs}:F> · <t:${startTs}:R>`);
  }
  embed.setDescription(parts.join('\n\n'));

  const runtimeText = formatRuntime(runtime);
  if (runtimeText) {
    const endTs = Math.floor((when.getTime() + runtime * 60_000) / 1000);
    embed.addFields({
      name: '⏱ Runtime',
      value: `${runtimeText}\nends ~<t:${endTs}:t>`,
      inline: true
    });
  }

  // pg returns DECIMAL as a string — Number() before toFixed or this throws.
  if (tmdbRating) {
    embed.addFields({
      name: '⭐ TMDB',
      value: `${Number(tmdbRating).toFixed(1)}/10`,
      inline: true
    });
  }

  if (genres) {
    embed.addFields({
      name: '🎭 Genres',
      value: genres.split(',').map((g) => g.trim()).filter(Boolean).join(' · '),
      inline: true
    });
  }

  if (marathonName && marathonPosition && marathonTotal) {
    embed.addFields({
      name: 'Marathon',
      value: `Film ${marathonPosition} of ${marathonTotal}`,
      inline: true
    });
  }

  if (!cancelled) {
    embed.addFields({
      name: `🎟 Going (${attendees.length})`,
      value: formatAttendees(attendees),
      inline: false
    });
  }

  // The backdrop is the wide cinematic slot; the poster sits beside the text.
  // With no backdrop the poster takes the big slot, as it did before this change.
  if (backdropUrl) {
    embed.setImage(backdropUrl);
    if (imageUrl) embed.setThumbnail(imageUrl);
  } else if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
};

/**
 * Build the button row for an announcement. Exactly five buttons at most, which
 * is Discord's per-row limit, so this never needs a second row. Buttons whose
 * underlying data is missing are omitted rather than rendered dead.
 *
 * Returns [] when there is nothing to show, so callers can spread it into
 * `components` unconditionally.
 */
export const buildAnnouncementComponents = (view) => {
  const { id, tmdbId, imdbId, trailerUrl, startedAt, cancelled = false } = view;
  if (cancelled) return [];

  const buttons = [];

  // RSVP disappears once the movie is under way — you can't opt into a
  // screening that already started.
  if (!startedAt) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`rsvp_${id}`)
        .setLabel("I'm in")
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    );
  }

  if (trailerUrl) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Trailer')
        .setEmoji('▶️')
        .setURL(trailerUrl)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (tmdbId) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('TMDB')
        .setURL(`https://www.themoviedb.org/movie/${tmdbId}`)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (imdbId) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('IMDb')
        .setURL(`https://www.imdb.com/title/${imdbId}/`)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (process.env.FRONTEND_URL) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Website')
        .setURL(process.env.FRONTEND_URL)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (buttons.length === 0) return [];
  return [new ActionRowBuilder().addComponents(...buttons)];
};

/**
 * Map a database row to an announcement view. Works for both `movie_nights`
 * rows and `pending_announcements` rows — they share column names for
 * everything the embed reads.
 *
 * Note: `pending_announcements` has no `tagline` column, so web-triggered
 * announcements simply render without one. The block is conditional.
 *
 * @param {object} row
 * @param {object} [extras] - attendees, marathon context, cancelled flag
 */
export const toAnnouncementView = (row, extras = {}) => ({
  id: extras.id ?? row.id,
  title: row.title,
  releaseYear: row.release_year ?? null,
  scheduledAt: row.scheduled_at,
  startedAt: row.started_at ?? null,
  cancelled: extras.cancelled ?? false,
  imageUrl: row.image_url ?? null,
  backdropUrl: row.backdrop_url ?? null,
  description: row.description ?? null,
  tagline: row.tagline ?? null,
  tmdbId: row.tmdb_id ?? null,
  tmdbRating: row.tmdb_rating ?? null,
  genres: row.genres ?? null,
  runtime: row.runtime ?? null,
  imdbId: row.imdb_id ?? null,
  trailerUrl: row.trailer_url ?? null,
  announcerName: extras.announcerName ?? row.announced_by_name ?? 'Website',
  marathonName: extras.marathonName ?? row.marathon_name ?? null,
  marathonPosition: extras.marathonPosition ?? row.marathon_position ?? null,
  marathonTotal: extras.marathonTotal ?? row.marathon_total ?? null,
  attendees: extras.attendees ?? []
});
