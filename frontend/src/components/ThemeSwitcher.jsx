import { useTheme } from '../context/ThemeContext';
import './ThemeSwitcher.css';

const themes = [
  { id: 'netflix', label: 'Netflix', colors: ['#e50914'] },
  { id: 'joker', label: 'Joker', colors: ['#a855f7', '#22c55e'] },
  { id: 'forest', label: 'Forest', colors: ['#78716c', '#84a98c'] },
];

const ThemeSwitcher = () => {
  const { mode, theme, toggleMode, setTheme } = useTheme();

  return (
    <div className="theme-switcher">
      <button
        className="mode-toggle"
        onClick={toggleMode}
        aria-label={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
        title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}
      >
        {mode === 'dark' ? (
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        ) : (
          <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </button>

      <div className="theme-dropdown">
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          aria-label="Select theme"
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        <span
          className="theme-color-indicator"
          style={{
            background: themes.find(t => t.id === theme)?.colors.length > 1
              ? `linear-gradient(135deg, ${themes.find(t => t.id === theme)?.colors[0]} 50%, ${themes.find(t => t.id === theme)?.colors[1]} 50%)`
              : themes.find(t => t.id === theme)?.colors[0]
          }}
        ></span>
      </div>
    </div>
  );
};

export default ThemeSwitcher;
