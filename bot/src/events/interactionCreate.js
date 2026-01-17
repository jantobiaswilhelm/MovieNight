import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import {
  findOrCreateUser,
  getMovieNightById,
  upsertRating,
  getUserRating,
  getActiveVotingSession,
  getVotingSessionById,
  createSuggestion,
  getSuggestionsForSession,
  castVote,
  getSuggestionById,
  getUserVoteForSession,
  deleteSuggestion,
  deleteVotingSession
} from '../models/index.js';
import { buildVotingEmbed, buildVotingButtons } from '../utils/votingEmbed.js';
import { isAdmin } from '../utils/admin.js';

export const name = Events.InteractionCreate;

export const execute = async (interaction) => {
  // Handle slash commands
  if (interaction.isChatInputCommand()) {
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error executing ${interaction.commandName}:`, error);

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
      console.error(`Autocomplete error for ${interaction.commandName}:`, error);
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
    }
    return;
  }
};

async function handleRatingButton(interaction) {
  const parts = interaction.customId.split('_');
  const movieId = parseInt(parts[1]);
  const score = parseInt(parts[2]);

  try {
    // Get movie
    const movie = await getMovieNightById(movieId);
    if (!movie) {
      return interaction.reply({
        content: 'Movie not found.',
        ephemeral: true
      });
    }

    // Check if movie has started
    if (!movie.started_at) {
      return interaction.reply({
        content: 'This movie has not started yet. Ratings will be available once the movie night begins.',
        ephemeral: true
      });
    }

    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Check for existing rating
    const existingRating = await getUserRating(movieId, interaction.user.id);

    // Save rating
    await upsertRating(movieId, user.id, score);

    const action = existingRating ? 'updated' : 'submitted';
    await interaction.reply({
      content: `Rating ${action}! You gave **${movie.title}** a **${score}/10**\n*Use /rate for half-point ratings like 7.5*`,
      ephemeral: true
    });

  } catch (err) {
    console.error('Error handling rating button:', err);
    await interaction.reply({
      content: 'There was an error saving your rating.',
      ephemeral: true
    });
  }
}

async function handleSuggestButton(interaction) {
  try {
    // Parse session ID from button customId if present
    const customId = interaction.customId;
    let session;

    console.log('handleSuggestButton - customId:', customId);

    if (customId.startsWith('vote_suggest_')) {
      const sessionId = parseInt(customId.replace('vote_suggest_', ''));
      console.log('Parsed sessionId from button:', sessionId);
      session = await getVotingSessionById(sessionId);
    } else {
      // Fallback for old buttons without session ID
      console.log('Using fallback getActiveVotingSession for button');
      session = await getActiveVotingSession(interaction.guildId);
    }

    console.log('Session for modal:', session ? { id: session.id, status: session.status } : null);

    if (!session || session.status !== 'open') {
      return interaction.reply({
        content: 'This voting session has ended.',
        ephemeral: true
      });
    }

    // Create and show modal with session ID
    const modalCustomId = `suggest_movie_modal_${session.id}`;
    console.log('Creating modal with customId:', modalCustomId);

    const modal = new ModalBuilder()
      .setCustomId(modalCustomId)
      .setTitle('Suggest a Movie');

    const titleInput = new TextInputBuilder()
      .setCustomId('movie_title')
      .setLabel('Movie Title')
      .setPlaceholder('Enter the movie name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(255);

    const imageInput = new TextInputBuilder()
      .setCustomId('movie_image')
      .setLabel('Poster Image URL')
      .setPlaceholder('https://example.com/poster.jpg')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(imageInput)
    );

    await interaction.showModal(modal);

  } catch (err) {
    console.error('Error showing suggest modal:', err);
    await interaction.reply({
      content: 'There was an error opening the suggestion form.',
      ephemeral: true
    });
  }
}

async function handleSuggestModal(interaction) {
  try {
    const title = interaction.fields.getTextInputValue('movie_title');
    const imageUrl = interaction.fields.getTextInputValue('movie_image');

    // Parse session ID from modal customId if present
    const customId = interaction.customId;
    let session;

    console.log('handleSuggestModal - customId:', customId);

    if (customId.startsWith('suggest_movie_modal_')) {
      const sessionId = parseInt(customId.replace('suggest_movie_modal_', ''));
      console.log('Parsed sessionId:', sessionId);
      session = await getVotingSessionById(sessionId);
    } else {
      // Fallback for old modals without session ID
      console.log('Using fallback getActiveVotingSession');
      session = await getActiveVotingSession(interaction.guildId);
    }

    console.log('Session found:', session ? { id: session.id, status: session.status, channel_id: session.channel_id } : null);

    if (!session || session.status !== 'open') {
      return interaction.reply({
        content: 'This voting session has ended.',
        ephemeral: true
      });
    }

    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Create suggestion
    await createSuggestion(session.id, title, imageUrl, user.id);

    // Get updated suggestions
    const suggestions = await getSuggestionsForSession(session.id);

    // Update the original voting message
    const userIsAdmin = isAdmin(interaction.user.id);
    await updateVotingMessage(interaction, session, suggestions, userIsAdmin);

    await interaction.reply({
      content: `Your suggestion **${title}** has been added!`,
      ephemeral: true
    });

  } catch (err) {
    console.error('Error handling suggest modal:', err);
    await interaction.reply({
      content: 'There was an error adding your suggestion.',
      ephemeral: true
    });
  }
}

async function handleVoteButton(interaction) {
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

    // Check if there's an active voting session
    const session = await getActiveVotingSession(interaction.guildId);
    if (!session) {
      return interaction.reply({
        content: 'This voting session has ended.',
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
    console.error('Error handling vote button:', err);
    await interaction.reply({
      content: 'There was an error recording your vote.',
      ephemeral: true
    });
  }
}

async function handleDeleteSuggestionButton(interaction) {
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

    // Check if there's an active voting session
    const session = await getActiveVotingSession(interaction.guildId);
    if (!session) {
      return interaction.reply({
        content: 'This voting session has ended.',
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
    console.error('Error deleting suggestion:', err);
    await interaction.reply({
      content: 'There was an error deleting the suggestion.',
      ephemeral: true
    });
  }
}

async function handleCancelVotingButton(interaction) {
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
          content: '🗑️ **This voting session was cancelled.**',
          embeds: [],
          components: []
        });
      }
    } catch (err) {
      console.error('Error updating cancelled voting message:', err);
    }

    await interaction.reply({
      content: 'Voting session has been cancelled and deleted.',
      ephemeral: true
    });

  } catch (err) {
    console.error('Error cancelling voting session:', err);
    await interaction.reply({
      content: 'There was an error cancelling the voting session.',
      ephemeral: true
    });
  }
}

async function handleShowAdminButtons(interaction) {
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
    console.error('Error showing admin buttons:', err);
    await interaction.reply({
      content: 'There was an error showing admin controls.',
      ephemeral: true
    });
  }
}

async function updateVotingMessage(interaction, session, suggestions, showAdminButtons = false) {
  try {
    console.log('updateVotingMessage called:', {
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
      console.error('Could not find channel for voting message:', session.channel_id);
      return;
    }

    console.log('Channel found:', channel.id);

    const message = await channel.messages.fetch(session.message_id);
    console.log('Message found:', message?.id);

    if (message) {
      const timestamp = Math.floor(new Date(session.scheduled_at).getTime() / 1000);
      const embed = buildVotingEmbed(session, suggestions, timestamp);
      embed.setFooter({ text: `Started by ${session.created_by_name || 'Unknown'}` });

      const buttons = buildVotingButtons(suggestions, showAdminButtons, session.id);

      console.log('Editing message with', suggestions.length, 'suggestions');
      await message.edit({
        embeds: [embed],
        components: buttons
      });
      console.log('Message edited successfully');
    }
  } catch (err) {
    console.error('Error updating voting message:', err);
  }
}
