const mongoose = require("mongoose");

const leaderboardSchema = new mongoose.Schema({
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
        required: true,
        default: 0
    }
}, { 
    timestamps: true
});

leaderboardSchema.index({ username: 1, game: 1 }, { unique: true });
leaderboardSchema.index({ game: 1, score: -1 });

module.exports = mongoose.models.Leaderboard || mongoose.model("Leaderboard", leaderboardSchema);