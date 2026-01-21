import cron from 'node-cron';
import { getMoviesReadyForRatingNotification, markRatingPromptSent } from '../models/index.js';
import { createRatingAvailableEmbed, createRatingButtons } from '../utils/embeds.js';

export const startRatingNotifierJob = (client) => {
  // Run every minute to check for movies ready for rating
  cron.schedule('* * * * *', async () => {
    try {
      const moviesReady = await getMoviesReadyForRatingNotification();

      for (const movie of moviesReady) {
        try {
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

            // Mark as sent
            await markRatingPromptSent(movie.id);

            console.log(`Sent rating notification for: ${movie.title} (ID: ${movie.id})`);
          } else {
            console.error(`Could not find channel ${movie.channel_id} for movie ${movie.id}`);
            // Still mark as sent to avoid repeated failures
            await markRatingPromptSent(movie.id);
          }
        } catch (err) {
          console.error(`Error sending rating notification for movie ${movie.id}:`, err);
        }
      }
    } catch (err) {
      console.error('Error in rating notifier job:', err);
    }
  });

  console.log('Rating notifier job scheduled (runs every minute)');
};
