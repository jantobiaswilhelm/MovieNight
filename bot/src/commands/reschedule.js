import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getUpcomingMovies, getMovieNightById, rescheduleMovieNight } from '../models/index.js';
import { isAdmin } from '../utils/admin.js';
import { parseDateTime } from '../utils/dateTime.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('reschedule');

export const data = new SlashCommandBuilder()
  .setName('reschedule')
  .setDescription('Reschedule a movie night (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addIntegerOption(option =>
    option.setName('movie')
      .setDescription('The movie to reschedule')
      .setRequired(true)
      .setAutocomplete(true))
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('New date/time (e.g., "2024-01-20 20:00" or "tomorrow 8pm")')
      .setRequired(true));

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

  try {
    const movie = await getMovieNightById(movieId);

    if (!movie || movie.guild_id !== interaction.guildId) {
      return interaction.reply({
        content: 'Movie not found.',
        ephemeral: true
      });
    }

    if (movie.started_at) {
      return interaction.reply({
        content: 'Cannot reschedule a movie that has already started.',
        ephemeral: true
      });
    }

    // Reschedule
    await rescheduleMovieNight(movieId, scheduledAt);

    const timestamp = Math.floor(scheduledAt.getTime() / 1000);

    await interaction.reply({
      content: `**${movie.title}** has been rescheduled to <t:${timestamp}:F> (<t:${timestamp}:R>)`,
    });

  } catch (err) {
    logger.error('Error rescheduling movie', err);
    await interaction.reply({
      content: 'There was an error rescheduling the movie.',
      ephemeral: true
    });
  }
};

