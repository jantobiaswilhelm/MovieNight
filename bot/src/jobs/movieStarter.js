import cron from 'node-cron';
import { getMoviesToStart, startMovieNight, openVoicePresence } from '../models/index.js';
import { postScreeningCard } from '../utils/screeningMessage.js';
import { refreshAnnouncementMessage } from '../utils/announcementMessage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('movieStarter');

const CRON_EVERY_MINUTE = '* * * * *';

// Delay before the one-off voice snapshot. By ~10 min in, the audience has
// settled, so a single pass captures everyone actually watching.
const VOICE_SNAPSHOT_DELAY_MS = 10 * 60 * 1000;

// Mark everyone currently in a non-AFK voice channel as present for the movie.
// openVoicePresence is idempotent per open session, so this can't double-count
// against the live join/leave tracking or a bot-restart reconcile.
function scheduleVoicePresenceSnapshot(client, movieId, guildId) {
  setTimeout(async () => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;
      const now = new Date();
      for (const [, vs] of guild.voiceStates.cache) {
        if (!vs.channelId || vs.channelId === guild.afkChannelId) continue;
        if (vs.member?.user?.bot) continue;
        await openVoicePresence(movieId, vs.id, now);
      }
      logger.info(`Voice snapshot taken for movie ${movieId}`);
    } catch (err) {
      logger.error(`Failed voice snapshot for movie ${movieId}`, err);
    }
  }, VOICE_SNAPSHOT_DELAY_MS);
}

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

          // Snapshot who's in voice ~10 min after start, so both people already in
          // the call at start AND anyone who trickled in during the first 10 minutes
          // get counted (the live voiceStateUpdate handler only fires on join/leave,
          // so it misses people already seated before the movie began).
          scheduleVoicePresenceSnapshot(client, movie.id, movie.guild_id);

          // Grey the RSVP button out of the original announcement and mark it
          // STARTED. The separate "Starting NOW" message below is unchanged.
          await refreshAnnouncementMessage(client, movie.id);

          // Post the screening card. It carries the whole night from here:
          // NOW PLAYING, then the rating card when the credits roll, then the
          // verdict — all by editing this one message.
          const channel = await client.channels.fetch(movie.channel_id).catch(() => null);

          if (channel) {
            await postScreeningCard(movie.id, channel);
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
