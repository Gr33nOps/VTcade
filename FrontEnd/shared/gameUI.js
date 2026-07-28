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
    const GLYPH = {
        PLAYER: "█",  // █  full block   - the thing you control
        HAZARD: "▓",  // ▓  dark shade   - the thing that kills you
        PICKUP: "◆",  // ◆  diamond      - the thing you want
        GROUND: "─",  // ─  light horiz. - the floor
        BLANK:  " "
    };

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
        return grid;
    }

    // Paint a rectangle, clipped to the playable area so a sprite half off the
    // edge can never bleed into the border.
    function paintRect(grid, x, y, w, h, glyph) {
        for (let dy = 0; dy < h; dy++) {
            const gy = Math.floor(y) + dy;
            if (gy < 0 || gy >= BOARD_H) continue;
            for (let dx = 0; dx < w; dx++) {
                const gx = Math.floor(x) + dx;
                if (gx < PLAY_X_MIN || gx > PLAY_X_MAX) continue;
                grid[gy][gx] = glyph;
            }
        }
    }

    function paintGround(grid) {
        for (let x = PLAY_X_MIN; x <= PLAY_X_MAX; x++) {
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
        out += "\n" + DIVIDER + "\n[P]   PAUSE\n[ESC] BACK TO HOME\n";

        return out;
    }

    global.VTGameUI = {
        GLYPH: GLYPH,
        STATE: STATE,
        BOARD_W: BOARD_W,
        BOARD_H: BOARD_H,
        PLAY_X_MIN: PLAY_X_MIN,
        PLAY_X_MAX: PLAY_X_MAX,
        GROUND_ROW: GROUND_ROW,
        createGrid: createGrid,
        paintRect: paintRect,
        paintGround: paintGround,
        statusLines: statusLines,
        frameBoard: frameBoard,
        panel: panel
    };
})(window);
