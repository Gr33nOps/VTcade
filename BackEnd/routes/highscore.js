const router = require("express").Router();
const UserHighscore = require("../models/Highscore.js");

// SAVE (ONLY IF HIGHER)
router.post("/save", async (req, res) => {
    try {
        const { username, game, score } = req.body;

        if (!username || !game || score == null) {
            return res.status(400).json({ message: "Missing fields" });
        }

        // Convert score to number to be safe
        const numScore = Number(score);
        
        if (isNaN(numScore)) {
            return res.status(400).json({ message: "Invalid score" });
        }

        console.log(`Saving highscore for ${username} in ${game}: ${numScore}`);

        const doc = await UserHighscore.findOneAndUpdate(
            { username, game },
            { $max: { highscore: numScore } },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        console.log(`Highscore result: ${doc.highscore}`);

        res.json({ highscore: doc.highscore });
    } catch (err) {
        console.error("Highscore save error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

// LOAD
router.get("/:username/:game", async (req, res) => {
    try {
        const { username, game } = req.params;

        console.log(`Loading highscore for ${username} in ${game}`);

        const data = await UserHighscore.findOne({ username, game });

        const highscore = data?.highscore || 0;
        
        console.log(`Highscore found: ${highscore}`);

        res.json({ highscore });
    } catch (err) {
        console.error("Highscore load error:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;