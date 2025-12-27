// routes/highscore.js
const router = require("express").Router();
const UserHighscore = require("../models/Highscore");

// SAVE HIGHSCORE (ONLY IF HIGHER)
router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        console.log("Highscore save request:", { username, game, score });

        // Validation
        if (!username || !game || score == null) {
            console.log("Highscore save failed: Missing fields");
            return res.status(400).json({ message: "Missing required fields: username, game, score" });
        }

        // Validate username is not empty string
        if (typeof username !== 'string' || username.trim().length === 0) {
            console.log("Highscore save failed: Invalid username");
            return res.status(400).json({ message: "Invalid username" });
        }

        // Validate game is not empty string
        if (typeof game !== 'string' || game.trim().length === 0) {
            console.log("Highscore save failed: Invalid game");
            return res.status(400).json({ message: "Invalid game name" });
        }

        // Convert score to number and validate
        const numScore = Number(score);
        
        if (isNaN(numScore)) {
            console.log("Highscore save failed: Invalid score format");
            return res.status(400).json({ message: "Score must be a valid number" });
        }

        if (numScore < 0) {
            console.log("Highscore save failed: Negative score");
            return res.status(400).json({ message: "Score cannot be negative" });
        }

        console.log(`Saving highscore for ${username} in ${game}: ${numScore}`);

        // Use $max to only update if new score is higher
        const doc = await UserHighscore.findOneAndUpdate(
            { username: username.trim(), game: game.trim() },
            { $max: { highscore: numScore } },
            { 
                upsert: true, 
                new: true, 
                setDefaultsOnInsert: true,
                runValidators: true 
            }
        );

        if (!doc) {
            console.error("Highscore save failed: Document not created");
            return res.status(500).json({ message: "Failed to save highscore" });
        }

        console.log(`✓ Highscore saved successfully: ${doc.highscore} for ${username} in ${game}`);

        res.json({ 
            highscore: doc.highscore,
            isNewRecord: doc.highscore === numScore,
            message: "Highscore saved successfully"
        });

    } catch (err) {
        console.error("Highscore save error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error while saving highscore", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// LOAD HIGHSCORE
router.get("/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;

        console.log(`Loading highscore for ${username} in ${game}`);

        // Validation
        if (!username || !game) {
            console.log("Highscore load failed: Missing parameters");
            return res.status(400).json({ message: "Username and game are required" });
        }

        if (username.trim().length === 0 || game.trim().length === 0) {
            console.log("Highscore load failed: Empty parameters");
            return res.status(400).json({ message: "Username and game cannot be empty" });
        }

        const data = await UserHighscore.findOne({ 
            username: username.trim(), 
            game: game.trim() 
        });

        const highscore = data?.highscore || 0;
        
        console.log(`✓ Highscore loaded: ${highscore} for ${username} in ${game}`);

        res.json({ 
            highscore,
            username: username.trim(),
            game: game.trim(),
            exists: !!data
        });

    } catch (err) {
        console.error("Highscore load error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error while loading highscore", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// GET ALL HIGHSCORES FOR A USER (optional but useful)
router.get("/user/:username", async (req, res) => {
    try {
        const { username } = req.params;

        console.log(`Loading all highscores for ${username}`);

        if (!username || username.trim().length === 0) {
            return res.status(400).json({ message: "Username is required" });
        }

        const scores = await UserHighscore.find({ 
            username: username.trim() 
        }).sort({ highscore: -1 });

        console.log(`✓ Found ${scores.length} highscores for ${username}`);

        res.json({ 
            username: username.trim(),
            scores: scores.map(s => ({
                game: s.game,
                highscore: s.highscore
            })),
            total: scores.length
        });

    } catch (err) {
        console.error("User highscores load error:", err.message);
        res.status(500).json({ 
            message: "Server error while loading user highscores", 
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

module.exports = router;