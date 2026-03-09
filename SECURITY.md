# Security Audit & Remediation Plan

**Audit Date:** 2026-03-09
**Last Updated:** 2026-03-09

## Implementation Status

Priorities 1-12 are completed (with Priority 7 implemented as auth code exchange rather than httpOnly cookies due to cross-origin constraints — see NF-3).
Items 13-27 have mixed status — see individual items below.

## Priority 1: SQL Injection in `specificMonth` (CRITICAL)
**Status:** DONE

**Files:** `backend/src/models/index.js:191,219`

**Problem:** The `specificMonth` query parameter is interpolated directly into SQL via string concatenation:
```js
dateFilter = `AND TO_CHAR(mn.scheduled_at, 'YYYY-MM') = '${specificMonth}'`;
```
An attacker can inject arbitrary SQL through `?month=2024-01' OR 1=1--`.

**Plan:**
- Validate `specificMonth` with regex `/^\d{4}-\d{2}$/` in `routes/stats.js` before passing to model
- Refactor the query to use a parameterized placeholder (`$N`) instead of string interpolation
- Add a test to confirm invalid month values are rejected

---

## Priority 2: Add Security Headers (HIGH)
**Status:** DONE

**Files:** `backend/src/index.js`

**Problem:** No security headers are set (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, etc.).

**Plan:**
- Install `helmet` package: `npm install helmet`
- Add `app.use(helmet())` before route registration
- Configure CSP to allow TMDB image domains and Discord CDN

---

## Priority 3: Add Rate Limiting (HIGH)
**Status:** DONE

**Files:** `backend/src/index.js`, all route files

**Problem:** Zero rate limiting on any endpoint. Enables brute force, DoS, and TMDB API key exhaustion.

**Plan:**
- Install `express-rate-limit`: `npm install express-rate-limit`
- Add a global limiter (e.g., 100 requests/minute per IP)
- Add stricter limiters on sensitive routes:
  - Auth endpoints: 10 requests/minute
  - TMDB proxy: 30 requests/minute
  - CSV import: 5 requests/minute
- Add debouncing to bot autocomplete handlers (minimum interval between TMDB lookups)

---

## Priority 4: Fix CORS Wildcard Fallback (HIGH)
**Status:** DONE

**Files:** `backend/src/index.js:25`

**Problem:** `origin: process.env.FRONTEND_URL || '*'` falls back to wildcard when `FRONTEND_URL` is unset, combined with `credentials: true`.

**Plan:**
- Remove the `|| '*'` fallback
- Add a startup check: if `FRONTEND_URL` is not set, log an error and exit
- Optionally support multiple origins via comma-separated env var for staging/production

---

## Priority 5: Validate JWT_SECRET at Startup (HIGH)
**Status:** DONE

**Files:** `backend/src/middleware/auth.js:13`, `backend/src/routes/auth.js:64`

**Problem:** If `JWT_SECRET` is unset or empty, `jsonwebtoken` will throw an error on sign/verify rather than silently using an empty secret. This means authentication will be completely broken — users cannot log in or stay authenticated. While this is not a forgery risk, it causes a full auth outage in production if the env var is misconfigured.

**Plan:**
- Add a startup check in `backend/src/index.js` that validates `JWT_SECRET` exists and is at least 32 characters
- Exit with a clear error message if validation fails, rather than discovering the problem at runtime on the first auth attempt
- Document the requirement in `.env.example`

---

## Priority 6: Fix SSL Certificate Validation (HIGH)
**Status:** DONE

**Files:** `backend/src/config/database.js:6`, `bot/src/config/database.js:6`

**Problem:** `rejectUnauthorized: false` disables SSL certificate verification in production, enabling MITM attacks on the database connection.

**Plan:**
- Change to `rejectUnauthorized: true` as default
- Add support for a `DATABASE_CA_CERT` env var to provide the CA certificate
- If Railway provides the cert automatically, document the expected configuration
- Test that connections still work in production after the change

---

## Priority 7: Eliminate JWT from URL (HIGH)
**Status:** DONE (implemented as auth code exchange — see note)

**Files:** `backend/src/routes/auth.js`, `frontend/src/context/AuthContext.jsx`, `frontend/src/api/client.js`, `frontend/src/pages/AuthCallback.jsx`

