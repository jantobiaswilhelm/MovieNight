import cron from 'node-cron';
import { getMoviesToStart, startMovieNight } from '../models/index.js';
import { createStartingNowEmbed } from '../utils/embeds.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('movieStarter');

const MOVIE_NIGHT_ROLE_ID = process.env.MOVIE_NIGHT_ROLE_ID;

const CRON_EVERY_MINUTE = '* * * * *';

export const startMovieStarterJob = (client) => {
  cron.schedule(CRON_EVERY_MINUTE, async () => {
    try {
      const moviesToStart = await getMoviesToStart();

      for (const movie of moviesToStart) {
        try {
          // Atomically claim the movie. If another tick already started it,
          // startMovieNight returns undefined and we skip re-posting the embed.
          const started = await startMovieNight(movie.id);
          if (!started) continue;

          // Get the channel to send the announcement
          const channel = await client.channels.fetch(movie.channel_id);

          if (channel) {
            // Send "Starting Now" announcement with role ping (rating buttons sent later based on runtime)
            const embed = createStartingNowEmbed(movie.title, movie.image_url, movie.runtime);
            const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;

            await channel.send({
              content,
              embeds: [embed]
            });

            logger.info(`Started movie night: ${movie.title} (ID: ${movie.id})`);
          } else {
            logger.error(`Could not find channel ${movie.channel_id} for movie ${movie.id}`);
          }
        } catch (err) {
          logger.error(`Error starting movie ${movie.id}`, err);
        }
      }
    } catch (err) {
      logger.error('Error in movie starter job', err);
    }
  });

  logger.info('Movie starter job scheduled (runs every minute)');
};
