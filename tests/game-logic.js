// Game logic + cross-game consistency tests.
//
// These execute the REAL inline game scripts against a stubbed DOM, rather than
// reimplementing the rules, so they fail if the actual games regress. Added
// after a pass that changed collision maths, sprite sizes and difficulty
// curves in all three games at once.
//
// Run with:  node tests/game-logic.js

// Headless harness that executes the REAL game scripts (not a reimplementation)
// against stubbed DOM/session objects, then drives them and asserts behaviour.
// Shared with tests/guest-mode.js, which needs the exact same loader.
const fs = require("fs");
const path = require("path");
const { loadGame, ROOT } = require("./helpers/loadGame");

let failures = 0;
function check(label, cond, detail) {
    if (cond) {
        console.log("  PASS  " + label);
    } else {
        failures++;
        console.log("  FAIL  " + label + (detail ? "  -> " + detail : ""));
    }
}

function boardLines(el) {
    return el.textContent.split("\n");
}

// Board geometry, READ from the shared module rather than restated as literals.
//
// Every one of these used to be a hardcoded number, and when the board changed
// shape twelve checks failed, not one of them because a game had broken, all
// of them because the test was describing the old board. A test that has to be
// edited every time the thing it measures is resized is not measuring anything.
// Board size is per game now, so this reads it from whichever game is loaded
// rather than assuming one shape for all of them.
function geo(ctx) {
    const UI = ctx.VTGameUI;
    const cols = UI.cols();
    const rows = UI.rows();
    return {
        cols: cols,
        rows: rows,
        CELL_W: UI.CELL_W,
        GROUND: UI.groundRow(),
        // Board line width, including both border characters.
        chars: cols * UI.CELL_W + 2,
        // frameBoard emits: top border, rows, bottom border, 2 status lines.
        LINES: rows + 4,
        // Board row N lives at index N + 1, past the top border.
        row: (n) => n + 1,
        // Index of the first of the two status lines.
        STATUS: rows + 2
    };
}

// One character is 9.6 x 16 px, so a single character sprite reads as tall and
// thin. The cell is what fixes that, and it has to be the same everywhere or
// the games look like they came from different arcades: this is exactly what
// went wrong before, when a Snake segment was one character (0.60) and a Tetris
// block was four (2.40).
const CHAR_W = 9.6;
const CHAR_H = 16;

console.log("\n=== ONE CELL, EVERY GAME ===");
{
    const games = ["snake", "tetris", "flappyBird"].map(d => ({ dir: d, g: geo(loadGame(d).ctx) }));

    const widths = games.map(x => x.g.CELL_W);
    check("every game builds from the same cell",
        new Set(widths).size === 1,
        games.map(x => x.dir + "=" + x.g.CELL_W).join(" "));

    const ratio = (widths[0] * CHAR_W) / CHAR_H;
    check("a cell renders close to square (" + (widths[0] * CHAR_W) + " x " + CHAR_H +
          " px, ratio " + ratio.toFixed(2) + ")",
        Math.abs(ratio - 1) <= 0.25,
        "a sprite this far from 1.00 reads as stretched");

    // Board shape is deliberately NOT shared. Snake and Flappy want a wide open
    // field; a Tetris well is narrow and deep. Forcing one board on all three
    // is what pushed Tetris to a four character cell.
    games.forEach(({ dir, g }) => {
        const px = g.cols * g.CELL_W * CHAR_W;
        const py = g.rows * CHAR_H;
        console.log("        " + dir.padEnd(11) + (g.cols + " x " + g.rows + " cells").padEnd(14) +
            px.toFixed(0) + " x " + py.toFixed(0) + " px, board ratio " + (px / py).toFixed(2));
    });

    // Snake and Flappy share a board and it should render square: a cell is 1.2
    // times wider than tall, so that needs 5 cells across for every 6 down.
    ["snake", "flappyBird"].forEach(dir => {
        const g = games.find(x => x.dir === dir).g;
        const px = g.cols * g.CELL_W * CHAR_W;
        const py = g.rows * CHAR_H;
        check(dir + "'s board renders square", Math.abs(px - py) < 0.5,
            px.toFixed(0) + " x " + py.toFixed(0) + " px");
    });
}

