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
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..", "FrontEnd");

function inlineScript(file) {
    const html = fs.readFileSync(file, "utf8");
    const matches = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    let src = matches.map(m => m[1]).join("\n");
    // Top-level `let`/`const` are lexical and never become properties of the vm
    // context, so the harness could not read or drive real game state. Only
    // column-0 declarations are rewritten; anything indented (inside a function
    // or block) is left exactly as the game wrote it.
    src = src.replace(/^(let|const) /gm, "var ");
    return src;
}

function makeEl() {
    return {
        textContent: "",
        innerHTML: "",
        classList: { add() {}, remove() {} },
        style: {}
    };
}

function loadGame(dir) {
    const handlers = {};
    const els = { game: makeEl(), ui: makeEl(), loadingOverlay: makeEl() };

    const ctx = {
        console,
        setTimeout: () => 0,          // never auto-advance; we step manually
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        alert: () => {},
        Math, Date, JSON, Number, String, Array, Object, Boolean, isNaN, parseInt, parseFloat,
        Promise, URLSearchParams, Error,
        fetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        // sound.js attaches unlock listeners on window and creates an
        // AudioContext; stub both so the games' real VTSound.* calls run here.
        addEventListener: () => {},
        AudioContext: class {
            constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
            resume() { return Promise.resolve(); }
            createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
            createOscillator() { return { type: "square", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
        },
        document: {
            readyState: "complete",
            hidden: false,
            getElementById: id => els[id] || makeEl(),
            addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }
        },
        VTSession: {
            API_URL: "http://test",
            getUsername: () => "tester",
            authedFetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" })
        },
        createGameApi: () => ({
            loadHighScore: async () => 0,
            saveHighScore: async () => null,
            saveLeaderboard: async () => true,
            loadLeaderboard: async () => []
        })
    };
    ctx.window = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);

    // real shared UI module
    vm.runInContext(fs.readFileSync(path.join(ROOT, "shared/gameUI.js"), "utf8"), ctx);
    // real sound module, so the games' VTSound.* calls resolve
    vm.runInContext(fs.readFileSync(path.join(ROOT, "shared/sound.js"), "utf8"), ctx);
    // real game script
    vm.runInContext(inlineScript(path.join(ROOT, "games", dir, "game.html")), ctx);

    return { ctx, els, handlers };
}

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

// ============================ SNAKE ============================
console.log("\n=== SNAKE ===");
{
    const { ctx, els } = loadGame("snake");
    ctx.restartGame();
    const lines = boardLines(els.game);

    check("board rows = 25 + 2 border + 2 status",
        lines.length - 1 === 29, "got " + (lines.length - 1));
    check("every board line is exactly 50 wide",
        lines.slice(0, 27).every(l => l.length === 50),
        JSON.stringify(lines.slice(0, 27).map(l => l.length).filter((v, i, a) => a.indexOf(v) === i)));

    const body = lines.slice(1, 26).join("");
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
    check("eating food scores +10", ctx.score === before + 10, "score=" + ctx.score);

    // wall collision
    ctx.snake[0] = { x: 0, y: 5 };
    check("hitting the left wall is a collision", ctx.checkCollision() === true);
    ctx.snake[0] = { x: 49, y: 5 };
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
        if (ctx.food.x < 1 || ctx.food.x > 48 || ctx.food.y < 0 || ctx.food.y > 24) onSnake++;
    }
    check("400 food spawns all legal and off-snake", onSnake === 0, onSnake + " bad");
}

