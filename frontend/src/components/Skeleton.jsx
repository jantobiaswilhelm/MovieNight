import './Skeleton.css';

export const Skeleton = ({ width, height, borderRadius = '4px', className = '' }) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius }}
    />
  );
};

export const MovieCardSkeleton = () => {
  return (
    <div className="movie-card-skeleton">
      <Skeleton width="120px" height="180px" borderRadius="0" className="skeleton-poster" />
      <div className="skeleton-info">
        <Skeleton width="80%" height="24px" />
        <Skeleton width="60%" height="16px" />
        <Skeleton width="100px" height="28px" />
      </div>
    </div>
  );
};

export const HeroSkeleton = () => {
  return (
    <div className="hero-skeleton">
      <div className="hero-skeleton-content">
        <Skeleton width="120px" height="20px" />
        <Skeleton width="300px" height="40px" />
        <Skeleton width="200px" height="20px" />
        <Skeleton width="150px" height="36px" borderRadius="8px" />
      </div>
      <Skeleton width="200px" height="300px" borderRadius="12px" className="hero-skeleton-poster" />
    </div>
  );
};

export const MovieGridSkeleton = ({ count = 3 }) => {
  return (
    <div className="movie-grid-skeleton">
      {[...Array(count)].map((_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
};

export default Skeleton;
