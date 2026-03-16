import cron from 'node-cron';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { upsertGuildChannel, removeStaleGuildChannels } from '../models/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('channelSync');

const CRON_EVERY_30_MINUTES = '*/30 * * * *';

async function syncGuildChannels(guild) {
  try {
    // Fetch all channels (force refresh from API)
    const channels = await guild.channels.fetch();

    const textChannels = channels.filter(c => {
      if (!c) return false;
      if (c.type !== ChannelType.GuildText) return false;
      // Check bot has permission to view and send messages
      const botMember = guild.members.me;
      if (!botMember) return false;
      const permissions = c.permissionsFor(botMember);
      return permissions?.has(PermissionFlagsBits.ViewChannel) &&
             permissions?.has(PermissionFlagsBits.SendMessages);
    });

    const currentChannelIds = [];

    for (const [, channel] of textChannels) {
      const parentName = channel.parent?.name || null;
      await upsertGuildChannel(
        guild.id,
        channel.id,
        channel.name,
        channel.position,
        parentName
      );
      currentChannelIds.push(channel.id);
    }

    // Remove channels that no longer exist
    await removeStaleGuildChannels(guild.id, currentChannelIds);

    logger.info(`Synced ${currentChannelIds.length} channels for guild ${guild.name}`);
  } catch (err) {
    logger.error(`Error syncing channels for guild ${guild.name}`, err);
  }
}

export const syncAllGuilds = async (client) => {
  for (const [, guild] of client.guilds.cache) {
    await syncGuildChannels(guild);
  }
};

export const startChannelSyncJob = (client) => {
  // Sync immediately on startup
  syncAllGuilds(client);

  // Then sync every 30 minutes
  cron.schedule(CRON_EVERY_30_MINUTES, () => {
    syncAllGuilds(client);
  });

  logger.info('Channel sync job scheduled (runs every 30 minutes)');
};
