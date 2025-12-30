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

VTcade is a web-based arcade gaming platform that emulates the look and feel of an old 1980s computer terminal. Featuring green text on a black screen, keyboard-only controls, and classic games, it's built with modern web technologies for a nostalgic experience.

This project was developed as part of a Web Technology course, demonstrating full-stack web development skills including authentication, database integration, real-time features, and deployment.

## Features

- **Three Arcade Games**: Flappy Bird, Runner, Snake
- **User Accounts**: Login/registration with email verification
- **High Score Tracking**: Personal bests and global leaderboards
- **Admin Dashboard**: Manage users, games, and system health
- **Retro Aesthetic**: Pure CSS terminal effects (glow, scanlines, blinking cursor)
- **Keyboard-Only Controls**: Arrow keys and Enter for navigation
- **Security**: Input validation, XSS prevention, secure password handling via Supabase
- **Responsive Design**: Adjusts for smaller screens (though optimized for desktop; mobile requires keyboard input)

## Built With

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js + Express
- **Database**: Supabase (for data storage, auth, and email verification)
- **Hosting**: Backend on Render.com, Frontend on Vercel

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm
- Supabase account (for database and auth)
- GitHub account (for deployment integration)

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/your-username/vtcade.git
   cd vtcade
   ```

2. Install backend dependencies:
   ```
   cd backend
   npm install
   ```

3. Configure environment variables:
   Create a `.env` file in the `backend` directory with:
   ```
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_password
   PORT=3000
   ```

4. Run the backend server:
   ```
   npm start
   ```

5. For the frontend, open in a browser or use a local server:
   ```
   cd ../frontend
   npx live-server
   ```

### Deployment

- **Backend (Render.com)**:
  - Push code to GitHub.
  - Connect Render to your repository.
  - Add environment variables: `SUPABASE_URL`, `SUPABASE_KEY`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`.
  - Deploy automatically on push.

- **Frontend (Vercel)**:
  - Push code to GitHub.
  - Connect Vercel to your repository.
  - Update API URL in JavaScript files to point to your backend (e.g., `https://your-backend.onrender.com`).
  - Deploy.

- **Database (Supabase)**:
  - Create a free project in Supabase.
  - Set up tables: `users`, `games`, `highscores`, `leaderboard`.
  - Get your Supabase URL and anon key for the `.env`.

## Usage

### User Flow

- **First Time Visit**:
  - Land on the login page.
  - Register a new account (username, email, password).
  - Login to access the dashboard.

- **Playing Games**:
  - From dashboard, use arrow keys to select "GAMES".
  - Press Enter, choose a game.
  - Play using keyboard controls.
  - Scores save automatically.

- **Checking Leaderboards**:
  - Select "LEADERBOARD" from dashboard.
  - View top 50 players; your rank highlighted.

- **Admin Access**:
  - Login with admin credentials.
  - Manage users (ban/unban/delete), games (enable/disable), scoreboards, and maintenance mode.

## API Endpoints

All communication via REST API:

- **Auth**:
  - POST `/api/auth/register` - Create account
  - POST `/api/auth/login` - Sign in

- **Games**:
  - GET `/api/games` - List available games

- **Scores**:
  - GET `/api/highscore/user/:username` - Get user's high scores
  - POST `/api/highscore/submit` - Save new score

- **Leaderboard**:
  - GET `/api/leaderboard/:game` - Get top scores

- **Admin**:
  - GET `/api/admin/stats` - System statistics
  - GET `/api/admin/users` - List all users
  - PUT `/api/admin/users/:id/ban` - Ban a user

Example API Call (Submit Score):

```javascript
async function submitScore(username, game, score) {
    const response = await fetch('https://vtcade.onrender.com/api/highscore/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, game, score })
    });
    const data = await response.json();
    return data;
}
```

## Screenshots

- **User Dashboard**:
  <img width="867" height="877" alt="image" src="https://github.com/user-attachments/assets/00096284-599e-40dc-9e85-870cf406724c" />


- **Admin Dashboard**:
  <img width="848" height="1018" alt="image" src="https://github.com/user-attachments/assets/ab1070fa-496a-4155-bfa2-8b71a5379087" />


- **Game Example (Flappy Bird)**:
  <img width="903" height="655" alt="image" src="https://github.com/user-attachments/assets/8e192918-3f02-44e4-8692-d0fd8841ae38" />

## Challenges Solved

- **Retro Terminal Look**: Achieved with CSS text-shadow, gradients, and animations.
- **Keyboard Navigation**: Manual tracking of selected indices with keydown events.
- **Leaderboard Updates**: Efficient Supabase queries and indexing.
- **Screen Readability**: Media queries for font scaling.

## Roadmap

**Soon**:
- Sound effects
- User profiles
- Achievement badges
- Friend lists

**Later**:
- Real-time multiplayer
- Mobile apps
- Tournament mode
- More games
- Chat system

## Project Stats

- Code Lines: ~8,000
- Development Time: 3 months
- Files: 25+
- API Endpoints: 20+
- Games: 3
- Database Tables: 4


## License

Distributed under the MIT License. See `LICENSE` for more information.
