// Date-driven homepage seasonal themes. Returns null on ordinary days.
// Windows are intentionally short so the site stays plain almost all year.
const THEMES = [
  { key: 'halloween',  className: 'home--halloween',  eyebrow: "Tonight’s haunt",     inWindow: (m, d) => m === 10 && d >= 24 && d <= 31 },
  { key: 'christmas',  className: 'home--christmas',  eyebrow: "Season’s screenings", inWindow: (m, d) => m === 12 && d >= 20 && d <= 26 },
  { key: 'newyear',    className: 'home--newyear',    eyebrow: 'Year in review',           inWindow: (m, d) => (m === 12 && d === 31) || (m === 1 && d === 1) },
  { key: 'aprilfools', className: 'home--aprilfools', eyebrow: 'Now showing',              inWindow: (m, d) => m === 4 && d === 1 },
];

// `override` (e.g. from a ?season= query param) forces a theme for previewing.
export const getSeasonalTheme = (date = new Date(), override = null) => {
  if (override) {
    return THEMES.find((t) => t.key === override) || null;
  }
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return THEMES.find((t) => t.inWindow(month, day)) || null;
};

export const SEASONAL_KEYS = THEMES.map((t) => t.key);
