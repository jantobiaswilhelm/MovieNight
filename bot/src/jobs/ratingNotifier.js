import cron from 'node-cron';
import { getMoviesReadyForRatingNotification, markRatingPromptSent } from '../models/index.js';
import { createRatingAvailableEmbed, createRatingButtons } from '../utils/embeds.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ratingNotifier');

const CRON_EVERY_MINUTE = '* * * * *';

export const startRatingNotifierJob = (client) => {
  cron.schedule(CRON_EVERY_MINUTE, async () => {
    try {
      const moviesReady = await getMoviesReadyForRatingNotification();

      for (const movie of moviesReady) {
        try {
          // Claim the prompt first so overlapping ticks (or a post/mark gap)
          // can't double-send. If we don't win the claim, another tick has it.
          // Trade-off: a transient send failure after claiming means this movie
          // won't be retried — acceptable to guarantee we never spam the channel.
          const claimed = await markRatingPromptSent(movie.id);
          if (!claimed) continue;

          // Get the channel to send the rating notification
          const channel = await client.channels.fetch(movie.channel_id);

          if (channel) {
            // Send rating prompt with buttons
            const embed = createRatingAvailableEmbed(movie.title, movie.image_url);
            const buttons = createRatingButtons(movie.id);

            await channel.send({
              embeds: [embed],
              components: buttons
            });

            logger.info(`Sent rating notification for: ${movie.title} (ID: ${movie.id})`);
          } else {
            logger.error(`Could not find channel ${movie.channel_id} for movie ${movie.id}`);
          }
        } catch (err) {
          logger.error(`Error sending rating notification for movie ${movie.id}`, err);
        }
      }
    } catch (err) {
      logger.error('Error in rating notifier job', err);
    }
  });

  logger.info('Rating notifier job scheduled (runs every minute)');
};
