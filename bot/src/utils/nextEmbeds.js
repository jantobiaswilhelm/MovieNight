import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { splitTitleYear, formatRuntime } from './announcementEmbed.js';

// The three faces of /next. Kept out of embeds.js, which is already the home of
// the announcement/rating builders.
const COLOR = 0x5865F2;
const METER_BLOCKS = 10;

// How far the calendar plots. Two months covers "this month and the next one",
// which is as far as a group ever schedules; anything past it gets counted, not
// drawn, so the embed can't grow without bound.
const MONTHS_PLOTTED = 2;

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const VIEWS = [
  { key: 'list', label: 'List', emoji: '📃' },
  { key: 'calendar', label: 'Calendar', emoji: '📅' },
  { key: 'marathons', label: 'Marathons', emoji: '🍿' }
];

// Internal grid key. Deliberately not a date string — the month is the 0-based
// index monthGrid works in, and '2026-7-27' can't be mistaken for a real one.
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

const sameMonth = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const unixSeconds = (value) => Math.floor(new Date(value).getTime() / 1000);

// Shares the shape of ratingMeter in screeningCard.js, but reads a fraction
// rather than a 0-10 score, and survives a marathon with no films in it.
export const progressMeter = (done, total) => {
  const denominator = Number(total);
  const fraction = denominator > 0
    ? Math.max(0, Math.min(1, Number(done) / denominator))
    : 0;
  const filled = Math.round(fraction * METER_BLOCKS);
  return '█'.repeat(filled) + '░'.repeat(METER_BLOCKS - filled);
};

// A month as fixed 4-character cells so it lines up inside a code block:
// `[27]` is a film night, `·23·` is today. A film falling on today keeps the
// brackets — the date is named in the listing underneath either way, so the
// scarcer signal wins the cell.
//
// Weekdays are Monday-first and the grid is drawn in the bot host's timezone,
// unlike the <t:…> stamps elsewhere, which each viewer sees in their own.
export const monthGrid = (year, month, marked, now) => {
  const lead = (new Date(year, month, 1).getDay() + 6) % 7;
  const dayCount = new Date(year, month + 1, 0).getDate();
  const showsToday = now.getFullYear() === year && now.getMonth() === month;

  const cells = Array.from({ length: lead }, () => '    ');
  for (let day = 1; day <= dayCount; day++) {
    const padded = String(day).padStart(2, ' ');
    if (marked.has(dayKey(new Date(year, month, day)))) cells.push(`[${padded}]`);
    else if (showsToday && now.getDate() === day) cells.push(`·${padded}·`);
    else cells.push(` ${padded} `);
  }

  const rows = [WEEKDAYS.map((weekday) => ` ${weekday} `).join('')];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7).join(''));
  return rows.join('\n');
};

// cadence_type only ever holds 'interval' or 'binge' — the interval itself is
// never persisted, so an interval run says that it is scheduled and nothing more.
export const formatCadence = (cadenceType) => {
  if (cadenceType === 'binge') return '🍿 Binge · back-to-back';
  if (cadenceType === 'interval') return '📆 Scheduled run';
  return null;
};

const marathonTag = (movie) => {
  if (!movie.marathon_name) return null;
  const position = Number(movie.marathon_position) + 1;
  return `🍿 ${movie.marathon_name} (${position}/${movie.marathon_total})`;
};

export const buildUpcomingEmbed = (movies, now = new Date()) => {
  const embed = new EmbedBuilder()
    .setTitle('🎬 Upcoming Movie Nights')
    .setColor(COLOR);

  const entries = movies.map((movie, index) => {
    const when = new Date(movie.scheduled_at);
    const stamp = unixSeconds(when);
    const { name, year } = splitTitleYear(movie.title, movie.release_year);

    const heading = `**${index + 1}. ${name}**${year ? ` (${year})` : ''}`;
    // A film whose start time has passed but whose runtime hasn't is on screen
    // now — counting down to it would read as nonsense.
    const timing = when <= now
      ? `🔴 On now · started <t:${stamp}:R>`
      : `<t:${stamp}:F> · <t:${stamp}:R>`;
    const facts = [formatRuntime(movie.runtime), movie.genres].filter(Boolean).join(' · ');
    const tags = [
      movie.attendee_count > 0 ? `${movie.attendee_count} attending` : null,
      marathonTag(movie)
    ].filter(Boolean).join(' · ');

    return [heading, timing, facts, tags].filter(Boolean).join('\n');
  });

  embed.setDescription(entries.join('\n\n'));

  const poster = movies.find((movie) => movie.image_url)?.image_url;
  if (poster) embed.setThumbnail(poster);

  const plural = movies.length === 1 ? 'night' : 'nights';
  embed.setFooter({ text: `${movies.length} ${plural} scheduled` });
  return embed;
};