**Problem:** JWT was passed in the URL during OAuth callback (leaks in logs, browser history, Referer header).

**What was implemented:** Auth code exchange flow (Option B) instead of httpOnly cookies, because frontend (`onlyfansmovies.up.railway.app`) and backend (`movienight-production.up.railway.app`) are on different public-suffix subdomains, making cross-origin cookies impossible.
- Backend stores JWT behind a short-lived (30s) one-time auth code in memory
- OAuth callback redirects with `?code=` instead of `?token=`
- Frontend exchanges the code for JWT via `POST /auth/exchange`
- JWT never appears in URLs

**Remaining risk:** JWT still stored in `localStorage` (see NF-17). Mitigated by CSP and absence of XSS vectors. Would require a custom domain to fully resolve with httpOnly cookies.

---

## Priority 8: Validate URLs in `href`/`src` Attributes (HIGH)
**Status:** DONE

**Files:** `frontend/src/pages/Movie.jsx:216,287,524`, `frontend/src/pages/Home.jsx:687`, `frontend/src/components/WishlistDetailModal.jsx:143`

**Problem:** Database URLs (trailer_url, image_url) are rendered in `href` and `src` attributes without protocol validation. A `javascript:` URL in an `href` would execute on click. This is the primary risk vector.

**Plan:**
- Create a `frontend/src/utils/sanitizeUrl.js` utility:
  ```js
  export function sanitizeUrl(url) {
    if (!url) return '#';
    try {
      const parsed = new URL(url);
      if (['https:', 'http:'].includes(parsed.protocol)) return url;
    } catch {}
    return '#';
  }
  ```
- Apply `sanitizeUrl()` to all `href` and `src` attributes that use database-sourced URLs
- Also validate URLs on the backend before storing (allowlist TMDB and YouTube domains for trailer URLs)

### Defense-in-depth: CSS `url()` sanitization (MEDIUM)

**Files:** `frontend/src/pages/Home.jsx:415`, `frontend/src/components/Hero.jsx:27`, `frontend/src/components/WishlistDetailModal.jsx:85`

**Note:** The `javascript:` vector does not apply to CSS `background-image: url(...)` in modern browsers — they only accept valid image URLs. However, unsanitized CSS URLs could theoretically be used for tracking pixels (`url(https://attacker.com/track)`) if an attacker controlled the stored URL. Apply the same `sanitizeUrl()` check as defense-in-depth, but this is lower priority than `href`/`src` sanitization.

---

## Priority 9: Add OAuth State Parameter (Login CSRF) (HIGH)
**Status:** DONE

**Files:** `backend/src/routes/auth.js`

**Problem:** The Discord OAuth flow does not generate or validate a `state` parameter. Without it, an attacker can craft a login link that authenticates the victim into the attacker's account (login CSRF). The victim then performs actions (e.g., adding ratings, wishlists) that are tied to the attacker's account, which the attacker can later access.

**Plan:**
- In the `/auth/discord` redirect endpoint, generate a cryptographically random `state` value
- Store the `state` in a short-lived httpOnly cookie (or server-side session) before redirecting to Discord
- In the `/auth/callback`, validate that the returned `state` matches the stored value
- Reject the callback and return an error if `state` is missing or mismatched
- Use `crypto.randomBytes(32).toString('hex')` for state generation

---

## Priority 10: Fix Wishlist IDOR — Missing Ownership Checks (HIGH)
**Status:** DONE

**Files:** `backend/src/routes/wishlists.js:132,150,179`, `backend/src/models/index.js:574`

**Problem:** Multiple wishlist endpoints accept a wishlist item ID but never verify that the authenticated user owns that item. Any authenticated user can announce, update, or delete another user's wishlist entries by guessing or enumerating IDs. This is a classic Insecure Direct Object Reference (IDOR) with destructive impact.

**Plan:**
- Add an ownership check to every wishlist mutation endpoint: query the item, verify `item.user_id === req.user.id`, return 403 if not
- Consider adding a reusable helper like `assertOwnership(itemId, userId)` in the wishlists route or model layer
- Add tests: authenticated user A should get 403 when acting on user B's wishlist items

---

## Priority 11: Add Permission Checks to Bot Commands (MEDIUM)
**Status:** DONE

**Files:** `bot/src/commands/announce.js:38`, `bot/src/commands/endvote.js:21`, `bot/src/commands/startvote.js:13`

