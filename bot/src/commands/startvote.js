import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { findOrCreateUser, createVotingSession, getActiveVotingSession, getSuggestionsForSession } from '../models/index.js';
import { buildVotingEmbed, buildVotingButtons } from '../utils/votingEmbed.js';
import { isAdmin } from '../utils/admin.js';
import { parseDateTime } from '../utils/dateTime.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('startvote');

export const data = new SlashCommandBuilder()
  .setName('startvote')
  .setDescription('Start a new voting session for the next movie night')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addStringOption(option =>
    option.setName('datetime')
      .setDescription('Planned movie night date/time (e.g., "Saturday 8pm")')
      .setRequired(true));

export const execute = async (interaction) => {
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: 'You do not have permission to start voting sessions.',
      ephemeral: true
    });
  }

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

    // First send the message to get the message ID
    const embed = buildVotingEmbed(null, [], timestamp);
    embed.setFooter({ text: `Started by ${interaction.user.username}` });

    // Initially send without session ID (we'll update after creating session)
    const reply = await interaction.reply({
      embeds: [embed],
      components: buildVotingButtons([]),
      fetchReply: true
    });

    // Create voting session in database
    const session = await createVotingSession(
      interaction.guildId,
      interaction.channelId,
      reply.id,
      scheduledAt,
      user.id
    );

    // Update the message to include session ID in buttons
    await reply.edit({
      embeds: [embed],
      components: buildVotingButtons([], false, session.id)
    });

    // Send follow-up message with website link
    await interaction.followUp({
      content: `🎬 **Vote for the next movie night!** Click the button above to add your suggestion.${process.env.FRONTEND_URL ? `\n\n📱 You can also check out our website: ${process.env.FRONTEND_URL}` : ''}`
    });

  } catch (err) {
    logger.error('Error starting vote', err);
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

