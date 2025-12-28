// models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: [true, "Username is required"],
        trim: true,
        minlength: [3, "Username must be at least 3 characters"],
        maxlength: [30, "Username must be less than 30 characters"],
        unique: true,
        index: true,
        match: [/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"]
    },
    email: { 
        type: String, 
        required: [true, "Email is required"], 
        unique: true,
        trim: true,
        lowercase: true,
        index: true,
        match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"]
    },
    password: { 
        type: String,
        required: false, // Not required when using Supabase auth
        default: "SUPABASE_AUTH"
    },
    isVerified: { 
        type: Boolean, 
        default: false,
        index: true
    },
    // Link to Supabase user
    supabaseId: {
        type: String,
        unique: true,
        sparse: true,
        index: true
    },
    // Game-related data (add your game fields here)
    highScore: {
        type: Number,
        default: 0
    },
    gamesPlayed: {
        type: Number,
        default: 0
    },
    // Add any other game data you need
    
}, { 
    timestamps: true 
});

// Compound index for email verification
UserSchema.index({ email: 1, isVerified: 1 });

// Prevent OverwriteModelError
module.exports = mongoose.models.User || mongoose.model("User", UserSchema);