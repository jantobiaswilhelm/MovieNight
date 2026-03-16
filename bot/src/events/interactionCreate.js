import { Events } from 'discord.js';
import {
  handleRatingButton,
  handleRatingCommentModal,
  handleSuggestButton,
  handleSuggestModal,
  handleTmdbSelect,
  handleVoteButton,
  handleDeleteSuggestionButton,
  handleCancelVotingButton,
  handleShowAdminButtons
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
    } else if (customId === 'vote_suggest' || customId.startsWith('vote_suggest_')) {
      await handleSuggestButton(interaction);
    } else if (customId.startsWith('vote_for_')) {
      await handleVoteButton(interaction);
    } else if (customId.startsWith('vote_delete_')) {
      await handleDeleteSuggestionButton(interaction);
    } else if (customId === 'vote_cancel_session') {
      await handleCancelVotingButton(interaction);
    } else if (customId === 'vote_show_admin') {
      await handleShowAdminButtons(interaction);
    }
    return;
  }

  // Handle modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'suggest_movie_modal' || interaction.customId.startsWith('suggest_movie_modal_')) {
      await handleSuggestModal(interaction);
    } else if (interaction.customId.startsWith('rating_comment_modal_')) {
      await handleRatingCommentModal(interaction);
    }
    return;
  }

  // Handle select menu interactions
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId.startsWith('tmdb_select_')) {
      await handleTmdbSelect(interaction);
    }
    return;
  }
};
