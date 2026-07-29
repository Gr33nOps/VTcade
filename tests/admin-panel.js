// Admin panel menu logic, driven against a stubbed DOM.
//
// The maintenance screen shipped with three places disagreeing about what a
// menu index meant: the renderer compacted the list and skipped the entry that
// did not apply, while the Enter handler and the navigation bounds both used
// positions from the uncompacted array. BACK TO MENU drew at index 1 and was
// only recognised at index 2, so it did nothing at all, and the cursor could
// move to an invisible position below the last visible row.
//
// Run with:  node tests/admin-panel.js

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const PANEL = path.join(__dirname, "..", "FrontEnd", "admin", "adminpanal.html");

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

// Loads the panel's real inline script with a session already in place, so it
// gets past checkAuth() and renders.
function loadPanel() {
    const html = fs.readFileSync(PANEL, "utf8");
    let src = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(m => m[1]).join("\n");

    // Top-level let/const are lexical and never become properties of the vm
    // context, so the harness could not read or drive real panel state. They are
    // rewritten to var, but only the TOP-level ones: rewriting declarations
    // inside functions would change their scoping.
    //
    // This script is indented inside its <script> tag, unlike the games', so
    // dedent by the first line's indent before matching at column 0. Lines that
    // do not carry that exact prefix are left alone, which is what keeps the
    // column-0 content inside template literals intact.
    const firstIndent = (src.split("\n").find(l => l.trim()) || "").match(/^[ \t]*/)[0];
    if (firstIndent) {
        src = src.split("\n")
            .map(l => (l.startsWith(firstIndent) ? l.slice(firstIndent.length) : l))
            .join("\n");
    }
    src = src.replace(/^(let|const) /gm, "var ");

    const handlers = {};
    const els = { terminal: makeEl(), loadingOverlay: makeEl() };
    const store = {
        adminUsername: "ADMIN",
        adminSessionExpiresAt: String(Date.now() + 3600000)
    };

    const ctx = {
        console: { log() {}, error() {}, warn() {} },
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        alert: () => {}, confirm: () => true,
        Math, Date, JSON, Number, String, Array, Object, Boolean, isNaN, parseInt, parseFloat,
        Promise, Error,
        fetch: async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => "" }),
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem(k, v) { store[k] = String(v); },
            removeItem(k) { delete store[k]; }
        },
        addEventListener: () => {},
        location: { href: "" },
        AudioContext: class {
            constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
            resume() { return Promise.resolve(); }
            createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
            createOscillator() { return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
        },
        document: {
            readyState: "complete", hidden: false,
            getElementById: id => els[id] || makeEl(),
            // Captured rather than discarded, so the tests can drive the panel's
            // real key handling instead of calling its internals directly.
            addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }
        },
        VTCADE_API_URL: ""
    };
    ctx.window = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);

    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "FrontEnd", "shared", "sound.js"), "utf8"), ctx);
    vm.runInContext(src, ctx);

    // Presses a key the way a browser would, through the panel's own listener.
    function press(key) {
        (handlers.keydown || []).forEach(fn => fn({ key, code: key, preventDefault() {}, ctrlKey: false, shiftKey: false, metaKey: false }));
    }

    return { ctx, els, press };
}

