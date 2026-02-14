import * as db from '../models/index.js';

export const ActivityType = {
  RATED_MOVIE: 'rated_movie',
  ADDED_WISHLIST: 'added_wishlist',
  CREATED_LIST: 'created_list',
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked'
};

export const logActivity = async (userId, guildId, activityType, referenceId = null, data = null) => {
  return db.logActivity(userId, guildId, activityType, referenceId, data);
};

export const logRatingActivity = async (userId, guildId, movieNightId, movieTitle, score) => {
  return db.logActivity(userId, guildId, ActivityType.RATED_MOVIE, movieNightId, {
    movieTitle,
    score
  });
};

export const logWishlistActivity = async (userId, guildId, tmdbId, movieTitle) => {
  return db.logActivity(userId, guildId, ActivityType.ADDED_WISHLIST, tmdbId, {
    movieTitle
  });
};

export const logListCreatedActivity = async (userId, guildId, listId, listName) => {
  return db.logActivity(userId, guildId, ActivityType.CREATED_LIST, listId, {
    listName
  });
};

export const logAchievementActivity = async (userId, guildId, achievementCode, achievementName) => {
  return db.logActivity(userId, guildId, ActivityType.ACHIEVEMENT_UNLOCKED, null, {
    achievementCode,
    achievementName
  });
};
