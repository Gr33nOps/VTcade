const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const {
    ADMIN_USERNAME,
    verifyAdminCredentials,
    issueAdminSession,
    endAdminSession,
    requireAdmin
} = require("../config/auth");
const { logAudit, logWarn } = require("../config/logger");

// Who did what, from where. Called on every route below that changes state.
function audit(req, action, detail = {}) {
    logAudit(action, (req.admin && req.admin.username) || "unknown", {
        ip: req.ip,
        ...detail
    });
}

function mapUser(u) {
    return {
        id: u.id,
        username: u.username,
        email: u.email,
        isVerified: u.is_verified,
        isBanned: u.is_banned,
        createdAt: u.created_at
    };
}

function mapGame(g) {
    return {
        id: g.id,
        title: g.title,
        genre: g.genre,
        description: g.description,
        createdBy: g.created_by,
        isActive: g.is_active,
        difficulty: g.difficulty,
        thumbnail: g.thumbnail,
        playCount: g.play_count,
        averageScore: g.average_score,
        createdAt: g.created_at,
        updatedAt: g.updated_at
    };
}

function mapLeaderboardEntry(e) {
    return {
        id: e.id,
        userId: e.user_id,
        username: e.username,
        game: e.game,
        score: e.score,
        isFlagged: e.is_flagged,
        createdAt: e.created_at,
        updatedAt: e.updated_at
    };
}

const USER_COLUMNS = "id, username, email, is_verified, is_banned, created_at";

router.post("/login", asyncRoute(async (req, res) => {
    const { username, password } = req.body;

    if (!verifyAdminCredentials(username, password)) {
        // Log the attempt, never the password. Without this a brute-force run
        // against the one password guarding every destructive endpoint on the
        // site was completely invisible.
        logWarn("admin.login", "failed admin login", {
            ip: req.ip,
            username: typeof username === "string" ? username.slice(0, 64) : null
        });
        return res.status(401).json({ message: "Invalid credentials" });
    }

    // The session goes back as an httpOnly cookie and nothing else. The token
    // itself is never in the response body, so there is no point at which the
    // browser's JavaScript has ever held it, which is what makes an XSS on
    // this page unable to walk off with an admin session.
    //
    // expiresAt is not sensitive: it is only so the panel can show a timeout
    // and stop rendering a session the server has already stopped honouring.
    const { expiresAt } = issueAdminSession(res);

    logAudit("admin.login", typeof username === "string" ? username : "unknown", { ip: req.ip });
    res.json({
        message: "Admin login successful",
        username: ADMIN_USERNAME,
        expiresAt
    });
}));

// Signing out now actually ends the session: the token is revoked server-side
// AND the cookie is cleared. The panel used to just drop the token from
// localStorage, which left it valid for the rest of its TTL, so "log out" on
// a shared machine was cosmetic.
router.post("/logout", requireAdmin, asyncRoute(async (req, res) => {
    endAdminSession(req, res);
    audit(req, "admin.logout");
    res.json({ message: "Signed out" });
}));

// Confirms what the server believes the client's address is. The Vercel rewrite
// puts an extra proxy in front of Render's, and if `trust proxy` is set too low
// every request looks like it came from one address, which silently collapses
// the per-IP rate limiter into a global one and locks everybody out together.
// Admin-gated, and it reveals nothing the caller doesn't already know.
router.get("/diagnostics/ip", requireAdmin, asyncRoute(async (req, res) => {
    res.json({
        seenIp: req.ip,
        forwardedFor: req.headers["x-forwarded-for"] || null,
        trustProxyHops: Number(process.env.TRUST_PROXY_HOPS || 4)
    });
}));

router.get("/stats", requireAdmin, asyncRoute(async (req, res) => {
    const { count: userCount } = await supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true });

    const { count: gameCount } = await supabaseAdmin
        .from("games")
        .select("*", { count: "exact", head: true });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { count: scoresToday } = await supabaseAdmin
        .from("leaderboard")
        .select("*", { count: "exact", head: true })
        .gte("updated_at", startOfToday.toISOString());

    const { data: settings, error: settingsError } = await supabaseAdmin
        .from("system_settings")
        .select("maintenance_mode")
        .eq("id", 1)
        .single();

    if (settingsError) throw settingsError;

    res.json({
        users: userCount || 0,
        games: gameCount || 0,
        scoresToday: scoresToday || 0,
        maintenanceMode: settings.maintenance_mode,
        status: settings.maintenance_mode ? "MAINTENANCE" : "ONLINE"
    });
}));

