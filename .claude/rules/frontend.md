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
- Plain CSS (no CSS-in-JS or Tailwind). One theme: **Editorial Cinephile** — see `prototypes/design-system.html` for the spec and `frontend/src/components/ui/` for the primitives.
- Design tokens live in `frontend/src/index.css` — use them by name. Canonical: `--ink / --ink-2 / --ink-3`, `--bone / --bone-dim / --bone-mute`, `--ember` (single accent, never gradient), `--gold` (ratings only), `--red` (destructive only), `--rule / --rule-strong`. Never hardcode hex — if a literal is missing, add a token.
- **No gradients on UI chrome.** Gradients are allowed only on photo overlays (movie backdrops, posters).
- **No glass / backdrop-filter.** Solid surfaces only.
- **No emoji in UI.** Use Lucide icons at 1.75 stroke, `currentColor`.
- Spacing scale: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 (`--s-1` … `--s-9`). Radius scale: 0 / 2 / 6 / 10 / full. Never use values outside the scale.
- Fonts: `--font-display` (Fraunces, italic for titles), `--font-ui` (Figtree for body), `--font-mono` (JetBrains Mono, 11px / .28em tracking / uppercase for metadata and eyebrows).
- Prefer primitives from `frontend/src/components/ui` (`Button`, `Card`, `PageHeader`, `SectionHead`, `Eyebrow`, `Rule`, `Skeleton`, `EmptyState`, `Stat`, `Chip`, `Badge`) over ad-hoc CSS. If a pattern repeats, extract a primitive rather than duplicating styles.
