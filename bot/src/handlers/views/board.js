import { getBoardForGuild, toggleBoardUpvote, findOrCreateUser } from '../../models/index.js';
import { buildBoardEmbed, buildBoardComponents } from '../../utils/featureEmbeds.js';

const boardPayload = async (guildId, viewerId) => {
  const suggestions = await getBoardForGuild(guildId, viewerId);
  return {
    embeds: [buildBoardEmbed(suggestions)],
    components: buildBoardComponents(suggestions)
  };
};

/**
 * The suggestion board, and the one write it accepts.
 *
 * A select interaction arrives with the chosen suggestion id in `values`; a
 * plain view has none. Voting and re-rendering are the same call because the
 * board has to be re-read afterwards anyway — the score just changed.
 */
export const render = async ({ guildId, user, view, values = [] }) => {
  const viewer = await findOrCreateUser(user.id, user.username, user.avatar);

  if (view === 'boardvote' && values.length) {
    const suggestionId = Number(values[0]);

    // The board is re-read straight after, so a vote on a suggestion that was
    // deleted in the meantime costs nothing — it simply won't be there.
    if (Number.isInteger(suggestionId)) {
      await toggleBoardUpvote(suggestionId, viewer.id);
    }
  }

  return boardPayload(guildId, viewer.id);
};
