const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const { ADMIN_USERNAME, signAdminToken, verifyAdminCredentials, requireAdmin } = require("../config/auth");

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
        return res.status(401).json({ message: "Invalid credentials" });
    }

    // Hand back a short-lived signed token. The password never leaves this
    // request and is never stored client-side.
    res.json({
        message: "Admin login successful",
        username: ADMIN_USERNAME,
        token: signAdminToken()
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

    // Deleting the auth user cascades to profiles, which cascades to leaderboard
    // (both have ON DELETE CASCADE foreign keys). highscores has no such FK
    // (matches the original schema), so it needs an explicit cleanup below.
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (deleteAuthError) throw deleteAuthError;

    const { error: highscoreError } = await supabaseAdmin
        .from("highscores")
        .delete()
        .eq("username", profile.username);
    if (highscoreError) throw highscoreError;

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

    res.json({ message: "Score removed" });
}));

router.delete("/leaderboards/reset/:game", requireAdmin, asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
        .from("leaderboard")
        .delete()
        .eq("game", req.params.game)
        .select("id");

    if (error) throw error;

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

    res.json({ message: "Maintenance mode enabled", maintenanceMode: true });
}));

router.put("/maintenance/disable", requireAdmin, asyncRoute(async (req, res) => {
    const { error } = await supabaseAdmin
        .from("system_settings")
        .update({ maintenance_mode: false })
        .eq("id", 1);

    if (error) throw error;

    res.json({ message: "Maintenance mode disabled", maintenanceMode: false });
}));

module.exports = router;
