// Shared harness for executing a REAL game's inline script against a stubbed
// DOM/session, rather than reimplementing the rules. Pulled out of
// tests/game-logic.js once tests/guest-mode.js needed the exact same loader:
// two near-identical copies would have drifted the first time either changed.

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "FrontEnd");

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

// `overrides.VTSession` is shallow-merged over the default stub, so a test can
// simulate a guest (`isGuest: () => true`) without restating the rest.
//
// `apiCalls` counts every call the game makes through createGameApi(), so a
// test can assert a guest's game never reaches the network at all rather than
// just checking the score ends up right.
function loadGame(dir, overrides = {}) {
    const handlers = {};
    const els = { game: makeEl(), ui: makeEl(), loadingOverlay: makeEl() };
    const apiCalls = { loadHighScore: 0, saveHighScore: 0, saveLeaderboard: 0, loadLeaderboard: 0 };

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
        VTSession: Object.assign({
            API_URL: "http://test",
            getUsername: () => "tester",
            isGuest: () => false,
            authedFetch: async () => ({ ok: true, json: async () => ({}), text: async () => "" })
        }, overrides.VTSession),
        createGameApi: () => ({
            loadHighScore: async () => { apiCalls.loadHighScore++; return 0; },
            saveHighScore: async () => { apiCalls.saveHighScore++; return null; },
            saveLeaderboard: async () => { apiCalls.saveLeaderboard++; return true; },
            loadLeaderboard: async () => { apiCalls.loadLeaderboard++; return []; }
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

    return { ctx, els, handlers, apiCalls };
}

module.exports = { loadGame, inlineScript, makeEl, ROOT };
