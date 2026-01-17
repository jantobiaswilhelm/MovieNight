import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all available commands');

export const execute = async (interaction) => {
  const embed = new EmbedBuilder()
    .setTitle('Movie Night Bot Commands')
    .setDescription('Here are all the available commands:')
    .setColor(0x5865F2)
    .addFields(
      {
        name: '/announce',
        value: '**Announce a new movie night**\n`/announce title:"Movie Name" datetime:"tomorrow 8pm" image:"poster-url"`\nSchedule a movie night and post an announcement with rating buttons.'
      },
      {
        name: '/rate',
        value: '**Rate a movie**\n`/rate movie:"Movie Name" score:8.5`\nRate a movie with half-point precision (1-10). Use this for ratings like 7.5 or 8.5.'
      },
      {
        name: '/history',
        value: '**View movie history**\n`/history`\nSee all past movie nights with their ratings.'
      },
      {
        name: '/stats',
        value: '**View server statistics**\n`/stats`\nSee overall stats including top rated movies and most active raters.'
      },
      {
        name: '/myratings',
        value: '**View your ratings**\n`/myratings`\nSee all the movies you\'ve rated and your average score.'
      },
      {
        name: '/help',
        value: '**Show this help message**\n`/help`\nDisplay all available commands.'
      }
    )
    .setFooter({ text: 'You can also rate movies by clicking the buttons under announcements!' });

  await interaction.reply({ embeds: [embed] });
};
