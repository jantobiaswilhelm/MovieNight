import { SlashCommandBuilder } from 'discord.js';
import { getMovieNights } from '../models/index.js';
import { createHistoryEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View past movie nights')
  .addIntegerOption(option =>
    option.setName('count')
      .setDescription('Number of movies to show (default: 10)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25));

export const execute = async (interaction) => {
  const count = interaction.options.getInteger('count') || 10;

  try {
    const movies = await getMovieNights(interaction.guildId, count);
    const embed = createHistoryEmbed(movies);

    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('Error fetching history:', err);
    await interaction.reply({
      content: 'There was an error fetching movie history.',
      ephemeral: true
    });
  }
};
