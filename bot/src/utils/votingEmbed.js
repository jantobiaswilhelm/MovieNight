import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export const buildVotingEmbed = (session, suggestions, timestamp) => {
  const embed = new EmbedBuilder()
    .setTitle('🗳️ Movie Night Voting')
    .setColor(0xFEE75C)
    .setTimestamp();

  let description = `**Vote for the next movie night!**\n\n` +
    `📅 Planned for: <t:${timestamp}:F> (<t:${timestamp}:R>)\n\n`;

  if (suggestions.length === 0) {
    description += `No suggestions yet! Click the button below to add one.`;
  } else {
    description += `**Suggestions:**\n`;
  }

  embed.setDescription(description);

  // Add suggestion fields
  if (suggestions.length > 0) {
    const totalVotes = suggestions.reduce((sum, s) => sum + parseInt(s.vote_count || 0), 0);

    suggestions.forEach((s, index) => {
      const votes = parseInt(s.vote_count || 0);
      const percentage = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
      const progressBar = createProgressBar(percentage);

      embed.addFields({
        name: `${index + 1}. ${s.title}`,
        value: `${progressBar} ${votes} vote${votes !== 1 ? 's' : ''} (${percentage}%)\n` +
               `Suggested by ${s.suggested_by_name}`,
        inline: false
      });
    });

    // Set thumbnail to the leading suggestion's image
    const leader = suggestions[0];
    if (leader?.image_url) {
      embed.setThumbnail(leader.image_url);
    }
  }

  return embed;
};

export const buildVotingButtons = (suggestions, includeAdminButtons = false) => {
  const rows = [];

  // Add suggestion button (always first row)
  const suggestRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('vote_suggest')
        .setLabel('🎬 Add Suggestion')
        .setStyle(ButtonStyle.Primary)
    );

  // Add cancel voting button for admin
  if (includeAdminButtons) {
    suggestRow.addComponents(
      new ButtonBuilder()
        .setCustomId('vote_cancel_session')
        .setLabel('🗑️ Cancel Voting')
        .setStyle(ButtonStyle.Danger)
    );
  }

  rows.push(suggestRow);

  // Add vote buttons for each suggestion (up to 5 per row, max 4 rows for votes)
  if (suggestions.length > 0) {
    let currentRow = new ActionRowBuilder();
    let buttonCount = 0;

    for (let i = 0; i < Math.min(suggestions.length, 20); i++) {
      const s = suggestions[i];

      if (buttonCount === 5) {
        rows.push(currentRow);
        currentRow = new ActionRowBuilder();
        buttonCount = 0;
      }

      // Limit to 4 rows of vote buttons (5 total rows max in Discord)
      if (rows.length >= 4) break;

      currentRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`vote_for_${s.id}`)
          .setLabel(`Vote #${i + 1}`)
          .setStyle(ButtonStyle.Secondary)
      );
      buttonCount++;
    }

    if (buttonCount > 0 && rows.length < 5) {
      rows.push(currentRow);
    }

    // Add delete buttons row for admin (if we have room and admin buttons requested)
    if (includeAdminButtons && rows.length < 5 && suggestions.length > 0) {
      let deleteRow = new ActionRowBuilder();
      let deleteCount = 0;

      for (let i = 0; i < Math.min(suggestions.length, 5); i++) {
        const s = suggestions[i];
        deleteRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`vote_delete_${s.id}`)
            .setLabel(`Del #${i + 1}`)
            .setStyle(ButtonStyle.Danger)
        );
        deleteCount++;
      }

      if (deleteCount > 0 && rows.length < 5) {
        rows.push(deleteRow);
      }
    }
  }

  return rows;
};

function createProgressBar(percentage) {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '▓'.repeat(filled) + '░'.repeat(empty);
}
