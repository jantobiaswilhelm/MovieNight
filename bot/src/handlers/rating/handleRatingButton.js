import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getMovieNightById } from '../../models/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleRatingButton');

export async function handleRatingButton(interaction) {
  const parts = interaction.customId.split('_');
  const movieId = parseInt(parts[1]);
  const score = parseInt(parts[2]);

  // Validate score range
  if (isNaN(score) || score < 1 || score > 10) {
    return interaction.reply({
      content: 'Invalid rating score.',
      ephemeral: true
    });
  }

  try {
    // Get movie
    const movie = await getMovieNightById(movieId);
    if (!movie || movie.guild_id !== interaction.guildId) {
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
    logger.error('Error handling rating button', err);
    await interaction.reply({
      content: 'There was an error processing your rating.',
      ephemeral: true
    });
  }
}
