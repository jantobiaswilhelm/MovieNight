import { SlashCommandBuilder } from 'discord.js';
import { getUserTopRatedMovies, findOrCreateUser } from '../models/index.js';
import { createTop10Embed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('top10')
  .setDescription('View your top 10 highest rated movies')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('View another user\'s top 10 (optional)')
      .setRequired(false)
  );

export const execute = async (interaction) => {
  try {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Ensure user exists in database
    await findOrCreateUser(
      targetUser.id,
      targetUser.username,
      targetUser.avatar
    );

    const movies = await getUserTopRatedMovies(targetUser.id, 10);
    const embed = createTop10Embed(movies, targetUser.username);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('Error fetching top 10:', err);
    await interaction.reply({
      content: 'There was an error fetching the top 10 movies.',
      ephemeral: true
    });
  }
};
