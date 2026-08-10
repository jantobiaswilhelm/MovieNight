import cron from 'node-cron';
import {
  getPendingAnnouncements, claimPendingAnnouncement, markAnnouncementProcessed,
  createMovieNight, findOrCreateUser, updateMovieNightMessage, deleteMovieNight,
  linkMarathonItemMovieNight, completeMarathonIfDone, getMarathonItemsByMarathon
} from '../models/index.js';
import { createBingeAnnouncementEmbed } from '../utils/embeds.js';
import {
  buildAnnouncementEmbed, buildAnnouncementComponents, toAnnouncementView
} from '../utils/announcementEmbed.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('announcementProcessor');

// Default announcement channel ID (can be overridden per guild)
const DEFAULT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;
const MOVIE_NIGHT_ROLE_ID = process.env.MOVIE_NIGHT_ROLE_ID;

const CRON_EVERY_5_MINUTES = '*/5 * * * *';

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

  for (const listed of pendingAnnouncements) {
    // Atomically claim the row before doing any external work. Only the claimer
    // (this process, this pass) gets a row back — a crash mid-post, a re-run, or
    // a second bot instance can't double-post or create duplicate movie_nights.
    // claimPendingAnnouncement's UPDATE ... RETURNING * omits the joined username/
    // discord_id, so carry those over from the listing row.
    const claimed = await claimPendingAnnouncement(listed.id);
    if (!claimed) continue;
    const announcement = { ...claimed, username: listed.username, discord_id: listed.discord_id };

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
  // Cron is a backstop: it catches anything the LISTEN notification missed
  // (e.g. a NOTIFY fired while the bot was restarting). Instant delivery comes
  // from the shared notify listener wired up in events/ready.js.
  cron.schedule(CRON_EVERY_5_MINUTES, () => processPendingAnnouncements(client));
  logger.info('Announcement processor job scheduled (runs every 5 minutes as a backstop)');
};

async function processAnnouncement(client, announcement, channel) {
  const scheduledAt = new Date(announcement.scheduled_at);
  const announcerName = announcement.username || 'Website';

  // Binge kickoff: one embed for the whole evening, N movie_nights behind it.
  if (announcement.marathon_binge) {
    return processBingeAnnouncement(client, announcement, channel, announcerName);
  }

  // Create the row BEFORE sending — the RSVP button needs its id in the
  // customId. message_id is patched on immediately after the send.
  const movieNight = await createMovieNight(
    announcement.title,
    scheduledAt,
    announcement.user_id,
    announcement.guild_id,
    channel.id,
    null,
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

  const view = toAnnouncementView(movieNight, {
    announcerName,
    attendees: [],
    marathonName: announcement.marathon_name ?? null,
    marathonPosition: announcement.marathon_position ?? null,
    marathonTotal: announcement.marathon_total ?? null
  });

  let reply;
  try {
    const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
    reply = await channel.send({
      content,
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });
  } catch (err) {
    // The row exists but no message does. Delete it so /history doesn't show a
    // night nobody was told about, then let the caller mark this failed.
    await deleteMovieNight(movieNight.id).catch((cleanupErr) =>
      logger.error(`Failed to clean up orphan movie night ${movieNight.id}`, cleanupErr)
    );
    throw err;
  }

  await updateMovieNightMessage(movieNight.id, reply.id, channel.id);

  // Back-link the marathon item and complete the marathon if this was the last film.
  if (announcement.marathon_item_id) {
    await linkMarathonItemMovieNight(announcement.marathon_item_id, movieNight.id);
    await completeMarathonIfDone(announcement.marathon_id);
  }

  // Mark as processed
  await markAnnouncementProcessed(announcement.id, 'processed');

  logger.info(`Processed announcement: ${announcement.title} (ID: ${announcement.id})`);
}

async function processBingeAnnouncement(client, announcement, channel, announcerName) {
  const items = await getMarathonItemsByMarathon(announcement.marathon_id);
  if (items.length === 0) {
    await markAnnouncementProcessed(announcement.id, 'failed');
    return;
  }

  const embed = createBingeAnnouncementEmbed(announcement.marathon_name, items, announcerName);
  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const reply = await channel.send({ content, embeds: [embed] });

  // One movie_night per film. The first carries the kickoff message; the rest
  // are "silent" (no message of their own) but are still real, ratable nights.
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const movieNight = await createMovieNight(
      it.release_year ? `${it.title} (${it.release_year})` : it.title,
      new Date(it.scheduled_at),
      announcement.user_id,
      announcement.guild_id,
      channel.id,
      i === 0 ? reply.id : null,
      it.image_url,
      {
        description: it.description,
        tmdbId: it.tmdb_id,
        tmdbRating: it.tmdb_rating,
        genres: it.genres,
        runtime: it.runtime,
        releaseYear: it.release_year,
        backdropUrl: it.backdrop_url,
        imdbId: it.imdb_id,
        trailerUrl: it.trailer_url
      },
      announcement.is_test || false
    );
    await linkMarathonItemMovieNight(it.id, movieNight.id);
  }

  await completeMarathonIfDone(announcement.marathon_id);
  await markAnnouncementProcessed(announcement.id, 'processed');
  logger.info(`Processed BINGE kickoff: ${announcement.marathon_name} (${items.length} films)`);
}
