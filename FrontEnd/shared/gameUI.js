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

    // ---- Board geometry, identical everywhere --------------------------------
    const BOARD_W = 50;               // including both border columns
    const BOARD_H = 25;               // playable rows
    const PLAY_X_MIN = 1;
    const PLAY_X_MAX = BOARD_W - 2;   // 48 — last playable column
    const GROUND_ROW = BOARD_H - 1;   // 24 — floor line for side-scrollers
    const PANEL_W = 20;
    const DIVIDER = "━".repeat(PANEL_W); // ━

    const STATE = {
        IDLE: "idle",
        PLAYING: "playing",
        PAUSED: "paused",
        GAME_OVER: "gameover"
    };

    function createGrid() {
        const grid = new Array(BOARD_H);
        for (let y = 0; y < BOARD_H; y++) {
            grid[y] = new Array(BOARD_W).fill(GLYPH.BLANK);
        }
        // A fresh grid starts a fresh frame.
        paintConflicts = 0;
        occupancy = new Array(BOARD_H);
        for (let y = 0; y < BOARD_H; y++) {
            occupancy[y] = new Array(BOARD_W).fill(null);
        }
        return grid;
    }

    // Paint a rectangle, clipped to the playable area so a sprite half off the
    // edge can never bleed into the border. `role` is what the overlap guard
    // compares; pass one of ROLE.*.
    function paintRect(grid, x, y, w, h, glyph, role) {
        const claim = role || glyph;

        for (let dy = 0; dy < h; dy++) {
            const gy = Math.floor(y) + dy;
            if (gy < 0 || gy >= BOARD_H) continue;
            for (let dx = 0; dx < w; dx++) {
                const gx = Math.floor(x) + dx;
                if (gx < PLAY_X_MIN || gx > PLAY_X_MAX) continue;

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

    function paintGround(grid) {
        for (let x = PLAY_X_MIN; x <= PLAY_X_MAX; x++) {
            if (occupancy) occupancy[GROUND_ROW][x] = ROLE.GROUND;
            grid[GROUND_ROW][x] = GLYPH.GROUND;
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

    function frameBoard(grid, status) {
        const border = "+" + "=".repeat(BOARD_W - 2) + "+";
        let out = border + "\n";
        for (let y = 0; y < BOARD_H; y++) {
            out += "|" + grid[y].slice(PLAY_X_MIN, PLAY_X_MAX + 1).join("") + "|\n";
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
        BOARD_W: BOARD_W,
        BOARD_H: BOARD_H,
        PLAY_X_MIN: PLAY_X_MIN,
        PLAY_X_MAX: PLAY_X_MAX,
        GROUND_ROW: GROUND_ROW,
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
