// routes/leaderboard.js
const express = require("express");
const router = express.Router();
const Leaderboard = require("../models/leaderboard");

// SAVE OR UPDATE HIGHSCORE
router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        console.log("Leaderboard save request:", { username, game, score });

        // Validation
        if (!username || !game || score == null) {
            console.log("Leaderboard save failed: Missing fields");
            return res.status(400).json({ message: "Missing required fields: username, game, score" });
        }

        // Validate username
        if (typeof username !== 'string' || username.trim().length === 0) {
            console.log("Leaderboard save failed: Invalid username");
            return res.status(400).json({ message: "Invalid username" });
        }

        // Validate game
        if (typeof game !== 'string' || game.trim().length === 0) {
            console.log("Leaderboard save failed: Invalid game");
            return res.status(400).json({ message: "Invalid game name" });
        }

        // Convert and validate score
        const numScore = Number(score);
        
        if (isNaN(numScore)) {
            console.log("Leaderboard save failed: Invalid score format");
            return res.status(400).json({ message: "Score must be a valid number" });
        }

        if (numScore < 0) {
            console.log("Leaderboard save failed: Negative score");
            return res.status(400).json({ message: "Score cannot be negative" });
        }

        console.log(`Processing leaderboard entry for ${username} in ${game}: ${numScore}`);

        // Check if user already has a highscore
        const existing = await Leaderboard.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

        let isNewHighscore = false;
        let savedScore = numScore;

        if (existing) {
            // Update only if new score is higher
            if (numScore > existing.score) {
                console.log(`Updating score from ${existing.score} to ${numScore}`);
                existing.score = numScore;
                await existing.save();
                isNewHighscore = true;
                savedScore = numScore;
            } else {
                console.log(`Score ${numScore} not higher than existing ${existing.score}, keeping existing`);
                savedScore = existing.score;
            }
        } else {
            // Create a new score entry
            console.log("Creating new leaderboard entry");
            await Leaderboard.create({ 
                username: username.trim(), 
                game: game.trim(), 
                score: numScore 
            });
            isNewHighscore = true;
        }

        console.log(`✓ Leaderboard updated for ${username} in ${game}`);

        res.json({ 
            message: isNewHighscore ? "New highscore!" : "Score saved",
            score: savedScore,
            isNewHighscore
        });

    } catch (err) {
        console.error("Leaderboard save error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error while saving to leaderboard", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET TOP LEADERBOARD SCORES
router.get("/:game", async (req, res) => {
    try {
        const { game } = req.params;
        const limit = parseInt(req.query.limit) || 10; // Default to top 10

        console.log(`Loading leaderboard for ${game} (limit: ${limit})`);

        // Validation
        if (!game || game.trim().length === 0) {
            console.log("Leaderboard load failed: Invalid game");
            return res.status(400).json({ message: "Game name is required" });
        }

        if (limit < 1 || limit > 100) {
            return res.status(400).json({ message: "Limit must be between 1 and 100" });
        }

        const scores = await Leaderboard.find({ game: game.trim() })
            .sort({ score: -1 })
            .limit(limit)
            .select('username score createdAt -_id');

        console.log(`✓ Found ${scores.length} leaderboard entries for ${game}`);

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
        console.error("Leaderboard load error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error while loading leaderboard", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET PERSONAL HIGHSCORE FOR USER
router.get("/user/highscore/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;

        console.log(`Loading personal highscore for ${username} in ${game}`);

        // Validation
        if (!username || !game) {
            console.log("Personal highscore load failed: Missing parameters");
            return res.status(400).json({ message: "Username and game are required" });
        }

        if (username.trim().length === 0 || game.trim().length === 0) {
            console.log("Personal highscore load failed: Empty parameters");
            return res.status(400).json({ message: "Username and game cannot be empty" });
        }

        const entry = await Leaderboard.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

        const highscore = entry ? entry.score : 0;

        console.log(`✓ Personal highscore loaded: ${highscore} for ${username} in ${game}`);

        res.json({
            username: username.trim(),
            game: game.trim(),
            highscore,
            exists: !!entry
        });

    } catch (err) {
        console.error("Personal highscore load error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error while loading personal highscore", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET USER'S RANK IN LEADERBOARD
router.get("/rank/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;

        console.log(`Loading rank for ${username} in ${game}`);

        if (!username || !game || username.trim().length === 0 || game.trim().length === 0) {
            return res.status(400).json({ message: "Username and game are required" });
        }

        const userEntry = await Leaderboard.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

        if (!userEntry) {
            console.log(`User ${username} has no score in ${game}`);
            return res.json({
                username: username.trim(),
                game: game.trim(),
                rank: null,
                score: 0,
                message: "No score recorded"
            });
        }

        // Count how many scores are higher
        const higherScoresCount = await Leaderboard.countDocuments({
            game: game.trim(),
            score: { $gt: userEntry.score }
        });

        const rank = higherScoresCount + 1;

        console.log(`✓ Rank loaded: ${rank} for ${username} in ${game}`);

        res.json({
            username: username.trim(),
            game: game.trim(),
            rank,
            score: userEntry.score,
            totalPlayers: await Leaderboard.countDocuments({ game: game.trim() })
        });

    } catch (err) {
        console.error("Rank load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading rank", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET ALL GAMES WITH LEADERBOARDS
router.get("/", async (req, res) => {
    try {
        console.log("Loading all games with leaderboards");

        const games = await Leaderboard.distinct('game');

        console.log(`✓ Found ${games.length} games with leaderboards`);

        res.json({
            games,
            total: games.length
        });

    } catch (err) {
        console.error("Games list load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading games list", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

module.exports = router;