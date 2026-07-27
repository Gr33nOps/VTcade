# VTcade Improvement Plan

> **2026-07-27 update:** MongoDB has been fully removed. All data now lives in the
> project's existing Supabase Postgres database (`profiles`, `games`, `leaderboard`,
> `highscores`, `system_settings`), with `auth.users` as the single identity source
> of truth. This closed out C2, H6, H7, H8, and M3 below as a side effect — see the
> strikethrough notes in Phase 1. **Action needed:** add `SUPABASE_SERVICE_ROLE_KEY`
> to `BackEnd/.env` (placeholder is there — grab the real value from Supabase
> dashboard → Project Settings → API) before the backend will run, and update the
> same var on Render before the next deploy.

Living roadmap to take VTcade from "student project" to "solid small production app."
Organized into phases. Each phase maps to one or more of the 20 quality pillars we're
targeting. Check items off as we land them — this file is the source of truth for
what's done, what's next, and why.

**Status key:** `[ ]` not started · `[~]` in progress · `[x]` done

---

## Quality pillars → phases at a glance

| Pillar | Primary phase(s) |
|---|---|
| Functionality | Phase 1 |
| Reliability | Phase 1, 5 |
| Security | Phase 2 |
| Usability | Phase 3 |
| Navigation | Phase 3 |
| Content Quality | Phase 3 |
| User Satisfaction | Phase 3, 4 |
| Accessibility | Phase 4 |
| Compatibility | Phase 4, 6 |
| Responsiveness | Phase 4 |
| Performance | Phase 5 |
| Efficiency | Phase 5 |
| Scalability | Phase 5, 9 |
| SEO Friendliness | Phase 6 |
| Portability | Phase 6, 9 |
| Interoperability | Phase 6, 9 |
| Testability | Phase 7 |
| Availability | Phase 8 |
| Recoverability | Phase 8 |
| Maintainability | Phase 9 |

Every pillar is covered by at least one phase below. Nothing on the list is skipped.

---

## Phase 0 — Safety net (do this first, ~30 min)

Nothing below is safe to do without this.

- [ ] Fix git ownership so commands work: `git config --global --add safe.directory 'F:/Web Develepoment/VTcade'`
- [x] Confirm `BackEnd/.env` is gitignored and was **never** committed — verified via `git log --all --full-history -- BackEnd/.env` (empty output, never tracked). `MONGO_URI` has since been removed entirely (DB migrated to Supabase).
- [ ] Create a `dev` branch off current work; commit the current state as a baseline before any fixes land
- [ ] Add a root `.gitignore` entry check for `node_modules`, `.env` (already present — just verify)

---

## Phase 1 — Critical bugs & correctness (Functionality, Reliability)

Already audited and confirmed by reproduction. Fixing these unblocks everything else.

**Backend crashes**
- [x] ~~C1: `scoresToday` undefined~~ — fixed by the Supabase migration (now a real `count` query in [adminRoutes.js](BackEnd/routes/adminRoutes.js))
- [x] ~~C2: `Score` model undefined, orphans leaderboard rows~~ — fixed by the Supabase migration; delete now cascades via FK + explicit `highscores` cleanup

**High-severity**
- [ ] H1: Admin panel never checks `res.ok` — every action silently no-ops on failure — [adminpanal.html:574-787](FrontEnd/admin/adminpanal.html:574)
- [ ] H2: Session token discarded, identity = raw localStorage string — [login.html:311](FrontEnd/login/login.html:311)
- [ ] H3: Admin password stored in plaintext, replayed as headers — [adminlogin.html:341](FrontEnd/admin/adminlogin.html:341)
- [ ] H4: Double game-loop race after restart (100ms window) — snake/flappy/runner `changeDirection`/`jump`
- [ ] H5: Score reset to 0 mid-save if player restarts during the async save chain — `gameOver()` in all 3 games
- [x] ~~H6: `supabaseId` silently dropped~~ — moot: `profiles.id` *is* the Supabase auth user id now, no separate field needed
- [x] ~~H7: Signup can leave orphaned Supabase account with no Mongo record~~ — fixed: `on_auth_user_created` trigger creates the profile atomically in the same transaction as the auth signup
- [x] ~~H8: TOCTOU race on duplicate signup check~~ — mitigated: `profiles.username` unique constraint + trigger makes it fail-safe even on a race (worst case is a less-friendly error, never an orphan)

