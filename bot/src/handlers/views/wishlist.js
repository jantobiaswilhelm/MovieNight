import { getUserWishlistForBot, getGuildWishlistForBot } from '../../models/index.js';
import {
  buildWishlistEmbed,
  buildWishlistComponents,
  pickWeighted,
  totalWeight,
  stars
} from '../../utils/featureEmbeds.js';
import { splitTitleYear } from '../../utils/announcementEmbed.js';

const loadFilms = (scope, guildId, user) => scope === 'guild'
  ? getGuildWishlistForBot(guildId)
  : getUserWishlistForBot(user.id, guildId);

/**
 * A wishlist — yours or the server's — and the weighted picker over it.
 *
 * The scope rides in the customId so the picker knows which list it is spinning,
 * and the toggle button knows which way to flip.
 */
export const render = async ({ guildId, user, view, args = [] }) => {
  const scope = args[0] === 'guild' ? 'guild' : 'me';
  const films = await loadFilms(scope, guildId, user);

  if (view === 'wishpick') {
    if (!films.length) {
      return {
        embeds: [buildWishlistEmbed(films, { username: user.username, scope })],
        components: buildWishlistComponents(scope)
      };
    }

    // Randomness lives here, not in the picker, so the picker stays a pure
    // function the tests can drive with a fixed roll.
    const roll = Math.floor(Math.random() * totalWeight(films));
    const chosen = pickWeighted(films, roll);
    const { name, year } = splitTitleYear(chosen.title, chosen.release_year);

    return {
      embeds: [buildWishlistEmbed(films, { username: user.username, scope })],
      components: buildWishlistComponents(scope),
      content: `🎲 **${name}**${year ? ` (${year})` : ''} — ${stars(chosen.importance)}`
    };
  }

  return {
    embeds: [buildWishlistEmbed(films, { username: user.username, scope })],
    components: buildWishlistComponents(scope),
    content: ''
  };
};
