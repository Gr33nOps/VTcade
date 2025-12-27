// models/Score.js
const mongoose = require("mongoose");

const ScoreSchema = new mongoose.Schema({
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
        min: [0, "Score cannot be negative"],
        validate: {
            validator: Number.isInteger,
            message: "Score must be an integer"
        }
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Compound indexes for common queries
ScoreSchema.index({ username: 1, game: 1 });
ScoreSchema.index({ game: 1, score: -1 });
ScoreSchema.index({ game: 1, createdAt: -1 });

// Prevent OverwriteModelError
module.exports = mongoose.models.Score || mongoose.model("Score", ScoreSchema);