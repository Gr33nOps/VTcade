const express = require("express");
const router = express.Router();
const { supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const { requireUser } = require("../config/auth");

const MAX_SCORE = 1000000;

router.post("/save", requireUser, asyncRoute(async (req, res) => {
    const { game, score } = req.body;

    if (!game || typeof game !== "string" || score == null) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const numScore = Number(score);
    if (!Number.isFinite(numScore) || !Number.isInteger(numScore) || numScore < 0 || numScore > MAX_SCORE) {
        return res.status(400).json({ message: "Invalid score" });
    }

    // Identity comes from the verified token, never from the request body.
    const { data, error } = await supabaseAdmin
        .rpc("submit_leaderboard_score", {
            p_user_id: req.user.id,
            p_username: req.user.username,
            p_game: game.trim(),
            p_score: numScore
        })
        .single();

    if (error) throw error;

    res.json({
        message: data.is_new_highscore ? "New highscore!" : "Score saved",
        score: data.score,
        isNewHighscore: data.is_new_highscore
    });
}));

router.get("/:game", async (req, res) => {
    try {
        const { game } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        if (!game) {
            return res.status(400).json({ message: "Game name is required" });
        }

        const { data: scores, error } = await supabaseAdmin
            .from("leaderboard")
            .select("username, score, created_at")
            .eq("game", game.trim())
            .order("score", { ascending: false })
            .limit(limit);

        if (error) throw error;

        res.json({
            game: game.trim(),
            leaderboard: scores.map((entry, index) => ({
                rank: index + 1,
                username: entry.username,
                score: entry.score,
                date: entry.created_at
            })),
            total: scores.length
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/user/highscore/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;

        if (!username || !game) {
            return res.status(400).json({ message: "Username and game are required" });
        }

        const { data: entry } = await supabaseAdmin
            .from("leaderboard")
            .select("score")
            .eq("username", username.trim())
            .eq("game", game.trim())
            .maybeSingle();

        res.json({
            username: username.trim(),
            game: game.trim(),
            highscore: entry ? entry.score : 0,
            exists: !!entry
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/rank/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;

        if (!username || !game) {
            return res.status(400).json({ message: "Username and game are required" });
        }

        const { data: userEntry } = await supabaseAdmin
            .from("leaderboard")
            .select("score")
            .eq("username", username.trim())
            .eq("game", game.trim())
            .maybeSingle();

        if (!userEntry) {
            return res.json({
                username: username.trim(),
                game: game.trim(),
                rank: null,
                score: 0,
                message: "No score recorded"
            });
        }

        const { count: higherScoresCount } = await supabaseAdmin
            .from("leaderboard")
            .select("*", { count: "exact", head: true })
            .eq("game", game.trim())
            .gt("score", userEntry.score);

        const { count: totalPlayers } = await supabaseAdmin
            .from("leaderboard")
            .select("*", { count: "exact", head: true })
            .eq("game", game.trim());

        res.json({
            username: username.trim(),
            game: game.trim(),
            rank: (higherScoresCount || 0) + 1,
            score: userEntry.score,
            totalPlayers: totalPlayers || 0
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/", async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from("leaderboard")
            .select("game");

        if (error) throw error;

        const games = [...new Set(data.map(row => row.game))];

        res.json({
            games,
            total: games.length
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