export const buildCalendarEmbed = (movies, now = new Date()) => {
  const embed = new EmbedBuilder()
    .setTitle('📅 On the calendar')
    .setColor(COLOR);

  const dated = movies.map((movie) => ({ movie, when: new Date(movie.scheduled_at) }));
  const window = Array.from({ length: MONTHS_PLOTTED }, (_, i) =>
    new Date(now.getFullYear(), now.getMonth() + i, 1));

  const plotted = dated.filter(({ when }) => window.some((month) => sameMonth(when, month)));
  const marked = new Set(plotted.map(({ when }) => dayKey(when)));

  // The current month always renders, so the grid never disappears; later months
  // earn their space only by holding a film.
  const grids = window
    .filter((month, index) => index === 0 || plotted.some(({ when }) => sameMonth(when, month)))
    .map((month) => [
      `**${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}**`,
      '```',
      monthGrid(month.getFullYear(), month.getMonth(), marked, now),
      '```'
    ].join('\n'));

  const listing = plotted.map(({ movie, when }) => {
    const { name } = splitTitleYear(movie.title, movie.release_year);
    const day = String(when.getDate()).padStart(2, '0');
    return `**${day} ${MONTH_SHORT[when.getMonth()]}** — ${name}`;
  });

  const beyond = dated.length - plotted.length;
  const parts = [...grids, listing.join('\n')];
  if (!dated.length) parts.push('Nothing on the schedule right now.');
  if (beyond > 0) parts.push(`_+${beyond} more further ahead_`);

  embed.setDescription(parts.filter(Boolean).join('\n'));
  return embed;
};

export const buildMarathonsEmbed = (marathons) => {
  const embed = new EmbedBuilder()
    .setTitle('🍿 Running Marathons')
    .setColor(COLOR);

  if (!marathons.length) {
    embed.setDescription('No marathons are running right now.');
    return embed;
  }

  const entries = marathons.map((marathon) => {
    const lines = [
      `**${marathon.name}**`,
      `${progressMeter(marathon.watched_count, marathon.item_count)} ${marathon.watched_count}/${marathon.item_count} watched`
    ];

    const next = marathon.next_item;
    if (!next) lines.push('Every film watched.');
    else if (next.scheduled_at) lines.push(`Next: **${next.title}** — <t:${unixSeconds(next.scheduled_at)}:R>`);
    else lines.push(`Next: **${next.title}** — no date yet`);

    const cadence = formatCadence(marathon.cadence_type);
    if (cadence) lines.push(cadence);
    return lines.join('\n');
  });

  embed.setDescription(entries.join('\n\n'));
  return embed;
};

// Nothing scheduled doesn't mean nothing is happening: a marathon may be waiting
// on a date, or a vote may still be deciding what to schedule.
export const buildEmptyEmbed = ({ marathons = [], votingSession = null, guildId } = {}) => {
  const parts = ['Nothing on the schedule right now.'];

  for (const marathon of marathons) {
    const next = marathon.next_item;
    if (!next) continue;
    const due = next.scheduled_at
      ? `, due <t:${unixSeconds(next.scheduled_at)}:R>`
      : ', not scheduled yet';
    parts.push(`🍿 **${marathon.name}** is running — next up is *${next.title}*${due}.`);
  }

  if (votingSession?.channel_id && votingSession?.message_id) {
    const link = `https://discord.com/channels/${guildId}/${votingSession.channel_id}/${votingSession.message_id}`;
    parts.push(`🗳️ A vote is still open — [cast yours](${link}).`);
  }

  parts.push('Use `/announce` to put something on the calendar.');

  return new EmbedBuilder()
    .setTitle('🎬 Upcoming Movie Nights')
    .setColor(COLOR)
    .setDescription(parts.join('\n\n'));
};

// Buttons carry every piece of state they need in the customId, so they keep
// working after a restart instead of dying with an in-memory collector.
export const buildViewButtons = (current, { count = 5, hasMovies = true, hasMarathons = true } = {}) => {
  const enabled = { list: true, calendar: hasMovies, marathons: hasMarathons };

  const row = new ActionRowBuilder().addComponents(
    VIEWS
      .filter((view) => view.key !== current)
      .map((view) => new ButtonBuilder()
        .setCustomId(`next_view:${view.key}:${count}`)
        .setLabel(view.label)
        .setEmoji(view.emoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!enabled[view.key]))
  );

  return [row];
};
