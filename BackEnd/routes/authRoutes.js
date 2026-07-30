const express = require("express");
const { supabasePublic, supabaseAdmin } = require("../config/supabase");
const asyncRoute = require("../config/asyncRoute");
const { logWarn, logError } = require("../config/logger");

const router = express.Router();

// Same rules the two screens apply before they submit, restated here because a
// client-side check is a courtesy, not a control. The point of validating here
// is the message: without it, a mistyped address came back as Supabase's own
// "Unable to validate email address: invalid format", which tells a player
// nothing about what to change.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Usernames are drawn into fixed-width leaderboards and into a <pre>, so the
// character set is deliberately narrow. Length matches what the UI allows.
const USERNAME_RE = /^[A-Za-z0-9_-]{3,20}$/;

// Trimmed as well as lower-cased. A pasted address routinely carries a trailing
// space, and lower-casing alone left that space in the value we looked the
// account up by, which turned a correct password into "invalid email".
function normaliseEmail(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function bearerToken(req) {
    const header = req.headers.authorization || "";
    return header.startsWith("Bearer ") ? header.slice(7) : null;
}

// `_` and `%` are wildcards to ilike, and `_` is a legal username character, so
// they are escaped to match literally. Postgres LIKE treats backslash as the
// escape character by default.
function likeLiteral(value) {
    return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

// Ends a session we have decided not to hand out, and every other session that
// account has. Best effort: the caller has already made its decision and must
// not fail because the revocation did.
async function revokeSession(accessToken) {
    if (!accessToken) return;
    try {
        // Returns its failures rather than throwing, so both have to be handled.
        const { error } = await supabaseAdmin.auth.admin.signOut(accessToken, "global");
        if (error) logWarn("auth.revokeSession", "could not revoke session", { reason: error.message });
    } catch (err) {
        logWarn("auth.revokeSession", "could not revoke session", { reason: err.message });
    }
}

// The profiles row is normally created by the on_auth_user_created trigger, in
// the same transaction as the auth user. Accounts created before that trigger
// existed have no row, and every one of them was locked out of the site: login
// looked the profile up FIRST and answered a missing row with "Invalid email or
// password", so no password could ever work and nothing said why. This creates
// the row the trigger would have created.
async function ensureProfile(user) {
    const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

    if (existing) return existing;

    logWarn("auth.ensureProfile", "authenticated user had no profile row", { id: user.id });

    const meta = user.user_metadata || {};
    const base = String(meta.username || (user.email || "").split("@")[0] || "player")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, 20) || "player";

    // username is unique, so fall back through suffixed candidates.
    for (let attempt = 0; attempt < 5; attempt++) {
        const suffix = attempt === 0 ? "" : String(attempt + 1);
        const candidate = base.slice(0, 20 - suffix.length) + suffix;

        const { data, error } = await supabaseAdmin
            .from("profiles")
            .insert({
                id: user.id,
                username: candidate,
                email: normaliseEmail(user.email),
                is_verified: !!user.email_confirmed_at
            })
            .select("*")
            .single();

        if (!error) return data;
        if (error.code !== "23505") throw error;      // not a unique violation

        // Another request may have won the race and created the row.
        const { data: raced } = await supabaseAdmin
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .maybeSingle();
        if (raced) return raced;
    }

    return null;
}

// Supabase confirms the address; profiles.is_verified is our own mirror of that
// and used to drift, because only the password login path ever updated it.
async function syncVerified(profile, user) {
    if (profile.is_verified || !user.email_confirmed_at) return profile;

    await supabaseAdmin
        .from("profiles")
        .update({ is_verified: true })
        .eq("id", profile.id);

    return { ...profile, is_verified: true };
}

const BANNED_MESSAGE = "Your account has been banned. Please contact support for assistance.";

// Kicks off Google OAuth via Supabase's hosted authorize endpoint. A plain
// top-level redirect (not a fetch) so no CORS/SDK is needed on the frontend -
// consistent with the rest of this app's "backend does everything" pattern.
router.get("/google", (req, res) => {
    const redirectTo = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/oauth-callback.html`;
    const authorizeUrl = `${process.env.SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
    res.redirect(authorizeUrl);
});

// Adopts a session Supabase issued somewhere other than our own login form: the
// Google callback, and the link in a confirmation email. Both arrive at a page
// with an access_token in the URL fragment and nothing else; this verifies it
// server-side and hands back the same { username, email } shape /login returns.
//
// Nothing about it was ever Google-specific, and it is now mounted at both paths:
// /session for what it does, /google/session because the callback page in the
// wild still posts there.
const adoptSession = asyncRoute(async (req, res) => {
    const { access_token } = req.body;

    if (!access_token) {
        return res.status(400).json({ message: "Missing access token" });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(access_token);

    if (error || !data?.user) {
        return res.status(401).json({ message: "Invalid or expired session" });
    }

    let profile = await ensureProfile(data.user);
    if (!profile) {
        return res.status(500).json({ message: "Could not load your player profile" });
    }

    if (profile.is_banned) {
        await revokeSession(access_token);
        return res.status(403).json({ message: BANNED_MESSAGE, isBanned: true });
    }

    // Both routes into here mean the address is confirmed: Google vouches for it,
    // and the emailed link cannot be followed without receiving it. Nothing used
    // to record that, so these profiles sat at is_verified = false forever.
    profile = await syncVerified(profile, data.user);

    res.json({
        message: "Login successful",
        username: profile.username,
        email: profile.email
    });
});

router.post("/session", adoptSession);
router.post("/google/session", adoptSession);

router.post("/signup", asyncRoute(async (req, res) => {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = normaliseEmail(req.body.email);
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!username || !email || !password) {
        return res.status(400).json({ message: "All fields are required" });
    }

    if (!USERNAME_RE.test(username)) {
        return res.status(400).json({
            message: "Username must be 3-20 characters: letters, numbers, - and _ only"
        });
    }

    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: "That is not a valid email address" });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Case-insensitively: the unique index is case-sensitive, so "Dazai47" and
    // "dazai47" were both allowed to exist, and on a leaderboard they read as
    // the same player twice.
    const { data: taken } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", likeLiteral(username))
        .limit(1);

    if (taken && taken.length) {
        return res.status(400).json({ message: "Username already taken" });
    }

    // Email uniqueness, is_banned, etc. all fall out of Supabase Auth + the
    // on_auth_user_created trigger, which creates the profiles row atomically
    // with the auth user, no more orphaned accounts if this step fails midway.
    const { data: signUpData, error: authError } = await supabasePublic.auth.signUp({
        email,
        password,
        options: {
            data: { username },
            emailRedirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/login.html`
        }
    });

    if (authError) {
        const message = authError.message || "";

        if (/already registered|already exists/i.test(message)) {
            return res.status(400).json({ message: "Email already registered" });
        }

        // What GoTrue reports when the trigger's insert fails, which in practice
        // means the username was taken between the check above and this call.
        if (/database error saving new user/i.test(message)) {
            logError("auth.signup", authError);
            return res.status(409).json({
                message: "Could not create that account. The username may have just been taken - try another."
            });
        }

        return res.status(400).json({ message });
    }

    // Supabase deliberately answers a signup for an address that already exists
    // with a normal looking user whose `identities` array is empty, so that
    // nobody can enumerate accounts. Taken at face value it means we tell the
    // player to go and check an inbox that will never receive anything, which is
    // exactly how someone ends up locked out of an account they own.
    const identities = signUpData?.user?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
        return res.status(400).json({
            message: "That email is already registered. Sign in instead, or use FORGOT PASSWORD.",
            emailInUse: true
        });
    }

    // With email confirmations on (how the project is configured) there is no
    // session yet and the player has to confirm first. If they are ever turned
    // off, Supabase hands back a real session here, and passing it on is what
    // lets the new account save a score: a username in localStorage with no
    // token behind it cannot authenticate anything.
    const session = signUpData?.session || null;

    res.status(201).json({
        message: session
            ? "Registration successful!"
            : "Registration successful! Please check your email to verify your account.",
        username,
        requiresVerification: !session,
        session
    });
}));

router.post("/login", asyncRoute(async (req, res) => {
    const email = normaliseEmail(req.body.email);
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
    }

    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: "That is not a valid email address" });
    }

    // Authenticate FIRST, then look at the profile. The old order did the
    // reverse and it cost two things: a missing profiles row became a password
    // that could never be right, and the ban check answered anyone who asked,
    // before they had shown they owned the address at all.
    const { data: authData, error: authError } = await supabasePublic.auth.signInWithPassword({
        email,
        password
    });

    if (authError) {
        const message = authError.message || "";
        if (/not confirmed|confirm your (email|account)/i.test(message)) {
            return res.status(403).json({
                message: "Please verify your email before logging in.",
                requiresVerification: true
            });
        }
        return res.status(401).json({ message: "Invalid email or password" });
    }

    let profile = await ensureProfile(authData.user);
    if (!profile) {
        logError("auth.login", new Error("could not create a profile row for a signed-in user"));
        return res.status(500).json({ message: "Could not load your player profile" });
    }

    if (profile.is_banned) {
        // The sign-in above minted a real session. Do not leave it working for
        // an account we have just refused.
        await revokeSession(authData.session?.access_token);
        return res.status(403).json({ message: BANNED_MESSAGE, isBanned: true });
    }

    profile = await syncVerified(profile, authData.user);

    res.json({
        message: "Login successful",
        username: profile.username,
        email: profile.email,
        session: authData.session
    });
}));

router.post("/resend-verification", asyncRoute(async (req, res) => {
    const email = normaliseEmail(req.body.email);

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: "That is not a valid email address" });
    }

    const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("is_banned")
        .eq("email", email)
        .maybeSingle();

    if (profile && profile.is_banned) {
        return res.status(403).json({ message: BANNED_MESSAGE, isBanned: true });
    }

    const { error } = await supabasePublic.auth.resend({ type: 'signup', email });

    if (error) {
        const message = error.message || "";
        if (/already (been )?confirmed/i.test(message)) {
            return res.status(400).json({
                message: "That email is already verified. You can sign in."
            });
        }
        // Rate limiting is the common one here, and Supabase's own wording says
        // how long to wait, so it is worth passing through.
        return res.status(400).json({ message });
    }

    res.json({ message: "Verification email sent. Please check your inbox." });
}));

// Password recovery. Without this a user who forgot their password had no way
// back into their account at all.
router.post("/forgot-password", async (req, res) => {
    const email = normaliseEmail(req.body.email);

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    // A malformed address is the caller's own typo, not information about who
    // has an account, so this one is safe to answer honestly.
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: "That is not a valid email address" });
    }

    try {
        await supabasePublic.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login/reset-password.html`
        });
    } catch (err) {
        logError("auth.forgotPassword", err);
    }

    // Always report success. Distinguishing "sent" from "no such account"
    // would let anyone enumerate which emails are registered.
    res.json({ message: "If that email is registered, a reset link has been sent." });
});

// Completes the reset using the recovery token from the emailed link.
router.post("/reset-password", asyncRoute(async (req, res) => {
    const { access_token, password } = req.body;

    if (!access_token || !password) {
        return res.status(400).json({ message: "Token and new password are required" });
    }

    if (typeof password !== "string" || password.length < 6) {
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

    // Anyone still holding a session on this account got in with the OLD
    // password. Changing it has to end those too, or a reset does not actually
    // lock anybody out.
    await revokeSession(access_token);

    res.json({ message: "Password updated. You can now sign in." });
}));

// Exchanges a refresh token for a fresh access token so a long play session
// doesn't silently start failing score submissions after the token expires.
router.post("/refresh", asyncRoute(async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({ message: "Missing refresh token" });
    }

    const { data, error } = await supabasePublic.auth.refreshSession({ refresh_token });

    if (error || !data?.session) {
        return res.status(401).json({ message: "Session expired. Please sign in again." });
    }

    const profile = await ensureProfile(data.user);
    if (!profile) {
        return res.status(403).json({ message: "Account not found" });
    }
    if (profile.is_banned) {
        await revokeSession(data.session.access_token);
        return res.status(403).json({ message: BANNED_MESSAGE, isBanned: true });
    }

    res.json({ session: data.session, username: profile.username });
}));

