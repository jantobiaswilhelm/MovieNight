import { useState, useCallback } from 'react';
import { getFollowStatus, followUser, unfollowUser } from '../api/client';

/**
 * Hook for follow/unfollow logic.
 *
 * @param {string|number} userId - The user ID to follow/unfollow
 * @param {boolean} isAuthenticated - Whether the current user is logged in
 */
export function useFollow(userId, isAuthenticated) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    if (!isAuthenticated || !userId) return;
    try {
      const status = await getFollowStatus(userId);
      setIsFollowing(status.following);
    } catch {
      // Ignore errors for follow status
    }
  }, [userId, isAuthenticated]);

  const toggleFollow = useCallback(async () => {
    if (!isAuthenticated || !userId) return;

    setLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(userId);
        setIsFollowing(false);
      } else {
        await followUser(userId);
        setIsFollowing(true);
      }
    } catch (err) {
      console.error('Follow/unfollow failed:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, isAuthenticated, isFollowing]);

  return { isFollowing, loading, toggleFollow, checkStatus };
}