// ============================ SNAKE ============================
console.log("\n=== SNAKE ===");
{
    const { ctx, els } = loadGame("snake");
    const G = geo(ctx);
    ctx.restartGame();
    const lines = boardLines(els.game);

    check("board is " + G.rows + " rows + 2 border + 2 status",
        lines.length - 1 === G.LINES, "got " + (lines.length - 1));
    check("every board line is exactly " + G.chars + " wide",
        lines.slice(0, G.rows + 2).every(l => l.length === G.chars),
        JSON.stringify(lines.slice(0, G.rows + 2).map(l => l.length).filter((v, i, a) => a.indexOf(v) === i)));

    const body = lines.slice(G.row(0), G.row(G.rows)).join("");
    const SNAKE_G = ctx.VTGameUI.GLYPH;
    check("both the snake and the food are on the board",
        body.includes(SNAKE_G.PLAYER) && body.includes(SNAKE_G.PICKUP));

    // The food must be exactly one square, the same size as a snake segment.
    // A half block pickup rendered visibly shorter than the segment beside it.
    check("food is drawn the same size as one snake segment",
        SNAKE_G.PICKUP === SNAKE_G.PLAYER,
        "pickup=" + SNAKE_G.PICKUP.codePointAt(0).toString(16) +
        " player=" + SNAKE_G.PLAYER.codePointAt(0).toString(16));

    // eat a piece of food
    ctx.food.x = ctx.snake[0].x + 1;
    ctx.food.y = ctx.snake[0].y;
    const before = ctx.score;
    ctx.updateSnake();
    // One flat point per pellet, matching Tetris (1 per line) and Flappy
    // (1 per pipe). This used to be +10.
    check("eating food scores +1", ctx.score === before + 1, "score=" + ctx.score);

    // wall collision
    ctx.snake[0] = { x: -1, y: 5 };
    check("hitting the left wall is a collision", ctx.checkCollision() === true);
    ctx.snake[0] = { x: G.cols, y: 5 };
    check("hitting the right wall is a collision", ctx.checkCollision() === true);
    ctx.restartGame();
    check("mid-board is not a collision", ctx.checkCollision() === false);

    // pause
    ctx.startGame();
    check("running before pause", ctx.gameRunning === true);
    ctx.togglePause();
    check("paused stops the loop", ctx.gameRunning === false && ctx.paused === true);
    check("paused status text shown", els.game.textContent.includes("< PAUSED >"));
    ctx.togglePause();
    check("resume restarts the loop", ctx.gameRunning === true && ctx.paused === false);

    // food never spawns on the snake
    let onSnake = 0;
    for (let i = 0; i < 400; i++) {
        ctx.spawnFood();
        if (ctx.snake.some(s => s.x === ctx.food.x && s.y === ctx.food.y)) onSnake++;
        if (ctx.food.x < 0 || ctx.food.x >= G.cols || ctx.food.y < 0 || ctx.food.y >= G.rows) onSnake++;
    }
    check("400 food spawns all legal and off-snake", onSnake === 0, onSnake + " bad");
}

