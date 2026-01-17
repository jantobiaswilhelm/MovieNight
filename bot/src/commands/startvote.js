import { SlashCommandBuilder } from 'discord.js';
import { findOrCreateUser, createVotingSession, getActiveVotingSession, getSuggestionsForSession } from '../models/index.js';
import { buildVotingEmbed, buildVotingButtons } from '../utils/votingEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('startvote')
  .setDescription('Start a new voting session for the next movie night')
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('Planned movie night date/time (e.g., "Saturday 8pm")')
      .setRequired(true));

export const execute = async (interaction) => {
  const datetimeStr = interaction.options.getString('datetime');

  // Check if there's already an active voting session
  const existingSession = await getActiveVotingSession(interaction.guildId);
  if (existingSession) {
    return interaction.reply({
      content: 'There\'s already an active voting session! Use `/endvote` to close it first.',
      ephemeral: true
    });
  }

  // Parse datetime
  let scheduledAt;
  try {
    scheduledAt = parseDateTime(datetimeStr);
    if (isNaN(scheduledAt.getTime())) {
      throw new Error('Invalid date');
    }
  } catch {
    return interaction.reply({
      content: 'Could not parse the date/time. Try formats like "Saturday 8pm" or "2024-01-20 20:00"',
      ephemeral: true
    });
  }

  try {
    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    const timestamp = Math.floor(scheduledAt.getTime() / 1000);

    // Build embed and buttons
    const embed = buildVotingEmbed(null, [], timestamp);
    embed.setFooter({ text: `Started by ${interaction.user.username}` });

    const buttons = buildVotingButtons([]);

    const reply = await interaction.reply({
      embeds: [embed],
      components: buttons,
      fetchReply: true
    });

    // Create voting session in database
    await createVotingSession(
      interaction.guildId,
      interaction.channelId,
      reply.id,
      scheduledAt,
      user.id
    );

  } catch (err) {
    console.error('Error starting vote:', err);
    if (interaction.replied) {
      await interaction.followUp({
        content: 'There was an error starting the voting session.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: 'There was an error starting the voting session.',
        ephemeral: true
      });
    }
  }
};

function parseDateTime(str) {
  // Try ISO format first
  let date = new Date(str);
  if (!isNaN(date.getTime())) {
    return date;
  }

  const now = new Date();

  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lowerStr = str.toLowerCase();

  for (let i = 0; i < days.length; i++) {
    if (lowerStr.includes(days[i])) {
      date = new Date(now);
      const currentDay = date.getDay();
      let daysUntil = i - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      date.setDate(date.getDate() + daysUntil);

      // Extract time if present
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

  // Handle "tomorrow" keyword
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

  // Handle "today" keyword
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

  // Try parsing as "YYYY-MM-DD HH:MM" or similar
  const parts = str.split(/[\s,]+/);
  if (parts.length >= 2) {
    const datePart = parts[0];
    const timePart = parts.slice(1).join(' ');

    date = new Date(datePart);

    const timeMatch = timePart.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch && !isNaN(date.getTime())) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2]) || 0;
      const period = timeMatch[3];

      if (period?.toLowerCase() === 'pm' && hours < 12) hours += 12;
      if (period?.toLowerCase() === 'am' && hours === 12) hours = 0;

      date.setHours(hours, minutes, 0, 0);
      return date;
    }
  }

  return new Date(str);
}