**Medium**
- [ ] M1: No `return` after redirect-on-logged-out — pollutes DB with `"null"` user — all 3 games
- [ ] M2: Flappy Bird redirect path is wrong (404) — [flappyBird/game.html:109](FrontEnd/games/flappyBird/game.html:109)
- [ ] M3: Admin panel never fetches real maintenance state on load, and the ENABLE/DISABLE menu items were unreachable — [adminpanal.html:1105](FrontEnd/admin/adminpanal.html:1105) — **still needs a frontend fix**; backend now always has a real singleton row to serve, so this is purely a frontend init-fetch fix
- [ ] M4: Unescaped interpolation into `innerHTML` (stored-XSS path via leaderboard usernames) — login/dashboard/signup/admin
- [ ] M5: Unguarded `JSON.parse(adminAuth)` can hard-freeze the panel — [adminpanal.html:186](FrontEnd/admin/adminpanal.html:186)
- [ ] M6: Maintenance middleware fails open on DB error — [maintenance.js:19](BackEnd/routes/maintenance.js:19) (logic ported as-is to Supabase; decision still pending)
- [ ] M7: 404 handler registered before error handler, swallows real errors — [server.js:31](BackEnd/server.js:31)
- [ ] M8: "Total Games Played" actually counts distinct games, not sessions — [dashboard.html:281](FrontEnd/dashboard/dashboard.html:281)
- [ ] M9: Every route swallows errors with no logging — add structured logging before fixing, so we can see what else is broken
- [ ] M10 *(new, found during migration)*: `renderHome()`'s status check compares against `"ONLINE"` but the backend sent `"OK"` — status color logic never fired. Fixed as part of the migration (backend now sends `"ONLINE"`), flagging here since it wasn't in the original audit.

**Low** (batch these together)
- [ ] L1–L10 from audit: unbounded `spawnFood` loop, missing `encodeURIComponent`, dead code, unused vars, floating sprite, uncleaned intervals, meta-refresh bounce, unauthenticated `gameRoutes`, tie-vs-record bug

**Exit criteria:** every route returns correct status codes under real load; all 3 games survive a restart-spam test; admin panel actions reflect true server state.

---

## Phase 2 — Security (Security)

Do this right after functionality, before anyone else touches the deployed instance.

- [ ] Replace admin header-auth with a signed JWT (short expiry) issued on `/api/admin/login`; drop plaintext password from localStorage
- [ ] Replace `currentUser` string identity with real session verification (Supabase JWT checked server-side) on every score/leaderboard write
- [ ] Add `helmet` for security headers (CSP, X-Frame-Options, etc.)
- [ ] Add rate limiting (`express-rate-limit`) on `/api/auth/*` and `/api/admin/login` — currently brute-forceable with zero throttling
- [ ] Lock down `gameRoutes.js` — `POST /add` and `DELETE /:id` have no auth at all (L9)
- [ ] Escape all `innerHTML` interpolation or switch to `textContent`/DOM building (closes M4 stored-XSS)
- [ ] Audit CORS — `cors()` with no options currently allows any origin; restrict to `FRONTEND_URL`
- [ ] Add input sanitization/length caps server-side (client-side caps like the 10-char username are bypassable via direct API calls)
- [ ] Confirm the Supabase service_role key stays server-side only (never bundled into frontend code) — RLS is already deny-by-default on `profiles`/`system_settings`
- [ ] Add `.env.example` (no real values) so setup doesn't require guessing var names

