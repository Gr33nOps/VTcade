const mongoose = require("mongoose");

const ScoreSchema = new mongoose.Schema({
    username: String,
    game: String,
    score: Number,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model("Score", ScoreSchema);
