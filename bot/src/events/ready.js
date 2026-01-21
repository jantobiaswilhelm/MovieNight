import { Events } from 'discord.js';
import { startMovieStarterJob } from '../jobs/movieStarter.js';
import { startAnnouncementProcessorJob } from '../jobs/announcementProcessor.js';
import { startRatingNotifierJob } from '../jobs/ratingNotifier.js';

export const name = Events.ClientReady;
export const once = true;

export const execute = (client) => {
  console.log(`Bot ready! Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} guilds`);

  // Start the movie starter scheduled job
  startMovieStarterJob(client);

  // Start the announcement processor job (for web-created announcements)
  startAnnouncementProcessorJob(client);

  // Start the rating notifier job (sends rating prompt after runtime-10 min)
  startRatingNotifierJob(client);
};
