# Adding a New Game to VTcade

Hand this file to whoever (or whatever) builds the next game. It is written to
be pasted as a prompt. Everything in it reflects how the three existing games
actually work today, not how they were originally written.

---

## Paste-as-prompt version

> Add a new game to VTcade at `FrontEnd/games/<name>/game.html`, following the
> existing conventions exactly. Read `FrontEnd/games/snake/game.html` first, it
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
> - Declare your board in CELLS with `VTGameUI.setBoard(cols, rows)`, then use
>   `createGrid()` / `frameBoard()`; never build the border by hand and never
>   count characters
> - Only these glyphs, with these meanings: `GLYPH.PLAYER` for the thing the
>   player controls, `GLYPH.HAZARD` for anything that kills, `GLYPH.PICKUP` for
>   anything collectible, `GLYPH.GROUND` for a floor
> - Side panel via `VTGameUI.panel()` with **exactly three** stat rows:
>   `SCORE`, `HIGHSCORE`, and one game-specific stat
> - Status text via `VTGameUI.statusLines()`. Never write your own prompt
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

### 1. Visual language, never deviate

| Role | Constant | Character | Meaning |
|---|---|---|---|
| Player | `GLYPH.PLAYER` | `█` U+2588 | the thing you control |
| Hazard | `GLYPH.HAZARD` | `█` U+2588 | anything that ends the run |
| Pickup | `GLYPH.PICKUP` | `█` U+2588 | anything you want to touch |
| Ground | `GLYPH.GROUND` | `─` U+2500 | the floor, a backdrop rather than a sprite |

**Never draw a border inside the board.** There was briefly a `GLYPH.WALL`
(`│`), added so Tetris could draw side rails around a well narrower than the
playfield. It was a mistake and it is gone. The board's frame is the only frame
any game gets; a game that draws its own box inside that one reads instantly as
the odd one out, and no amount of correct behaviour makes up for it.

If your playfield is narrower than your board, **make the board narrower**. Do
not widen the cells to fill it, and do not draw rails around the gap. Both were
tried. Tetris declares a 12×24 board for exactly this reason, and its walls are
the board's own frame.

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

**Work in cells. Never in characters.**

A cell is the unit every sprite is built from: **2 characters wide by 1 row
tall**. That is the single most important number here, because a character is
9.6 × 16 px and reads as tall and thin, while two side by side is 19.2 × 16,
near enough square.

Declare your board size in cells, once, before drawing anything:

```js
VTGameUI.setBoard(20, 24);          // cols, rows, in CELLS

VTGameUI.cols()                     // 20
VTGameUI.rows()                     // 24
VTGameUI.groundRow()                // 23, floor line for side-scrollers
VTGameUI.CELL_W                     // 2, characters per cell
```

Coordinates run `0 .. cols-1` and `0 .. rows-1`. The border is added at render
time by `frameBoard`, so nothing you paint has to know it exists. Expanding a
cell to characters happens in exactly one place, which is why no game needs to
know the ratio at all.

**The board size is per game, and that is deliberate.** Snake and Flappy use
20×24; Tetris uses 12×24, because a Tetris well is narrow and deep. This is the
one rule that got reversed: all three used to share one board, and forcing a
narrow well across a wide board is what pushed Tetris to a four character cell,
which made its blocks render at 2.40 while a Snake segment rendered at 0.60. The
games looked like they came from different arcades.

What is shared is **the cell, not the board**. `tests/game-logic.js` asserts
every game uses the same `CELL_W` and that it renders close to square.

If your board should look square on screen, remember a cell is 1.2 times wider
than it is tall, so you need **5 cells across for every 6 down**: 20×24 is
384 × 384 px. A 24×24 board would render 1.20 wide.

**Never restate these numbers in a test.** They were hardcoded in a dozen
places, and when the board changed shape twelve checks failed, none because a
game had broken, all because the test was describing the old board. Read them
from `VTGameUI`.

Anything resting on the floor sits at `groundRow() - spriteHeight`.

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

### Never render the frame that detected the collision, but land on contact, not on a gap

A collision is only noticed after the sprite has already moved into the hazard.
Drawing the current positions at that moment puts the player visibly inside the
obstacle, which is not something a terminal game should ever show.

