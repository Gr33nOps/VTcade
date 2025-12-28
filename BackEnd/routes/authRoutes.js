// routes/authRoutes.js - Hybrid Approach
// Uses Supabase for auth/emails + MongoDB for game data
const express = require("express");
const { createClient } = require('@supabase/supabase-js');
const User = require("../models/User");

const router = express.Router();

// Initialize Supabase client (for auth only)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

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

        // Check if username already exists in MongoDB
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

        // Sign up with Supabase Auth (handles email verification)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.toLowerCase(),
            password: password,
            options: {
                data: {
                    username: username
                },
                emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/login.html`
            }
        });

        if (authError) {
            console.error("Supabase signup error:", authError.message);
            
            if (authError.message.includes('already registered')) {
                return res.status(400).json({ message: "Email already registered" });
            }
            
            return res.status(400).json({ message: authError.message });
        }

        // Create user in MongoDB (for game data)
        const mongoUser = new User({
            username,
            email: email.toLowerCase(),
            password: "SUPABASE_AUTH", // Not used - auth handled by Supabase
            isVerified: false, // Will be updated when Supabase confirms
            supabaseId: authData.user.id // Link to Supabase user
        });

        await mongoUser.save();
        console.log("✓ User created in MongoDB:", username);
        console.log("✓ Supabase verification email sent to:", email);

        // Return success response
        res.status(201).json({
            message: "Registration successful! Please check your email to verify your account.",
            username: username,
            requiresVerification: true
        });

    } catch (err) {
        console.error("Signup error:", err.message);
        res.status(500).json({ 
            message: "Server error during signup",
            detail: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
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

        // Authenticate with Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase(),
            password: password
        });

        if (authError) {
            console.log("Login failed:", authError.message);
            
            if (authError.message.includes('Email not confirmed')) {
                return res.status(403).json({ 
                    message: "Please verify your email before logging in. Check your inbox for the verification link.",
                    requiresVerification: true
                });
            }
            
            return res.status(401).json({ message: "Invalid email or password" });
        }

        // Get user from MongoDB
        const mongoUser = await User.findOne({ email: email.toLowerCase() });
        
        if (!mongoUser) {
            console.log("Login failed: User not found in MongoDB");
            return res.status(401).json({ message: "User not found" });
        }

        // Update verification status in MongoDB if needed
        if (!mongoUser.isVerified && authData.user.email_confirmed_at) {
            mongoUser.isVerified = true;
            await mongoUser.save();
            console.log("✓ Updated verification status in MongoDB");
        }

        console.log("✓ Login successful for:", mongoUser.username);

        res.json({
            message: "Login successful",
            username: mongoUser.username,
            email: mongoUser.email,
            session: authData.session // Include Supabase session for frontend
        });

    } catch (err) {
        console.error("Login error:", err.message);
        res.status(500).json({ 
            message: "Server error during login",
            detail: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
        });
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

        // Resend via Supabase
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email.toLowerCase()
        });

        if (error) {
            console.error("✗ Failed to resend verification email:", error.message);
            return res.status(500).json({ 
                message: error.message
            });
        }

        console.log("✓ Verification email resent to:", email);
        
        res.json({ message: "Verification email sent. Please check your inbox." });

    } catch (err) {
        console.error("Resend verification error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

// ==================== LOGOUT ====================
router.post("/logout", async (req, res) => {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            return res.status(500).json({ message: error.message });
        }
        
        res.json({ message: "Logged out successfully" });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// ==================== VERIFY EMAIL WEBHOOK (Optional) ====================
// This endpoint can be called by Supabase webhook when email is verified
router.post("/webhook/email-verified", async (req, res) => {
    try {
        const { email } = req.body;
        
        // Update MongoDB user verification status
        const user = await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { isVerified: true },
            { new: true }
        );
        
        if (user) {
            console.log("✓ Email verified for:", user.username);
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error("Webhook error:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;