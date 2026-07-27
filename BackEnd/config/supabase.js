const { createClient } = require("@supabase/supabase-js");

// Public client: mirrors what a browser would use. Only for supabase.auth.* calls
// (signUp / signInWithPassword / resend / signOut) — never for table access.
const supabasePublic = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Admin client: service_role key, bypasses RLS. Used for every table read/write
// and for supabase.auth.admin.* calls (e.g. deleteUser). Server-side only —
// this key must never reach the frontend.
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

module.exports = { supabasePublic, supabaseAdmin };
