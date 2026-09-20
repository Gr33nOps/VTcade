const { supabaseAdmin } = require("../config/supabase");
const { logError } = require("../config/logger");

// Maintenance is a coarse operational switch, not per-request data. Reading it
// for every API call added a network round trip to every login, score and menu
// load, and made a missing settings table capable of taking the entire API
// offline before the real route had a chance to run.
const CACHE_MS = 5000;
const ERROR_CACHE_MS = 1000;
let cachedMode = false;
let cacheUntil = 0;
let refreshInFlight = null;

async function maintenanceMode() {
    const now = Date.now();
    if (now < cacheUntil) return cachedMode;

    // A burst after the cache expires shares one Supabase request instead of
    // producing one identical query per incoming request.
    if (!refreshInFlight) {
        refreshInFlight = (async () => {
            const { data: settings, error } = await supabaseAdmin
                .from("system_settings")
                .select("maintenance_mode")
                .eq("id", 1)
                .single();

            if (error) throw error;
            if (typeof settings?.maintenance_mode !== "boolean") {
                throw new Error("system_settings row is missing maintenance_mode");
            }

            cachedMode = settings.maintenance_mode;
            cacheUntil = Date.now() + CACHE_MS;
            return cachedMode;
        })().finally(() => {
            refreshInFlight = null;
        });
    }

    return refreshInFlight;
}

async function checkMaintenance(req, res, next) {
    try {
        if (await maintenanceMode()) {
            return res.status(503).json({
                message: "System is currently under maintenance. Please try again later.",
                maintenanceMode: true
            });
        }

        next();
    } catch (err) {
        // Fail open for the switch itself. The destination route will still
        // report its own database failure if Supabase is actually unavailable,
        // while routes that need no database (notably the Google OAuth kickoff)
        // continue to work. Briefly cache the fallback to avoid hammering a
        // dependency that is already failing.
        logError("checkMaintenance", err, { path: req.originalUrl });
        cachedMode = false;
        cacheUntil = Date.now() + ERROR_CACHE_MS;
        next();
    }
}

module.exports = checkMaintenance;
module.exports._resetCache = () => {
    cachedMode = false;
    cacheUntil = 0;
    refreshInFlight = null;
};
