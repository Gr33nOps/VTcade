const express = require("express");
const router = express.Router();
const Leaderboard = require("../models/leaderboard");

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

        const existing = await Leaderboard.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

        let isNewHighscore = false;
        let savedScore = numScore;

        if (existing) {
            if (numScore > existing.score) {
                existing.score = numScore;
                await existing.save();
                isNewHighscore = true;
            } else {
                savedScore = existing.score;
            }
        } else {
            await Leaderboard.create({ 
                username: username.trim(), 
                game: game.trim(), 
                score: numScore 
            });
            isNewHighscore = true;
        }

        res.json({ 
            message: isNewHighscore ? "New highscore!" : "Score saved",
            score: savedScore,
            isNewHighscore
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/:game", async (req, res) => {
    try {
        const { game } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        if (!game) {
            return res.status(400).json({ message: "Game name is required" });
        }

        const scores = await Leaderboard.find({ game: game.trim() })
            .sort({ score: -1 })
            .limit(limit)
            .select('username score createdAt -_id');

        res.json({
            game: game.trim(),
            leaderboard: scores.map((entry, index) => ({
                rank: index + 1,
                username: entry.username,
                score: entry.score,
                date: entry.createdAt
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

        const entry = await Leaderboard.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

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

        const userEntry = await Leaderboard.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

        if (!userEntry) {
            return res.json({
                username: username.trim(),
                game: game.trim(),
                rank: null,
                score: 0,
                message: "No score recorded"
            });
        }

        const higherScoresCount = await Leaderboard.countDocuments({
            game: game.trim(),
            score: { $gt: userEntry.score }
        });

        const rank = higherScoresCount + 1;

        res.json({
            username: username.trim(),
            game: game.trim(),
            rank,
            score: userEntry.score,
            totalPlayers: await Leaderboard.countDocuments({ game: game.trim() })
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/", async (req, res) => {
    try {
        const games = await Leaderboard.distinct('game');

        res.json({
            games,
            total: games.length
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;