**Exit criteria:** no credential leaves the client in plaintext at rest; brute force and CORS are mitigated; a `security-review` pass comes back clean.

---

## Phase 3 — Usability, Navigation, Content Quality, User Satisfaction

- [ ] Add visible error/empty/loading states everywhere a fetch can fail (several screens currently just show stale data on error)
- [ ] Add a real "forgot password" flow (Supabase supports it; currently no path in UI)
- [ ] Add on-screen affordance for mouse users — currently 100% keyboard-only with `cursor: none`; at minimum let Tab/click work for accessibility and discoverability
- [ ] Fix content inconsistencies: README says "PlayBlox" in `package.json` (line 4) vs "VTcade" everywhere else — pick one name and use it consistently
- [ ] Add a visible version/build indicator and a real 404/error page (currently unstyled JSON for API 404s reaches users if BackEnd URL is hit directly)
- [ ] Smooth out navigation dead-ends: confirm every screen has a documented way back (ESC) and it's discoverable without reading source
- [ ] Sound effects, achievement badges (already on README roadmap) — reassess after core is solid

**Exit criteria:** a first-time user can sign up, verify, play, and find the leaderboard without hitting an unexplained blank state.

---

## Phase 4 — Accessibility, Compatibility, Responsiveness

Current state: **zero** `alt`, `aria-*`, or `role` attributes anywhere in the frontend (verified by grep across all 9 HTML files). No favicon. No mouse fallback.

