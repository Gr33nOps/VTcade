```
██╗   ██╗████████╗ ██████╗ █████╗ ██████╗ ███████╗
██║   ██║╚══██╔══╝██╔════╝██╔══██╗██╔══██╗██╔════╝
██║   ██║   ██║   ██║     ███████║██║  ██║█████╗  
╚██╗ ██╔╝   ██║   ██║     ██╔══██║██║  ██║██╔══╝  
 ╚████╔╝    ██║   ╚██████╗██║  ██║██████╔╝███████╗
  ╚═══╝     ╚═╝    ╚═════╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```
Play Like It's 1985

[![CI](https://github.com/Gr33nOps/VTcade/actions/workflows/ci.yml/badge.svg)](https://github.com/Gr33nOps/VTcade/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-00ff00.svg)](LICENSE)
[![Play](https://img.shields.io/badge/play-vtcade.vercel.app-00ff00.svg)](https://vtcade.vercel.app)

## Description

VTcade is a browser arcade styled like a 1980s computer terminal. Green text on
black, scanlines, a blinking cursor, and keyboard driven menus. Three games run
inside a fixed character grid, and scores are stored server side with global
leaderboards.

Every screen is drawn as monospaced text. There are no images and no build step.
The games use a 50 by 30 character board, and all sprites are solid blocks so the
grid stays aligned. Those numbers are a 5 to 3 ratio on purpose. A monospace cell
is 0.6em wide and 1em tall, so 50 by 30 renders as a 480 by 480 pixel square.

Live at [vtcade.vercel.app](https://vtcade.vercel.app).

## Features

* Three games: Snake, Tetris, and Flappy Bird
* Accounts with email and password, or sign in with Google
* Email verification and password recovery
* Personal bests and per game leaderboards
* Admin panel for users, games, scores, and maintenance mode
* Retro beep sound effects, synthesised at runtime with the Web Audio API, so
  there are no audio files to load. Shared mute toggle on the M key.
* Terminal effects in pure CSS. No images, no framework, no bundler.
* Every screen scales to fit the window. Font size is derived from both viewport
  dimensions, so nothing is ever cut off on a small or short screen.
* Keyboard only by design. Nothing on the site needs a mouse.
* Scores are submitted with a verified session token, so a player cannot post a
  score under someone else's name

## Built With

* Frontend: plain HTML, CSS, and JavaScript with no framework and no bundler
* Backend: Node.js and Express
* Database and auth: Supabase Postgres
* Hosting: Vercel for the frontend, Render for the backend

## Project Layout

```
BackEnd/          Express API
  config/         Supabase clients, auth, origins, logging, route wrapper
  routes/         auth, admin, game, leaderboard, highscore, maintenance
  tests/          Jest and Supertest route tests
FrontEnd/         Static site, served as is
  shared/         config, session, game API, game UI, clipboard, CSS
  games/          snake, tetris, flappyBird
  dashboard/      player menu
  admin/          admin login and panel
  login/ signup/  auth screens
tests/            Game logic and consistency tests
```

## Getting Started

### Prerequisites

* Node.js 18 or newer
* A Supabase project

### Installation

1. Clone the repository.

   ```
   git clone https://github.com/Gr33nOps/VTcade.git
   cd VTcade
   ```

2. Install backend dependencies.

   ```
   cd BackEnd
   npm install
   ```

3. Create `BackEnd/.env`. Copy `BackEnd/.env.example` and fill it in.

   ```
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000

   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_publishable_anon_key
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=choose_a_strong_password
   ADMIN_JWT_SECRET=a_long_random_string
   ADMIN_TOKEN_TTL=2h
   TRUST_PROXY_HOPS=0
   ```

   `TRUST_PROXY_HOPS` is `0` locally because nothing sits in front of the server.
   Production uses `4`; see Deployment for why, and note that leaving it unset
   defaults to `4`, which is wrong for local use.

   The server checks for `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, and `ADMIN_JWT_SECRET` at
   startup and exits with a message naming whatever is missing, rather than
   failing later on the first request.

   It also refuses to start on values that are present but weak: an
   `ADMIN_JWT_SECRET` under 32 characters, an `ADMIN_PASSWORD` under 12, or a
   password that is a known default. The placeholder printed above is itself
   rejected, so replace it. A weak signing secret is not a degraded state to run
   in, it is an unlocked door, so this is fatal rather than a warning that
   scrolls past in a log.

   The service role key bypasses Row Level Security and is used only on the
   server. Never ship it to the browser. Find it in Supabase under Project
   Settings, then API.

   Generate the JWT secret with:

   ```
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

4. Start the backend.

   ```
   npm start
   ```

5. Serve the frontend from the `FrontEnd` directory with any static server.

   ```
   cd ../FrontEnd
   npx live-server
   ```

   `FrontEnd/shared/config.js` points at `http://localhost:5000` when the page is
   served from localhost, and uses a same origin path otherwise. Change the port
   there if your backend runs elsewhere.

### Running the tests

```
cd BackEnd && npm test     # 60 route tests, Supabase fully mocked
node tests/game-logic.js   # 96 game logic and consistency checks
node tests/sound.js        # sound module against a stubbed AudioContext
node tests/layout.js       # menu column alignment and character widths
```

The game tests execute the real game scripts against a stubbed DOM instead of
reimplementing the rules, so they fail when a game actually regresses. All four
suites run in GitHub Actions on every push.

## Database

Four tables in Supabase Postgres, with `auth.users` as the single source of
identity.

| Table | Purpose |
|---|---|
| `profiles` | One row per account, created automatically by a trigger on signup |
| `games` | Game catalogue, including the flag the admin panel toggles |
| `leaderboard` | Best score per player per game |
| `system_settings` | Single row holding the maintenance mode flag |

Scores are written through a Postgres function that upserts the higher of the old
and new value in one statement, so two submissions racing each other cannot lose
a score.

## Usage

**First visit.** Land on the login screen. Register with a username, email, and
password, or continue with Google. Confirm your email, then sign in.

**Playing.** From the dashboard, select GAMES, pick a title, and play. Scores
save on their own when a run ends.

**Controls.** Arrow keys or WASD to move. Up rotates in Tetris. Space jumps,
flaps, or hard drops. P pauses, M mutes, Escape returns to the dashboard. Tab
switches between login and signup, and F1 opens admin access from the login
screen.

**Typing.** The text fields are characters drawn into a `<pre>`, not real
inputs, so the browser's own clipboard has nothing to act on. Ctrl+V pastes
into whichever field the cursor is on, and Ctrl+C copies it back out. Ctrl+Shift+V
works too. Ctrl+Shift+C is attempted but both Chrome and Firefox reserve it for
their inspector, so plain Ctrl+C is the reliable one.

**Leaderboards.** Select LEADERBOARD from the dashboard and choose a game. The
top ten scores are shown.

**Admin.** Sign in at `/admin/adminlogin.html`. From there you can ban, unban,
and delete users, enable and disable games, flag or remove individual scores,
reset a whole leaderboard, and turn maintenance mode on and off. Disabling a game
hides it from the dashboard for every player.

## API

Browsers reach the API at `/api` on the frontend's own origin. Vercel rewrites
that through to `https://vtcade.onrender.com`, which is also the base URL for
anything calling the API directly. See Deployment for why the proxy exists.

**Auth**

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Returns a Supabase session |
| GET | `/api/auth/google` | Redirects into Google sign in |
| POST | `/api/auth/google/session` | Verifies the token Google returned |
| POST | `/api/auth/refresh` | Exchanges a refresh token for a new session |
| POST | `/api/auth/forgot-password` | Sends a reset link |
| POST | `/api/auth/reset-password` | Sets a new password |
| POST | `/api/auth/resend-verification` | Resends the confirmation email |
| POST | `/api/auth/logout` | Ends the session |

**Games and scores**

| Method | Path | Notes |
|---|---|---|
| GET | `/api/game` | List games, public |
| GET | `/api/leaderboard/:game` | Top scores, public |
| GET | `/api/leaderboard/rank/:username/:game` | A player's rank |
| GET | `/api/highscore/user/:username` | A player's bests |
| GET | `/api/highscore/:username/:game` | One best score |
| POST | `/api/leaderboard/save` | Submit a score, requires a session |
| POST | `/api/highscore/save` | Submit a score, requires a session |

**Admin.** Everything under `/api/admin` other than `/api/admin/login` requires
the session issued by that login route. In a browser that is the httpOnly cookie
it sets. Scripts may send the same token as a bearer header instead.
`POST /api/admin/logout` revokes it.

The cookie is scoped to `/api/admin`, so it is never attached to a player or
public request. `POST /api/game/add` and `DELETE /api/game/:id` sit outside that
path and are therefore reachable only with a bearer header, not from a browser
session. The admin panel does not use them.

**Health.** `GET /health` returns `{"ok":true}` and is what Render polls.

### Submitting a score

The username is never taken from the request body. The server reads it from the
verified token, so naming another player in the payload has no effect.

```javascript
const res = await fetch('https://vtcade.onrender.com/api/leaderboard/save', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({ game: 'SNAKE', score: 120 })
});
```

In the frontend this is handled for you by `FrontEnd/shared/gameApi.js`, which
attaches the token and refreshes it when it expires.

## Security

* Player identity comes from a Supabase access token that the server verifies on
  every score submission
* The admin session is an httpOnly, `SameSite=Strict` cookie scoped to
  `/api/admin`. The token is never in a response body and never in
  `localStorage`, so a script injected into the panel has nothing to read. This
  is why `/api` is proxied through the frontend origin. See Deployment.
* Signing out revokes the token server side, not just in the browser
* Admin tokens pin the algorithm, issuer, and audience, and carry a unique id
* Cross origin state changing admin requests are refused, behind `SameSite`
* Every admin action that changes or destroys something is written to an audit
  log with the actor, the target, and the source address
* The server refuses to start on a weak `ADMIN_PASSWORD` or `ADMIN_JWT_SECRET`
* Admin password comparison is constant time over fixed length digests, so it
  does not leak the password's length through response timing
* Failed admin logins are rate limited per address and, on top of that, globally
* Helmet security headers, gzip compression, and CORS limited to known origins
* Rate limits on every credential endpoint and on score submission
* All user supplied text is escaped before it reaches the page
* Scores are validated as bounded whole numbers on the server

## Adding a Game

`NEW_GAME_SPEC.md` documents the conventions a new game has to follow, including
the shared glyph set, board geometry, sprite sizes, the ordering that keeps a
score from being lost when a player restarts mid save, and the two places a game
must be registered to appear.

## Deployment

**Frontend on Vercel.** Root directory is `FrontEnd`. It deploys on every push to
`main`. There is no build step.

`FrontEnd/vercel.json` rewrites `/api/*` through to the Render backend. This is
load bearing, not a convenience. `vercel.app` and `onrender.com` are both on the
Public Suffix List, so `vtcade.vercel.app` and `vtcade.onrender.com` are entirely
separate *sites*. Without the rewrite the admin session cookie would be third
party, which Safari blocks and Firefox partitions, and the panel would stop
working in both. Proxying keeps every request same origin, so the cookie is first
party and can be `SameSite=Strict`. It also takes CORS out of the request path
and stops exposing the backend's real origin.

If you point the frontend somewhere without that rewrite, set
`window.VTCADE_API_URL` in `FrontEnd/shared/config.js` back to an absolute URL,
and expect the admin cookie to stop working.

**Backend on Render.** Root directory is `BackEnd`, start command `npm start`,
health check path `/health`. Set the environment variables listed above in the
Render dashboard. `render.yaml` describes the service, with every secret marked
so it is never committed.

`TRUST_PROXY_HOPS` is `4`. Vercel's rewrite sits in front of Render's own router
and `X-Forwarded-For` arrives four deep, so the client address is the fourth
entry from the socket. This is measured, not guessed. It was set to `2` at first
and `req.ip` resolved to a shared Cloudflare edge address, which meant every
visitor behind that edge shared a single rate limit bucket. After any hosting
change, confirm it with `GET /api/admin/diagnostics/ip`. If `seenIp` is not your
own address, the number is wrong.

A fixed hop count is only correct for traffic arriving through Vercel. Anything
hitting the Render URL directly has a shorter chain and could forge
`X-Forwarded-For` to change its apparent address and dodge the per address
limits. The global cap on failed admin logins is not keyed by address and is what
covers that case.

**Database on Supabase.** Enable the Google provider under Authentication if you
want Google sign in, and add your callback page to the redirect allow list.

## Roadmap

**Soon**

* User profiles with per game statistics
* Achievement badges
* A fourth game

**Later**

* Real time multiplayer
* Tournament mode

## License

MIT. See [LICENSE](LICENSE).
