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
        localStorage: { getItem: () => "tester", setItem() {}, removeItem() {} },
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

// ============================ RUNNER ============================
console.log("\n=== RUNNER ===");
{
    const { ctx, els } = loadGame("runner");
    ctx.restartGame();
    const lines = boardLines(els.game);

    check("board rows = 25 + 2 border + 2 status",
        lines.length - 1 === 29, "got " + (lines.length - 1));
    check("every board line is exactly 50 wide",
        lines.slice(0, 27).every(l => l.length === 50));
    check("ground line is drawn", lines[25].includes("\u2500"));
    check("player rests on the ground row",
        ctx.player.groundY === 22 && ctx.player.height === 2,
        "groundY=" + ctx.player.groundY);

    // obstacle spacing must be measured in COLUMNS, so faster != roomier
    function measureGaps(speed) {
        ctx.restartGame();
        ctx.gameSpeed = speed;
        const xs = [];
        for (let i = 0; i < 4000; i++) {
            const n = ctx.obstacles.length;
            ctx.updateObstacles();
            ctx.gameSpeed = speed;              // hold speed constant
            if (ctx.obstacles.length > n) xs.push(ctx.obstacles[ctx.obstacles.length - 1].x - i * 0);
            if (xs.length > 12) break;
        }
        return ctx;
    }
    ctx.restartGame();
    ctx.gameSpeed = 1;
    let spawnFrames1 = [];
    for (let i = 0; i < 2000 && spawnFrames1.length < 8; i++) {
        const n = ctx.obstacles.length;
        ctx.updateObstacles();
        ctx.gameSpeed = 1;
        if (ctx.obstacles.length > n) spawnFrames1.push(i);
    }
    ctx.restartGame();
    ctx.gameSpeed = 2.5;
    let spawnFrames25 = [];
    for (let i = 0; i < 2000 && spawnFrames25.length < 8; i++) {
        const n = ctx.obstacles.length;
        ctx.updateObstacles();
        ctx.gameSpeed = 2.5;
        if (ctx.obstacles.length > n) spawnFrames25.push(i);
    }
    const gapFrames1 = spawnFrames1[2] - spawnFrames1[1];
    const gapFrames25 = spawnFrames25[2] - spawnFrames25[1];
    check("at 2.5x speed obstacles spawn in FEWER frames (spacing held in columns)",
        gapFrames25 < gapFrames1,
        "1x=" + gapFrames1 + " frames, 2.5x=" + gapFrames25 + " frames");

    // hazard width now matches Flappy's pipes
    ctx.restartGame();
    for (let i = 0; i < 200 && ctx.obstacles.length === 0; i++) ctx.updateObstacles();
    check("hazard width is 3 (matches Flappy pipes)",
        ctx.obstacles[0] && ctx.obstacles[0].width === 3,
        ctx.obstacles[0] && String(ctx.obstacles[0].width));
    check("obstacle sits on the ground row",
        ctx.obstacles[0] && ctx.obstacles[0].y + ctx.obstacles[0].height === 24,
        ctx.obstacles[0] && (ctx.obstacles[0].y + ctx.obstacles[0].height));

    // pause
    ctx.startGame();
    ctx.togglePause();
    check("pause works", ctx.gameRunning === false && ctx.paused === true);
    check("paused status text shown", els.game.textContent.includes("< PAUSED >"));
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
    check("bird is a 2x2 block like Runner's player",
        ctx.bird.width === 2 && ctx.bird.height === 2);

    // ceiling must not be a free parking spot
    ctx.bird.y = 0; ctx.bird.velocity = 0;
    ctx.updateBird();
    check("ceiling bonk starts the bird falling again",
        ctx.bird.velocity > 0, "velocity=" + ctx.bird.velocity);

    // floor is death, and matches Runner's resting row
    ctx.bird.y = 22;
    check("bird resting at row 22 is alive (same as Runner's player)", ctx.checkCollision() === false);
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
    const games = ["snake", "runner", "flappyBird"].map(d => {
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
    const scenarios = [
        ["snake", (c) => c.updateSnake()],
        ["runner", (c) => { c.updatePlayer(); c.updateObstacles(); }],
        ["flappyBird", (c) => { c.updateBird(); c.updatePipes(); }]
    ];

    scenarios.forEach(([dir, step]) => {
        const { ctx } = loadGame(dir);
        let conflicts = 0, frames = 0;
        for (let run = 0; run < 3; run++) {
            ctx.restartGame();
            ctx.gameStarted = true;
            ctx.gameRunning = true;
            for (let i = 0; i < 1200; i++) {
                step(ctx);
                // Keep the run alive: this is testing rendering, not survival.
                if (dir === "flappyBird") { ctx.bird.y = 11; ctx.bird.velocity = 0; }
                if (dir === "snake" && ctx.checkCollision()) { ctx.restartGame(); continue; }
                ctx.draw();
                conflicts += ctx.VTGameUI.getPaintConflicts();
                frames++;
            }
        }
        check(dir + ": no two sprites shared a cell across " + frames + " frames",
            conflicts === 0, conflicts + " conflicting cells");
    });
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures ? 1 : 0);
