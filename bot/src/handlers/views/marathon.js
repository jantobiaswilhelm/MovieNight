import {
  getGuildActiveMarathons,
  getMarathonRunningOrder,
  toggleMarathonAttendance,
  findOrCreateUser
} from '../../models/index.js';
import { buildMarathonEmbed, buildMarathonComponents } from '../../utils/featureEmbeds.js';
import { EmbedBuilder } from 'discord.js';

/**
 * One marathon's full running order.
 *
 * This is the shape /next deliberately does not use — listing every film is too
 * long for a board covering several marathons, and exactly right for a command
 * about one. Which marathon is showing rides in the customId, so the cycle
 * button is stateless like everything else.
 */
export const render = async ({ guildId, user, args = [] }) => {
  const marathons = await getGuildActiveMarathons(guildId);

  if (!marathons.length) {
    return {
      embeds: [new EmbedBuilder()
        .setTitle('🍿 Marathons')
        .setColor(0x5865F2)
        .setDescription('No marathons are running right now. Start one on the website.')],
      components: []
    };
  }

  // An id from a marathon that has since finished falls back to the first one
  // rather than rendering nothing.
  const requested = args[0];
  const marathon = marathons.find((m) => String(m.id) === String(requested)) ?? marathons[0];

  if (args[1] === 'join') {
    const viewer = await findOrCreateUser(user.id, user.username, user.avatar);
    await toggleMarathonAttendance(marathon.id, viewer.id);
  }

  const items = await getMarathonRunningOrder(marathon.id);

  return {
    embeds: [buildMarathonEmbed(marathon, items)],
    components: buildMarathonComponents(marathon.id, marathons)
  };
};
