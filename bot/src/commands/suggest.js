import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { findOrCreateUser, getActiveVotingSession, createSuggestion, getSuggestionsForSession } from '../models/index.js';
import { buildVotingEmbed, buildVotingButtons } from '../utils/votingEmbed.js';
import { searchMovies, getMovieDetails } from '../utils/tmdb.js';

export const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Suggest a movie for the current voting session')
  .addStringOption(option =>
    option.setName('movie')
      .setDescription('Search for a movie by title')
      .setRequired(true)
      .setAutocomplete(true));

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

  // Check if there's an active voting session
  const session = await getActiveVotingSession(interaction.guildId);
  if (!session) {
    return interaction.reply({
      content: 'There\'s no active voting session! Use `/startvote` to start one.',
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
      releaseYear: movie.year
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

    // Create suggestion
    await createSuggestion(session.id, title, imageUrl, user.id, tmdbData);

    // Get all suggestions to update the voting message
    const suggestions = await getSuggestionsForSession(session.id);

    // Update the voting message using session's channel_id
    try {
      const channel = await interaction.client.channels.fetch(session.channel_id);
      if (channel) {
        const message = await channel.messages.fetch(session.message_id);

        if (message) {
          const timestamp = Math.floor(new Date(session.scheduled_at).getTime() / 1000);
          const embed = buildVotingEmbed(session, suggestions, timestamp);
          embed.setFooter({ text: `Started by ${session.created_by_name || 'Unknown'}` });

          const buttons = buildVotingButtons(suggestions, false, session.id);

          await message.edit({
            embeds: [embed],
            components: buttons
          });
        }
      }
    } catch (err) {
      console.error('Error updating voting message:', err);
    }

    // Build confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x4ade80)
      .setTitle('Movie Suggested!')
      .setDescription(`**${title}** has been added to the voting.`);

    if (imageUrl) {
      confirmEmbed.setThumbnail(imageUrl);
    }

    if (tmdbData.description) {
      const desc = tmdbData.description;
      confirmEmbed.addFields({ name: 'Overview', value: desc.slice(0, 200) + (desc.length > 200 ? '...' : '') });
    }

    await interaction.reply({
      embeds: [confirmEmbed],
      ephemeral: true
    });

  } catch (err) {
    console.error('Error suggesting movie:', err);
    await interaction.reply({
      content: 'There was an error adding your suggestion.',
      ephemeral: true
    });
  }
};