- [ ] Add `aria-live` regions for dynamic terminal output so screen readers announce state changes
- [ ] Add semantic roles/labels to the fake "inputs" (currently off-screen `<input>` hacks driven by global keydown — screen readers get nothing)
- [ ] Provide a real focus-visible affordance; `cursor: none` + custom nav breaks standard a11y expectations
- [ ] Run an automated a11y audit (axe or Lighthouse) once the above lands
- [ ] Add a favicon (currently missing entirely)
- [ ] Test and fix cross-browser behavior (Safari/Firefox keydown-preventDefault edge cases haven't been verified)
- [ ] Verify actual mobile behavior — README claims "responsive... though optimized for desktop," but there's no on-screen keyboard fallback for touch devices, meaning mobile is effectively unusable despite the media queries in login/signup
- [ ] Recheck the media-query breakpoints against real devices, not just CSS assumption

**Exit criteria:** WCAG 2.1 AA pass on core flows (login, dashboard, one game); usable (even if degraded) on mobile without a physical keyboard.

---

## Phase 5 — Performance, Efficiency, Scalability (part 1)

- [ ] Games run on `setTimeout(gameLoop, N)` — fine, but add `document.visibilitychange` handling so backgrounded tabs don't keep looping/hammering the API on return
- [ ] Add DB indexes: `Leaderboard` is queried by `{game, score}` and `{username, game}` constantly but only has the implicit `_id` index — add compound indexes
- [ ] `Leaderboard.find({game}).sort({score:-1})` with no limit on some paths — cap and paginate consistently
- [ ] Add `compression` middleware on Express responses
- [ ] Audit Render/Supabase cold-start latency (README implies free tier) — this directly causes H5 (score-loss race); consider a keep-alive ping or documenting expected latency
- [ ] Debounce/guard the admin panel's 1-second `setInterval` re-render (L7) so it doesn't run forever in background tabs

**Exit criteria:** no unbounded queries, no runaway timers, acceptable latency budget documented.

---

## Phase 6 — SEO, Portability, Interoperability

Current state: **zero** meta description, Open Graph, robots.txt, sitemap, or canonical tags across all pages (verified by grep).

- [ ] Add `<meta name="description">`, Open Graph tags, and a favicon to every page (ties to Phase 4)
- [ ] Add `robots.txt` and a basic `sitemap.xml` for the public pages (login/signup are the only ones that should be indexable; dashboard/games/admin should be disallowed)
- [ ] Document the REST API formally (OpenAPI/Swagger) so the backend is consumable by something other than this exact frontend — currently the only "docs" are README prose
- [ ] Confirm the API works identically regardless of frontend host (currently hardcoded `https://vtcade.onrender.com` in every game file — move to one shared config, see Phase 9)

**Exit criteria:** pages have real metadata; API has a spec; no hidden coupling between one frontend build and one backend URL.

---

## Phase 7 — Testability

Current state: **zero test files, zero CI, zero lint config** in the entire repo (verified).

- [ ] Add `jest` + `supertest` to BackEnd; write tests for every route, starting with the ones we just found broken (C1, C2) so they can never regress silently again
- [ ] Add a smoke test for each game's core loop (collision detection, score increment) — pure functions, easy to unit test if extracted from the DOM-coupled files
- [ ] Add ESLint (or at least a shared `.editorconfig`) so "bad practice" pass has an enforceable baseline going forward
- [ ] Add a pre-commit hook (husky) running lint + tests

**Exit criteria:** `npm test` exists and passes; the two critical bugs from Phase 1 have regression tests proving they stay fixed.

---

## Phase 8 — Availability, Recoverability

- [ ] Add a real health check the host (Render) can use for auto-restart on crash (`/health` exists — verify it's wired into Render's health check config, not just present in code)
- [ ] Add process-level crash handling (`process.on('unhandledRejection', ...)`) so one bad promise doesn't take the whole server down
- [ ] Document/automate a DB backup strategy for Supabase (check plan tier's automatic backup retention, consider scheduled `pg_dump` if on free tier)
- [ ] Add a rollback plan: tag releases, document how to redeploy the previous Render build
- [ ] Fix M6 (maintenance fails open) as a recoverability issue too — decide deliberately whether "fail open" or "fail closed" is correct, don't leave it accidental

**Exit criteria:** a crash restarts automatically; a bad deploy can be rolled back in under 5 minutes; DB has a backup story.

---

## Phase 9 — Maintainability, Scalability (part 2), Interoperability (part 2)

- [ ] Extract the ~150 lines of near-identical terminal-render boilerplate duplicated across login/signup/adminlogin into one shared module
- [ ] Extract the ~100 lines of near-identical save/load-highscore/leaderboard fetch logic duplicated across all 3 games into one shared `api.js`
- [ ] Centralize `API_URL`/`API_BASE_URL` (currently hardcoded separately in 8+ files) into one config, injected at build or read from one constant
- [ ] Resolve the `package.json` naming inconsistency ("PlayBlox" vs "VTcade", "Your Name" as author)
- [ ] Decide on a real frontend build step (even minimal — esbuild/vite) instead of raw HTML files with inline `<script>` blocks, to make the shared-module extraction above actually practical
- [ ] Add root-level `CONTRIBUTING.md` or architecture notes once structure stabilizes — skip until after extraction, so it documents the real thing and not the current mess

**Exit criteria:** no logic is copy-pasted 3x; one source of truth for API base URL; adding a 4th game doesn't mean copying 400 lines again.

---

## Suggested order of execution

1. **Phase 0** (safety net) — today, ~30 min
2. **Phase 1** (bugs) — this is what we already scoped; do it next
3. **Phase 2** (security) — before any more public traffic touches the deployed instance
4. **Phase 7** (testability) — as early as possible so every subsequent phase has regression coverage; can interleave with Phase 1 (write the test, then the fix)
5. **Phase 9** (maintainability extraction) — do this *before* Phases 3–6 so later fixes aren't triplicated across 3 game files
6. **Phase 3, 4, 5, 6, 8** — remaining polish, roughly in that order, but flexible

---

## How we'll track this

- Check boxes off in this file as items land, one phase (or sub-batch) at a time
- Each phase ends in a working, deployable state — no phase should leave the app more broken than it started
- I'll show diffs for review before anything gets committed; nothing gets pushed without your say-so
