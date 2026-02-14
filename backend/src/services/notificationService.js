import * as db from '../models/index.js';

export const NotificationType = {
  MOVIE_SCHEDULED: 'movie_scheduled',
  VOTING_STARTED: 'voting_started',
  REACTION_RECEIVED: 'reaction_received',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',
  FOLLOWED_ACTIVITY: 'followed_activity',
  NEW_FOLLOWER: 'new_follower'
};

export const createNotification = async (userId, type, title, message, link = null, data = null) => {
  return db.createNotification(userId, type, title, message, link, data);
};

export const notifyMovieScheduled = async (guildId, movieTitle, movieId, scheduledAt) => {
  // Get all users who have rated movies in this guild (active users)
  const users = await db.getGuildUsers(guildId);
  const userIds = users.map(u => u.id);

  if (userIds.length === 0) return;

  const title = 'New Movie Night Scheduled!';
  const message = `${movieTitle} has been scheduled for ${new Date(scheduledAt).toLocaleDateString()}`;
  const link = `/movie/${movieId}`;

  return db.createBulkNotifications(userIds, NotificationType.MOVIE_SCHEDULED, title, message, link, { movieId });
};

export const notifyVotingStarted = async (guildId, sessionId, scheduledAt) => {
  const users = await db.getGuildUsers(guildId);
  const userIds = users.map(u => u.id);

  if (userIds.length === 0) return;

  const title = 'Voting Session Started!';
  const message = `Vote for the next movie night on ${new Date(scheduledAt).toLocaleDateString()}`;
  const link = '/';

  return db.createBulkNotifications(userIds, NotificationType.VOTING_STARTED, title, message, link, { sessionId });
};

export const notifyReactionReceived = async (ratingUserId, reactorUsername, emoji, movieTitle) => {
  const emojiMap = {
    thumbsup: '👍',
    thumbsdown: '👎',
    heart: '❤️',
    fire: '🔥',
    laugh: '😂',
    thinking: '🤔'
  };

  const title = 'New reaction on your rating';
  const message = `${reactorUsername} reacted ${emojiMap[emoji] || emoji} to your rating of ${movieTitle}`;

  return db.createNotification(ratingUserId, NotificationType.REACTION_RECEIVED, title, message, null, { emoji, reactorUsername });
};

export const notifyAchievementUnlocked = async (userId, achievement) => {
  const title = 'Achievement Unlocked!';
  const message = `You earned "${achievement.name}": ${achievement.description}`;
  const link = '/achievements';

  return db.createNotification(userId, NotificationType.ACHIEVEMENT_UNLOCKED, title, message, link, { achievementCode: achievement.code });
};

export const notifyNewFollower = async (userId, followerUsername, followerId) => {
  const title = 'New Follower';
  const message = `${followerUsername} started following you`;
  const link = `/user/${followerId}`;

  return db.createNotification(userId, NotificationType.NEW_FOLLOWER, title, message, link, { followerId });
};
