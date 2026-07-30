const { createClient } = require("@supabase/supabase-js");

// Public client: mirrors what a browser would use. Only for supabase.auth.* calls
// (signUp / signInWithPassword / resend), never for table access.
//
// persistSession is off, and that is load bearing, not tidiness. This is ONE
// client shared by every request the server handles, and with the default
// setting it kept the session of whoever signed in last. Anything acting on
// "the current session" then acted on a stranger's: POST /api/auth/logout
// called signOut() on this client and revoked that player's refresh tokens,
// so an unauthenticated request could sign a real user out. Every auth call
// here now names the token it is operating on.
const supabasePublic = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
);

// Admin client: service_role key, bypasses RLS. Used for every table read/write
// and for supabase.auth.admin.* calls (e.g. deleteUser). Server-side only -
// this key must never reach the frontend.
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabasePublic, supabaseAdmin };
