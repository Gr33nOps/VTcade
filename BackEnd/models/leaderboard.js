const mongoose = require("mongoose");

const leaderboardSchema = new mongoose.Schema({
    username: { type: String, required: true },
    game: { type: String, required: true },
    score: { type: Number, required: true }
});

// Prevent OverwriteModelError
module.exports =
    mongoose.models.Leaderboard ||
    mongoose.model("Leaderboard", leaderboardSchema);
