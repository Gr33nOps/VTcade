const SystemSettings = require("../models/SystemSetting");

async function checkMaintenance(req, res, next) {
    try {
        let settings = await SystemSettings.findOne();
        
        if (!settings) {
            settings = await SystemSettings.create({ maintenanceMode: false });
        }
        
        if (settings.maintenanceMode) {
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