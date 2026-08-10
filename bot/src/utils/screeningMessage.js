import {
  getScreeningRow,
  getRatingsForMovie,
  getAttendees,
  updateStartingMessageId
} from '../models/index.js';
import {
  buildScreeningCard,
  buildScreeningComponents,
  toScreeningView
} from './screeningCard.js';
import { createLogger } from './logger.js';

const logger = createLogger('screeningMessage');

const UNKNOWN_MESSAGE = 10008;
const UNKNOWN_CHANNEL = 10003;

const MOVIE_NIGHT_ROLE_ID = process.env.MOVIE_NIGHT_ROLE_ID;

// Load the row plus everything the card renders from, in one place so the post
// and refresh paths can't drift.
async function loadView(movieNightId, stateOverride) {
  const row = await getScreeningRow(movieNightId);
  if (!row) return null;
  const [ratings, attendees] = await Promise.all([
    getRatingsForMovie(movieNightId),
    getAttendees(movieNightId)
  ]);
  return { row, view: toScreeningView(row, { ratings, attendees, state: stateOverride }) };
}

/**
 * Post the screening card for a movie that just started, and remember its
 * message id. This is a real new message with a role ping — at start time the
 * audience is scattered, so an edit would reach nobody.
 */
export const postScreeningCard = async (movieNightId, channel) => {
  const loaded = await loadView(movieNightId, 'playing');
  if (!loaded) return null;

  const content = MOVIE_NIGHT_ROLE_ID ? `<@&${MOVIE_NIGHT_ROLE_ID}>` : undefined;
  const message = await channel.send({
    content,
    embeds: [buildScreeningCard(loaded.view)],
    components: buildScreeningComponents(loaded.view)
  });

  await updateStartingMessageId(movieNightId, message.id);
  logger.info(`Posted screening card for movie ${movieNightId}`);
  return message;
};

/**
 * Re-render the screening card from current state. Safe to call for a movie
 * with no card (nothing happens) and for a deleted message.
 */
export const refreshScreeningCard = async (client, movieNightId, stateOverride) => {
  try {
    const loaded = await loadView(movieNightId, stateOverride);
    if (!loaded?.row?.starting_message_id || !loaded.row.channel_id) return;

    const channel = await client.channels.fetch(loaded.row.channel_id).catch(() => null);
    if (!channel?.isTextBased?.()) return;

    const message = await channel.messages
      .fetch(loaded.row.starting_message_id)
      .catch(() => null);
    if (!message) {
      logger.info(`Screening card for movie ${movieNightId} is gone — nothing to refresh`);
      return;
    }

    await message.edit({
      embeds: [buildScreeningCard(loaded.view)],
      components: buildScreeningComponents(loaded.view)
    });
    logger.info(`Refreshed screening card for movie ${movieNightId}`);
  } catch (err) {
    if (err?.code === UNKNOWN_MESSAGE || err?.code === UNKNOWN_CHANNEL) {
      logger.info(`Screening card for movie ${movieNightId} no longer exists — skipping`);
      return;
    }
    logger.error(`Failed to refresh screening card for movie ${movieNightId}`, err);
  }
};
