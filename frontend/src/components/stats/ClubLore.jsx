import { Link } from 'react-router-dom';
import { formatMonth } from '../../utils/helpers';
import RatingHistogram from './RatingHistogram';
import Backdrop from './Backdrop';
import './ClubLore.css';

const f1 = (v) => parseFloat(v).toFixed(1);

export default function ClubLore({ stats }) {
  const dist = stats.rating_distribution;
  const sig = stats.signature;
  const div = stats.most_divisive?.most_divisive;
  const cad = stats.cadence;
  const att = stats.attendance;
  const ext = stats.film_extremes;

  const hasDist = dist && dist.some((d) => d.count > 0);

  return (
    <div className="lore">
      {hasDist && (
        <div className="lore-card lore-span">
          <span className="lore-k">Rating distribution</span>
          <span className="lore-csub">every score the club has ever cast</span>
          <RatingHistogram distribution={dist} avg={stats.overall_avg_rating} />
        </div>
      )}

      <div className="lore-grid">
        {sig?.top_genre && (
          <div className="lore-card st-has-bg">
            <Backdrop image={sig.top_genre.backdrop_url || sig.top_genre.image_url} />
            <span className="lore-k">Signature</span>
            <span className="lore-big">{sig.top_genre.genre}</span>
            <p className="lore-csub">most-watched genre · {sig.top_genre.count} nights</p>
            {sig.top_decade && <p className="lore-note">Favourite decade: <strong>{sig.top_decade.decade}s</strong></p>}
          </div>
        )}

        {div && (
          <div className="lore-card st-has-bg">
            <Backdrop image={div.backdrop_url || div.image_url} />
            <span className="lore-k">Most divisive</span>
            <Link to={`/movie/${div.id}`} className="lore-big lore-link">{div.title}</Link>
            <div className="lore-chips">
              <span className="lore-chip love">loved {f1(div.high)}</span>
              <span className="lore-chip hate">hated {f1(div.low)}</span>
            </div>
            <p className="lore-note">{div.rating_count} votes · widest spread</p>
          </div>
        )}

        {cad?.busiest_month && (
          <div className="lore-card st-has-bg">
            <Backdrop image={cad.busiest_backdrop_url || cad.busiest_image_url} />
            <span className="lore-k">Cadence</span>
            <span className="lore-big">{f1(cad.avg_per_month)}<span className="lore-unit"> /mo</span></span>
            <p className="lore-csub">average movies per month</p>
            <p className="lore-note">Busiest: <strong>{formatMonth(cad.busiest_month)}</strong>, {cad.busiest_count} nights</p>
          </div>
        )}

        {att?.best && (
          <div className="lore-card st-has-bg">
            <Backdrop image={att.best.backdrop_url || att.best.image_url} />
            <span className="lore-k">Attendance</span>
            <span className="lore-big">{Math.round(att.avg_attendance)}<span className="lore-unit"> avg</span></span>
            <p className="lore-csub">people per screening</p>
            <p className="lore-note">Best turnout: <strong>{att.best.title}</strong>, {att.best.attendee_count} in</p>
          </div>
        )}

        {ext && (ext.longest || ext.shortest) && (
          <div className="lore-card lore-span2 st-has-bg">
            <Backdrop image={(ext.longest || ext.shortest)?.backdrop_url || (ext.longest || ext.shortest)?.image_url} />
            <span className="lore-k">Runtime extremes</span>
            <div className="lore-two">
              {ext.longest && <div><span className="lore-two-k">Longest</span><div className="lore-two-v">{ext.longest.title}</div><div className="lore-two-s">{ext.longest.runtime} min</div></div>}
              {ext.shortest && <div><span className="lore-two-k">Shortest</span><div className="lore-two-v">{ext.shortest.title}</div><div className="lore-two-s">{ext.shortest.runtime} min</div></div>}
            </div>
          </div>
        )}

        {ext && (ext.oldest || ext.newest) && (
          <div className="lore-card lore-span2 st-has-bg">
            <Backdrop image={(ext.oldest || ext.newest)?.backdrop_url || (ext.oldest || ext.newest)?.image_url} />
            <span className="lore-k">Era range</span>
            <div className="lore-two">
              {ext.oldest && <div><span className="lore-two-k">Oldest</span><div className="lore-two-v">{ext.oldest.title}</div><div className="lore-two-s">{ext.oldest.release_year}</div></div>}
              {ext.newest && <div><span className="lore-two-k">Newest</span><div className="lore-two-v">{ext.newest.title}</div><div className="lore-two-s">{ext.newest.release_year}</div></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
