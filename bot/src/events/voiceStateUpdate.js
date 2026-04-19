import { Events } from 'discord.js';
import {
  findActiveMovieNight,
  openVoicePresence,
  closeVoicePresenceForUser
} from '../models/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('voiceStateUpdate');

export const name = Events.VoiceStateUpdate;

export const execute = async (oldState, newState) => {
  try {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;
    const userId = newState.id || oldState.id;
    if (newState.member?.user?.bot ?? oldState.member?.user?.bot) return;

    const afkId = guild.afkChannelId;
    const oldChan = oldState.channelId;
    const newChan = newState.channelId;

    const wasInCall = Boolean(oldChan) && oldChan !== afkId;
    const isInCall = Boolean(newChan) && newChan !== afkId;

    if (wasInCall === isInCall) return;

    const now = new Date();
    if (!isInCall) {
      await closeVoicePresenceForUser(userId, now);
      return;
    }

    const night = await findActiveMovieNight(guild.id, now);
    if (night) {
      await openVoicePresence(night.id, userId, now);
      logger.info(`Opened voice presence: user=${userId} night=${night.id}`);
    }
  } catch (err) {
    logger.error('voiceStateUpdate error', err);
  }
};
