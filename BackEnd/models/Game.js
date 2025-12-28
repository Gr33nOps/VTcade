const mongoose = require("mongoose");

const gameSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        unique: true
    },
    genre: { 
        type: String,
        default: 'other'
    },
    description: {
        type: String
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User"
    },
    isActive: {
        type: Boolean,
        default: true
    },
    difficulty: {
        type: String,
        default: 'medium'
    },
    thumbnail: {
        type: String
    },
    playCount: {
        type: Number,
        default: 0
    },
    averageScore: {
        type: Number,
        default: 0
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.models.Game || mongoose.model("Game", gameSchema);