import { createLogger } from '../../utils/logger.js';
import { renderNextView, clampCount, VIEW_KEYS, DEFAULT_COUNT } from './renderNextView.js';

const logger = createLogger('handleNextViewButton');

/**
 * Swap the /next board between its list, calendar and marathon views.
 *
 * The customId carries the whole request ('next_view:calendar:5'), so no state
 * outlives the click and the buttons keep working after a restart — unlike a
 * message collector, which dies with the process. interaction.update edits the
 * message in place, so the view changes for everyone reading it; that is the
 * intent for a shared, read-only board.
 */
export async function handleNextViewButton(interaction) {
  const [, requestedView, rawCount] = interaction.customId.split(':');
  const view = VIEW_KEYS.includes(requestedView) ? requestedView : 'list';
  const count = rawCount === undefined ? DEFAULT_COUNT : clampCount(rawCount);

  try {
    const payload = await renderNextView(interaction.guildId, view, count);
    await interaction.update(payload);
  } catch (err) {
    logger.error(`Error rendering ${view} view`, err);
    const message = { content: 'There was an error loading that view.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }
}
