const mongoose = require("mongoose");

const LeaderboardSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
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
    isFlagged: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("Leaderboard", LeaderboardSchema);