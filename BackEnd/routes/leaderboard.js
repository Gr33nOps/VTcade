const express = require("express");
const router = express.Router();
const Leaderboard = require("../models/leaderboard");

// Save or update highscore
router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        if (!username || !game || score == null) {
            return res.status(400).json({ message: "Missing fields" });
        }

        // Check if user already has a highscore
        const existing = await Leaderboard.findOne({ username, game });

        if (existing) {
            // Update only if new score is higher
            if (score > existing.score) {
                existing.score = score;
                await existing.save();
            }
            return res.json({ message: "Score updated" });
        }

        // Create a new score entry
        await Leaderboard.create({ username, game, score });
        res.json({ message: "Score saved" });

    } catch (err) {
        console.log(err);
        res.status(500).json({ message: "Server error" });
    }
});

// Get TOP leaderboard
router.get("/:game", async (req, res) => {
    const game = req.params.game;
    const scores = await Leaderboard.find({ game }).sort({ score: -1 }).limit(5);
    res.json(scores);
});

// Get personal highscore for user
router.get("/user/highscore/:username/:game", async (req, res) => {
    const { username, game } = req.params;

    const entry = await Leaderboard.findOne({ username, game });

    res.json({
        highscore: entry ? entry.score : 0
    });
});

module.exports = router;
