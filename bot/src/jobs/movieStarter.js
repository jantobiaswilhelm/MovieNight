import cron from 'node-cron';
import { getMoviesToStart, startMovieNight, openVoicePresence } from '../models/index.js';
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

          // Snapshot anyone already sitting in voice at start. The voiceStateUpdate
          // handler only fires on join/leave, so people already in the call when the
          // movie begins would otherwise never be recorded — and get wrongly flagged
          // "wasn't in the call". Counts any non-AFK voice channel, matching the
          // live tracking. openVoicePresence is idempotent, so a concurrent join is safe.
          try {
            const guild = client.guilds.cache.get(movie.guild_id);
            if (guild) {
              const now = new Date();
              for (const [, vs] of guild.voiceStates.cache) {
                if (!vs.channelId || vs.channelId === guild.afkChannelId) continue;
                if (vs.member?.user?.bot) continue;
                await openVoicePresence(movie.id, vs.id, now);
              }
            }
          } catch (err) {
            logger.error(`Failed to snapshot voice presence for movie ${movie.id}`, err);
          }

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
