import { Events } from 'discord.js';
import { startMovieStarterJob } from '../jobs/movieStarter.js';
import { startAnnouncementProcessorJob } from '../jobs/announcementProcessor.js';

export const name = Events.ClientReady;
export const once = true;

export const execute = (client) => {
  console.log(`Bot ready! Logged in as ${client.user.tag}`);
  console.log(`Serving ${client.guilds.cache.size} guilds`);

  // Start the movie starter scheduled job
  startMovieStarterJob(client);

  // Start the announcement processor job (for web-created announcements)
  startAnnouncementProcessorJob(client);
};
