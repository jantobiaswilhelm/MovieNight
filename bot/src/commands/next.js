import { SlashCommandBuilder } from 'discord.js';
import { renderNextView, DEFAULT_COUNT, MAX_COUNT } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('next');

export const data = new SlashCommandBuilder()
  .setName('next')
  .setDescription('See what movies are coming up')
  .addIntegerOption(option =>
    option.setName('count')
      .setDescription(`Number of movies to show (default: ${DEFAULT_COUNT})`)
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(MAX_COUNT));

export const execute = async (interaction) => {
  const count = interaction.options.getInteger('count') || DEFAULT_COUNT;

  try {
    const payload = await renderNextView(interaction.guildId, 'list', count);
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error fetching upcoming movies', err);
    await interaction.reply({
      content: 'There was an error fetching upcoming movies.',
      ephemeral: true
    });
  }
};
