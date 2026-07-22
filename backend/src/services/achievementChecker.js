import * as db from '../models/index.js';

// Secret cult-movie badges, keyed by TMDB id (resolved via resolve-cult-ids.mjs).
const MOVIE_BADGES = {
  17473: 'cult_the_room', // The Room (2003)
  26914: 'cult_troll_2', // Troll 2 (1990)
  10513: 'cult_plan_9', // Plan 9 from Outer Space (1957)
  40016: 'cult_birdemic', // Birdemic: Shock and Terror (2010)
  205321: 'cult_sharknado', // Sharknado (2013)
  536869: 'cult_cats', // Cats (2019)
  9708: 'cult_wicker_man', // The Wicker Man (2006)
  5491: 'cult_battlefield_earth', // Battlefield Earth (2000)
  115: 'cult_lebowski', // The Big Lebowski (1998)
  762: 'cult_holy_grail', // Monty Python and the Holy Grail (1975)
  813: 'cult_airplane', // Airplane! (1980)
};

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

  // Rating count milestones (higher tiers)
  if (progress.rating_count >= 250) {
    const achievement = await db.unlockAchievement(userId, 'ratings_250');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.rating_count >= 500) {
    const achievement = await db.unlockAchievement(userId, 'ratings_500');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Explorer — variety of movies
  if (progress.genre_count >= 10) {
    const achievement = await db.unlockAchievement(userId, 'genre_hopper');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.language_count >= 5) {
    const achievement = await db.unlockAchievement(userId, 'polyglot');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.decade_count >= 5) {
    const achievement = await db.unlockAchievement(userId, 'decade_hopper');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.has_pre_1970) {
    const achievement = await db.unlockAchievement(userId, 'time_traveler');
    if (achievement) unlockedAchievements.push(achievement);
  }

  // Consensus — matching the group average
  if (progress.oracle_count >= 1) {
    const achievement = await db.unlockAchievement(userId, 'oracle');
    if (achievement) unlockedAchievements.push(achievement);
  }
  if (progress.oracle_count >= 10) {
    const achievement = await db.unlockAchievement(userId, 'prophet');
    if (achievement) unlockedAchievements.push(achievement);
  }

  return unlockedAchievements;
};

export const checkRatingAchievements = async (userId, score, tmdbId = null) => {
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

  // Secret cult-movie badge
  if (tmdbId && MOVIE_BADGES[tmdbId]) {
    const achievement = await db.unlockAchievement(userId, MOVIE_BADGES[tmdbId]);
    if (achievement) unlockedAchievements.push(achievement);
  }

  return unlockedAchievements;
};
