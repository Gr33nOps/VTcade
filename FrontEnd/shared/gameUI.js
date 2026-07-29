// Shared presentation layer for all three VTcade games.
//
// Before this existed each game drew its own board and panel, so the glyph
// vocabulary had drifted (Snake used one character for both the snake and the
// food; Flappy had no ground line at all), the prompts were worded three
// different ways, and the status area changed height between states, which made
// the whole board jump around.
//
// Every game now paints into a grid and hands it to this module.

(function (global) {

    // ---- One glyph, one meaning, in every game -------------------------------
    //
    // Two hard rules, both learned the hard way:
    //
    // 1. SOLID ONLY, NO SHADED FILLS. The dither patterns (U+2591-2593) do not
    //    tile cleanly across cell boundaries, so a wall built from them shows
    //    seams and steps that look like sprites overlapping each other.
    //
    // 2. BLOCK ELEMENTS / BOX DRAWING ONLY. Those ranges are drawn to occupy
    //    exactly one character cell. Geometric Shapes (U+25A0-25FF) are not,
    //    so they render wider than a cell and shove the board's right border
    //    out of line on whatever row they appear. A diamond pickup did exactly
    //    that.
    //
    // 3. ONE SIZE. Every sprite is the same full square. Half blocks such as
    //    U+2584 fill only part of their cell, so a pickup drawn with one came
    //    out visibly smaller than a snake segment sitting next to it. Sprites
    //    are told apart by position and movement, the way Snake has always
    //    worked: the snake is a connected line that moves, the food is a single
    //    stationary square.
    const GLYPH = {
        PLAYER: "█",  // U+2588 full block       - the thing you control
        HAZARD: "█",  // U+2588 full block       - the thing that kills you
        PICKUP: "█",  // U+2588 full block       - the thing you want
        GROUND: "─",  // U+2500 light horizontal - the floor, a backdrop not a sprite
        BLANK:  " "
    };

    // The three sprite roles must stay the same single full square.
    const SPRITE_GLYPH = "█";

    // A glyph is only safe if it is drawn to fill exactly one cell.
    function isMonospaceSafe(ch) {
        const cp = ch.codePointAt(0);
        return cp === 0x20                        // space
            || (cp >= 0x2500 && cp <= 0x257F)     // Box Drawing
            || (cp >= 0x2580 && cp <= 0x259F);    // Block Elements
    }

    // Roles are tracked separately from glyphs. Every sprite draws the same
    // block, so comparing glyphs cannot tell a bird sitting inside a pipe from
    // the pipe itself. Comparing roles can.
    const ROLE = {
        PLAYER: "player",
        HAZARD: "hazard",
        PICKUP: "pickup",
        GROUND: "ground"
    };

    // Cells claimed by two different roles in the current frame. Must always be
    // zero: one cell holds one thing, so a shared cell means two sprites were
    // allowed to intersect and the frame would render them on top of each other.
    let paintConflicts = 0;
    let occupancy = null;

    // ---- Board geometry -------------------------------------------------------
    //
    // Games work in CELLS. A cell is the unit every sprite is built from, and it
    // is two characters wide by one row tall.
    //
    // That number is the whole point. A Courier New character is 0.6em wide and,
    // at line-height 1.0, 1em tall, so one character is 9.6 x 16 px and reads as
    // tall and thin. Two of them side by side is 19.2 x 16, near enough square.
    //
    // Before this, each game picked its own compensation and none of them
    // matched: a Snake segment was one character (ratio 0.60, thin), a Tetris
    // block was four (ratio 2.40, flat). Sprites across the arcade spanned a
    // factor of four, which is why Tetris looked stretched and Snake shrunken.
    // Every sprite is now one cell, everywhere, at 1.20.
    //
    // Board size is per game and set with setBoard(), because the games are not
    // the same shape. Snake and Flappy want a wide field; a Tetris well is
    // narrow and deep. Forcing one board on all three is what pushed Tetris to a
    // four character cell in the first place. What is shared is the cell, not
    // the board.
    const CELL_W = 2;                 // characters per cell, horizontally

    let boardCols = 24;               // playable width, in cells
    let boardRows = 24;               // playable height, in cells

    // Called once by each game before it draws anything.
    function setBoard(cols, rows) {
        boardCols = cols;
        boardRows = rows;
    }

    const PANEL_W = 20;
    const DIVIDER = "━".repeat(PANEL_W); // ━

    const STATE = {
        IDLE: "idle",
        PLAYING: "playing",
        PAUSED: "paused",
        GAME_OVER: "gameover"
    };

    // The grid is the playable area, one row per cell row but one column per
    // CHARACTER, so a sprite can sit on a half cell.
    //
    // That matters for anything moving horizontally. Sprites are whole cells
    // wide, but if their POSITION could only be a whole cell then the smallest
    // visible move was 19.2 px, and at half a cell per tick a pipe lurched a
    // full cell every second tick. The bird, moving down rows of 16 px every
    // tick, looked smooth beside it. Allowing half cell positions puts the
    // horizontal step back to one character, 9.6 px, which is what it was
    // before any of this and what actually reads as smooth at a terminal
    // frame rate.
    function charCols() {
        return boardCols * CELL_W;
    }

    // The character column a cell coordinate actually renders at.
    //
    // Any game doing its own collision maths on a fractional coordinate MUST
    // measure through this, not by flooring the cell value. paintRect rounds to
    // the nearest character, so a pipe at x = 4.5 draws one character right of
    // where floor(4.5) suggests, and a game comparing cells would let it render
    // straight through the player while reporting a miss.
    function toChars(x) {
        return Math.round(x * CELL_W);
    }

    function createGrid() {
        const width = charCols();
        const grid = new Array(boardRows);
        for (let y = 0; y < boardRows; y++) {
            grid[y] = new Array(width).fill(GLYPH.BLANK);
        }
        // A fresh grid starts a fresh frame.
        paintConflicts = 0;
        occupancy = new Array(boardRows);
        for (let y = 0; y < boardRows; y++) {
            occupancy[y] = new Array(width).fill(null);
        }
        return grid;
    }

    // Paint a rectangle. x, y, w and h are all in CELLS; x may be fractional and
    // lands on the nearest character. Clipped to the board so a sprite half off
    // the edge can never bleed out. `role` is what the overlap guard compares;
    // pass one of ROLE.*.
    function paintRect(grid, x, y, w, h, glyph, role) {
        const claim = role || glyph;
        const width = charCols();

        const startChar = toChars(x);
        const charW = Math.max(1, Math.round(w * CELL_W));

        for (let dy = 0; dy < h; dy++) {
            const gy = Math.floor(y) + dy;
            if (gy < 0 || gy >= boardRows) continue;
            for (let dx = 0; dx < charW; dx++) {
                const gx = startChar + dx;
                if (gx < 0 || gx >= width) continue;

                // The ground is a backdrop, so anything may stand on it. Two
                // sprites claiming the same cell is a genuine intersection.
                const held = occupancy && occupancy[gy][gx];
                if (held && held !== ROLE.GROUND && held !== claim) {
                    paintConflicts++;
                }

                if (occupancy) occupancy[gy][gx] = claim;
                grid[gy][gx] = glyph;
            }
        }
    }

    function getPaintConflicts() {
        return paintConflicts;
    }

    // Finds the boundary between a known-safe value and a known-colliding one
    // along a single continuous coordinate (a falling bird's y, a jumping
    // player's y), using the game's own collision check as the oracle.
    //
    // Why this exists: gravity accumulates, so a sprite can move several rows
    // in one tick. Falling back to "the previous tick's position" on collision
    // can leave a multi-row gap with nothing touching, which looks like the run
    // ended for no reason. This finds the actual point of contact instead.
    //
    // isCollidingAt(value) must be a pure check: set the coordinate, call the
    // game's checkCollision(), restore the coordinate, return the result.
    function findContactPoint(safeValue, deadValue, isCollidingAt) {
        if (isCollidingAt(safeValue)) {
            // The "safe" endpoint is not actually safe (a hazard moved into it
            // this same tick). No boundary exists to find; the caller should
            // fall back to its own last-known-good frame instead.
            return null;
        }
        let lo = safeValue, hi = deadValue;
        for (let i = 0; i < 30 && Math.abs(hi - lo) > 0.02; i++) {
            const mid = (lo + hi) / 2;
            if (isCollidingAt(mid)) hi = mid; else lo = mid;
        }
        return lo;
    }

    // The bottom row of cells. Anything resting on it sits at
    // groundRow() - spriteHeight.
    function groundRow() {
        return boardRows - 1;
    }

    function paintGround(grid) {
        const gy = groundRow();
        for (let x = 0; x < charCols(); x++) {
            if (occupancy) occupancy[gy][x] = ROLE.GROUND;
            grid[gy][x] = GLYPH.GROUND;
        }
    }

    // The status area is ALWAYS two lines. It used to be 0, 1 or 2 depending on
    // state, so the flex-centred board visibly jumped every time you started,
    // died or restarted.
    function statusLines(state, keyLabel, options) {
        const opts = options || {};
        switch (state) {
            case STATE.IDLE:
                return ["< PRESS " + keyLabel + " TO START >", ""];
            case STATE.PAUSED:
                return ["< PAUSED >", "PRESS P TO RESUME"];
            case STATE.GAME_OVER:
                return [
                    opts.newRecord ? "< GAME OVER - NEW RECORD! >" : "< GAME OVER >",
                    "PRESS " + keyLabel + " TO RESTART"
                ];
            default:
                return ["", ""];
        }
    }

    // Expands each cell to CELL_W characters and wraps the result in the border.
    // This is the only place cells become characters, which is why no game has
    // to know the ratio exists.
    // The grid is already at character resolution, so this only adds the frame.
    function frameBoard(grid, status) {
        const border = "+" + "=".repeat(charCols()) + "+";
        let out = border + "\n";
        for (let y = 0; y < boardRows; y++) {
            out += "|" + grid[y].join("") + "|\n";
        }
        out += border + "\n";
        out += (status[0] || "") + "\n";
        out += (status[1] || "") + "\n";
        return out;
    }

    // Every panel has the same shape: title, three stats, leaderboard, controls.
    // Flappy used to show only two stats, which made its panel a different
    // height from the other two.
    function panel(config) {
        const stats = config.stats || [];
        let out = config.title + " v1.0\n" + DIVIDER + "\n\n";

        stats.forEach(function (row) {
            out += row.label + ": " + row.value + "\n";
        });

        out += "\n" + DIVIDER + "\nLEADERBOARD:\n" + DIVIDER + "\n";

        const board = config.leaderboard;
        if (board === null || board === undefined) {
            out += "(Loading...)\n";
        } else if (board.length === 0) {
            out += "(No scores yet)\n(Be the first!)\n";
        } else {
            board.slice(0, 8).forEach(function (entry) {
                const name = String(entry.username || "").substring(0, 12).padEnd(12);
                out += entry.rank + ". " + name + " " + (entry.score || 0) + "\n";
            });
        }

        out += "\n" + DIVIDER + "\nCONTROLS:\n" + DIVIDER + "\n";
        (config.controls || []).forEach(function (line) {
            out += line + "\n";
        });

        // Reflect the shared mute state so the player can see whether sound is
        // on. Guarded because gameUI must not hard-depend on sound.js being
        // present or loaded first.
        var soundLabel = (global.VTSound && global.VTSound.isMuted()) ? "OFF" : "ON";
        out += "\n" + DIVIDER + "\n[P]   PAUSE\n[M]   SOUND " + soundLabel + "\n[ESC] BACK TO HOME\n";

        return out;
    }

    global.VTGameUI = {
        GLYPH: GLYPH,
        SPRITE_GLYPH: SPRITE_GLYPH,
        ROLE: ROLE,
        STATE: STATE,
        CELL_W: CELL_W,
        setBoard: setBoard,
        toChars: toChars,
        // Functions, not constants: the board size is per game, so a value read
        // once at load would be whatever the last game to load happened to set.
        cols: function () { return boardCols; },
        rows: function () { return boardRows; },
        groundRow: groundRow,
        createGrid: createGrid,
        paintRect: paintRect,
        isMonospaceSafe: isMonospaceSafe,
        getPaintConflicts: getPaintConflicts,
        findContactPoint: findContactPoint,
        paintGround: paintGround,
        statusLines: statusLines,
        frameBoard: frameBoard,
        panel: panel
    };
})(window);
