import { Events } from 'discord.js';
import { startMovieStarterJob } from '../jobs/movieStarter.js';
import { startAnnouncementProcessorJob } from '../jobs/announcementProcessor.js';
import { startRatingNotifierJob } from '../jobs/ratingNotifier.js';
import { startChannelSyncJob } from '../jobs/channelSync.js';
import {
  findActiveMovieNight,
  openVoicePresence,
  getOpenVoicePresence,
  zeroOutPresenceById
} from '../models/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ready');

// On restart, close any open voice-presence rows for users no longer in voice
// (zero the session to avoid inflating time), then snapshot anyone currently
// watching so tracking resumes without a gap.
const reconcileVoicePresence = async (client) => {
  const presentByGuild = new Map();
  for (const [, guild] of client.guilds.cache) {
    const set = new Set();
    for (const [, vs] of guild.voiceStates.cache) {
      if (!vs.channelId || vs.channelId === guild.afkChannelId) continue;
      if (vs.member?.user?.bot) continue;
      set.add(vs.id);
    }
    presentByGuild.set(guild.id, set);
  }

  const open = await getOpenVoicePresence();
  const stillPresentIds = [];
  const danglingIds = [];
  const stillPresentKeys = new Set();
  for (const row of open) {
    const guildSet = presentByGuild.get(row.guild_id);
    if (guildSet?.has(row.user_discord_id)) {
      stillPresentIds.push(row.id);
      stillPresentKeys.add(`${row.guild_id}:${row.user_discord_id}`);
    } else {
      danglingIds.push(row.id);
    }
  }
  if (danglingIds.length > 0) {
    await zeroOutPresenceById(danglingIds);
    logger.info(`Zeroed ${danglingIds.length} dangling voice-presence rows`);
  }

  const now = new Date();
  for (const [guildId, userIds] of presentByGuild) {
    for (const userId of userIds) {
      if (stillPresentKeys.has(`${guildId}:${userId}`)) continue;
      const night = await findActiveMovieNight(guildId, now);
      if (night) {
        await openVoicePresence(night.id, userId, now);
      }
    }
  }
};

export const name = Events.ClientReady;
export const once = true;

export const execute = async (client) => {
  logger.info(`Bot ready! Logged in as ${client.user.tag}`);
  logger.info(`Serving ${client.guilds.cache.size} guilds`);

  try {
    await reconcileVoicePresence(client);
  } catch (err) {
    logger.error('Voice presence reconciliation failed', err);
  }

  // Start the movie starter scheduled job
  startMovieStarterJob(client);

  // Start the announcement processor job (for web-created announcements)
  startAnnouncementProcessorJob(client);

  // Start the rating notifier job (sends rating prompt after runtime-10 min)
  startRatingNotifierJob(client);

  // Start the channel sync job (syncs Discord channels to DB for admin settings)
  startChannelSyncJob(client);
};
