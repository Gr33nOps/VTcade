const router = require("express").Router();
const UserHighscore = require("../models/Highscore");

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

        const doc = await UserHighscore.findOneAndUpdate(
            { username: username.trim(), game: game.trim() },
            { $max: { highscore: numScore } },
            { upsert: true, new: true }
        );

        res.json({ 
            highscore: doc.highscore,
            isNewRecord: doc.highscore === numScore,
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

        console.log('Fetching all scores for user:', username);

        const scores = await UserHighscore.find({ 
            username: username.trim() 
        }).sort({ highscore: -1 });

        console.log('Found scores:', scores);

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

        const data = await UserHighscore.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

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