console.log("\n=== MAINTENANCE MENU ===");
{
    const { ctx, els, press } = loadPanel();
    ctx.currentView = "maintenance";

    // ---- with maintenance OFF, the screen offers ENABLE and BACK ----------
    ctx.stats = { users: 0, games: 3, status: "ONLINE", maintenanceMode: false };
    ctx.selectedIndex = 0;

    let actions = ctx.maintenanceActions();
    check("maintenance off: two rows, ENABLE then BACK TO MENU",
        actions.length === 2 && /ENABLE/.test(actions[0].name) && /BACK/.test(actions[1].name),
        actions.map(a => a.name).join(" | "));

    check("navigation stops at the last visible row",
        ctx.maintenanceActions().length - 1 === 1,
        "maxIndex would be " + (ctx.maintenanceActions().length - 1));

    // Every drawn row must be reachable and must do something. This is the
    // regression: BACK TO MENU drew at index 1 and matched nothing.
    ctx.render();
    const drawn = els.terminal.innerHTML.split("\n").filter(l => /\[\d\]/.test(l));
    check("every action in the list is actually drawn",
        drawn.length === actions.length, drawn.length + " drawn vs " + actions.length + " actions");

    ctx.selectedIndex = 1;
    press("Enter");
    check("pressing ENTER on BACK TO MENU returns to the menu",
        ctx.currentView === "home" && ctx.selectedIndex === 0,
        "view=" + ctx.currentView + " index=" + ctx.selectedIndex);

    // ---- with maintenance ON, the first row becomes DISABLE ---------------
    ctx.currentView = "maintenance";
    ctx.stats.maintenanceMode = true;
    actions = ctx.maintenanceActions();
    check("maintenance on: two rows, DISABLE then BACK TO MENU",
        actions.length === 2 && /DISABLE/.test(actions[0].name) && /BACK/.test(actions[1].name),
        actions.map(a => a.name).join(" | "));

    ctx.selectedIndex = 1;
    press("Enter");
    check("ENTER on BACK TO MENU still works when maintenance is on",
        ctx.currentView === "home");

    // ---- the highlighted row and the action taken must be the same one ----
    let mismatched = 0;
    for (const mode of [false, true]) {
        ctx.currentView = "maintenance";
        ctx.stats.maintenanceMode = mode;
        const list = ctx.maintenanceActions();

        for (let i = 0; i < list.length; i++) {
            ctx.selectedIndex = i;
            ctx.render();
            const highlighted = els.terminal.innerHTML
                .split("\n")
                .find(l => l.includes(">>>"));
            if (!highlighted || !highlighted.includes(list[i].name)) mismatched++;
        }
    }
    check("the highlighted row always names the action that would run",
        mismatched === 0, mismatched + " mismatch(es)");
}

// Destructive actions used to go through a native confirm(), which said "Press
// OK" on a site with no cursor and could not be styled. They are drawn in the
// terminal now, and the screen is modal so a stray arrow key cannot move the
// selection out from under the action about to run.
console.log("\n=== CONFIRMATION SCREEN ===");
{
    const { ctx, els, press } = loadPanel();
    ctx.currentView = "users";
    ctx.users = [{ id: "u1", username: "victim", email: "v@example.com" }];
    ctx.selectedIndex = 0;

    let ran = 0;
    ctx.askConfirm("DELETE THIS USER?", ["Everything goes with them."], () => { ran++; });

    const screen = els.terminal.innerHTML;
    check("the confirm screen names the action", screen.includes("DELETE THIS USER?"));
    check("it explains the consequence", screen.includes("Everything goes with them."));
    check("it offers both keys", screen.includes("[Y]") && screen.includes("[N]"));

    // Modal: nothing else responds while it is up.
    press("ArrowDown");
    check("arrows do nothing while it is up", ctx.selectedIndex === 0, "index=" + ctx.selectedIndex);
    check("it is still on screen", els.terminal.innerHTML.includes("DELETE THIS USER?"));

    press("n");
    check("N cancels without running the action", ran === 0 && ctx.pendingConfirm === null);
    check("cancelling returns to the list", !els.terminal.innerHTML.includes("DELETE THIS USER?"));

    ctx.askConfirm("DELETE THIS USER?", ["Everything goes with them."], () => { ran++; });
    press("Escape");
    check("ESC cancels too", ran === 0 && ctx.pendingConfirm === null);

    ctx.askConfirm("DELETE THIS USER?", ["Everything goes with them."], () => { ran++; });
    press("y");
    check("Y runs the action exactly once", ran === 1, "ran=" + ran);
    check("and dismisses the screen", ctx.pendingConfirm === null);
}

console.log("\n=== ERRORS RENDER IN THE TERMINAL ===");
{
    const { ctx, els } = loadPanel();
    ctx.currentView = "home";
    ctx.stats = { users: 0, games: 3, status: "ONLINE", maintenanceMode: false };

    ctx.showError("Failed to ban user: network down");
    const screen = els.terminal.innerHTML;
    check("the error is drawn on the page", screen.includes("Failed to ban user: network down"));
    check("it sits above the READY prompt",
        screen.indexOf("ERROR:") < screen.indexOf("READY:"),
        "error at " + screen.indexOf("ERROR:") + ", ready at " + screen.indexOf("READY:"));

    ctx.clearError();
    ctx.render();
    check("clearing removes it", !els.terminal.innerHTML.includes("Failed to ban user"));
}

console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
process.exit(failures ? 1 : 0);
