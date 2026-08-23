import { getUserTopRatedMovies } from '../../models/index.js';
import { buildTop10Embed } from '../../utils/commandEmbeds.js';

const TOP_N = 10;

/**
 * A member's ten highest-rated films.
 *
 * `target` is whoever the command was pointed at; without one it is the caller,
 * which is also what the hub gets when it jumps here. There are no buttons on
 * this view, so nothing needs to survive in a customId.
 */
export const render = async ({ user, target = null }) => {
  const subject = target ?? user;
  const rows = await getUserTopRatedMovies(subject.id, TOP_N);

  return {
    embeds: [buildTop10Embed(rows, { username: subject.username })],
    components: []
  };
};
