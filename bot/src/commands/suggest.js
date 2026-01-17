import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { findOrCreateUser, getActiveVotingSession, createSuggestion, getSuggestionsForSession } from '../models/index.js';

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

    // Get all suggestions to show updated list
    const suggestions = await getSuggestionsForSession(session.id);

    const embed = new EmbedBuilder()
      .setTitle('🎬 Movie Suggested!')
      .setDescription(`**${title}** has been added to the vote!`)
      .setThumbnail(imageUrl)
      .setColor(0x57F287)
      .addFields({
        name: 'Current Suggestions',
        value: suggestions.map((s, i) =>
          `${i + 1}. **${s.title}** (${s.vote_count} votes) - by ${s.suggested_by_name}`
        ).join('\n') || 'No suggestions yet'
      })
      .setFooter({ text: `Suggested by ${interaction.user.username}` });

    await interaction.reply({ embeds: [embed] });

  } catch (err) {
    console.error('Error suggesting movie:', err);
    await interaction.reply({
      content: 'There was an error adding your suggestion.',
      ephemeral: true
    });
  }
};
