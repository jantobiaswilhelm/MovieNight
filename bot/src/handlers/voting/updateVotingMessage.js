import { buildVotingEmbed, buildVotingButtons } from '../../utils/votingEmbed.js';
import { isAdmin } from '../../utils/admin.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('updateVotingMessage');

export async function updateVotingMessage(interaction, session, suggestions, showAdminButtons = false) {
  try {
    logger.debug('updateVotingMessage called:', {
      sessionId: session.id,
      channelId: session.channel_id,
      messageId: session.message_id,
      suggestionsCount: suggestions.length
    });

    // Use the session's channel_id instead of interaction.channel
    // This ensures we update the correct message even if the interaction
    // happens in a different context
    const channel = await interaction.client.channels.fetch(session.channel_id);
    if (!channel) {
      logger.error('Could not find channel for voting message:', session.channel_id);
      return;
    }

    logger.debug('Channel found:', channel.id);

    const message = await channel.messages.fetch(session.message_id);
    logger.debug('Message found:', message?.id);

    if (message) {
      const timestamp = Math.floor(new Date(session.scheduled_at).getTime() / 1000);
      const embed = buildVotingEmbed(session, suggestions, timestamp);
      embed.setFooter({ text: `Started by ${session.created_by_name || 'Unknown'}` });

      const buttons = buildVotingButtons(suggestions, showAdminButtons, session.id);

      logger.debug('Editing message with', suggestions.length, 'suggestions');
      await message.edit({
        embeds: [embed],
        components: buttons
      });
      logger.debug('Message edited successfully');
    }
  } catch (err) {
    logger.error('Error updating voting message', err);
  }
}
