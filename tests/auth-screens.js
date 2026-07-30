// Login and signup key handling, driven against a stubbed DOM.
//
// Both screens collect characters straight off the document's keydown, and two
// rules there silently ate real characters:
//
//   * `m` and `M` were bound to the sound toggle on every screen, typed ones
//     included, so no field on the site could contain the letter m. No email
//     address at gmail.com was typeable, and nothing on screen said why.
//   * a character was accepted only when `!e.ctrlKey`, and AltGr on Windows
//     reports itself as Ctrl+Alt, so on every layout that puts @ behind AltGr
//     the key did nothing. An address did reach Supabase with no @ in it.
//
// These press keys through the pages' own listeners, the same way a browser
// would, rather than calling their internals.
//
// Run with:  node tests/auth-screens.js

const fs = require("fs");
const vm = require("vm");
const path = require("path");

const ROOT = path.join(__dirname, "..", "FrontEnd");

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
    return {
        textContent: "", innerHTML: "", value: "", type: "", tabIndex: 0,
        parentNode: null, style: { cssText: "" },
        classList: { add() {}, remove() {} },
        setAttribute() {}, focus() {}, blur() {}, select() {},
        addEventListener() {}
    };
}

// Loads a screen's real inline script on top of the real shared modules.
function loadScreen(relPath) {
    const html = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    let src = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
        .map(m => m[1]).join("\n");

    // Top-level let/const are lexical and never become properties of the vm
    // context, so the harness could not read the page's real state. Dedent
    // first, then rewrite only the declarations that end up at column 0:
    // rewriting the ones inside functions would change their scoping.
    const firstIndent = (src.split("\n").find(l => l.trim()) || "").match(/^[ \t]*/)[0];
    if (firstIndent) {
        src = src.split("\n")
            .map(l => (l.startsWith(firstIndent) ? l.slice(firstIndent.length) : l))
            .join("\n");
    }
    src = src.replace(/^(let|const) /gm, "var ");

    const handlers = {};
    const els = { terminal: makeEl(), loadingOverlay: makeEl() };
    const store = {};
    const requests = [];
    let nextResponse = { ok: true, status: 200, body: {} };

    const ctx = {
        console: { log() {}, error() {}, warn() {} },
        setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
        Math, Date, JSON, Number, String, Array, Object, Boolean, isNaN, parseInt, parseFloat,
        Promise, Error, RegExp, URLSearchParams,
        fetch: async (url, options) => {
            requests.push({ url, options, body: options?.body ? JSON.parse(options.body) : null });
            return {
                ok: nextResponse.ok,
                status: nextResponse.status,
                json: async () => nextResponse.body
            };
        },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem(k, v) { store[k] = String(v); },
            removeItem(k) { delete store[k]; }
        },
        addEventListener: () => {},
        location: { hostname: "localhost", href: "", hash: "", replace() {} },
        history: { replaceState() {} },
        AudioContext: class {
            constructor() { this.state = "running"; this.currentTime = 0; this.destination = {}; }
            resume() { return Promise.resolve(); }
            createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
            createOscillator() { return { type: "", frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, start() {}, stop() {} }; }
        },
        document: {
            readyState: "complete", hidden: false, activeElement: null,
            body: { appendChild() {} },
            getElementById: id => els[id] || makeEl(),
            createElement: () => makeEl(),
            // Captured rather than discarded, so the tests drive the screens'
            // real key handling.
            addEventListener: (type, fn) => { (handlers[type] ||= []).push(fn); }
        }
    };
    ctx.window = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);

    for (const shared of ["config.js", "session.js", "sound.js", "keys.js", "clipboard.js"]) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, "shared", shared), "utf8"), ctx);
    }
    vm.runInContext(src, ctx);

    function press(key, mods = {}) {
        const event = {
            key,
            code: key.length === 1 ? "Key" + key.toUpperCase() : key,
            ctrlKey: false, metaKey: false, altKey: false, shiftKey: false,
            ...mods,
            preventDefault() {}
        };
        (handlers.keydown || []).forEach(fn => fn(event));
    }

    function type(text, mods) {
        for (const ch of text) press(ch, mods);
    }

    return {
        ctx, els, press, type, requests, store,
        respondWith: (res) => { nextResponse = res; },
        // The pages' handlers are async; let their promises settle.
        settle: () => new Promise(resolve => setImmediate(resolve))
    };
}

