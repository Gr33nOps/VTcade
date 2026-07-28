```
██╗   ██╗████████╗ ██████╗ █████╗ ██████╗ ███████╗
██║   ██║╚══██╔══╝██╔════╝██╔══██╗██╔══██╗██╔════╝
██║   ██║   ██║   ██║     ███████║██║  ██║█████╗  
╚██╗ ██╔╝   ██║   ██║     ██╔══██║██║  ██║██╔══╝  
 ╚████╔╝    ██║   ╚██████╗██║  ██║██████╔╝███████╗
  ╚═══╝     ╚═╝    ╚═════╝╚═╝  ╚═╝╚═════╝ ╚══════╝
```
Play Like It's 1985

## Description

VTcade is a browser arcade styled like a 1980s computer terminal. Green text on
black, scanlines, a blinking cursor, and keyboard driven menus. Three games run
inside a fixed character grid, and scores are stored server side with global
leaderboards.

Every screen is drawn as monospaced text. The games use a 50 by 25 character
board, and all sprites are solid blocks so the grid stays aligned.

Live at [vtcade.vercel.app](https://vtcade.vercel.app).

## Features

* Three games: Snake, Runner, and Flappy Bird
* Accounts with email and password, or sign in with Google
* Email verification and password recovery
* Personal bests and per game leaderboards
* Admin panel for users, games, scores, and maintenance mode
* Pure CSS terminal effects with no images and no build step
* Retro beep sound effects, synthesised at runtime with the Web Audio API so
  there are no audio files to load, with a shared mute toggle on the M key
* Keyboard first controls with arrow keys, WASD, P to pause, M to mute, and
  Escape to exit
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
  config/         Supabase clients, auth, logging, route wrapper
  routes/         auth, admin, game, leaderboard, highscore, maintenance
  tests/          Jest and Supertest route tests
FrontEnd/         Static site, served as is
  shared/         config, session, game API, game UI, game CSS
  games/          snake, runner, flappyBird
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
   ```

   The server checks for `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, and `ADMIN_JWT_SECRET` at
   startup and exits with a message naming whatever is missing, rather than
   failing later on the first request.

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

   The API base URL lives in `FrontEnd/shared/config.js`. Point it at your own
   backend when running locally.

### Running the tests

```
cd BackEnd && npm test     # 31 route tests, Supabase fully mocked
node tests/game-logic.js   # 55 game logic and consistency checks
```

The game tests execute the real game scripts against a stubbed DOM instead of
reimplementing the rules, so they fail when a game actually regresses. Both
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

Scores are written through a Postgres function that upserts the higher of the
old and new value in one statement, so two submissions racing each other cannot
lose a score.

## Usage

**First visit.** Land on the login screen. Register with a username, email, and
password, or continue with Google. Confirm your email, then sign in.

**Playing.** From the dashboard, select GAMES, pick a title, and play. Scores
save on their own when a run ends.

**Controls.** Arrow keys or WASD to move, Space to jump or flap, P to pause,
Escape to return to the dashboard. Tab switches between login and signup, and F1
opens admin access from the login screen.

**Leaderboards.** Select LEADERBOARD from the dashboard and choose a game. The
top ten scores are shown.

**Admin.** Sign in at `/admin/adminlogin.html`. From there you can ban, unban,
and delete users, enable and disable games, flag or remove individual scores,
reset a whole leaderboard, and turn maintenance mode on and off. Disabling a
game hides it from the dashboard for every player.

## API

Base URL in production is `https://vtcade.onrender.com`.

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
a bearer token issued by that login route.

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
* The admin panel authenticates once and then uses a short lived signed token.
  The password is never stored in the browser.
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

**Frontend on Vercel.** Root directory is `FrontEnd`. It deploys on every push
to `main`. There is no build step.

**Backend on Render.** Root directory is `BackEnd`, start command `npm start`,
health check path `/health`. Set the environment variables listed above in the
Render dashboard. `render.yaml` describes the service, with every secret marked
so it is never committed.

**Database on Supabase.** Enable the Google provider under Authentication if you
want Google sign in, and add your callback page to the redirect allow list.

## Roadmap

**Soon**

* Sound effects
* User profiles
* Achievement badges

**Later**

* Real time multiplayer
* Tournament mode
* More games

## License

Distributed under the MIT License. See `LICENSE` for more information.
