import { getMovieNightForAnnouncement, getAttendees } from '../models/index.js';
import {
  buildAnnouncementEmbed,
  buildAnnouncementComponents,
  toAnnouncementView
} from './announcementEmbed.js';
import { createLogger } from './logger.js';

const logger = createLogger('announcementMessage');

// Discord API error codes for things that are normal, not failures: someone
// deleted the announcement, or the channel is gone.
const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

/**
 * Re-render an already-posted announcement from current database state.
 * Safe to call for a movie night that has no message (nothing happens).
 */
export const refreshAnnouncementMessage = async (client, movieNightId) => {
  try {
    const movie = await getMovieNightForAnnouncement(movieNightId);
    if (!movie?.message_id || !movie.channel_id) return;

    const channel = await client.channels.fetch(movie.channel_id).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    const message = await channel.messages.fetch(movie.message_id).catch(() => null);
    if (!message) {
      logger.info(`Announcement message for movie ${movieNightId} is gone — nothing to refresh`);
      return;
    }

    const attendees = await getAttendees(movieNightId);
    const view = toAnnouncementView(movie, { attendees });

    await message.edit({
      embeds: [buildAnnouncementEmbed(view)],
      components: buildAnnouncementComponents(view)
    });

    logger.info(`Refreshed announcement for movie ${movieNightId}`);
  } catch (err) {
    if (err?.code === UNKNOWN_MESSAGE || err?.code === UNKNOWN_CHANNEL) {
      logger.info(`Announcement for movie ${movieNightId} no longer exists — skipping refresh`);
      return;
    }
    logger.error(`Failed to refresh announcement for movie ${movieNightId}`, err);
  }
};
