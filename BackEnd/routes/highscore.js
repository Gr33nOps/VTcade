const router = require("express").Router();
const { supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const { requireUser } = require("../config/auth");

// The separate `highscores` table is gone. It stored the same fact as
// `leaderboard` — a player's best score per game — but was written by a
// different endpoint, so the two drifted apart and the public leaderboard ended
// up showing scores lower than players had actually achieved.
//
// These routes now read and write `leaderboard`. The response shapes are
// deliberately unchanged so the games and dashboard keep working as-is.

const MAX_SCORE = 1000000;

function validateScore(raw) {
    const num = Number(raw);
    if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > MAX_SCORE) {
        return null;
    }
    return num;
}

router.post("/save", requireUser, asyncRoute(async (req, res) => {
    const { game, score } = req.body;

    if (!game || typeof game !== "string" || score == null) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    const numScore = validateScore(score);
    if (numScore === null) {
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
        highscore: data.score,
        isNewRecord: data.is_new_highscore,
        message: "Highscore saved successfully"
    });
}));

router.get("/user/:username", asyncRoute(async (req, res) => {
    const { username } = req.params;

    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    const { data: scores, error } = await supabaseAdmin
        .from("leaderboard")
        .select("game, score")
        .eq("username", username.trim())
        .order("score", { ascending: false });

    if (error) throw error;

    res.json({
        username: username.trim(),
        scores: scores.map(s => ({
            game: s.game,
            highscore: s.score
        })),
        total: scores.length
    });
}));

router.get("/:username/:game", asyncRoute(async (req, res) => {
    const { username, game } = req.params;

    if (!username || !game) {
        return res.status(400).json({ message: "Username and game are required" });
    }

    const { data } = await supabaseAdmin
        .from("leaderboard")
        .select("score")
        .eq("username", username.trim())
        .eq("game", game.trim())
        .maybeSingle();

    res.json({
        highscore: data?.score || 0,
        username: username.trim(),
        game: game.trim(),
        exists: !!data
    });
}));

module.exports = router;
