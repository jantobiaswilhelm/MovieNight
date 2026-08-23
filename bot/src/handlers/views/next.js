import {
  getUpcomingMovieNights,
  getGuildActiveMarathons,
  getTopBoardSuggestions
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
const EMPTY_SUGGESTION_COUNT = 3;

export const clampCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_COUNT;
  return Math.max(1, Math.min(MAX_COUNT, Math.trunc(n)));
};

/**
 * The shared /next board, in one of its three faces.
 *
 * Every render re-reads the database rather than caching, so a button pressed
 * days after the command was run shows today's schedule, not the one the message
 * was born with. That is also what lets the buttons be stateless.
 */
export const render = async ({ guildId, view = 'next', args = [] }) => {
  const count = clampCount(args[0] ?? DEFAULT_COUNT);

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
    // Only the empty board prints the suggestions — everywhere else this would
    // be a query whose answer is never read.
    const suggestions = await getTopBoardSuggestions(guildId, EMPTY_SUGGESTION_COUNT);
    return {
      embeds: [buildEmptyEmbed({ marathons, suggestions })],
      components: buildViewButtons('next', options)
    };
  }

  return { embeds: [buildUpcomingEmbed(movies)], components: buildViewButtons('next', options) };
};
