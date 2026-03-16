import {
  getActiveVotingSession,
  getSuggestionById,
  deleteSuggestion,
  getSuggestionsForSession
} from '../../models/index.js';
import { isAdmin } from '../../utils/admin.js';
import { updateVotingMessage } from './updateVotingMessage.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleDeleteSuggestion');

export async function handleDeleteSuggestionButton(interaction) {
  try {
    // Check if user is admin
    if (!isAdmin(interaction.user.id)) {
      return interaction.reply({
        content: 'You do not have permission to delete suggestions.',
        ephemeral: true
      });
    }

    const suggestionId = parseInt(interaction.customId.replace('vote_delete_', ''));

    // Get suggestion to verify it exists
    const suggestion = await getSuggestionById(suggestionId);
    if (!suggestion) {
      return interaction.reply({
        content: 'This suggestion no longer exists.',
        ephemeral: true
      });
    }

    // Check if there's an active voting session (already scoped by guild)
    const session = await getActiveVotingSession(interaction.guildId);
    if (!session) {
      return interaction.reply({
        content: 'This voting session has ended.',
        ephemeral: true
      });
    }

    // Verify suggestion belongs to this session
    if (suggestion.voting_session_id !== session.id) {
      return interaction.reply({
        content: 'This suggestion does not belong to the current voting session.',
        ephemeral: true
      });
    }

    // Delete the suggestion
    await deleteSuggestion(suggestionId);

    // Get updated suggestions
    const suggestions = await getSuggestionsForSession(session.id);

    // Update the voting message with admin buttons
    await updateVotingMessage(interaction, session, suggestions, true);

    await interaction.reply({
      content: `Deleted suggestion: **${suggestion.title}**`,
      ephemeral: true
    });

  } catch (err) {
    logger.error('Error deleting suggestion', err);
    await interaction.reply({
      content: 'There was an error deleting the suggestion.',
      ephemeral: true
    });
  }
}
