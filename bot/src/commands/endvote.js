import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import {
  findOrCreateUser,
  getActiveVotingSession,
  closeVotingSession,
  getWinningSuggestion,
  getSuggestionsForSession,
  updateVotingSessionSchedule,
  createMovieNight
} from '../models/index.js';
import { createAnnouncementEmbed } from '../utils/embeds.js';
import { isAdmin } from '../utils/admin.js';
import { parseDateTime } from '../utils/dateTime.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('endvote');

export const data = new SlashCommandBuilder()
  .setName('endvote')
  .setDescription('End the current voting session and announce the winner')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('Override the movie night date/time (optional)')
      .setRequired(false));

export const execute = async (interaction) => {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: 'You do not have permission to end voting sessions.',
      ephemeral: true
    });
  }

  const datetimeStr = interaction.options.getString('datetime');

  // Check if there's an active voting session
  const session = await getActiveVotingSession(interaction.guildId);
  if (!session) {
    return interaction.reply({
      content: 'There\'s no active voting session to end!',
      ephemeral: true
    });
  }

  // Get suggestions
  const suggestions = await getSuggestionsForSession(session.id);
  if (suggestions.length === 0) {
    return interaction.reply({
      content: 'No movies were suggested! Add suggestions with `/suggest` before ending the vote.',
      ephemeral: true
    });
  }

  // Parse override datetime if provided
  let scheduledAt = new Date(session.scheduled_at);
  if (datetimeStr) {
    try {
      const newDate = parseDateTime(datetimeStr);
      if (!isNaN(newDate.getTime())) {
        scheduledAt = newDate;
        await updateVotingSessionSchedule(session.id, scheduledAt);
      }
    } catch {
      return interaction.reply({
        content: 'Could not parse the date/time. Using the original scheduled time.',
        ephemeral: true
      });
    }
  }

  try {
    // Get the winner
    const winner = await getWinningSuggestion(session.id);

    // Close the voting session
    await closeVotingSession(session.id, winner.id);

    // Create or get user for the announcement
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Build results message
    const resultsText = suggestions.map((s, i) => {
      const isWinner = s.id === winner.id;
      return `${isWinner ? '🏆' : `${i + 1}.`} **${s.title}** - ${s.vote_count} votes`;
    }).join('\n');

    // Announce voting results
    await interaction.reply({
      content: `## 🗳️ Voting Results\n\n${resultsText}\n\n**The winner is: ${winner.title}!** 🎉`
    });

    // Create the movie night announcement
    const announcementEmbed = createAnnouncementEmbed(
      winner.title,
      scheduledAt,
      winner.image_url,
      interaction.user.username
    );

    const announcementMsg = await interaction.followUp({
      embeds: [announcementEmbed],
      fetchReply: true
    });

    // Create movie night in database with TMDB data from winning suggestion
    await createMovieNight(
      winner.title,
      scheduledAt,
      user.id,
      interaction.guildId,
      interaction.channelId,
      announcementMsg.id,
      winner.image_url,
      {
        description: winner.description,
        tmdbId: winner.tmdb_id,
        tmdbRating: winner.tmdb_rating,
        genres: winner.genres,
        runtime: winner.runtime,
        releaseYear: winner.release_year,
        backdropUrl: winner.backdrop_url,
        tagline: winner.tagline,
        imdbId: winner.imdb_id,
        originalLanguage: winner.original_language,
        collectionName: winner.collection_name,
        trailerUrl: winner.trailer_url
      }
    );

    // Rating buttons will appear automatically when the movie starts
    // (handled by the movieStarter scheduled job)

  } catch (err) {
    logger.error('Error ending vote', err);
    await interaction.reply({
      content: 'There was an error ending the voting session.',
      ephemeral: true
    });
  }
};

