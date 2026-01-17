import { SlashCommandBuilder } from 'discord.js';
import { findOrCreateUser, createMovieNight } from '../models/index.js';
import { createAnnouncementEmbed, createRatingButtons, createRatingPromptEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('announce')
  .setDescription('Announce a new movie night')
  .addStringOption(option =>
    option.setName('title')
      .setDescription('The movie title')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('When the movie night starts (e.g., "2024-01-20 20:00" or "tomorrow 8pm")')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('image')
      .setDescription('URL to a movie poster or image')
      .setRequired(true));

export const execute = async (interaction) => {
  const title = interaction.options.getString('title');
  const datetimeStr = interaction.options.getString('datetime');
  const imageUrl = interaction.options.getString('image');

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
    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Send announcement first to get message ID
    const announcementEmbed = createAnnouncementEmbed(
      title,
      scheduledAt,
      imageUrl,
      interaction.user.username
    );

    const reply = await interaction.reply({
      embeds: [announcementEmbed],
      fetchReply: true
    });

    // Create movie night in database
    const movieNight = await createMovieNight(
      title,
      scheduledAt,
      user.id,
      interaction.guildId,
      interaction.channelId,
      reply.id,
      imageUrl
    );

    // Send rating prompt as follow-up
    const ratingEmbed = createRatingPromptEmbed(title);
    const ratingButtons = createRatingButtons(movieNight.id);

    await interaction.followUp({
      embeds: [ratingEmbed],
      components: ratingButtons
    });

  } catch (err) {
    console.error('Error creating movie night:', err);
    if (interaction.replied) {
      await interaction.followUp({
        content: 'There was an error creating the movie night.',
        ephemeral: true
      });
    } else {
      await interaction.reply({
        content: 'There was an error creating the movie night.',
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

  // Try common formats
  const now = new Date();

  // Handle "tomorrow" keyword
  if (str.toLowerCase().includes('tomorrow')) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);

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

  // Handle "today" keyword
  if (str.toLowerCase().includes('today')) {
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
