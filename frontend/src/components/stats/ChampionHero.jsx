import { Link } from 'react-router-dom';
import './ChampionHero.css';

export default function ChampionHero({ champion }) {
  if (!champion) return null;
  const genre = champion.genres ? champion.genres.split(',')[0].trim() : null;
  const meta = [
    champion.release_year,
    genre,
    `${champion.rating_count} vote${Number(champion.rating_count) !== 1 ? 's' : ''}`,
    champion.host_name ? `hosted by ${champion.host_name}` : null
  ].filter(Boolean).join(' · ');

  return (
    <Link to={`/movie/${champion.id}`} className="champ">
      {champion.image_url
        ? <img className="champ-poster" src={champion.image_url} alt="" loading="lazy" />
        : <span className="champ-poster champ-poster-empty" aria-hidden="true" />}
      <div className="champ-info">
        <span className="champ-kicker">Reigning champion · highest rated of all time</span>
        <div className="champ-title">{champion.title}</div>
        {meta && <div className="champ-sub">{meta}</div>}
      </div>
      <div className="champ-score">
        <div className="champ-score-num">{parseFloat(champion.avg_rating).toFixed(1)}</div>
        <div className="champ-score-unit">/ 10</div>
      </div>
    </Link>
  );
}
