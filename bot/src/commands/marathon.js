import { SlashCommandBuilder } from 'discord.js';
import { renderView } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('marathon');

export const data = new SlashCommandBuilder()
  .setName('marathon')
  .setDescription('See a running marathon and what is left in it');

export const execute = async (interaction) => {
  try {
    const payload = await renderView('marathon', {
      guildId: interaction.guildId,
      user: interaction.user,
      args: []
    });
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error fetching marathon', err);
    await interaction.reply({
      content: 'There was an error fetching the marathon.',
      ephemeral: true
    });
  }
};