// Ends the caller's own session, named by the token they present.
//
// This used to call signOut() on the shared server-side client, which holds
// whichever session signed in last: an unauthenticated stranger could POST here
// and revoke a real player's refresh tokens, signing them out of the site. The
// shared client no longer keeps a session at all (see config/supabase.js), and
// this now says whose session it is ending.
//
// Always 200: the client clears its own storage either way, and telling a caller
// that logging out failed gives them nothing to do about it.
router.post("/logout", async (req, res) => {
    const token = bearerToken(req);
    if (token) await revokeSession(token);
    res.json({ message: "Logged out successfully" });
});

// Optional hook for a Supabase "email confirmed" webhook to keep our
// is_verified mirror in step.
//
// It used to take any email from any caller and mark it verified, with no
// authentication of any kind: an unauthenticated write to a user record. It now
// needs a shared secret, and with EMAIL_WEBHOOK_SECRET unset (the current
// state, since nothing is configured to call this) it is closed entirely. The
// login and Google paths keep the flag in step on their own, so nothing depends
// on this being open.
router.post("/webhook/email-verified", asyncRoute(async (req, res) => {
    const secret = process.env.EMAIL_WEBHOOK_SECRET;
    if (!secret || req.get("x-webhook-secret") !== secret) {
        logWarn("auth.webhook", "rejected email-verified webhook", { ip: req.ip });
        return res.status(401).json({ message: "Unauthorized" });
    }

    const email = normaliseEmail(req.body.email);

    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }

    await supabaseAdmin
        .from("profiles")
        .update({ is_verified: true })
        .eq("email", email);

    res.json({ success: true });
}));

module.exports = router;
