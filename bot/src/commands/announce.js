import { SlashCommandBuilder } from 'discord.js';
import { findOrCreateUser, createMovieNight, updateMovieNightMessage, deleteMovieNight } from '../models/index.js';
import { buildAnnouncementEmbed, buildAnnouncementComponents, toAnnouncementView } from '../utils/announcementEmbed.js';
import { searchMovies, getMovieDetails } from '../utils/tmdb.js';
import { shouldThrottle } from '../utils/throttle.js';
import { parseDateTime } from '../utils/dateTime.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('announce');

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Announce a new movie night')
  .addStringOption(option =>
    option.setName('movie')
      .setDescription('Search for a movie by title')
      .setRequired(true)
      .setAutocomplete(true))
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('When the movie night starts (e.g., "2024-01-20 20:00" or "tomorrow 8pm")')
      .setRequired(true));

export const autocomplete = async (interaction) => {
  const focusedValue = interaction.options.getFocused();

  if (focusedValue.length < 2 || shouldThrottle(interaction.user.id)) {
    return interaction.respond([]);
  }

  const movies = await searchMovies(focusedValue, 25);

  const choices = movies.map(movie => ({
    name: movie.year
      ? `${movie.title} (${movie.year})`.slice(0, 100)
      : movie.title.slice(0, 100),
    value: `tmdb:${movie.id}`
  }));

  await interaction.respond(choices);
};

export const execute = async (interaction) => {
  const movieValue = interaction.options.getString('movie');
  const datetimeStr = interaction.options.getString('datetime');

  // Parse datetime
  let scheduledAt;
  try {
    scheduledAt = parseDateTime(datetimeStr);
    if (isNaN(scheduledAt.getTime())) {
      throw new Error('Invalid date');
    }
  } catch {
    return interaction.reply({
      content: 'Could not parse the date/time. Try formats like "2024-01-20 20:00" or "tomorrow 8pm"',
      ephemeral: true
    });
  }

  let title, imageUrl, tmdbData = {};

  // Check if it's a TMDB selection (user picked from autocomplete)
  if (movieValue.startsWith('tmdb:')) {
    const tmdbId = movieValue.replace('tmdb:', '');
    const movie = await getMovieDetails(tmdbId);

    if (!movie) {
      return interaction.reply({
        content: 'Could not fetch movie details. Please try again.',
        ephemeral: true
      });
    }

    title = movie.year ? `${movie.title} (${movie.year})` : movie.title;
    imageUrl = movie.posterPath;
    tmdbData = {
      description: movie.overview,
      tmdbId: movie.id,
      tmdbRating: movie.rating,
      genres: movie.genres,
      runtime: movie.runtime,
      releaseYear: movie.year,
      backdropUrl: movie.backdropPath,
      tagline: movie.tagline,
      imdbId: movie.imdbId,
      originalLanguage: movie.originalLanguage,
      collectionName: movie.collectionName,
      trailerUrl: movie.trailerUrl
    };
  } else {
    // Manual entry - user typed something but didn't pick from autocomplete
    title = movieValue;
    imageUrl = null;
  }

  // Defer first: creating the movie night before replying takes us past
  // Discord's 3-second interaction window on a slow database.
  await interaction.deferReply();

  let movieNight;
  try {
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Create the row BEFORE sending, because the RSVP button needs its id.
    // message_id is null for a beat and patched in below.
    movieNight = await createMovieNight(
      title,
      scheduledAt,
      user.id,
      interaction.guildId,
      interaction.channelId,
      null,
      imageUrl,
      tmdbData
    );

    const view = toAnnouncementView(movieNight, {
      announcerName: interaction.user.username,
      attendees: []
    });

    const reply = await interaction.editReply({
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });

    await updateMovieNightMessage(movieNight.id, reply.id, interaction.channelId);

    // Rating buttons are sent automatically when the movie starts.
  } catch (err) {
    logger.error('Error creating movie night', err);

    // If the row was created but the reply failed, it's an orphan with no
    // message — drop it rather than leaving a phantom night in /history.
    if (movieNight) {
      await deleteMovieNight(movieNight.id).catch((cleanupErr) =>
        logger.error(`Failed to clean up orphan movie night ${movieNight.id}`, cleanupErr)
      );
    }

    await interaction.editReply({
      content: 'There was an error creating the movie night.',
      embeds: [],
      components: []
    }).catch(() => {});
  }
};