// ============================ TETRIS ============================
console.log("\n=== TETRIS ===");
{
    const { ctx, els } = loadGame("tetris");
    const G = geo(ctx);
    ctx.restartGame();
    const boardRows = boardLines(els.game);

    check("board is " + G.rows + " rows + 2 border + 2 status",
        boardRows.length - 1 === G.LINES, "got " + (boardRows.length - 1));
    check("every board line is exactly " + G.chars + " wide",
        boardRows.slice(0, G.rows + 2).every(l => l.length === G.chars));

    // boardRows[0] is the top border, so board row N is boardRows[N + 1].
    check("floor line is drawn", boardRows[ctx.GROUND_ROW + 1].includes("\u2500"));
    check("the well fills every row above the floor line",
        ctx.WELL_ROWS === G.GROUND,
        "well=" + ctx.WELL_ROWS + " ground=" + G.GROUND);

    // The whole point of the layout: the well spans the entire playfield, so
    // the board's own frame is the wall. The first version drew a 10-column
    // well with its own side rails, which put a box inside the box and made
    // this the only game that looked like that.
    check("the well IS the board, so no rails are needed",
        ctx.WELL_COLS === G.cols, ctx.WELL_COLS + " vs " + G.cols);
    // Measured in CELLS, not pixels. The cells are wider than they are tall, so
    // the well looks square on screen while still being a deep well to play in
    //, which is the property that decides how the game feels.
    check("the well is close to the classic 1:2, deep rather than wide",
        ctx.WELL_ROWS >= ctx.WELL_COLS * 1.8,
        ctx.WELL_COLS + " wide x " + ctx.WELL_ROWS + " deep");

    // No internal borders anywhere: nothing but sprites and the floor line.
    const interior = boardRows.slice(1, ctx.GROUND_ROW + 1).join("");
    check("no rails or inner boxes are drawn inside the board",
        !interior.includes("\u2502") && !interior.includes("\u2500"),
        "found an internal border character");

    // A rotation that isn't a true rotation drifts pieces out of shape over a
    // long run. Four turns must be the identity for all seven.
    Object.keys(ctx.PIECES).forEach(name => {
        let r = ctx.PIECES[name];
        for (let i = 0; i < 4; i++) r = ctx.rotateCW(r);
        check("rotating " + name + " four times returns the original shape",
            JSON.stringify(r) === JSON.stringify(ctx.PIECES[name]));
    });

    // Every piece must be able to appear. A spawn that already collides on an
    // empty well would end the run the instant that piece came up.
    let badSpawns = 0;
    for (let i = 0; i < 300; i++) {
        ctx.well = ctx.emptyWell();
        ctx.spawnPiece();
        if (ctx.checkCollision()) badSpawns++;
        if (ctx.piece.x < 0 || ctx.piece.x + ctx.piece.cells.length > ctx.WELL_COLS) badSpawns++;
    }
    check("300 spawns all fit inside an empty well", badSpawns === 0, badSpawns + " bad");

    // 7-bag: uniform random can starve a player of an I piece for twenty
    // pieces, which reads as the game cheating rather than as difficulty.
    ctx.bag = [];
    const drawn = [];
    for (let i = 0; i < 7; i++) drawn.push(ctx.nextFromBag());
    check("a 7-bag deals each of the seven pieces exactly once",
        drawn.slice().sort().join("") === ctx.PIECE_NAMES.slice().sort().join(""),
        drawn.join(","));

    // walls (the board's own border)
    ctx.well = ctx.emptyWell();
    ctx.piece = { name: "O", cells: [[1, 1], [1, 1]], x: 0, y: 0 };
    check("a piece flush against the left wall cannot move further left",
        ctx.tryMove(-1, 0) === false);
    ctx.piece.x = ctx.WELL_COLS - 2;
    check("a piece flush against the right wall cannot move further right",
        ctx.tryMove(1, 0) === false);

    // A block must be exactly CELL_W wide on screen, or the well stops lining
    // up with the border it is supposed to be flush against.
    ctx.well = ctx.emptyWell();
    ctx.well[ctx.WELL_ROWS - 1][0] = 1;
    ctx.piece = null;
    const bottom = boardLines({ textContent: ctx.VTGameUI.frameBoard(ctx.buildGrid(), ["", ""]) })[ctx.WELL_ROWS];
    check("one filled cell renders exactly one cell wide",
        bottom.slice(1, 1 + G.CELL_W) === "█".repeat(G.CELL_W) &&
        bottom[1 + G.CELL_W] === " ",
        JSON.stringify(bottom.slice(0, 10)));

    // completing a row
    ctx.restartGame();
    ctx.well = ctx.emptyWell();
    for (let x = 2; x < ctx.WELL_COLS; x++) ctx.well[ctx.WELL_ROWS - 1][x] = 1;
    ctx.piece = { name: "O", cells: [[1, 1], [1, 1]], x: 0, y: 0 };
    ctx.lines = 0;
    ctx.score = 0;
    ctx.hardDrop();
    check("completing a row clears it and counts the line",
        ctx.lines === 1, "lines=" + ctx.lines);
    // Matches Snake (+1 per pellet) and Flappy (+1 per pipe): a fixed amount
    // per unit of success, not a table scaled by whatever level you happen to
    // be on. This used to be "at least 100" under Nintendo-style scoring.
    check("a single clear is worth exactly 1 point",
        ctx.score === 1, "score=" + ctx.score);
    check("the row above the cleared one drops into its place",
        ctx.well[ctx.WELL_ROWS - 1][0] === 1 && ctx.well[ctx.WELL_ROWS - 1][2] === 0,
        JSON.stringify(ctx.well[ctx.WELL_ROWS - 1]));

    // four at once, in a single pass
    ctx.well = ctx.emptyWell();
    for (let y = ctx.WELL_ROWS - 4; y < ctx.WELL_ROWS; y++) {
        for (let x = 0; x < ctx.WELL_COLS; x++) ctx.well[y][x] = 1;
    }
    check("clearLines removes four full rows in one pass", ctx.clearLines() === 4);
    check("the well is empty afterwards",
        ctx.well.every(row => row.every(v => v === 0)));

    // four at once, through the real scoring path this time: a well missing one
    // column for its bottom four rows, completed by a vertical I piece dropped
    // straight into the gap.
    ctx.well = ctx.emptyWell();
    const GAP_COL = 5;
    for (let y = ctx.WELL_ROWS - 4; y < ctx.WELL_ROWS; y++) {
        for (let x = 0; x < ctx.WELL_COLS; x++) ctx.well[y][x] = (x === GAP_COL) ? 0 : 1;
    }
    // rotateCW(I) puts its column of four 1s at cells[*][2], not cells[*][1], so
    // this is derived from the real rotation rather than hand-typed and wrong.
    const vertI = ctx.rotateCW(ctx.PIECES.I);
    ctx.piece = { name: "I", cells: vertI, x: GAP_COL - 2, y: ctx.WELL_ROWS - 4 };
    ctx.lines = 0;
    ctx.score = 0;
    ctx.lockPiece();
    check("the piece actually landed in the gap and cleared all four rows",
        ctx.lines === 4, "lines=" + ctx.lines);
    check("four lines cleared at once score no more than four cleared separately",
        ctx.score === 4, "score=" + ctx.score);

    // dropping must not add anything on its own; only a clear pays
    ctx.restartGame();
    ctx.well = ctx.emptyWell();
    ctx.piece = { name: "O", cells: [[1, 1], [1, 1]], x: 0, y: 0 };
    ctx.score = 0;
    ctx.softDrop();
    check("soft drop scores nothing by itself", ctx.score === 0, "score=" + ctx.score);
    ctx.restartGame();
    ctx.well = ctx.emptyWell();
    ctx.piece = { name: "O", cells: [[1, 1], [1, 1]], x: 0, y: 0 };
    ctx.score = 0;
    ctx.hardDrop();
    check("hard drop with no completed line scores nothing either",
        ctx.score === 0, "score=" + ctx.score);

    // a hard drop must land ON the stack, not through it
    ctx.restartGame();
    ctx.well = ctx.emptyWell();
    ctx.well[ctx.WELL_ROWS - 1][4] = 1;
    ctx.piece = { name: "O", cells: [[1, 1], [1, 1]], x: 4, y: 0 };
    ctx.hardDrop();
    check("a hard drop stacks on top of what is already there",
        ctx.well[ctx.WELL_ROWS - 2][4] === 1 && ctx.well[ctx.WELL_ROWS - 3][4] === 1,
        "column 4 = " + ctx.well.map(r => r[4]).join(""));

    // difficulty ramps with lines cleared, and stops somewhere reachable
    ctx.restartGame();
    const startInterval = ctx.dropInterval();
    ctx.lines = 40;
    check("pieces fall faster as lines are cleared",
        ctx.dropInterval() < startInterval,
        startInterval + "ms -> " + ctx.dropInterval() + "ms");
    ctx.lines = 100000;
    check("the speed ramp is capped",
        ctx.level() === ctx.MAX_LEVEL && ctx.dropInterval() >= 90,
        "level=" + ctx.level() + " interval=" + ctx.dropInterval());

    // pause
    ctx.restartGame();
    ctx.startGame();
    check("running before pause", ctx.gameRunning === true);
    ctx.togglePause();
    check("pause works", ctx.gameRunning === false && ctx.paused === true);
    check("paused status text shown", els.game.textContent.includes("< PAUSED >"));
    ctx.togglePause();
    check("resume restarts the loop", ctx.gameRunning === true && ctx.paused === false);
}

