import { SlashCommandBuilder } from 'discord.js';
import { getUpcomingMovies, getMovieNightById, startMovieNight } from '../models/index.js';
import { createStartingNowEmbed, createRatingButtons } from '../utils/embeds.js';
import { isAdmin } from '../utils/admin.js';

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Manually start a movie night (admin only)')
  .addIntegerOption(option =>
    option.setName('movie')
      .setDescription('The movie to start')
      .setRequired(true)
      .setAutocomplete(true));

export const autocomplete = async (interaction) => {
  const focusedValue = interaction.options.getFocused().toLowerCase();
  const movies = await getUpcomingMovies(interaction.guildId);

  const filtered = movies
    .filter(movie => movie.title.toLowerCase().includes(focusedValue))
    .slice(0, 25);

  await interaction.respond(
    filtered.map(movie => ({
      name: `${movie.title} (${new Date(movie.scheduled_at).toLocaleDateString()})`,
      value: movie.id
    }))
  );
};

export const execute = async (interaction) => {
  // Check admin
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: 'Only admins can use this command.',
      ephemeral: true
    });
  }

  const movieId = interaction.options.getInteger('movie');

  try {
    const movie = await getMovieNightById(movieId);

    if (!movie) {
      return interaction.reply({
        content: 'Movie not found.',
        ephemeral: true
      });
    }

    if (movie.started_at) {
      return interaction.reply({
        content: 'This movie has already started.',
        ephemeral: true
      });
    }

    // Start the movie
    await startMovieNight(movieId);

    // Send the starting now announcement
    const embed = createStartingNowEmbed(movie.title, movie.image_url);
    const buttons = createRatingButtons(movieId);

    await interaction.reply({
      embeds: [embed],
      components: buttons
    });

  } catch (err) {
    console.error('Error starting movie:', err);
    await interaction.reply({
      content: 'There was an error starting the movie.',
      ephemeral: true
    });
  }
};
