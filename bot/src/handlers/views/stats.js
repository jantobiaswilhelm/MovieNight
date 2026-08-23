import {
  getGuildStats,
  getTopRatedMovies,
  getMostActiveRaters,
  getGuildWatchTime,
  getRegularCount
} from '../../models/index.js';
import { buildStatsEmbed, buildRangeButtons, sinceForRange } from '../../utils/commandEmbeds.js';

const RANGES = new Set(['all', 'month', 'year']);
const TOP_MOVIES = 3;
const TOP_RATERS = 3;

export const render = async ({ guildId, args = [] }) => {
  // An unrecognised range falls back to all time rather than erroring — a stale
  // button from an older deploy should still show something.
  const range = RANGES.has(args[0]) ? args[0] : 'all';
  const since = sinceForRange(range);

  const [stats, topMovies, topRaters, watchMinutes, regulars] = await Promise.all([
    getGuildStats(guildId, since),
    getTopRatedMovies(guildId, TOP_MOVIES, since),
    getMostActiveRaters(guildId, TOP_RATERS, since),
    getGuildWatchTime(guildId, since),
    getRegularCount(guildId, since)
  ]);

  return {
    embeds: [buildStatsEmbed({ stats, topMovies, topRaters, watchMinutes, regulars, range })],
    components: buildRangeButtons(range)
  };
};
