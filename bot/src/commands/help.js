import { SlashCommandBuilder } from 'discord.js';
import { executeHub } from './movienight.js';

// /help and /movienight are the same screen. It stays registered because people
// type /help by reflex, and a hub that only answers to a name you have to learn
// first is not much of a hub.
export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Everything MovieNight can do, in one place');

export const execute = (interaction) => executeHub(interaction, 'help');
