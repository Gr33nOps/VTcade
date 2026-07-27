const router = require("express").Router();
const { supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const { requireUser } = require("../config/auth");

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

    // Identity comes from the verified token, never from the request body —
    // the client used to just name whichever user it wanted to score for.
    const { data, error } = await supabaseAdmin
        .rpc("submit_highscore", {
            p_username: req.user.username,
            p_game: game.trim(),
            p_score: numScore
        })
        .single();

    if (error) throw error;

    res.json({
        highscore: data.highscore,
        isNewRecord: data.is_new_record,
        message: "Highscore saved successfully"
    });
}));

router.get("/user/:username", asyncRoute(async (req, res) => {
    const { username } = req.params;

    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    const { data: scores, error } = await supabaseAdmin
        .from("highscores")
        .select("game, highscore")
        .eq("username", username.trim())
        .order("highscore", { ascending: false });

    if (error) throw error;

    res.json({
        username: username.trim(),
        scores: scores.map(s => ({
            game: s.game,
            highscore: s.highscore
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
        .from("highscores")
        .select("highscore")
        .eq("username", username.trim())
        .eq("game", game.trim())
        .maybeSingle();

    res.json({
        highscore: data?.highscore || 0,
        username: username.trim(),
        game: game.trim(),
        exists: !!data
    });
}));

module.exports = router;
