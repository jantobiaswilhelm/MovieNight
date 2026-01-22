import { Events, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
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
import { searchMovies, getMovieDetails } from '../utils/tmdb.js';

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

    // Show modal for optional comment
    const modal = new ModalBuilder()
      .setCustomId(`rating_comment_modal_${movieId}_${score}`)
      .setTitle(`Rate: ${movie.title.slice(0, 30)}${movie.title.length > 30 ? '...' : ''}`);

    const commentInput = new TextInputBuilder()
      .setCustomId('rating_comment')
      .setLabel(`Your rating: ${score}/10 - Add a comment? (optional)`)
      .setPlaceholder('Share your thoughts about the movie...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(
      new ActionRowBuilder().addComponents(commentInput)
    );

    await interaction.showModal(modal);

  } catch (err) {
    console.error('Error handling rating button:', err);
    await interaction.reply({
      content: 'There was an error processing your rating.',
      ephemeral: true
    });
  }
}

async function handleRatingCommentModal(interaction) {
  // Parse movieId and score from customId: rating_comment_modal_{movieId}_{score}
  const parts = interaction.customId.split('_');
  const movieId = parseInt(parts[3]);
  const score = parseInt(parts[4]);
  const comment = interaction.fields.getTextInputValue('rating_comment')?.trim() || null;

  try {
    // Get movie
    const movie = await getMovieNightById(movieId);
    if (!movie) {
      return interaction.reply({
        content: 'Movie not found.',
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

    // Save rating with optional comment
    await upsertRating(movieId, user.id, score, comment);

    const action = existingRating ? 'updated' : 'submitted';
    let replyContent = `Rating ${action}! You gave **${movie.title}** a **${score}/10**`;
    if (comment) {
      replyContent += `\n> "${comment}"`;
    }
    replyContent += '\n*Use /rate for half-point ratings like 7.5*';

    await interaction.reply({
      content: replyContent,
      ephemeral: true
    });

  } catch (err) {
    console.error('Error handling rating comment modal:', err);
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
      .setPlaceholder('Enter the movie name to search')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(255);

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput)
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
    const searchQuery = interaction.fields.getTextInputValue('movie_title');

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

    // Search TMDB for movies
    const movies = await searchMovies(searchQuery, 10);

    if (movies.length === 0) {
      // No results - add as manual entry
      const user = await findOrCreateUser(
        interaction.user.id,
        interaction.user.username,
        interaction.user.avatar
      );

      await createSuggestion(session.id, searchQuery, null, user.id, {});

      const suggestions = await getSuggestionsForSession(session.id);
      const userIsAdmin = isAdmin(interaction.user.id);
      await updateVotingMessage(interaction, session, suggestions, userIsAdmin);

      return interaction.reply({
        content: `No movies found on TMDB for "${searchQuery}", but I've added it as a manual entry!`,
        ephemeral: true
      });
    }

    // Build select menu with movie options
    const selectOptions = movies.map(movie => ({
      label: movie.year ? `${movie.title} (${movie.year})`.slice(0, 100) : movie.title.slice(0, 100),
      description: movie.overview?.slice(0, 100) || 'No description available',
      value: `${movie.id}`
    }));

    // Add manual entry option
    selectOptions.push({
      label: `Add "${searchQuery.slice(0, 80)}" manually`,
      description: 'Add without TMDB data',
      value: `manual:${searchQuery}`
    });

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`tmdb_select_${session.id}`)
      .setPlaceholder('Select the correct movie')
      .addOptions(selectOptions.slice(0, 25)); // Discord limit is 25

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
      .setColor(0xf43f5e)
      .setTitle(`Search results for "${searchQuery}"`)
      .setDescription('Select the movie you want to suggest:')
      .setFooter({ text: 'Select from dropdown below' });

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });

  } catch (err) {
    console.error('Error handling suggest modal:', err);
    await interaction.reply({
      content: 'There was an error processing your suggestion.',
      ephemeral: true
    });
  }
}

async function handleTmdbSelect(interaction) {
  try {
    const sessionId = parseInt(interaction.customId.replace('tmdb_select_', ''));
    const selectedValue = interaction.values[0];

    const session = await getVotingSessionById(sessionId);
    if (!session || session.status !== 'open') {
      return interaction.update({
        content: 'This voting session has ended.',
        embeds: [],
        components: []
      });
    }

    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    let title, imageUrl, tmdbData = {};

    if (selectedValue.startsWith('manual:')) {
      // Manual entry
      title = selectedValue.replace('manual:', '');
      imageUrl = null;
    } else {
      // TMDB selection
      const tmdbId = parseInt(selectedValue);
      const movie = await getMovieDetails(tmdbId);

      if (!movie) {
        return interaction.update({
          content: 'Could not fetch movie details. Please try again.',
          embeds: [],
          components: []
        });
      }

      title = movie.year ? `${movie.title} (${movie.year})` : movie.title;
      imageUrl = movie.posterPath;
      tmdbData = {
        description: movie.overview,
        tmdbId: movie.id,
        tmdbRating: movie.rating,
        genres: movie.genres,
        runtime: movie.runtime,
        releaseYear: movie.year,
        backdropUrl: movie.backdropPath,
        tagline: movie.tagline,
        imdbId: movie.imdbId,
        originalLanguage: movie.originalLanguage,
        collectionName: movie.collectionName,
        trailerUrl: movie.trailerUrl
      };
    }

    // Create suggestion
    await createSuggestion(session.id, title, imageUrl, user.id, tmdbData);

    // Get updated suggestions and update voting message
    const suggestions = await getSuggestionsForSession(session.id);
    const userIsAdmin = isAdmin(interaction.user.id);
    await updateVotingMessage(interaction, session, suggestions, userIsAdmin);

    // Build confirmation embed
    const confirmEmbed = new EmbedBuilder()
      .setColor(0x4ade80)
      .setTitle('Movie Suggested!')
      .setDescription(`**${title}** has been added to the voting.`);

    if (imageUrl) {
      confirmEmbed.setThumbnail(imageUrl);
    }

    await interaction.update({
      embeds: [confirmEmbed],
      components: []
    });

  } catch (err) {
    console.error('Error handling TMDB select:', err);
    await interaction.update({
      content: 'There was an error adding your suggestion.',
      embeds: [],
      components: []
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
