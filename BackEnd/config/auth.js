const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { supabaseAdmin } = require("./supabase");
const { logWarn } = require("./logger");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || "2h";

// Pinned, and checked again on the way back in. jsonwebtoken v9 already refuses
// `alg: none`, but stating the algorithm explicitly is what stops a token
// signed under some other algorithm from ever being considered.
const TOKEN_ALG = "HS256";
const TOKEN_ISSUER = "vtcade-api";
const TOKEN_AUDIENCE = "vtcade-admin";

function signAdminToken() {
    return jwt.sign({ role: "admin", username: ADMIN_USERNAME }, ADMIN_JWT_SECRET, {
        algorithm: TOKEN_ALG,
        expiresIn: ADMIN_TOKEN_TTL,
        issuer: TOKEN_ISSUER,
        audience: TOKEN_AUDIENCE,
        // Gives each session an identity, which is what makes logout able to
        // kill one token rather than every token.
        jwtid: crypto.randomUUID()
    });
}

// Hashing first means the comparison always runs over two 32-byte buffers, so
// it is constant time in the sense that matters. The previous version returned
// early when the lengths differed, which leaks the password's length through
// response timing, the one thing a "constant-time" compare must not do.
function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    const ha = crypto.createHash("sha256").update(a, "utf8").digest();
    const hb = crypto.createHash("sha256").update(b, "utf8").digest();
    return crypto.timingSafeEqual(ha, hb);
}

function verifyAdminCredentials(username, password) {
    return safeEqual(username || "", ADMIN_USERNAME) && safeEqual(password || "", ADMIN_PASSWORD);
}

// Tokens killed by an explicit logout, keyed by jti and holding the token's own
// expiry so the map drains itself instead of growing forever.
//
// Deliberately in-process. It covers "sign me out of this machine"; it does not
// pretend to survive a restart, and it does not need to, every entry would
// expire on its own within ADMIN_TOKEN_TTL, which is the real bound on how long
// a stolen token is worth anything. A durable denylist means a database read on
// every admin request, and that trade is not worth it at this size.
const revokedJti = new Map();

function pruneRevoked(nowMs) {
    for (const [jti, expSeconds] of revokedJti) {
        if (expSeconds * 1000 <= nowMs) revokedJti.delete(jti);
    }
}

function revokeAdminToken(payload) {
    if (!payload || !payload.jti || !payload.exp) return false;
    pruneRevoked(Date.now());
    revokedJti.set(payload.jti, payload.exp);
    return true;
}

// Exposed for the tests; nothing in the request path should need it.
function _resetRevoked() {
    revokedJti.clear();
}

// Well-known values that must never protect a production admin panel. The last
// one is the literal placeholder printed in the README, which is exactly the
// kind of thing that gets pasted into a real .env and left there.
const WEAK_ADMIN_PASSWORDS = new Set([
    "admin", "administrator", "password", "admin123", "123456", "12345678",
    "changeme", "letmein", "root", "toor", "vtcade", "choose_a_strong_password"
]);

// Returns a list of problems rather than throwing, and is called from server
// startup rather than at import time, the test suite requires these modules
// and should not have to satisfy production-grade secrets to do it.
function adminSecretProblems() {
    const problems = [];

    if (!ADMIN_JWT_SECRET || ADMIN_JWT_SECRET.length < 32) {
        problems.push(
            "ADMIN_JWT_SECRET is shorter than 32 characters. Anyone who guesses it can " +
            "mint their own admin tokens. Generate one with: " +
            "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\""
        );
    }
    if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12) {
        problems.push("ADMIN_PASSWORD is shorter than 12 characters.");
    }
    if (ADMIN_PASSWORD && WEAK_ADMIN_PASSWORDS.has(ADMIN_PASSWORD.toLowerCase())) {
        problems.push("ADMIN_PASSWORD is a well-known default or the README's placeholder.");
    }

    return problems;
}

