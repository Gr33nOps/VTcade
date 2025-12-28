const express = require("express");
const router = express.Router();
const Score = require("../models/Score");

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

        const newScore = await Score.create({
            username: username.trim(),
            game: game.trim(),
            score: numScore
        });

        res.json({ 
            message: "Score saved successfully",
            scoreId: newScore._id,
            score: newScore.score,
            timestamp: newScore.createdAt
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/user/:username", async (req, res) => {
    try {
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        if (!username) {
            return res.status(400).json({ message: "Username is required" });
        }

        const scores = await Score.find({ username: username.trim() })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v');

        res.json({
            username: username.trim(),
            scores,
            total: scores.length
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/game/:game", async (req, res) => {
    try {
        const { game } = req.params;
        const limit = parseInt(req.query.limit) || 100;

        if (!game) {
            return res.status(400).json({ message: "Game name is required" });
        }

        const scores = await Score.find({ game: game.trim() })
            .sort({ score: -1, createdAt: -1 })
            .limit(limit)
            .select('-__v');

        res.json({
            game: game.trim(),
            scores,
            total: scores.length
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/recent", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        const scores = await Score.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v');

        res.json({
            scores,
            total: scores.length
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.get("/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        if (!username || !game) {
            return res.status(400).json({ message: "Username and game are required" });
        }

        const scores = await Score.find({ 
            username: username.trim(), 
            game: game.trim() 
        })
            .sort({ score: -1, createdAt: -1 })
            .limit(limit)
            .select('-__v');

        res.json({
            username: username.trim(),
            game: game.trim(),
            scores,
            total: scores.length,
            bestScore: scores.length > 0 ? scores[0].score : 0
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

router.delete("/:scoreId", async (req, res) => {
    try {
        const { scoreId } = req.params;

        if (!scoreId) {
            return res.status(400).json({ message: "Score ID is required" });
        }

        const deleted = await Score.findByIdAndDelete(scoreId);

        if (!deleted) {
            return res.status(404).json({ message: "Score not found" });
        }

        res.json({ 
            message: "Score deleted successfully",
            scoreId 
        });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;