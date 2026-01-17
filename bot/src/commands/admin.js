import { SlashCommandBuilder } from 'discord.js';
import { getActiveVotingSession, getSuggestionsForSession } from '../models/index.js';
import { buildVotingEmbed, buildVotingButtons } from '../utils/votingEmbed.js';
import { isAdmin } from '../utils/admin.js';

export const data = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Show admin controls on the voting message (Admin only)');

export const execute = async (interaction) => {
  // Check if user is admin
  if (!isAdmin(interaction.user.id)) {
    return interaction.reply({
      content: 'You do not have permission to use admin controls.',
      ephemeral: true
    });
  }

  try {
    // Check if there's an active voting session
    const session = await getActiveVotingSession(interaction.guildId);
    if (!session) {
      return interaction.reply({
        content: 'There\'s no active voting session.',
        ephemeral: true
      });
    }

    // Get suggestions
    const suggestions = await getSuggestionsForSession(session.id);

    // Update the voting message with admin buttons
    try {
      const channel = await interaction.client.channels.fetch(session.channel_id);
      if (channel) {
        const message = await channel.messages.fetch(session.message_id);
        if (message) {
          const timestamp = Math.floor(new Date(session.scheduled_at).getTime() / 1000);
          const embed = buildVotingEmbed(session, suggestions, timestamp);
          embed.setFooter({ text: `Started by ${session.created_by_name || 'Unknown'} | Admin mode` });

          const buttons = buildVotingButtons(suggestions, true);

          await message.edit({
            embeds: [embed],
            components: buttons
          });
        }
      }
    } catch (err) {
      console.error('Error updating voting message:', err);
      return interaction.reply({
        content: 'Could not find or update the voting message.',
        ephemeral: true
      });
    }

    await interaction.reply({
      content: 'Admin controls are now visible on the voting message.\n\n**Available actions:**\n• 🗑️ Cancel Voting - Delete the entire voting session\n• Del #N - Delete individual suggestions',
      ephemeral: true
    });

  } catch (err) {
    console.error('Error showing admin controls:', err);
    await interaction.reply({
      content: 'There was an error showing admin controls.',
      ephemeral: true
    });
  }
};
