// routes/scoreRoutes.js
const express = require("express");
const router = express.Router();
const Score = require("../models/Score");

// SAVE SCORE (creates new score entry each time)
router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        console.log("Score save request:", { username, game, score });

        // Validation
        if (!username || !game || score == null) {
            console.log("Score save failed: Missing fields");
            return res.status(400).json({ message: "Missing required fields: username, game, score" });
        }

        if (typeof username !== 'string' || username.trim().length === 0) {
            return res.status(400).json({ message: "Invalid username" });
        }

        if (typeof game !== 'string' || game.trim().length === 0) {
            return res.status(400).json({ message: "Invalid game name" });
        }

        const numScore = Number(score);
        
        if (isNaN(numScore)) {
            return res.status(400).json({ message: "Score must be a valid number" });
        }

        if (numScore < 0) {
            return res.status(400).json({ message: "Score cannot be negative" });
        }

        console.log(`Saving score for ${username} in ${game}: ${numScore}`);

        // Create new score entry
        const newScore = await Score.create({
            username: username.trim(),
            game: game.trim(),
            score: numScore
        });

        console.log(`✓ Score saved successfully: ${newScore._id}`);

        res.json({ 
            message: "Score saved successfully",
            scoreId: newScore._id,
            score: newScore.score,
            timestamp: newScore.createdAt
        });

    } catch (err) {
        console.error("Score save error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error while saving score", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET ALL SCORES FOR A USER
router.get("/user/:username", async (req, res) => {
    try {
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        console.log(`Loading scores for user: ${username}`);

        if (!username || username.trim().length === 0) {
            return res.status(400).json({ message: "Username is required" });
        }

        const scores = await Score.find({ username: username.trim() })
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v');

        console.log(`✓ Found ${scores.length} scores for ${username}`);

        res.json({
            username: username.trim(),
            scores,
            total: scores.length
        });

    } catch (err) {
        console.error("User scores load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading scores", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET ALL SCORES FOR A GAME
router.get("/game/:game", async (req, res) => {
    try {
        const { game } = req.params;
        const limit = parseInt(req.query.limit) || 100;

        console.log(`Loading scores for game: ${game}`);

        if (!game || game.trim().length === 0) {
            return res.status(400).json({ message: "Game name is required" });
        }

        const scores = await Score.find({ game: game.trim() })
            .sort({ score: -1, createdAt: -1 })
            .limit(limit)
            .select('-__v');

        console.log(`✓ Found ${scores.length} scores for game ${game}`);

        res.json({
            game: game.trim(),
            scores,
            total: scores.length
        });

    } catch (err) {
        console.error("Game scores load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading game scores", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET RECENT SCORES (all users, all games)
router.get("/recent", async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;

        console.log(`Loading ${limit} recent scores`);

        const scores = await Score.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('-__v');

        console.log(`✓ Found ${scores.length} recent scores`);

        res.json({
            scores,
            total: scores.length
        });

    } catch (err) {
        console.error("Recent scores load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading recent scores", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET USER'S SCORES FOR A SPECIFIC GAME
router.get("/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        console.log(`Loading scores for ${username} in ${game}`);

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

        console.log(`✓ Found ${scores.length} scores for ${username} in ${game}`);

        res.json({
            username: username.trim(),
            game: game.trim(),
            scores,
            total: scores.length,
            bestScore: scores.length > 0 ? scores[0].score : 0
        });

    } catch (err) {
        console.error("User game scores load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading user game scores", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// DELETE A SCORE (optional - for admin/cleanup)
router.delete("/:scoreId", async (req, res) => {
    try {
        const { scoreId } = req.params;

        console.log(`Deleting score: ${scoreId}`);

        if (!scoreId) {
            return res.status(400).json({ message: "Score ID is required" });
        }

        const deleted = await Score.findByIdAndDelete(scoreId);

        if (!deleted) {
            console.log("Score not found:", scoreId);
            return res.status(404).json({ message: "Score not found" });
        }

        console.log(`✓ Score deleted: ${scoreId}`);

        res.json({ 
            message: "Score deleted successfully",
            scoreId 
        });

    } catch (err) {
        console.error("Score delete error:", err.message);
        res.status(500).json({ 
            message: "Server error while deleting score", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

module.exports = router;