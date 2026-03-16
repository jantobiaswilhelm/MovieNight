import { useState, useEffect } from 'react';
import { addReaction, removeReaction, getReactions } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import './RatingReactions.css';

const EMOJIS = [
  { key: 'thumbsup', emoji: String.fromCodePoint(0x1F44D), label: 'Thumbs Up' },
  { key: 'thumbsdown', emoji: String.fromCodePoint(0x1F44E), label: 'Thumbs Down' },
  { key: 'heart', emoji: String.fromCodePoint(0x2764, 0xFE0F), label: 'Heart' },
  { key: 'fire', emoji: String.fromCodePoint(0x1F525), label: 'Fire' },
  { key: 'laugh', emoji: String.fromCodePoint(0x1F602), label: 'Laugh' },
  { key: 'thinking', emoji: String.fromCodePoint(0x1F914), label: 'Thinking' }
];

const RatingReactions = ({ ratingId, currentUserId, ratingUserId }) => {
  const { isAuthenticated } = useAuth();
  const [reactions, setReactions] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchReactions();
  }, [ratingId]);

  const fetchReactions = async () => {
    try {
      const data = await getReactions(ratingId);
      setReactions(data);
    } catch (err) {
      console.error('Failed to fetch reactions:', err);
    }
  };

  const handleReaction = async (emoji) => {
    if (!isAuthenticated || loading) return;

    setLoading(true);
    try {
      // Check if user already has this reaction
      const existingReaction = reactions.find(
        (r) => r.emoji === emoji && r.user_ids?.includes(currentUserId)
      );

      if (existingReaction) {
        await removeReaction(ratingId, emoji);
      } else {
        await addReaction(ratingId, emoji);
      }

      await fetchReactions();
    } catch (err) {
      console.error('Failed to toggle reaction:', err);
    } finally {
      setLoading(false);
      setShowPicker(false);
    }
  };

  const getReactionCount = (emojiKey) => {
    const reaction = reactions.find((r) => r.emoji === emojiKey);
    return reaction?.count || 0;
  };

  const hasUserReacted = (emojiKey) => {
    if (!currentUserId) return false;
    const reaction = reactions.find((r) => r.emoji === emojiKey);
    return reaction?.user_ids?.includes(currentUserId) || false;
  };

  const activeReactions = reactions.filter((r) => r.count > 0);

  return (
    <div className="rating-reactions">
      {/* Display existing reactions */}
      <div className="reactions-display">
        {activeReactions.map((reaction) => {
          const emojiConfig = EMOJIS.find((e) => e.key === reaction.emoji);
          if (!emojiConfig) return null;
          return (
            <button
              key={reaction.emoji}
              className={`reaction-badge ${hasUserReacted(reaction.emoji) ? 'active' : ''}`}
              onClick={() => handleReaction(reaction.emoji)}
              disabled={!isAuthenticated || loading}
              title={emojiConfig.label}
            >
              <span className="reaction-emoji">{emojiConfig.emoji}</span>
              <span className="reaction-count">{reaction.count}</span>
            </button>
          );
        })}

        {/* Add reaction button */}
        {isAuthenticated && (
          <div className="add-reaction-container">
            <button
              className="add-reaction-btn"
              onClick={() => setShowPicker(!showPicker)}
              title="Add reaction"
            >
              +
            </button>

            {showPicker && (
              <div className="reaction-picker">
                {EMOJIS.map((e) => (
                  <button
                    key={e.key}
                    className={`picker-emoji ${hasUserReacted(e.key) ? 'active' : ''}`}
                    onClick={() => handleReaction(e.key)}
                    title={e.label}
                  >
                    {e.emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RatingReactions;
