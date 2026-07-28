# VTcade — Adding a New Game

Hand this file to whoever (or whatever) builds the next game. It is written to
be pasted as a prompt. Everything in it reflects how the three existing games
actually work today, not how they were originally written.

---

## Paste-as-prompt version

> Add a new game to VTcade at `FrontEnd/games/<name>/game.html`, following the
> existing conventions exactly. Read `FrontEnd/games/snake/game.html` first — it
> is the reference implementation.
>
> **Do not invent new styling, glyphs, wording, or layout.** Everything visual
> comes from `FrontEnd/shared/gameUI.js` and `FrontEnd/shared/game.css`. If
> something you need isn't in the shared module, add it there so all games get
> it, rather than special-casing your game.
>
> Required:
> - Link, in this order: `shared/game.css`, `shared/config.js`,
>   `shared/session.js`, `shared/gameApi.js`, `shared/gameUI.js`
> - 50×25 board via `VTGameUI.createGrid()` / `frameBoard()`; never build the
>   border by hand
> - Only these glyphs, with these meanings: `GLYPH.PLAYER` for the thing the
>   player controls, `GLYPH.HAZARD` for anything that kills, `GLYPH.PICKUP` for
>   anything collectible, `GLYPH.GROUND` for a floor
> - Side panel via `VTGameUI.panel()` with **exactly three** stat rows:
>   `SCORE`, `HIGHSCORE`, and one game-specific stat
> - Status text via `VTGameUI.statusLines()` — never write your own prompt
>   strings, so the wording and the fixed 2-line height stay consistent
> - Auth guard, score saving, pause, tab-hide pause, ESC-to-dashboard, and the
>   run-counter pattern copied from Snake (details below)
> - Register the game in the `games` table and in the dashboard's
>   `GAME_REGISTRY`, or it will not appear
> - Add assertions to `tests/game-logic.js` and make sure `node
>   tests/game-logic.js` passes
>
> Then tell me what difficulty curve you chose and why.

---

## The rules, in detail

### 1. Visual language — never deviate

| Role | Constant | Character | Meaning |
|---|---|---|---|
| Player | `GLYPH.PLAYER` | `█` U+2588 | the thing you control |
| Hazard | `GLYPH.HAZARD` | `█` U+2588 | anything that ends the run |
| Pickup | `GLYPH.PICKUP` | `█` U+2588 | anything you want to touch |
| Ground | `GLYPH.GROUND` | `─` U+2500 | the floor, a backdrop rather than a sprite |

Use the constants, never the characters directly.

**Every sprite is the same full square.** All three sprite roles are U+2588, and
`tests/game-logic.js` fails if any of them is anything else. Do not reach for a
half block such as U+2584 to make something look different: it fills only part
of its cell, so it renders visibly smaller than the block beside it. A pickup
drawn that way looked like a shrunken version of a snake segment.

Sprites are told apart by position and movement, not by shape. That is how Snake
has always worked: the snake is a connected line that moves, the food is a lone
stationary square.

**Squares and rectangles only, and only from two Unicode ranges: Box Drawing
(U+2500 to U+257F) and Block Elements (U+2580 to U+259F).** Two separate bugs
came from breaking this:

- A diamond pickup from Geometric Shapes (U+25A0 to U+25FF). Those characters
  are not drawn to fill exactly one character cell, so on every row the pickup
  appeared the board was one cell too wide and its right border visibly stepped
  out of line. The board looked broken.
- Shaded fills (U+2591 to U+2593) for hazards. Those are dither patterns, and
  they do not tile cleanly across cell boundaries, so a wall built from them
  showed seams and steps that read as sprites overlapping each other.

`VTGameUI.isMonospaceSafe(ch)` is the check, and `tests/game-logic.js` enforces
it for every glyph.

### 2. Board geometry
Fixed at 50×25 (48 playable columns) for every game, so all games sit
identically on the page. Use the constants — don't hardcode:

```js
VTGameUI.BOARD_W      // 50, including both borders
VTGameUI.BOARD_H      // 25
VTGameUI.PLAY_X_MIN   // 1
VTGameUI.PLAY_X_MAX   // 48
VTGameUI.GROUND_ROW   // 24 — floor line for side-scrollers
```

