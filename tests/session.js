// Tests for shared/session.js, focused on the guest identity it grew for
// "CONTINUE AS GUEST": a display name with no Supabase token behind it.
//
// isGuest() and getUsername() are backed by separate localStorage keys and
// must never disagree with each other, in either direction: a stale guest
// flag surviving a real login would make requireLogin() and the dashboard
// treat a real player as a guest, and a stale username surviving clearSession
// would leave someone "logged in" as nobody.
//
// Run with:  node tests/session.js

const fs = require("fs");
const vm = require("vm");
const path = require("path");

function loadSession() {
    const store = {};
    const ctx = {
        console,
        Date, JSON, Object, Promise, Math, String,
        localStorage: {
            getItem: (k) => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
            removeItem: (k) => { delete store[k]; }
        },
        // Only getAccessToken()'s refresh path would ever call this, and no
        // test here drives a real, non-guest session far enough to reach it.
        fetch: async () => { throw new Error("no test in this file should reach the network"); }
    };
    ctx.window = ctx;
    ctx.global = ctx;
    vm.createContext(ctx);
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "..", "FrontEnd", "shared", "session.js"), "utf8"),
        ctx
    );
    return { VTSession: ctx.VTSession, store };
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

async function main() {
    console.log("=== BEFORE ANYTHING HAPPENS ===");
    {
        const { VTSession } = loadSession();
        check("nobody is a guest yet", VTSession.isGuest() === false);
        check("and there is no username yet", VTSession.getUsername() === null);
    }

    console.log("\n=== CONTINUE AS GUEST ===");
    {
        const { VTSession, store } = loadSession();
        const name = VTSession.startGuestSession();

        check("a guest gets a throwaway display name", /^GUEST\d{4}$/.test(name), name);
        check("isGuest is now true", VTSession.isGuest() === true);
        check("getUsername returns that same name", VTSession.getUsername() === name,
            VTSession.getUsername());
        check("nothing under the real session key was ever written",
            store.vtcadeSession === undefined, JSON.stringify(store));

        const token = await VTSession.getAccessToken();
        check("a guest has no access token to attach to a request", token === null, token);
    }

    console.log("\n=== A REAL SIGN-IN CLEARS A LEFTOVER GUEST FLAG ===");
    {
        // The exact sequence a shared browser produces: someone tries the site
        // as a guest, then comes back and signs in for real without clearing
        // storage first (no "log out of guest" step exists, or needs to).
        const { VTSession } = loadSession();
        VTSession.startGuestSession();
        check("guest, to start", VTSession.isGuest() === true);

        VTSession.saveSession(
            { access_token: "tok", refresh_token: "ref", expires_in: 3600 },
            "realplayer"
        );

        check("isGuest is false the instant a real session is saved",
            VTSession.isGuest() === false);
        check("getUsername now returns the real account, not the old guest name",
            VTSession.getUsername() === "realplayer", VTSession.getUsername());
    }

    console.log("\n=== LOGOUT CLEARS A GUEST JUST AS COMPLETELY AS A REAL ACCOUNT ===");
    {
        const { VTSession } = loadSession();
        VTSession.startGuestSession();

        VTSession.clearSession();

        check("isGuest is false after logout", VTSession.isGuest() === false);
        check("getUsername is null after logout", VTSession.getUsername() === null,
            VTSession.getUsername());
    }

    console.log("\n=== A REAL ACCOUNT IS NEVER MISTAKEN FOR A GUEST ===");
    {
        const { VTSession } = loadSession();
        VTSession.saveSession(
            { access_token: "tok", refresh_token: "ref", expires_in: 3600 },
            "realplayer"
        );

        check("isGuest is false for a real session", VTSession.isGuest() === false);
        check("getUsername returns the real account", VTSession.getUsername() === "realplayer");

        const token = await VTSession.getAccessToken();
        check("and it does have a token to attach", token === "tok", token);
    }

    console.log("\n" + (failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"));
    process.exit(failures ? 1 : 0);
}

main();