**Problem:** `/announce`, `/endvote`, and `/startvote` perform privileged actions but have no admin or permission checks. Any guild member can end votes or create announcements.

**Plan:**
- Add `isAdmin(interaction)` check at the top of each command's `execute` function
- Return an ephemeral "you don't have permission" message if the check fails
- Consider also adding `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` to the slash command builders so Discord hides them from non-admins
- Move admin IDs to an env var (`ADMIN_IDS=id1,id2`) instead of hardcoding

---

## Priority 12: Add Content Security Policy (MEDIUM)
**Status:** DONE

**Files:** `backend/src/index.js` (via helmet)

**Problem:** No CSP configured, which means any injected script can execute freely.

**Plan:**
- Configure CSP via `helmet` in the backend (Priority 2) rather than adding a `<meta>` tag in the frontend — a single source of truth avoids drift between meta tags and response headers
- Example helmet CSP config:
  ```js
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["https://fonts.gstatic.com"],
        imgSrc: ["'self'", "https://cdn.discordapp.com", "https://image.tmdb.org", "data:"],
        connectSrc: ["'self'"],
        frameSrc: ["https://www.youtube.com", "https://youtube.com"],
      },
    },
  }));
  ```
- Test that all legitimate resources (fonts, images, API calls, YouTube embeds) still load
- Iteratively tighten the policy as issues are found

---

## Additional Findings (Lower Priority)

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 13 | No input length validation on text fields (titles, comments) | MEDIUM | TODO |
| 14 | TMDB proxy endpoints are unauthenticated | MEDIUM | TODO |
| 15 | User enumeration via public profile endpoints | MEDIUM | TODO |
| 16 | `uncaughtException` handler doesn't exit process | MEDIUM | **DONE** |
| 17 | Bot rating buttons lack guild isolation | MEDIUM | TODO — see NF-5 |
| 18 | Bot has no rate limiting on interactions | MEDIUM | **PARTIAL** — autocomplete throttled |
| 19 | No global 401 handling on frontend | MEDIUM | TODO |
| 20 | `parseInt()` without NaN checks | LOW | TODO |
| 21 | No admin action audit logging | LOW | TODO |
| 22 | CSV upload mimetype check is spoofable | LOW | Won't fix |
| 23 | Verbose error logging may leak info in production | LOW | TODO |
| 24 | No suggestion limits or duplicate prevention in bot | LOW | TODO |
| 25 | No timeout on bot TMDB API calls | LOW | TODO |
| 26 | No `package-lock.json` in frontend | LOW | TODO |
| 27 | Raw backend errors shown to users in frontend | LOW | TODO |

---

## New Findings (Post-Remediation Audit)

Identified during second audit pass. Includes findings from both our re-audit and Codex review.

### HIGH

#### NF-1: Multer CVEs — Update Required
**Status:** TODO

**Files:** `backend/package.json` (`multer: ^2.0.2`)

**Problem:** Installed multer `2.0.2` has 3 HIGH-severity DoS advisories (GHSA-xf7r-hgr6-v32p, GHSA-v52c-386h-88mc, GHSA-5528-5vmv-3xc2). Fixed in `>=2.1.1`.

**Plan:** Run `npm update multer` and verify lockfile pins `>=2.1.1`.

#### NF-2: `BACKEND_URL` Not in Startup Validation
**Status:** TODO

**Files:** `backend/src/index.js:24`, `backend/src/routes/auth.js:28,58`

**Problem:** `BACKEND_URL` is used in OAuth redirect URI construction but not validated at startup. If unset, the OAuth callback URI becomes `undefined/auth/callback`, silently breaking auth.

**Plan:** Add `'BACKEND_URL'` to the `requiredEnvVars` array.

#### NF-3: Unbounded `limit`/`offset` Pagination Parameters
**Status:** TODO

**Files:** `backend/src/routes/movies.js:11`, `ratings.js:9,22`, `notifications.js:9`, `social.js:100,118`, `stats.js:247,254`

**Problem:** `limit` and `offset` from `req.query` are passed to SQL `LIMIT`/`OFFSET` with no upper bound. `?limit=999999999` causes excessive memory use and full-table scans.

**Plan:** Cap limit at 100 and validate offset is non-negative across all paginated endpoints:
```js
const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
const offset = Math.max(parseInt(req.query.offset) || 0, 0);
```

