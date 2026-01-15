import { Events } from 'discord.js';
import { findOrCreateUser, getMovieNightById, upsertRating, getUserRating } from '../models/index.js';

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

  // Handle button interactions (ratings)
  if (interaction.isButton()) {
    const customId = interaction.customId;

    if (customId.startsWith('rate_')) {
      await handleRatingButton(interaction);
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