Anything that rests on the floor sits at `GROUND_ROW - spriteHeight`. Runner's
player and Flappy's bird both do this, which is why they line up.

Paint through `VTGameUI.paintRect()` rather than writing into the grid yourself,
and pass the role as the last argument:

```js
VTGameUI.paintRect(grid, x, y, w, h, GLYPH.PLAYER, VTGameUI.ROLE.PLAYER);
```

It clips to the playable area so a sprite halfway off the edge cannot bleed into
the border, and it counts any cell claimed by two different roles. The role
matters: every sprite draws the same block, so comparing glyphs cannot tell a
player sitting inside a hazard from the hazard itself.

`VTGameUI.getPaintConflicts()` must read zero after every frame.

### Never render the frame that detected the collision — but land on contact, not on a gap

A collision is only noticed after the sprite has already moved into the hazard.
Drawing the current positions at that moment puts the player visibly inside the
obstacle, which is not something a terminal game should ever show.

The naive fix — fall back to whatever the previous tick looked like — has its
own bug if the game has gravity. Velocity accumulates, so a falling sprite can
move several rows in a single tick. Showing "the previous tick" can then leave
a gap of multiple rows between the sprite and whatever ended the run, with
nothing touching on screen. That looks like the run ended for no reason, which
is worse than the overlap it replaces. Both of these are real bugs this project
shipped, one right after fixing the other — check for the second one
specifically, don't assume "no overlap" is the whole fix.

The correct behavior: land exactly on the point of contact. Binary-search
between the last known-safe position and the colliding one, using the game's
own `checkCollision()` as the oracle, along whichever coordinate is continuous
(a falling bird's `y`, a jumping player's `y`). `VTGameUI.findContactPoint` does
this generically:

```js
function buildGrid() { /* paint everything, return the grid */ }

function draw(gridOverride) {
    const grid = gridOverride || buildGrid();
    /* frameBoard + panel */
}

function gameLoop() {
    if (!gameRunning) return;

    const preY = sprite.y;          // known safe: last tick was clean
    update();                       // moves sprite.y and every hazard

    if (checkCollision()) {
        const contactY = VTGameUI.findContactPoint(preY, sprite.y, (y) => {
            const saved = sprite.y;
            sprite.y = y;
            const hit = checkCollision();
            sprite.y = saved;
            return hit;
        });

        // Rebuild the frame at the exact contact point — but ONLY if one was
        // found. A null result means even preY collides once the hazards have
        // moved to their new positions this tick (the sprite was standing
        // still and an obstacle simply reached it — no y exists that avoids
        // it). In that case do NOT rebuild: painting from the still-colliding
        // sprite.y reintroduces the overlap this whole mechanism exists to
        // prevent. lastSafeGrid already holds the last tick that was genuinely
        // clean, so just leave it alone.
        if (contactY !== null) {
            sprite.y = contactY;
            lastSafeGrid = buildGrid();
        }
        gameOver();
        return;
    }

    lastSafeGrid = buildGrid();     // this frame was clean
    draw(lastSafeGrid);
    setTimeout(gameLoop, TICK);
}

// in gameOver(), and in the repaint after the score save
draw(lastSafeGrid);
```

Reset `lastSafeGrid` to null in `restartGame()`. Test both outcomes, not just
the common one: a fast fall that needs the bisection, and a stationary sprite
that forces the `null` fallback — the second one is exactly where the overlap
bug can silently come back if the rebuild guard is missing.

### 3. Sprite scale
- **Grid games** (Snake-like): 1×1 cells.
- **Side-scrollers** (Runner/Flappy-like): player **2×2**, hazards **3 wide**.

Match whichever family your game belongs to. Don't invent a third scale.

### 4. Status area
Always call `VTGameUI.statusLines(state, keyLabel, { newRecord })`. It always
returns exactly two lines, which is what stops the board jumping vertically
between idle / playing / paused / game-over.

