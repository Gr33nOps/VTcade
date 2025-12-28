const mongoose = require("mongoose");

const SystemSettingsSchema = new mongoose.Schema({
    maintenanceMode: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model("SystemSettings", SystemSettingsSchema);