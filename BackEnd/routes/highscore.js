const router = require("express").Router();
const { supabaseAdmin } = require("../config/supabase");

router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        if (!username || !game || score == null) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const numScore = Number(score);

        if (isNaN(numScore) || numScore < 0) {
            return res.status(400).json({ message: "Invalid score" });
        }

        const { data, error } = await supabaseAdmin
            .rpc("submit_highscore", {
                p_username: username.trim(),
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

    } catch (err) {
        console.error('Highscore save error:', err);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/user/:username", async (req, res) => {
    try {
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

    } catch (err) {
        console.error('Highscore fetch error:', err);
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/:username/:game", async (req, res) => {
    try {
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

    } catch (err) {
        console.error('Highscore single game fetch error:', err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