// ============================ TETRIS ============================
console.log("\n=== TETRIS ===");
{
    const { ctx, els } = loadGame("tetris");
    ctx.restartGame();
    const boardRows = boardLines(els.game);

    check("board rows = 25 + 2 border + 2 status",
        boardRows.length - 1 === 29, "got " + (boardRows.length - 1));
    check("every board line is exactly 50 wide",
        boardRows.slice(0, 27).every(l => l.length === 50));

    // boardRows[0] is the top border, so board row N is boardRows[N + 1].
    check("floor line is drawn", boardRows[ctx.GROUND_ROW + 1].includes("\u2500"));
    check("the well's bottom row sits on the shared ground row",
        ctx.WELL_TOP + ctx.WELL_ROWS === ctx.GROUND_ROW,
        "top=" + ctx.WELL_TOP + " ground=" + ctx.GROUND_ROW);

    // The whole point of the layout: the well spans the entire playfield, so
    // the board's own frame is the wall. The first version drew a 10-column
    // well with its own side rails, which put a box inside the box and made
    // this the only game that looked like that.
    check("the well spans the full playable width",
        ctx.WELL_COLS * ctx.CELL_W === 48,
        ctx.WELL_COLS + " cols x " + ctx.CELL_W + " chars = " + (ctx.WELL_COLS * ctx.CELL_W));
    check("the well starts flush against the board's own border",
        ctx.WELL_X === 1, "WELL_X=" + ctx.WELL_X);
    check("the well keeps classic 1:2 proportions",
        ctx.WELL_ROWS === ctx.WELL_COLS * 2,
        ctx.WELL_COLS + "x" + ctx.WELL_ROWS);

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
    check("one well cell renders exactly CELL_W characters wide",
        bottom.slice(1, 1 + ctx.CELL_W) === "█".repeat(ctx.CELL_W) &&
        bottom[1 + ctx.CELL_W] === " ",
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
    check("a single clear is worth at least 100",
        ctx.score >= 100, "score=" + ctx.score);
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
    check("a four-line clear beats four single clears, so building a well pays",
        ctx.LINE_SCORES[4] > 4 * ctx.LINE_SCORES[1],
        ctx.LINE_SCORES[4] + " vs " + (4 * ctx.LINE_SCORES[1]));

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
    ctx.restartGame();
    const lines = boardLines(els.game);

    check("board rows = 25 + 2 border + 2 status",
        lines.length - 1 === 29, "got " + (lines.length - 1));
    check("every board line is exactly 50 wide",
        lines.slice(0, 27).every(l => l.length === 50));
    check("floor line is now drawn (was invisible)", lines[25].includes("\u2500"));
    check("bird is the 2x2 shared side-scroller player block",
        ctx.bird.width === 2 && ctx.bird.height === 2);

    // ceiling must not be a free parking spot
    ctx.bird.y = 0; ctx.bird.velocity = 0;
    ctx.updateBird();
    check("ceiling bonk starts the bird falling again",
        ctx.bird.velocity > 0, "velocity=" + ctx.bird.velocity);

    // floor is death, and matches Runner's resting row
    ctx.bird.y = 22;
    check("bird resting at row 22 is alive (GROUND_ROW - its own height)", ctx.checkCollision() === false);
    ctx.bird.y = 23;
    check("bird at row 23 hits the floor", ctx.checkCollision() === true);

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
        const gapBottom = p.topHeight + 9;
        if (gapTop < 1 || gapBottom > 24) badGap++;
        if (gapBottom - gapTop < ctx.bird.height) tooTight++;
    }
    check("generated " + samples + " pipes, all gaps inside the playfield", badGap === 0, badGap + " bad");
    check("every gap fits the 2-tall bird", tooTight === 0, tooTight + " too tight");

    // a bird centred in the gap must survive that pipe
    ctx.pipes = [{ x: ctx.bird.x, topHeight: 5, passed: false }];
    ctx.bird.y = 5 + Math.floor((9 - 2) / 2);
    check("bird centred in the gap survives", ctx.checkCollision() === false, "y=" + ctx.bird.y);
    ctx.bird.y = 4;
    check("bird clipping the top pipe dies", ctx.checkCollision() === true);
    ctx.bird.y = 5 + 9 - 1;
    check("bird clipping the bottom pipe dies", ctx.checkCollision() === true);

    // difficulty actually ramps now
    ctx.restartGame();
    const startSpeed = ctx.pipeSpeed;
    for (let i = 0; i < 40; i++) {
        ctx.pipes = [{ x: -10, topHeight: 5, passed: false }];
        ctx.updatePipes();
    }
    check("pipe speed increases with score (was constant forever)",
        ctx.pipeSpeed > startSpeed, startSpeed + " -> " + ctx.pipeSpeed);
    check("pipe speed is capped", ctx.pipeSpeed <= 1.8 + 1e-9, "speed=" + ctx.pipeSpeed);

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

    const boardShapes = games.map(g => {
        const l = boardLines(g.els.game);
        return (l.length - 1) + "x" + l[0].length;
    });
    check("identical board dimensions", new Set(boardShapes).size === 1, boardShapes.join(" "));

    const statHeights = games.map(g => g.els.ui.textContent.split("\n").length);
    check("identical panel height", new Set(statHeights).size === 1, statHeights.join(" "));

    const statCounts = games.map(g =>
        (g.els.ui.textContent.match(/^[A-Z]+: /gm) || []).length);
    check("all three show 3 stat rows", statCounts.every(c => c === 3), statCounts.join(" "));

    const idle = games.map(g => boardLines(g.els.game)[27]);
    check("all three use the same start-prompt template",
        idle.every(l => /^< PRESS .+ TO START >$/.test(l)), JSON.stringify(idle));

    games.forEach(g => { g.ctx.startGame(); g.ctx.gameRunning = false; g.ctx.paused = false; g.ctx.draw(); });
    const over = games.map(g => boardLines(g.els.game).slice(27, 29));
    check("all three use the same game-over template",
        over.every(([a, b]) => a === "< GAME OVER >" && /^PRESS .+ TO RESTART$/.test(b)),
        JSON.stringify(over));

    games.forEach(g => { g.ctx.isNewRecord = true; g.ctx.draw(); });
    const rec = games.map(g => boardLines(g.els.game)[27]);
    check("all three show the same NEW RECORD banner",
        rec.every(l => l === "< GAME OVER - NEW RECORD! >"), JSON.stringify(rec));

    const panels = games.map(g => g.els.ui.textContent);
    check("all three panels list PAUSE and BACK TO HOME",
        panels.every(p => p.includes("[P]   PAUSE") && p.includes("[ESC] BACK TO HOME")));
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
        // the well tops out — which restarts the run and does it again.
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
    check("the overlap guard reports an intersection when one is staged",
        UI.getPaintConflicts() === 4,
        "expected 4 cells, got " + UI.getPaintConflicts());
}

// ============ THE GAME OVER FRAME MUST SHOW CONTACT, NOT A GAP ============
// Gravity accumulates, so a falling sprite can move several rows in one tick.
// Falling back to "wherever it was the previous tick" can leave a multi-row
// gap between the sprite and whatever killed it, on screen, with the run
// simply ending — which looks like it ended for no reason. A player must be
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
        const gapTop = p.topHeight, gapBottom = p.topHeight + 9;
        if (by < gapTop) pipeGap = Math.min(pipeGap, gapTop - byEnd);
        if (byEnd > gapBottom) pipeGap = Math.min(pipeGap, by - gapBottom);
    });

    const nearestGap = Math.min(groundGap, pipeGap === Infinity ? groundGap : pipeGap);

    check("the bird sits touching (0 rows from) what ended the run, not floating away",
        nearestGap === 0,
        "nearest hazard is " + nearestGap + " rows away — a player would see no cause of death");
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

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures ? 1 : 0);