function bearerToken(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// ---- Admin session cookie -------------------------------------------------
//
// The admin token used to be handed to the browser and kept in localStorage,
// where any injected script could read it. It now travels as an httpOnly
// cookie: JavaScript on the page cannot see it at all, so an XSS has nothing
// to steal. The raw token is never sent in a response body either.
//
// This only works because FrontEnd/vercel.json proxies /api through the
// frontend's own origin. Without that the cookie would be third-party and
// Safari and Firefox would drop it.
const ADMIN_COOKIE = "vtcade_admin";

function adminCookieOptions() {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        // Scoped so it is never attached to a player or public request.
        path: "/api/admin"
    };
}

// Signs a token, sets it as the session cookie, and returns only the metadata
// the panel legitimately needs. The token itself is deliberately not returned.
function issueAdminSession(res) {
    const token = signAdminToken();
    const decoded = jwt.decode(token);
    const expiresAt = decoded.exp * 1000;

    res.cookie(ADMIN_COOKIE, token, {
        ...adminCookieOptions(),
        expires: new Date(expiresAt)
    });

    return { expiresAt };
}

// clearCookie only matches when the attributes match what was set, path above all.
function endAdminSession(req, res) {
    if (req.admin) revokeAdminToken(req.admin);
    res.clearCookie(ADMIN_COOKIE, adminCookieOptions());
}

// Cookie first, Authorization header second. The header path is kept for curl,
// uptime checks and the test suite; it grants nothing the cookie doesn't, and
// a browser will never populate it now that the panel has no token to send.
function adminToken(req) {
    const fromCookie = req.cookies && req.cookies[ADMIN_COOKIE];
    return fromCookie || bearerToken(req);
}

// Admin routes: require a short-lived signed token issued by /api/admin/login.
// Replaces the old scheme where the admin's plaintext password was stored in
// localStorage and replayed as a header on every single request.
function requireAdmin(req, res, next) {
    const token = adminToken(req);
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    // One rejection message for every failure mode below, so probing cannot
    // tell "expired" from "forged" from "revoked".
    const reject = (reason) => {
        logWarn("requireAdmin", "rejected admin token", { reason, ip: req.ip });
        return res.status(401).json({ message: "Session expired. Please sign in again." });
    };

    let payload;
    try {
        payload = jwt.verify(token, ADMIN_JWT_SECRET, {
            algorithms: [TOKEN_ALG],
            issuer: TOKEN_ISSUER,
            audience: TOKEN_AUDIENCE
        });
    } catch (err) {
        return reject(err.name === "TokenExpiredError" ? "expired" : "invalid");
    }

    if (payload.role !== "admin") return reject("wrong-role");
    if (payload.jti && revokedJti.has(payload.jti)) return reject("revoked");

    req.admin = payload;
    next();
}

// Player routes: identity comes from a Supabase access token, verified against
// Supabase on every request. Previously the client simply asserted a username
// string, so anyone could submit scores as anyone else.
async function requireUser(req, res, next) {
    const token = bearerToken(req);
    if (!token) {
        return res.status(401).json({ message: "Authentication required" });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
        return res.status(401).json({ message: "Invalid or expired session" });
    }

    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, username, email, is_banned")
        .eq("id", data.user.id)
        .maybeSingle();

    if (!profile) {
        logWarn("requireUser", "authenticated user has no profile row", { id: data.user.id });
        return res.status(403).json({ message: "Account not found" });
    }

    if (profile.is_banned) {
        return res.status(403).json({ message: "Your account has been banned.", isBanned: true });
    }

    req.user = profile;
    next();
}

module.exports = {
    ADMIN_USERNAME,
    ADMIN_COOKIE,
    signAdminToken,
    verifyAdminCredentials,
    issueAdminSession,
    endAdminSession,
    revokeAdminToken,
    adminSecretProblems,
    requireAdmin,
    requireUser,
    _resetRevoked
};
