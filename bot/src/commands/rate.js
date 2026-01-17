import { SlashCommandBuilder } from 'discord.js';
import { findOrCreateUser, getRecentMovieNightsForRating, getMovieNightById, upsertRating, getUserRating } from '../models/index.js';

export const data = new SlashCommandBuilder()
  .setName('rate')
  .setDescription('Rate a movie')
  .addIntegerOption(option =>
    option.setName('movie')
      .setDescription('The movie to rate')
      .setRequired(true)
      .setAutocomplete(true))
  .addNumberOption(option =>
    option.setName('score')
      .setDescription('Your rating (1-10, can use .5 like 7.5)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10));

export const autocomplete = async (interaction) => {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  try {
    const movies = await getRecentMovieNightsForRating(interaction.guildId, 25);

    const filtered = movies.filter(m =>
      m.title.toLowerCase().includes(focusedValue)
    ).slice(0, 25);

    await interaction.respond(
      filtered.map(movie => ({
        name: movie.title,
        value: movie.id
      }))
    );
  } catch (err) {
    console.error('Autocomplete error:', err);
    await interaction.respond([]);
  }
};

export const execute = async (interaction) => {
  const movieId = interaction.options.getInteger('movie');
  const score = interaction.options.getNumber('score');

  // Validate score is in 0.5 increments
  if ((score * 2) % 1 !== 0) {
    return interaction.reply({
      content: 'Score must be in 0.5 increments (e.g., 7, 7.5, 8)',
      ephemeral: true
    });
  }

  try {
    // Get movie
    const movie = await getMovieNightById(movieId);
    if (!movie) {
      return interaction.reply({
        content: 'Movie not found. Use the autocomplete to select a valid movie.',
        ephemeral: true
      });
    }

    // Verify movie is from this guild
    if (movie.guild_id !== interaction.guildId) {
      return interaction.reply({
        content: 'Movie not found in this server.',
        ephemeral: true
      });
    }

    // Check if movie has started
    if (!movie.started_at) {
      return interaction.reply({
        content: 'This movie has not started yet. Ratings will be available once the movie night begins.',
        ephemeral: true
      });
    }

    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Check for existing rating
    const existingRating = await getUserRating(movieId, interaction.user.id);

    // Save rating
    await upsertRating(movieId, user.id, score);

    const action = existingRating ? 'updated' : 'submitted';
    await interaction.reply({
      content: `Rating ${action}! You gave **${movie.title}** a **${score}/10**`,
      ephemeral: false
    });

  } catch (err) {
    console.error('Error saving rating:', err);
    await interaction.reply({
      content: 'There was an error saving your rating.',
      ephemeral: true
    });
  }
};
