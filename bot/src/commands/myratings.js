import { SlashCommandBuilder } from 'discord.js';
import { renderView } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('myratings');

export const data = new SlashCommandBuilder()
  .setName('myratings')
  .setDescription('View your personal ratings');

export const execute = async (interaction) => {
  try {
    const payload = await renderView('myratings', {
      guildId: interaction.guildId,
      user: interaction.user,
      args: ['1', 'recent']
    });
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error fetching ratings', err);
    await interaction.reply({
      content: 'There was an error fetching your ratings.',
      ephemeral: true
    });
  }
};
