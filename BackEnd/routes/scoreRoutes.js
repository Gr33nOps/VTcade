const express = require("express");
const router = express.Router();
const Leaderboard = require("../models/leaderboard");

// Save or update high score
router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        if (!username || !game || score == null) {
            return res.status(400).json({ message: "Missing fields" });
        }

        const existing = await Leaderboard.findOne({ username, game });

        if (existing) {
            if (score > existing.score) {
                existing.score = score;
                await existing.save();
            }
            return res.json({ message: "Score updated" });
        }

        await Leaderboard.create({ username, game, score });
        res.json({ message: "Score saved" });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
