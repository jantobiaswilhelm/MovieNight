import cron from 'node-cron';
import { getPendingAnnouncements, markAnnouncementProcessed, createMovieNight, findOrCreateUser } from '../models/index.js';
import { createAnnouncementEmbed } from '../utils/embeds.js';

// Default announcement channel ID (can be overridden per guild)
const DEFAULT_CHANNEL_ID = process.env.ANNOUNCEMENT_CHANNEL_ID;

export const startAnnouncementProcessorJob = (client) => {
  // Run every 30 seconds
  cron.schedule('*/30 * * * * *', async () => {
    try {
      const pendingAnnouncements = await getPendingAnnouncements();

      for (const announcement of pendingAnnouncements) {
        try {
          // Determine which channel to use
          const channelId = announcement.channel_id || DEFAULT_CHANNEL_ID;

          if (!channelId) {
            console.error(`No channel configured for announcement ${announcement.id}`);
            await markAnnouncementProcessed(announcement.id, 'failed');
            continue;
          }

          // Get the channel
          const channel = await client.channels.fetch(channelId).catch(() => null);

          if (!channel) {
            console.error(`Could not find channel ${channelId} for announcement ${announcement.id}`);
            await markAnnouncementProcessed(announcement.id, 'failed');
            continue;
          }

          // Get the guild to verify we have access
          const guild = channel.guild;
          if (!guild || guild.id !== announcement.guild_id) {
            // Try to find a text channel in the correct guild
            const targetGuild = await client.guilds.fetch(announcement.guild_id).catch(() => null);
            if (!targetGuild) {
              console.error(`Could not find guild ${announcement.guild_id}`);
              await markAnnouncementProcessed(announcement.id, 'failed');
              continue;
            }

            // Find the first text channel the bot can send to
            const textChannel = targetGuild.channels.cache.find(
              c => c.isTextBased() && c.permissionsFor(targetGuild.members.me)?.has('SendMessages')
            );

            if (!textChannel) {
              console.error(`No suitable channel found in guild ${announcement.guild_id}`);
              await markAnnouncementProcessed(announcement.id, 'failed');
              continue;
            }

            // Use this channel instead
            await processAnnouncement(client, announcement, textChannel);
          } else {
            await processAnnouncement(client, announcement, channel);
          }
        } catch (err) {
          console.error(`Error processing announcement ${announcement.id}:`, err);
          await markAnnouncementProcessed(announcement.id, 'failed');
        }
      }
    } catch (err) {
      console.error('Error in announcement processor job:', err);
    }
  });

  console.log('Announcement processor job scheduled (runs every 30 seconds)');
};

async function processAnnouncement(client, announcement, channel) {
  const scheduledAt = new Date(announcement.scheduled_at);
  const announcerName = announcement.username || 'Website';

  // Create the announcement embed
  const embed = createAnnouncementEmbed(
    announcement.title,
    scheduledAt,
    announcement.image_url,
    announcerName
  );

  // Send the announcement
  const reply = await channel.send({ embeds: [embed] });

  // Get or create the user (if we have their discord_id)
  let userId = announcement.user_id;

  // Create the movie night in the database
  await createMovieNight(
    announcement.title,
    scheduledAt,
    userId,
    announcement.guild_id,
    channel.id,
    reply.id,
    announcement.image_url,
    {
      description: announcement.description,
      tmdbId: announcement.tmdb_id,
      tmdbRating: announcement.tmdb_rating,
      genres: announcement.genres,
      runtime: announcement.runtime,
      releaseYear: announcement.release_year,
      backdropUrl: announcement.backdrop_url,
      imdbId: announcement.imdb_id,
      trailerUrl: announcement.trailer_url
    }
  );

  // Mark as processed
  await markAnnouncementProcessed(announcement.id, 'processed');

  console.log(`Processed announcement: ${announcement.title} (ID: ${announcement.id})`);
}
