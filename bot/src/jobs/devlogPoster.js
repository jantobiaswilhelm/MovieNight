import cron from 'node-cron';
import {
  getGuildTestSettings, claimDevlogPost, completeDevlogPost, releaseDevlogPost
} from '../models/index.js';
import { pickPostable, buildDevlogEmbed } from '../utils/devlogEmbed.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('devlogPoster');

const CRON_EVERY_30_MINUTES = '*/30 * * * *';

/**
 * Post devlog entries flagged `"discord": true` to the movie-night channel,
 * once each. The devlog lives on the website (frontend/public/devlog.json), so
 * the bot reads it from FRONTEND_URL. In test mode it posts to the test channel
 * instead, and records that separately so the real post still goes out later.
 */
export const postDevlogEntries = async (client) => {
  const siteUrl = process.env.FRONTEND_URL;
  const guildId = process.env.GUILD_ID;
  if (!siteUrl || !guildId) return;

  let entries;
  try {
    const res = await fetch(`${siteUrl.replace(/\/+$/, '')}/devlog.json`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    entries = await res.json();
  } catch (err) {
    logger.error('Could not fetch the devlog', err);
    return;
  }

  const postable = pickPostable(entries);
  if (postable.length === 0) return;

  const settings = await getGuildTestSettings(guildId);
  const isTest = settings.test_mode === true && Boolean(settings.test_channel_id);
  const channelId = isTest ? settings.test_channel_id : process.env.ANNOUNCEMENT_CHANNEL_ID;
  const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
  if (!channel?.isTextBased?.()) {
    logger.error(`No text channel to post the devlog to (${channelId || 'unset'})`);
    return;
  }

  for (const entry of postable) {
    const claim = await claimDevlogPost(guildId, entry.id, isTest);
    if (!claim) continue; // already posted
    try {
      const message = await channel.send({ embeds: [buildDevlogEmbed(entry, siteUrl)] });
      await completeDevlogPost(claim.id, channel.id, message.id);
      logger.info(`Posted devlog entry "${entry.id}"${isTest ? ' (test mode)' : ''}`);
    } catch (err) {
      await releaseDevlogPost(claim.id);
      logger.error(`Failed to post devlog entry "${entry.id}"`, err);
    }
  }
};

export const startDevlogPosterJob = (client) => {
  // Never let a run crash the bot, e.g. if the bot deploys before the backend
  // migration has created devlog_posts. The next run tries again.
  const run = () => postDevlogEntries(client).catch((err) => logger.error('Devlog run failed', err));
  // Check right after a deploy, then every 30 minutes.
  run();
  cron.schedule(CRON_EVERY_30_MINUTES, run);
  logger.info('Devlog poster scheduled (runs every 30 minutes)');
};
