// models/leaderboard.js
const mongoose = require("mongoose");

const leaderboardSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: [true, "Username is required"],
        trim: true,
        minlength: [1, "Username cannot be empty"],
        maxlength: [50, "Username too long"],
        index: true
    },
    game: { 
        type: String, 
        required: [true, "Game name is required"],
        trim: true,
        minlength: [1, "Game name cannot be empty"],
        maxlength: [50, "Game name too long"],
        index: true
    },
    score: { 
        type: Number, 
        required: [true, "Score is required"],
        default: 0,
        min: [0, "Score cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Score must be an integer"
        }
    }
}, { 
    timestamps: true // Adds createdAt and updatedAt
});

// Compound index for preventing duplicate entries (one entry per user per game)
leaderboardSchema.index({ username: 1, game: 1 }, { unique: true });

// Index for leaderboard queries (sort by score descending)
leaderboardSchema.index({ game: 1, score: -1 });

// Index for finding user's rank efficiently
leaderboardSchema.index({ game: 1, username: 1, score: -1 });

// Prevent OverwriteModelError in development
module.exports = mongoose.models.Leaderboard || mongoose.model("Leaderboard", leaderboardSchema);