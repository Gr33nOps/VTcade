// Dashboard menu logic, driven against a stubbed DOM.
//
// The games list mixes shipped games with locked "PROGRAM 04/05" placeholders,
// and arrow navigation used to walk the raw list index by index with no idea
// that some entries were not selectable. The cursor could rest on a locked
// program, and Enter or a direct-access number key on one played the same
// success beep as a real launch while silently doing nothing.
//
// Run with:  node tests/dashboard.js

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const DASHBOARD = path.join(__dirname, "..", "FrontEnd", "dashboard", "dashboard.html");

let failures = 0;
function check(label, cond, detail) {
    if (cond) {
        console.log("  PASS  " + label);
    } else {
        failures++;
        console.log("  FAIL  " + label + (detail ? "  -> " + detail : ""));
    }
}

function makeEl() {
    return { textContent: "", innerHTML: "", classList: { add() {}, remove() {} }, style: {} };
}

// Loads the dashboard's real inline script against a stubbed DOM and session,
// so it renders as the real "games" view without ever hitting the network.
// `overrides.VTSession` is shallow-merged over the default stub, so a test can
// simulate a guest (`isGuest: () => true`) without restating the rest.
function loadDashboard(overrides = {}) {
    const html = fs.readFileSync(DASHBOARD, "utf8");
    let src = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(m => m[1]).join("\n");

    // Top-level let/const are lexical and never become properties of the vm
    // context, so the harness could not read or drive real dashboard state.
    // This script is indented inside its <script> tag, so dedent by the first
    // line's indent before rewriting at column 0, the same fix admin-panel.js
    // needed: without it the rewrite matches nothing and the tests silently
    // measure a stale copy of the harness's own scope instead of the page.
    const firstIndent = (src.split("\n").find(l => l.trim()) || "").match(/^[ \t]*/)[0];
    if (firstIndent) {
        src = src.split("\n")
            .map(l => (l.startsWith(firstIndent) ? l.slice(firstIndent.length) : l))
            .join("\n");
    }
    src = src.replace(/^(let|const) /gm, "var ");

    const handlers = {};
    const els = { terminal: makeEl(), loadingOverlay: makeEl() };
    const soundCalls = [];

    const ctx = {
        console: { log() {}, error() {}, warn() {} },
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        Math, Date, JSON, Number, String, Array, Object, Boolean, isNaN, parseInt, parseFloat,
        Promise, Error,
        fetch: async () => ({ ok: true, status: 200, json: async () => ([]) }),
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        addEventListener: () => {},
        location: { href: "" },
        document: {
            readyState: "complete", hidden: false,
            getElementById: id => els[id] || makeEl(),
            addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }
        },
        VTSession: Object.assign({
            API_URL: "http://test",
            getUsername: () => "tester",
            isGuest: () => false,
            clearSession: () => {}
        }, overrides.VTSession),
        // Recorded rather than synthesised, so a test can assert exactly which
        // effect played without depending on sound.js's real implementation.
        VTSound: new Proxy({}, {
            get: (_, name) => () => soundCalls.push(String(name))
        })
    };
    ctx.window = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);

    function press(key) {
        (handlers.keydown || []).forEach(fn => fn({ key, code: key, preventDefault() {} }));
    }

    return { ctx, els, press, soundCalls };
}

