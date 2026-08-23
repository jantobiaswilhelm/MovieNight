import { parseId } from '../../utils/customId.js';
import { createLogger } from '../../utils/logger.js';
import * as next from './next.js';
import * as history from './history.js';
import * as stats from './stats.js';
import * as myratings from './myratings.js';
import * as top10 from './top10.js';
import * as board from './board.js';
import * as wishlist from './wishlist.js';

const logger = createLogger('views');

/**
 * Every interactive view the bot renders, keyed by the name in its customId.
 *
 * A renderer takes `{ guildId, user, view, args }` and returns a Discord message
 * payload — `{ embeds, components }`. Commands call one directly and reply with
 * the result; the router below calls the same function and updates the message
 * in place. That single contract is what lets a hub menu jump between views
 * without any of them knowing the hub exists.
 */
export const RENDERERS = {
  next: next.render,
  calendar: next.render,
  marathons: next.render,
  history: history.render,
  stats: stats.render,
  myratings: myratings.render,
  top10: top10.render,
  board: board.render,
  boardvote: board.render,
  wishlist: wishlist.render,
  wishpick: wishlist.render
};

/**
 * Render a view by name — the entry point a slash command uses.
 *
 * Commands and the router go through the same function so a view can never
 * drift between "how it looks when you type the command" and "how it looks when
 * you press the button".
 */
export const renderView = (view, ctx) => {
  const render = RENDERERS[view];
  if (!render) throw new Error(`Unknown view: ${view}`);
  return render({ ...ctx, view });
};

/**
 * Handle a button or select interaction belonging to the `mn:` namespace.
 *
 * Returns false for anything that isn't ours — a foreign customId, a view from a
 * newer deploy, a malformed id — so the caller can fall through to its other
 * handlers rather than swallowing the interaction.
 */
export async function handleViewInteraction(interaction) {
  const parsed = parseId(interaction.customId);
  if (!parsed) return false;

  const render = RENDERERS[parsed.view];
  if (!render) return false;

  try {
    const payload = await render({
      guildId: interaction.guildId,
      user: interaction.user,
      view: parsed.view,
      args: parsed.args,
      // A select carries its choice in values, not in the customId — the id
      // names the destination, the value says which row was picked.
      values: interaction.values ?? []
    });
    await interaction.update(payload);
  } catch (err) {
    logger.error(`Error rendering "${parsed.view}" view`, err);
    const message = { content: 'There was an error loading that view.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(message).catch(() => {});
    } else {
      await interaction.reply(message).catch(() => {});
    }
  }

  return true;
}
