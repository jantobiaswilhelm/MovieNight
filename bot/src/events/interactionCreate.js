import { Events } from 'discord.js';
import {
  handleRatingButton,
  handleRatingCommentModal,
  handleRsvpButton
} from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('interactionCreate');

export const name = Events.InteractionCreate;

export const execute = async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      logger.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error(`Error executing ${interaction.commandName}`, error);

      const errorMessage = { content: 'There was an error executing this command!', ephemeral: true };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorMessage);
      } else {
        await interaction.reply(errorMessage);
      }
    }
    return;
  }

  // Handle autocomplete
  if (interaction.isAutocomplete()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command || !command.autocomplete) {
      return;
    }

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      logger.error(`Autocomplete error for ${interaction.commandName}`, error);
    }
    return;
  }

  // Handle button interactions
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('rate_')) {
      await handleRatingButton(interaction);
    } else if (customId.startsWith('rsvp_')) {
      await handleRsvpButton(interaction);
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('rating_comment_modal_')) {
      await handleRatingCommentModal(interaction);
    }
    return;
  }
};
