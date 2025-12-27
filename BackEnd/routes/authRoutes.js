const router = require("express").Router();
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const sendVerificationEmail = require("../utils/email");

// ---------------- SIGNUP ----------------
router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Validate inputs
        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }
        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        // Check if email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "Email already registered" });

        // Hash password
        const hashed = await bcrypt.hash(password, 10);

        // Create verification token
        const token = crypto.randomBytes(32).toString("hex");

        // Create user with verified=false
        const user = await User.create({
            username,
            email,
            password: hashed,
            verified: false,
            verifyToken: token
        });

        // Send verification email
        await sendVerificationEmail(email, token);

        res.json({ message: "Signup successful! Check your email to verify your account." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// ---------------- VERIFY EMAIL ----------------
router.get("/verify-email", async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).send("Invalid token");

        const user = await User.findOne({ verifyToken: token });
        if (!user) return res.status(400).send("Invalid or expired token");

        user.verified = true;
        user.verifyToken = undefined;  // Remove token
        await user.save();

        res.send("Email verified successfully! You can now login.");
    } catch (err) {
        console.error(err);
        res.status(500).send("Server error");
    }
});

// ---------------- LOGIN ----------------
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "Email not registered" });

        if (!user.verified) {
            return res.status(400).json({ message: "Please verify your email first" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ message: "Incorrect password" });

        res.json({ username: user.username });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
