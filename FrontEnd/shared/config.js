// Single source of truth for the API base URL. This string used to be
// hardcoded separately in eight different files.
//
// In production the value is deliberately EMPTY. FrontEnd/vercel.json rewrites
// /api/* through to the Render backend, so every request is same-origin — which
// is what lets the admin session ride in a first-party SameSite=Strict cookie
// instead of a third-party one that Safari and Firefox would drop.
//
// vercel.json is strict JSON with no room to explain itself, so this is the
// note: that rewrite is load bearing. Removing it does not just add a network
// hop, it breaks admin sign-in in Safari and Firefox. See README > Deployment.
//
// Local development has no such rewrite, so point straight at a local backend.
// Change the port here if yours differs.
(function (global) {
    const host = global.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

    global.VTCADE_API_URL = isLocal ? "http://localhost:5000" : "";
})(window);
