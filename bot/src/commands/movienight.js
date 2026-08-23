import { SlashCommandBuilder } from 'discord.js';
import { renderView } from '../handlers/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('movienight');

/**
 * The hub. Shared with /help, which is the same screen under the name people
 * reach for by reflex — Discord has no command aliases, so it is two
 * registrations over one renderer rather than a duplicate implementation.
 */
export const executeHub = async (interaction, name) => {
  try {
    const payload = await renderView('hub', {
      guildId: interaction.guildId,
      user: interaction.user,
      args: []
    });

    // Ephemeral: this is personal navigation. One person browsing should not
    // drag everyone else's view around, which is the opposite of /next.
    await interaction.reply({ ...payload, ephemeral: true });
  } catch (err) {
    logger.error(`Error rendering the hub for /${name}`, err);
    await interaction.reply({
      content: 'There was an error opening MovieNight.',
      ephemeral: true
    });
  }
};

export const data = new SlashCommandBuilder()
  .setName('movienight')
  .setDescription('Everything MovieNight can do, in one place');

export const execute = (interaction) => executeHub(interaction, 'movienight');
