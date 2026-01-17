import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getMovies } from '../api/client';
import './Calendar.css';

const Calendar = () => {
  const [movies, setMovies] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const guildId = import.meta.env.VITE_GUILD_ID;

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const data = await getMovies(guildId, 100, 0);
        setMovies(data);
      } catch (err) {
        console.error('Error fetching movies:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, [guildId]);

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    return new Date(year, month, 1).getDay();
  };

  const getMoviesForDate = (day) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateToCheck = new Date(year, month, day);

    return movies.filter(movie => {
      const movieDate = new Date(movie.scheduled_at);
      return movieDate.getFullYear() === year &&
             movieDate.getMonth() === month &&
             movieDate.getDate() === day;
    });
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const formatMonthYear = (date) => {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const isToday = (day) => {
    const today = new Date();
    return today.getFullYear() === currentDate.getFullYear() &&
           today.getMonth() === currentDate.getMonth() &&
           today.getDate() === day;
  };

  if (loading) {
    return <div className="loading">Loading calendar...</div>;
  }

  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);
  const days = [];

  // Empty cells for days before the first day of the month
  for (let i = 0; i < firstDay; i++) {
    days.push(<div key={`empty-${i}`} className="calendar-day empty"></div>);
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    const dayMovies = getMoviesForDate(day);
    const hasMovies = dayMovies.length > 0;

    days.push(
      <div
        key={day}
        className={`calendar-day ${isToday(day) ? 'today' : ''} ${hasMovies ? 'has-movies' : ''}`}
      >
        <span className="day-number">{day}</span>
        {dayMovies.map(movie => (
          <Link
            key={movie.id}
            to={`/movie/${movie.id}`}
            className="calendar-movie"
          >
            {movie.image_url && (
              <img src={movie.image_url} alt="" className="calendar-movie-thumb" />
            )}
            <span className="calendar-movie-title">{movie.title}</span>
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="calendar-page">
      <div className="calendar-header">
        <h1>Movie Calendar</h1>
        <div className="calendar-nav">
          <button onClick={previousMonth} className="btn-secondary">&larr; Prev</button>
          <button onClick={goToToday} className="btn-secondary">Today</button>
          <button onClick={nextMonth} className="btn-secondary">Next &rarr;</button>
        </div>
        <h2 className="current-month">{formatMonthYear(currentDate)}</h2>
      </div>

      <div className="calendar-grid">
        <div className="calendar-weekdays">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>
        <div className="calendar-days">
          {days}
        </div>
      </div>
    </div>
  );
};

export default Calendar;
