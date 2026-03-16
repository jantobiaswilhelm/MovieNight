import { SlashCommandBuilder } from 'discord.js';
import { getUserRatings } from '../models/index.js';
import { createMyRatingsEmbed } from '../utils/embeds.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('myratings');

export const data = new SlashCommandBuilder()
  .setName('myratings')
  .setDescription('View your personal ratings');

export const execute = async (interaction) => {
  try {
    const ratings = await getUserRatings(interaction.user.id, 15);
    const embed = createMyRatingsEmbed(ratings, interaction.user.username);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (err) {
    logger.error('Error fetching ratings', err);
    await interaction.reply({
      content: 'There was an error fetching your ratings.',
      ephemeral: true
    });
  }
};
