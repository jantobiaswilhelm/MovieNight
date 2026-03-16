import { Link } from 'react-router-dom';

const features = [
  { to: '/wishlist', label: 'Wishlist', icon: '\u2B50', desc: 'Movies to watch next' },
  { to: '/my-movies', label: 'My Movies', icon: '\uD83C\uDFA5', desc: 'Your personal watchlog' },
  { to: '/achievements', label: 'Achievements', icon: '\uD83C\uDFC6', desc: 'Badges & milestones' },
  { to: '/collections', label: 'Collections', icon: '\uD83D\uDCDA', desc: 'Movie franchises' },
  { to: '/lists', label: 'Lists', icon: '\uD83D\uDCCB', desc: 'Curated movie lists' },
  { to: '/stats', label: 'Statistics', icon: '\uD83D\uDCCA', desc: 'Leaderboards & data' },
];

const ExploreSection = () => {
  return (
    <section className="home-section explore-section">
      <div className="section-header">
        <h2>Explore</h2>
      </div>
      <div className="explore-grid">
        {features.map((feature) => (
          <Link key={feature.to} to={feature.to} className="explore-card">
            <span className="explore-icon">{feature.icon}</span>
            <div className="explore-info">
              <span className="explore-label">{feature.label}</span>
              <span className="explore-desc">{feature.desc}</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default ExploreSection;
