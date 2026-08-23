import { SlashCommandBuilder } from 'discord.js';
import { renderView } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('stats');

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View movie night statistics for this server');

export const execute = async (interaction) => {
  try {
    const payload = await renderView('stats', {
      guildId: interaction.guildId,
      user: interaction.user,
      args: ['all']
    });
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error fetching stats', err);
    await interaction.reply({
      content: 'There was an error fetching statistics.',
      ephemeral: true
    });
  }
};
