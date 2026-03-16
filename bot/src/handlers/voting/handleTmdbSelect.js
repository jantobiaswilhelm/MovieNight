import { EmbedBuilder } from 'discord.js';
import {
  findOrCreateUser,
  getVotingSessionById,
  createSuggestion,
  getSuggestionsForSession
} from '../../models/index.js';
import { isAdmin } from '../../utils/admin.js';
import { getMovieDetails } from '../../utils/tmdb.js';
import { updateVotingMessage } from './updateVotingMessage.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleTmdbSelect');

export async function handleTmdbSelect(interaction) {
  try {
    const sessionId = parseInt(interaction.customId.replace('tmdb_select_', ''));
    const selectedValue = interaction.values[0];

    const session = await getVotingSessionById(sessionId);
    if (!session || session.status !== 'open' || session.guild_id !== interaction.guildId) {
      return interaction.update({
        content: 'This voting session has ended.',
        embeds: [],
        components: []
      });
    }

    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    let title, imageUrl, tmdbData = {};

    if (selectedValue.startsWith('manual:')) {
      // Manual entry
      title = selectedValue.replace('manual:', '');
      imageUrl = null;
    } else {
      // TMDB selection
      const tmdbId = parseInt(selectedValue);
      const movie = await getMovieDetails(tmdbId);

      if (!movie) {
        return interaction.update({
          content: 'Could not fetch movie details. Please try again.',
          embeds: [],
          components: []
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
    }

    // Check for duplicate suggestion (same TMDB ID in this session)
    if (tmdbData.tmdbId) {
      const existingSuggestions = await getSuggestionsForSession(session.id);
      const duplicate = existingSuggestions.find(s => s.tmdb_id && s.tmdb_id === tmdbData.tmdbId);
      if (duplicate) {
        return interaction.update({
          content: `**${title}** has already been suggested in this voting session.`,
          embeds: [],
          components: []
        });
      }
    }

    // Create suggestion
    await createSuggestion(session.id, title, imageUrl, user.id, tmdbData);

    // Get updated suggestions and update voting message
    const suggestions = await getSuggestionsForSession(session.id);
    const userIsAdmin = isAdmin(interaction.user.id);
    await updateVotingMessage(interaction, session, suggestions, userIsAdmin);

    // Build confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x4ade80)
      .setTitle('Movie Suggested!')
      .setDescription(`**${title}** has been added to the voting.`);

    if (imageUrl) {
      confirmEmbed.setThumbnail(imageUrl);
    }

    await interaction.update({
      embeds: [confirmEmbed],
      components: []
    });

  } catch (err) {
    logger.error('Error handling TMDB select', err);
    await interaction.update({
      content: 'There was an error adding your suggestion.',
      embeds: [],
      components: []
    });
  }
}
