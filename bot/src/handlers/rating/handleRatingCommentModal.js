import {
  findOrCreateUser,
  getMovieNightById,
  upsertRating,
  getUserRating
} from '../../models/index.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('handleRatingCommentModal');

export async function handleRatingCommentModal(interaction) {
  // Parse movieId and score from customId: rating_comment_modal_{movieId}_{score}
  const parts = interaction.customId.split('_');
  const movieId = parseInt(parts[3]);
  const score = parseInt(parts[4]);
  const comment = interaction.fields.getTextInputValue('rating_comment')?.trim() || null;

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
    logger.error('Error handling rating comment modal', err);
    await interaction.reply({
      content: 'There was an error saving your rating.',
      ephemeral: true
    });
  }
}
