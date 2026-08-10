import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { getUpcomingMovies, getMovieNightById, startMovieNight } from '../models/index.js';
import { postScreeningCard } from '../utils/screeningMessage.js';
import { isAdmin } from '../utils/admin.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('start');

export const data = new SlashCommandBuilder()
  .setName('start')
  .setDescription('Manually start a movie night (admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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

    if (!movie || movie.guild_id !== interaction.guildId) {
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

    // Post the screening card in the movie's own channel via the shared helper,
    // so a manual start looks identical to an automatic one. /start no longer
    // attaches rating buttons — rating opens when the credits roll.
    const channel = await interaction.client.channels
      .fetch(movie.channel_id || interaction.channelId)
      .catch(() => null);

    if (!channel?.isTextBased?.()) {
      return interaction.reply({
        content: 'Started, but I could not find the channel to post in.',
        ephemeral: true
      });
    }

    await postScreeningCard(movieId, channel);

    await interaction.reply({
      content: `Started **${movie.title}**.`,
      ephemeral: true
    });

  } catch (err) {
    logger.error('Error starting movie', err);
    await interaction.reply({
      content: 'There was an error starting the movie.',
      ephemeral: true
    });
  }
};