router.get("/users", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select(USER_COLUMNS)
        .order("created_at", { ascending: false });

    if (error) throw error;

    const users = data.map(mapUser);
    res.json({ users, total: users.length });
}));

router.put("/users/:id/ban", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({ is_banned: true })
        .eq("id", req.params.id)
        .select(USER_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "User not found" });

    audit(req, "user.ban", { userId: data.id, username: data.username });
    res.json({ message: "User banned", user: mapUser(data) });
}));

router.put("/users/:id/unban", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("profiles")
        .update({ is_banned: false })
        .eq("id", req.params.id)
        .select(USER_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "User not found" });

    audit(req, "user.unban", { userId: data.id, username: data.username });
    res.json({ message: "User unbanned", user: mapUser(data) });
}));

router.delete("/users/:id", requireAdmin, asyncRoute(async (req, res) => {
    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("username")
        .eq("id", req.params.id)
        .maybeSingle();

    if (!profile) {
        return res.status(404).json({ message: "User not found" });
    }

    // Deleting the auth user cascades to profiles, which cascades to leaderboard.
    // The manual `highscores` cleanup that used to live here is gone with that
    // table, it needed it precisely because it had no foreign key, which is how
    // it drifted out of sync with the leaderboard in the first place.
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (deleteAuthError) throw deleteAuthError;

    audit(req, "user.delete", { userId: req.params.id, username: profile.username });
    res.json({ message: "User deleted successfully" });
}));

router.get("/games", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("games")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) throw error;

    const games = data.map(mapGame);
    res.json({ games, total: games.length });
}));

router.put("/games/:id/enable", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("games")
        .update({ is_active: true })
        .eq("id", req.params.id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Game not found" });

    audit(req, "game.enable", { gameId: data.id, title: data.title });
    res.json({ message: "Game enabled", game: mapGame(data) });
}));

router.put("/games/:id/disable", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("games")
        .update({ is_active: false })
        .eq("id", req.params.id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Game not found" });

    audit(req, "game.disable", { gameId: data.id, title: data.title });
    res.json({ message: "Game disabled", game: mapGame(data) });
}));

router.get("/leaderboards", requireAdmin, asyncRoute(async (req, res) => {
    const { game } = req.query;

    let query = supabaseAdmin
        .from("leaderboard")
        .select("*")
        .order("score", { ascending: false })
        .limit(100);

    if (game) query = query.eq("game", game);

    const { data, error } = await query;
    if (error) throw error;

    const leaderboards = data.map(mapLeaderboardEntry);
    res.json({ leaderboards, total: leaderboards.length });
}));

router.delete("/leaderboards/:id", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("leaderboard")
        .delete()
        .eq("id", req.params.id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Entry not found" });

    audit(req, "score.delete", { entryId: data.id, username: data.username, game: data.game, score: data.score });
    res.json({ message: "Score removed" });
}));

router.delete("/leaderboards/reset/:game", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("leaderboard")
        .delete()
        .eq("game", req.params.game)
        .select("id");

    if (error) throw error;

    // The single most destructive thing in the panel: it wipes every score for
    // a game with no undo. It must never happen without a record.
    audit(req, "leaderboard.reset", { game: req.params.game, deletedCount: data.length });
    res.json({
        message: "Leaderboard reset",
        deletedCount: data.length
    });
}));

router.put("/leaderboards/:id/flag", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("leaderboard")
        .update({ is_flagged: true })
        .eq("id", req.params.id)
        .select()
        .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ message: "Entry not found" });

    audit(req, "score.flag", { entryId: data.id, username: data.username, game: data.game });
    res.json({ message: "Score flagged", entry: mapLeaderboardEntry(data) });
}));

router.get("/maintenance", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("system_settings")
        .select("maintenance_mode")
        .eq("id", 1)
        .single();

    if (error) throw error;

    res.json({ maintenanceMode: data.maintenance_mode });
}));

router.put("/maintenance/enable", requireAdmin, asyncRoute(async (req, res) => {
    const { error } = await supabaseAdmin
        .from("system_settings")
        .update({ maintenance_mode: true })
        .eq("id", 1);

    if (error) throw error;

    audit(req, "maintenance.enable");
    res.json({ message: "Maintenance mode enabled", maintenanceMode: true });
}));

router.put("/maintenance/disable", requireAdmin, asyncRoute(async (req, res) => {
    const { error } = await supabaseAdmin
        .from("system_settings")
        .update({ maintenance_mode: false })
        .eq("id", 1);

    if (error) throw error;

    audit(req, "maintenance.disable");
    res.json({ message: "Maintenance mode disabled", maintenanceMode: false });
}));

module.exports = router;
