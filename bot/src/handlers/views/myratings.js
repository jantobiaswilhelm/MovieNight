import { getUserRatingsPaged, RATING_SORT_KEYS } from '../../models/index.js';
import {
  buildMyRatingsEmbed,
  buildPagerButtons,
  buildSortSelect,
  pageCountFor,
  MY_RATINGS_PAGE_SIZE
} from '../../utils/commandEmbeds.js';

/**
 * One page of the caller's own ratings.
 *
 * Two controls feed this view and they carry the sort differently: the pager
 * buttons put it in the customId (`mn:myratings:<page>:<sort>`), while the sort
 * select puts the page in the id and the chosen sort in `values`. Reading
 * values first is what makes changing the sort keep your place.
 */
export const render = async ({ user, args = [], values = [] }) => {
  const requestedPage = Math.max(1, Math.trunc(Number(args[0])) || 1);
  const candidate = values[0] ?? args[1];
  const sort = RATING_SORT_KEYS.includes(candidate) ? candidate : 'recent';

  const query = (page) => getUserRatingsPaged(user.id, {
    limit: MY_RATINGS_PAGE_SIZE,
    offset: (page - 1) * MY_RATINGS_PAGE_SIZE,
    sort
  });

  let rows = await query(requestedPage);
  let page = requestedPage;

  // Changing the sort keeps the page number, but a deleted rating can leave you
  // past the end. Fall back to the last real page rather than a blank one.
  if (!rows.length && requestedPage > 1) {
    rows = await query(1);
    page = 1;
  }

  const pageCount = pageCountFor(rows[0]?.total_count ?? 0, MY_RATINGS_PAGE_SIZE);

  return {
    embeds: [buildMyRatingsEmbed(rows, { page, pageCount, sort, username: user.username })],
    components: [
      ...buildSortSelect('myratings', page, sort),
      ...buildPagerButtons('myratings', page, pageCount, [sort])
    ]
  };
};
