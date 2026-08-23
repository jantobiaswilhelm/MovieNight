import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { formatAttendees } from './announcementEmbed.js';

// Binge kickoff: one embed for the whole evening. items = ordered marathon_items
// (each with scheduled_at + runtime). Mirrors mockup 05 (ribbon + "N films · one
// sitting" + doors line + a time-stamped lineup).
export const createBingeAnnouncementEmbed = (marathonName, items, announcerName, attendees = []) => {
  const doors = items[0]?.scheduled_at ? new Date(items[0].scheduled_at) : new Date();
  const doorsTs = Math.floor(doors.getTime() / 1000);

  const runtimeStr = (m) => {
    if (!m) return '';
    const h = Math.floor(m / 60), min = m % 60;
    return ` · ${h ? `${h}h ` : ''}${min}m`;
  };

  const lineup = items.map((it) => {
    const ts = it.scheduled_at ? Math.floor(new Date(it.scheduled_at).getTime() / 1000) : null;
    const when = ts ? `<t:${ts}:t>` : '—';
    const year = it.release_year ? ` (${it.release_year})` : '';
    return `**${when}** — ${it.title}${year}${runtimeStr(it.runtime)}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setAuthor({ name: marathonName })
    .setTitle(`${items.length} films · one sitting`)
    .setDescription(`Doors <t:${doorsTs}:F>. We run straight through with short breaks.\n\n${lineup}`)
    .setColor(0xD4663A)
    .setFooter({ text: `Marathon started by ${announcerName}` })
    .setTimestamp();

  embed.addFields({
    name: `🎟 Going (${attendees.length})`,
    value: formatAttendees(attendees),
    inline: false
  });

  if (items[0]?.image_url) embed.setThumbnail(items[0].image_url);
  return embed;
};

// Binge kickoff buttons. RSVP is keyed to the marathon, not a single film —
// "I'm in" for a binge means the whole evening. Link buttons point at the
// first film, which is the one people are deciding about.
export const createBingeComponents = (marathonId, firstItem) => {
  const buttons = [
    new ButtonBuilder()
      .setCustomId(`rsvp_binge_${marathonId}`)
      .setLabel("I'm in")
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  ];

  if (firstItem?.trailer_url) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Trailer')
        .setEmoji('▶️')
        .setURL(firstItem.trailer_url)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (firstItem?.tmdb_id) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('TMDB')
        .setURL(`https://www.themoviedb.org/movie/${firstItem.tmdb_id}`)
        .setStyle(ButtonStyle.Link)
    );
  }

  if (process.env.FRONTEND_URL) {
    buttons.push(
      new ButtonBuilder()
        .setLabel('Website')
        .setURL(process.env.FRONTEND_URL)
        .setStyle(ButtonStyle.Link)
    );
  }

  return [new ActionRowBuilder().addComponents(...buttons)];
};

export const createRatingButtons = (movieId) => {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_1`)
      .setLabel('1')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_2`)
      .setLabel('2')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_3`)
      .setLabel('3')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_4`)
      .setLabel('4')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_5`)
      .setLabel('5')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_6`)
      .setLabel('6')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_7`)
      .setLabel('7')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_8`)
      .setLabel('8')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_9`)
      .setLabel('9')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rate_${movieId}_10`)
      .setLabel('10')
      .setStyle(ButtonStyle.Success)
  );

  return [row1, row2];
};


