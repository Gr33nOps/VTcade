const express = require("express");
const { supabasePublic, supabaseAdmin } = require("../config/supabase");

const router = express.Router();

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

        const { data: existingUsername } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", username)
            .maybeSingle();

        if (existingUsername) {
            return res.status(400).json({ message: "Username already taken" });
        }

        // Email uniqueness, is_banned, etc. all fall out of Supabase Auth + the
        // on_auth_user_created trigger, which creates the profiles row atomically
        // with the auth user — no more orphaned accounts if this step fails midway.
        const { data: authData, error: authError } = await supabasePublic.auth.signUp({
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

        res.status(201).json({
            message: "Registration successful! Please check your email to verify your account.",
            username: username,
            requiresVerification: true
        });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ message: "Server error during signup" });
    }
});

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("email", email.toLowerCase())
            .maybeSingle();

        if (!profile) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (profile.is_banned) {
            return res.status(403).json({
                message: "Your account has been banned. Please contact support for assistance.",
                isBanned: true
            });
        }

        const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
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

        if (!profile.is_verified && authData.user.email_confirmed_at) {
            await supabaseAdmin
                .from("profiles")
                .update({ is_verified: true })
                .eq("id", profile.id);
        }

        res.json({
            message: "Login successful",
            username: profile.username,
            email: profile.email,
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

        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("is_banned")
            .eq("email", email.toLowerCase())
            .maybeSingle();

        if (profile && profile.is_banned) {
            return res.status(403).json({
                message: "Your account has been banned. Please contact support.",
                isBanned: true
            });
        }

        const { error } = await supabasePublic.auth.resend({
            type: 'signup',
            email: email.toLowerCase()
        });

        if (error) {
            return res.status(500).json({ message: error.message });
        }

        res.json({ message: "Verification email sent. Please check your inbox." });

    } catch (err) {
        console.error("Resend verification error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

router.post("/logout", async (req, res) => {
    try {
        const { error } = await supabasePublic.auth.signOut();

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

        await supabaseAdmin
            .from("profiles")
            .update({ is_verified: true })
            .eq("email", email.toLowerCase());

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
