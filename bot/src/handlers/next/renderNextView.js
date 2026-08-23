import {
  getUpcomingMovieNights,
  getGuildActiveMarathons,
  getActiveVotingSession
} from '../../models/index.js';
import {
  buildUpcomingEmbed,
  buildCalendarEmbed,
  buildMarathonsEmbed,
  buildEmptyEmbed,
  buildViewButtons
} from '../../utils/nextEmbeds.js';

export const DEFAULT_COUNT = 5;
export const MAX_COUNT = 10;
export const VIEW_KEYS = ['list', 'calendar', 'marathons'];

export const clampCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(1, Math.min(MAX_COUNT, Math.trunc(n)));
};

/**
 * Build one /next view from scratch.
 *
 * Every render re-reads the database rather than caching, so a button pressed
 * days after the command was run shows today's schedule, not the one the message
 * was born with. That is also what lets the buttons be stateless.
 */
export const renderNextView = async (guildId, view, count = DEFAULT_COUNT) => {
  const [movies, marathons] = await Promise.all([
    getUpcomingMovieNights(guildId, count),
    getGuildActiveMarathons(guildId)
  ]);

  const options = {
    count,
    hasMovies: movies.length > 0,
    hasMarathons: marathons.length > 0
  };

  if (view === 'calendar') {
    return { embeds: [buildCalendarEmbed(movies)], components: buildViewButtons('calendar', options) };
  }

  if (view === 'marathons') {
    return { embeds: [buildMarathonsEmbed(marathons)], components: buildViewButtons('marathons', options) };
  }

  if (!movies.length) {
    // Only the empty board needs the vote — everywhere else it would be a query
    // whose answer is never printed.
    const votingSession = await getActiveVotingSession(guildId);
    return {
      embeds: [buildEmptyEmbed({ marathons, votingSession, guildId })],
      components: buildViewButtons('list', options)
    };
  }

  return { embeds: [buildUpcomingEmbed(movies)], components: buildViewButtons('list', options) };
};