// ============================ FLAPPY ============================
console.log("\n=== FLAPPY BIRD ===");
{
    const { ctx, els } = loadGame("flappyBird");
    const G = geo(ctx);
    ctx.restartGame();
    const lines = boardLines(els.game);

    check("board is " + G.rows + " rows + 2 border + 2 status",
        lines.length - 1 === G.LINES, "got " + (lines.length - 1));
    check("every board line is exactly " + G.chars + " wide",
        lines.slice(0, G.rows + 2).every(l => l.length === G.chars));
    check("floor line is now drawn (was invisible)", lines[G.row(G.GROUND)].includes("\u2500"));
    check("the bird is one cell, the same sprite size as every other game",
        ctx.bird.width === 1 && ctx.bird.height === 1,
        ctx.bird.width + "x" + ctx.bird.height);

    // ceiling must not be a free parking spot
    ctx.bird.y = 0; ctx.bird.velocity = 0;
    ctx.updateBird();
    check("ceiling bonk starts the bird falling again",
        ctx.bird.velocity > 0, "velocity=" + ctx.bird.velocity);

    // floor is death, and matches Runner's resting row
    ctx.bird.y = ctx.SKY_ROWS - ctx.bird.height;
    check("bird resting on the floor row is alive", ctx.checkCollision() === false, "y=" + ctx.bird.y);
    ctx.bird.y = ctx.SKY_ROWS - ctx.bird.height + 1;
    check("bird one row lower hits the floor", ctx.checkCollision() === true, "y=" + ctx.bird.y);

    // every generated pipe must leave a gap the 2-tall bird can fit through
    let badGap = 0, tooTight = 0, samples = 0;
    for (let i = 0; i < 5000; i++) {
        ctx.pipes = [];
        ctx.distanceSincePipe = 999;
        ctx.updatePipes();
        if (!ctx.pipes.length) continue;
        samples++;
        const p = ctx.pipes[0];
        const gapTop = p.topHeight;
        const gapBottom = p.topHeight + ctx.pipeGap;
        if (gapTop < 1 || gapBottom > ctx.SKY_ROWS) badGap++;
        if (gapBottom - gapTop < ctx.bird.height) tooTight++;
    }
    check("generated " + samples + " pipes, all gaps inside the playfield", badGap === 0, badGap + " bad");
    check("every gap fits the 2-tall bird", tooTight === 0, tooTight + " too tight");

    // a bird centred in the gap must survive that pipe
    ctx.pipes = [{ x: ctx.bird.x, topHeight: 5, passed: false }];
    ctx.bird.y = 5 + Math.floor((ctx.pipeGap - ctx.bird.height) / 2);
    check("bird centred in the gap survives", ctx.checkCollision() === false, "y=" + ctx.bird.y);
    ctx.bird.y = 4;
    check("bird clipping the top pipe dies", ctx.checkCollision() === true);
    ctx.bird.y = 5 + ctx.pipeGap;
    check("bird clipping the bottom pipe dies", ctx.checkCollision() === true,
        "y=" + ctx.bird.y + " gap=" + ctx.pipeGap);

    // Difficulty ramps the TICK, not the step. The step has to divide evenly
    // into one cell or the motion judders, and only 0.5 and 1.0 do; a changing
    // step size cannot stay even, which is what made this game look stuttery.
    ctx.restartGame();
    const startTick = ctx.tickMs;
    for (let i = 0; i < 40; i++) {
        ctx.pipes = [{ x: -10, topHeight: 5, passed: false }];
        ctx.updatePipes();
    }
    check("the game speeds up with score (was constant forever)",
        ctx.tickMs < startTick, startTick + "ms -> " + ctx.tickMs + "ms");
    check("the speed up is capped",
        ctx.tickMs >= ctx.TICK_FASTEST, "tick=" + ctx.tickMs);
    check("the pipe step divides evenly into one cell, so motion never judders",
        Math.abs(1 / ctx.PIPE_STEP - Math.round(1 / ctx.PIPE_STEP)) < 1e-9,
        "step=" + ctx.PIPE_STEP);

    // pause
    ctx.restartGame();
    ctx.startGame();
    ctx.togglePause();
    check("pause works", ctx.gameRunning === false && ctx.paused === true);
}

