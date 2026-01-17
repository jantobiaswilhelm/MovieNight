import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { findOrCreateUser, getActiveVotingSession, createSuggestion, getSuggestionsForSession } from '../models/index.js';
import { buildVotingEmbed, buildVotingButtons } from '../utils/votingEmbed.js';

export const data = new SlashCommandBuilder()
  .setName('suggest')
  .setDescription('Suggest a movie for the current voting session')
  .addStringOption(option =>
    option.setName('title')
      .setDescription('The movie title')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('image')
      .setDescription('URL to a movie poster or image')
      .setRequired(true));

export const execute = async (interaction) => {
  const title = interaction.options.getString('title');
  const imageUrl = interaction.options.getString('image');

  // Check if there's an active voting session
  const session = await getActiveVotingSession(interaction.guildId);
  if (!session) {
    return interaction.reply({
      content: 'There\'s no active voting session! Use `/startvote` to start one.',
      ephemeral: true
    });
  }

  try {
    // Create or get user
    const user = await findOrCreateUser(
      interaction.user.id,
      interaction.user.username,
      interaction.user.avatar
    );

    // Create suggestion
    await createSuggestion(session.id, title, imageUrl, user.id);

    // Get all suggestions to update the voting message
    const suggestions = await getSuggestionsForSession(session.id);

    // Update the voting message using session's channel_id
    try {
      const channel = await interaction.client.channels.fetch(session.channel_id);
      if (channel) {
        const message = await channel.messages.fetch(session.message_id);

        if (message) {
          const timestamp = Math.floor(new Date(session.scheduled_at).getTime() / 1000);
          const embed = buildVotingEmbed(session, suggestions, timestamp);
          embed.setFooter({ text: `Started by ${session.created_by_name || 'Unknown'}` });

          const buttons = buildVotingButtons(suggestions, false, session.id);

          await message.edit({
            embeds: [embed],
            components: buttons
          });
        }
      }
    } catch (err) {
      console.error('Error updating voting message:', err);
    }

    await interaction.reply({
      content: `Your suggestion **${title}** has been added to the vote!`,
      ephemeral: true
    });

  } catch (err) {
    console.error('Error suggesting movie:', err);
    await interaction.reply({
      content: 'There was an error adding your suggestion.',
      ephemeral: true
    });
  }
};
