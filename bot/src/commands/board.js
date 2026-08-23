import { SlashCommandBuilder } from 'discord.js';
import {
  findOrCreateUser,
  createBoardSuggestion,
  findOpenBoardSuggestionByTmdb
} from '../models/index.js';
import { renderView } from '../handlers/index.js';
import { searchMovies, getMovieDetails } from '../utils/tmdb.js';
import { shouldThrottle } from '../utils/throttle.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('board');

export const data = new SlashCommandBuilder()
  .setName('board')
  .setDescription('See what the server wants to watch, and add to it')
  .addStringOption(option =>
    option.setName('suggest')
      .setDescription('Add a film to the board')
      .setRequired(false)
      .setAutocomplete(true));

// Same shape as /announce's autocomplete: TMDB search, throttled per user, with
// the id carried in the value so execute doesn't have to search again.
export const autocomplete = async (interaction) => {
  const focusedValue = interaction.options.getFocused();

  if (focusedValue.length < 2 || shouldThrottle(interaction.user.id)) {
    return interaction.respond([]);
  }

  const movies = await searchMovies(focusedValue, 25);

  await interaction.respond(movies.map(movie => ({
    name: movie.year
      ? `${movie.title} (${movie.year})`.slice(0, 100)
      : movie.title.slice(0, 100),
    value: `tmdb:${movie.id}`
  })));
};

const addSuggestion = async (interaction, movieValue) => {
  await interaction.deferReply({ ephemeral: true });

  if (!movieValue.startsWith('tmdb:')) {
    return interaction.editReply({
      content: 'Pick a film from the search results so the board gets its poster and runtime.'
    });
  }

  const movie = await getMovieDetails(movieValue.replace('tmdb:', ''));
  if (!movie) {
    return interaction.editReply({ content: 'Could not fetch that film from TMDB. Try again.' });
  }

  // Suggesting something already on the board would split its votes across two
  // rows, so say it is there rather than adding a duplicate.
  const existing = await findOpenBoardSuggestionByTmdb(interaction.guildId, movie.id);
  if (existing) {
    return interaction.editReply({
      content: `**${existing.title}** is already on the board — vote for it with \`/board\`.`
    });
  }

  const user = await findOrCreateUser(
    interaction.user.id,
    interaction.user.username,
    interaction.user.avatar
  );

  await createBoardSuggestion(
    interaction.guildId,
    user.id,
    movie.title,
    movie.posterPath,
    {
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
    }
  );

  return interaction.editReply({
    content: `Added **${movie.title}** to the board. Run \`/board\` to vote.`
  });
};

export const execute = async (interaction) => {
  const suggestion = interaction.options.getString('suggest');

  try {
    if (suggestion) return await addSuggestion(interaction, suggestion);

    const payload = await renderView('board', {
      guildId: interaction.guildId,
      user: interaction.user
    });
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error handling /board', err);
    const message = { content: 'There was an error loading the board.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }
};