// ============================ CROSS-GAME CONSISTENCY ============================
console.log("\n=== CONSISTENCY ACROSS ALL THREE ===");
{
    const games = ["snake", "tetris", "flappyBird"].map(d => {
        const g = loadGame(d);
        g.ctx.restartGame();
        return { dir: d, ...g };
    });

    // Board SHAPE is deliberately per game, so it is not checked here. What has
    // to match is everything around it: the cell each game is built from, the
    // panel, and the wording. Asserting identical board dimensions is what
    // forced Tetris to stretch its blocks across a board the wrong shape for it.
    const boardShapes = games.map(g => {
        const l = boardLines(g.els.game);
        return g.dir + " " + (l.length - 1) + " lines x " + l[0].length + " chars";
    });
    console.log("        boards: " + boardShapes.join(" | "));

    // Every board is still a whole number of cells wide, borders included.
    check("every board is a whole number of cells wide",
        games.every(g => {
            const width = boardLines(g.els.game)[0].length;
            return (width - 2) % g.ctx.VTGameUI.CELL_W === 0;
        }),
        boardShapes.join(" | "));

    // The rendered row height is shared, so the games sit at the same scale.
    const rowCounts = games.map(g => boardLines(g.els.game).length - 1);
    check("every board is the same number of rows tall",
        new Set(rowCounts).size === 1, rowCounts.join(" "));

    const statHeights = games.map(g => g.els.ui.textContent.split("\n").length);
    check("identical panel height", new Set(statHeights).size === 1, statHeights.join(" "));

    // SCORE and HIGHSCORE only now; the third, game-specific counter (PIPES,
    // LENGTH, LINES) was dropped from all three at once, so this stays a
    // cross-game consistency check rather than a fixed constant.
    const statCounts = games.map(g =>
        (g.els.ui.textContent.match(/^[A-Z]+: /gm) || []).length);
    check("all three show 2 stat rows", statCounts.every(c => c === 2), statCounts.join(" "));

    const idle = games.map(g => boardLines(g.els.game)[geo(g.ctx).STATUS]);
    check("all three use the same start-prompt template",
        idle.every(l => /^< PRESS .+ TO START >$/.test(l)), JSON.stringify(idle));

    games.forEach(g => { g.ctx.startGame(); g.ctx.gameRunning = false; g.ctx.paused = false; g.ctx.draw(); });
    const over = games.map(g => boardLines(g.els.game).slice(geo(g.ctx).STATUS, geo(g.ctx).STATUS + 2));
    check("all three use the same game-over template",
        over.every(([a, b]) => a === "< GAME OVER >" && /^PRESS .+ TO RESTART$/.test(b)),
        JSON.stringify(over));

    games.forEach(g => { g.ctx.isNewRecord = true; g.ctx.draw(); });
    const rec = games.map(g => boardLines(g.els.game)[geo(g.ctx).STATUS]);
    check("all three show the same NEW RECORD banner",
        rec.every(l => l === "< GAME OVER - NEW RECORD! >"), JSON.stringify(rec));

    const panels = games.map(g => g.els.ui.textContent);
    check("all three panels list PAUSE and BACK TO MENU",
        panels.every(p => p.includes("[P]   PAUSE") && p.includes("[ESC] BACK TO MENU")));
}

