const mongoose = require("mongoose");

const ScoreSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true
    },
    game: { 
        type: String, 
        required: true
    },
    score: { 
        type: Number, 
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

ScoreSchema.index({ username: 1, game: 1 });
ScoreSchema.index({ game: 1, score: -1 });

module.exports = mongoose.models.Score || mongoose.model("Score", ScoreSchema);