const express = require("express");
const { createClient } = require('@supabase/supabase-js');
const User = require("../models/User");

const router = express.Router();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

router.post("/signup", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (username.length < 3 || username.length > 10) {
            return res.status(400).json({ message: "Username must be 3-10 characters" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const existingUser = await User.findOne({ 
            $or: [{ email: email.toLowerCase() }, { username }] 
        });

        if (existingUser) {
            if (existingUser.email === email.toLowerCase()) {
                return res.status(400).json({ message: "Email already registered" });
            }
            if (existingUser.username === username) {
                return res.status(400).json({ message: "Username already taken" });
            }
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email.toLowerCase(),
            password: password,
            options: {
                data: { username: username },
                emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/login.html`
            }
        });

        if (authError) {
            if (authError.message.includes('already registered')) {
                return res.status(400).json({ message: "Email already registered" });
            }
            return res.status(400).json({ message: authError.message });
        }

        const mongoUser = new User({
            username,
            email: email.toLowerCase(),
            password: "SUPABASE_AUTH",
            isVerified: false,
            isBanned: false, 
            supabaseId: authData.user.id
        });

        await mongoUser.save();

        res.status(201).json({
            message: "Registration successful! Please check your email to verify your account.",
            username: username,
            requiresVerification: true
        });

    } catch (err) {
        res.status(500).json({ message: "Server error during signup" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const mongoUser = await User.findOne({ email: email.toLowerCase() });
        
        if (!mongoUser) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (mongoUser.isBanned) {
            return res.status(403).json({ 
                message: "Your account has been banned. Please contact support for assistance.",
                isBanned: true
            });
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email.toLowerCase(),
            password: password
        });

        if (authError) {
            if (authError.message.includes('Email not confirmed')) {
                return res.status(403).json({ 
                    message: "Please verify your email before logging in.",
                    requiresVerification: true
                });
            }
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (!mongoUser.isVerified && authData.user.email_confirmed_at) {
            mongoUser.isVerified = true;
            await mongoUser.save();
        }

        res.json({
            message: "Login successful",
            username: mongoUser.username,
            email: mongoUser.email,
            session: authData.session
        });

    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ message: "Server error during login" });
    }
});

router.post("/resend-verification", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: "Email is required" });
        }

        const mongoUser = await User.findOne({ email: email.toLowerCase() });
        
        if (mongoUser && mongoUser.isBanned) {
            return res.status(403).json({ 
                message: "Your account has been banned. Please contact support.",
                isBanned: true
            });
        }

        const { error } = await supabase.auth.resend({
            type: 'signup',
            email: email.toLowerCase()
        });

        if (error) {
            return res.status(500).json({ message: error.message });
        }
        
        res.json({ message: "Verification email sent. Please check your inbox." });

    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
});

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

router.post("/webhook/email-verified", async (req, res) => {
    try {
        const { email } = req.body;
        
        await User.findOneAndUpdate(
            { email: email.toLowerCase() },
            { isVerified: true },
            { new: true }
        );
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;