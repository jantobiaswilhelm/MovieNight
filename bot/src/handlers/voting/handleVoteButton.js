import {
  findOrCreateUser,
  getActiveVotingSession,
  getSuggestionById,
  getUserVoteForSession,
  castVote,
  getSuggestionsForSession
} from '../../models/index.js';
import { isAdmin } from '../../utils/admin.js';
import { updateVotingMessage } from './updateVotingMessage.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleVoteButton');

export async function handleVoteButton(interaction) {
  try {
    const suggestionId = parseInt(interaction.customId.replace('vote_for_', ''));

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

    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Check if user already voted
    const existingVote = await getUserVoteForSession(session.id, user.id);
    const action = existingVote ? 'changed' : 'recorded';

    // Cast vote (this will update if they already voted for a different movie)
    await castVote(suggestionId, user.id);

    // Get updated suggestions
    const suggestions = await getSuggestionsForSession(session.id);

    // Update the voting message
    const userIsAdmin = isAdmin(interaction.user.id);
    await updateVotingMessage(interaction, session, suggestions, userIsAdmin);

    await interaction.reply({
      content: `Vote ${action}! You voted for **${suggestion.title}**`,
      ephemeral: true
    });

  } catch (err) {
    logger.error('Error handling vote button', err);
    await interaction.reply({
      content: 'There was an error recording your vote.',
      ephemeral: true
    });
  }
}
