# Security Audit & Remediation Plan

**Audit Date:** 2026-03-09

## Priority 1: SQL Injection in `specificMonth` (CRITICAL)

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

**Files:** `backend/src/index.js`

**Problem:** No security headers are set (HSTS, X-Content-Type-Options, X-Frame-Options, CSP, etc.).

**Plan:**
- Install `helmet` package: `npm install helmet`
- Add `app.use(helmet())` before route registration
- Configure CSP to allow TMDB image domains and Discord CDN

---

## Priority 3: Add Rate Limiting (HIGH)

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

**Files:** `backend/src/index.js:25`

**Problem:** `origin: process.env.FRONTEND_URL || '*'` falls back to wildcard when `FRONTEND_URL` is unset, combined with `credentials: true`.

**Plan:**
- Remove the `|| '*'` fallback
- Add a startup check: if `FRONTEND_URL` is not set, log an error and exit
- Optionally support multiple origins via comma-separated env var for staging/production

---

## Priority 5: Validate JWT_SECRET at Startup (HIGH)

**Files:** `backend/src/middleware/auth.js:13`, `backend/src/routes/auth.js:64`

**Problem:** If `JWT_SECRET` is unset or empty, `jsonwebtoken` will throw an error on sign/verify rather than silently using an empty secret. This means authentication will be completely broken — users cannot log in or stay authenticated. While this is not a forgery risk, it causes a full auth outage in production if the env var is misconfigured.

**Plan:**
- Add a startup check in `backend/src/index.js` that validates `JWT_SECRET` exists and is at least 32 characters
- Exit with a clear error message if validation fails, rather than discovering the problem at runtime on the first auth attempt
- Document the requirement in `.env.example`

---

## Priority 6: Fix SSL Certificate Validation (HIGH)

**Files:** `backend/src/config/database.js:6`, `bot/src/config/database.js:6`

**Problem:** `rejectUnauthorized: false` disables SSL certificate verification in production, enabling MITM attacks on the database connection.

**Plan:**
- Change to `rejectUnauthorized: true` as default
- Add support for a `DATABASE_CA_CERT` env var to provide the CA certificate
- If Railway provides the cert automatically, document the expected configuration
- Test that connections still work in production after the change

---

## Priority 7: Move JWT to httpOnly Cookie (HIGH)

**Files:** `backend/src/routes/auth.js:71`, `frontend/src/context/AuthContext.jsx`, `frontend/src/api/client.js`

**Problem:** JWT is stored in `localStorage` (vulnerable to XSS theft) and passed in the URL during OAuth callback (leaks in logs, browser history, Referer header).

**Plan:**
- **Backend changes:**
  - After OAuth, set the JWT as an `httpOnly`, `Secure`, `SameSite=Strict` cookie instead of redirecting with `?token=`
  - Redirect to `/auth/callback` with no token in the URL
  - Update auth middleware to read token from cookie (fallback to Authorization header for API compatibility)
- **Frontend changes:**
  - Remove `localStorage.getItem('token')` / `setItem` logic
  - Use `credentials: 'include'` on all fetch calls
  - Update `AuthContext` to rely on `/auth/me` endpoint instead of reading token from storage
  - Add a logout endpoint that clears the cookie server-side
- **Migration:** Support both cookie and header auth during transition

---

## Priority 8: Validate URLs in `href`/`src` Attributes (HIGH)

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

**Files:** `backend/src/routes/wishlists.js:132,150,179`, `backend/src/models/index.js:574`

**Problem:** Multiple wishlist endpoints accept a wishlist item ID but never verify that the authenticated user owns that item. Any authenticated user can announce, update, or delete another user's wishlist entries by guessing or enumerating IDs. This is a classic Insecure Direct Object Reference (IDOR) with destructive impact.

**Plan:**
- Add an ownership check to every wishlist mutation endpoint: query the item, verify `item.user_id === req.user.id`, return 403 if not
- Consider adding a reusable helper like `assertOwnership(itemId, userId)` in the wishlists route or model layer
- Add tests: authenticated user A should get 403 when acting on user B's wishlist items

---

## Priority 11: Add Permission Checks to Bot Commands (MEDIUM)

**Files:** `bot/src/commands/announce.js:38`, `bot/src/commands/endvote.js:21`, `bot/src/commands/startvote.js:13`

**Problem:** `/announce`, `/endvote`, and `/startvote` perform privileged actions but have no admin or permission checks. Any guild member can end votes or create announcements.

**Plan:**
- Add `isAdmin(interaction)` check at the top of each command's `execute` function
- Return an ephemeral "you don't have permission" message if the check fails
- Consider also adding `.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)` to the slash command builders so Discord hides them from non-admins
- Move admin IDs to an env var (`ADMIN_IDS=id1,id2`) instead of hardcoding

---

## Priority 12: Add Content Security Policy (MEDIUM)

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

These should be addressed after the top 12:

| # | Issue | Severity |
|---|-------|----------|
| 13 | No input length validation on text fields (titles, comments) | MEDIUM |
| 14 | TMDB proxy endpoints are unauthenticated | MEDIUM |
| 15 | User enumeration via public profile endpoints | MEDIUM |
| 16 | `uncaughtException` handler doesn't exit process | MEDIUM |
| 17 | Bot rating buttons lack guild isolation | MEDIUM |
| 18 | Bot has no rate limiting on interactions | MEDIUM |
| 19 | No global 401 handling on frontend | MEDIUM |
| 20 | `parseInt()` without NaN checks | LOW |
| 21 | No admin action audit logging | LOW |
| 22 | CSV upload mimetype check is spoofable | LOW |
| 23 | Verbose error logging may leak info in production | LOW |
| 24 | No suggestion limits or duplicate prevention in bot | LOW |
| 25 | No timeout on bot TMDB API calls | LOW |
| 26 | No `package-lock.json` in frontend | LOW |
| 27 | Raw backend errors shown to users in frontend | LOW |
