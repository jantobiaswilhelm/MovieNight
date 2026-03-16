import { getActiveVotingSession, getSuggestionsForSession } from '../../models/index.js';
import { isAdmin } from '../../utils/admin.js';
import { updateVotingMessage } from './updateVotingMessage.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleShowAdminButtons');

export async function handleShowAdminButtons(interaction) {
  try {
    // Check if user is admin
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: 'You do not have permission to access admin controls.',
        ephemeral: true
      });
    }

    const session = await getActiveVotingSession(interaction.guildId);
    if (!session) {
      return interaction.reply({
        content: 'This voting session has ended.',
        ephemeral: true
      });
    }

    const suggestions = await getSuggestionsForSession(session.id);
    await updateVotingMessage(interaction, session, suggestions, true);

    await interaction.reply({
      content: 'Admin controls are now visible.',
      ephemeral: true
    });

  } catch (err) {
    logger.error('Error showing admin buttons', err);
    await interaction.reply({
      content: 'There was an error showing admin controls.',
      ephemeral: true
    });
  }
}
