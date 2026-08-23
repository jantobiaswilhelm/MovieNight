import { SlashCommandBuilder } from 'discord.js';
import { renderView } from '../handlers/index.js';
import { HISTORY_PAGE_SIZE } from '../utils/commandEmbeds.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('history');

export const data = new SlashCommandBuilder()
  .setName('history')
  .setDescription('View past movie nights')
  .addIntegerOption(option =>
    option.setName('count')
      .setDescription(`Movies per page (default: ${HISTORY_PAGE_SIZE})`)
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(25));

export const execute = async (interaction) => {
  const pageSize = interaction.options.getInteger('count') || HISTORY_PAGE_SIZE;

  try {
    const payload = await renderView('history', {
      guildId: interaction.guildId,
      user: interaction.user,
      args: ['1', String(pageSize)]
    });
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error fetching history', err);
    await interaction.reply({
      content: 'There was an error fetching movie history.',
      ephemeral: true
    });
  }
};
