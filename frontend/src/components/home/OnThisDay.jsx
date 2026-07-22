import { Link } from 'react-router-dom';
import { Icon } from '../ui';

export default function OnThisDay({ movie }) {
  if (!movie) return null;

  const years = Number(movie.years_ago);
  const yearsLabel = years === 1 ? '1 year ago' : `${years} years ago`;
  const avg = parseFloat(movie.avg_rating);

  return (
    <aside className="on-this-day">
      <span className="otd-eyebrow">
        <Icon name="calendar" size={14} stroke={1.5} />
        On this day &middot; {yearsLabel}
      </span>
      <p className="otd-body">
        You watched{' '}
        <Link to={`/movie/${movie.movie_night_id}`} className="otd-title">
          {movie.title}
        </Link>
        {movie.rating_count > 0 && avg > 0 && (
          <> &middot; rated <strong>{avg.toFixed(1)}</strong></>
        )}
      </p>
    </aside>
  );
}
