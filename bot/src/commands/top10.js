import { SlashCommandBuilder } from 'discord.js';
import { findOrCreateUser } from '../models/index.js';
import { renderView } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('top10');

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
    const target = interaction.options.getUser('user') || interaction.user;

    // The target may never have used the bot, in which case they have no row to
    // join against — this makes the lookup below return empty rather than fail.
    await findOrCreateUser(target.id, target.username, target.avatar);

    const payload = await renderView('top10', {
      guildId: interaction.guildId,
      user: interaction.user,
      target
    });
    await interaction.reply(payload);
  } catch (err) {
    logger.error('Error fetching top 10', err);
    await interaction.reply({
      content: 'There was an error fetching the top 10 movies.',
      ephemeral: true
    });
  }
};
