import { getMovieNightsPaged, getGuildWatchTime } from '../../models/index.js';
import {
  buildHistoryEmbed,
  buildPagerButtons,
  pageCountFor,
  HISTORY_PAGE_SIZE
} from '../../utils/commandEmbeds.js';

const MAX_PAGE_SIZE = 25;

const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

/**
 * One page of movie night history.
 *
 * The page size rides in the customId alongside the page number, so paging
 * doesn't quietly reset a reader who asked for twenty per page back to five.
 */
export const render = async ({ guildId, args = [] }) => {
  const requestedPage = clamp(args[0], 1, Number.MAX_SAFE_INTEGER, 1);
  const pageSize = clamp(args[1], 1, MAX_PAGE_SIZE, HISTORY_PAGE_SIZE);

  const [firstTry, watchMinutes] = await Promise.all([
    getMovieNightsPaged(guildId, pageSize, (requestedPage - 1) * pageSize),
    getGuildWatchTime(guildId)
  ]);

  // Nights can be deleted between renders, so a page that existed when the
  // buttons were drawn may now be past the end. Fall back to the last real
  // page rather than showing an empty one.
  let nights = firstTry;
  let page = requestedPage;
  if (!nights.length && requestedPage > 1) {
    const recount = await getMovieNightsPaged(guildId, pageSize, 0);
    const pages = pageCountFor(recount[0]?.total_count ?? 0, pageSize);
    page = pages;
    nights = pages === 1
      ? recount
      : await getMovieNightsPaged(guildId, pageSize, (pages - 1) * pageSize);
  }

  const pageCount = pageCountFor(nights[0]?.total_count ?? 0, pageSize);

  return {
    embeds: [buildHistoryEmbed(nights, { page, pageCount, pageSize, watchMinutes })],
    components: buildPagerButtons('history', page, pageCount, [pageSize])
  };
};
