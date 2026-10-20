import { EmbedBuilder } from 'discord.js';

// Ember, the website's accent, so a devlog post reads as "from the site"
// rather than as a screening announcement.
const COLOR = 0xE27A4C;

// Only entries this recent are posted. A flagged entry that sat unposted for
// longer (the table was reset, the bot was down for weeks) stays website-only
// instead of arriving in Discord as stale news.
export const MAX_AGE_DAYS = 30;

const DESCRIPTION_MAX = 4096;

/**
 * The entries that should go to Discord: flagged `discord: true`, with an id
 * to record the post under, and dated within MAX_AGE_DAYS of `now`.
 * Oldest first, so several new ones post in the order they happened.
 */
export const pickPostable = (entries, now = new Date()) => {
  if (!Array.isArray(entries)) return [];
  const cutoff = now.getTime() - MAX_AGE_DAYS * 864e5;
  return entries
    .filter((e) => e && e.discord === true && typeof e.id === 'string' && e.id && e.title)
    .filter((e) => {
      const t = new Date(`${e.date}T12:00:00Z`).getTime();
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime() + 864e5;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
};

/** The Discord embed for one devlog entry. `siteUrl` links the title to /devlog. */
export const buildDevlogEmbed = (entry, siteUrl) => {
  const lines = [];
  if (entry.summary) lines.push(entry.summary);
  if (Array.isArray(entry.items) && entry.items.length > 0) {
    lines.push(entry.items.map((item) => `• ${item}`).join('\n'));
  }
  const description = lines.join('\n\n').slice(0, DESCRIPTION_MAX);

  const embed = new EmbedBuilder()
    .setColor(COLOR)
    .setAuthor({ name: 'MovieNight devlog' })
    .setTitle(entry.title)
    .setTimestamp(new Date(`${entry.date}T12:00:00Z`));

  if (description) embed.setDescription(description);
  if (siteUrl) {
    const base = siteUrl.replace(/\/+$/, '');
    embed.setURL(`${base}/devlog`).setFooter({ text: 'More in the devlog on the website' });
  }
  return embed;
};
