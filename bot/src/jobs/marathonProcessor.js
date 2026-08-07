import cron from 'node-cron';
import {
  getActiveMarathons, getNextPendingMarathonItem, countMarathonItems,
  enqueueMarathonItemAtomic, completeMarathonIfDone,
  getMarathonItemsByMarathon, enqueueBingeMarathonAtomic
} from '../models/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('marathonProcessor');

const CRON_EVERY_5_MINUTES = '*/5 * * * *';
// How far ahead of a film's date we queue its announcement. This is what makes
// the marathon "roll out one at a time" — only near-term films are posted.
const ANNOUNCE_LEAD_MS = 72 * 60 * 60 * 1000; // 3 days

let running = false;

// Queue the next due film for every active marathon (one film per marathon per pass).
export const processMarathons = async () => {
  if (running) return;
  running = true;
  try {
    const marathons = await getActiveMarathons();
    for (const marathon of marathons) {
      try {
        if (marathon.cadence_type === 'binge') {
          // Whole evening at once: queue a single kickoff when doors near.
          const items = await getMarathonItemsByMarathon(marathon.id);
          const pending = items.filter((it) => it.status === 'pending');
          if (pending.length === 0) { await completeMarathonIfDone(marathon.id); continue; }
          const doors = pending[0].scheduled_at;
          if (!doors) continue;
          const due = new Date(doors).getTime() - Date.now() <= ANNOUNCE_LEAD_MS;
          if (!due) continue;

          // Enqueue + mark-all-scheduled + advance in one transaction, so a crash
          // mid-pass can't re-queue a duplicate kickoff for the same evening.
          await enqueueBingeMarathonAtomic(pending[0], marathon, items.length);
          logger.info(`Queued BINGE kickoff for marathon ${marathon.id} (${items.length} films)`);
          continue;
        }

        // Interval (weekly) — one film per pass, as before.
        const item = await getNextPendingMarathonItem(marathon.id);
        if (!item) { await completeMarathonIfDone(marathon.id); continue; }
        if (!item.scheduled_at) continue;
        const due = new Date(item.scheduled_at).getTime() - Date.now() <= ANNOUNCE_LEAD_MS;
        if (!due) continue;

        const total = await countMarathonItems(marathon.id);
        // Enqueue + mark-scheduled + advance in one transaction, so a crash between
        // enqueue and mark can't re-queue the same film (duplicate announcement).
        await enqueueMarathonItemAtomic(item, marathon, total);
        logger.info(`Queued marathon ${marathon.id} · item ${item.id} (${item.title})`);
      } catch (err) {
        logger.error(`Error advancing marathon ${marathon.id}`, err);
      }
    }
  } finally {
    running = false;
  }
};

export const startMarathonProcessorJob = () => {
  cron.schedule(CRON_EVERY_5_MINUTES, () => processMarathons());
  logger.info('Marathon processor job scheduled (runs every 5 minutes)');
};
