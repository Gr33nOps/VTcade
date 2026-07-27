const { supabaseAdmin } = require("../config/supabase");
const { logError } = require("../config/logger");

async function checkMaintenance(req, res, next) {
    try {
        // The system_settings row (id=1) is guaranteed to exist by migration —
        // no more find-or-create race on every request.
        const { data: settings, error } = await supabaseAdmin
            .from("system_settings")
            .select("maintenance_mode")
            .eq("id", 1)
            .single();

        if (error) throw error;

        if (settings.maintenance_mode) {
            return res.status(503).json({
                message: "System is currently under maintenance. Please try again later.",
                maintenanceMode: true
            });
        }

        next();
    } catch (err) {
        // Deliberate fail-CLOSED. The previous version called next() here, so a
        // database problem silently served traffic as though maintenance were
        // off. Since every downstream route needs the same database anyway,
        // letting requests through only converts one clear 503 into a pile of
        // confusing 500s. The settings row is guaranteed by migration, so
        // reaching this branch means the database is genuinely unreachable.
        logError("checkMaintenance", err, { path: req.originalUrl });
        return res.status(503).json({
            message: "Service temporarily unavailable. Please try again later.",
            maintenanceMode: true
        });
    }
}

module.exports = checkMaintenance;