async function main() {
    console.log("\n=== LOGIN: EVERY PRINTABLE KEY REACHES THE FIELD ===");
    {
        const s = loadScreen("login/login.html");

        s.type("gmail");
        check("m types instead of toggling the sound", s.ctx.email === "gmail", s.ctx.email);
        check("typing m did not mute the site", s.ctx.VTSound.isMuted() === false);

        s.press("M", { shiftKey: true });
        check("capital M types too", s.ctx.email === "gmailM", s.ctx.email);

        s.ctx.email = "";
        // Windows reports AltGr as Ctrl+Alt, and @ sits behind it on many layouts.
        s.press("@", { ctrlKey: true, altKey: true });
        check("AltGr @ reaches the field", s.ctx.email === "@", s.ctx.email);

        s.ctx.email = "";
        s.press("v", { ctrlKey: true });
        s.press("c", { ctrlKey: true });
        check("Ctrl+V and Ctrl+C stay shortcuts, not text", s.ctx.email === "", s.ctx.email);

        s.type(" name.surname+tag@sub.example.co ");
        check("spaces, dots, plus and at all survive",
            s.ctx.email === " name.surname+tag@sub.example.co ", s.ctx.email);
    }

    console.log("\n=== LOGIN: SOUND IS ON F2 ===");
    {
        const s = loadScreen("login/login.html");

        s.press("F2");
        check("F2 mutes", s.ctx.VTSound.isMuted() === true);
        check("F2 typed nothing into the field", s.ctx.email === "", s.ctx.email);

        s.press("F2");
        check("F2 unmutes again", s.ctx.VTSound.isMuted() === false);
        check("the commands block advertises F2", /\[F2\]/.test(s.els.terminal.innerHTML));
    }

    console.log("\n=== LOGIN: ENTER WALKS THE FIELDS AND SUBMITS ===");
    {
        const s = loadScreen("login/login.html");
        s.respondWith({ ok: true, status: 200, body: { username: "player", session: { access_token: "t", refresh_token: "r", expires_in: 3600 } } });

        s.type("  Player@Example.com  ");
        s.press("Enter");
        check("ENTER on EMAIL moves to PASSWORD", s.ctx.currentField === 1, String(s.ctx.currentField));

        s.type("secret1");
        check("the password went into its own field", s.ctx.password === "secret1", s.ctx.password);

        s.press("Enter");
        await s.settle();

        check("ENTER on PASSWORD submits", s.requests.length === 1, s.requests.length + " requests");
        const sent = s.requests[0] && s.requests[0].body;
        check("the pasted address is trimmed before it is sent",
            sent && sent.email === "Player@Example.com", sent && sent.email);
        check("the session is stored, not just the username",
            !!s.store.vtcadeSession && /access_token|accessToken/.test(s.store.vtcadeSession),
            s.store.vtcadeSession);
    }

    console.log("\n=== LOGIN: A MALFORMED ADDRESS IS CAUGHT BEFORE THE ROUND TRIP ===");
    {
        const s = loadScreen("login/login.html");

        s.type("playerexample.com");
        s.press("Enter");            // -> PASSWORD
        s.type("secret1");
        s.press("Enter");            // -> submit
        await s.settle();

        check("nothing was sent", s.requests.length === 0, s.requests.length + " requests");
        check("the screen says what is wrong",
            /not a valid email/i.test(s.els.terminal.innerHTML));
    }

    console.log("\n=== LOGIN: AN UNVERIFIED ACCOUNT IS OFFERED A NEW EMAIL ===");
    {
        const s = loadScreen("login/login.html");
        s.respondWith({
            ok: false, status: 403,
            body: { message: "Please verify your email before logging in.", requiresVerification: true }
        });

        s.type("player@example.com");
        s.press("Enter");
        s.type("secret1");
        s.press("Enter");
        await s.settle();

        check("the resend row appears", /RESEND VERIFICATION EMAIL/.test(s.els.terminal.innerHTML));

        s.respondWith({ ok: true, status: 200, body: { message: "Verification email sent." } });
        s.press("ArrowDown");        // submit -> google
        s.press("ArrowDown");        // -> forgot
        s.press("ArrowDown");        // -> resend
        s.press("Enter");
        await s.settle();

        const last = s.requests.at(-1);
        check("selecting it calls the resend endpoint",
            !!last && /resend-verification$/.test(last.url), last && last.url);
    }

    console.log("\n=== SIGNUP: SAME KEYS, SAME RULES ===");
    {
        const s = loadScreen("signup/signup.html");

        s.type("mrmagoo");
        check("m types into the username", s.ctx.username === "mrmagoo", s.ctx.username);
        check("typing it did not mute the site", s.ctx.VTSound.isMuted() === false);

        s.press("F2");
        check("F2 mutes here too", s.ctx.VTSound.isMuted() === true);
        s.press("F2");

        s.respondWith({ ok: true, status: 201, body: { username: "mrmagoo", requiresVerification: true } });

        s.press("Enter");            // username -> email
        s.type("mrmagoo@gmail.com");
        s.press("Enter");            // email -> password
        s.type("secret1");
        s.press("Enter");            // password -> confirm
        s.type("secret1");
        s.press("Enter");            // confirm -> register, and submit
        await s.settle();

        check("ENTER walked all four fields and registered",
            s.requests.length === 1, s.requests.length + " requests");
        const sent = s.requests[0] && s.requests[0].body;
        check("every field arrived intact",
            sent && sent.username === "mrmagoo" && sent.email === "mrmagoo@gmail.com" && sent.password === "secret1",
            JSON.stringify(sent));
        check("the completion screen offers a resend",
            /RESEND VERIFICATION EMAIL/.test(s.els.terminal.innerHTML));

        s.respondWith({ ok: true, status: 200, body: { message: "Verification email sent." } });
        s.press("R");
        await s.settle();
        const last = s.requests.at(-1);
        check("R on the completion screen resends",
            !!last && /resend-verification$/.test(last.url), last && last.url);
    }

    console.log("\n=== SIGNUP: THE RULES ARE STATED, NOT DISCOVERED ===");
    {
        const s = loadScreen("signup/signup.html");

        s.type("ab");                // too short
        s.press("Enter");
        s.type("ab@example.com");
        s.press("Enter");
        s.type("secret1");
        s.press("Enter");
        s.type("secret1");
        s.press("Enter");
        await s.settle();

        check("a too-short username never reaches the server",
            s.requests.length === 0, s.requests.length + " requests");
        check("and the screen says what is allowed",
            /3-20 characters/.test(s.els.terminal.innerHTML));
    }

    console.log("\n=== THE TAGLINE IS NOT FINE PRINT ===");
    {
        // .subtitle lives inside .logo, which is 0.625em, so its own font-size is
        // relative to that. It was 0.875em, which resolved to 0.547em: about 9px
        // under a banner six times the size.
        const css = fs.readFileSync(path.join(ROOT, "shared", "terminal.css"), "utf8");
        const logo = css.match(/\.logo\s*\{[^}]*font-size:\s*([\d.]+)em/);
        const subtitle = css.match(/\.subtitle\s*\{[^}]*font-size:\s*([\d.]+)em/);

        check("both sizes are still declared in em", !!logo && !!subtitle);

        const effective = Number(logo[1]) * Number(subtitle[1]);
        check("the tagline is as big as the terminal text (0.875em of the page)",
            Math.abs(effective - 0.875) < 0.001, effective + "em");
    }

    console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
    process.exit(failures ? 1 : 0);
}

main();