#### NF-4: No Authorization on `POST /api/movies/announce`
**Status:** TODO

**Files:** `backend/src/routes/movies.js:67-111`

**Problem:** Any authenticated user can create a pending announcement for any `guild_id`. No admin check or guild membership verification.

**Plan:** Add admin check (`isAdmin(req.user.discord_id)`) or restrict to verified guild members.

#### NF-5: Cross-Guild Data Access on Bot Button Interactions
**Status:** TODO

**Files:** `bot/src/events/interactionCreate.js` (rating buttons :104-153, vote buttons :448-503, suggest buttons :206-262, TMDB select :358-446, delete suggestion :505-556)

**Problem:** Button interactions parse IDs from `customId` and fetch data without verifying `guild_id === interaction.guildId`. A crafted or forwarded button from Guild A could rate movies, cast votes, or add suggestions in Guild B.

**Plan:** After every `getMovieNightById`, `getVotingSessionById`, or `getSuggestionById` call in button handlers, add: `if (record.guild_id !== interaction.guildId) return;`

#### NF-6: Missing `setDefaultMemberPermissions` on `/delete`, `/start`, `/reschedule`, `/admin`
**Status:** TODO

**Files:** `bot/src/commands/delete.js:6`, `start.js:6`, `reschedule.js:6`, `admin.js:6`

**Problem:** These admin commands have runtime `isAdmin()` checks but lack `setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)`, making them visible to all users in the command picker. Inconsistent with announce/endvote/startvote which do set it.

**Plan:** Add `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` to all four command builders.

#### NF-7: Bot Commands `/reschedule`, `/start`, `/delete` Lack Guild Check
**Status:** TODO

**Files:** `bot/src/commands/reschedule.js:60`, `start.js:42`, `delete.js:55`

**Problem:** These commands call `getMovieNightById(movieId)` without verifying `movie.guild_id === interaction.guildId`. An admin who knows a movie ID from another guild could reschedule, start, or delete it.

**Plan:** Add `if (movie.guild_id !== interaction.guildId)` check after fetching the movie in each command.

### MEDIUM

#### NF-8: Missing Global Express Error Handler
**Status:** TODO

**Files:** `backend/src/index.js`

**Problem:** No global error handler. If middleware throws (e.g., multer parsing, JSON parse), Express's default handler may return stack traces.

**Plan:** Add after all routes:
```js
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});
```

#### NF-9: Rate Limiter Behind Proxy Needs `trust proxy`
**Status:** TODO

**Files:** `backend/src/index.js`

**Problem:** `express-rate-limit` uses `req.ip` which behind Railway's proxy is the proxy IP, not the client's. Without `app.set('trust proxy', 1)`, all users share one rate limit bucket or limits behave incorrectly.

**Plan:** Add `app.set('trust proxy', 1)` before rate limiter middleware.

#### NF-10: TMDB Route `:id` Not Validated as Numeric
**Status:** TODO

**Files:** `backend/src/routes/tmdb.js:52,110,191`

**Problem:** The `:id` parameter is used directly in `fetch()` URL construction without validating it's numeric. Path traversal values (e.g., `../`) could cause unexpected HTTP requests.

**Plan:** Validate `if (!/^\d+$/.test(id)) return res.status(400).json({error: 'Invalid ID'});`

#### NF-11: IMDb Links Not Sanitized
**Status:** TODO

**Files:** `frontend/src/pages/Home.jsx:699`, `Movie.jsx:278,515`, `components/WishlistDetailModal.jsx:134`

**Problem:** IMDb links are built via `` `https://www.imdb.com/title/${movie.imdb_id}` `` without validating `imdb_id` format. A crafted value could create an unexpected URL.

**Plan:** Validate `imdb_id` matches `/^tt\d+$/` before rendering, or pass through `sanitizeUrl()`.

#### NF-12: Emoji Not URL-Encoded in Reaction Deletion Path
**Status:** TODO

**Files:** `frontend/src/api/client.js:277`

**Problem:** `emoji` is interpolated directly into the URL path without encoding. Crafted values could manipulate the request path.

**Plan:** Use `encodeURIComponent(emoji)` in the URL template.

#### NF-13: Notification `link` Not Validated in `<Link to>`
**Status:** TODO