// ============ GLYPH SAFETY AND SPRITE OVERLAP ============
// The "every line is exactly 50 wide" check above measures STRING length, which
// a diamond pickup passed happily while rendering wider than one character cell
// and shoving the board's right border out of line on its row. These check the
// two properties that actually decide how the board looks on screen.
console.log("\n=== GLYPH SAFETY AND OVERLAP ===");
{
    const { ctx } = loadGame("snake");
    const UI = ctx.VTGameUI;
    const G = UI.GLYPH;

    Object.entries(G).forEach(([name, ch]) => {
        const cp = ch.codePointAt(0);
        check("glyph " + name + " (U+" + cp.toString(16).toUpperCase().padStart(4, "0") +
              ") occupies exactly one cell",
              UI.isMonospaceSafe(ch),
              "only Box Drawing and Block Elements are reliably fixed-width");
    });

    check("no glyph comes from Geometric Shapes",
        Object.values(G).every(ch => {
            const cp = ch.codePointAt(0);
            return !(cp >= 0x25A0 && cp <= 0x25FF);
        }),
        "that range is not fixed-width and breaks the border");

    check("solid fills only, no dither patterns",
        Object.values(G).every(ch => {
            const cp = ch.codePointAt(0);
            return cp < 0x2591 || cp > 0x2593;
        }),
        "U+2591-2593 do not tile cleanly and look like overlapping sprites");

    // Every sprite is the same full square. Half blocks (U+2584 and friends)
    // fill only part of a cell, so a pickup drawn with one came out smaller
    // than the player block sitting next to it.
    ["PLAYER", "HAZARD", "PICKUP"].forEach(role => {
        check("sprite " + role + " is the one full square",
            G[role] === UI.SPRITE_GLYPH,
            "got U+" + G[role].codePointAt(0).toString(16).toUpperCase());
    });

    check("no sprite uses a partial cell block",
        ["PLAYER", "HAZARD", "PICKUP"].every(r => {
            const cp = G[r].codePointAt(0);
            return cp === 0x2588;   // only FULL BLOCK fills the whole cell
        }),
        "half and quarter blocks render smaller than a full square");
}

{
    // These play the games the way a player would, and restart on a collision
    // rather than continuing through the obstacle. An earlier version of this
    // block forced the bird to a fixed altitude to "keep the run alive", which
    // drove it straight through solid pipes and produced overlaps that no real
    // game could ever reach.
    const scenarios = [
        ["snake", (c) => c.updateSnake()],
        // Gravity only. Pieces stack in the middle, nothing ever clears, and
        // the well tops out, which restarts the run and does it again.
        ["tetris", (c) => c.tick()],
        ["flappyBird", (c) => {
            const next = c.pipes
                .filter(p => p.x + 3 >= c.bird.x)
                .sort((a, b) => a.x - b.x)[0];
            const target = next ? next.topHeight + 3 : 11;
            if (c.bird.y > target) c.bird.velocity = c.bird.jump;
            c.updateBird();
            c.updatePipes();
        }]
    ];

    scenarios.forEach(([dir, step]) => {
        const { ctx } = loadGame(dir);
        let conflicts = 0, frames = 0, deaths = 0;
        ctx.restartGame();
        ctx.gameStarted = true;
        ctx.gameRunning = true;

        for (let i = 0; i < 3000; i++) {
            step(ctx);
            if (ctx.checkCollision()) {
                deaths++;
                ctx.restartGame();
                ctx.gameStarted = true;
                ctx.gameRunning = true;
                continue;
            }
            ctx.draw();
            conflicts += ctx.VTGameUI.getPaintConflicts();
            frames++;
        }

        check(dir + ": no two sprites shared a cell across " + frames +
              " frames and " + deaths + " runs",
            conflicts === 0, conflicts + " conflicting cells");
    });
}

