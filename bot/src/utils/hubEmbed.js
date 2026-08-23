import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { splitTitleYear } from './announcementEmbed.js';
import { buildId } from './customId.js';
import { formatWatchTime, safeImageUrl } from './commandEmbeds.js';

// The landing screen: a glance at what matters, and a menu into everything else.
// It reads rather than does — every destination is a view that already exists,
// which is why this file has no queries of its own.

const COLOR = 0x5865F2;

const unixSeconds = (value) => Math.floor(new Date(value).getTime() / 1000);

export const DESTINATIONS = [
  { view: 'next', label: "What's coming up", emoji: '🎬', description: 'The schedule, a calendar, and running marathons' },
  { view: 'board', label: 'The suggestion board', emoji: '🗳️', description: 'See what the room wants and vote on it' },
  { view: 'marathon', label: 'Marathons', emoji: '🍿', description: 'A marathon and everything left in it' },
  { view: 'wishlist', label: 'My wishlist', emoji: '🎯', description: 'Yours, the server\'s, or a random pick' },
  { view: 'myratings', label: 'My ratings', emoji: '⭐', description: 'Everything you have scored' },
  { view: 'top10', label: 'My top 10', emoji: '🏆', description: 'Your highest rated films' },
  { view: 'history', label: 'History', emoji: '🎭', description: 'Every night the server has watched' },
  { view: 'stats', label: 'Server stats', emoji: '📊', description: 'Totals, best rated, most active' }
];

export const buildHubEmbed = ({ nextUp = null, topSuggestion = null, stats = null, watchMinutes = 0 } = {}) => {
  const embed = new EmbedBuilder()
    .setTitle('🎬 MovieNight')
    .setColor(COLOR);

  const lines = [];

  if (nextUp) {
    const { name, year } = splitTitleYear(nextUp.title, nextUp.release_year);
    const stamp = unixSeconds(nextUp.scheduled_at);

    const meta = [
      `<t:${stamp}:R>`,
      nextUp.attendee_count > 0 ? `${nextUp.attendee_count} attending` : null,
      nextUp.marathon_name
        ? `${nextUp.marathon_name} (${Number(nextUp.marathon_position) + 1}/${nextUp.marathon_total})`
        : null
    ].filter(Boolean).join(' · ');

    lines.push(`🍿 **Up next — ${name}${year ? ` (${year})` : ''}**\n${meta}`);
  } else {
    lines.push('🍿 **Nothing scheduled right now.**\nPut something on the calendar with `/announce`.');
  }

  if (topSuggestion) {
    const { name, year } = splitTitleYear(topSuggestion.title, topSuggestion.release_year);
    lines.push(`🗳️ **${name}${year ? ` (${year})` : ''}** leads the board\n▲ ${topSuggestion.score} · vote with \`/board\``);
  }

  lines.push('_Pick a destination below._');
  embed.setDescription(lines.join('\n\n'));

  if (stats) {
    embed.setFooter({
      text: `${stats.total_movies} nights · ${formatWatchTime(watchMinutes)} watched · average ${stats.overall_avg_rating}`
    });
  }

  const poster = safeImageUrl(nextUp?.image_url);
  if (poster) embed.setThumbnail(poster);

  return embed;
};

export const buildHubComponents = () => {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(buildId('hub'))
    .setPlaceholder('Jump to…')
    .addOptions(DESTINATIONS.map((destination) => ({
      label: destination.label,
      value: destination.view,
      description: destination.description,
      emoji: destination.emoji
    })));

  return [new ActionRowBuilder().addComponents(menu)];
};

export { COLOR };
