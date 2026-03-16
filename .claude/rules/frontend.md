---
paths:
  - "frontend/**"
---

# Frontend Rules

- All API calls go through `frontend/src/api/client.js` — add new methods there, don't use fetch directly in components
- New pages should be lazy-loaded in `App.jsx`: `const Page = lazy(() => import('./pages/Page'))`
- Auth state via `useAuth()` hook from AuthContext — provides `user`, `isAdmin`, `isAuthenticated`
- Theme via `useTheme()` hook from ThemeContext
- Notifications via `useNotification()` hook — `showSuccess()`, `showError()`
- GUILD_ID comes from `import.meta.env.VITE_GUILD_ID` — pass as query param to API calls
- Plain CSS (no CSS-in-JS or Tailwind), glass morphism style
