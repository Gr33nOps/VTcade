const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String },
    verified: { type: Boolean, default: false },   // Email verification status
    verifyToken: { type: String }                  // Token to verify email
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);