import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const createAnnouncementEmbed = (title, scheduledAt, imageUrl, announcerName) => {
  const timestamp = Math.floor(scheduledAt.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`Movie Night: ${title}`)
    .setDescription(`Get ready for movie night!\n\n**When:** <t:${timestamp}:F> (<t:${timestamp}:R>)\n\n[View on Website](https://onlyfansmovies.up.railway.app/)`)
    .setColor(0x5865F2)
    .setFooter({ text: `Announced by ${announcerName}` })
    .setTimestamp();

  if (imageUrl) {
    embed.setImage(imageUrl);
  }

  return embed;
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

export const createRatingPromptEmbed = (title) => {
  return new EmbedBuilder()
    .setTitle(`Rate: ${title}`)
    .setDescription('How would you rate this movie? Click a button below or use `/rate` for half-point ratings (e.g., 7.5)')
    .setColor(0xFEE75C);
};

export const createStartingNowEmbed = (title, imageUrl, runtime) => {
  const ratingDelayMinutes = Math.max((runtime || 90) - 10, 0);
  const ratingsAvailableAt = new Date(Date.now() + ratingDelayMinutes * 60 * 1000);
  const timestamp = Math.floor(ratingsAvailableAt.getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`Movie Night is Starting NOW!`)
    .setDescription(`**${title}**\n\nEnjoy the movie! Ratings will be available <t:${timestamp}:R>.`)
    .setColor(0x57F287)
    .setTimestamp();

  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  return embed;
};

export const createRatingAvailableEmbed = (title, imageUrl) => {
  const embed = new EmbedBuilder()
    .setTitle(`Time to Rate!`)
    .setDescription(`**${title}**\n\nThe movie is almost over! Rate it using the buttons below or \`/rate\` for half-point ratings.`)
    .setColor(0xFEE75C)
    .setTimestamp();

  if (imageUrl) {
    embed.setThumbnail(imageUrl);
  }

  return embed;
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
