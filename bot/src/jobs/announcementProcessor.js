import cron from 'node-cron';
import pool from '../config/database.js';
import { getPendingAnnouncements, markAnnouncementProcessed, createMovieNight, findOrCreateUser } from '../models/index.js';
import { createAnnouncementEmbed } from '../utils/embeds.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('announcementProcessor');

// Default announcement channel ID (can be overridden per guild)
const DEFAULT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const MOVIE_NIGHT_ROLE_ID = process.env.MOVIE_NIGHT_ROLE_ID;

const CRON_EVERY_5_MINUTES = '*/5 * * * *';
// Postgres NOTIFY channel the backend fires when a new announcement is queued.
const NOTIFY_CHANNEL = 'movie_announcement';
// How long to wait before retrying a dropped listener connection.
const RECONNECT_DELAY_MS = 5000;

// Guard so the cron backstop and LISTEN notifications never process the queue
// concurrently. If a run is requested while one is in flight we re-run once
// afterwards, so announcements that arrive mid-run aren't left waiting.
let running = false;
let rerunRequested = false;

/**
 * Process every pending announcement exactly once. Safe to call from both the
 * cron backstop and the LISTEN notification handler — overlapping calls collapse
 * into a single drain (plus one extra pass if work arrived while draining).
 */
export const processPendingAnnouncements = async (client) => {
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    do {
      rerunRequested = false;
      try {
        await drainPendingAnnouncements(client);
      } catch (err) {
        logger.error('Error processing pending announcements', err);
      }
    } while (rerunRequested);
  } finally {
    running = false;
  }
};

async function drainPendingAnnouncements(client) {
  const pendingAnnouncements = await getPendingAnnouncements();

  for (const announcement of pendingAnnouncements) {
    try {
      // Determine which channel to use
      const channelId = announcement.channel_id || DEFAULT_CHANNEL_ID;

      if (!channelId) {
        logger.error(`No channel configured for announcement ${announcement.id}`);
        await markAnnouncementProcessed(announcement.id, 'failed');
        continue;
      }

      // Get the channel
      const channel = await client.channels.fetch(channelId).catch(() => null);

      if (!channel) {
        logger.error(`Could not find channel ${channelId} for announcement ${announcement.id}`);
        await markAnnouncementProcessed(announcement.id, 'failed');
        continue;
      }

      // Get the guild to verify we have access
      const guild = channel.guild;
      if (!guild || guild.id !== announcement.guild_id) {
        // Try to find a text channel in the correct guild
        const targetGuild = await client.guilds.fetch(announcement.guild_id).catch(() => null);
        if (!targetGuild) {
          logger.error(`Could not find guild ${announcement.guild_id}`);
          await markAnnouncementProcessed(announcement.id, 'failed');
          continue;
        }

        // Find the first text channel the bot can send to
        const textChannel = targetGuild.channels.cache.find(
          c => c.isTextBased() && c.permissionsFor(targetGuild.members.me)?.has('SendMessages')
        );

        if (!textChannel) {
          logger.error(`No suitable channel found in guild ${announcement.guild_id}`);
          await markAnnouncementProcessed(announcement.id, 'failed');
          continue;
        }

        // Use this channel instead
        await processAnnouncement(client, announcement, textChannel);
      } else {
        await processAnnouncement(client, announcement, channel);
      }
    } catch (err) {
      logger.error(`Error processing announcement ${announcement.id}`, err);
      await markAnnouncementProcessed(announcement.id, 'failed');
    }
  }
}

export const startAnnouncementProcessorJob = (client) => {
  // Cron is now a backstop: it catches anything the LISTEN notification missed
  // (e.g. a NOTIFY fired while the bot was restarting).
  cron.schedule(CRON_EVERY_5_MINUTES, () => processPendingAnnouncements(client));
  logger.info('Announcement processor job scheduled (runs every 5 minutes as a backstop)');
};

/**
 * Open a dedicated connection that LISTENs for announcement notifications and
 * drains the queue the instant one fires. Self-heals if the connection drops.
 */
export const startAnnouncementListener = (client) => {
  let listenClient = null;
  let reconnectTimer = null;

  const scheduleReconnect = () => {
    if (reconnectTimer) return;
    if (listenClient) {
      // Destroy the broken client (true) so it leaves the pool cleanly.
      try { listenClient.release(true); } catch { /* already gone */ }
      listenClient = null;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, RECONNECT_DELAY_MS);
  };

  const connect = async () => {
    try {
      listenClient = await pool.connect();

      listenClient.on('notification', (msg) => {
        if (msg.channel !== NOTIFY_CHANNEL) return;
        processPendingAnnouncements(client).catch((err) =>
          logger.error('Error handling announcement notification', err)
        );
      });

      // A dropped dedicated connection stops delivering notifications — reconnect.
      listenClient.on('error', (err) => {
        logger.error('Announcement listener connection error', err);
        scheduleReconnect();
      });

      await listenClient.query(`LISTEN ${NOTIFY_CHANNEL}`);
      logger.info(`Announcement listener active (LISTEN ${NOTIFY_CHANNEL})`);

      // Drain anything that queued while the listener was down.
      processPendingAnnouncements(client).catch((err) =>
        logger.error('Error draining announcements on listener start', err)
      );
    } catch (err) {
      logger.error('Failed to start announcement listener', err);
      scheduleReconnect();
    }
  };

  connect();
};

async function processAnnouncement(client, announcement, channel) {
  const scheduledAt = new Date(announcement.scheduled_at);
  const announcerName = announcement.username || 'Website';

  // Create the announcement embed
  const embed = createAnnouncementEmbed(
    announcement.title,
    scheduledAt,
    announcement.image_url,
    announcerName
  );

  // Send the announcement with role ping
  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const reply = await channel.send({ content, embeds: [embed] });

  // Get or create the user (if we have their discord_id)
  let userId = announcement.user_id;

  // Create the movie night in the database
  await createMovieNight(
    announcement.title,
    scheduledAt,
    userId,
    announcement.guild_id,
    channel.id,
    reply.id,
    announcement.image_url,
    {
      description: announcement.description,
      tmdbId: announcement.tmdb_id,
      tmdbRating: announcement.tmdb_rating,
      genres: announcement.genres,
      runtime: announcement.runtime,
      releaseYear: announcement.release_year,
      backdropUrl: announcement.backdrop_url,
      imdbId: announcement.imdb_id,
      trailerUrl: announcement.trailer_url
    },
    announcement.is_test || false
  );

  // Mark as processed
  await markAnnouncementProcessed(announcement.id, 'processed');

  logger.info(`Processed announcement: ${announcement.title} (ID: ${announcement.id})`);
}
