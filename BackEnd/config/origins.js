// Which origins are ours, and the CSRF backstop that uses them.
//
// Both used to live inline in server.js, which meant the cross-origin rule
// could only be exercised by booting the whole app.

const { logWarn } = require("./logger");

// Locked to the known frontends instead of a bare cors(), which reflected any
// origin back at the caller.
const allowedOrigins = [
    process.env.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "http://127.0.0.1:5500"
].filter(Boolean);

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CSRF backstop for the admin session cookie.
//
// SameSite=Strict is the real defence: a browser will not attach the cookie to
// a request originating from another site, so the classic hidden-form attack
// never carries credentials in the first place. This catches the residue — an
// older browser that ignores SameSite, or a future change that loosens it.
//
// Requests with NO Origin header pass on purpose. CSRF requires a browser, and
// browsers always send Origin on cross-site state-changing requests; curl and
// server-to-server callers send none at all. Failing open on a missing header
// means a proxy that strips it can never lock an admin out of their own panel,
// while a forged cross-site request — which cannot suppress Origin — is still
// refused.
function requireSameOrigin(req, res, next) {
    if (!MUTATING_METHODS.has(req.method)) return next();

    const origin = req.headers.origin;
    if (origin && !allowedOrigins.includes(origin)) {
        logWarn("csrf", "blocked cross-origin admin mutation", {
            origin,
            path: req.originalUrl,
            ip: req.ip
        });
        return res.status(403).json({ message: "Cross-origin request refused" });
    }

    next();
}

module.exports = { allowedOrigins, requireSameOrigin };
