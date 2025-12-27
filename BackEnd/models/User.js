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
        required: function() {
            // Password required only if user is not using OAuth
            return !this.oauthProvider;
        },
        minlength: [6, "Password must be at least 6 characters"]
    },
    verified: { 
        type: Boolean, 
        default: false,
        index: true
    },
    verifyToken: { 
        type: String,
        index: true
    },
    // Optional: Add these for future features
    oauthProvider: {
        type: String,
        enum: ['google', 'github', null],
        default: null
    },
    oauthId: {
        type: String,
        sparse: true
    },
    resetPasswordToken: {
        type: String
    },
    resetPasswordExpires: {
        type: Date
    },
    lastLogin: {
        type: Date
    }
}, { 
    timestamps: true 
});

// Compound index for email verification
UserSchema.index({ email: 1, verified: 1 });

// Method to check if token is expired (useful for verification/reset tokens)
UserSchema.methods.isTokenExpired = function(expiresField) {
    if (!this[expiresField]) return false;
    return Date.now() > this[expiresField];
};

// Prevent OverwriteModelError
module.exports = mongoose.models.User || mongoose.model("User", UserSchema);