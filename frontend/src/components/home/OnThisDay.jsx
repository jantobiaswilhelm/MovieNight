import { Link } from 'react-router-dom';
import { splitTitleYear } from '../../utils/helpers';
import { Icon } from '../ui';

// A one-line footnote under the recent nights: what the club watched on this date.
export default function OnThisDay({ movie }) {
  if (!movie) return null;

  const years = Number(movie.years_ago);
  const when = years === 1 ? 'A year ago today' : `${years} years ago today`;
  const avg = parseFloat(movie.avg_rating);

  return (
    <p className="on-this-day">
      <Icon name="calendar" size={14} stroke={1.5} />
      <span>
        {when}:{' '}
        <Link to={`/movie/${movie.movie_night_id}`} className="otd-title">
          {splitTitleYear(movie.title).name}
        </Link>
        {movie.rating_count > 0 && avg > 0 && (
          <> &middot; rated <span className="otd-score">{avg.toFixed(1)}</span></>
        )}
      </span>
    </p>
  );
}