State is derived, not stored twice:
```js
function currentState() {
    if (!gameStarted) return STATE.IDLE;
    if (gameRunning)  return STATE.PLAYING;
    return paused ? STATE.PAUSED : STATE.GAME_OVER;
}
```

### 5. Required controls
Every game must support all of these:

| Key | Behaviour |
|---|---|
| Game keys | arrows **and** WASD equivalents |
| `P` | pause / resume |
| `ESC` | back to the dashboard (with the loading overlay) |
| Click | only if it maps naturally (jump/flap). Skip it for directional games. |

Keyboard-first is deliberate: the whole site is `cursor: none` and
keyboard-driven. Don't add touch controls to one game alone.

### 6. Scoring — the three rules that matter

**Snapshot the score before awaiting.** Reading the shared `score` after an
`await` is how a restart mid-save used to submit `0`:
```js
const finalScore = score;
```

**Paint GAME OVER before saving, not after.** The backend is free-tier and can
take seconds to wake; the player must see the run end immediately:
```js
gameRunning = false;
isNewRecord = finalScore > highScore;   // compare BEFORE the save overwrites it
draw();                                  // <- immediate
await saveHighscore(finalScore);
```

**Use a run counter so a slow response can't repaint a new run:**
```js
const runAtDeath = runCounter;      // runCounter++ inside restartGame()
...
if (runCounter === runAtDeath) { leaderboard = fresh; draw(); }
```

Never set `highScore = score` inside the game loop. The panel shows the
server-confirmed value; the live run is already shown as `SCORE`.

### 7. Networking
Only through `createGameApi(GAME_NAME)`. Never call `fetch` directly — score
submission has to be authenticated, and the server derives the username from
the verified token. Sending a username in the body does nothing.

```js
const gameApi = createGameApi(GAME_NAME);
```

### 8. Auth guard — must halt the script
```js
const currentUser = VTSession.getUsername();
if (!currentUser) {
    alert("You must be logged in to play!");
    window.location.replace("../../login/login.html");
    throw new Error("Not authenticated");   // without this the rest still runs
}
```
The `throw` is required: a redirect is only *queued*, so without it the game
initialises and fires requests for a user literally named `"null"`.

### 9. Loop and pause
```js
function startGame() {
    if (gameRunning) return;    // two fast inputs otherwise start two loops
    gameRunning = true;
    gameStarted = true;
    gameLoop();
}
```
Copy the `visibilitychange` handler from any existing game, including the
`&& !paused` guard so a deliberate pause survives a tab switch.

### 10. Difficulty
Every game must get harder. Flappy originally never did.

Scale spacing by **distance, not frames**. Runner used a frame interval while
obstacles moved by speed, so raising the speed made the gaps proportionally
wider — the difficulty partly cancelled itself:
```js
distanceSinceSpawn += gameSpeed;          // correct
if (distanceSinceSpawn >= nextGapColumns) { ... }
```
Always cap the ramp.

---

## Registering the game

Two places, or it won't show up:

**1. The database** — the admin panel's enable/disable reads this:
```sql
insert into games (title, genre, description, difficulty, is_active)
values ('YOUR GAME', 'arcade', 'One line.', 'medium', true);
```

**2. `FrontEnd/dashboard/dashboard.html` → `GAME_REGISTRY`:**
```js
{ id: 6, name: "YOUR GAME", url: "../games/yourgame/game.html",
  apiName: "YOUR GAME", shipped: true }
```
`apiName` must match the `games.title` exactly, or the admin's disable switch
won't affect it.

---

## Before you call it done

```bash
node tests/game-logic.js
```

Add your game to that file's list. The consistency block checks that every game
has identical board dimensions, identical panel height, three stat rows, and
the same prompt templates — so a new game that drifts will fail the build.

Also confirm by hand:
- [ ] Die — GAME OVER appears instantly, not after a delay
- [ ] Die, then immediately restart — the score saved is the one you earned
- [ ] Beat your best — `NEW RECORD` shows
- [ ] `P` pauses; switching tabs and back does not silently resume it
- [ ] Log out, open the game URL directly — you're bounced to login and no
      request is sent
- [ ] Disable the game in the admin panel — it disappears from the dashboard
