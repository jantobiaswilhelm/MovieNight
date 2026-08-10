import { createLogger } from '../utils/logger.js';
import { buildAnnouncementEmbed } from '../utils/announcementEmbed.js';

const logger = createLogger('cancelNotifier');

/**
 * Post a cancellation note when a movie night is cancelled from the web, and
 * grey out the original announcement so its RSVP button can't be clicked.
 * Triggered by the backend's `movie_cancel` NOTIFY. The movie row is already
 * deleted, so the payload carries channel id, title and message id as JSON —
 * there is nothing left to look up in the database.
 */
export const postCancelNote = async (client, payload) => {
  let data;
  try {
    data = JSON.parse(payload);
  } catch {
    logger.error(`Bad movie_cancel payload: ${payload}`);
    return;
  }

  const { channelId, title, messageId } = data || {};
  if (!channelId || !title) return;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.error(`Could not find text channel ${channelId} for cancellation`);
    return;
  }

  // Strike through the original announcement and strip its buttons. Built from
  // the payload alone, since the row is gone.
  if (messageId) {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      const embed = buildAnnouncementEmbed({
        title,
        scheduledAt: new Date(),
        cancelled: true,
        announcerName: 'Website'
      });
      await message.edit({ embeds: [embed], components: [] }).catch((err) =>
        logger.error(`Could not grey out cancelled announcement ${messageId}`, err)
      );
    }
  }

  await channel.send(`**${title}** has been cancelled.`);
  logger.info(`Posted cancellation note for "${title}"`);
};