console.log("\n=== GAMES LIST: LOCKED ENTRIES ARE NOT SELECTABLE ===");
{
    const { ctx, press, soundCalls } = loadDashboard();
    ctx.currentView = "games";
    ctx.selectedIndex = 0;
    ctx.currentPage = 0;

    check("the registry loaded 5 slots, 2 of them locked",
        ctx.games.length === 5 && ctx.games.filter(g => !g.available).length === 2,
        ctx.games.map(g => g.name + ":" + g.available).join(" "));

    // Walk downward past both locked entries at the end of the list. Landing
    // on one is exactly the bug reported: a screenshot showed the cursor
    // resting on "PROGRAM 04".
    for (let i = 0; i < ctx.games.length; i++) {
        ctx.navigate("down");
        check("after " + (i + 1) + " down-press(es), the cursor sits on an available game",
            ctx.games[ctx.selectedIndex].available,
            "resting on " + ctx.games[ctx.selectedIndex].name);
    }

    // Walking up from the top must wrap to the last AVAILABLE game (Snake),
    // not the last entry in the array (the locked "PROGRAM 05").
    ctx.selectedIndex = 0;
    ctx.navigate("up");
    check("moving up from the first game wraps to the last available one, not the last slot",
        ctx.games[ctx.selectedIndex].available && ctx.games[ctx.selectedIndex].apiName === "SNAKE",
        "landed on " + ctx.games[ctx.selectedIndex].name);

    // Direct-access number keys and Enter must not launch a locked game, and
    // must say so with the error beep rather than staying silent behind the
    // same "select" beep a real launch uses.
    ctx.currentView = "games";
    ctx.selectedIndex = 3; // PROGRAM 04
    ctx.games[3].available = false; // defend the test even if the registry changes
    soundCalls.length = 0;
    ctx.launchGame(3);
    check("launching a locked game plays the error beep, not select",
        soundCalls.includes("error") && !soundCalls.includes("select"),
        soundCalls.join(","));

    soundCalls.length = 0;
    ctx.launchGame(0); // Flappy Bird, available
    check("launching an available game plays select, not error",
        soundCalls.includes("select") && !soundCalls.includes("error"),
        soundCalls.join(","));
}

console.log("\n=== SAME CHECK WITH EVERY GAME AVAILABLE (no regression on the common case) ===");
{
    const { ctx } = loadDashboard();
    ctx.games.forEach(g => { g.available = true; });
    ctx.currentView = "games";
    ctx.selectedIndex = 0;
    ctx.currentPage = 0;

    for (let i = 0; i < ctx.games.length - 1; i++) ctx.navigate("down");
    check("with nothing locked, down still walks index by index to the last slot",
        ctx.selectedIndex === ctx.games.length - 1, "index=" + ctx.selectedIndex);
}

console.log("\n=== GUEST: VIEW LEADERBOARD IS LOCKED ===");
{
    const { ctx, soundCalls } = loadDashboard({ VTSession: { isGuest: () => true } });
    ctx.currentView = "menu";
    ctx.selectedIndex = 0;
    ctx.currentPage = 0;

    check("three of the four menu entries are open to a guest",
        ctx.menuItems().filter(i => i.available).length === 3,
        ctx.menuItems().map(i => i.name + ":" + i.available).join(" "));
    check("VIEW LEADERBOARD specifically is the locked one",
        ctx.menuItems()[2].name === "VIEW LEADERBOARD" && ctx.menuItems()[2].available === false);

    // Arrow navigation must skip it entirely, the same way a locked game is
    // skipped in the games list: the cursor should never rest on it.
    for (let i = 0; i < 4; i++) {
        ctx.navigate("down");
        check("after " + (i + 1) + " down-press(es), the cursor is not on the locked entry",
            ctx.menuItems()[ctx.selectedIndex].available,
            "resting on " + ctx.menuItems()[ctx.selectedIndex].name);
    }

    // Direct number-key access can still reach it, and must say no rather than
    // silently doing nothing behind a misleading "select" beep.
    soundCalls.length = 0;
    ctx.selectOption(2);
    check("selecting the locked entry directly plays the error beep, not select",
        soundCalls.includes("error") && !soundCalls.includes("select"),
        soundCalls.join(","));
    check("and it does not change the view",
        ctx.currentView === "menu", ctx.currentView);

    soundCalls.length = 0;
    ctx.selectOption(0);
    check("GAMES is unaffected and still plays select",
        soundCalls.includes("select") && !soundCalls.includes("error"),
        soundCalls.join(","));
}

console.log("\n=== SAME CHECK FOR A SIGNED-IN PLAYER (no regression on the common case) ===");
{
    const { ctx, soundCalls } = loadDashboard();
    ctx.currentView = "menu";

    check("all four menu entries are open to a real player",
        ctx.menuItems().every(i => i.available));

    soundCalls.length = 0;
    ctx.selectOption(2);
    check("VIEW LEADERBOARD plays select, not error, for a real player",
        soundCalls.includes("select") && !soundCalls.includes("error"),
        soundCalls.join(","));
    check("and it does move to the leaderboard menu",
        ctx.currentView === "leaderboard-menu", ctx.currentView);
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures ? 1 : 0);
