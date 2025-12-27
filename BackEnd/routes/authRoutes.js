// routes/authRoutes.js
const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const sendVerificationEmail = require("../utils/email");

const router = express.Router();

// ==================== SIGNUP ====================
router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        console.log("Signup request received:", { username, email });

        // Validation
        if (!username || !email || !password) {
            console.log("Signup failed: Missing fields");
            return res.status(400).json({ message: "All fields are required" });
        }

        // Validate username length
        if (username.length < 3 || username.length > 10) {
            console.log("Signup failed: Invalid username length");
            return res.status(400).json({ message: "Username must be 3-10 characters" });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.log("Signup failed: Invalid email format");
            return res.status(400).json({ message: "Invalid email format" });
        }

        // Validate password length
        if (password.length < 6) {
            console.log("Signup failed: Password too short");
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ 
            $or: [{ email: email.toLowerCase() }, { username }] 
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                console.log("Signup failed: Email already exists");
                return res.status(400).json({ message: "Email already registered" });
            }
            if (existingUser.username === username) {
                console.log("Signup failed: Username already exists");
                return res.status(400).json({ message: "Username already taken" });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user object (but don't save yet)
        const user = new User({
            username,
            email: email.toLowerCase(),
            password: hashedPassword,
            isVerified: false
        });

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        user.verificationToken = verificationToken;
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

        // TRY TO SEND EMAIL FIRST
        console.log("Attempting to send verification email...");
        try {
            await sendVerificationEmail(email, verificationToken);
            console.log("✓ Verification email sent successfully to:", email);
        } catch (emailErr) {
            console.error("✗ Email sending failed:", emailErr.message);
            
            // OPTION 1: Fail the signup if email fails (STRICT)
            // Uncomment this if you want email verification to be mandatory
            /*
            return res.status(500).json({ 
                message: "Failed to send verification email. Please try again later.",
                detail: process.env.NODE_ENV === 'production' ? 'Email service unavailable' : emailErr.message 
            });
            */
            
            // OPTION 2: Allow signup but warn about email (LENIENT)
            // This allows users to play immediately even if email fails
            console.log("⚠ Email failed but continuing with signup");
            user.isVerified = true; // Auto-verify since email failed
        }

        // Save user to database
        await user.save();
        console.log("✓ User created successfully:", username);

        // Return success response
        res.status(201).json({
            message: user.isVerified 
                ? "Registration successful! You can now login." 
                : "Registration successful! Please check your email to verify your account.",
            username: user.username,
            requiresVerification: !user.isVerified
        });

    } catch (err) {
        console.error("Signup error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error during signup",
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// ==================== LOGIN ====================
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        console.log("Login request received for:", email);

        // Validation
        if (!email || !password) {
            console.log("Login failed: Missing fields");
            return res.status(400).json({ message: "Email and password are required" });
        }

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            console.log("Login failed: User not found");
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        
        if (!isPasswordValid) {
            console.log("Login failed: Invalid password");
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Check if email is verified
        if (!user.isVerified) {
            console.log("Login failed: Email not verified");
            return res.status(403).json({ 
                message: "Please verify your email before logging in. Check your inbox for the verification link.",
                requiresVerification: true
            });
        }

        console.log("✓ Login successful for:", user.username);

        res.json({
            message: "Login successful",
            username: user.username,
            email: user.email
        });

    } catch (err) {
        console.error("Login error:", err.message);
        console.error("Full error:", err);
        res.status(500).json({ 
            message: "Server error during login",
            detail: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
        });
    }
});

// ==================== EMAIL VERIFICATION ====================
router.get("/verify-email", async (req, res) => {
    try {
        const { token } = req.query;

        console.log("Email verification request received");

        if (!token) {
            console.log("Verification failed: No token provided");
            return res.status(400).send(`
                <html>
                <head><title>Verification Failed</title></head>
                <body style="background: black; color: #00ff00; font-family: 'Courier New', monospace; text-align: center; padding: 50px;">
                    <h1>Verification Failed</h1>
                    <p>Invalid verification link.</p>
                </body>
                </html>
            `);
        }

        // Find user with this token
        const user = await User.findOne({
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            console.log("Verification failed: Invalid or expired token");
            return res.status(400).send(`
                <html>
                <head><title>Verification Failed</title></head>
                <body style="background: black; color: #ff0000; font-family: 'Courier New', monospace; text-align: center; padding: 50px;">
                    <h1>Verification Failed</h1>
                    <p>This verification link is invalid or has expired.</p>
                    <p>Please request a new verification email.</p>
                </body>
                </html>
            `);
        }

        // Mark user as verified
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        console.log("✓ Email verified successfully for:", user.username);

        res.send(`
            <html>
            <head><title>Email Verified</title></head>
            <body style="background: black; color: #00ff00; font-family: 'Courier New', monospace; text-align: center; padding: 50px;">
                <h1>✓ Email Verified Successfully!</h1>
                <p>Your account has been verified. You can now log in.</p>
                <p><a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/login.html" style="color: #00ff00;">Click here to login</a></p>
            </body>
            </html>
        `);

    } catch (err) {
        console.error("Verification error:", err.message);
        res.status(500).send(`
            <html>
            <head><title>Verification Error</title></head>
            <body style="background: black; color: #ff0000; font-family: 'Courier New', monospace; text-align: center; padding: 50px;">
                <h1>Verification Error</h1>
                <p>An error occurred during verification. Please try again later.</p>
            </body>
            </html>
        `);
    }
});

// ==================== RESEND VERIFICATION EMAIL ====================
router.post("/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        console.log("Resend verification request for:", email);

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const user = await User.findOne({ email: email.toLowerCase() });

        if (!user) {
            console.log("Resend failed: User not found");
            return res.status(404).json({ message: "User not found" });
        }

        if (user.isVerified) {
            console.log("Resend failed: User already verified");
            return res.status(400).json({ message: "Email is already verified" });
        }

        // Generate new token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        user.verificationToken = verificationToken;
        user.verificationTokenExpires = Date.now() + 24 * 60 * 60 * 1000;
        await user.save();

        // Send email
        try {
            await sendVerificationEmail(email, verificationToken);
            console.log("✓ Verification email resent to:", email);
            
            res.json({ message: "Verification email sent. Please check your inbox." });
        } catch (emailErr) {
            console.error("✗ Failed to resend verification email:", emailErr.message);
            res.status(500).json({ 
                message: "Failed to send verification email. Please try again later." 
            });
        }

    } catch (err) {
        console.error("Resend verification error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;