The naive fix, fall back to whatever the previous tick looked like, has its
own bug if the game has gravity. Velocity accumulates, so a falling sprite can
move several rows in a single tick. Showing "the previous tick" can then leave
a gap of multiple rows between the sprite and whatever ended the run, with
nothing touching on screen. That looks like the run ended for no reason, which
is worse than the overlap it replaces. Both of these are real bugs this project
shipped, one right after fixing the other. Check for the second one
specifically. Don't assume "no overlap" is the whole fix.

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

        // Rebuild the frame at the exact contact point, but ONLY if one was
        // found. A null result means even preY collides once the hazards have
        // moved to their new positions this tick (the sprite was standing
        // still and an obstacle simply reached it, no y exists that avoids
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
that forces the `null` fallback, the second one is exactly where the overlap
bug can silently come back if the rebuild guard is missing.

### 3. Sprite scale

**Everything is measured in cells, and one cell is the baseline sprite.**

- Snake: segment and food are **1×1 cell**
- Tetris: a block is **1×1 cell**
- Flappy: the bird is **2×2 cells**, pipes **2 cells wide**

Nothing is ever sized in characters. A sprite of N×M cells renders at
`N × 19.2` by `M × 16` px, so its shape is the same in every game.

This section previously said something different for each game, and that was the
whole problem. Three sprite scales existed at once, and on screen they came out
at ratios of 0.60, 0.60 and 2.40. Tetris looked flattened and Snake looked
shrunken, because the games were compensating for the character's shape by
different amounts, or not at all.

Consistency here means **one cell everywhere**, and then choosing a board shape
that suits the game. It does not mean forcing every game onto the same board and
letting each one distort its sprites to fill it. That was tried and it is what
produced the four character Tetris block.

Keep a playfield's proportions in *cells*: Tetris is 12×24, the same 1:2 well as
the classic 10×20.

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
| `M` | toggle sound (see below) |
| `ESC` | back to the dashboard (with the loading overlay) |
| Click | only if it maps naturally (jump/flap). Skip it for directional games. |

Keyboard-first is deliberate: the whole site is `cursor: none` and
keyboard-driven. Don't add touch controls to one game alone.

### 5a. Sound

Load `shared/sound.js` after `shared/gameUI.js` and call `VTSound.<effect>()` at
the moments below. The sounds are synthesised at runtime (no files), the mute
state is shared across the whole site through localStorage, and every effect is
a no-op while muted, so the calls are always safe to make.

| Moment | Call |
|---|---|
| Run starts | `VTSound.start()` |
| Collect a pickup / clear an obstacle | `VTSound.eat()` or `VTSound.point()` |
| Jump / flap | `VTSound.jump()` or `VTSound.flap()` |
| Game over | `VTSound.gameOver()`, or `VTSound.newRecord()` when `isNewRecord && finalScore > 0` |
| `M` pressed | `VTSound.toggleMute(); draw();` |

The shared panel footer already shows `[M] SOUND ON/OFF`, so no panel change is
needed. `gameUI` reads the mute state defensively, so it does not matter if
`sound.js` fails to load, the games just fall silent.

### 6. Scoring, the three rules that matter

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
Only through `createGameApi(GAME_NAME)`. Never call `fetch` directly, score
submission has to be authenticated, and the server derives the username from
the verified token. Sending a username in the body does nothing.

```js
const gameApi = createGameApi(GAME_NAME);
```

### 8. Auth guard, must halt the script
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

For a side-scroller, scale spacing by **distance, not frames**. The now-removed
Runner used a frame interval while obstacles moved by speed, so raising the
speed made the gaps proportionally wider, the difficulty partly cancelled
itself:
```js
distanceSinceSpawn += gameSpeed;          // correct
if (distanceSinceSpawn >= nextGapColumns) { ... }
```

Drive the ramp off something the player earns, not off time survived. Tetris
speeds up per ten lines cleared, so standing still never makes it harder and
clearing always costs you something; Snake shortens its tick per pickup.

Always cap the ramp, and assert the cap in `tests/game-logic.js`, an uncapped
curve passes every "does it get harder" test and is still unplayable.

---

## Registering the game

Two places, or it won't show up:

**1. The database**, the admin panel's enable/disable reads this:
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
the same prompt templates, so a new game that drifts will fail the build.

Also confirm by hand:
- [ ] Die, GAME OVER appears instantly, not after a delay
- [ ] Die, then immediately restart, the score saved is the one you earned
- [ ] Beat your best, `NEW RECORD` shows
- [ ] `P` pauses; switching tabs and back does not silently resume it
- [ ] Log out, open the game URL directly, you're bounced to login and no
      request is sent
- [ ] Disable the game in the admin panel, it disappears from the dashboard
