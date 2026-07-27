const jwt = require("jsonwebtoken");
const { supabaseAdmin } = require("./supabase");
const { logWarn } = require("./logger");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_TOKEN_TTL = process.env.ADMIN_TOKEN_TTL || "2h";

function signAdminToken() {
    return jwt.sign({ role: "admin", username: ADMIN_USERNAME }, ADMIN_JWT_SECRET, {
        expiresIn: ADMIN_TOKEN_TTL
    });
}

// Constant-time-ish comparison so admin password checks don't leak length/prefix
// information through response timing.
function safeEqual(a, b) {
    if (typeof a !== "string" || typeof b !== "string") return false;
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

function verifyAdminCredentials(username, password) {
    return safeEqual(username || "", ADMIN_USERNAME) && safeEqual(password || "", ADMIN_PASSWORD);
}

function bearerToken(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// Admin routes: require a short-lived signed token issued by /api/admin/login.
// Replaces the old scheme where the admin's plaintext password was stored in
// localStorage and replayed as a header on every single request.
function requireAdmin(req, res, next) {
    const token = bearerToken(req);
    if (!token) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const payload = jwt.verify(token, ADMIN_JWT_SECRET);
        if (payload.role !== "admin") throw new Error("wrong role");
        req.admin = payload;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Session expired. Please sign in again." });
    }
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
    signAdminToken,
    verifyAdminCredentials,
    requireAdmin,
    requireUser
};
