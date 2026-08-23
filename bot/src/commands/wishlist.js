import { SlashCommandBuilder } from 'discord.js';
import { renderView } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('wishlist');

export const data = new SlashCommandBuilder()
  .setName('wishlist')
  .setDescription('See your wishlist, the server\'s, or let the bot pick one')
  .addBooleanOption(option =>
    option.setName('server')
      .setDescription('Show what the whole server wants instead of just your list')
      .setRequired(false));

export const execute = async (interaction) => {
  const scope = interaction.options.getBoolean('server') ? 'guild' : 'me';

  try {
    const payload = await renderView('wishlist', {
      guildId: interaction.guildId,
      user: interaction.user,
      args: [scope]
    });

    // Ephemeral: a wishlist is personal, and the picker invites repeat spins —
    // neither should fill the channel.
    await interaction.reply({ ...payload, ephemeral: true });
  } catch (err) {
    logger.error('Error fetching wishlist', err);
    await interaction.reply({
      content: 'There was an error fetching the wishlist.',
      ephemeral: true
    });
  }
};
