import { SlashCommandBuilder } from 'discord.js';
import { getGuildStats, getTopRatedMovies, getMostActiveRaters } from '../models/index.js';
import { createStatsEmbed } from '../utils/embeds.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View movie night statistics for this server');

export const execute = async (interaction) => {
  try {
    const [stats, topMovies, topRaters] = await Promise.all([
      getGuildStats(interaction.guildId),
      getTopRatedMovies(interaction.guildId, 5),
      getMostActiveRaters(interaction.guildId, 5)
    ]);

    const embed = createStatsEmbed(stats, topMovies, topRaters);
    await interaction.reply({ embeds: [embed] });
  } catch (err) {
    console.error('Error fetching stats:', err);
    await interaction.reply({
      content: 'There was an error fetching statistics.',
      ephemeral: true
    });
  }
};
