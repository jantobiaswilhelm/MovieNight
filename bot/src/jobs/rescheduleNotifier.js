import { getMovieNightById } from '../models/index.js';
import { createLogger } from '../utils/logger.js';

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
  await channel.send(
    `**${movie.title}** has been rescheduled to <t:${timestamp}:F> (<t:${timestamp}:R>)`
  );
  logger.info(`Posted reschedule note for movie ${movieId}`);
};
