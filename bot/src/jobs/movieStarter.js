import cron from 'node-cron';
import { getMoviesToStart, startMovieNight } from '../models/index.js';
import { createStartingNowEmbed, createRatingButtons } from '../utils/embeds.js';

export const startMovieStarterJob = (client) => {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const moviesToStart = await getMoviesToStart();

      for (const movie of moviesToStart) {
        try {
          // Mark movie as started
          await startMovieNight(movie.id);

          // Get the channel to send the announcement
          const channel = await client.channels.fetch(movie.channel_id);

          if (channel) {
            // Send "Starting Now" announcement with rating buttons
            const embed = createStartingNowEmbed(movie.title, movie.image_url);
            const buttons = createRatingButtons(movie.id);

            await channel.send({
              embeds: [embed],
              components: buttons
            });

            console.log(`Started movie night: ${movie.title} (ID: ${movie.id})`);
          } else {
            console.error(`Could not find channel ${movie.channel_id} for movie ${movie.id}`);
          }
        } catch (err) {
          console.error(`Error starting movie ${movie.id}:`, err);
        }
      }
    } catch (err) {
      console.error('Error in movie starter job:', err);
    }
  });

  console.log('Movie starter job scheduled (runs every minute)');
};
