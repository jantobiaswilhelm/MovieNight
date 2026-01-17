import { SlashCommandBuilder } from 'discord.js';
import { findOrCreateUser, createMovieNight } from '../models/index.js';
import { createAnnouncementEmbed } from '../utils/embeds.js';
import { searchMovies, getMovieDetails } from '../utils/tmdb.js';

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

  if (focusedValue.length < 2) {
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

  try {
    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Send announcement first to get message ID
    const announcementEmbed = createAnnouncementEmbed(
      title,
      scheduledAt,
      imageUrl,
      interaction.user.username
    );

    const reply = await interaction.reply({
      embeds: [announcementEmbed],
      fetchReply: true
    });

    // Create movie night in database with TMDB data
    await createMovieNight(
      title,
      scheduledAt,
      user.id,
      interaction.guildId,
      interaction.channelId,
      reply.id,
      imageUrl,
      tmdbData
    );

    // Rating buttons will be sent automatically when the movie starts

  } catch (err) {
    console.error('Error creating movie night:', err);
    if (interaction.replied) {
      await interaction.followUp({
        content: 'There was an error creating the movie night.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: 'There was an error creating the movie night.',
        ephemeral: true
      });
    }
  }
};

function parseDateTime(str) {
  // Try ISO format first
  let date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  // Try common formats
  const now = new Date();

  // Handle "tomorrow" keyword
  if (str.toLowerCase().includes('tomorrow')) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);

    // Extract time if present
    const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
    }
    return date;
  }

  // Handle "today" keyword
  if (str.toLowerCase().includes('today')) {
    date = new Date(now);

    const timeMatch = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
    }
    return date;
  }

  // Try parsing as "YYYY-MM-DD HH:MM" or similar
  const parts = str.split(/[\s,]+/);
  if (parts.length >= 2) {
    const datePart = parts[0];
    const timePart = parts.slice(1).join(' ');

    date = new Date(datePart);

    const timeMatch = timePart.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && !isNaN(date.getTime())) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
      return date;
    }
  }

  return new Date(str);
}
