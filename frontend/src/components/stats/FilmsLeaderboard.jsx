import { useState } from 'react';
import { Link } from 'react-router-dom';
import SegmentedControl from './SegmentedControl';
import Backdrop from './Backdrop';
import './shared.css';

const PERIOD_LABEL = { month: 'this month', year: 'this year', all: 'all time' };
const PERIOD_KEY = { month: 'month', year: 'year', all: 'all_time' };

export default function FilmsLeaderboard({ stats }) {
  const [mode, setMode] = useState('top');
  const [period, setPeriod] = useState('all');

  const prefix = mode === 'top' ? 'top' : 'worst';
  const movies = stats[`${prefix}_${PERIOD_KEY[period]}`] || [];
  const gold = mode === 'top';

  return (
    <div className="st-module st-has-bg">
      {movies[0] && <Backdrop image={movies[0].backdrop_url || movies[0].image_url} />}
      <div className="st-module-head">
        <span className="st-mh-title">{mode === 'top' ? 'Top rated' : 'Worst rated'} · {PERIOD_LABEL[period]}</span>
        <div className="st-controls">
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[{ value: 'top', label: 'Top' }, { value: 'worst', label: 'Worst' }]}
          />
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={[{ value: 'month', label: 'Month' }, { value: 'year', label: 'Year' }, { value: 'all', label: 'All time' }]}
          />
        </div>
      </div>
      {movies.length === 0 ? (
        <p className="st-empty">Nothing with 3+ votes {PERIOD_LABEL[period]}.</p>
      ) : (
        <ol className="st-ranks">
          {movies.map((m, i) => (
            <li key={m.id}>
              <Link to={`/movie/${m.id}`} className="st-rank">
                <span className="st-rk">{String(i + 1).padStart(2, '0')}</span>
                {m.image_url
                  ? <img className="st-thumb" src={m.image_url} alt="" loading="lazy" />
                  : <span className="st-thumb st-thumb-empty" aria-hidden="true" />}
                <div className="st-rbody">
                  <span className="st-rname">{m.title}</span>
                  <span className="st-rsub">{m.rating_count} vote{Number(m.rating_count) !== 1 ? 's' : ''}</span>
                </div>
                <span className={`st-rmetric ${gold ? 'gold' : 'bone'}`}>
                  {parseFloat(m.avg_rating).toFixed(1)}<small>/10</small>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
