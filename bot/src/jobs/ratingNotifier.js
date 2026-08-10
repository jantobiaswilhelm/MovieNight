import cron from 'node-cron';
import {
  getMoviesReadyForRatingNotification,
  markRatingPromptSent,
  getMoviesToSettle,
  markCardSettled
} from '../models/index.js';
import { refreshScreeningCard } from '../utils/screeningMessage.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('ratingNotifier');

const CRON_EVERY_MINUTE = '* * * * *';

// Open rating on every movie whose runtime has elapsed. This edits the existing
// screening card rather than posting a new message: the audience is still in
// voice when the credits roll, so they're looking at the channel already.
async function openRatingWindows(client) {
  const moviesReady = await getMoviesReadyForRatingNotification();

  for (const movie of moviesReady) {
    try {
      // Claim first so overlapping ticks can't double-fire.
      const claimed = await markRatingPromptSent(movie.id);
      if (!claimed) continue;

      await refreshScreeningCard(client, movie.id, 'rating');
      logger.info(`Opened rating for: ${movie.title} (ID: ${movie.id})`);
    } catch (err) {
      logger.error(`Error opening rating for movie ${movie.id}`, err);
    }
  }
}

// Flip aged-out cards to the verdict state. Buttons stay live afterwards, so a
// latecomer can still rate — the card just stops looking urgent.
async function settleAgedCards(client) {
  const toSettle = await getMoviesToSettle();

  for (const movie of toSettle) {
    try {
      const claimed = await markCardSettled(movie.id);
      if (!claimed) continue;

      await refreshScreeningCard(client, movie.id, 'settled');
      logger.info(`Settled screening card for: ${movie.title} (ID: ${movie.id})`);
    } catch (err) {
      logger.error(`Error settling card for movie ${movie.id}`, err);
    }
  }
}

export const startRatingNotifierJob = (client) => {
  cron.schedule(CRON_EVERY_MINUTE, async () => {
    try {
      await openRatingWindows(client);
      await settleAgedCards(client);
    } catch (err) {
      logger.error('Error in rating notifier job', err);
    }
  });

  logger.info('Rating notifier job scheduled (opens rating at end of runtime, settles after 24h)');
};
