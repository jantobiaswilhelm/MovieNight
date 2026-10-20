import { formatRuntime } from '../../utils/helpers';

const OVERVIEW_MAX = 300;

// Mirrors truncateOverview in bot/src/utils/announcementEmbed.js.
const truncate = (text) => {
  const clean = text?.trim();
  if (!clean || clean.length <= OVERVIEW_MAX) return clean || null;
  const cut = clean.slice(0, OVERVIEW_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:!?]$/, '')}…`;
};

const relative = (when) => {
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const mins = Math.round((when - Date.now()) / 60000);
  if (Math.abs(mins) < 60) return rtf.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(Math.round(hours / 24), 'day');
};

/**
 * A static rendering of the embed the bot posts for a new screening, built
 * from the same fields as buildAnnouncementEmbed in
 * bot/src/utils/announcementEmbed.js. Emoji in the real embed are dropped here.
 */
export default function DiscordPreview({ film, when, announcer }) {
  const heading = film.year ? `${film.title} (${film.year})` : film.title;
  const overview = truncate(film.overview);
  const runtime = formatRuntime(film.runtime);
  const ends = film.runtime
    ? new Date(when.getTime() + film.runtime * 60000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : null;
  const whenLong = when.toLocaleString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  const genres = film.genres?.split(',').map((g) => g.trim()).filter(Boolean).join(' · ');
  const image = film.backdropUrl || film.posterUrl;
  const thumb = film.backdropUrl ? film.posterUrl : null;

  return (
    <div className="dp" aria-label="Preview of the Discord announcement">
      <div className="dp-embed">
        <div className="dp-main">
          <div className="dp-text">
            <div className="dp-author">Movie Night</div>
            <div className="dp-title">{heading}</div>
            {film.tagline && <p className="dp-desc"><em>&ldquo;{film.tagline}&rdquo;</em></p>}
            {overview && <p className="dp-desc">{overview}</p>}
            <p className="dp-desc dp-when">
              <span className="dp-ts">{whenLong}</span> · <span className="dp-ts">{relative(when)}</span>
            </p>
            <div className="dp-fields">
              {runtime && (
                <div className="dp-field">
                  <div className="dp-fname">Runtime</div>
                  <div>{runtime}<br />ends ~<span className="dp-ts">{ends}</span></div>
                </div>
              )}
              {film.rating > 0 && (
                <div className="dp-field">
                  <div className="dp-fname">TMDB</div>
                  <div>{Number(film.rating).toFixed(1)}/10</div>
                </div>
              )}
              {genres && (
                <div className="dp-field">
                  <div className="dp-fname">Genres</div>
                  <div>{genres}</div>
                </div>
              )}
              <div className="dp-field dp-field-wide">
                <div className="dp-fname">Going (0)</div>
                <div>Nobody yet — be the first</div>
              </div>
            </div>
          </div>
          {thumb && <img className="dp-thumb" src={thumb} alt="" loading="lazy" />}
        </div>
        {image && <img className="dp-image" src={image} alt="" loading="lazy" />}
        <div className="dp-footer">Announced by {announcer || 'Website'}</div>
      </div>
      <div className="dp-buttons" aria-hidden="true">
        <span className="dp-btn is-go">I&rsquo;m in</span>
        {film.trailerUrl && <span className="dp-btn">Trailer</span>}
        {film.tmdbId && <span className="dp-btn">TMDB</span>}
        {film.imdbId && <span className="dp-btn">IMDb</span>}
      </div>
    </div>
  );
}
