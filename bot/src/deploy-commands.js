import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from './utils/logger.js';

const logger = createLogger('deploy-commands');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = await import(`file://${filePath}`);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    logger.warn(`The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    logger.info(`Started refreshing ${commands.length} application (/) commands.`);

    let data;

    // If GUILD_ID is set, deploy to that guild only (faster for dev)
    if (process.env.GUILD_ID) {
      data = await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      logger.info(`Successfully reloaded ${data.length} guild commands.`);
    } else {
      // Deploy globally
      data = await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands }
      );
      logger.info(`Successfully reloaded ${data.length} global commands.`);
    }
  } catch (error) {
    logger.error('Failed to deploy commands', error);
  }
})();
