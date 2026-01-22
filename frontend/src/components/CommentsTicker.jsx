import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getRandomComments } from '../api/client';
import './CommentsTicker.css';

const CommentsTicker = () => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchComments = async () => {
      try {
        const data = await getRandomComments(15);
        setComments(data);
      } catch (err) {
        console.error('Error fetching comments:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, []);

  if (loading || comments.length === 0) {
    return null;
  }

  // For seamless looping, we need enough items to fill the viewport
  // With few comments, repeat them more times; with many, just duplicate once
  const minItemsNeeded = 10;
  const repeatCount = Math.max(2, Math.ceil(minItemsNeeded / comments.length));
  const tickerContent = Array(repeatCount).fill(comments).flat();

  // Animation needs to translate by exactly one set's worth for seamless loop
  const translatePercent = 100 / repeatCount;

  return (
    <div className="comments-ticker-section">
      <div className="comments-ticker-wrapper">
        <div
          className="comments-ticker-track"
          style={{ '--translate-percent': `-${translatePercent}%` }}
        >
          {tickerContent.map((comment, index) => (
            <div key={index} className="ticker-item">
              <div className="ticker-quote">"{comment.comment}"</div>
              <div className="ticker-meta">
                <img
                  src={comment.avatar
                    ? `https://cdn.discordapp.com/avatars/${comment.discord_id}/${comment.avatar}.png?size=32`
                    : `https://cdn.discordapp.com/embed/avatars/${parseInt(comment.discord_id) % 5}.png`
                  }
                  alt=""
                  className="ticker-avatar"
                />
                <span className="ticker-user">{comment.username}</span>
                <span className="ticker-separator">on</span>
                <span className="ticker-movie">{comment.movie_title}</span>
                <span className="ticker-score">{parseFloat(comment.score).toFixed(1)}/10</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CommentsTicker;
