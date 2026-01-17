import { SlashCommandBuilder } from 'discord.js';
import { getMovieNightById, deleteMovieNight, getRecentMovieNightsForRating } from '../models/index.js';
import { isAdmin } from '../utils/admin.js';

export const data = new SlashCommandBuilder()
  .setName('delete')
  .setDescription('Delete a movie (Admin only)')
  .addStringOption(option =>
    option.setName('movie')
      .setDescription('The movie to delete')
      .setRequired(true)
      .setAutocomplete(true));

export const autocomplete = async (interaction) => {
  const focusedValue = interaction.options.getFocused().toLowerCase();

  try {
    const movies = await getRecentMovieNightsForRating(interaction.guildId, 25);

    const filtered = movies
      .filter(movie => movie.title.toLowerCase().includes(focusedValue))
      .slice(0, 25);

    await interaction.respond(
      filtered.map(movie => ({
        name: movie.title,
        value: movie.id.toString()
      }))
    );
  } catch (err) {
    console.error('Error in delete autocomplete:', err);
    await interaction.respond([]);
  }
};

export const execute = async (interaction) => {
  // Check if user is admin
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: 'You do not have permission to delete movies.',
      ephemeral: true
    });
  }

  const movieIdStr = interaction.options.getString('movie');
  const movieId = parseInt(movieIdStr);

  if (isNaN(movieId)) {
    return interaction.reply({
      content: 'Invalid movie selected.',
      ephemeral: true
    });
  }

  try {
    // Get movie to verify it exists
    const movie = await getMovieNightById(movieId);
    if (!movie) {
      return interaction.reply({
        content: 'Movie not found.',
        ephemeral: true
      });
    }

    // Delete the movie
    await deleteMovieNight(movieId);

    // Try to delete the announcement message if it exists
    if (movie.channel_id && movie.message_id) {
      try {
        const channel = await interaction.client.channels.fetch(movie.channel_id);
        if (channel) {
          const message = await channel.messages.fetch(movie.message_id);
          if (message) {
            await message.delete();
          }
        }
      } catch (err) {
        console.log('Could not delete original message:', err.message);
      }
    }

    await interaction.reply({
      content: `Deleted movie: **${movie.title}** and all its ratings.`,
      ephemeral: true
    });

  } catch (err) {
    console.error('Error deleting movie:', err);
    await interaction.reply({
      content: 'There was an error deleting the movie.',
      ephemeral: true
    });
  }
};
