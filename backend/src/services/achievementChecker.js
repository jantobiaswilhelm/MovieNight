import * as db from '../models/index.js';

export const checkAndUnlockAchievements = async (userId, guildId) => {
  const progress = await db.getAchievementProgress(userId, guildId);
  const unlockedAchievements = [];

  // Rating count achievements
  if (progress.rating_count >= 1) {
    const achievement = await db.unlockAchievement(userId, 'first_rating');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.rating_count >= 10) {
    const achievement = await db.unlockAchievement(userId, 'ratings_10');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.rating_count >= 25) {
    const achievement = await db.unlockAchievement(userId, 'ratings_25');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.rating_count >= 50) {
    const achievement = await db.unlockAchievement(userId, 'ratings_50');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.rating_count >= 100) {
    const achievement = await db.unlockAchievement(userId, 'ratings_100');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Streak achievements
  if (progress.longest_streak >= 5) {
    const achievement = await db.unlockAchievement(userId, 'streak_5');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.longest_streak >= 10) {
    const achievement = await db.unlockAchievement(userId, 'streak_10');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.longest_streak >= 25) {
    const achievement = await db.unlockAchievement(userId, 'streak_25');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Hot take achievements
  if (progress.hot_take_count >= 1) {
    const achievement = await db.unlockAchievement(userId, 'hot_take');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.hot_take_count >= 5) {
    const achievement = await db.unlockAchievement(userId, 'contrarian');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Average rating achievements
  if (progress.rating_count >= 10) {
    if (progress.avg_rating < 5) {
      const achievement = await db.unlockAchievement(userId, 'harsh_critic');
      if (achievement) unlockedAchievements.push(achievement);
    }
    if (progress.avg_rating > 8) {
      const achievement = await db.unlockAchievement(userId, 'easy_grader');
      if (achievement) unlockedAchievements.push(achievement);
    }
  }

  // Watchtime achievements (20 hours = 1200 minutes)
  if (progress.watchtime_minutes >= 1200) {
    const achievement = await db.unlockAchievement(userId, 'marathon');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.watchtime_minutes >= 3000) {
    const achievement = await db.unlockAchievement(userId, 'binge_master');
    if (achievement) unlockedAchievements.push(achievement);
  }

  return unlockedAchievements;
};

export const checkRatingAchievements = async (userId, score) => {
  const unlockedAchievements = [];

  // Perfect 10
  if (score === 10) {
    const achievement = await db.unlockAchievement(userId, 'perfect_ten');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Tough crowd (1 rating)
  if (score === 1) {
    const achievement = await db.unlockAchievement(userId, 'tough_crowd');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Night owl (after midnight local - we'll approximate with UTC)
  const hour = new Date().getUTCHours();
  if (hour >= 0 && hour < 5) {
    const achievement = await db.unlockAchievement(userId, 'night_owl');
    if (achievement) unlockedAchievements.push(achievement);
  }

  return unlockedAchievements;
};
