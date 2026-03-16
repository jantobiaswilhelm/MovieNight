import { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } from 'discord.js';
import {
  findOrCreateUser,
  getActiveVotingSession,
  getVotingSessionById,
  createSuggestion,
  getSuggestionsForSession
} from '../../models/index.js';
import { isAdmin } from '../../utils/admin.js';
import { searchMovies } from '../../utils/tmdb.js';
import { updateVotingMessage } from './updateVotingMessage.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleSuggestModal');

export async function handleSuggestModal(interaction) {
  try {
    const searchQuery = interaction.fields.getTextInputValue('movie_title');

    // Parse session ID from modal customId if present
    const customId = interaction.customId;
    let session;

    logger.debug('handleSuggestModal - customId:', customId);

    if (customId.startsWith('suggest_movie_modal_')) {
      const sessionId = parseInt(customId.replace('suggest_movie_modal_', ''));
      logger.debug('Parsed sessionId:', sessionId);
      session = await getVotingSessionById(sessionId);
    } else {
      // Fallback for old modals without session ID
      logger.debug('Using fallback getActiveVotingSession');
      session = await getActiveVotingSession(interaction.guildId);
    }

    logger.debug('Session found:', session ? { id: session.id, status: session.status, channel_id: session.channel_id } : null);

    if (!session || session.status !== 'open' || session.guild_id !== interaction.guildId) {
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
    logger.error('Error handling suggest modal', err);
    await interaction.reply({
      content: 'There was an error processing your suggestion.',
      ephemeral: true
    });
  }
}