**Files:** `frontend/src/components/NotificationBell.jsx:86`

**Problem:** `notification.link` from the database is used as `<Link to={notification.link}>`. If it contained an external URL, it could redirect users.

**Plan:** Validate that `notification.link` starts with `/` before using in `<Link>`.

#### NF-14: CSS `backgroundImage` URLs Not Sanitized
**Status:** TODO

**Files:** `frontend/src/pages/Home.jsx:416,595-599`, `Movie.jsx:217`, `components/Hero.jsx:27`, `components/WishlistDetailModal.jsx:86`

**Problem:** Inline `backgroundImage` styles use DB URLs directly. A URL containing `)` could break out of `url()` and inject CSS (tracking pixels, UI redressing). Not XSS but enables data exfiltration.

**Plan:** Apply `sanitizeUrl()` to all `backgroundImage` URL values as defense-in-depth.

#### NF-15: Auth Code Map + Throttle Map Unbounded Growth
**Status:** TODO

**Files:** `backend/src/routes/auth.js:8-15` (authCodes Map), `bot/src/utils/throttle.js:2-3` (lastCall Map)

**Problem:** Both in-memory Maps grow without bound. Auth codes have TTL cleanup via `setTimeout` but no max size. Throttle map entries are never cleaned up.

**Plan:** Add periodic cleanup to throttle map (prune entries older than THROTTLE_MS). Add max size check to authCodes Map.

#### NF-16: Vote `castVote` / `endvote` Not Transactional
**Status:** TODO

**Files:** `bot/src/models/index.js:294-324`, `bot/src/commands/endvote.js:68-131`

**Problem:** `castVote` does SELECT → DELETE → INSERT as separate queries (race condition). `endvote` reads winner, closes session, creates movie night without a transaction — concurrent vote could change winner, partial failure leaves orphaned data.

**Plan:** Wrap both operations in `BEGIN/COMMIT` transactions.

#### NF-17: Residual Token-at-Rest Risk in Frontend
**Status:** Won't fix (architectural constraint)

**Files:** `frontend/src/context/AuthContext.jsx`, `frontend/src/api/client.js`

**Problem:** JWT persists in `localStorage`, vulnerable to XSS theft. httpOnly cookies cannot work because frontend (`onlyfansmovies.up.railway.app`) and backend (`movienight-production.up.railway.app`) are on different `railway.app` subdomains (public suffix — cookies cannot be shared).

**Mitigations in place:** CSP restricts script execution, auth code exchange prevents JWT-in-URL leakage, no XSS vectors found (no `dangerouslySetInnerHTML`, no `innerHTML`). Would require a custom domain to fully resolve.

#### NF-18: Missing Guild-Level Authorization on API
**Status:** TODO

**Files:** `backend/src/routes/movies.js`, `stats.js`, `voting.js`, `wishlists.js`

**Problem:** Guild-scoped endpoints trust client-supplied `guild_id` without verifying the user belongs to that guild. OAuth scope is `identify` only, so guild membership is unknown server-side. An API caller could pass a different `guild_id` to access another guild's data.

**Note:** The frontend hardcodes `VITE_GUILD_ID`, so this is API-level only. Exploitability requires knowing another guild's ID. Full fix requires requesting `guilds` OAuth scope and storing membership, which is a significant architectural change.

**Plan:** Short-term — add rate limiting on guild-scoped endpoints. Long-term — request `guilds` scope and validate membership.

### LOW

#### NF-19: `parseInt()` Without NaN Check on Route Parameters
**Status:** TODO

**Problem:** `parseInt(req.params.id)` returns `NaN` for non-numeric input, causing 500 errors when passed to PostgreSQL.

**Plan:** Add shared validation helper or middleware that returns 400 for non-numeric IDs.

#### NF-20: No Duplicate Suggestion Prevention in Bot
**Status:** TODO

**Problem:** Same movie (same TMDB ID) can be suggested multiple times in a voting session, fragmenting votes.

#### NF-21: Bot Rating Score from Button Not Range-Validated
**Status:** TODO

**Problem:** Score parsed from button `customId` is not validated within 1-10 before calling `upsertRating`.

#### NF-22: `ADMIN_IDS` and `TMDB_API_KEY` Not in `.env.example`
**Status:** TODO

**Problem:** New configurable env vars are not documented in example env files.
