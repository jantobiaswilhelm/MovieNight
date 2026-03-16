import { getActiveVotingSession, deleteVotingSession } from '../../models/index.js';
import { isAdmin } from '../../utils/admin.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleCancelVoting');

export async function handleCancelVotingButton(interaction) {
  try {
    // Check if user is admin
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: 'You do not have permission to cancel voting sessions.',
        ephemeral: true
      });
    }

    // Check if there's an active voting session
    const session = await getActiveVotingSession(interaction.guildId);
    if (!session) {
      return interaction.reply({
        content: 'This voting session has already ended.',
        ephemeral: true
      });
    }

    // Delete the voting session
    await deleteVotingSession(session.id);

    // Update the message to show it was cancelled
    try {
      const channel = interaction.channel;
      const message = await channel.messages.fetch(session.message_id);
      if (message) {
        await message.edit({
          content: '\uD83D\uDDD1\uFE0F **This voting session was cancelled.**',
          embeds: [],
          components: []
        });
      }
    } catch (err) {
      logger.error('Error updating cancelled voting message', err);
    }

    await interaction.reply({
      content: 'Voting session has been cancelled and deleted.',
      ephemeral: true
    });

  } catch (err) {
    logger.error('Error cancelling voting session', err);
    await interaction.reply({
      content: 'There was an error cancelling the voting session.',
      ephemeral: true
    });
  }
}
