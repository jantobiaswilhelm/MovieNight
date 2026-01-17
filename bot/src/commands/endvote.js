import { SlashCommandBuilder } from 'discord.js';
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

export const data = new SlashCommandBuilder()
  .setName('endvote')
  .setDescription('End the current voting session and announce the winner')
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('Override the movie night date/time (optional)')
      .setRequired(false));

export const execute = async (interaction) => {
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
        releaseYear: winner.release_year
      }
    );

    // Rating buttons will appear automatically when the movie starts
    // (handled by the movieStarter scheduled job)

  } catch (err) {
    console.error('Error ending vote:', err);
    await interaction.reply({
      content: 'There was an error ending the voting session.',
      ephemeral: true
    });
  }
};

function parseDateTime(str) {
  let date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  const now = new Date();

  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lowerStr = str.toLowerCase();

  for (let i = 0; i < days.length; i++) {
    if (lowerStr.includes(days[i])) {
      date = new Date(now);
      const currentDay = date.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setDate(date.getDate() + daysUntil);

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
  }

  if (lowerStr.includes('tomorrow')) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);

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

  if (lowerStr.includes('today')) {
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

  return new Date(str);
}
