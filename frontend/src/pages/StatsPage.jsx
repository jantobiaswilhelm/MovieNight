import { getStats } from '../api/client';
import { useFetch } from '../hooks';
import { PageHeader } from '../components/ui';
import {
  ChampionHero,
  OverviewBand,
  FilmsLeaderboard,
  PeopleLeaderboard,
  ClubLore
} from '../components/stats';
import './StatsPage.css';

const ZoneHead = ({ title, meta }) => (
  <div className="sp-zone-head">
    <h2 className="sp-zone-title">{title}</h2>
    {meta && <span className="sp-zone-meta">{meta}</span>}
  </div>
);

const StatsPage = () => {
  const { data: stats, loading, error } = useFetch(() => getStats(), []);

  if (loading && !stats) return <div className="loading">Loading…</div>;
  if (error) return <div className="error">Error: {error}</div>;

  return (
    <div className="stats-page">
      <PageHeader
        eyebrow="The ledger"
        title={<>By the <em>numbers.</em></>}
        meta={[`${stats.total_movies} screenings`, `${stats.total_ratings} ratings`]}
      />

      <section className="sp-zone">
        <ChampionHero champion={stats.reigning_champion} />
        <OverviewBand stats={stats} />
      </section>

      <section className="sp-zone">
        <ZoneHead title="The films" meta="Minimum 3 votes" />
        <FilmsLeaderboard stats={stats} />
      </section>

      <section className="sp-zone">
        <ZoneHead title="The people" meta="Club regulars" />
        <PeopleLeaderboard stats={stats} />
      </section>

      <section className="sp-zone">
        <ZoneHead title="Club lore" meta="Fun facts" />
        <ClubLore stats={stats} />
      </section>
    </div>
  );
};

export default StatsPage;
