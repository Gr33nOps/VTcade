// Shared player session handling.
//
// Identity used to be nothing more than a username string in localStorage, so
// anyone could edit it and submit scores as another player. The backend now
// requires a real Supabase access token, and this module is what stores,
// refreshes, and attaches it.
//
// A guest (startGuestSession / isGuest) is the deliberate exception: a display
// name with no token behind it. getAccessToken() already returns null with no
// session present, so every authedFetch call a guest makes reaches the server
// with no Authorization header and gets the same 401 an expired session would -
// no separate guest check needed there. isGuest() exists only for the one thing
// that check can't cover: blocking a READ, like the public leaderboard, which
// needs no token at all and would otherwise work fine for a guest too.

(function (global) {
    // Note the explicit string test rather than `||`. In production
    // VTCADE_API_URL is the empty string on purpose (requests go to our own
    // origin and Vercel rewrites them onward), and `||` would treat that as
    // "unset" and send every request straight back to the cross-site URL.
    const API_URL = typeof global.VTCADE_API_URL === "string"
        ? global.VTCADE_API_URL
        : "https://vtcade.onrender.com";
    const SESSION_KEY = "vtcadeSession";
    const LEGACY_USER_KEY = "currentUser";
    // Set only for "CONTINUE AS GUEST". A guest has a display name (so the
    // dashboard and games have someone to greet) but no Supabase session, so
    // getAccessToken() always returns null for one and every authedFetch call
    // reaches the server with no bearer token, which is what makes a guest
    // unable to save a score without the frontend having to duplicate that
    // rule anywhere. This flag exists only to gate READING the leaderboard,
    // which requires no token and would otherwise work fine for a guest too.
    const GUEST_KEY = "vtcadeGuest";

    // Local, disposable, never sent anywhere. Just enough to label the runs
    // in a panel and on screen; collisions with a real username don't matter
    // because a guest is never in a position to write anything under it.
    function randomGuestName() {
        return "GUEST" + Math.floor(1000 + Math.random() * 9000);
    }

    // Marks this browser as a guest and returns the name it picked. Clears any
    // real session first: the two are mutually exclusive, and leaving a stale
    // token behind would let a later isGuest() check disagree with getUsername().
    function startGuestSession() {
        localStorage.removeItem(SESSION_KEY);
        const name = randomGuestName();
        localStorage.setItem(GUEST_KEY, "1");
        localStorage.setItem(LEGACY_USER_KEY, name);
        return name;
    }

    function isGuest() {
        return localStorage.getItem(GUEST_KEY) === "1";
    }

    function saveSession(session, username) {
        if (!session || !session.access_token) return;
        // A real sign-in always wins over a leftover guest flag from earlier in
        // the same browser.
        localStorage.removeItem(GUEST_KEY);
        const payload = {
            accessToken: session.access_token,
            refreshToken: session.refresh_token || null,
            // expires_at is seconds since epoch; fall back to expires_in.
            expiresAt: session.expires_at
                ? session.expires_at * 1000
                : Date.now() + (session.expires_in ? session.expires_in * 1000 : 3600 * 1000),
            username: username
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(payload));
        // Kept so existing screens that only display the name keep working.
        localStorage.setItem(LEGACY_USER_KEY, username);
    }

    function readSession() {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.accessToken) return null;
            return parsed;
        } catch (err) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }
    }

    function clearSession() {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
        localStorage.removeItem(GUEST_KEY);
    }

    // A guest has no entry in SESSION_KEY, so this falls straight through to the
    // name startGuestSession() put in LEGACY_USER_KEY - no separate guest branch
    // needed here.
    function getUsername() {
        const session = readSession();
        if (session && session.username) return session.username;
        return localStorage.getItem(LEGACY_USER_KEY);
    }

    // Returns a usable access token, refreshing it first if it is expired or
    // about to be. Returns null when the user needs to sign in again.
    async function getAccessToken() {
        const session = readSession();
        if (!session) return null;

        const stillValid = session.expiresAt && session.expiresAt - Date.now() > 60 * 1000;
        if (stillValid) return session.accessToken;

        if (!session.refreshToken) return null;

        try {
            const res = await fetch(`${API_URL}/api/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: session.refreshToken })
            });
            if (!res.ok) {
                clearSession();
                return null;
            }
            const data = await res.json();
            saveSession(data.session, data.username || session.username);
            return data.session.access_token;
        } catch (err) {
            // Network failure, keep the session and let the caller retry later.
            return session.accessToken;
        }
    }

    // fetch() wrapper that attaches the bearer token.
    async function authedFetch(path, options = {}) {
        const token = await getAccessToken();
        const headers = Object.assign({ "Content-Type": "application/json" }, options.headers || {});
        if (token) headers.Authorization = `Bearer ${token}`;
        return fetch(`${API_URL}${path}`, Object.assign({}, options, { headers }));
    }

    // Redirects to login when there is no usable session. Callers should stop
    // executing when this returns false.
    function requireLogin(loginPath) {
        if (getUsername()) return true;
        window.location.replace(loginPath);
        return false;
    }

    global.VTSession = {
        API_URL,
        saveSession,
        readSession,
        clearSession,
        getUsername,
        getAccessToken,
        authedFetch,
        requireLogin,
        startGuestSession,
        isGuest
    };
})(window);