// ============ THE GAME OVER FRAME MUST NOT SHOW AN INTERSECTION ============
// A collision is only detected after the sprite has already moved into the
// hazard, so drawing the current positions at that moment renders the player
// buried inside the obstacle. Play each game until it really ends and check the
// frame that is actually on screen afterwards.
//
// Note this is invisible to a glyph comparison, because every sprite draws the
// same block. The guard compares roles for exactly this reason.
console.log("\n=== GAME OVER FRAME ===");
{
    const runs = [
        // Hold a fixed altitude near the ceiling so the crash is into a pipe
        // body rather than the floor. Dying on the floor proves nothing here,
        // because there is no hazard sprite to be drawn inside.
        ["flappyBird", (c) => {
            if (c.bird.y > 3) c.bird.velocity = c.bird.jump;
            c.updateBird();
            c.updatePipes();
        }],
        // Never steer, so the stack grows straight up the middle until a new
        // piece has nowhere to spawn.
        ["tetris", (c) => { c.tick(); }],
        // Drive straight into the right hand wall.
        ["snake", (c) => { c.updateSnake(); }]
    ];

    runs.forEach(([dir, step]) => {
        const { ctx } = loadGame(dir);
        ctx.restartGame();
        ctx.gameStarted = true;
        ctx.gameRunning = true;

        // Mirror gameLoop() exactly, then hand off to the game's real
        // gameOver(). Calling draw() directly here would test this file rather
        // than the game, and would pass even with the bug present.
        let died = false;
        for (let i = 0; i < 4000; i++) {
            step(ctx);
            if (ctx.checkCollision()) { died = true; break; }
            ctx.lastSafeGrid = ctx.buildGrid();
            ctx.draw(ctx.lastSafeGrid);
        }

        check(dir + ": the run actually ended in a collision", died,
            "never collided, so the rest of this check proves nothing");

        if (!died) return;

        // gameOver() paints before its first await, so the frame is on screen
        // by the time this returns.
        ctx.gameOver();

        check(dir + ": game over frame draws no sprite inside a hazard",
            ctx.VTGameUI.getPaintConflicts() === 0,
            ctx.VTGameUI.getPaintConflicts() + " intersecting cells on screen");
    });
}

// And prove the guard would actually catch it, so a passing result above means
// something. Painting a player on top of a hazard must be reported.
{
    const { ctx } = loadGame("tetris");
    const UI = ctx.VTGameUI;
    const grid = UI.createGrid();
    UI.paintRect(grid, 10, 10, 2, 2, UI.GLYPH.HAZARD, UI.ROLE.HAZARD);
    UI.paintRect(grid, 10, 10, 2, 2, UI.GLYPH.PLAYER, UI.ROLE.PLAYER);
    // 2x2 cells is 4 characters wide by 2 rows, so 8 character positions.
    check("the overlap guard reports an intersection when one is staged",
        UI.getPaintConflicts() === 2 * UI.CELL_W * 2,
        "expected " + (2 * UI.CELL_W * 2) + " characters, got " + UI.getPaintConflicts());
}

// ============ THE GAME OVER FRAME MUST SHOW CONTACT, NOT A GAP ============
// Gravity accumulates, so a falling sprite can move several rows in one tick.
// Falling back to "wherever it was the previous tick" can leave a multi-row
// gap between the sprite and whatever killed it, on screen, with the run
// simply ending, which looks like it ended for no reason. A player must be
// able to see what they hit.
console.log("\n=== GAME OVER FRAME SHOWS CONTACT ===");
{
    // Free fall, no input at all: the largest possible per-tick drop, and
    // exactly what happened in the reported bug (a 3.5-row fall in one tick).
    const { ctx, els } = loadGame("flappyBird");
    ctx.restartGame();
    ctx.gameStarted = true;
    ctx.gameRunning = true;

    let ticks = 0;
    while (ctx.gameRunning && ticks < 4000) {
        ctx.gameLoop();
        ticks++;
    }

    check("free fall actually ends the run", !ctx.gameRunning);
    check("free-fall game over frame has no overlap",
        ctx.VTGameUI.getPaintConflicts() === 0);

    // The bird's row range, floored the same way checkCollision() does.
    const by = Math.floor(ctx.bird.y);
    const byEnd = by + ctx.bird.height; // exclusive

    // Distance in rows from the bird to the ground.
    const groundGap = ctx.SKY_ROWS - byEnd;

    // Distance in rows from the bird to the nearer edge of whichever pipe
    // shares its columns, if any.
    let pipeGap = Infinity;
    ctx.pipes.forEach(p => {
        const px = Math.floor(p.x);
        if (ctx.bird.x >= px + 3 || ctx.bird.x + ctx.bird.width <= px) return; // no x overlap
        const gapTop = p.topHeight, gapBottom = p.topHeight + ctx.pipeGap;
        if (by < gapTop) pipeGap = Math.min(pipeGap, gapTop - byEnd);
        if (byEnd > gapBottom) pipeGap = Math.min(pipeGap, by - gapBottom);
    });

    const nearestGap = Math.min(groundGap, pipeGap === Infinity ? groundGap : pipeGap);

    check("the bird sits touching (0 rows from) what ended the run, not floating away",
        nearestGap === 0,
        "nearest hazard is " + nearestGap + " rows away, a player would see no cause of death");
}

// The fallback (no valid contact point this tick) must not resurrect the old
// bug by painting from the still-colliding position. Force it: freeze the
// bird in place so a pipe arrives while preY === postY.
{
    const { ctx } = loadGame("flappyBird");
    ctx.restartGame();
    ctx.gameStarted = true;
    ctx.gameRunning = true;
    ctx.bird.y = 12;
    ctx.updateBird = function () {}; // frozen: never moves

    let ticks = 0;
    while (ctx.gameRunning && ticks < 3000) {
        ctx.gameLoop();
        ticks++;
    }

    check("frozen-bird fallback also ends the run", !ctx.gameRunning);
    check("frozen-bird fallback frame has no overlap",
        ctx.VTGameUI.getPaintConflicts() === 0,
        "the null-contact-point fallback must keep the prior safe frame, " +
        "not rebuild from the still-colliding position");
}

