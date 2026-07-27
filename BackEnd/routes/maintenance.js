const { supabaseAdmin } = require("../config/supabase");

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
        console.error("Maintenance check error:", err);
        next();
    }
}

module.exports = checkMaintenance;
