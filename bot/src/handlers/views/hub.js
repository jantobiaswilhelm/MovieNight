import {
  getUpcomingMovieNights,
  getTopBoardSuggestions,
  getGuildStats,
  getGuildWatchTime
} from '../../models/index.js';
import { buildHubEmbed, buildHubComponents, DESTINATIONS } from '../../utils/hubEmbed.js';

const DESTINATION_VIEWS = new Set(DESTINATIONS.map((d) => d.view));

/**
 * The landing screen, and the jump that leaves it.
 *
 * Selecting a destination delegates to that view's renderer — the same function
 * its slash command calls — so the hub owns no rendering of its own. It is
 * passed in rather than imported to keep the dependency one-way: views/index.js
 * already knows about the hub, and importing it back would be a cycle.
 */
export const makeRender = (renderView) => async (ctx) => {
  const { guildId, values = [] } = ctx;

  const destination = values[0];
  if (destination && DESTINATION_VIEWS.has(destination)) {
    return renderView(destination, { ...ctx, args: [] });
  }

  const [upcoming, suggestions, stats, watchMinutes] = await Promise.all([
    getUpcomingMovieNights(guildId, 1),
    getTopBoardSuggestions(guildId, 1),
    getGuildStats(guildId),
    getGuildWatchTime(guildId)
  ]);

  return {
    embeds: [buildHubEmbed({
      nextUp: upcoming[0] ?? null,
      topSuggestion: suggestions[0] ?? null,
      stats,
      watchMinutes
    })],
    components: buildHubComponents()
  };
};
