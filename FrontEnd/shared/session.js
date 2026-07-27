// Shared player session handling.
//
// Identity used to be nothing more than a username string in localStorage, so
// anyone could edit it and submit scores as another player. The backend now
// requires a real Supabase access token, and this module is what stores,
// refreshes, and attaches it.

(function (global) {
    const API_URL = global.VTCADE_API_URL || "https://vtcade.onrender.com";
    const SESSION_KEY = "vtcadeSession";
    const LEGACY_USER_KEY = "currentUser";

    function saveSession(session, username) {
        if (!session || !session.access_token) return;
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
    }

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
            // Network failure — keep the session and let the caller retry later.
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
        requireLogin
    };
})(window);
