import { getMovieNightById, getAttendeeDiscordIds } from '../models/index.js';
import { createLogger } from '../utils/logger.js';
import { refreshAnnouncementMessage } from '../utils/announcementMessage.js';

const logger = createLogger('rescheduleNotifier');

/**
 * Post a note in the movie's announcement channel when it's rescheduled from the
 * web. Triggered by the backend's `movie_reschedule` NOTIFY (payload = movie id).
 */
export const postRescheduleNote = async (client, payload) => {
  const movieId = parseInt(payload, 10);
  if (!movieId) return;

  const movie = await getMovieNightById(movieId);
  if (!movie || !movie.channel_id) {
    logger.error(`No channel to post reschedule note for movie ${payload}`);
    return;
  }

  const channel = await client.channels.fetch(movie.channel_id).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.error(`Could not find text channel ${movie.channel_id} for movie ${movieId}`);
    return;
  }

  const timestamp = Math.floor(new Date(movie.scheduled_at).getTime() / 1000);

  // Ping anyone who already RSVP'd so they see the new time.
  const attendeeIds = await getAttendeeDiscordIds(movieId);
  const mentions = attendeeIds.map((id) => `<@${id}>`).join(' ');
  const base = `**${movie.title}** has been rescheduled to <t:${timestamp}:F> (<t:${timestamp}:R>)`;

  await channel.send({
    content: mentions ? `${base}\n${mentions}` : base,
    allowedMentions: { users: attendeeIds }
  });
  // Put the new time into the original announcement too, so someone scrolling
  // back doesn't read a stale date.
  await refreshAnnouncementMessage(client, movieId);

  logger.info(`Posted reschedule note for movie ${movieId} (pinged ${attendeeIds.length} attendees)`);
};
