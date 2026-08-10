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


export const createHistoryEmbed = (movies) => {
  const embed = new EmbedBuilder()
    .setTitle('Movie Night History')
    .setColor(0x5865F2);

  if (movies.length === 0) {
    embed.setDescription('No movie nights yet!');
    return embed;
  }

  const description = movies.map((movie, index) => {
    const date = new Date(movie.scheduled_at);
    const avgRating = parseFloat(movie.avg_rating) || 0;
    const ratingDisplay = avgRating > 0 ? `${avgRating.toFixed(1)}/10` : 'No ratings';
    return `**${index + 1}. ${movie.title}**\n<t:${Math.floor(date.getTime() / 1000)}:D> | ${ratingDisplay} (${movie.rating_count} votes)`;
  }).join('\n\n');

  embed.setDescription(description);
  return embed;
};

export const createStatsEmbed = (stats, topMovies, topRaters) => {
  const embed = new EmbedBuilder()
    .setTitle('Movie Night Stats')
    .setColor(0x5865F2);

  embed.addFields(
    { name: 'Total Movies', value: stats.total_movies.toString(), inline: true },
    { name: 'Total Ratings', value: stats.total_ratings.toString(), inline: true },
    { name: 'Avg Rating', value: `${parseFloat(stats.overall_avg_rating).toFixed(1)}/10`, inline: true }
  );

  if (topMovies.length > 0) {
    const topMoviesText = topMovies.map((m, i) =>
      `${i + 1}. **${m.title}** - ${parseFloat(m.avg_rating).toFixed(1)}/10`
    ).join('\n');
    embed.addFields({ name: 'Top Rated Movies', value: topMoviesText });
  }

  if (topRaters.length > 0) {
    const topRatersText = topRaters.map((r, i) =>
      `${i + 1}. **${r.username}** - ${r.rating_count} ratings (avg: ${parseFloat(r.avg_rating).toFixed(1)})`
    ).join('\n');
    embed.addFields({ name: 'Most Active Raters', value: topRatersText });
  }

  return embed;
};

export const createMyRatingsEmbed = (ratings, username) => {
  const embed = new EmbedBuilder()
    .setTitle(`${username}'s Ratings`)
    .setColor(0x5865F2);

  if (ratings.length === 0) {
    embed.setDescription('No ratings yet! Watch some movies and rate them.');
    return embed;
  }

  const description = ratings.map((r, i) => {
    const date = new Date(r.scheduled_at);
    let entry = `**${i + 1}. ${r.title}** - ${parseFloat(r.score).toFixed(1)}/10\n<t:${Math.floor(date.getTime() / 1000)}:D>`;
    if (r.comment) {
      // Truncate comment if too long
      const truncatedComment = r.comment.length > 100 ? r.comment.slice(0, 97) + '...' : r.comment;
      entry += `\n> "${truncatedComment}"`;
    }
    return entry;
  }).join('\n\n');

  embed.setDescription(description);

  // Calculate average
  const avgRating = ratings.reduce((sum, r) => sum + parseFloat(r.score), 0) / ratings.length;
  embed.setFooter({ text: `Your average rating: ${avgRating.toFixed(1)}/10` });

  return embed;
};

export const createTop10Embed = (movies, username) => {
  const embed = new EmbedBuilder()
    .setTitle(`${username}'s Top 10 Movies`)
    .setColor(0xFFD700);

  if (movies.length === 0) {
    embed.setDescription('No ratings yet! Watch some movies and rate them to see your top 10.');
    return embed;
  }

  const medals = ['🥇', '🥈', '🥉'];
  const description = movies.map((m, i) => {
    const medal = medals[i] || `**${i + 1}.**`;
    const communityAvg = m.community_avg ? ` (avg: ${parseFloat(m.community_avg).toFixed(1)})` : '';
    return `${medal} **${m.title}** - ${parseFloat(m.score).toFixed(1)}/10${communityAvg}`;
  }).join('\n');

  embed.setDescription(description);

  // Set thumbnail to the top movie's poster if available
  if (movies[0]?.image_url) {
    embed.setThumbnail(movies[0].image_url);
  }

  // Calculate average of top 10
  const avgRating = movies.reduce((sum, m) => sum + parseFloat(m.score), 0) / movies.length;
  embed.setFooter({ text: `Top ${movies.length} average: ${avgRating.toFixed(1)}/10` });

  return embed;
};
