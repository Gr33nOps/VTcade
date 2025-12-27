// models/Game.js
const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: [true, "Game title is required"],
        trim: true,
        minlength: [1, "Title cannot be empty"],
        maxlength: [100, "Title too long"],
        unique: true,
        index: true
    },
    genre: { 
        type: String,
        trim: true,
        enum: {
            values: ['action', 'puzzle', 'arcade', 'adventure', 'strategy', 'sports', 'racing', 'other'],
            message: '{VALUE} is not a valid genre'
        },
        default: 'other'
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, "Description too long"]
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User",
        index: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    thumbnail: {
        type: String,
        trim: true
    },
    playCount: {
        type: Number,
        default: 0,
        min: 0
    },
    averageScore: {
        type: Number,
        default: 0,
        min: 0
    }
}, { 
    timestamps: true 
});

// Index for popular games queries
gameSchema.index({ playCount: -1 });
gameSchema.index({ genre: 1, isActive: 1 });

// Virtual for game URL slug
gameSchema.virtual('slug').get(function() {
    return this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
});

// Method to increment play count
gameSchema.methods.incrementPlayCount = async function() {
    this.playCount += 1;
    await this.save();
};

// Prevent OverwriteModelError
module.exports = mongoose.models.Game || mongoose.model("Game", gameSchema);