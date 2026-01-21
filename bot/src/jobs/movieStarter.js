import cron from 'node-cron';
import { getMoviesToStart, startMovieNight } from '../models/index.js';
import { createStartingNowEmbed } from '../utils/embeds.js';

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
            // Send "Starting Now" announcement (rating buttons sent later based on runtime)
            const embed = createStartingNowEmbed(movie.title, movie.image_url, movie.runtime);

            await channel.send({
              embeds: [embed]
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
