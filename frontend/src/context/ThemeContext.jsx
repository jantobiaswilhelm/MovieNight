import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const useTheme = () => useContext(ThemeContext);

const STORAGE_KEY = 'theme-preferences';

const getStoredPreferences = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parsing errors
  }
  return { mode: 'dark', theme: 'netflix' };
};

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => getStoredPreferences().mode);
  const [theme, setTheme] = useState(() => getStoredPreferences().theme);

  // Apply theme to HTML element
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
    document.documentElement.setAttribute('data-theme', theme);
  }, [mode, theme]);

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, theme }));
  }, [mode, theme]);

  const toggleMode = () => {
    setMode(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const setThemeByName = (themeName) => {
    if (themeName === 'netflix' || themeName === 'joker') {
      setTheme(themeName);
    }
  };

  const value = {
    mode,
    theme,
    toggleMode,
    setTheme: setThemeByName,
    isDark: mode === 'dark',
    isLight: mode === 'light',
    isNetflix: theme === 'netflix',
    isJoker: theme === 'joker'
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};
