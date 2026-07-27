const express = require("express");
const { supabasePublic, supabaseAdmin } = require("../config/supabase");

const router = express.Router();

// Kicks off Google OAuth via Supabase's hosted authorize endpoint. A plain
// top-level redirect (not a fetch) so no CORS/SDK is needed on the frontend —
// consistent with the rest of this app's "backend does everything" pattern.
router.get("/google", (req, res) => {
    const redirectTo = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/oauth-callback.html`;
    const authorizeUrl = `${process.env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    res.redirect(authorizeUrl);
});

// The callback page lands here with the access_token Supabase issued after
// Google auth completed. We verify it server-side and hand back the same
// { username, email } shape the normal /login endpoint returns.
router.post("/google/session", async (req, res) => {
    try {
        const { access_token } = req.body;

        if (!access_token) {
            return res.status(400).json({ message: "Missing access token" });
        }

        const { data: { user }, error } = await supabaseAdmin.auth.getUser(access_token);

        if (error || !user) {
            return res.status(401).json({ message: "Invalid or expired session" });
        }

        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();

        if (!profile) {
            // Shouldn't happen — on_auth_user_created creates this atomically —
            // but fail safely rather than crash if it somehow does.
            return res.status(500).json({ message: "Profile not found for this account" });
        }

        if (profile.is_banned) {
            return res.status(403).json({
                message: "Your account has been banned. Please contact support for assistance.",
                isBanned: true
            });
        }

        res.json({
            message: "Login successful",
            username: profile.username,
            email: profile.email
        });

    } catch (err) {
        console.error("Google session error:", err);
        res.status(500).json({ message: "Server error during Google sign-in" });
    }
});

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
        const { error: authError } = await supabasePublic.auth.signUp({
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

// Password recovery. Without this a user who forgot their password had no way
// back into their account at all.
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || typeof email !== "string") {
            return res.status(400).json({ message: "Email is required" });
        }

        await supabasePublic.auth.resetPasswordForEmail(email.toLowerCase(), {
            redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/reset-password.html`
        });

        // Always report success. Distinguishing "sent" from "no such account"
        // would let anyone enumerate which emails are registered.
        res.json({ message: "If that email is registered, a reset link has been sent." });
    } catch (err) {
        console.error("Forgot password error:", err);
        res.json({ message: "If that email is registered, a reset link has been sent." });
    }
});

// Completes the reset using the recovery token from the emailed link.
router.post("/reset-password", async (req, res) => {
    try {
        const { access_token, password } = req.body;

        if (!access_token || !password) {
            return res.status(400).json({ message: "Token and new password are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(access_token);
        if (userError || !userData?.user) {
            return res.status(401).json({ message: "Reset link is invalid or has expired" });
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
            userData.user.id,
            { password }
        );
        if (updateError) throw updateError;

        res.json({ message: "Password updated. You can now sign in." });
    } catch (err) {
        console.error("Reset password error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// Exchanges a refresh token for a fresh access token so a long play session
// doesn't silently start failing score submissions after the token expires.
router.post("/refresh", async (req, res) => {
    try {
        const { refresh_token } = req.body;

        if (!refresh_token) {
            return res.status(400).json({ message: "Missing refresh token" });
        }

        const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token });

        if (error || !data?.session) {
            return res.status(401).json({ message: "Session expired. Please sign in again." });
        }

        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("username, is_banned")
            .eq("id", data.user.id)
            .maybeSingle();

        if (!profile) {
            return res.status(403).json({ message: "Account not found" });
        }
        if (profile.is_banned) {
            return res.status(403).json({ message: "Your account has been banned.", isBanned: true });
        }

        res.json({ session: data.session, username: profile.username });
    } catch (err) {
        console.error("Refresh error:", err);
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
