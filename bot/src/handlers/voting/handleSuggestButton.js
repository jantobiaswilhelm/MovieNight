import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getActiveVotingSession, getVotingSessionById } from '../../models/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleSuggestButton');

export async function handleSuggestButton(interaction) {
  try {
    // Parse session ID from button customId if present
    const customId = interaction.customId;
    let session;

    logger.debug('handleSuggestButton - customId:', customId);

    if (customId.startsWith('vote_suggest_')) {
      const sessionId = parseInt(customId.replace('vote_suggest_', ''));
      logger.debug('Parsed sessionId from button:', sessionId);
      session = await getVotingSessionById(sessionId);
    } else {
      // Fallback for old buttons without session ID
      logger.debug('Using fallback getActiveVotingSession for button');
      session = await getActiveVotingSession(interaction.guildId);
    }

    logger.debug('Session for modal:', session ? { id: session.id, status: session.status } : null);

    if (!session || session.status !== 'open' || session.guild_id !== interaction.guildId) {
      return interaction.reply({
        content: 'This voting session has ended.',
        ephemeral: true
      });
    }

    // Create and show modal with session ID
    const modalCustomId = `suggest_movie_modal_${session.id}`;
    logger.debug('Creating modal with customId:', modalCustomId);

    const modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Suggest a Movie');

    const titleInput = new TextInputBuilder()
      .setCustomId('movie_title')
      .setLabel('Movie Title')
      .setPlaceholder('Enter the movie name to search')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(255);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput)
    );

    await interaction.showModal(modal);

  } catch (err) {
    logger.error('Error showing suggest modal', err);
    await interaction.reply({
      content: 'There was an error opening the suggestion form.',
      ephemeral: true
    });
  }
}