// Everything above fires async calls without awaiting them, relying on each
// one resolving before its first internal `await` (documented at each call
// site). Verifying a guest's run makes NO network call at all needs the
// opposite: a real `await`, so every one of gameOver()'s awaited steps
// actually runs before the count is checked. Wrapped in its own async IIFE
// so it can run last, after every synchronous check above it.
(async () => {
    // Each game's own bottom-of-file auto-invoke fires initGame() once already,
    // during loadGame() itself: document.readyState is "complete" in this
    // harness, exactly as it is on a real page loaded normally. Let that
    // settle, then zero the counters, so what the checks below measure is only
    // the explicit call each test makes, not however many times the file
    // happened to run on its own first.
    async function settle() {
        await new Promise((resolve) => setImmediate(resolve));
    }

    console.log("\n=== GUEST MODE: NO SCORE OR LEADERBOARD TRAFFIC REACHES THE SERVER ===");
    {
        for (const dir of ["flappyBird", "snake", "tetris"]) {
            const { ctx, els, apiCalls } = loadGame(dir, { VTSession: { isGuest: () => true } });
            await settle();
            apiCalls.loadHighScore = 0;
            apiCalls.loadLeaderboard = 0;

            await ctx.initGame();
            check(dir + " (guest): startup never asks the server for a highscore",
                apiCalls.loadHighScore === 0, apiCalls.loadHighScore + " calls");
            check(dir + " (guest): startup never asks the server for the leaderboard",
                apiCalls.loadLeaderboard === 0, apiCalls.loadLeaderboard + " calls");
            check(dir + " (guest): the HIGHSCORE stat reads LOCKED, not a number",
                /HIGHSCORE: LOCKED/.test(els.ui.textContent), els.ui.textContent);
            check(dir + " (guest): the in-game panel says so instead of showing scores",
                els.ui.textContent.includes("GUEST MODE") && els.ui.textContent.includes("SIGN IN TO VIEW"),
                els.ui.textContent);

            ctx.gameStarted = true;
            ctx.gameRunning = true;
            ctx.score = 42;
            await ctx.gameOver();

            check(dir + " (guest): a finished run never saves a highscore to the server",
                apiCalls.saveHighScore === 0, apiCalls.saveHighScore + " calls");
            check(dir + " (guest): a finished run never saves to the leaderboard",
                apiCalls.saveLeaderboard === 0, apiCalls.saveLeaderboard + " calls");
            check(dir + " (guest): and never re-fetches it either",
                apiCalls.loadLeaderboard === 0, apiCalls.loadLeaderboard + " calls");
            check(dir + " (guest): HIGHSCORE stays locked even after a scoring run",
                /HIGHSCORE: LOCKED/.test(els.ui.textContent), els.ui.textContent);
            check(dir + " (guest): a run never claims to be a new record with nothing to compare against",
                ctx.isNewRecord === false, "isNewRecord=" + ctx.isNewRecord);
        }
    }

    console.log("\n=== SAME CHECKS FOR A SIGNED-IN PLAYER (no regression on the common case) ===");
    {
        for (const dir of ["flappyBird", "snake", "tetris"]) {
            const { ctx, els, apiCalls } = loadGame(dir);   // default stub: not a guest
            await settle();
            apiCalls.loadHighScore = 0;
            apiCalls.loadLeaderboard = 0;

            await ctx.initGame();
            check(dir + ": startup does ask the server for a highscore",
                apiCalls.loadHighScore === 1, apiCalls.loadHighScore + " calls");
            check(dir + ": startup does ask the server for the leaderboard",
                apiCalls.loadLeaderboard === 1, apiCalls.loadLeaderboard + " calls");
            check(dir + ": the panel shows the normal empty-leaderboard message, not guest mode",
                !els.ui.textContent.includes("GUEST MODE"), els.ui.textContent);
            check(dir + ": HIGHSCORE shows a real number, not LOCKED",
                /HIGHSCORE: 0\b/.test(els.ui.textContent) && !els.ui.textContent.includes("LOCKED"),
                els.ui.textContent);

            ctx.gameStarted = true;
            ctx.gameRunning = true;
            ctx.score = 42;
            await ctx.gameOver();

            check(dir + ": a finished run does save a highscore",
                apiCalls.saveHighScore === 1, apiCalls.saveHighScore + " calls");
            check(dir + ": a finished run does save to the leaderboard",
                apiCalls.saveLeaderboard === 1, apiCalls.saveLeaderboard + " calls");
        }
    }

    console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
    process.exit(failures ? 1 : 0);
})();
