// models/Highscore.js
const mongoose = require("mongoose");

const UserHighscoreSchema = new mongoose.Schema({
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
    highscore: { 
        type: Number, 
        required: true, 
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

// Compound index for fast lookups (prevents duplicates + speeds up queries)
UserHighscoreSchema.index({ username: 1, game: 1 }, { unique: true });

// Index for querying all scores by game
UserHighscoreSchema.index({ game: 1, highscore: -1 });

// Prevent OverwriteModelError in development
module.exports = mongoose.models.Highscore || mongoose.model("Highscore", UserHighscoreSchema);